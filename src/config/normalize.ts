/**
 * Config normalization pipeline.
 *
 *   raw user YAML (typed `unknown` — only at the module boundary)
 *     │
 *     ▼  asInputConfig() — single shape narrow into a typed `InputConfig`.
 *
 *   InputConfig
 *     │
 *     ├── migrateLegacyKeys()    legacy keys → canonical keys.
 *     │
 *     ├── preMigrateConfig()     loose `object_filters` shape unwrap +
 *     │                          string-field trims + custom-icon side-output.
 *     ▼
 *   create(migrated, struct)     shape + range + enum validation, defaults.
 *     │
 *     ├── applyCrossFieldRules() source-mode auto-inference, delete gating,
 *     │                          datetime-format requirement, …
 *     ▼
 *   { config: CameraGalleryCardConfig, customIcons }
 *
 * Both card and editor call `normalizeConfig()`. The editor additionally
 * runs `_stripAlwaysTrueKeys` on the result for YAML-output minimization.
 */

import { create, StructError } from "superstruct";
import type { Infer } from "superstruct";

import { KNOWN_FILTERS } from "../data/object-filters";
import { FRIGATE_URI_PREFIX, hasFrigateConfig } from "../util/frigate";
import { cameraGalleryCardConfigStruct, type CameraGalleryCardConfigStruct } from "./structs";

// ─── Public types ────────────────────────────────────────────

export type CameraGalleryCardConfig = Infer<CameraGalleryCardConfigStruct>;

export interface NormalizedConfig {
  config: CameraGalleryCardConfig;
  /** Per-filter icon overrides extracted from the loose `object_filters` shape. */
  customIcons: Record<string, string>;
}

/**
 * One `object_filters` array entry, in the input shape. Either a canonical
 * filter name (`"person"`) or a single-key object pairing a filter name with
 * an MDI icon (`{ person: "mdi:walk" }`). The pre-migration step splits this
 * into a clean `string[]` plus a `customIcons` side-output.
 */
export type ObjectFilterEntry = string | Record<string, string>;

/** A single live-stream button entry, in the input shape (validated by struct). */
export interface LiveStreamUrlEntryInput {
  url?: string;
  name?: string;
}

/** A single menu-button entry, in the input shape (validated by struct). */
export interface MenuButtonInput {
  entity?: string;
  icon?: string;
  icon_on?: string;
  color_on?: string;
  color_off?: string;
  title?: string;
  service?: string;
  state_on?: string;
}

/**
 * Loose YAML/storage input shape consumed by `normalizeConfig` / `migrateLegacyKeys`.
 *
 * Canonical fields are widened where the user may write looser values
 * (e.g. `entities: "sensor.cam"` instead of an array). Legacy aliases and a
 * handful of editor-managed always-true keys are listed too — pre-migration
 * deletes them.
 *
 * The struct (`structs.ts`) is the source of truth for the canonical shape;
 * `CameraGalleryCardConfig` is its `Infer<>` projection. After validation,
 * downstream code only sees `CameraGalleryCardConfig` — this `InputConfig`
 * is internal to the normalization layer.
 */
export interface InputConfig {
  // ─── Identity ──────────────────────────────────────────────
  type?: string;

  // ─── Source mode ───────────────────────────────────────────
  source_mode?: string;

  // ─── Sensor source ─────────────────────────────────────────
  entities?: string[] | string;

  // ─── Media source ──────────────────────────────────────────
  media_sources?: string[] | string;
  frigate_url?: string;

  // ─── Datetime parsing ──────────────────────────────────────
  path_datetime_format?: string;

  // ─── Playback ──────────────────────────────────────────────
  autoplay?: boolean;
  auto_muted?: boolean;

  // ─── Live preview ──────────────────────────────────────────
  live_enabled?: boolean;
  live_auto_muted?: boolean;
  live_camera_entity?: string;
  live_camera_entities?: string[];
  live_layout?: string;
  live_grid_labels?: boolean;
  live_stream_url?: string;
  live_stream_name?: string;
  live_stream_urls?: LiveStreamUrlEntryInput[];
  live_go2rtc_url?: string;
  live_go2rtc_stream?: string;
  live_mic_mode?: string;
  live_mic_audio_processing?: {
    echo_cancellation?: boolean;
    noise_suppression?: boolean;
    auto_gain_control?: boolean;
  };
  live_mic_streams?: Record<string, string>;
  live_mic_ice_servers?: Array<{
    urls?: string | string[];
    username?: string;
    credential?: string;
  }>;
  live_mic_force_relay?: boolean;
  start_mode?: string;

  // ─── Delete ────────────────────────────────────────────────
  allow_bulk_delete?: boolean;
  delete_confirm?: boolean;
  delete_service?: string;

  // ─── Object filters ────────────────────────────────────────
  object_filters?: ObjectFilterEntry[] | ObjectFilterEntry | null;
  object_colors?: Record<string, string>;
  entity_filter_map?: Record<string, string>;

  // ─── Layout / styling ──────────────────────────────────────
  bar_opacity?: number;
  talkback_opacity?: number;
  bar_position?: string;
  thumb_size?: number;
  thumb_bar_position?: string;
  thumb_layout?: string;
  thumb_sort_order?: string;
  thumbnail_frame_pct?: number;
  capture_video_thumbnails?: boolean;
  pill_size?: number;
  row_gap?: number;
  card_height?: number;
  aspect_ratio?: string;
  object_fit?: string;
  controls_mode?: string;
  style_variables?: string;
  show_camera_title?: boolean;
  persistent_controls?: boolean;
  debug_enabled?: boolean;

  // ─── Preview ───────────────────────────────────────────────
  preview_position?: string;
  clean_mode?: boolean;
  preview_close_on_tap?: boolean;

  // ─── Misc ──────────────────────────────────────────────────
  max_media?: number;
  sync_entity?: string | null;
  menu_buttons?: MenuButtonInput[];

  // ─── Legacy aliases (rewritten in pre-migrate) ────────────
  entity?: string;
  media_source?: string;
  media_folders_fav?: string[];
  media_folder_favorites?: string[];
  shell_command?: string;
  preview_click_to_open?: boolean;
  filename_datetime_format?: string; // → path_datetime_format
  folder_datetime_format?: string; //   → path_datetime_format

  // ─── Editor-managed always-true keys (deleted in pre-migrate) ─
  filter_folders_enabled?: boolean;
  live_provider?: string;
  media_folder_filter?: string;
}

/**
 * Module-boundary narrow: convert genuinely-untyped YAML input (from the
 * card's `setConfig` callback) into a typed `InputConfig`. This is the only
 * `unknown` boundary in the module — it shallow-clones the input so the
 * pipeline can mutate freely.
 */
function asInputConfig(raw: unknown): InputConfig {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as InputConfig) };
  }
  return {};
}

/** Keys recognized as legacy aliases for canonical fields. */
const LEGACY_KEYS = [
  "entity",
  "media_source",
  "media_folder_favorites",
  "media_folders_fav",
  "shell_command",
  "preview_click_to_open",
  "filename_datetime_format",
  "folder_datetime_format",
] as const satisfies readonly (keyof InputConfig)[];

export type LegacyKey = (typeof LEGACY_KEYS)[number];

export function hasLegacyKeys(raw: unknown): boolean {
  const obj = asInputConfig(raw);
  return LEGACY_KEYS.some((k) => k in obj);
}

/** Error thrown when validation fails. Preserves the underlying `StructError` as `cause`. */
export class ConfigValidationError extends Error {
  override readonly name = "ConfigValidationError";
  readonly cause: StructError;
  constructor(message: string, cause: StructError) {
    super(message);
    this.cause = cause;
  }
}

// ─── Pure helpers ────────────────────────────────────────────

/**
 * Map `transform` over `arr`, drop empty results, dedupe case-insensitively
 * (preserving the first-seen casing). Shared between sensor-entity and
 * media-root normalization since both follow the exact same pattern.
 */
function dedupeNormalized(arr: readonly string[], transform: (s: string) => string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of arr) {
    const v = transform(raw);
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** Coerce singular/array/nullish input into a string array for `dedupeNormalized`. */
function asStringArray(input: string[] | string | null | undefined, fallback = ""): string[] {
  if (Array.isArray(input)) return input;
  if (input) return [input];
  return fallback ? [fallback] : [];
}

/**
 * Normalize an array-or-singular sensor-entity input into a deduplicated,
 * trimmed string array. Case-insensitive dedup.
 */
function normalizeSensorEntities(
  input: string[] | string | null | undefined,
  fallbackSingle = ""
): string[] {
  return dedupeNormalized(asStringArray(input, fallbackSingle), (s) => s.trim());
}

/**
 * Canonicalize a single media-source root. Adds the `media-source://` and
 * `media_source/` prefixes when absent; rewrites `frigate/...` shortcuts
 * into the `media-source://frigate/...` form. Returns `""` for empty input.
 */
function normalizeMediaRoot(input: string | null | undefined): string {
  let v = (input ?? "").trim();
  if (!v) return "";

  const strip = (s: string): string => s.replace(/^\/+/, "").replace(/\/+$/, "");

  if (v.startsWith("media-source://")) {
    let rest = v
      .slice("media-source://".length)
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "");
    if (rest.startsWith("local/")) rest = `media_source/${rest}`;
    return `media-source://${rest}`;
  }

  v = strip(v);

  if (/^frigate(\/|$)/i.test(v)) {
    const rest = strip(v.replace(/^frigate/i, ""));
    return rest ? `${FRIGATE_URI_PREFIX}/${rest}` : FRIGATE_URI_PREFIX;
  }

  v = v.replace(/^media\//, "");
  return `media-source://media_source/${v}`;
}

/**
 * Canonicalize an array-or-singular media-source input. Deduplicates
 * (case-insensitive) and drops empty entries.
 */
function normalizeMediaRoots(input: string[] | string | null | undefined): string[] {
  return dedupeNormalized(asStringArray(input), normalizeMediaRoot);
}

// Re-export for tests + future callers; keep public surface stable.
export { normalizeSensorEntities, normalizeMediaRoot, normalizeMediaRoots };

// ─── Pre-migration ───────────────────────────────────────────

export interface MigratedConfig {
  /** The migrated input — what the editor stores, or what the card validates next. */
  migrated: InputConfig;
  /** True when at least one legacy key was rewritten. */
  hadLegacyKeys: boolean;
}

/**
 * Rewrite legacy-aliased keys to their canonical names. Used by both the
 * card (as the first step of `normalizeConfig`) and the editor (which
 * needs the same migrations but preserves the loose `object_filters` shape
 * to round-trip user icon choices through YAML).
 *
 * Idempotent: running it on already-canonical input flips no keys and
 * reports `hadLegacyKeys: false`.
 */
export function migrateLegacyKeys(raw: unknown): MigratedConfig {
  const out = asInputConfig(raw);
  let hadLegacyKeys = false;

  // entity → entities
  if (!Array.isArray(out.entities) && out.entity !== undefined) {
    out.entities = normalizeSensorEntities(out.entities, out.entity);
    hadLegacyKeys = true;
  } else if (out.entities !== undefined) {
    out.entities = normalizeSensorEntities(out.entities);
  }
  if ("entity" in out) {
    delete out.entity;
    hadLegacyKeys = true;
  }

  // media_source / media_folder_favorites / media_folders_fav → media_sources
  // The legacy aliases coexist with `media_sources`; first non-empty wins.
  const hasLegacyMedia =
    "media_source" in out || "media_folders_fav" in out || "media_folder_favorites" in out;
  const mediaCandidate: string[] | string | null =
    (Array.isArray(out.media_sources) ? out.media_sources : null) ??
    (Array.isArray(out.media_folders_fav) ? out.media_folders_fav : null) ??
    (Array.isArray(out.media_folder_favorites) ? out.media_folder_favorites : null) ??
    (typeof out.media_source === "string" ? [out.media_source] : null);
  if (mediaCandidate !== null || out.media_sources !== undefined) {
    out.media_sources = normalizeMediaRoots(mediaCandidate);
  }
  if (hasLegacyMedia) {
    delete out.media_source;
    delete out.media_folder_favorites;
    delete out.media_folders_fav;
    hadLegacyKeys = true;
  }

  // shell_command → delete_service (legacy alias; delete_service wins)
  if (out.delete_service === undefined && typeof out.shell_command === "string") {
    out.delete_service = out.shell_command;
  }
  if ("shell_command" in out) {
    delete out.shell_command;
    hadLegacyKeys = true;
  }

  // preview_click_to_open → clean_mode (legacy alias)
  if (out.clean_mode === undefined && out.preview_click_to_open !== undefined) {
    out.clean_mode = !!out.preview_click_to_open;
  }
  if ("preview_click_to_open" in out) {
    delete out.preview_click_to_open;
    hadLegacyKeys = true;
  }

  // folder_datetime_format + filename_datetime_format → path_datetime_format
  // The legacy two-format API mapped folder format to the immediate parent
  // directory and filename format to the file basename. The new single
  // path-format joins them with `/` so a path like `<root>/2026/04/30/x.mp4`
  // can be expressed as `YYYY/MM/DD/<filename>` — and the runtime parser
  // walks back through path segments rather than only looking at the
  // immediate parent. New value wins on conflict only when the user has
  // also set `path_datetime_format` directly; otherwise we synthesize.
  if (out.path_datetime_format === undefined || out.path_datetime_format === "") {
    const folder = String(out.folder_datetime_format ?? "").trim();
    const file = String(out.filename_datetime_format ?? "").trim();
    if (folder && file) out.path_datetime_format = `${folder}/${file}`;
    else if (folder) out.path_datetime_format = folder;
    else if (file) out.path_datetime_format = file;
  }
  if ("folder_datetime_format" in out) {
    delete out.folder_datetime_format;
    hadLegacyKeys = true;
  }
  if ("filename_datetime_format" in out) {
    delete out.filename_datetime_format;
    hadLegacyKeys = true;
  }

  // Editor-managed always-true keys that older YAML may carry. The struct's
  // top-level `type()` ignores unknowns, but stripping keeps the migrated
  // input tidy for downstream comparison.
  for (const k of ["filter_folders_enabled", "live_provider", "media_folder_filter"] as const) {
    if (k in out) {
      delete out[k];
      hadLegacyKeys = true;
    }
  }

  return { migrated: out, hadLegacyKeys };
}

interface PreMigrated {
  /** The migrated input, ready for `create(..., struct)`. */
  migrated: InputConfig;
  /** Custom icon overrides parsed out of `object_filters` entries. */
  customIcons: Record<string, string>;
}

/**
 * Trim an optional string field in-place. If the trimmed value is empty,
 * `delete` the key (not `obj[key] = undefined` — `exactOptionalPropertyTypes`
 * distinguishes "absent" from "present but undefined").
 */
function trimOptionalString<K extends keyof InputConfig>(
  obj: InputConfig,
  key: K,
  transform: (s: string) => string = (s) => s
): void {
  const v = obj[key];
  if (typeof v !== "string") return;
  const t = transform(v.trim());
  if (t === "") {
    delete obj[key];
  } else {
    // Type-safe write: `t` is a string, the field shape includes `string`.
    (obj[key] as string) = t;
  }
}

/**
 * The card's pre-migration: legacy-key rewrite **plus** loose-shape
 * unwrapping for `object_filters` and value-filtering for `entity_filter_map`.
 * Returns the canonical shape the struct expects, and the per-filter custom
 * icon map separated out for the card to consume.
 *
 * Mutates the supplied `InputConfig` in place; it's expected to be a fresh
 * shallow-clone produced by `asInputConfig()` upstream.
 */
function preMigrateConfig(input: InputConfig): PreMigrated {
  const { migrated: out } = migrateLegacyKeys(input);

  // frigate_url: trim + strip trailing slashes (struct accepts string but
  // canonical form has no trailing slash).
  trimOptionalString(out, "frigate_url", (s) => s.replace(/\/+$/, ""));

  // String fields the legacy code coerced via String(...).trim(). Empty
  // strings drop the key so `optional(...)` struct fields stay absent.
  trimOptionalString(out, "live_stream_url");
  trimOptionalString(out, "live_stream_name");
  trimOptionalString(out, "live_go2rtc_url");
  trimOptionalString(out, "live_go2rtc_stream");
  trimOptionalString(out, "sync_entity");

  // Defaulted-to-`""` string fields: trim, never delete.
  out.live_camera_entity = (out.live_camera_entity ?? "").trim();
  out.path_datetime_format = (out.path_datetime_format ?? "").trim();
  out.style_variables = (out.style_variables ?? "").trim();

  // live_camera_entities: trim + drop empties.
  const cams = out.live_camera_entities;
  if (cams !== undefined) {
    out.live_camera_entities = Array.isArray(cams)
      ? cams.map((s: string) => s.trim()).filter((s) => s.length > 0)
      : [];
  }

  // object_filters: unwrap the loose `string | {name: icon}` input shape into
  // a clean string array + a `customIcons` side-output. Custom names that are
  // not in `KNOWN_FILTERS` are kept as-is so users can add their own labels
  // (e.g. matching custom Frigate object types or filename tokens).
  const customIcons: Record<string, string> = {};
  const ofIn = out.object_filters;
  const ofRaw: ObjectFilterEntry[] = Array.isArray(ofIn) ? ofIn : ofIn ? [ofIn] : [];
  const ofOut: string[] = [];
  const ofSeen = new Set<string>();

  for (const item of ofRaw) {
    let name = "";
    let icon = "";
    if (typeof item === "string") {
      name = item.toLowerCase().trim();
    } else {
      const entries = Object.entries(item);
      const first = entries[0];
      if (first) {
        name = first[0].toLowerCase().trim();
        icon = first[1];
      }
    }
    if (!name || ofSeen.has(name)) continue;
    ofSeen.add(name);
    ofOut.push(name);
    if (icon) customIcons[name] = icon;
  }
  out.object_filters = ofOut;

  // entity_filter_map: filter to known filter names (silent-drop legacy values).
  if (out.entity_filter_map) {
    const cleaned: Record<string, string> = {};
    for (const [entityId, rawFilter] of Object.entries(out.entity_filter_map)) {
      // `noUncheckedIndexedAccess` widens the value type, so guard explicitly.
      if (typeof rawFilter !== "string") continue;
      const e = entityId.trim();
      const f = rawFilter.toLowerCase().trim();
      if (!e || !f || !KNOWN_FILTERS.has(f)) continue;
      cleaned[e] = f;
    }
    out.entity_filter_map = cleaned;
  }

  return { migrated: out, customIcons };
}

// ─── Cross-field rules ───────────────────────────────────────

/**
 * Auto-infer `source_mode` when the user left it blank: media-only configs
 * default to `"media"`, everything else defaults to `"sensor"`. An explicit
 * non-empty `source_mode` is always honoured.
 */
function inferSourceMode(
  explicit: boolean,
  validated: CameraGalleryCardConfig
): CameraGalleryCardConfig["source_mode"] {
  if (explicit) return validated.source_mode;
  const hasMedia = validated.media_sources.length > 0;
  const hasSensors = validated.entities.length > 0;
  return hasMedia && !hasSensors ? "media" : "sensor";
}

/**
 * `preview_close_on_tap` defaults to `true` when `clean_mode: true`, `false`
 * otherwise — but only when the user didn't set it explicitly. The struct
 * defaults the field to `false` unconditionally, so this rule kicks in when
 * the user didn't set it.
 */
function applyPreviewCloseOnTapDefault(
  explicit: boolean,
  config: CameraGalleryCardConfig
): CameraGalleryCardConfig {
  if (explicit) return config;
  return { ...config, preview_close_on_tap: config.clean_mode };
}

/**
 * Apply mode-aware delete gating: pure `media` mode can't delete (URIs
 * aren't filesystem paths), so the delete_service is cleared and the
 * bulk-select UI is suppressed. Other modes rely on `delete_service`
 * being empty to disable delete — no separate flag needed.
 */
function applyDeleteGating(config: CameraGalleryCardConfig): CameraGalleryCardConfig {
  if (config.source_mode === "media") {
    return {
      ...config,
      allow_bulk_delete: false,
      delete_service: "",
    };
  }
  return config;
}

/**
 * Mode-specific required-field checks. Throws a descriptive Error so the
 * card error overlay surfaces the user's mistake.
 */
function assertRequiredFields(config: CameraGalleryCardConfig): void {
  const { source_mode, entities, media_sources } = config;

  if (source_mode === "sensor" && !entities.length) {
    throw new Error(
      "camera-gallery-card: 'entity' or 'entities' is required in source_mode: sensor"
    );
  }
  if (source_mode === "combined") {
    if (!entities.length) {
      throw new Error(
        "camera-gallery-card: 'entity' or 'entities' is required in source_mode: combined"
      );
    }
    if (!media_sources.length) {
      throw new Error(
        "camera-gallery-card: 'media_source' or 'media_sources' is required in source_mode: combined"
      );
    }
  }
  if (source_mode === "media" && !media_sources.length) {
    throw new Error(
      "camera-gallery-card: 'media_source' OR 'media_sources' is required in source_mode: media"
    );
  }

  if (
    !config.path_datetime_format &&
    !hasFrigateConfig({
      frigate_url: config.frigate_url,
      media_sources: config.media_sources,
    })
  ) {
    throw new Error(
      "camera-gallery-card: 'path_datetime_format' is required so files can be grouped by date"
    );
  }
}

// ─── Public entry ────────────────────────────────────────────

/**
 * Validate and normalize raw card config (from YAML / Lovelace storage) into
 * the canonical `CameraGalleryCardConfig` shape, plus the per-filter custom
 * icon map.
 *
 * Throws `ConfigValidationError` (subclass of `Error`) for shape violations,
 * and a plain `Error` for cross-field rule violations.
 */
export function normalizeConfig(raw: unknown): NormalizedConfig {
  // Capture which keys were *explicitly set* before pre-migration mutates
  // the input — the cross-field rules need to know "user said X" vs
  // "field defaulted in".
  const input = asInputConfig(raw);
  const explicitSourceMode =
    typeof input.source_mode === "string" && input.source_mode.trim() !== "";
  const explicitPreviewCloseOnTap = "preview_close_on_tap" in input;

  const { migrated, customIcons } = preMigrateConfig(input);

  let validated: CameraGalleryCardConfig;
  try {
    validated = create(migrated, cameraGalleryCardConfigStruct);
  } catch (err) {
    if (err instanceof StructError) {
      throw new ConfigValidationError(
        `camera-gallery-card: invalid config — ${err.path.join(".") || "<root>"}: ${err.message}`,
        err
      );
    }
    throw err;
  }

  validated = {
    ...validated,
    source_mode: inferSourceMode(explicitSourceMode, validated),
  };
  validated = applyPreviewCloseOnTapDefault(explicitPreviewCloseOnTap, validated);
  validated = applyDeleteGating(validated);

  assertRequiredFields(validated);

  return { config: validated, customIcons };
}
