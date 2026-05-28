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
  union,
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
  DEFAULT_ASPECT_RATIO,
  DEFAULT_AUTOMUTED,
  DEFAULT_AUTOPLAY,
  DEFAULT_BAR_OPACITY,
  DEFAULT_THUMB_OFF_OPACITY,
  DEFAULT_BAR_POSITION,
  DEFAULT_FRIGATE_THUMB_BBOX,
  DEFAULT_FRIGATE_EVENT_CLUSTER,
  DEFAULT_FRIGATE_EVENT_CLUSTER_GAP_SEC,
  FRIGATE_EVENT_CLUSTER_GAP_SEC_MAX,
  FRIGATE_EVENT_CLUSTER_GAP_SEC_MIN,
  DEFAULT_CONTROLS_MODE,
  DEFAULT_DELETE_CONFIRM,
  DEFAULT_DELETE_SERVICE,
  DEFAULT_LIVE_AUTO_MUTED,
  DEFAULT_LIVE_ENABLED,
  DEFAULT_LIVE_MIC_AUTO_GAIN_CONTROL,
  DEFAULT_LIVE_MIC_ECHO_CANCELLATION,
  DEFAULT_LIVE_MIC_MODE,
  DEFAULT_LIVE_MIC_NOISE_SUPPRESSION,
  DEFAULT_LIVE_PTZ_ENABLED,
  DEFAULT_LIVE_PTZ_POSITION,
  DEFAULT_MAX_MEDIA,
  DEFAULT_OBJECT_FIT,
  DEFAULT_PREVIEW_POSITION,
  DEFAULT_SOURCE_MODE,
  DEFAULT_THUMB_BAR_POSITION,
  DEFAULT_THUMB_LAYOUT,
  DEFAULT_THUMB_SORT_ORDER,
  DEFAULT_THUMBNAIL_FRAME_PCT,
  DEFAULT_LIVE_LAYOUT,
  LIVE_LAYOUTS,
  MIC_MODES,
  PTZ_SPEED_DEFAULT,
  PTZ_SPEED_MAX,
  PTZ_SPEED_MIN,
  PTZ_POSITIONS,
  PTZ_TYPES,
  MAX_MEDIA_MAX,
  MAX_MEDIA_MIN,
  OBJECT_FITS,
  CARD_HEIGHT_DEFAULT,
  CARD_HEIGHT_MAX,
  CARD_HEIGHT_MIN,
  PILL_SIZE_DEFAULT,
  PILL_SIZE_MAX,
  PILL_SIZE_MIN,
  ROW_GAP_DEFAULT,
  ROW_GAP_MAX,
  ROW_GAP_MIN,
  PREVIEW_POSITIONS,
  SOURCE_MODES,
  START_MODES,
  THUMB_BAR_POSITIONS,
  THUMB_LAYOUTS,
  THUMB_SORT_ORDERS,
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

/**
 * One entry in the unified `live_cameras` list (issue #137 — Erik's
 * proposal to collapse `live_camera_entities` + `live_stream_urls` +
 * `live_mic_streams` into one shape). An entry is either an HA-entity
 * camera or an RTSP-stream camera; per-camera config (mic, name override,
 * future knobs) lives inline on the same entry — no more fragile
 * `__cgc_stream_<N>__` synthetic ids in a sidecar map.
 *
 * The cross-field rule that *exactly one* of `entity` / `url` is set is
 * enforced in `normalize.ts` (superstruct can't conditionally require).
 */
/**
 * Per-camera crop rectangle expressed as percentages of the source frame.
 * Lets the live overlay zoom into a region of interest (e.g. show only the
 * doormat of a wide-angle camera). All four fields are 0–100; absence of
 * `crop` (or any field set to default 0 width/height) means no crop.
 *
 *   x, y  — top-left corner of the visible region, in % from top-left
 *   w, h  — width / height of the visible region, in %
 */
const liveCameraCrop = object({
  x: defaulted(intInRange(0, 100), 0),
  y: defaulted(intInRange(0, 100), 0),
  w: defaulted(intInRange(0, 100), 100),
  h: defaulted(intInRange(0, 100), 100),
  // Source aspect ratio detected when the user saved the crop. Used at
  // runtime to resize the live container so the crop region fills it
  // without distortion. Format: "W/H" (e.g. "16/9", "4/3"). Optional —
  // legacy crops without this field fall back to "16/9".
  source_ar: optional(string()),
});

const liveCameraEntry = object({
  entity: optional(string()),
  url: optional(string()),
  name: defaulted(string(), ""),
  mic: optional(string()),
  crop: optional(liveCameraCrop),
});

/**
 * One row in the configurable-pill layout. `order` is a signed integer
 * — lower renders earlier. Pills with the same order tie-break on the
 * catalog's natural order. Default order for pills not mentioned in
 * `gallery_pills` lives in `data/pill-catalog.ts` (spaced by 10 so
 * users can wedge a new pill between defaults without renumbering).
 */
const galleryPillEntry = object({
  enabled: defaulted(boolean(), true),
  order: defaulted(integer(), 0),
});

/**
 * Per-toggle Web Audio constraints for the mic. All three flags default to
 * `true` at the read site (in `webrtc-mic.ts`) so the user only needs to
 * write the keys they want to opt out of. Strict nested object — typos in
 * the keys become validation errors.
 */
const liveMicAudioProcessing = object({
  echo_cancellation: defaulted(boolean(), DEFAULT_LIVE_MIC_ECHO_CANCELLATION),
  noise_suppression: defaulted(boolean(), DEFAULT_LIVE_MIC_NOISE_SUPPRESSION),
  auto_gain_control: defaulted(boolean(), DEFAULT_LIVE_MIC_AUTO_GAIN_CONTROL),
});

/**
 * Single ICE server entry (STUN / TURN). `urls` is `string | string[]` per
 * the WebRTC spec. `username` / `credential` are required for TURN.
 *
 * Advanced — most users get along fine with the built-in STUN/TURN.
 * Self-hosted Coturn or other private TURN setups need this override.
 */
const liveMicIceServer = object({
  urls: union([string(), array(string())]),
  username: optional(string()),
  credential: optional(string()),
});

/**
 * One free-form HA service call used as a per-direction override. `service`
 * is validated as a non-empty string (not the strict `domain.service`
 * regex) so users can paste templated services without tripping
 * validation; `data` / `target` are forwarded as-is to `hass.callService`.
 */
const ptzServiceCall = object({
  service: nonEmptyString,
  data: optional(record(string(), string())),
  target: optional(
    object({
      entity_id: optional(union([string(), array(string())])),
    })
  ),
});

/**
 * Start + (optional) stop pair for one direction. Continuous-type
 * overrides supply both; pulse-type overrides supply only `start` and the
 * dispatcher no-ops stop the way EZVIZ does natively.
 */
const ptzActionPair = object({
  start: ptzServiceCall,
  stop: optional(ptzServiceCall),
});

/**
 * Per-direction overrides. Each is optional — directions without an
 * override fall through to the type-specific built-in dispatcher
 * (auto-detected button entity for EZVIZ/Reolink, `frigate.ptz` for
 * Frigate, `onvif.ptz` for ONVIF). Home is one-shot and only takes a
 * `start`.
 */
const ptzActions = object({
  up: optional(ptzActionPair),
  down: optional(ptzActionPair),
  left: optional(ptzActionPair),
  right: optional(ptzActionPair),
  zoom_in: optional(ptzActionPair),
  zoom_out: optional(ptzActionPair),
  home: optional(object({ start: ptzServiceCall })),
});

/**
 * Per-camera manual button map (the "manual-first" path). Each value is the
 * full entity id the dispatcher should drive for that action — a `button.*`
 * for pan/zoom/stop, a `select.*_ptz_preset` for home. Set by the editor's
 * per-button pickers; an empty/absent key falls back to auto-derivation.
 *
 * This is the simple cousin of `actions`: `buttons` is "press this entity",
 * `actions` is "call this arbitrary service". `actions` still wins when both
 * are set for the same key.
 */
const ptzButtons = object({
  up: optional(string()),
  down: optional(string()),
  left: optional(string()),
  right: optional(string()),
  zoom_in: optional(string()),
  zoom_out: optional(string()),
  stop: optional(string()),
  home: optional(string()),
});

/**
 * Per-camera PTZ config. `type` selects the command dispatcher.
 * `speed` is optional: when absent the dispatcher falls back to the
 * global `live_ptz_speed`. Range is clamped to [1, 9] (the EZVIZ
 * window); out-of-range values are validation errors rather than
 * silent no-ops at the integration boundary.
 *
 * `actions` is the YAML escape hatch — when set, the named direction
 * (or zoom / home) is dispatched via the user-supplied service call
 * instead of the built-in dispatcher. Useful for cameras that don't
 * match one of the supported types (Foscam, Tapo without ONVIF, custom
 * scripts, …).
 */
// `type({...})` (not `object({...})`) so legacy `presets` entries from
// previously-saved YAML get silently ignored instead of tripping
// validation. We don't migrate-then-strip because the field is fully
// removed downstream — there's nothing to preserve.
const ptzCamera = type({
  type: defaulted(enums(PTZ_TYPES), "ezviz"),
  /**
   * Override for the auto-derived EZVIZ button-entity prefix. Set to the
   * `button.<base>` prefix (no trailing `_ptz_<dir>`) when your install
   * has renamed the buttons away from the default `button.<camera_base>_*`
   * pattern. Empty / absent triggers auto-derivation from the camera
   * entity id.
   */
  button_prefix: optional(string()),
  speed: optional(intInRange(PTZ_SPEED_MIN, PTZ_SPEED_MAX)),
  actions: optional(ptzActions),
  buttons: optional(ptzButtons),
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
  frigate_thumb_bbox: defaulted(boolean(), DEFAULT_FRIGATE_THUMB_BBOX),
  frigate_event_cluster: defaulted(boolean(), DEFAULT_FRIGATE_EVENT_CLUSTER),
  frigate_event_cluster_gap_sec: defaulted(
    intInRange(FRIGATE_EVENT_CLUSTER_GAP_SEC_MIN, FRIGATE_EVENT_CLUSTER_GAP_SEC_MAX),
    DEFAULT_FRIGATE_EVENT_CLUSTER_GAP_SEC
  ),

  // ─── Datetime parsing ──────────────────────────────────────
  // Single format that matches the path tail. `/`-separated segments map
  // to directory levels with the leaf segment matching the filename
  // (e.g. `YYYY/MM/DD/HHmmss`). Replaces the legacy folder+filename pair.
  path_datetime_format: defaulted(string(), ""),

  // ─── Gallery toolbar button visibility ────────────────────
  // Per-button toggles for the gallery toolbar (Today, media-filter,
  // favorite, LIVE). Defaults to visible. `show_media_filter` only takes
  // effect when the gallery actually contains both video and image clips
  // (the underlying filter is hidden otherwise).
  show_favorite: defaulted(boolean(), true),
  show_live: defaulted(boolean(), true),
  show_today: defaulted(boolean(), true),
  show_media_filter: defaulted(boolean(), true),

  // Sparse order overrides for the toolbar buttons. Keys are ids from
  // `TOOLBAR_CATALOG` (`src/data/pill-catalog.ts`); buttons without an
  // entry use their catalog default. Enabled state still lives in the
  // existing `show_*` keys above for backwards compatibility.
  toolbar_order: defaulted(record(string(), integer()), {}),

  // ─── Configurable pill overlay (gallery) ──────────────────
  // Sparse overrides for the pill row that floats over the preview.
  // Keys are pill ids defined in `GALLERY_PILL_CATALOG`
  // (`src/data/pill-catalog.ts`); unset pills fall back to their built-in
  // defaults. The render dispatcher iterates the catalog and applies
  // these overrides — so YAML only needs to mention pills the user
  // actually wants to change.
  gallery_pills: defaulted(record(string(), galleryPillEntry), {}),

  // Alignment of the pill row inside the overlay strip — `left`,
  // `center`, or `right`. Only meaningful in overlay-mode (in fixed
  // mode pills already stretch to fill the bar evenly).
  gallery_pills_align: defaulted(enums(["left", "center", "right"]), "center"),

  // ─── Configurable pill overlay (live view) ────────────────
  // Sparse overrides for the always-available live pills (mute, PiP,
  // fullscreen, refresh). Pills with their own visibility gate (picker,
  // hamburger, PTZ, diagnostics) stay hardcoded — they don't appear in
  // this catalog. Keys are pill ids defined in `LIVE_PILL_CATALOG`.
  //
  // Layout is fixed: camera-name stays left, action pills stay right —
  // no alignment knob (intentionally). Drop the key entirely if the user
  // hasn't touched any pill.
  live_pills: defaulted(record(string(), galleryPillEntry), {}),

  // ─── Playback ──────────────────────────────────────────────
  autoplay: defaulted(boolean(), DEFAULT_AUTOPLAY),
  auto_muted: defaulted(boolean(), DEFAULT_AUTOMUTED),

  // ─── Live preview ──────────────────────────────────────────
  live_enabled: defaulted(boolean(), DEFAULT_LIVE_ENABLED),
  live_auto_muted: defaulted(boolean(), DEFAULT_LIVE_AUTO_MUTED),
  // Show the left/right chevron arrows that switch cameras when ≥2 are
  // configured. Defaults to on. Disable for a clean kiosk look.
  live_chevrons_enabled: defaulted(boolean(), true),
  // Gallery preview navigation chevrons — left/right arrows that walk
  // through the filtered clip list while the preview is open. Same
  // default-on / kiosk-off pattern as the live chevrons.
  gallery_chevrons_enabled: defaulted(boolean(), true),
  // Unified camera list (issue #137). When non-empty, this is the
  // canonical source of truth; the legacy keys below are populated by the
  // pre-migrate step from `live_cameras` (or vice-versa for old configs)
  // and consumers should read `live_cameras` directly.
  live_cameras: defaulted(array(liveCameraEntry), []),
  live_camera_entities: defaulted(array(string()), []),
  live_layout: defaulted(enums(LIVE_LAYOUTS), DEFAULT_LIVE_LAYOUT),
  live_grid_labels: defaulted(boolean(), true),
  live_stream_url: optional(string()),
  live_stream_name: optional(string()),
  live_stream_urls: optional(array(liveStreamUrlEntry)),
  live_go2rtc_url: optional(string()),
  live_go2rtc_stream: optional(string()),
  live_mic_mode: defaulted(enums(MIC_MODES), DEFAULT_LIVE_MIC_MODE),
  live_mic_audio_processing: optional(liveMicAudioProcessing),
  // Per-camera mic backchannel map. Keys are camera entity ids
  // (`camera.front_door`) or synthetic stream ids (`__cgc_stream_0__`).
  // Values must be non-empty go2rtc stream names. Cameras absent from the
  // map have no mic pill — the editor removes a key entirely when its
  // input is cleared (rather than writing `""`), so the empty-string case
  // shouldn't reach this struct in practice.
  //
  // Replaces the legacy single-global `live_go2rtc_stream` — the resolver
  // in `live-config.ts` falls back to that string only when the map is
  // entirely empty, so existing single-camera setups keep working
  // without invading multi-camera setups.
  live_mic_streams: defaulted(record(string(), nonEmptyString), {}),
  // Advanced ICE config. Most setups don't need these — defaults work over
  // residential NAT. Power users with a private TURN (Coturn etc.) or
  // aggressive symmetric NAT use these to override.
  live_mic_ice_servers: optional(array(liveMicIceServer)),
  live_mic_force_relay: defaulted(boolean(), false),
  // Talkback waveform visualizer — frequency-bars overlay on the talkback
  // bar while the mic is `active`. Just an on/off + three sensitivity
  // presets; style and opacity are hard-coded for a consistent look.
  live_mic_waveform_enabled: defaulted(boolean(), true),
  live_mic_waveform_sensitivity: defaulted(enums(["low", "medium", "high"]), "medium"),

  // ─── Live PTZ (pan/tilt + presets) ─────────────────────────
  // Per-camera map keyed by camera entity id; values configure the
  // command dispatcher + presets. Cameras absent from the map have
  // no PTZ overlay. `live_ptz_enabled` is a global kill-switch so users
  // can hide the overlay without losing their per-camera config.
  live_ptz_enabled: defaulted(boolean(), DEFAULT_LIVE_PTZ_ENABLED),
  live_ptz_position: defaulted(enums(PTZ_POSITIONS), DEFAULT_LIVE_PTZ_POSITION),
  live_ptz_speed: defaulted(intInRange(PTZ_SPEED_MIN, PTZ_SPEED_MAX), PTZ_SPEED_DEFAULT),
  live_ptz_cameras: defaulted(record(string(), ptzCamera), {}),
  start_mode: defaulted(enums(START_MODES), "gallery"),

  // ─── Delete ────────────────────────────────────────────────
  allow_bulk_delete: defaulted(boolean(), DEFAULT_ALLOW_BULK_DELETE),
  delete_confirm: defaulted(boolean(), DEFAULT_DELETE_CONFIRM),
  delete_service: defaulted(serviceId, DEFAULT_DELETE_SERVICE),
  frigate_delete_service: defaulted(serviceId, ""),

  // ─── Object filters ────────────────────────────────────────
  // The loose `string | { name: icon }` input shape is unwrapped in
  // `normalize.ts`'s pre-migrate step, which splits it into:
  //   - `object_filters: string[]` (canonical names + user-defined customs)
  //   - `customIcons: Record<string, string>` (returned alongside the config)
  object_filters: defaulted(array(string()), []),
  object_colors: defaulted(record(string(), string()), {}),
  entity_filter_map: defaulted(record(string(), enums(AVAILABLE_OBJECT_FILTERS)), {}),

  // ─── Layout / styling ──────────────────────────────────────
  bar_opacity: defaulted(intInRange(BAR_OPACITY_MIN, BAR_OPACITY_MAX), DEFAULT_BAR_OPACITY),
  talkback_opacity: defaulted(intInRange(BAR_OPACITY_MIN, BAR_OPACITY_MAX), DEFAULT_BAR_OPACITY),
  chevron_opacity: defaulted(intInRange(BAR_OPACITY_MIN, BAR_OPACITY_MAX), DEFAULT_BAR_OPACITY),
  bar_position: defaulted(enums(BAR_POSITIONS), DEFAULT_BAR_POSITION),
  thumb_size: defaulted(intInRange(THUMB_SIZE_MIN, THUMB_SIZE_MAX), THUMB_SIZE),
  thumb_off_opacity: defaulted(
    intInRange(BAR_OPACITY_MIN, BAR_OPACITY_MAX),
    DEFAULT_THUMB_OFF_OPACITY
  ),
  thumb_bar_position: defaulted(enums(THUMB_BAR_POSITIONS), DEFAULT_THUMB_BAR_POSITION),
  thumb_layout: defaulted(enums(THUMB_LAYOUTS), DEFAULT_THUMB_LAYOUT),
  thumb_sort_order: defaulted(enums(THUMB_SORT_ORDERS), DEFAULT_THUMB_SORT_ORDER),
  thumbnail_frame_pct: defaulted(
    intInRange(THUMBNAIL_FRAME_PCT_MIN, THUMBNAIL_FRAME_PCT_MAX),
    DEFAULT_THUMBNAIL_FRAME_PCT
  ),
  // When false (default `true`), skip the expensive `<video>`
  // frame-extraction fallback and only display server-provided
  // thumbnails. Items without a server thumb stay on the placeholder
  // icon. Useful on slow / metered connections where pulling MB-scale
  // mp4 files just for one frame isn't worth the bandwidth.
  capture_video_thumbnails: defaulted(boolean(), true),
  pill_size: defaulted(intInRange(PILL_SIZE_MIN, PILL_SIZE_MAX), PILL_SIZE_DEFAULT),
  row_gap: defaulted(intInRange(ROW_GAP_MIN, ROW_GAP_MAX), ROW_GAP_DEFAULT),
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
