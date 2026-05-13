/**
 * Stateful client that owns the funnel from raw source items → the sorted,
 * day-grouped, object-filtered list every render path consumes.
 *
 * Replaces the card's `_items()`, `_computeBaseList()`, `_allKnownDays()`,
 * `_resolveItemMs()` plus the three duplicated `withDt` sort blocks (audit
 * fix #3 — see `sortItemsByTime` below).
 *
 * Lifecycle parallels the other data clients:
 *   - constructor — wire closures over the source clients + card state.
 *   - `invalidate()` — bumps the rev; called from `setConfig`, the source
 *     clients' `onChange`, and any direct mutation of `_deleted`.
 *   - getters — the cache key is `(itemsRev, selectedDay, objectFilters ref,
 *     sortOrder)`; the cached base list is reused when nothing changed.
 *
 * The render path calls `getBaseList()` once per cycle; the same instance
 * is consulted by `updated()` so each render pays the O(n log n) sort
 * exactly once.
 */

import type { SourceMode, ThumbSortOrder } from "../const";
import type { CardItem } from "../types/media-item";
import { type DatetimeOptions, dayKeyFromMs, dtMsFromSrc } from "./datetime-parsing";
import type { CombinedSourceClient } from "./combined-source";
import type { MediaSourceClient } from "./media-walker";
import type { SensorSourceClient } from "./sensor-source";
import { dedupeByRelPath } from "./pairing";
import { frigateEventIdFromSrc, frigateEventIdMs } from "../util/frigate";

export interface EnrichedItem {
  src: string;
  dtMs?: number;
}

export interface BaseListEntry {
  src: string;
  dtMs: number | null;
  dayKey: string | null;
}

export interface BaseList {
  rawItems: readonly EnrichedItem[];
  allWithDay: readonly BaseListEntry[];
  days: readonly string[];
  newestDay: string | null;
  activeDay: string | null;
  dayFiltered: readonly BaseListEntry[];
  objFiltered: readonly BaseListEntry[];
  videoCount: number;
  imageCount: number;
  sortOrder: ThumbSortOrder;
}

const EMPTY_DELETED: ReadonlySet<string> = new Set();

const EMPTY_BASE_LIST: BaseList = {
  rawItems: [],
  allWithDay: [],
  days: [],
  newestDay: null,
  activeDay: null,
  dayFiltered: [],
  objFiltered: [],
  videoCount: 0,
  imageCount: 0,
  sortOrder: "newest",
};

export interface ItemPipelineClientOptions {
  sensorClient: SensorSourceClient;
  mediaClient: MediaSourceClient;
  combinedClient: CombinedSourceClient;
  /** Reads each access — config can change behind the closure. */
  getSourceMode: () => SourceMode | undefined;
  getSortOrder: () => ThumbSortOrder | undefined;
  getSelectedDay: () => string | null;
  getObjectFilters: () => readonly unknown[];
  getDtOpts: () => DatetimeOptions;
  getDeleted?: () => ReadonlySet<string>;
  getDeletedFrigateEventIds?: () => ReadonlySet<string>;
  /** Card-side predicate (closes over `_objectCache`, sensor state, hass). */
  matchesObjectFilter: (src: string) => boolean;
  /** Card-side type predicate (closes over the media-client meta lookup). */
  isVideoForSrc: (src: string) => boolean;
  /** Fired after `invalidate()` so the card can `requestUpdate()`. */
  onChange?: () => void;
}

/**
 * Sort items by descending dtMs, then ties broken by reverse insertion
 * order — items without `dtMs` go last in their respective tie group. The
 * caller flips for `"oldest"` order by reversing the result.
 *
 * Audit-fix #3 — consolidates three identical `withDt` blocks that
 * previously lived in `_syncPreviewPlaybackFromState`, `_computeBaseList`
 * and `_setObjectFilter`.
 */
export function sortItemsByTime(
  items: readonly EnrichedItem[],
  sortOrder: ThumbSortOrder
): BaseListEntry[] {
  const withDt = items.map((it, idx) => {
    const raw = it.dtMs;
    const dtMs = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    const dayKey = dtMs !== null ? dayKeyFromMs(dtMs) : null;
    return { dayKey, dtMs, idx, src: it.src };
  });

  withDt.sort((a, b) => {
    const aOk = a.dtMs !== null;
    const bOk = b.dtMs !== null;
    if (aOk && bOk && b.dtMs !== a.dtMs) return (b.dtMs as number) - (a.dtMs as number);
    if (aOk && !bOk) return -1;
    if (!aOk && bOk) return 1;
    return b.idx - a.idx;
  });

  if (sortOrder === "oldest") withDt.reverse();

  return withDt.map((x) => ({ dayKey: x.dayKey, src: x.src, dtMs: x.dtMs }));
}

/**
 * Merge the media client's discovered calendar days with whatever days the
 * loaded items contribute. Calendar days are pre-populated by Phase A of the
 * media walker; in `combined` mode this also folds in sensor-derived dayKeys.
 */
export function mergeKnownDays(
  itemsWithDay: readonly { dayKey?: string | null }[],
  calendarDays: readonly string[]
): string[] {
  if (calendarDays.length === 0) {
    const set = new Set<string>();
    for (const it of itemsWithDay) if (it?.dayKey) set.add(it.dayKey);
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }
  const merged = new Set(calendarDays);
  for (const it of itemsWithDay) if (it?.dayKey) merged.add(it.dayKey);
  return Array.from(merged).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

export class ItemPipelineClient {
  private readonly _opts: ItemPipelineClientOptions;

  private _rev = 0;

  // _items() cache
  private _cachedItemsRev = -1;
  private _cachedItems: readonly EnrichedItem[] = [];

  // base-list cache
  private _cachedBaseListItemsRev = -1;
  private _cachedBaseListSelectedDay: string | null = null;
  private _cachedBaseListObjFilters: readonly unknown[] | null = null;
  private _cachedBaseListSortOrder: ThumbSortOrder | null = null;
  private _cachedBaseList: BaseList | null = null;

  constructor(opts: ItemPipelineClientOptions) {
    this._opts = opts;
  }

  /** Current revision counter — bumped on every `invalidate()`. Render
   * paths use this as a stable cache key for downstream work (e.g. the
   * poster-queue key in the card). */
  get rev(): number {
    return this._rev;
  }

  /** Bump the rev so the next call rebuilds. Fires `onChange`. */
  invalidate(): void {
    this._rev++;
    this._opts.onChange?.();
  }

  /** Best-effort `dtMs` for `src`: source-attached → Frigate event-id → user format. */
  resolveItemMs(src: string): number | null {
    const pre = this._opts.mediaClient.getDtMsForId(src);
    if (pre !== null) return pre;
    const fid = frigateEventIdMs(src);
    if (typeof fid === "number" && Number.isFinite(fid)) return fid;
    const parsed = dtMsFromSrc(src, this._opts.getDtOpts());
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
  }

  /** Source-dispatched item list, with deleted/event-id-deleted items filtered out. */
  getItems(): readonly EnrichedItem[] {
    if (this._cachedItemsRev === this._rev) return this._cachedItems;

    const mode = this._opts.getSourceMode();
    const enrich = (src: string): EnrichedItem => {
      const dtMs = this.resolveItemMs(src);
      return dtMs !== null ? { src, dtMs } : { src };
    };

    let result: readonly CardItem[];
    if (mode === "combined") {
      result = this._opts.combinedClient.getItems(enrich);
    } else if (mode === "media") {
      result = dedupeByRelPath(this._opts.mediaClient.getIds()).map((id) => enrich(String(id)));
    } else {
      result = this._opts.sensorClient.getItems(enrich);
    }

    const deleted = this._opts.getDeleted?.() ?? EMPTY_DELETED;
    const deletedEids = this._opts.getDeletedFrigateEventIds?.() ?? EMPTY_DELETED;

    let filtered: readonly EnrichedItem[];
    if (deleted.size === 0 && deletedEids.size === 0) {
      filtered = result;
    } else {
      filtered = result.filter((it) => {
        if (deleted.has(it.src)) return false;
        if (deletedEids.size) {
          const eid = frigateEventIdFromSrc(it.src);
          if (eid && deletedEids.has(eid)) return false;
        }
        return true;
      });
    }

    this._cachedItems = filtered;
    this._cachedItemsRev = this._rev;
    return filtered;
  }

  /** All dayKeys known to the gallery — media calendar ∪ item-derived. */
  getAllDays(itemsWithDay: readonly { dayKey?: string | null }[]): readonly string[] {
    const calendarDays = this._opts.mediaClient.getDays();
    return mergeKnownDays(itemsWithDay, calendarDays);
  }

  /**
   * Sorted, day-grouped, object-filtered base list. Render code reads
   * `objFiltered` + `videoCount`/`imageCount`/`activeDay` from here.
   */
  getBaseList(): BaseList {
    const objectFilters = this._opts.getObjectFilters();
    const sortOrder = this._opts.getSortOrder() === "oldest" ? "oldest" : "newest";
    const selectedDay = this._opts.getSelectedDay();

    if (
      this._cachedBaseList &&
      this._cachedBaseListItemsRev === this._rev &&
      this._cachedBaseListSelectedDay === selectedDay &&
      this._cachedBaseListObjFilters === objectFilters &&
      this._cachedBaseListSortOrder === sortOrder
    ) {
      return this._cachedBaseList;
    }

    const rawItems = this.getItems();
    if (!rawItems.length) {
      const empty: BaseList = { ...EMPTY_BASE_LIST, sortOrder };
      this._cacheBaseList(empty, selectedDay, objectFilters, sortOrder);
      return empty;
    }

    const allWithDay = sortItemsByTime(rawItems, sortOrder);
    const days = this.getAllDays(allWithDay);
    const newestDay = days[0] ?? null;
    const activeDay = selectedDay ?? newestDay;

    const dayFiltered: BaseListEntry[] = !activeDay
      ? allWithDay
      : allWithDay.filter((x) => x.dayKey === activeDay);

    const objFiltered: BaseListEntry[] = dayFiltered.filter((x) =>
      this._opts.matchesObjectFilter(x.src)
    );

    // Single-pass video/image count — render uses both for the type-filter
    // pill visibility.
    let videoCount = 0;
    for (const x of objFiltered) {
      if (this._opts.isVideoForSrc(x.src)) videoCount++;
    }
    const imageCount = objFiltered.length - videoCount;

    const result: BaseList = {
      rawItems,
      allWithDay,
      days,
      newestDay,
      activeDay,
      dayFiltered,
      objFiltered,
      videoCount,
      imageCount,
      sortOrder,
    };
    this._cacheBaseList(result, selectedDay, objectFilters, sortOrder);
    return result;
  }

  private _cacheBaseList(
    result: BaseList,
    selectedDay: string | null,
    objectFilters: readonly unknown[],
    sortOrder: ThumbSortOrder
  ): void {
    this._cachedBaseList = result;
    this._cachedBaseListItemsRev = this._rev;
    this._cachedBaseListSelectedDay = selectedDay;
    this._cachedBaseListObjFilters = objectFilters;
    this._cachedBaseListSortOrder = sortOrder;
  }
}
