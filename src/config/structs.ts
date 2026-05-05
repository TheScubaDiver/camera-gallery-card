/**
 * Superstruct validators for `CameraGalleryCardConfig`.
 *
 * The struct describes the *canonical* shape — the form `this.config` takes
 * after normalization. Legacy-key migrations (`entity` → `entities`,
 * `media_source` → `media_sources`, etc.) and the loose `object_filters`
 * `string | {name: icon}` input shape live in `./normalize.ts`'s pre-migrate
 * step, not here, so validation errors reference the canonical shape and
 * stay readable.
 *
 * `defaulted(...)` is used liberally; callers must use `create()` (not
 * `assert()`) to get defaults applied.
 */

import {
  array,
  boolean,
  defaulted,
  enums,
  integer,
  object,
  optional,
  record,
  refine,
  string,
  type,
} from "superstruct";
import type { Struct } from "superstruct";

import {
  ASPECT_RATIOS,
  AVAILABLE_OBJECT_FILTERS,
  BAR_OPACITY_MAX,
  BAR_OPACITY_MIN,
  BAR_POSITIONS,
  CONTROLS_MODES,
  DEFAULT_ALLOW_BULK_DELETE,
  DEFAULT_ALLOW_DELETE,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_AUTOMUTED,
  DEFAULT_AUTOPLAY,
  DEFAULT_BAR_OPACITY,
  DEFAULT_BAR_POSITION,
  DEFAULT_CONTROLS_MODE,
  DEFAULT_DELETE_CONFIRM,
  DEFAULT_DELETE_SERVICE,
  DEFAULT_LIVE_AUTO_MUTED,
  DEFAULT_LIVE_ENABLED,
  DEFAULT_MAX_MEDIA,
  DEFAULT_OBJECT_FIT,
  DEFAULT_PREVIEW_POSITION,
  DEFAULT_SOURCE_MODE,
  DEFAULT_THUMB_BAR_POSITION,
  DEFAULT_THUMB_LAYOUT,
  DEFAULT_THUMBNAIL_FRAME_PCT,
  DEFAULT_LIVE_LAYOUT,
  LIVE_LAYOUTS,
  MAX_MEDIA_MAX,
  MAX_MEDIA_MIN,
  OBJECT_FITS,
  CARD_HEIGHT_DEFAULT,
  CARD_HEIGHT_MAX,
  CARD_HEIGHT_MIN,
  PILL_SIZE_DEFAULT,
  PILL_SIZE_MAX,
  PILL_SIZE_MIN,
  PREVIEW_POSITIONS,
  SOURCE_MODES,
  START_MODES,
  THUMB_BAR_POSITIONS,
  THUMB_LAYOUTS,
  THUMB_SIZE,
  THUMB_SIZE_MAX,
  THUMB_SIZE_MIN,
  THUMBNAIL_FRAME_PCT_MAX,
  THUMBNAIL_FRAME_PCT_MIN,
} from "../const";

/**
 * Integer in [min, max]. Numeric range refinement on top of `integer()`.
 *
 * Returns a descriptive error string (not `false`) so the message says
 * "must be between 40 and 220" instead of falling back to the inner
 * `integer()` type name.
 */
const intInRange = (min: number, max: number): Struct<number, null> =>
  refine(integer(), `int[${min},${max}]`, (v) =>
    v >= min && v <= max ? true : `must be a number between ${min} and ${max} (got ${v})`
  );

/** HA service ID `domain.service` (lowercase, digits, underscore); empty string allowed. */
const serviceId = refine(string(), "service_id", (v) =>
  v === "" || /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(v)
    ? true
    : `must be in 'domain.service' form (got '${v}')`
);

/**
 * Single live-stream button entry.
 *
 * Stricter than the legacy filter: we require `url` to be a non-empty string.
 * Malformed entries (no url, wrong type) become validation errors instead of
 * being silently dropped — users with broken YAML now see a clear error.
 */
const nonEmptyString = refine(string(), "non_empty_string", (v) =>
  v.trim().length > 0 ? true : "must be a non-empty string"
);

const liveStreamUrlEntry = object({
  url: nonEmptyString,
  name: defaulted(string(), ""),
});

/** Menu button entry — same strictness rationale as `liveStreamUrlEntry`. */
const menuButton = object({
  entity: nonEmptyString,
  icon: nonEmptyString,
  icon_on: optional(string()),
  color_on: optional(string()),
  color_off: optional(string()),
  title: optional(string()),
  service: optional(string()),
  state_on: optional(string()),
});

/**
 * Canonical `CameraGalleryCardConfig` shape.
 *
 * Every field is either `defaulted()` (always present after `create()`) or
 * `optional()` (nullable). Cross-field rules — source-mode auto-inference,
 * delete gating, datetime-format requirement — live in `normalize.ts`, not
 * here, because superstruct can't conditionally require fields.
 *
 * `type()` (not `object()`) at the top level so legacy keys we don't know
 * about don't trip validation. Pre-migrate strips known legacy keys; any
 * remaining unknowns get silently ignored. Nested objects (`liveStreamUrlEntry`,
 * `menuButton`) stay strict so typos in those structures are visible.
 */
export const cameraGalleryCardConfigStruct = type({
  type: defaulted(string(), "custom:camera-gallery-card"),

  // ─── Source mode ───────────────────────────────────────────
  source_mode: defaulted(enums(SOURCE_MODES), DEFAULT_SOURCE_MODE),

  // ─── Sensor source ─────────────────────────────────────────
  entities: defaulted(array(string()), []),

  // ─── Media source ──────────────────────────────────────────
  media_sources: defaulted(array(string()), []),
  frigate_url: optional(string()),

  // ─── Datetime parsing ──────────────────────────────────────
  filename_datetime_format: defaulted(string(), ""),
  folder_datetime_format: defaulted(string(), ""),

  // ─── Playback ──────────────────────────────────────────────
  autoplay: defaulted(boolean(), DEFAULT_AUTOPLAY),
  auto_muted: defaulted(boolean(), DEFAULT_AUTOMUTED),

  // ─── Live preview ──────────────────────────────────────────
  live_enabled: defaulted(boolean(), DEFAULT_LIVE_ENABLED),
  live_auto_muted: defaulted(boolean(), DEFAULT_LIVE_AUTO_MUTED),
  live_camera_entity: defaulted(string(), ""),
  live_camera_entities: defaulted(array(string()), []),
  live_layout: defaulted(enums(LIVE_LAYOUTS), DEFAULT_LIVE_LAYOUT),
  live_grid_labels: defaulted(boolean(), true),
  live_stream_url: optional(string()),
  live_stream_name: optional(string()),
  live_stream_urls: optional(array(liveStreamUrlEntry)),
  live_go2rtc_url: optional(string()),
  live_go2rtc_stream: optional(string()),
  start_mode: defaulted(enums(START_MODES), "gallery"),

  // ─── Delete ────────────────────────────────────────────────
  allow_delete: defaulted(boolean(), DEFAULT_ALLOW_DELETE),
  allow_bulk_delete: defaulted(boolean(), DEFAULT_ALLOW_BULK_DELETE),
  delete_confirm: defaulted(boolean(), DEFAULT_DELETE_CONFIRM),
  delete_service: defaulted(serviceId, DEFAULT_DELETE_SERVICE),

  // ─── Object filters ────────────────────────────────────────
  // The loose `string | { name: icon }` input shape is unwrapped in
  // `normalize.ts`'s pre-migrate step, which splits it into:
  //   - `object_filters: string[]` (just the canonical names, here)
  //   - `customIcons: Record<string, string>` (returned alongside the config)
  object_filters: defaulted(array(enums(AVAILABLE_OBJECT_FILTERS)), []),
  object_colors: defaulted(record(string(), string()), {}),
  entity_filter_map: defaulted(record(string(), enums(AVAILABLE_OBJECT_FILTERS)), {}),

  // ─── Layout / styling ──────────────────────────────────────
  bar_opacity: defaulted(intInRange(BAR_OPACITY_MIN, BAR_OPACITY_MAX), DEFAULT_BAR_OPACITY),
  bar_position: defaulted(enums(BAR_POSITIONS), DEFAULT_BAR_POSITION),
  thumb_size: defaulted(intInRange(THUMB_SIZE_MIN, THUMB_SIZE_MAX), THUMB_SIZE),
  thumb_bar_position: defaulted(enums(THUMB_BAR_POSITIONS), DEFAULT_THUMB_BAR_POSITION),
  thumb_layout: defaulted(enums(THUMB_LAYOUTS), DEFAULT_THUMB_LAYOUT),
  thumbnail_frame_pct: defaulted(
    intInRange(THUMBNAIL_FRAME_PCT_MIN, THUMBNAIL_FRAME_PCT_MAX),
    DEFAULT_THUMBNAIL_FRAME_PCT
  ),
  pill_size: defaulted(intInRange(PILL_SIZE_MIN, PILL_SIZE_MAX), PILL_SIZE_DEFAULT),
  card_height: defaulted(intInRange(CARD_HEIGHT_MIN, CARD_HEIGHT_MAX), CARD_HEIGHT_DEFAULT),
  aspect_ratio: defaulted(enums(ASPECT_RATIOS), DEFAULT_ASPECT_RATIO),
  object_fit: defaulted(enums(OBJECT_FITS), DEFAULT_OBJECT_FIT),
  controls_mode: defaulted(enums(CONTROLS_MODES), DEFAULT_CONTROLS_MODE),
  style_variables: defaulted(string(), ""),
  show_camera_title: defaulted(boolean(), true),
  persistent_controls: defaulted(boolean(), false),
  debug_enabled: defaulted(boolean(), false),

  // ─── Preview ───────────────────────────────────────────────
  preview_position: defaulted(enums(PREVIEW_POSITIONS), DEFAULT_PREVIEW_POSITION),
  clean_mode: defaulted(boolean(), false),
  preview_close_on_tap: defaulted(boolean(), false),

  // ─── Misc ──────────────────────────────────────────────────
  max_media: defaulted(intInRange(MAX_MEDIA_MIN, MAX_MEDIA_MAX), DEFAULT_MAX_MEDIA),
  sync_entity: optional(string()),
  menu_buttons: defaulted(array(menuButton), []),
});

export type CameraGalleryCardConfigStruct = typeof cameraGalleryCardConfigStruct;
