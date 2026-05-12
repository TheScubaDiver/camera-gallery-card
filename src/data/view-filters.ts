/**
 * Pure predicates for the view layer — which items render, which video/image
 * type bucket they fall into, and which object filter they belong to.
 *
 * The card class previously hosted these directly:
 *   - `_isVideoSmart`            → `isVideoSmart`
 *   - `_isVideoForSrc`           → `isVideoForSrc`
 *   - `_matchesTypeFilter`       → `matchesTypeFilter`
 *   - `_activeObjectFilters`     → `normalizeFilterArray`
 *   - `_isObjectFilterActive`    → `isObjectFilterActive`
 *   - `_matchesObjectFilter*`    → `matchesObjectFilter`
 *   - `_objectForSrc`            → `detectObjectForSrc` (uncached — the card
 *                                  still owns the per-render memoization Map)
 *
 * Pure leaf helpers live in `data/object-filters.ts` (`getFilterAliases`,
 * `itemFilenameForFilter`, `sensorTextForFilter`,
 * `matchesObjectFilterForFileSensor`). This module composes them.
 */

import type { SourceMode } from "../const";
import {
  type FilterableItem,
  getFilterAliases,
  itemFilenameForFilter,
  matchesObjectFilterForFileSensor,
  sensorTextForFilter,
} from "./object-filters";
import type { HassEntity } from "../types/hass";
import { isVideo } from "../util/media-type";

/** Minimal shape of a media-source item record this module consumes. */
export interface MediaMeta {
  title?: string;
  mime?: string;
  cls?: string;
}

/**
 * Lower-cased, trimmed, non-empty entries from a raw filter list. Drop-in
 * replacement for the inline `arr.map(x => String(x||"").toLowerCase().trim()).filter(Boolean)`
 * pattern that was duplicated in `_activeObjectFilters` and
 * `_matchesObjectFilterValue` (audit-fix #4/5).
 *
 * Returns a fresh array; the caller may cache it keyed off the input
 * reference to avoid re-normalizing per render.
 */
export function normalizeFilterArray(filters: readonly unknown[] | null | undefined): string[] {
  if (!Array.isArray(filters)) return [];
  const out: string[] = [];
  for (const x of filters) {
    const s = String(x ?? "")
      .toLowerCase()
      .trim();
    if (s) out.push(s);
  }
  return out;
}

/** Membership check against a (raw or pre-normalized) filter list. */
export function isObjectFilterActive(
  filters: readonly unknown[] | null | undefined,
  value: string
): boolean {
  const target = String(value ?? "")
    .toLowerCase()
    .trim();
  if (!target) return false;
  return normalizeFilterArray(filters).includes(target);
}

/**
 * MIME / class / path heuristic for "is this a video?" The previous
 * `_isVideoSmart` only checked the trailing extension once class/MIME failed;
 * we delegate that tail to {@link isVideo} for symmetry with other call sites.
 */
export function isVideoSmart(
  urlOrTitle: string | null | undefined,
  mime?: string | null,
  cls?: string | null
): boolean {
  const m = String(mime ?? "").toLowerCase();
  if (m.startsWith("video/")) return true;
  const c = String(cls ?? "").toLowerCase();
  if (c === "video") return true;
  return isVideo(String(urlOrTitle ?? ""));
}

/**
 * Type-detection for a render item. For media-source IDs we ask the supplied
 * `getMeta` lookup for the recorded MIME/class; on miss (or no lookup
 * provided) we fall back to the URL-extension check.
 *
 * Audit-fix #2: the legacy `_isVideoForSrc` always called `getMetaById` for
 * media IDs and accidentally relied on `String(undefined).toLowerCase()`
 * returning `"undefined"` (which fails the prefix tests). Now we explicitly
 * fall back when the meta lookup returns `undefined`.
 */
export function isVideoForSrc(opts: {
  src: string;
  isMediaSource: (src: string) => boolean;
  getMeta?: (src: string) => MediaMeta | undefined;
}): boolean {
  const { src, isMediaSource, getMeta } = opts;
  if (isMediaSource(src) && getMeta) {
    const meta = getMeta(src);
    if (meta) return isVideoSmart(meta.title || src, meta.mime, meta.cls);
  }
  return isVideo(src);
}

/**
 * Decide whether `src` passes the binary video/image type filter. Both
 * toggles in the same state ("both on" or "both off") is the
 * "no type filter engaged" path — show everything. This matches the legacy
 * `_matchesTypeFilter` semantics; the initial state is `false`/`false` so
 * fresh cards render every item.
 */
export function matchesTypeFilter(opts: {
  src: string;
  filterVideo: boolean;
  filterImage: boolean;
  isVideo: (src: string) => boolean;
}): boolean {
  const { src, filterVideo, filterImage } = opts;
  if (filterVideo === filterImage) return true;
  return opts.isVideo(src) ? filterVideo : filterImage;
}

/**
 * Resolve which canonical object filter an `src` belongs to (`"person"`,
 * `"car"`, …) by scanning its filename + (sensor mode) the source sensor's
 * friendly text for aliases.
 *
 * Returns `null` when no filter matches. Pure — the card memoizes via its
 * own `_objectCache` Map so callers see at most one detection per src per
 * media-client `onChange` cycle (audit-fix #1).
 */
export function detectObjectForSrc(opts: {
  src: string;
  sourceMode: SourceMode;
  visibleFilters: readonly string[];
  getSrcEntity: (src: string) => string | undefined;
  getSensorState: (entityId: string) => HassEntity | undefined;
  getMediaTitle: (src: string) => string | undefined;
}): string | null {
  const key = String(opts.src ?? "").trim();
  if (!key) return null;

  let sourceText: string;
  if (opts.sourceMode === "sensor") {
    const entityId = opts.getSrcEntity(key) ?? "";
    const state = entityId ? (opts.getSensorState(entityId) ?? null) : null;
    sourceText = [itemFilenameForFilter(key), sensorTextForFilter(entityId, state)].join(" ");
  } else {
    const title = opts.getMediaTitle(key) ?? "";
    sourceText = [title, key].join(" ");
  }

  const text = sourceText.toLowerCase();
  for (const filter of opts.visibleFilters) {
    const aliases = getFilterAliases(filter);
    for (const alias of aliases) {
      if (text.includes(alias)) return filter;
    }
  }
  return null;
}

/**
 * Apply the active object-filter list to `src`. Sensor-mode delegates to
 * {@link matchesObjectFilterForFileSensor} (which scans sensor friendly-name
 * + alias hits); other modes consult the supplied `getObjectForSrc` lookup,
 * which is the card's memoized {@link detectObjectForSrc} caller.
 *
 * Empty/normalize-to-empty filter list passes everything through — "no
 * object filter engaged" matches the legacy behaviour.
 */
export function matchesObjectFilter(opts: {
  src: string;
  filters: readonly unknown[] | null | undefined;
  sourceMode: SourceMode;
  getSrcEntity: (src: string) => string | undefined;
  getSensorState: (entityId: string) => HassEntity | undefined;
  getObjectForSrc: (src: string) => string | null;
}): boolean {
  const active = normalizeFilterArray(opts.filters);
  if (!active.length) return true;

  if (opts.sourceMode === "sensor") {
    const entityId = opts.getSrcEntity(opts.src) ?? "";
    const state = entityId ? (opts.getSensorState(entityId) ?? null) : null;
    return active.some((filter) =>
      matchesObjectFilterForFileSensor(opts.src as string | FilterableItem, filter, entityId, state)
    );
  }

  const detected = opts.getObjectForSrc(opts.src);
  return detected !== null && active.includes(detected);
}
