/**
 * Hard-coded settings and configuration defaults.
 *
 * Public CSS variables (the `--cgc-*` styling API) live in styles, not here.
 */

// -------- Literal unions for constrained string config values --------
// Allowed-value arrays are `as const` so the struct can validate against them
// and the literal types fall out of `[number]` indexing — no drift between the
// runtime checker and the type.

export const SOURCE_MODES = ["sensor", "media", "combined"] as const;
export const PREVIEW_POSITIONS = ["top", "bottom"] as const;
export const THUMB_BAR_POSITIONS = ["top", "bottom", "hidden"] as const;
export const THUMB_LAYOUTS = ["horizontal", "vertical"] as const;
export const BAR_POSITIONS = ["top", "bottom", "hidden"] as const;
export const START_MODES = ["gallery", "live"] as const;
export const OBJECT_FITS = ["cover", "contain"] as const;
export const CONTROLS_MODES = ["overlay", "fixed"] as const;
export const ASPECT_RATIOS = ["16:9", "4:3", "1:1"] as const;

export type SourceMode = (typeof SOURCE_MODES)[number];
export type PreviewPosition = (typeof PREVIEW_POSITIONS)[number];
export type ThumbBarPosition = (typeof THUMB_BAR_POSITIONS)[number];
export type ThumbLayout = (typeof THUMB_LAYOUTS)[number];
export type BarPosition = (typeof BAR_POSITIONS)[number];
export type StartMode = (typeof START_MODES)[number];
export type ObjectFit = (typeof OBJECT_FITS)[number];
export type ControlsMode = (typeof CONTROLS_MODES)[number];
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/** Public CSS-variable namespace — every styling API key is `--cgc-*`. */
export type CssVarKey = `--cgc-${string}`;

// -------- Sensor / fileList ingestion --------
export const ATTR_NAME = "fileList";

// -------- Layout / dimensions --------
export const PREVIEW_WIDTH = "100%";

export const THUMBS_ENABLED = true;
export const THUMB_GAP = 2;
export const THUMB_RADIUS = 10;
export const THUMB_SIZE = 86;

// -------- Numeric clamp ranges (used by both the struct and the editor sliders) --------
// Why these specific ranges:
//   THUMB_SIZE: under 40px chrome dominates the cell; above 220px the grid
//     stops fitting on phones in landscape.
//   PILL_SIZE:  pills double as touch targets — 10px is the smallest readable
//     dot, 28px is roughly the iOS/Android tap-target ceiling.
//   MAX_MEDIA:  the gallery virtualizes but each item costs ~10kB of poster
//     cache; 500 is the point where mobile Safari hits memory pressure.
//   FRAME_PCT, BAR_OPACITY: percentages, clamp to [0, 100].
export const THUMB_SIZE_MIN = 40;
export const THUMB_SIZE_MAX = 220;
export const PILL_SIZE_MIN = 10;
export const PILL_SIZE_MAX = 28;
export const PILL_SIZE_DEFAULT = 14;
export const MAX_MEDIA_MIN = 1;
export const MAX_MEDIA_MAX = 500;
export const THUMBNAIL_FRAME_PCT_MIN = 0;
export const THUMBNAIL_FRAME_PCT_MAX = 100;
export const BAR_OPACITY_MIN = 0;
export const BAR_OPACITY_MAX = 100;

// -------- Sensor poster generation --------
export const SENSOR_POSTER_CONCURRENCY = 8;
export const SENSOR_POSTER_QUEUE_LIMIT = 100;

// -------- Long-press gestures --------
export const THUMB_LONG_PRESS_MOVE_PX = 12;
export const THUMB_LONG_PRESS_MS = 520;

// -------- Datetime parsing --------

/**
 * Two-digit-year pivot. NVR firmwares write "24" for 2024, never "1924".
 * Files older than 2000 are not realistic for IP cameras; revisit if a
 * user reports legitimate 19xx dates.
 */
export const YEAR_2DIGIT_PIVOT = 2000;

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
export const DEFAULT_ASPECT_RATIO = "16:9" satisfies AspectRatio;
export const DEFAULT_BAR_OPACITY = 30;
export const DEFAULT_BAR_POSITION = "top" satisfies BarPosition;
export const DEFAULT_CONTROLS_MODE = "overlay" satisfies ControlsMode;
export const DEFAULT_BROWSE_TIMEOUT_MS = 10000;
export const DEFAULT_CLEAN_MODE = false;
export const DEFAULT_DELETE_CONFIRM = true;
export const DEFAULT_DELETE_PREFIX = "/config/www/";
/**
 * `DEFAULT_DELETE_PREFIX` after normalization: leading slash, no duplicate
 * slashes, trailing slash. Used by the delete-service shell-command path
 * builder.
 */
export const DELETE_PREFIX_NORMALIZED = ((): string => {
  const lead = DEFAULT_DELETE_PREFIX.startsWith("/")
    ? DEFAULT_DELETE_PREFIX
    : "/" + DEFAULT_DELETE_PREFIX;
  const noMulti = lead.replace(/\/{2,}/g, "/");
  return noMulti.endsWith("/") ? noMulti : noMulti + "/";
})();
export const DEFAULT_DELETE_SERVICE = "";
export const DEFAULT_FRIGATE_API_LIMIT = 500;
export const DEFAULT_LIVE_AUTO_MUTED = true;
export const DEFAULT_LIVE_ENABLED = false;
export const DEFAULT_MAX_MEDIA = 50;
export const DEFAULT_OBJECT_FIT = "cover" satisfies ObjectFit;
export const DEFAULT_PER_ROOT_MIN_LIMIT = 40;
export const DEFAULT_PREVIEW_CLOSE_ON_TAP_WHEN_GATED = true;
export const DEFAULT_PREVIEW_POSITION = "top" satisfies PreviewPosition;
export const DEFAULT_RESOLVE_BATCH = 32;
export const DEFAULT_SOURCE_MODE = "sensor" satisfies SourceMode;
export const DEFAULT_THUMB_BAR_POSITION = "bottom" satisfies ThumbBarPosition;
export const DEFAULT_THUMB_LAYOUT = "horizontal" satisfies ThumbLayout;
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
