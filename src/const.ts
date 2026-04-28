/**
 * Hard-coded settings and configuration defaults.
 *
 * Public CSS variables (the `--cgc-*` styling API) live in styles, not here.
 */

// -------- Sensor / fileList ingestion --------
export const ATTR_NAME = "fileList";

// -------- Layout / dimensions --------
export const PREVIEW_WIDTH = "100%";

export const THUMBS_ENABLED = true;
export const THUMB_GAP = 2;
export const THUMB_RADIUS = 10;
export const THUMB_SIZE = 86;

// -------- Sensor poster generation --------
export const SENSOR_POSTER_CONCURRENCY = 8;
export const SENSOR_POSTER_QUEUE_LIMIT = 100;

// -------- Long-press gestures --------
export const THUMB_LONG_PRESS_MOVE_PX = 12;
export const THUMB_LONG_PRESS_MS = 520;

// -------- Object-filter UI --------
export const MAX_VISIBLE_OBJECT_FILTERS = 9;

/**
 * Canonical object-filter labels. Marked `as const` so `ObjectFilter` is a
 * string-literal union ("bicycle" | "bird" | ...) rather than `string[]`.
 */
export const AVAILABLE_OBJECT_FILTERS = [
  "bicycle",
  "bird",
  "bus",
  "car",
  "cat",
  "dog",
  "motorcycle",
  "person",
  "truck",
  "visitor",
] as const;

export type ObjectFilter = (typeof AVAILABLE_OBJECT_FILTERS)[number];

// -------- Config defaults (DEFAULT_*) --------
export const DEFAULT_ALLOW_BULK_DELETE = true;
export const DEFAULT_ALLOW_DELETE = true;
export const DEFAULT_AUTOMUTED = true;
export const DEFAULT_AUTOPLAY = false;
export const DEFAULT_BAR_OPACITY = 30;
export const DEFAULT_BROWSE_TIMEOUT_MS = 10000;
export const DEFAULT_CLEAN_MODE = false;
export const DEFAULT_DELETE_CONFIRM = true;
export const DEFAULT_DELETE_PREFIX = "/config/www/";
export const DEFAULT_DELETE_SERVICE = "";
export const DEFAULT_FILENAME_DATETIME_FORMAT = "";
export const DEFAULT_FRIGATE_API_LIMIT = 500;
export const DEFAULT_LIVE_AUTO_MUTED = true;
export const DEFAULT_LIVE_ENABLED = false;
export const DEFAULT_MAX_MEDIA = 50;
export const DEFAULT_PER_ROOT_MIN_LIMIT = 40;
export const DEFAULT_PREVIEW_CLOSE_ON_TAP_WHEN_GATED = true;
export const DEFAULT_PREVIEW_POSITION = "top"; // "top" | "bottom"
export const DEFAULT_RESOLVE_BATCH = 32;
export const DEFAULT_SOURCE_MODE = "sensor"; // "sensor" | "media" | "combined"
export const DEFAULT_THUMB_BAR_POSITION = "bottom"; // "bottom" | "top" | "hidden"
export const DEFAULT_THUMB_LAYOUT = "horizontal"; // "horizontal" | "vertical"
export const DEFAULT_THUMBNAIL_FRAME_PCT = 0; // 0% = first frame, 100% = last frame
export const DEFAULT_VISIBLE_OBJECT_FILTERS: readonly ObjectFilter[] = [];
export const DEFAULT_WALK_DEPTH = 6;

// -------- Inline-style fallbacks (used by render(), not styles.ts) --------
export const STYLE = {
  card_background: "rgba(var(--rgb-card-background-color, 255,255,255), 0.50)",
  card_padding: "4px 4px",
  preview_background: "rgba(var(--rgb-card-background-color, 255,255,255), 0.50)",
  topbar_margin: "0px",
  topbar_padding: "0px",
} as const;
