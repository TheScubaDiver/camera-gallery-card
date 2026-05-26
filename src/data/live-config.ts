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

type LiveCameraEntry = NonNullable<CameraGalleryCardConfig["live_cameras"]>[number];

/**
 * Canonical live-cameras list. Reads `config.live_cameras` when populated;
 * otherwise builds it on the fly from the legacy keys
 * (`live_camera_entities`, `live_stream_urls`, `live_stream_url` singular,
 * `live_mic_streams`). This lets every helper below treat `live_cameras`
 * as the single source of truth without duplicating fallback logic.
 *
 * `normalize.ts` does the same migration when a config flows through the
 * full pipeline; this helper is the in-memory fallback for callers who
 * skip normalization (notably the test suite and the editor's interim
 * states).
 */
function getCanonicalLiveCameras(
  config: CameraGalleryCardConfig | null | undefined
): LiveCameraEntry[] {
  if (!config) return [];
  const existing = Array.isArray(config.live_cameras) ? config.live_cameras : [];
  if (existing.length > 0) return existing;

  const entities = Array.isArray(config.live_camera_entities) ? config.live_camera_entities : [];
  const streamsPlural = Array.isArray(config.live_stream_urls) ? config.live_stream_urls : null;
  const micMap =
    config.live_mic_streams && typeof config.live_mic_streams === "object"
      ? (config.live_mic_streams as Record<string, string>)
      : {};

  const built: LiveCameraEntry[] = [];

  for (const ent of entities) {
    if (typeof ent !== "string" || !ent.trim()) continue;
    const entity = ent.trim();
    const cam: LiveCameraEntry = { entity, name: "" };
    const mic = micMap[entity];
    if (typeof mic === "string" && mic.trim()) cam.mic = mic.trim();
    built.push(cam);
  }

  if (streamsPlural && streamsPlural.length > 0) {
    streamsPlural.forEach((s, i) => {
      const url = String(s?.url ?? "").trim();
      if (!url) return;
      const cam: LiveCameraEntry = { url, name: String(s?.name ?? "") };
      const mic = micMap[`__cgc_stream_${i}__`];
      if (typeof mic === "string" && mic.trim()) cam.mic = mic.trim();
      built.push(cam);
    });
  } else {
    // Legacy single-stream shorthand: live_stream_url + live_stream_name.
    // When the name is unset, default to "Stream" (no index) — distinct from
    // the plural-path default of "Stream N+1" so single-stream configs read
    // naturally.
    const single = String(config.live_stream_url ?? "").trim();
    if (single) {
      const explicitName = String(config.live_stream_name ?? "").trim();
      const cam: LiveCameraEntry = {
        url: single,
        name: explicitName || "Stream",
      };
      const mic = micMap["__cgc_stream_0__"];
      if (typeof mic === "string" && mic.trim()) cam.mic = mic.trim();
      built.push(cam);
    }
  }

  // Orphan mic-only legacy keys: a v2.11 user could configure
  // `live_mic_streams` without `live_camera_entities` (the entity id was
  // implied by the camera_image / grid_camera_entities surface). Preserve
  // that shape by emitting a mic-only entry keyed on the map key — both
  // `camera.*` and synthetic stream ids are stored under `entity` so
  // `findLiveCamera` can match by exact id.
  const covered = new Set<string>();
  for (const c of built) {
    const e = typeof c.entity === "string" ? c.entity.trim() : "";
    if (e) covered.add(e);
  }
  let streamIdx = 0;
  for (const c of built) {
    if (typeof c.url === "string" && c.url.trim()) {
      covered.add(`__cgc_stream_${streamIdx}__`);
      streamIdx++;
    }
  }
  for (const [key, val] of Object.entries(micMap)) {
    if (typeof val !== "string" || !val.trim()) continue;
    if (covered.has(key)) continue;
    built.push({ entity: key, name: "", mic: val.trim() });
  }

  return built;
}

/**
 * Normalize the configured live stream URLs into a typed list. Reads
 * from the canonical live_cameras shape (with legacy fallback handled by
 * `getCanonicalLiveCameras`). Stream entries are the subset whose entry
 * has a `url`; the synthetic id index is their position in that
 * stream-only subset (`__cgc_stream_0__`, `__cgc_stream_1__`, …).
 */
export function getStreamEntries(
  config: CameraGalleryCardConfig | null | undefined
): StreamEntry[] {
  const cams = getCanonicalLiveCameras(config);
  const out: StreamEntry[] = [];
  let streamIdx = 0;
  for (const c of cams) {
    const url = String(c?.url ?? "").trim();
    if (!url) continue;
    const name = String(c?.name ?? "").trim() || `Stream ${streamIdx + 1}`;
    out.push({ id: `${STREAM_ID_PREFIX}_${streamIdx}__`, url, name });
    streamIdx++;
  }
  return out;
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
  const cams = getCanonicalLiveCameras(opts.config);
  if (cams.length === 0) return [];
  const states = opts.hassStates ?? {};
  // Preserve the order from `live_cameras` — position 0 is the default
  // camera, so an alphabetic sort here would silently override the user's
  // chosen ordering. Drop entries whose entity id is not in `hass.states`
  // (offline / typo / removed integration) so they don't pollute the picker.
  const out: string[] = [];
  for (const c of cams) {
    const entity = typeof c?.entity === "string" ? c.entity.trim() : "";
    if (!entity || !entity.startsWith("camera.")) continue;
    if (!states[entity]) continue;
    out.push(entity);
  }
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
 * Has any entry in `live_cameras` got a non-empty `mic` field? Used by
 * `micStreamForCamera` to decide whether the legacy single-global fallback
 * still applies — once any inline mic is set, the map is authoritative.
 */
function liveCamerasHaveAnyMic(config: CameraGalleryCardConfig | null | undefined): boolean {
  for (const c of getCanonicalLiveCameras(config)) {
    if (typeof c?.mic === "string" && c.mic.trim()) return true;
  }
  return false;
}

/**
 * Find the `live_cameras` entry that corresponds to `cameraId` (an HA
 * entity id, or a `__cgc_stream_<N>__` synthetic). Returns null when no
 * match.
 */
function findLiveCamera(
  cameraId: string | null | undefined,
  config: CameraGalleryCardConfig | null | undefined
): LiveCameraEntry | null {
  const id = String(cameraId ?? "").trim();
  if (!id) return null;
  const cams = getCanonicalLiveCameras(config);
  if (id.startsWith(STREAM_ID_PREFIX)) {
    // Stream id → first try Nth url-typed entry, then fall back to an
    // exact `entity` match (orphan mic-only entry, see getCanonicalLiveCameras).
    const m = /^__cgc_stream_(\d+)__$/.exec(id);
    const wanted = m ? parseInt(m[1] ?? "", 10) : NaN;
    if (Number.isFinite(wanted)) {
      let i = 0;
      for (const c of cams) {
        const url = String(c?.url ?? "").trim();
        if (!url) continue;
        if (i === wanted) return c;
        i++;
      }
    }
    for (const c of cams) {
      const entity = String(c?.entity ?? "").trim();
      if (entity && entity === id) return c;
    }
    return null;
  }
  // Entity id → match on entity field.
  for (const c of cams) {
    const entity = String(c?.entity ?? "").trim();
    if (entity && entity === id) return c;
  }
  return null;
}

/**
 * Resolve the go2rtc backchannel stream name for a specific camera (HA
 * entity id or synthetic stream id). Returns "" when no mic is configured
 * for that camera.
 *
 * Lookup order:
 *  1. **If any live_cameras entry has an inline `mic`**, only inline mics
 *     apply — cameras whose entry has no `mic` have no backchannel. The
 *     moment the unified shape carries any mic, it owns the mic surface.
 *  2. **If no inline mic is set anywhere**, fall back to the legacy
 *     `live_go2rtc_stream` — applies globally to whichever camera is
 *     active. Preserves the original single-camera behavior for users
 *     who haven't moved to the new shape yet.
 */
export function micStreamForCamera(
  cameraId: string | null | undefined,
  config: CameraGalleryCardConfig | null | undefined
): string {
  const id = String(cameraId ?? "").trim();
  if (id && liveCamerasHaveAnyMic(config)) {
    const entry = findLiveCamera(id, config);
    const mic = typeof entry?.mic === "string" ? entry.mic.trim() : "";
    return mic; // Inline-mics are authoritative — don't fall through to legacy.
  }
  return String(config?.live_go2rtc_stream ?? "").trim();
}

/**
 * `true` when the user has configured any mic backchannel — either a
 * live_cameras entry has an inline `mic`, or the legacy single
 * `live_go2rtc_stream` is set. Used to decide whether to render the
 * editor's "Microphone backchannels" section at all.
 */
export function hasAnyMicStream(config: CameraGalleryCardConfig | null | undefined): boolean {
  if (liveCamerasHaveAnyMic(config)) return true;
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
  const cams = getCanonicalLiveCameras(config);
  const out: string[] = [];
  for (const c of cams) {
    const entity = typeof c?.entity === "string" ? c.entity.trim() : "";
    if (entity && entity.startsWith("camera.")) out.push(entity);
  }
  return out;
}

/**
 * Raw entity ids from `live_cameras` — no hass/locale deps, used by
 * change-watch and diff code that just needs the configured ids.
 * Honors the same legacy-fallback path as the other helpers.
 *
 * Orphan mic-only entries (where `entity` holds a synthetic stream id
 * like `__cgc_stream_0__`) are excluded — those aren't real HA entities
 * and would only pollute hass.states watch-lists.
 */
export function getLiveCameraEntityIds(
  config: CameraGalleryCardConfig | null | undefined
): string[] {
  const out: string[] = [];
  for (const c of getCanonicalLiveCameras(config)) {
    const entity = typeof c?.entity === "string" ? c.entity.trim() : "";
    if (entity && !entity.startsWith(STREAM_ID_PREFIX)) out.push(entity);
  }
  return out;
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
