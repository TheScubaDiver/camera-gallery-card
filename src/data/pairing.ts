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
 * Sensor items key off `src` (file path); media-source items key off `id`
 * (media-source URI). The pair-by-stem heuristic is identical otherwise,
 * so `pairVideoThumbnails` is the generic implementation and the two
 * named exports are thin wrappers that pass the right accessor.
 */

const VIDEO_EXT_RE = /([^/]+)\.(mp4|webm|mov|m4v)$/i;
const IMAGE_EXT_RE = /([^/]+)\.(jpg|jpeg|png|webp)$/i;

/** Common shape for items that key off a media-source URI. */
export interface MediaSourceLike {
  id: string;
}

/** Common shape for items that key off a sensor file path. */
export interface SensorLike {
  src: string;
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
 * The resulting `items` preserves the input order; matched thumbnails are
 * removed. `pairedThumbs` keys/values are the raw `getKey` outputs.
 */
export function pairVideoThumbnails<T>(
  items: readonly T[] | null | undefined,
  getKey: (it: T) => string | undefined
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

  const filtered = toRemove.size ? items.filter((_, i) => !toRemove.has(i)) : [...items];
  return { items: filtered, pairedThumbs };
}

/** Pair `media-source` items by their `id` URI. */
export function pairMediaSourceThumbnails<T extends MediaSourceLike>(
  items: readonly T[] | null | undefined
): PairResult<T> {
  return pairVideoThumbnails(items, (it) => it?.id);
}

/** Pair sensor items by their `src` file path. */
export function pairSensorItems<T extends SensorLike>(
  items: readonly T[] | null | undefined
): PairResult<T> {
  return pairVideoThumbnails(items, (it) => it?.src);
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
