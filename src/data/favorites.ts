/**
 * Per-source favorites storage. Encapsulates the in-memory `Set<string>`,
 * the localStorage I/O, and the config-derived storage key so the card
 * doesn't have to touch any of it directly.
 *
 * The storage key is derived from the configured `entities` and
 * `media_sources` — changing those swaps to a different key, which means
 * favorites are scoped to a configuration, not global. Existing user data
 * lives under `cgc_favs_<fnv1a-of-sorted-config-id>` (legacy `cgc_p_*`
 * prefix preserved).
 */

import { fnv1aHash } from "../util/hash";

const FAVORITES_KEY_PREFIX = "cgc_favs_";

/** Subset of the card config that affects the favorites storage key. */
export interface FavoritesKeyConfig {
  entities?: readonly string[] | null;
  media_sources?: readonly string[] | null;
}

/**
 * Compute the storage key for a given config slice. Sorted + joined so two
 * configs with the same entities/sources in different YAML orders share
 * the same favorites.
 */
export function favoritesKey(config: FavoritesKeyConfig): string {
  const entities = config.entities ?? [];
  const mediaSources = config.media_sources ?? [];
  const id = [...entities, ...mediaSources].sort().join("|");
  // The legacy `_thumbHash` returned `"cgc_p_" + fnv1aHash(input)`, and the
  // legacy `_favKey` then prefixed `"cgc_favs_"` on top — so the final key
  // shape on disk is `cgc_favs_cgc_p_<hash>`. Preserve that exactly so
  // existing users' favorites continue to resolve.
  return `${FAVORITES_KEY_PREFIX}cgc_p_${fnv1aHash(id)}`;
}

/** Read-only minimal contract for the storage backend. */
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Some sandboxed contexts throw on the global `localStorage` access
    // itself (Safari Private mode prior to 14, certain webview locks).
    return null;
  }
}

export interface FavoritesStoreOptions {
  /** Fired after every successful mutation. The card wires this to `requestUpdate()`. */
  onChange?: () => void;
  /** Storage backend; injectable for tests. Defaults to `globalThis.localStorage`. */
  storage?: StorageLike | null;
}

/**
 * Stateful wrapper around the favorites Set + storage. The card owns one
 * instance and treats it as a `Set`-like read surface (`has`, `size`,
 * `values`); mutations go through `toggle()`, persistence through
 * `load()` (called from `setConfig` after each normalize pass).
 */
export class FavoritesStore {
  private _set: Set<string> = new Set();
  private _key: string | null = null;
  private readonly _onChange?: (() => void) | undefined;
  private readonly _storage: StorageLike | null;
  private _quotaWarned = false;

  constructor(opts: FavoritesStoreOptions = {}) {
    this._onChange = opts.onChange;
    this._storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  }

  /**
   * Recompute the storage key from `config` and reload the in-memory Set
   * from storage. Idempotent — safe to call after every `setConfig`.
   */
  load(config: FavoritesKeyConfig): void {
    this._key = favoritesKey(config);
    this._set = this._read(this._key);
  }

  has(src: string): boolean {
    return this._set.has(src);
  }

  get size(): number {
    return this._set.size;
  }

  values(): IterableIterator<string> {
    return this._set.values();
  }

  /**
   * Add or remove `src` from the favorites set, persist the change, and
   * fire `onChange`. No-ops cleanly when storage isn't available.
   */
  toggle(src: string): void {
    if (this._set.has(src)) this._set.delete(src);
    else this._set.add(src);
    this._write();
    this._onChange?.();
  }

  private _read(key: string): Set<string> {
    if (!this._storage) return new Set();
    let raw: string | null;
    try {
      raw = this._storage.getItem(key);
    } catch {
      return new Set();
    }
    if (!raw) return new Set();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Corrupted JSON — fall through to empty set without losing the
      // existing entry on disk. The next successful `toggle()` will
      // overwrite the bad value.
      console.warn("[camera-gallery-card] favorites: ignoring corrupt JSON in localStorage");
      return new Set();
    }
    if (!Array.isArray(parsed)) {
      // Wrong shape (e.g. a hand-edited object). `new Set(iterable)` would
      // happily consume an Object's keys and silently change the user's
      // data — refuse instead.
      console.warn("[camera-gallery-card] favorites: ignoring non-array JSON in localStorage");
      return new Set();
    }
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  }

  private _write(): void {
    if (!this._storage || !this._key) return;
    let payload: string;
    try {
      payload = JSON.stringify([...this._set]);
    } catch {
      // JSON.stringify on Set spread can only fail on circular refs,
      // which `string` values can't produce — so this is unreachable in
      // practice. Defensive bail-out.
      return;
    }
    try {
      this._storage.setItem(this._key, payload);
    } catch (e) {
      if (isQuotaExceeded(e)) {
        if (!this._quotaWarned) {
          this._quotaWarned = true;
          console.warn("[camera-gallery-card] favorites: localStorage quota exceeded");
        }
        return;
      }
      // Anything else (e.g. SecurityError when storage is disabled) —
      // swallow but log; a hard throw here would tear down the click
      // handler that called `toggle()`.
      console.warn("[camera-gallery-card] favorites: localStorage write failed", e);
    }
  }
}

function isQuotaExceeded(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  // Browsers spell this differently: Chrome / Firefox use
  // "QuotaExceededError"; legacy WebKit returns
  // "NS_ERROR_DOM_QUOTA_REACHED" (Firefox legacy) or code 22 / 1014.
  if (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return true;
  }
  const code = (e as unknown as { code?: unknown }).code;
  return code === 22 || code === 1014;
}
