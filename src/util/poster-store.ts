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
    req.onblocked = (): void => reject(new Error("IDB open blocked"));
  });
}

export class PosterStore {
  private _db: IDBDatabase | null = null;
  private _initPromise: Promise<void> | null = null;
  private _available = true;

  /** Open the DB (idempotent). Always resolves; if IDB is unavailable
   * `_available` flips to false and every subsequent call is a no-op. */
  init(): Promise<void> {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async (): Promise<void> => {
      if (!IDB) {
        this._available = false;
        return;
      }
      try {
        this._db = await openDb();
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
      return [];
    }
  }

  /** Write a single record. Fire-and-forget; errors swallowed so the
   * caller's render path never blocks on IDB. */
  async set(key: string, blob: Blob): Promise<void> {
    await this.init();
    if (!this.isAvailable() || !this._db) return;
    try {
      const tx = this._db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      await awaitRequest(store.put({ key, blob, ts: Date.now() }));
    } catch {
      /* silent */
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
      /* silent */
    }
  }

  async delete(key: string): Promise<void> {
    await this.init();
    if (!this.isAvailable() || !this._db) return;
    try {
      const tx = this._db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      await awaitRequest(store.delete(key));
    } catch {
      /* silent */
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
      /* silent */
    }
  }
}

/** Module-level singleton. The card grabs this once and reuses it. */
export const posterStore = new PosterStore();
