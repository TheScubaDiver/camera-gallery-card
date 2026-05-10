/**
 * Media-source data path. Owns the recursive `media_source/browse_media`
 * walk, the per-root browse TTL cache, the resolve queue, the persistent
 * walk cache (localStorage), the Frigate REST direct path, and Frigate
 * snapshot pairing.
 *
 * Lifecycle parallel to {@link SensorSourceClient}:
 *   - constructor — wire the `onChange` callback the card uses for
 *     `requestUpdate()`, plus optional `getDtOpts` / `resolveItemMs`
 *     callbacks the snapshot-pair logic needs.
 *   - `setHass(hass)` — called from every hass setter.
 *   - `load(config)` — called from setConfig; preserves the legacy reset
 *     semantics (the actual cache-invalidation-on-roots-change fix lands
 *     in the next commit).
 *   - `ensureLoaded()` — public orchestrator; runs Frigate REST or
 *     recursive walk depending on config.
 *
 * The `state` field is the same shape as the legacy `_ms` object on the
 * card so call sites that read `this._ms.urlCache.get(id)`, `.list`,
 * `.pairedThumbs`, etc. keep working through a thin getter proxy on the
 * card. That's a transitional shape — once the card stops poking `_ms`
 * directly (final cleanup commit), the field becomes private.
 */

import {
  DEFAULT_BROWSE_TIMEOUT_MS,
  DEFAULT_FRIGATE_API_LIMIT,
  DEFAULT_MAX_MEDIA,
  DEFAULT_PER_ROOT_MIN_LIMIT,
  DEFAULT_RESOLVE_BATCH,
  DEFAULT_WALK_DEPTH,
  FRIGATE_API_RETRY_AFTER_MS,
  FRIGATE_SNAPSHOT_MATCH_WINDOW_MS,
  MS_RESOLVE_FAILURE_TTL_MS,
} from "../const";
import type { CameraGalleryCardConfig } from "../config/normalize";
import type { CardItem } from "../types/media-item";
import type { HomeAssistant } from "../types/hass";
import type { MediaSourceItem } from "../types/media-source";
import { fnv1aHash } from "../util/hash";
import {
  FRIGATE_SNAPSHOTS_ROOT,
  fetchFrigateEvents,
  frigateEventIdMs,
  isFrigateRoot,
  mapFrigateEventToItem,
} from "../util/frigate";
import { dayKeyFromMs, type DatetimeOptions, dtMsFromSrc, extractDayKey } from "./datetime-parsing";
import { dedupeByRelPath, pairMediaSourceThumbnails } from "./pairing";

export type Enrich = (src: string) => CardItem;
const DEFAULT_ENRICH: Enrich = (src) => ({ src });

/** A normalized media-source item — the shape stored in `state.list`. */
export interface MsItem {
  id: string;
  title: string;
  cls: string;
  mime: string;
  thumb: string;
  dtMs?: number;
}

/** A Frigate snapshot — same shape as MsItem plus a precomputed dayKey. */
export interface FrigateSnapshot extends MsItem {
  dayKey?: string | null;
}

/** Internal `_ms` shape — kept compatible with the legacy field for now. */
export interface MediaSourceState {
  key: string;
  list: MsItem[];
  listIndex: Map<string, MsItem>;
  pairedThumbs: Map<string, string>;
  loadedAt: number;
  loading: boolean;
  roots: string[];
  urlCache: Map<string, string>;
  frigateApiFailed?: boolean;
  frigateApiFailedAt?: number;
}

export interface MediaSourceClientOptions {
  /** Fired after a load that mutates `list` or `urlCache` so the card can `requestUpdate()`. */
  onChange?: (() => void) | undefined;
  /** Provider for the parser options the snapshot-pair sort needs. Read each access. */
  getDtOpts?: (() => DatetimeOptions) | undefined;
  /** Resolve a video's authoritative ms (sensor/Frigate event-id). Only used by snapshot pairing. */
  resolveItemMs?: ((src: string) => number | null) | undefined;
}

const DEFAULT_GET_DT_OPTS = (): DatetimeOptions => ({ resolveName: (s) => s });

/** Convert raw `media_source/browse_media` child to the card's `MsItem`. */
function toMsItem(x: MediaSourceItem | undefined): MsItem | null {
  if (!x?.media_content_id) return null;
  const id = String(x.media_content_id);
  if (!id) return null;
  const item: MsItem = {
    id,
    title: String(x.title ?? ""),
    cls: String(x.media_class ?? ""),
    mime: String(x.media_content_type ?? ""),
    thumb: String(x.thumbnail ?? ""),
  };
  const ms = isFrigateRoot(id) ? frigateEventIdMs(id) : null;
  if (ms !== null) item.dtMs = ms;
  return item;
}

/** Match the legacy `_msIsRenderable` — a video/image-shaped child that
 * the gallery should display, even when `can_play` is false (some sources
 * lie about playability). */
export function isRenderable(mime: unknown, mediaClass: unknown, title: unknown): boolean {
  const t = String(title ?? "").toLowerCase();
  const m = String(mime ?? "").toLowerCase();
  const c = String(mediaClass ?? "").toLowerCase();
  if (m.startsWith("image/")) return true;
  if (m.startsWith("video/")) return true;
  if (/\.(jpg|jpeg|png|webp|gif)$/i.test(t)) return true;
  if (/\.(mp4|webm|mov|m4v)$/i.test(t)) return true;
  if (c === "image" || c === "video") return true;
  return false;
}

/** `true` for any media-source URI (`media-source://…`). */
export function isMediaSourceId(v: unknown): boolean {
  return String(v ?? "").startsWith("media-source://");
}

/** Canonical key for a multi-root config. Order-independent (sorted) so the
 * walk-cache key stays stable when the user re-orders YAML. */
export function keyFromRoots(rootsArr: readonly string[] | null | undefined): string {
  const roots = Array.isArray(rootsArr) ? rootsArr : [];
  if (!roots.length) return "";
  return roots
    .slice()
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join(" | ");
}

/** Persistent localStorage key for a walk cache entry. Versioned (`mswalk3`)
 * — bump when the on-disk shape changes. FNV1a keeps it short. */
export function walkCacheKey(key: string): string {
  return "cgc_mswalk3_" + fnv1aHash(key);
}

const WALK_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
const WALK_CACHE_REFRESH_AFTER_MS = 5 * 60 * 1000;
const ENSURE_LOADED_FRESHNESS_MS = 30_000;
const BROWSE_CACHE_TTL_MS = 60 * 60 * 1000;
const WALK_BATCH = 20;
const RESOLVE_TIMEOUT_MS = 12_000;

/**
 * Stateful media-source client. See module docstring.
 */
export class MediaSourceClient {
  /** Same shape as the legacy `_ms` field. Public for transitional reads
   * from the card; will become private after the final cleanup commit. */
  readonly state: MediaSourceState = makeEmptyState();
  resolveInFlight = false;
  readonly resolveQueued: Set<string> = new Set();
  /**
   * IDs that returned no URL or timed out, with the timestamp of the
   * failure. Entries older than `MS_RESOLVE_FAILURE_TTL_MS` are pruned
   * lazily when checked or queued — so transient outages recover within
   * a session. Use `isResolveFailed(id)` for the TTL-aware read.
   */
  resolveFailed: Map<string, number> = new Map();
  readonly browseTtlCache: Map<string, { ts: number; data: MediaSourceItem }> = new Map();
  /** Frigate snapshot index, populated alongside the walk when a Frigate root is configured. */
  frigateSnapshots: FrigateSnapshot[] = [];
  /** `videoSrc → snapshotId` cache for the pairing fuzzy-match. */
  readonly snapshotCache: Map<string, string> = new Map();

  private _hass: HomeAssistant | null = null;
  private _config: CameraGalleryCardConfig | null = null;
  private readonly _onChange?: (() => void) | undefined;
  private readonly _getDtOpts: () => DatetimeOptions;
  private readonly _resolveItemMs: ((src: string) => number | null) | undefined;
  /**
   * Monotonically increasing generation counter. Incremented on
   * {@link clearForNewRoots} so an in-flight `ensureLoaded` from a prior
   * generation drops its results instead of overwriting fresh state. See
   * `_loadGenSnapshot` / `_isStale` below.
   */
  private _loadGeneration = 0;
  /** Previous `media_sources` snapshot used by `load()` to detect changes. */
  private _prevRootsKey = "";
  /** Previous `frigate_url` snapshot used by `load()` to detect changes. */
  private _prevFrigateUrl = "";

  constructor(opts: MediaSourceClientOptions = {}) {
    this._onChange = opts.onChange;
    this._getDtOpts = opts.getDtOpts ?? DEFAULT_GET_DT_OPTS;
    this._resolveItemMs = opts.resolveItemMs;
  }

  setHass(hass: HomeAssistant | null): void {
    this._hass = hass;
  }

  /**
   * Update the cached config. If the configured roots or Frigate REST URL
   * change, every cache slot the new roots could touch is invalidated and
   * the load generation is bumped so any in-flight `ensureLoaded` from
   * the prior config drops its results instead of overwriting fresh
   * state. Audit ID: B10.
   */
  load(config: CameraGalleryCardConfig | null): void {
    this._config = config;
    const nextRootsKey = keyFromRoots(config?.media_sources ?? []);
    const nextFrigateUrl = String(config?.frigate_url ?? "");
    if (nextRootsKey !== this._prevRootsKey || nextFrigateUrl !== this._prevFrigateUrl) {
      this.clearForNewRoots();
      this._prevRootsKey = nextRootsKey;
      this._prevFrigateUrl = nextFrigateUrl;
    }
  }

  /** Reset every cache slot on a roots change. Bumps the load generation
   * so an in-flight `ensureLoaded` from a prior generation drops results. */
  clearForNewRoots(): void {
    this._loadGeneration++;
    this.state.key = "";
    this.setList([]);
    this.state.loadedAt = 0;
    this.state.loading = false;
    this.state.roots = [];
    this.state.urlCache = new Map();
    this.resolveFailed = new Map();
    this.frigateSnapshots = [];
    this.snapshotCache.clear();
    this.browseTtlCache.clear();
  }

  /** Drop the resolve-failed latch (e.g. on a new tile-reveal pass — gives
   * IDs that 404'd a chance again when the user scrolls back). */
  clearResolveFailed(): void {
    this.resolveFailed = new Map();
  }

  /**
   * `true` iff `id` is currently latched as failed. Side effect: prunes
   * an expired entry on read so the next `queueResolve` re-attempts it.
   * Audit ID: B4.
   */
  isResolveFailed(id: string): boolean {
    const ts = this.resolveFailed.get(id);
    if (ts === undefined) return false;
    if (Date.now() - ts > MS_RESOLVE_FAILURE_TTL_MS) {
      this.resolveFailed.delete(id);
      return false;
    }
    return true;
  }

  /** Mark the cache as stale so the next `ensureLoaded` does a fresh load. */
  invalidate(): void {
    this.state.loadedAt = 0;
  }

  /**
   * Build a new list from raw walk results — pairs same-stem video/jpg
   * siblings and rebuilds the by-id index. Never replaces the array
   * reference for `list` so a snapshot taken from `state` stays in sync
   * with `state.list` after pairing.
   */
  setList(items: readonly MsItem[]): void {
    const { items: paired, pairedThumbs } = pairMediaSourceThumbnails(
      Array.isArray(items) ? [...items] : []
    );
    this.state.list = paired as MsItem[];
    this.state.listIndex = new Map(paired.map((x) => [x.id, x] as const));
    this.state.pairedThumbs = pairedThumbs;
  }

  /** All ids in current `list`. */
  getIds(): string[] {
    return Array.isArray(this.state.list) ? this.state.list.map((x) => x.id) : [];
  }

  /** `CardItem[]` for use in the gallery render. */
  getItems(enrich: Enrich = DEFAULT_ENRICH): CardItem[] {
    return dedupeByRelPath(this.getIds()).map((id) => enrich(String(id)));
  }

  getMetaById(id: string): { cls: string; mime: string; title: string; thumb: string } {
    const it = this.state.listIndex.get(id);
    if (!it) return { cls: "", mime: "", title: "", thumb: "" };
    return {
      cls: it.cls || "",
      mime: it.mime || "",
      title: it.title || "",
      thumb: it.thumb || "",
    };
  }

  /** Authoritative dtMs for an `id`, if the source attached one (Frigate
   * REST event-id, Frigate URI parse). Returns `null` when absent — the
   * caller falls back to filename parsing. */
  getDtMsForId(id: string): number | null {
    const dt = this.state.listIndex.get(id)?.dtMs;
    return typeof dt === "number" && Number.isFinite(dt) ? dt : null;
  }

  getTitleById(id: string): string {
    return this.state.listIndex.get(id)?.title ?? "";
  }

  /** Read-only slice of the URL cache for render-side reads. */
  getUrlCache(): ReadonlyMap<string, string> {
    return this.state.urlCache;
  }

  /** Read-only slice of the paired thumbnails map. */
  getPairedThumbs(): ReadonlyMap<string, string> {
    return this.state.pairedThumbs;
  }

  isLoading(): boolean {
    return this.state.loading;
  }

  /**
   * Single media-id resolve. Returns `""` on failure (latched with the
   * current timestamp in `resolveFailed`; entries expire after
   * `MS_RESOLVE_FAILURE_TTL_MS`). Cached on success.
   */
  async resolve(mediaId: string): Promise<string> {
    const cached = this.state.urlCache.get(mediaId);
    if (cached) return cached;

    if (!this._hass) {
      this.resolveFailed.set(mediaId, Date.now());
      return "";
    }

    let r: { url?: string } | undefined;
    try {
      r = (await this._wsWithTimeout(
        {
          type: "media_source/resolve_media",
          media_content_id: mediaId,
          expires: 60 * 60,
        },
        RESOLVE_TIMEOUT_MS
      )) as { url?: string } | undefined;
    } catch {
      this.resolveFailed.set(mediaId, Date.now());
      return "";
    }

    const url = r?.url ? String(r.url) : "";
    if (url) {
      this.state.urlCache.set(mediaId, url);
      this._fireChange();
    } else {
      this.resolveFailed.set(mediaId, Date.now());
    }
    return url;
  }

  /**
   * Batch enqueue. The drain loop reads `resolveQueued` live so concurrent
   * `queueResolve` calls merge naturally into the running drain.
   */
  queueResolve(ids: readonly string[] | null | undefined): void {
    for (const id of ids ?? []) {
      if (!id) continue;
      if (this.state.urlCache.has(id)) continue;
      if (this.isResolveFailed(id)) continue;
      this.resolveQueued.add(id);
    }
    if (this.resolveInFlight) return;

    this.resolveInFlight = true;
    void (async () => {
      try {
        while (this.resolveQueued.size) {
          const chunk = Array.from(this.resolveQueued).slice(0, DEFAULT_RESOLVE_BATCH);
          chunk.forEach((x) => this.resolveQueued.delete(x));
          await Promise.allSettled(chunk.map((id) => this.resolve(id)));
          this._fireChange();
        }
      } finally {
        this.resolveInFlight = false;
      }
    })().catch(() => {
      this.resolveInFlight = false;
    });
  }

  /**
   * Pair a video media-source URI with its sibling Frigate snapshot.
   * Order:
   *   1. exact stem match
   *   2. substring match
   *   3. fuzzy ±15s match against the video's resolved ms
   * Returns `""` and caches when nothing matches.
   */
  findMatchingSnapshotMediaId(videoId: string): string {
    const src = String(videoId ?? "").trim();
    if (!src) return "";

    if (this.snapshotCache.has(src)) {
      return this.snapshotCache.get(src) ?? "";
    }

    const videoName = (src.split("/").pop() ?? "").toLowerCase();
    const videoStem = videoName.replace(/\.(mp4|webm|mov|m4v)$/i, "");

    if (!videoStem) {
      this.snapshotCache.set(src, "");
      return "";
    }

    const snapshots = this.frigateSnapshots;
    if (!snapshots.length) {
      this.snapshotCache.set(src, "");
      return "";
    }

    let match = snapshots.find((snap) => {
      const snapName =
        String(snap?.id ?? "")
          .split("/")
          .pop()
          ?.toLowerCase() ?? "";
      const snapStem = snapName.replace(/\.(jpg|jpeg|png|webp)$/i, "");
      return snapStem === videoStem;
    });

    if (!match) {
      match = snapshots.find((snap) =>
        String(snap?.id ?? "")
          .toLowerCase()
          .includes(videoStem)
      );
    }

    if (!match && this._resolveItemMs) {
      const videoMs = this._resolveItemMs(src);
      if (Number.isFinite(videoMs)) {
        let best: FrigateSnapshot | null = null;
        let bestDiff = Infinity;
        for (const snap of snapshots) {
          const snapMs = Number(snap?.dtMs);
          if (!Number.isFinite(snapMs)) continue;
          const diff = Math.abs(snapMs - (videoMs as number));
          if (diff < bestDiff) {
            best = snap;
            bestDiff = diff;
          }
        }
        if (best && bestDiff <= FRIGATE_SNAPSHOT_MATCH_WINDOW_MS) {
          match = best;
        }
      }
    }

    const result = match?.id ?? "";
    this.snapshotCache.set(src, result);
    return result;
  }

  // ─── Orchestrator + helpers ──────────────────────────────────────

  /**
   * Public orchestrator. Decides between Frigate REST direct path and the
   * recursive `media_source/browse_media` walk. Called from poll + Frigate
   * event push + after setConfig.
   */
  async ensureLoaded(): Promise<void> {
    const config = this._config;
    const hass = this._hass;
    if (!hass || !config) return;

    const roots = Array.isArray(config.media_sources) ? config.media_sources : [];
    if (!roots.length) return;

    const frigateUrl = config.frigate_url;
    const failedRecently =
      !!this.state.frigateApiFailed &&
      Date.now() - (this.state.frigateApiFailedAt ?? 0) < FRIGATE_API_RETRY_AFTER_MS;

    if (frigateUrl && roots.some(isFrigateRoot) && !failedRecently) {
      await this._loadFrigateApiPath(frigateUrl, config);
      return;
    }

    await this._loadWalkPath(roots, config);
  }

  private async _loadFrigateApiPath(
    frigateUrl: string,
    config: CameraGalleryCardConfig
  ): Promise<void> {
    const cap = config.max_media ?? DEFAULT_MAX_MEDIA;
    const key = `frigate_api:${frigateUrl}:${cap}`;
    const sameKey = this.state.key === key;
    const fresh = sameKey && Date.now() - (this.state.loadedAt ?? 0) < ENSURE_LOADED_FRESHNESS_MS;
    if (this.state.loading || fresh) return;

    if (!sameKey) {
      this.state.key = key;
      this.setList([]);
      this.state.urlCache = new Map();
      this.resolveFailed = new Map();
      this.state.frigateApiFailed = false;
      this.state.frigateApiFailedAt = 0;
    }

    // Synchronous before any await — ensures the de-dup flag is set
    // before a concurrent caller observes it (audit B1 / R5).
    this.state.loading = true;
    const gen = this._loadGeneration;
    try {
      const items = await this._loadFrigateApi(frigateUrl, config);
      // Audit B1: drop results from a stale generation. If `clearForNewRoots`
      // ran between the await and now, our items belong to the old config.
      if (this._isStale(gen)) return;
      if (items === null) {
        this.state.frigateApiFailed = true;
        this.state.frigateApiFailedAt = Date.now();
        this.state.loading = false;
        // Fall through to walk path on next tick — same UX as the legacy code.
        setTimeout(() => void this.ensureLoaded(), 0);
        return;
      }
      this.setList(items.slice(0, cap));
      this.state.loadedAt = Date.now();
    } catch (e) {
      if (this._isStale(gen)) return;
      console.warn("CGC Frigate API load failed:", e);
      this.state.frigateApiFailed = true;
      this.state.frigateApiFailedAt = Date.now();
      this.setList([]);
    } finally {
      if (!this._isStale(gen)) {
        this.state.loading = false;
        this._fireChange();
      }
    }
  }

  private async _loadFrigateApi(
    frigateUrl: string,
    config: CameraGalleryCardConfig
  ): Promise<MsItem[] | null> {
    let base = String(frigateUrl ?? "")
      .trim()
      .replace(/\/+$/, "");
    if (!base) return null;
    if (!/^https?:\/\//i.test(base)) base = "http://" + base;

    const limit = Math.min(
      DEFAULT_FRIGATE_API_LIMIT,
      Math.max((config.max_media ?? DEFAULT_MAX_MEDIA) * 2, 100)
    );

    const events = await fetchFrigateEvents(base, limit);
    if (!events) return null;

    const items: MsItem[] = [];
    for (const ev of events) {
      const mapped = mapFrigateEventToItem(ev, base);
      if (!mapped) continue;
      this.state.urlCache.set(mapped.item.id, mapped.clipUrl);
      items.push(mapped.item as MsItem);
    }
    return items;
  }

  private async _loadWalkPath(
    roots: readonly string[],
    config: CameraGalleryCardConfig
  ): Promise<void> {
    const now = Date.now();
    const key = keyFromRoots(roots);
    const sameKey = this.state.key === key;
    const fresh = sameKey && now - (this.state.loadedAt ?? 0) < ENSURE_LOADED_FRESHNESS_MS;
    if (this.state.loading || fresh) return;

    if (!sameKey) {
      this.state.key = key;
      this.setList([]);
      this.state.roots = roots.slice();
      this.state.urlCache = new Map();
      this.resolveFailed = new Map();
    }

    // Serve from persistent walk cache instantly, then refresh in background if stale.
    const walkedCache = this._walkCacheLoad(key);
    if (walkedCache && walkedCache.length > 0) {
      this.setList(walkedCache);
      this._fireChange();
      try {
        const raw = localStorage.getItem(walkCacheKey(key));
        const entry = raw ? (JSON.parse(raw) as { ts?: number } | null) : null;
        const cacheTs = entry?.ts ?? 0;
        this.state.loadedAt = cacheTs;
        if (Date.now() - cacheTs > WALK_CACHE_REFRESH_AFTER_MS) {
          setTimeout(() => void this.ensureLoaded(), 0);
        }
      } catch {
        this.state.loadedAt = 0;
        setTimeout(() => void this.ensureLoaded(), 0);
      }
      return;
    }

    // Synchronous before any await — closes the de-dup window (audit B1 / R5).
    this.state.loading = true;
    const gen = this._loadGeneration;

    try {
      const visibleCap = config.max_media ?? DEFAULT_MAX_MEDIA;
      const internalCap = Math.min(2000, Math.max(visibleCap * 4, 400));
      const walkLimitTotal = Math.min(4000, Math.max(internalCap * 2, 800));
      const perRootLimit = Math.max(
        DEFAULT_PER_ROOT_MIN_LIMIT,
        Math.ceil(walkLimitTotal / roots.length)
      );

      const flat: MediaSourceItem[] = [];
      const rootResults = await Promise.all(
        roots.map(async (root): Promise<MediaSourceItem[]> => {
          try {
            const rootStr = String(root);
            const isLocalRoot = rootStr.includes("media_source/local/");
            const depthLimit = isFrigateRoot(rootStr)
              ? 3
              : isLocalRoot
                ? Math.min(6, DEFAULT_WALK_DEPTH)
                : DEFAULT_WALK_DEPTH;

            const onProgress =
              roots.length === 1
                ? (partial: MediaSourceItem[]): void => {
                    if (this._isStale(gen)) return;
                    if (partial.length >= 1) {
                      const items = partial
                        .map((x) => toMsItem(x))
                        .filter((x): x is MsItem => x !== null)
                        .slice(0, internalCap);
                      this.setList(items);
                      this._fireChange();
                    }
                  }
                : null;

            return await this._walkIter(rootStr, perRootLimit, depthLimit, onProgress);
          } catch (e) {
            console.warn("MS root failed:", root, e);
            return [];
          }
        })
      );
      if (this._isStale(gen)) return;
      flat.push(...rootResults.flat());

      if (roots.some(isFrigateRoot)) {
        try {
          const dtOpts = this._getDtOpts();
          const snapshotItems = await this._walkIter(
            FRIGATE_SNAPSHOTS_ROOT,
            Math.min(400, Math.max(visibleCap * 6, 120)),
            3
          );
          this.frigateSnapshots = snapshotItems
            .map((x): FrigateSnapshot | null => {
              if (!x?.media_content_id) return null;
              const id = String(x.media_content_id);
              if (!id) return null;
              const title = String(x.title ?? "");
              const dtMsAttached = frigateEventIdMs(id);
              const dtMs = dtMsAttached !== null ? dtMsAttached : dtMsFromSrc(title || id, dtOpts);
              const dayKey = Number.isFinite(dtMs)
                ? dayKeyFromMs(dtMs as number)
                : extractDayKey(title || id, dtOpts);
              const out: FrigateSnapshot = {
                id,
                title,
                mime: String(x.media_content_type ?? ""),
                cls: String(x.media_class ?? ""),
                thumb: String(x.thumbnail ?? ""),
                ...(dtMs !== null ? { dtMs } : {}),
                dayKey,
              };
              return out;
            })
            .filter((x): x is FrigateSnapshot => x !== null);
        } catch (e) {
          console.warn("Frigate snapshots load failed:", e);
          this.frigateSnapshots = [];
        }
      } else {
        this.frigateSnapshots = [];
      }

      const dtOpts = this._getDtOpts();
      let items = flat.map((x) => toMsItem(x)).filter((x): x is MsItem => x !== null);
      items = dedupeByRelPath(items) as MsItem[];

      items.sort((a, b) => {
        const am = a.dtMs ?? dtMsFromSrc(a.id, dtOpts);
        const bm = b.dtMs ?? dtMsFromSrc(b.id, dtOpts);
        const aOk = Number.isFinite(am);
        const bOk = Number.isFinite(bm);
        if (aOk && bOk && bm !== am) return (bm as number) - (am as number);
        if (aOk && !bOk) return -1;
        if (!aOk && bOk) return 1;
        return a.title < b.title ? 1 : a.title > b.title ? -1 : 0;
      });

      const itemsToSave = items.slice(0, internalCap);
      if (this._isStale(gen)) return;
      this.setList(itemsToSave);
      this.state.loadedAt = Date.now();
      this._walkCacheSave(key, itemsToSave);
    } catch (e) {
      if (this._isStale(gen)) return;
      console.warn("MS ensure load failed:", e);
      console.warn("MS roots used:", roots);
      this.setList([]);
    } finally {
      if (!this._isStale(gen)) {
        this.state.loading = false;
        this._fireChange();
      }
    }
  }

  /** A `gen` snapshot is stale when `clearForNewRoots` has bumped the
   * counter since it was taken. Used at every commit point inside the
   * orchestrator paths to drop results that belong to the old config. */
  private _isStale(gen: number): boolean {
    return gen !== this._loadGeneration;
  }

  private async _browse(rootId: string): Promise<MediaSourceItem | null> {
    const cached = this.browseTtlCache.get(rootId);
    if (cached && Date.now() - cached.ts < BROWSE_CACHE_TTL_MS) return cached.data;
    const data = (await this._wsWithTimeout(
      {
        type: "media_source/browse_media",
        media_content_id: rootId,
      },
      DEFAULT_BROWSE_TIMEOUT_MS
    )) as MediaSourceItem;
    this.browseTtlCache.set(rootId, { ts: Date.now(), data });
    return data;
  }

  /**
   * Recursive walk with depth + per-root limits. LIFO stack so date-named
   * folders like "2026-04-28" get popped newest-first.
   */
  private async _walkIter(
    rootId: string,
    limit: number,
    depthLimit: number,
    onProgress: ((partial: MediaSourceItem[]) => void) | null = null
  ): Promise<MediaSourceItem[]> {
    const out: MediaSourceItem[] = [];
    const stack: { depth: number; id: string }[] = [{ depth: 0, id: rootId }];

    while (stack.length && out.length < limit) {
      const prevCount = out.length;
      const batch: { depth: number; id: string }[] = [];
      while (stack.length && batch.length < WALK_BATCH) {
        const item = stack.pop();
        if (item && item.depth <= depthLimit) batch.push(item);
      }
      if (!batch.length) break;

      const results = await Promise.all(
        batch.map(async ({ depth, id }) => {
          try {
            return { depth, node: await this._browse(id) };
          } catch {
            return { depth, node: null };
          }
        })
      );

      for (const { depth, node } of results) {
        if (!node) continue;
        const children: readonly MediaSourceItem[] = Array.isArray(node.children)
          ? node.children
          : [];

        if (!children.length) {
          if (node.media_content_id) {
            const ok =
              !!node.can_play ||
              isRenderable(node.media_content_type, node.media_class, node.title);
            if (ok && out.length < limit) out.push(node);
          }
          continue;
        }

        const dirsRev: { depth: number; id: string }[] = [];
        for (let i = children.length - 1; i >= 0; i--) {
          if (out.length >= limit) break;
          const ch = children[i];
          const mid = String(ch?.media_content_id ?? "");
          if (!mid) continue;

          const canExpand = !!ch?.can_expand;
          const canPlay = !!ch?.can_play;
          const cls = String(ch?.media_class ?? "").toLowerCase();

          if (canExpand || (!canPlay && cls === "directory")) {
            dirsRev.push({ depth: depth + 1, id: mid });
          } else if (canPlay || isRenderable(ch?.media_content_type, ch?.media_class, ch?.title)) {
            if (ch) out.push(ch);
          }
        }
        // Reverse-push so the alphabetically-LAST directory ends up on top
        // of the LIFO stack and is popped first. Date-named folders thus
        // traverse today before yesterday.
        for (let i = dirsRev.length - 1; i >= 0; i--) {
          const entry = dirsRev[i];
          if (entry) stack.push(entry);
        }
      }

      if (onProgress && out.length > prevCount) onProgress([...out]);
    }

    return out;
  }

  private _walkCacheSave(key: string, list: readonly MsItem[]): void {
    try {
      localStorage.setItem(walkCacheKey(key), JSON.stringify({ ts: Date.now(), list }));
    } catch {
      // Quota or unavailable storage — silent. Card still works without persistent cache.
    }
  }

  private _walkCacheLoad(key: string, maxAgeMs: number = WALK_CACHE_MAX_AGE_MS): MsItem[] | null {
    try {
      const raw = localStorage.getItem(walkCacheKey(key));
      if (!raw) return null;
      const entry = JSON.parse(raw) as { list?: unknown; ts?: number } | null;
      if (!Array.isArray(entry?.list) || Date.now() - (entry?.ts ?? 0) > maxAgeMs) return null;
      return entry.list as MsItem[];
    } catch {
      return null;
    }
  }

  private async _wsWithTimeout(payload: object, timeoutMs: number): Promise<unknown> {
    if (!this._hass) throw new Error("MediaSourceClient: hass not set");
    const p = this._hass.callWS(payload as Parameters<HomeAssistant["callWS"]>[0]);
    const t = new Promise<never>((_, rej) =>
      setTimeout(
        () => rej(new Error(`WS timeout: ${(payload as { type?: string }).type ?? "?"}`)),
        timeoutMs
      )
    );
    return Promise.race([p, t]);
  }

  private _fireChange(): void {
    this._onChange?.();
  }
}

function makeEmptyState(): MediaSourceState {
  return {
    key: "",
    list: [],
    listIndex: new Map(),
    pairedThumbs: new Map(),
    loadedAt: 0,
    loading: false,
    roots: [],
    urlCache: new Map(),
  };
}
