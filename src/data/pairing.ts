/**
 * Pure helpers for collapsing video / thumbnail pairs and deduping items by
 * normalized rel-path.
 *
 * Both NVR-style sensor sources and `media-source/browse_media` responses
 * tend to surface a video and a sibling JPG/PNG thumbnail with the same
 * filename stem (e.g. `clip.mp4` + `clip.jpg`). The card folds those into
 * a single gallery tile by removing the thumbnail from the rendered list
 * and exposing a `videoKey -> thumbnailKey` map for the renderer to attach
 * the still as the video's poster.
 *
 * Cameras that stamp each file with its own capture time never produce a
 * shared stem (Reolink FTP: `Cam_00_20261012111139.mp4` +
 * `Cam_00_20261012111141.jpg`), so a second pass pairs the leftovers by
 * timestamp proximity — the plain-file counterpart of the ±15s Frigate
 * snapshot match in `MediaSourceClient.findMatchingSnapshotMediaId`.
 *
 * Sensor items key off `src` (file path); media-source items key off `id`
 * (media-source URI). The pairing heuristics are identical otherwise,
 * so `pairVideoThumbnails` is the generic implementation and the two
 * named exports are thin wrappers that pass the right accessors.
 */

import { THUMBNAIL_MATCH_WINDOW_MS } from "../const";

const VIDEO_EXT_RE = /([^/]+)\.(mp4|webm|mov|m4v)$/i;
const IMAGE_EXT_RE = /([^/]+)\.(jpg|jpeg|png|webp)$/i;
const EXT_RE = /\.[^./]+$/;
const DIGIT_RE = /\d/g;
const ALL_DIGITS_RE = /^\d+$/;

/** Common shape for items that key off a media-source URI. */
export interface MediaSourceLike {
  id: string;
  /** Parsed capture time. Enables the proximity pass when present. */
  dtMs?: number | undefined;
}

/** Common shape for items that key off a sensor file path. */
export interface SensorLike {
  src: string;
  /** Parsed capture time. Enables the proximity pass when present. */
  dtMs?: number | undefined;
}

export interface PairResult<T> {
  /** Original `items` minus the thumbnail entries that paired with a video. */
  items: T[];
  /** `videoKey -> thumbnailKey` for every successful pairing. */
  pairedThumbs: Map<string, string>;
}

/**
 * Pair videos with their sibling JPG/PNG/WEBP thumbnails by filename stem.
 *
 * `getKey` should return the item's pair-by-stem key (e.g. URI or file path).
 * Items where `getKey` returns `undefined`/`""` are passed through untouched
 * (they can't pair). Case-insensitive stem matching.
 *
 * When `getMs` is supplied, thumbnails the stem pass left unpaired get a
 * second chance by timestamp proximity — see {@link pairByProximity}.
 * Items where `getMs` returns `null`/`undefined`/non-finite sit that pass out.
 *
 * The resulting `items` preserves the input order; matched thumbnails are
 * removed. `pairedThumbs` keys/values are the raw `getKey` outputs.
 */
export function pairVideoThumbnails<T>(
  items: readonly T[] | null | undefined,
  getKey: (it: T) => string | undefined,
  getMs?: (it: T) => number | null | undefined
): PairResult<T> {
  if (!Array.isArray(items) || items.length === 0) {
    return { items: [], pairedThumbs: new Map() };
  }

  const videoIdxByStem = new Map<string, number>();
  for (const [i, it] of items.entries()) {
    const key = getKey(it);
    if (!key) continue;
    const stem = VIDEO_EXT_RE.exec(key)?.[1];
    if (!stem) continue;
    videoIdxByStem.set(stem.toLowerCase(), i);
  }

  const pairedThumbs = new Map<string, string>();
  const toRemove = new Set<number>();
  for (const [i, it] of items.entries()) {
    const thumbKey = getKey(it);
    if (!thumbKey) continue;
    const stem = IMAGE_EXT_RE.exec(thumbKey)?.[1];
    if (!stem) continue;
    const vidIdx = videoIdxByStem.get(stem.toLowerCase());
    if (vidIdx === undefined) continue;
    const video = items[vidIdx];
    if (video === undefined) continue;
    const videoKey = getKey(video);
    if (!videoKey) continue;
    pairedThumbs.set(videoKey, thumbKey);
    toRemove.add(i);
  }

  if (getMs) pairByProximity(items, getKey, getMs, pairedThumbs, toRemove);

  const filtered = toRemove.size ? items.filter((_, i) => !toRemove.has(i)) : [...items];
  return { items: filtered, pairedThumbs };
}

/** A video or thumbnail left over from the stem pass, staged for proximity. */
interface ProximityCandidate {
  idx: number;
  /** Raw `getKey` output — what lands in `pairedThumbs`. */
  key: string;
  /** `key` lowercased with the extension stripped — what gets compared. */
  base: string;
  ms: number;
}

/**
 * Second pass: pair each thumbnail the stem pass left over with the
 * nearest leftover video, provided that
 *   - both carry a timestamp, at most `THUMBNAIL_MATCH_WINDOW_MS` apart
 *     and not identical — equal times on different names mean the names
 *     differ somewhere other than the timestamp (channel, sequence no.);
 *   - their keys, extension stripped, are the same length and differ only
 *     inside one run of digits. `Cam_00_…41` / `Cam_00_…39` qualify;
 *     `NVR_00_…41` / `NVR_01_…39` (channel *and* time differ) and files
 *     in different folders don't.
 *
 * The name check is what makes this safe for plain files without knowing
 * `path_datetime_format`: two zero-padded timestamps of one format always
 * differ within a single digit run. Formats with separators that roll over
 * (`11-11-59` → `11-12-01`) fail it and stay unpaired — the same outcome
 * as before this pass existed.
 *
 * Pairing is one-to-one and runs in two tiers, each closest first across
 * the whole list:
 *   1. clips that started at or before the still. That's the shape of a
 *      real event — the clip opens on its pre-record buffer, the still is
 *      the trigger frame — so a still sitting just before the *next* clip
 *      no longer gets pulled forward onto it. We don't know clip lengths,
 *      so the window is the only bound on how far back a clip may start.
 *   2. either direction, for whatever tier 1 left over (camera clock skew,
 *      or a still whose earlier clip went to a closer still).
 * A clip can't swallow two stills; the leftover stays a standalone tile.
 * Mutates `pairedThumbs` / `toRemove` in place.
 */
function pairByProximity<T>(
  items: readonly T[],
  getKey: (it: T) => string | undefined,
  getMs: (it: T) => number | null | undefined,
  pairedThumbs: Map<string, string>,
  toRemove: Set<number>
): void {
  // Bucket by key shape (every digit blanked to `0`). Only same-shape keys
  // can differ purely in digits, so this confines the pairwise scan to one
  // camera-and-folder at a time instead of every image × every video.
  const buckets = new Map<string, { videos: ProximityCandidate[]; images: ProximityCandidate[] }>();
  for (const [i, it] of items.entries()) {
    if (toRemove.has(i)) continue;
    const key = getKey(it);
    if (!key) continue;
    const isVideo = VIDEO_EXT_RE.test(key);
    if (isVideo ? pairedThumbs.has(key) : !IMAGE_EXT_RE.test(key)) continue;
    const ms = getMs(it);
    if (typeof ms !== "number" || !Number.isFinite(ms)) continue;
    const base = key.replace(EXT_RE, "").toLowerCase();
    const shape = base.replace(DIGIT_RE, "0");
    let bucket = buckets.get(shape);
    if (!bucket) {
      bucket = { videos: [], images: [] };
      buckets.set(shape, bucket);
    }
    (isVideo ? bucket.videos : bucket.images).push({ idx: i, key, base, ms });
  }

  const pairs: { image: ProximityCandidate; video: ProximityCandidate; diff: number }[] = [];
  for (const { videos, images } of buckets.values()) {
    if (!videos.length || !images.length) continue;
    videos.sort((a, b) => a.ms - b.ms);
    for (const image of images) {
      // Binary-search the first video inside the window, then walk forward
      // until past it. A busy camera folder holds thousands of same-shape
      // files; the window holds a handful.
      const from = image.ms - THUMBNAIL_MATCH_WINDOW_MS;
      const to = image.ms + THUMBNAIL_MATCH_WINDOW_MS;
      let lo = 0;
      let hi = videos.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if ((videos[mid]?.ms ?? Infinity) < from) lo = mid + 1;
        else hi = mid;
      }
      for (let v = lo; v < videos.length; v++) {
        const video = videos[v];
        if (!video || video.ms > to) break;
        const diff = Math.abs(video.ms - image.ms);
        if (diff === 0 || !differsInOneDigitRun(image.base, video.base)) continue;
        pairs.push({ image, video, diff });
      }
    }
  }

  pairs.sort((a, b) => a.diff - b.diff);
  const usedVideos = new Set<number>();
  const claim = (image: ProximityCandidate, video: ProximityCandidate): void => {
    if (toRemove.has(image.idx) || usedVideos.has(video.idx)) return;
    pairedThumbs.set(video.key, image.key);
    toRemove.add(image.idx);
    usedVideos.add(video.idx);
  };
  for (const { image, video } of pairs) if (video.ms <= image.ms) claim(image, video);
  for (const { image, video } of pairs) claim(image, video);
}

/**
 * `true` when `a` and `b` are the same length, not equal, and every
 * character from their first mismatch to their last is a digit in both —
 * i.e. the change sits inside one run of digits.
 */
function differsInOneDigitRun(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let first = 0;
  while (first < a.length && a[first] === b[first]) first++;
  if (first === a.length) return false;
  let last = a.length - 1;
  while (a[last] === b[last]) last--;
  return (
    ALL_DIGITS_RE.test(a.slice(first, last + 1)) && ALL_DIGITS_RE.test(b.slice(first, last + 1))
  );
}

/** Pair `media-source` items by their `id` URI, falling back to `dtMs` proximity. */
export function pairMediaSourceThumbnails<T extends MediaSourceLike>(
  items: readonly T[] | null | undefined
): PairResult<T> {
  return pairVideoThumbnails(
    items,
    (it) => it?.id,
    (it) => it?.dtMs
  );
}

/** Pair sensor items by their `src` file path, falling back to `dtMs` proximity. */
export function pairSensorItems<T extends SensorLike>(
  items: readonly T[] | null | undefined
): PairResult<T> {
  return pairVideoThumbnails(
    items,
    (it) => it?.src,
    (it) => it?.dtMs
  );
}

/**
 * Strip media-source/leading-slash noise off a path-ish string for
 * deduplication. Lowercased, trimmed, with collapsed consecutive slashes.
 *
 * The prefix-strip regex equates `media-source://media_source/<path>`,
 * `media-source://media_source` (no trailing slash), and bare `<path>`,
 * but preserves the root segment for other media-source URIs (Frigate,
 * etc.) so they don't collide with bare local paths.
 */
const MEDIA_SOURCE_PREFIX_RE = /^media-source:\/\/(?:media_source\/?)?/;
const MULTI_SLASH_RE = /\/{2,}/g;
const LEADING_SLASH_RE = /^\/+/;
const TRAILING_SLASH_RE = /\/+$/;

export function normalizeRelPath(idOrPath: unknown): string {
  return String(idOrPath ?? "")
    .replace(MEDIA_SOURCE_PREFIX_RE, "")
    .replace(MULTI_SLASH_RE, "/")
    .replace(LEADING_SLASH_RE, "")
    .replace(TRAILING_SLASH_RE, "")
    .trim()
    .toLowerCase();
}

/**
 * Loose shape covering every kind of item that may end up in a deduped list:
 * media-source records (`media_content_id`), media-source items (`id`),
 * generic items (`path`), or sensor file paths (`src`).
 */
interface DedupableItem {
  media_content_id?: string | null;
  path?: string | null;
  id?: string | null;
  src?: string | null;
}

/**
 * Dedupe items by normalized rel-path. First occurrence wins; later items
 * with the same key are dropped (preserves source-mode priority when the
 * caller has already concatenated lists in the desired order).
 *
 * Accepts strings or objects with `media_content_id` / `path` / `id` /
 * `src`. Items that produce an empty key after normalization are dropped.
 * `null` / `undefined` input returns an empty array.
 */
export function dedupeByRelPath<T>(items: readonly T[] | null | undefined): T[] {
  if (!Array.isArray(items)) return [];
  const seen = new Map<string, T>();
  for (const it of items) {
    let candidate: unknown;
    if (it === null || it === undefined) {
      candidate = "";
    } else if (typeof it === "string") {
      candidate = it;
    } else {
      const obj = it as DedupableItem;
      // Truthy fallthrough (||, not ??) — empty strings on one field should
      // fall through to the next, matching the legacy `_dedupeByRelPath`
      // shape. Final `|| it` lets a stringified item itself act as the key.
      candidate = obj.media_content_id || obj.path || obj.id || obj.src || it;
    }
    const key = normalizeRelPath(candidate);
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, it as T);
  }
  return Array.from(seen.values());
}
