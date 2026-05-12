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
