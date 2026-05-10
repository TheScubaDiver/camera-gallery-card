/**
 * IndexedDB-backed poster blob cache.
 *
 * Stores captured poster frames as `Blob` (binary) rather than base64
 * data URLs. Two wins versus the previous string-shaped storage:
 *
 *   - ~33% smaller on disk (binary vs base64)
 *   - render path uses `URL.createObjectURL` directly — no encode/decode
 *     round trip
 *
 * IDB also gets us a per-origin quota in the GB range vs. localStorage's
 * 5-10 MB shared quota, so we can hold several hundred posters without
 * fighting the rest of the page for storage.
 *
 * The card consumes this through an in-memory mirror map; this module's
 * job is just to persist mutations off the main thread and rehydrate the
 * mirror at startup. If IDB is unavailable (private-browsing modes,
 * exotic frame contexts) every method silently no-ops — the in-memory
 * cache still works for the lifetime of the page, just not across
 * reloads. That's an acceptable degradation for a thumbnail cache.
 *
 * Resilience:
 *   - `onblocked` (another tab holding an older DB version open) is no
 *     longer fatal. We log and let IDB keep trying — the open will
 *     succeed once the blocking tab closes. The in-memory mirror keeps
 *     working in the meantime.
 *   - Failed `set/touch/delete` reset `_initPromise` so the next call
 *     re-attempts the open. Covers connections that close mid-session
 *     (bfcache restore, version-change abort).
 *
 * Write coalescing: bursts of poster captures are batched into a single
 * `readwrite` transaction (`set()` queues the record and triggers a
 * microtask flush). Versus one transaction per `set`, this halves the
 * IDB transaction overhead during cold-load fan-out.
 */

const DB_NAME = "cgc-cache";
const DB_VERSION = 2;
const STORE_NAME = "posters";
const TS_INDEX = "ts";
const DEFAULT_MAX_ENTRIES = 500;

export interface PosterRecord {
  key: string;
  blob: Blob;
  ts: number;
}

const IDB: IDBFactory | undefined =
  typeof globalThis !== "undefined"
    ? (globalThis as { indexedDB?: IDBFactory }).indexedDB
    : undefined;

/** Promise wrapper around an IDBRequest. */
function awaitRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error ?? new Error("IDB request failed"));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!IDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = IDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (): void => {
      const db = req.result;
      // Drop any v1 store from the dataUrl-shaped schema — caller
      // accepted "rebuild from scratch" semantics on the schema bump.
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
      store.createIndex(TS_INDEX, "ts", { unique: false });
    };
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error ?? new Error("IDB open failed"));
    // Don't reject on `blocked` — another tab holds an older version
    // open. Once it closes, IDB fires `onsuccess`. Logging keeps the
    // case visible without disabling the store.
    req.onblocked = (): void => {
      try {
        console.info("posterStore: IDB upgrade blocked by another tab; will retry once it closes.");
      } catch {
        /* noop */
      }
    };
  });
}

interface PendingWrite {
  key: string;
  blob: Blob;
  ts: number;
}

export class PosterStore {
  private _db: IDBDatabase | null = null;
  private _initPromise: Promise<void> | null = null;
  private _available = true;
  /** Pending `set` records, flushed in one transaction on the next
   * microtask. Keyed by `key` so duplicate sets within a tick collapse
   * into one write (last-wins). */
  private _writeQueue: Map<string, PendingWrite> = new Map();
  private _writeFlushScheduled = false;

  /** Open the DB (idempotent). Always resolves; if IDB is unavailable
   * `_available` flips to false. Connections that close mid-session
   * cause subsequent calls to clear `_initPromise` and retry. */
  init(): Promise<void> {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async (): Promise<void> => {
      if (!IDB) {
        this._available = false;
        return;
      }
      try {
        const db = await openDb();
        // If the version changes from another tab, our connection is
        // about to close — drop the cached promise so the next call
        // re-opens cleanly.
        db.onversionchange = (): void => {
          try {
            db.close();
          } catch {
            /* noop */
          }
          this._db = null;
          this._initPromise = null;
        };
        db.onclose = (): void => {
          this._db = null;
          this._initPromise = null;
        };
        this._db = db;
      } catch {
        this._available = false;
        this._db = null;
      }
    })();
    return this._initPromise;
  }

  /** True when the store is backed by IndexedDB. False after a failed
   * `init()` — every other method becomes a no-op so callers don't need
   * to gate them. */
  isAvailable(): boolean {
    return this._available && this._db !== null;
  }

  /** Reset the init state so the next op tries to re-open. Used by the
   * recovery path after a transaction throws `InvalidStateError` (the
   * connection went stale, e.g. after a bfcache restore). */
  private _resetInit(): void {
    this._db = null;
    this._initPromise = null;
    this._available = true; // give it another chance
  }

  /** Read every record. Used to prewarm the in-memory mirror at startup. */
  async readAll(): Promise<PosterRecord[]> {
    await this.init();
    if (!this.isAvailable() || !this._db) return [];
    try {
      const tx = this._db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const all = await awaitRequest(store.getAll() as IDBRequest<PosterRecord[]>);
      return Array.isArray(all) ? all : [];
    } catch {
      this._resetInit();
      return [];
    }
  }

  /** Write a single record. Coalesces with concurrent `set` calls on
   * the next microtask into one `readwrite` transaction. Fire-and-forget
   * — the returned promise resolves once the batched flush completes
   * (or fails silently). */
  async set(key: string, blob: Blob): Promise<void> {
    await this.init();
    if (!this.isAvailable() || !this._db) return;
    this._writeQueue.set(key, { key, blob, ts: Date.now() });
    this._scheduleFlush();
  }

  private _scheduleFlush(): void {
    if (this._writeFlushScheduled) return;
    this._writeFlushScheduled = true;
    queueMicrotask(() => {
      this._writeFlushScheduled = false;
      void this._flushWrites();
    });
  }

  private async _flushWrites(): Promise<void> {
    if (this._writeQueue.size === 0) return;
    if (!this.isAvailable() || !this._db) {
      this._writeQueue.clear();
      return;
    }
    const pending = Array.from(this._writeQueue.values());
    this._writeQueue.clear();
    try {
      const tx = this._db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const rec of pending) {
        store.put(rec);
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = (): void => resolve();
        tx.onerror = (): void => reject(tx.error ?? new Error("tx failed"));
        tx.onabort = (): void => reject(tx.error ?? new Error("tx aborted"));
      });
    } catch {
      this._resetInit();
    }
  }

  /** Bump the `ts` of an existing record so it's treated as recently
   * accessed. Combined with `evictExcess` walking the index ascending
   * this gives an effective LRU. */
  async touch(key: string): Promise<void> {
    await this.init();
    if (!this.isAvailable() || !this._db) return;
    try {
      const tx = this._db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const existing = (await awaitRequest(
        store.get(key) as IDBRequest<PosterRecord | undefined>
      )) as PosterRecord | undefined;
      if (!existing) return;
      existing.ts = Date.now();
      await awaitRequest(store.put(existing));
    } catch {
      this._resetInit();
    }
  }

  async delete(key: string): Promise<void> {
    await this.init();
    if (!this.isAvailable() || !this._db) return;
    // If a flush is in flight or pending for this key, drop it first
    // so we don't write-then-delete racily.
    this._writeQueue.delete(key);
    try {
      const tx = this._db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      await awaitRequest(store.delete(key));
    } catch {
      this._resetInit();
    }
  }

  /** Drop oldest entries when the count exceeds `max`. Walks the `ts`
   * index ascending and deletes until the size is back within budget. */
  async evictExcess(max: number = DEFAULT_MAX_ENTRIES): Promise<void> {
    await this.init();
    if (!this.isAvailable() || !this._db) return;
    try {
      const tx = this._db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const count = await awaitRequest(store.count() as IDBRequest<number>);
      if (count <= max) return;
      const toDelete = count - max;
      let deleted = 0;
      const cursorReq = store.index(TS_INDEX).openCursor();
      await new Promise<void>((resolve, reject) => {
        cursorReq.onsuccess = (): void => {
          const cursor = cursorReq.result;
          if (!cursor || deleted >= toDelete) {
            resolve();
            return;
          }
          cursor.delete();
          deleted += 1;
          cursor.continue();
        };
        cursorReq.onerror = (): void => reject(cursorReq.error ?? new Error("cursor failed"));
      });
    } catch {
      this._resetInit();
    }
  }
}

/** Module-level singleton. The card grabs this once and reuses it. */
export const posterStore = new PosterStore();
