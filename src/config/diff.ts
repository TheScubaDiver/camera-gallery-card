/**
 * Pure config-diff helpers used by `setConfig` to decide whether the change
 * affects the data layer (re-fetch + cache invalidation), the UI only
 * (`requestUpdate` is enough), or both.
 *
 * Encoded once instead of three separate methods on the card class.
 */

import type { CameraGalleryCardConfig } from "./normalize";

type ConfigKey = keyof CameraGalleryCardConfig;

/**
 * Keys that, when changed, force the data layer to refetch and clear caches.
 * Stays in sync with PR 8's `MediaSourceClient` invalidation rules — when the
 * data clients land, they consume this same set.
 */
const SOURCE_KEYS = new Set<ConfigKey>([
  "allow_bulk_delete",
  "delete_confirm",
  "delete_service",
  "entities",
  "frigate_url",
  "max_media",
  "media_sources",
  // path_datetime_format is consumed by every dtMs/dayKey resolution. A
  // format change shifts how each item parses, so the poster + object
  // caches keyed off the old parses must be cleared along with the data
  // layer's invalidation. Without this the gallery showed ghost-day
  // posters after the user edited the format string.
  "path_datetime_format",
  "source_mode",
  "thumbnail_frame_pct",
]);

/**
 * Keys that only affect rendering (no cache invalidation needed). When
 * *every* changed key is in this set, the card just calls `requestUpdate`.
 *
 * Names match the canonical config shape in `structs.ts` — earlier copies of
 * this list carried `live_cameras` / `live_default_camera`, which never
 * existed on the canonical config and so were dead weight.
 */
const UI_ONLY_KEYS = new Set<ConfigKey>([
  "bar_opacity",
  "bar_position",
  "capture_video_thumbnails",
  "live_camera_entity",
  "live_camera_entities",
  "live_enabled",
  "object_filters",
  "clean_mode",
  "preview_close_on_tap",
  "preview_position",
  "pill_size",
  "thumb_bar_position",
  "thumb_layout",
  "thumb_size",
  "show_camera_title",
  "controls_mode",
]);

export interface ConfigDiff {
  changedKeys: ConfigKey[];
  isSourceChange: boolean;
  isUiOnly: boolean;
}

/**
 * Compare two values for "config equality". Validated `CameraGalleryCardConfig`
 * fields are JSON-serialisable (strings, numbers, booleans, arrays, plain
 * records), so a stringify compare is a precise-enough deep-equality check
 * without pulling in an `isEqual` dep.
 */
const fieldsEqual = <K extends ConfigKey>(
  prev: CameraGalleryCardConfig,
  next: CameraGalleryCardConfig,
  k: K
): boolean => JSON.stringify(prev[k]) === JSON.stringify(next[k]);

/** All keys present on either side, typed as `ConfigKey`. */
function unionKeys(prev: CameraGalleryCardConfig, next: CameraGalleryCardConfig): ConfigKey[] {
  const set = new Set<ConfigKey>();
  for (const k of Object.keys(prev) as ConfigKey[]) set.add(k);
  for (const k of Object.keys(next) as ConfigKey[]) set.add(k);
  return [...set];
}

/**
 * Diff two normalized configs. Returns the changed keys, plus the two
 * "is this a source-affecting change?" / "can we skip cache invalidation?"
 * flags consumed by the card's setConfig side-effect block.
 *
 * `prev = null` (first setConfig call) reports `isSourceChange: true` and
 * `isUiOnly: false` — the same semantics the legacy `_isSourceConfigChange`
 * had via the inline `prevConfig ? ... : true` pattern.
 */
export function configDiff(
  prev: CameraGalleryCardConfig | null,
  next: CameraGalleryCardConfig
): ConfigDiff {
  if (!prev) {
    return { changedKeys: [], isSourceChange: true, isUiOnly: false };
  }

  const changedKeys = unionKeys(prev, next).filter((k) => !fieldsEqual(prev, next, k));

  const isSourceChange = changedKeys.some((k) => SOURCE_KEYS.has(k));
  const isUiOnly = changedKeys.length > 0 && changedKeys.every((k) => UI_ONLY_KEYS.has(k));

  return { changedKeys, isSourceChange, isUiOnly };
}
