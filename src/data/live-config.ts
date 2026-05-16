/**
 * Pure config readers for the live-view surface.
 *
 * The card previously had six methods scattered across the class:
 *   `_getStreamEntries`, `_getStreamEntryById`, `_getLiveCameraOptions`,
 *   `_getAllLiveCameraEntities`, `_hasLiveConfig`, `_friendlyCameraName`.
 *
 * All read config + hass.states only — no DOM, no `requestUpdate`. Moving
 * them here makes the live-view picker schema reusable in the editor (PR 11).
 *
 * Note: `live_stream_url` (singular) is still a valid config shape — the
 * struct keeps it and `migrateLegacyKeys` does not collapse it into
 * `live_stream_urls`. See `getStreamEntries` for the fallback.
 */

import type { CameraGalleryCardConfig } from "../config/normalize";
import type { HassEntity } from "../types/hass";

/** A live-stream button (RTSP-go2rtc / HLS / etc. URL surfaced as a picker entry). */
export interface StreamEntry {
  /** Synthetic id `__cgc_stream_<n>__` — opaque to consumers. */
  id: string;
  url: string;
  name: string;
}

/** Synthetic id prefix that distinguishes stream entries from real camera entity ids. */
export const STREAM_ID_PREFIX = "__cgc_stream";

const STREAM_ID_LEGACY_ALIAS = "__cgc_stream__";

/**
 * Normalize the configured live stream URLs into a typed list. Honors both:
 *  - `live_stream_urls: [{url, name}, ...]` (canonical / current)
 *  - `live_stream_url: "..."` + `live_stream_name: "..."` (single-stream
 *    shorthand still accepted by the struct)
 *
 * Empty / malformed entries are dropped.
 */
export function getStreamEntries(
  config: CameraGalleryCardConfig | null | undefined
): StreamEntry[] {
  if (!config) return [];
  const urls = config.live_stream_urls;
  if (Array.isArray(urls) && urls.length > 0) {
    const out: StreamEntry[] = [];
    urls.forEach((entry, i) => {
      const url = String(entry?.url ?? "").trim();
      if (!url) return;
      const name = String(entry?.name ?? "").trim() || `Stream ${i + 1}`;
      out.push({ id: `${STREAM_ID_PREFIX}_${i}__`, url, name });
    });
    return out;
  }
  const single = String(config.live_stream_url ?? "").trim();
  if (single) {
    const name = String(config.live_stream_name ?? "").trim() || "Stream";
    return [{ id: `${STREAM_ID_PREFIX}_0__`, url: single, name }];
  }
  return [];
}

/**
 * Look up a stream entry by its synthetic id. Returns `null` when the id is
 * not a stream id, or no entry matches.
 *
 * The legacy `__cgc_stream__` (no trailing index) form falls back to the
 * first entry — preserved so older selections persist across config
 * reshuffles.
 */
export function getStreamEntryById(
  config: CameraGalleryCardConfig | null | undefined,
  id: string | null | undefined
): StreamEntry | null {
  const sid = String(id ?? "");
  if (!sid.startsWith(STREAM_ID_PREFIX)) return null;
  const entries = getStreamEntries(config);
  const exact = entries.find((e) => e.id === sid);
  if (exact) return exact;
  if (sid === STREAM_ID_LEGACY_ALIAS) return entries[0] ?? null;
  return null;
}

/**
 * Camera entity ids the gallery should expose in the picker — filtered to
 * `camera.*` entities the user explicitly allowed via `live_camera_entities`
 * AND that hass currently has state for. Sorted by friendly name using the
 * caller-supplied locale tag.
 *
 * `friendlyName` is injected so the caller can use the same memoized
 * lookup it uses for rendering (audit-fix #7: don't re-resolve locale per
 * entity inside the sort comparator).
 */
export function getAllLiveCameraEntities(opts: {
  config: CameraGalleryCardConfig | null | undefined;
  hassStates: Readonly<Record<string, HassEntity>> | null | undefined;
  localeTag: string | undefined;
  friendlyName: (entityId: string) => string;
}): string[] {
  const allowed = opts.config?.live_camera_entities;
  if (!Array.isArray(allowed) || allowed.length === 0) return [];
  const states = opts.hassStates ?? {};
  const allowSet = new Set(allowed);
  const out: string[] = [];
  for (const entityId of Object.keys(states)) {
    if (!entityId.startsWith("camera.")) continue;
    if (!allowSet.has(entityId)) continue;
    if (!states[entityId]) continue;
    out.push(entityId);
  }
  out.sort((a, b) =>
    opts
      .friendlyName(a)
      .toLowerCase()
      .localeCompare(opts.friendlyName(b).toLowerCase(), opts.localeTag)
  );
  return out;
}

/**
 * Full picker list = stream ids ++ camera entity ids. Order matters — streams
 * always come first so the user's preferred override appears at the top of
 * the carousel.
 */
export function getLiveCameraOptions(opts: {
  config: CameraGalleryCardConfig | null | undefined;
  hassStates: Readonly<Record<string, HassEntity>> | null | undefined;
  localeTag: string | undefined;
  friendlyName: (entityId: string) => string;
}): string[] {
  const streamIds = getStreamEntries(opts.config).map((e) => e.id);
  const entities = getAllLiveCameraEntities(opts);
  return [...streamIds, ...entities];
}

/**
 * `true` when the user has wired up enough live config that the live-view
 * mode is reachable. Mirrors the legacy `_hasLiveConfig` short-circuit.
 *
 * Callers pass pre-computed counts so this helper stays free of repeated
 * `getStreamEntries` / `getAllLiveCameraEntities` calls in tight loops.
 */
export function hasLiveConfig(opts: {
  config: CameraGalleryCardConfig | null | undefined;
  streamCount: number;
  cameraCount: number;
}): boolean {
  if (!opts.config?.live_enabled) return false;
  return opts.streamCount > 0 || opts.cameraCount > 0;
}

/**
 * Has the user configured at least one entry in the per-camera mic map?
 * Used by `micStreamForCamera` to decide whether the legacy single-global
 * fallback applies — once the map has any entry, it owns the namespace.
 */
function hasMicMapEntries(map: unknown): map is Record<string, string> {
  if (!map || typeof map !== "object") return false;
  for (const v of Object.values(map as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) return true;
  }
  return false;
}

/**
 * Resolve the go2rtc backchannel stream name for a specific camera (HA
 * entity id or synthetic stream id). Returns "" when no mic is configured
 * for that camera.
 *
 * Lookup order:
 *  1. **If `live_mic_streams` has any entry**, only the map applies —
 *     cameras absent from the map have no mic. This is the canonical
 *     mode for multi-camera setups: once you start filling the map, you
 *     own the mic surface for every camera.
 *  2. **If the map is empty / absent**, fall back to the legacy
 *     `live_go2rtc_stream` — applies globally to whichever camera is
 *     active. Preserves the original single-camera behavior for users
 *     who haven't migrated to the map yet.
 *
 * The split matters: previously the resolver fell back to legacy on every
 * per-key miss, which meant a user with one map entry + a legacy key
 * would see mic pills on every other camera too. Now the map is
 * authoritative the moment it's used.
 */
export function micStreamForCamera(
  cameraId: string | null | undefined,
  config: CameraGalleryCardConfig | null | undefined
): string {
  const id = String(cameraId ?? "").trim();
  const map = config?.live_mic_streams;
  if (id && hasMicMapEntries(map)) {
    const v = map[id];
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed) return trimmed;
    }
    return ""; // Map is authoritative — don't fall through to legacy.
  }
  const single = String(config?.live_go2rtc_stream ?? "").trim();
  return single;
}

/**
 * `true` when the user has configured any mic backchannel — either the
 * per-camera map has at least one non-empty entry, or the legacy single
 * `live_go2rtc_stream` is set. Used to decide whether to render the
 * editor's "Microphone backchannels" section at all.
 */
export function hasAnyMicStream(config: CameraGalleryCardConfig | null | undefined): boolean {
  const map = config?.live_mic_streams;
  if (map && typeof map === "object") {
    for (const v of Object.values(map)) {
      if (typeof v === "string" && v.trim()) return true;
    }
  }
  return Boolean(String(config?.live_go2rtc_stream ?? "").trim());
}

/**
 * Camera entities the multi-camera grid layout should render. Filtered to
 * `camera.*` strings (`live_camera_entities` items that look like synthetic
 * stream ids or empty values are dropped — `ha-camera-stream` can't render
 * them, and bespoke RTC mounting per-tile is too costly).
 *
 * Order is preserved from config so the user's YAML position controls the
 * tile order.
 */
export function getGridCameraEntities(
  config: CameraGalleryCardConfig | null | undefined
): string[] {
  const list = config?.live_camera_entities;
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is string => typeof e === "string" && e.startsWith("camera."));
}

/**
 * Map the number of cameras to grid dimensions. Always a square so two
 * cameras don't render as a 1×2 row (which looks broken next to single-cam
 * mode); empty cells fill with the host background.
 *
 * Breakpoints: ≤4 → 2×2, ≤9 → 3×3, else 4×4 (camera counts beyond 16 keep
 * 4×4 and just clip silently — sane fallback over picking 5×5 on a
 * mobile screen).
 */
export function gridDims(count: number): { cols: number; rows: number } {
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };
  return { cols: 4, rows: 4 };
}

/**
 * Whether the live view should render the multi-camera grid right now.
 * Composes the three independent checks:
 *   1. The runtime tile-tap override forces single mode.
 *   2. The config asks for grid layout.
 *   3. There are at least 2 grid-eligible cameras (`camera.*`).
 *
 * `override === "single"` always wins because the user's most recent
 * interaction trumps the persisted config.
 */
export function isGridLayout(
  config: CameraGalleryCardConfig | null | undefined,
  override: "single" | null
): boolean {
  if (override === "single") return false;
  if (config?.live_layout !== "grid") return false;
  return getGridCameraEntities(config).length >= 2;
}

/**
 * Display name for an entry in the live-camera picker. Handles three cases:
 *  - synthetic stream id → the entry's `name` from `live_stream_urls`
 *  - camera entity with `friendly_name` → that
 *  - bare camera entity → title-cased local part
 */
export function friendlyCameraName(opts: {
  entityId: string;
  config: CameraGalleryCardConfig | null | undefined;
  hassStates: Readonly<Record<string, HassEntity>> | null | undefined;
}): string {
  const id = String(opts.entityId ?? "").trim();
  if (!id) return "";
  if (id.startsWith(STREAM_ID_PREFIX)) {
    const se = getStreamEntryById(opts.config, id);
    return se ? se.name : "Stream";
  }
  const state = opts.hassStates?.[id];
  const friendly = String(state?.attributes?.["friendly_name"] ?? "").trim();
  if (friendly) return friendly;
  const raw = id.split(".").pop() ?? id;
  const label = raw.replace(/_/g, " ").trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : id;
}
