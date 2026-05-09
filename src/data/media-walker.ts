/**
 * Media-source data path. Owns the calendar discovery + day-on-demand
 * walker, the per-root browse TTL cache, the resolve queue, persistent
 * calendar/day localStorage caches, the Frigate REST direct path, and
 * Frigate snapshot pairing.
 *
 * Lifecycle parallel to {@link SensorSourceClient}:
 *   - constructor — wire the `onChange` callback the card uses for
 *     `requestUpdate()`, plus optional `getDtOpts` / `resolveItemMs`
 *     callbacks the snapshot-pair logic needs.
 *   - `setHass(hass)` — called from every hass setter.
 *   - `load(config)` — called from setConfig; invalidates caches when
 *     roots / `frigate_url` / `path_datetime_format` change.
 *   - `ensureLoaded()` — orchestrator: runs Frigate REST when configured,
 *     otherwise the calendar walker.
 *   - `ensureDayLoaded(dayKey)` — Phase B; coalesces concurrent calls.
 *
 * `state` is consumed by `_buildDiagnostics()` in the card (read-only).
 * No other external readers — the legacy `this._ms` proxy never existed.
 */

import {
  DEFAULT_BROWSE_TIMEOUT_MS,
  DEFAULT_FRIGATE_API_LIMIT,
  DEFAULT_MAX_MEDIA,
  DEFAULT_RESOLVE_BATCH,
  FRIGATE_API_RETRY_AFTER_MS,
  FRIGATE_SNAPSHOT_MATCH_WINDOW_MS,
  MS_RESOLVE_FAILURE_TTL_MS,
} from "../const";
import type { CameraGalleryCardConfig } from "../config/normalize";
import type { CardItem } from "../types/media-item";
import type { HomeAssistant } from "../types/hass";
import type { MediaSourceItem } from "../types/media-source";
import {
  FRIGATE_SNAPSHOTS_ROOT,
  fetchFrigateEvents,
  frigateEventIdMs,
  isFrigateRoot,
  mapFrigateEventToItem,
} from "../util/frigate";
import { fnv1aHash } from "../util/hash";
import { dayKeyFromMs, type DatetimeOptions, dtMsFromSrc, extractDayKey } from "./datetime-parsing";
import {
  type BrowseFn,
  type Calendar,
  type CalendarEntry,
  discoverTree,
  loadDay,
} from "./media-tree";
import { dedupeByRelPath, pairMediaSourceThumbnails } from "./pairing";
import { parsePathFormat } from "./path-format";

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

/** Internal state shape. The card reads `list`/`loadedAt`/`calendar`/etc. via the
 * `state` getter for diagnostics; no other external reads. */
interface MediaSourceState {
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
  /** Calendar discovered for the current roots+format. Empty when Frigate
   * REST path is in use or no path-format is configured. */
  calendar: Calendar;
  /** Per-day item lists. Layout A: populated entirely on initial load.
   * Layouts B/C: populated lazily as the user navigates dates. */
  dayCache: Map<string, MsItem[]>;
}

export interface MediaSourceClientOptions {
  /** Fired after a load that mutates `list` or `urlCache` so the card can `requestUpdate()`. */
  onChange?: (() => void) | undefined;
  /** Provider for the parser options the snapshot-pair sort needs. Read each access. */
  getDtOpts?: (() => DatetimeOptions) | undefined;
  /** Resolve a video's authoritative ms (sensor/Frigate event-id). Only used by snapshot pairing. */
  resolveItemMs?: ((src: string) => number | null) | undefined;
}

const DEFAULT_GET_DT_OPTS = (): DatetimeOptions => ({ pathFormat: "" });

/** `true` for any media-source URI (`media-source://…`). */
export function isMediaSourceId(v: unknown): boolean {
  return String(v ?? "").startsWith("media-source://");
}

/** Canonical key for a multi-root config. Order-independent (sorted) so the
 * cache key stays stable when the user re-orders YAML. */
export function keyFromRoots(rootsArr: readonly string[] | null | undefined): string {
  const roots = Array.isArray(rootsArr) ? rootsArr : [];
  if (!roots.length) return "";
  return roots
    .slice()
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join(" | ");
}

const ENSURE_LOADED_FRESHNESS_MS = 30_000;
const BROWSE_CACHE_TTL_MS = 60 * 60 * 1000;
const RESOLVE_TIMEOUT_MS = 12_000;

/**
 * Sentinel bucket key for items that don't match the configured format.
 * They still show in the gallery (legacy parity — when no day is selected
 * they render alongside dated items), but the day-picker excludes this key
 * via `getDays()`.
 */
const UNDATED_BUCKET = "__cgc_undated__";

// ─── Persistent calendar + day caches ─────────────────────────────────
// Calendar entries are tiny (folder names + ids) so we hold them long.
// Per-day file lists are larger and shorter-lived.
const CALENDAR_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const CALENDAR_CACHE_REFRESH_AFTER_MS = 60 * 60 * 1000; // 1h
const DAY_CACHE_TTL_MS = 30 * 60 * 1000; // 30m
const DAY_CACHE_REFRESH_AFTER_MS = 5 * 60 * 1000; // 5m

interface PersistedCalendarEntry {
  leafId: string;
  leafName: string;
  dayKey: string;
}
interface PersistedCalendar {
  ts: number;
  byDay: Array<[string, PersistedCalendarEntry[]]>;
  days: string[];
}
interface PersistedDay {
  ts: number;
  items: MsItem[];
}

function saveCalendarToStorage(key: string, calendar: Calendar): void {
  try {
    const persistable: PersistedCalendar = {
      ts: Date.now(),
      byDay: Array.from(calendar.byDay.entries()).map(
        ([dayKey, entries]) => [dayKey, entries.map((e) => ({ ...e }))] as const
      ) as PersistedCalendar["byDay"],
      days: [...calendar.days],
    };
    localStorage.setItem(key, JSON.stringify(persistable));
  } catch {
    /* quota or unavailable storage — silent */
  }
}

function loadCalendarFromStorage(key: string): { calendar: Calendar; ts: number } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as PersistedCalendar | null;
    if (!entry || !Array.isArray(entry.byDay) || !Array.isArray(entry.days)) return null;
    if (Date.now() - (entry.ts ?? 0) > CALENDAR_CACHE_TTL_MS) return null;
    const byDay = new Map<string, readonly CalendarEntry[]>();
    for (const [dayKey, entries] of entry.byDay) {
      if (typeof dayKey !== "string" || !Array.isArray(entries)) continue;
      byDay.set(
        dayKey,
        entries.filter((e): e is CalendarEntry => !!e?.leafId)
      );
    }
    return { calendar: { byDay, days: entry.days }, ts: entry.ts };
  } catch {
    return null;
  }
}

function saveDayToStorage(key: string, items: readonly MsItem[]): void {
  try {
    const persistable: PersistedDay = { ts: Date.now(), items: [...items] };
    localStorage.setItem(key, JSON.stringify(persistable));
  } catch {
    /* quota or unavailable storage — silent */
  }
}

function loadDayFromStorage(key: string): { items: MsItem[]; ts: number } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as PersistedDay | null;
    if (!entry || !Array.isArray(entry.items)) return null;
    if (Date.now() - (entry.ts ?? 0) > DAY_CACHE_TTL_MS) return null;
    return { items: entry.items, ts: entry.ts };
  } catch {
    return null;
  }
}

/**
 * Stateful media-source client. See module docstring.
 */
export class MediaSourceClient {
  /** Internal state. Read by `_buildDiagnostics()` for the diagnostics panel;
   * mutated only by methods on this class. */
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
  /** Previous `path_datetime_format` snapshot used by `load()` to detect changes.
   * Format-only changes also invalidate item caches because the parsed
   * `dtMs` / `dayKey` for items can shift. */
  private _prevPathFormat = "";
  /** In-flight `loadDay` promises, keyed by dayKey. Coalesces concurrent
   * `ensureDayLoaded(dayKey)` calls onto one browse round. */
  private readonly _dayInFlight: Map<string, Promise<void>> = new Map();

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
    const nextPathFormat = String(config?.path_datetime_format ?? "");
    if (
      nextRootsKey !== this._prevRootsKey ||
      nextFrigateUrl !== this._prevFrigateUrl ||
      nextPathFormat !== this._prevPathFormat
    ) {
      this.clearForNewRoots();
      this._prevRootsKey = nextRootsKey;
      this._prevFrigateUrl = nextFrigateUrl;
      this._prevPathFormat = nextPathFormat;
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
    // Calendar-walker caches must follow the same generation. Without this,
    // a concurrent ensureDayLoaded() from the prior generation would coalesce
    // onto a stale promise and the new config sees an empty day for one
    // render cycle (review finding A1).
    this.state.calendar = { byDay: new Map(), days: [] };
    this.state.dayCache = new Map();
    this._dayInFlight.clear();
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

    await this._loadCalendarPath(roots, config);
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

  private async _loadCalendarPath(
    roots: readonly string[],
    config: CameraGalleryCardConfig
  ): Promise<void> {
    const now = Date.now();
    const key = keyFromRoots(roots);
    const sameKey = this.state.key === key;
    const fresh = sameKey && now - (this.state.loadedAt ?? 0) < ENSURE_LOADED_FRESHNESS_MS;
    if (this.state.loading || fresh) return;

    const fmt = parsePathFormat(config.path_datetime_format ?? "");
    if (!fmt) {
      // Validation in normalize.ts requires `path_datetime_format` for media
      // mode (unless Frigate REST handles it). Reaching here means a Frigate
      // root with no REST URL — surface an empty list rather than spin.
      this.state.calendar = { byDay: new Map(), days: [] };
      this.state.dayCache = new Map();
      this.setList([]);
      return;
    }

    if (!sameKey) {
      this.state.key = key;
      this.setList([]);
      this.state.roots = roots.slice();
      this.state.urlCache = new Map();
      this.resolveFailed = new Map();
      this.state.dayCache = new Map();
    }

    this.state.loading = true;
    const gen = this._loadGeneration;
    const browseFn: BrowseFn = (id) => this._browse(id);

    // Persistent calendar fast-path: serve a cached calendar instantly so the
    // day-picker populates without waiting for the network. Only useful for
    // lazy layouts (B/C) — layout A's items are eager and aren't keyed by
    // day in the calendar, so we always re-discover for `directoryDepth = 0`.
    const calCacheKey = this._calendarCacheKey(roots, fmt);
    const cachedCal = calCacheKey ? loadCalendarFromStorage(calCacheKey) : null;
    const cacheEligible = fmt.directoryDepth >= 1;
    let calendarFresh = false;
    if (cachedCal && cacheEligible) {
      this.state.calendar = cachedCal.calendar;
      this._fireChange();
      calendarFresh = Date.now() - cachedCal.ts < CALENDAR_CACHE_REFRESH_AFTER_MS;
    }

    try {
      let discovery: Awaited<ReturnType<typeof discoverTree>>;
      if (calendarFresh && cachedCal) {
        // Use the cached calendar; skip Phase A. Always lazy here because
        // we gated `calendarFresh` on `directoryDepth >= 1`.
        discovery = { isLazy: true, calendar: cachedCal.calendar, eagerItems: [] };
      } else {
        discovery = await discoverTree(roots, fmt, browseFn, {
          isStale: () => this._isStale(gen),
        });
        if (this._isStale(gen)) return;
        // Drop empty short-circuit entries (`dayCache.set(dayKey, [])` from
        // sensor-only days OR from days that were missing in a stale cached
        // calendar) — the new calendar may now contain those days, and the
        // empty cache would otherwise prevent ensureDayLoaded from re-fetching.
        if (cachedCal) {
          for (const [dayKey, items] of this.state.dayCache.entries()) {
            if (items.length === 0 && discovery.calendar.byDay.has(dayKey)) {
              this.state.dayCache.delete(dayKey);
            }
          }
        }
        this.state.calendar = discovery.calendar;
        if (calCacheKey && cacheEligible) {
          saveCalendarToStorage(calCacheKey, discovery.calendar);
        }
      }

      if (!discovery.isLazy) {
        // Layout A — eager. Bucket items by dayKey for O(1) picker filtering.
        // Items that don't match the format land under a sentinel bucket so
        // they still appear in the gallery — preserves legacy parity where
        // undated items rendered (just at the end of the list).
        const byDayItems = new Map<string, MsItem[]>();
        for (const item of discovery.eagerItems) {
          const dayKey = item.dtMs !== undefined ? dayKeyFromMs(item.dtMs) : null;
          const bucket = dayKey ?? UNDATED_BUCKET;
          if (!byDayItems.has(bucket)) byDayItems.set(bucket, []);
          byDayItems.get(bucket)!.push(item);
        }
        this.state.dayCache = byDayItems;
        this._refreshList();
      } else {
        // Layouts B/C — lazy. Auto-load the most-recent day so the gallery
        // isn't empty on first render. Older days load on user navigation.
        const newest = discovery.calendar.days[0];
        if (newest) {
          // Snapshot the calendar so a concurrent config change can't make
          // _loadDayInternal write empty results for a day from the OLD
          // calendar (review finding A6).
          await this._loadDayInternal(newest, discovery.calendar, fmt, browseFn, gen);
        }
        if (this._isStale(gen)) return;
        this._refreshList();
      }

      // Frigate snapshot index — only when a Frigate root is configured.
      // The snapshot pairing (`findMatchingSnapshotMediaId`) needs this index
      // independent of `path_datetime_format`. Frigate's snapshots root is a
      // shallow tree organised as `<root>/<camera_name>/<event-id>.jpg`, so
      // we browse the root, then descend ONE level into each per-camera
      // subdir to enumerate the actual snapshot files. (Browsing only the
      // root would index camera-name folders rather than image IDs and
      // every `findMatchingSnapshotMediaId` lookup would miss.)
      if (roots.some(isFrigateRoot)) {
        try {
          const dtOpts = this._getDtOpts();
          const snapshotRoot = await browseFn(FRIGATE_SNAPSHOTS_ROOT);
          const topChildren = Array.isArray(snapshotRoot?.children) ? snapshotRoot.children : [];
          const snapshotItems: MediaSourceItem[] = [];
          // Bounded fan-out so an over-large camera count doesn't stall the
          // gallery's first paint behind dozens of browse calls.
          const MAX_SNAPSHOT_DESCENT = 32;
          const descendTargets: string[] = [];
          for (const top of topChildren) {
            if (!top?.media_content_id) continue;
            if (top.can_expand) {
              if (descendTargets.length < MAX_SNAPSHOT_DESCENT) {
                descendTargets.push(String(top.media_content_id));
              }
            } else {
              snapshotItems.push(top);
            }
          }
          const subResults = await Promise.all(
            descendTargets.map(async (id) => {
              try {
                const sub = await browseFn(id);
                return Array.isArray(sub?.children) ? sub.children : [];
              } catch {
                return [];
              }
            })
          );
          for (const arr of subResults) snapshotItems.push(...arr);
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

      this.state.loadedAt = Date.now();
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

  /**
   * Public Phase-B trigger. Browses the day-leaf folders for `dayKey` and
   * caches the resulting items. Coalesces concurrent calls for the same
   * day. No-op if the day is already cached.
   */
  async ensureDayLoaded(dayKey: string): Promise<void> {
    if (!dayKey) return;
    if (this.state.dayCache.has(dayKey)) return;
    const inFlight = this._dayInFlight.get(dayKey);
    if (inFlight) return inFlight;
    const config = this._config;
    if (!config) return;
    const fmt = parsePathFormat(config.path_datetime_format ?? "");
    if (!fmt) return;
    const browseFn: BrowseFn = (id) => this._browse(id);
    const gen = this._loadGeneration;
    // Snapshot the calendar at call time so a concurrent config-change that
    // swaps `state.calendar` mid-flight can't make us write an empty list
    // for a day that exists only in the OLD calendar (review finding A6).
    const calendar = this.state.calendar;
    const promise = this._loadDayInternal(dayKey, calendar, fmt, browseFn, gen);
    this._dayInFlight.set(dayKey, promise);
    try {
      await promise;
    } finally {
      this._dayInFlight.delete(dayKey);
    }
  }

  private async _loadDayInternal(
    dayKey: string,
    calendar: Calendar,
    fmt: ReturnType<typeof parsePathFormat>,
    browseFn: BrowseFn,
    gen: number
  ): Promise<void> {
    if (!fmt) return;
    // Sensor-only days in combined mode reach this method (the picker shows
    // them, the card calls ensureDayLoaded on every selection). Short-circuit
    // when the calendar has no leaves for the day — no browse, no cache write,
    // no localStorage clutter.
    if (!calendar.byDay.has(dayKey)) {
      this.state.dayCache.set(dayKey, []);
      return;
    }
    // Persistent-cache fast path: serve cached items immediately, then
    // refresh in the background if the entry is older than refresh-after.
    const cacheKey = this._dayCacheKey(dayKey);
    const cached = cacheKey ? loadDayFromStorage(cacheKey) : null;
    if (cached) {
      this.state.dayCache.set(dayKey, cached.items);
      this._refreshList();
      this._fireChange();
      if (Date.now() - cached.ts < DAY_CACHE_REFRESH_AFTER_MS) return;
    }
    const items = await loadDay(calendar, dayKey, fmt, browseFn, {
      isStale: () => this._isStale(gen),
    });
    if (this._isStale(gen)) return;
    this.state.dayCache.set(dayKey, items);
    if (cacheKey) saveDayToStorage(cacheKey, items);
    this._refreshList();
    this._fireChange();
  }

  /** Canonical signature of a path-format. Both `_dayCacheKey` and
   * `_calendarCacheKey` derive their hash from this so the two caches stay
   * keyed in lock-step (a trailing-slash variant in YAML doesn't orphan one
   * cache while reusing the other). */
  private _formatSignature(fmt: ReturnType<typeof parsePathFormat>): string {
    if (!fmt) return "";
    return fmt.segments.map((s) => s.raw).join("/");
  }

  /** Compute the localStorage key for a given dayKey under the active config. */
  private _dayCacheKey(dayKey: string): string | null {
    const config = this._config;
    if (!config) return null;
    const rootsKey = keyFromRoots(config.media_sources ?? []);
    const fmtSig = this._formatSignature(parsePathFormat(config.path_datetime_format ?? ""));
    if (!rootsKey || !fmtSig || !dayKey) return null;
    return `cgc_msday1_${fnv1aHash(`${rootsKey}|${fmtSig}|${dayKey}`)}`;
  }

  /** Compute the localStorage key for the calendar under a given roots+format pair. */
  private _calendarCacheKey(
    roots: readonly string[],
    fmt: ReturnType<typeof parsePathFormat>
  ): string | null {
    const rootsKey = keyFromRoots(roots);
    const fmtSig = this._formatSignature(fmt);
    if (!rootsKey || !fmtSig) return null;
    return `cgc_mscal1_${fnv1aHash(`${rootsKey}|${fmtSig}`)}`;
  }

  /** Flatten `dayCache` into `state.list` (sorted descending by dtMs).
   * Called whenever a day is loaded so the existing render path sees the
   * latest items. */
  private _refreshList(): void {
    const flat: MsItem[] = [];
    for (const arr of this.state.dayCache.values()) flat.push(...arr);
    flat.sort((a, b) => {
      const am = a.dtMs ?? 0;
      const bm = b.dtMs ?? 0;
      if (bm !== am) return bm - am;
      return a.title < b.title ? 1 : a.title > b.title ? -1 : 0;
    });
    this.setList(dedupeByRelPath(flat) as MsItem[]);
  }

  /** All discovered dayKeys in descending order. Mirrors `Calendar.days`. */
  getDays(): readonly string[] {
    return this.state.calendar.days;
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
    calendar: { byDay: new Map(), days: [] },
    dayCache: new Map(),
  };
}
