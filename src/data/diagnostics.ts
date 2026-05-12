/**
 * Pure diagnostics section builder. The card collects async probe results
 * (`_probeCameraResolution`) into `cameraResolutions` and hands the snapshot
 * here; everything below is plain data → typed rows.
 *
 * The textual output (`diagnosticsToText`) is what users paste into bug
 * reports, so structure changes here must be reviewed against the user's
 * expectation. Tests cover golden output for both fully-populated and
 * empty fixtures.
 */

import { FRESH_FETCH_WINDOW_MS } from "../const";
import type { CameraGalleryCardConfig } from "../config/normalize";
import type { HomeAssistant } from "../types/hass";

/** Visual severity of a row's "value" half. `null` (or missing) = neutral. */
export type DiagStatus = "ok" | "warn" | "bad" | null;

/** A diagnostic row is `[key, value, optional status]`. */
export type DiagRow = readonly [key: string, value: string, status?: DiagStatus];

/** A named group of rows, with a MDI icon for the section header. */
export interface DiagSection {
  title: string;
  icon: string;
  rows: readonly DiagRow[];
}

/** Per-entity probe result, as stored by `_probeCameraResolution`. */
export type CameraResolutionState =
  | { state: "loading" }
  | { state: "unavailable" }
  | { state: "ok"; w: number; h: number }
  | { state: "error"; reason?: string };

/** Subset of `MediaSourceClient.state` the builder reads. */
export interface DiagMediaState {
  list?: ReadonlyArray<unknown>;
  loadedAt?: number;
  frigateApiFailed?: boolean;
  frigateApiFailedAt?: number;
  calendar?: { days?: ReadonlyArray<unknown> };
  dayCache?: { size?: number };
}

export interface BuildDiagnosticsOptions {
  cardVersion: string;
  viewMode: string;
  hass: HomeAssistant | null | undefined;
  config: CameraGalleryCardConfig | null | undefined;
  mediaState: DiagMediaState;
  frigateEventsActive: boolean;
  liveCardMounted: boolean;
  liveLayoutOverride: string | null;
  cameraResolutions: Readonly<Record<string, CameraResolutionState | undefined>>;
  navigatorInfo: { userAgent: string; onLine: boolean };
  /** Injectable clock for tests. Defaults to `Date.now()`. */
  now?: () => number;
}

const fmtAgeSeconds = (ts: number, now: number): string =>
  ts ? `${Math.round((now - ts) / 1000)}s ago` : "—";

const fmtTimestamp = (ts: number, now: number): string =>
  ts ? `${new Date(ts).toLocaleTimeString()} (${fmtAgeSeconds(ts, now)})` : "—";

/**
 * Three-state Direct API status — "not configured" when `frigate_url` is
 * absent, "failed (<age>)" when the REST path latched a failure, "ok"
 * otherwise. Without splitting these, an empty `frigate_url` would show
 * "ok" purely because the failure flag defaults to `false`, misleading
 * users who don't have direct REST enabled at all. A stale flag from a
 * removed `frigate_url` would also persist as "ok".
 */
function directApiCell(
  config: CameraGalleryCardConfig | null,
  ms: DiagMediaState,
  now: number
): { value: string; status: DiagStatus } {
  if (!config?.frigate_url) return { value: "not configured", status: null };
  if (ms.frigateApiFailed) {
    return {
      value: `failed (${fmtAgeSeconds(ms.frigateApiFailedAt ?? 0, now)})`,
      status: "warn",
    };
  }
  return { value: "ok", status: "ok" };
}

function gcd(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

export function formatAspectRatio(w: number, h: number): string {
  if (!w || !h) return "?";
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

function buildLiveCameraRows(
  config: CameraGalleryCardConfig | null | undefined,
  hass: HomeAssistant | null | undefined,
  cameraResolutions: Readonly<Record<string, CameraResolutionState | undefined>>
): DiagRow[] {
  const cams = Array.isArray(config?.live_camera_entities) ? config.live_camera_entities : [];
  if (!cams.length) return [["(no cameras configured)", "—"]];

  const rows: DiagRow[] = [];
  for (const id of cams) {
    const state = hass?.states?.[id];
    if (!state) {
      rows.push([id, "(entity not found)", "bad"]);
      continue;
    }

    // Prefer the explicit attribute when present (older HA versions); newer
    // HA exposes streaming via supported_features bits only: 1 = STREAM (HLS),
    // 2 = WEB_RTC.
    let streamType = state.attributes?.["frontend_stream_type"] as string | undefined;
    if (!streamType) {
      const sf = Number(state.attributes?.["supported_features"] ?? 0);
      if (sf & 2) streamType = "web_rtc";
      else if (sf & 1) streamType = "hls";
    }
    const display = streamType
      ? streamType +
        (streamType === "web_rtc"
          ? " (low-latency)"
          : streamType === "hls"
            ? " (~2-5s buffer)"
            : "")
      : "(no streaming)";
    const status: DiagStatus =
      streamType === "web_rtc" ? "ok" : streamType === "hls" ? "warn" : "bad";
    const name = (state.attributes?.["friendly_name"] as string | undefined) || id;
    rows.push([name, display, status]);

    const r = cameraResolutions[id];
    let resText = "(loading…)";
    let resStatus: DiagStatus = null;
    if (r?.state === "ok") {
      resText = `${r.w}×${r.h} (${formatAspectRatio(r.w, r.h)})`;
      resStatus = "ok";
    } else if (r?.state === "error") {
      resText = r.reason ? `(snapshot failed: ${r.reason})` : "(snapshot failed)";
      resStatus = "warn";
    } else if (r?.state === "unavailable") {
      resText = "(no entity_picture)";
      resStatus = "warn";
    }
    rows.push(["  resolution", resText, resStatus]);
  }
  return rows;
}

/**
 * Build the typed diagnostic table. Output is structurally byte-identical
 * to the legacy `_buildDiagnostics()` output (modulo timestamps).
 */
export function buildDiagnostics(opts: BuildDiagnosticsOptions): DiagSection[] {
  const cfg = opts.config ?? null;
  const hass = opts.hass ?? null;
  const ms = opts.mediaState;
  const now = (opts.now ?? Date.now)();
  const frigateInstalled =
    Array.isArray(hass?.config?.components) &&
    (hass?.config?.components as ReadonlyArray<string>).includes("frigate");
  const list = Array.isArray(ms.list) ? ms.list : [];
  const loadedAt = ms.loadedAt ?? 0;
  const calendarDays = ms.calendar?.days?.length ?? 0;
  const dayCacheSize = ms.dayCache?.size ?? 0;
  const directApi = directApiCell(cfg, ms, now);

  return [
    {
      title: "Card",
      icon: "mdi:card-outline",
      rows: [
        ["Version", opts.cardVersion || "(unknown)"],
        ["View mode", opts.viewMode || "—"],
      ],
    },
    {
      title: "Home Assistant",
      icon: "mdi:home-assistant",
      rows: [["Version", hass?.config?.version || "—"]],
    },
    {
      title: "Frigate integration",
      icon: "mdi:cctv",
      rows: [["Installed", frigateInstalled ? "yes" : "no", frigateInstalled ? "ok" : "bad"]],
    },
    {
      title: "Config summary",
      icon: "mdi:cog-outline",
      rows: [
        ["source_mode", cfg?.source_mode || "—"],
        ["max_media", String(cfg?.max_media ?? "—")],
        ["frigate_url", cfg?.frigate_url ? "set" : "(not set)"],
        ["media_sources", String((cfg?.media_sources ?? []).length)],
        ["entities (sensor)", String((cfg?.entities ?? []).length)],
        ["live_enabled", cfg?.live_enabled ? "yes" : "no", cfg?.live_enabled ? "ok" : null],
        ["live_camera_entities", String((cfg?.live_camera_entities ?? []).length)],
        ["live_layout", cfg?.live_layout || "single"],
      ],
    },
    {
      title: "Runtime state",
      icon: "mdi:pulse",
      rows: [
        ["Items in gallery", String(list.length), list.length > 0 ? "ok" : "warn"],
        ["Calendar days", String(calendarDays), calendarDays > 0 ? "ok" : null],
        ["Days loaded", String(dayCacheSize)],
        [
          "Last fetch",
          fmtTimestamp(loadedAt, now),
          loadedAt && now - loadedAt < FRESH_FETCH_WINDOW_MS ? "ok" : loadedAt ? "warn" : "bad",
        ],
        ["Direct API", directApi.value, directApi.status],
        [
          "WS subscribe (frigate/events)",
          opts.frigateEventsActive ? "active" : "inactive",
          opts.frigateEventsActive ? "ok" : frigateInstalled ? "warn" : null,
        ],
        [
          "Live card mounted",
          opts.liveCardMounted ? "yes" : "no",
          opts.liveCardMounted
            ? "ok"
            : cfg?.live_enabled && opts.viewMode === "live"
              ? "warn"
              : null,
        ],
        ["Live layout override", opts.liveLayoutOverride || "—"],
      ],
    },
    {
      title: "Live cameras",
      icon: "mdi:cctv",
      rows: buildLiveCameraRows(cfg, hass, opts.cameraResolutions),
    },
    {
      title: "Browser",
      icon: "mdi:cellphone",
      rows: [
        ["User agent", opts.navigatorInfo.userAgent || "—"],
        [
          "Connection",
          opts.navigatorInfo.onLine === false ? "offline" : "online",
          opts.navigatorInfo.onLine === false ? "bad" : "ok",
        ],
      ],
    },
  ];
}

/**
 * Render the diagnostic table as plain text. Output is byte-identical to
 * the legacy `_diagnosticsToText()` so users pasting reports get the
 * familiar shape.
 */
export function diagnosticsToText(
  sections: readonly DiagSection[],
  generatedAt: Date = new Date()
): string {
  const lines: string[] = [
    "Camera Gallery Card — Diagnostics",
    `Generated: ${generatedAt.toISOString()}`,
    "",
  ];
  for (const section of sections) {
    lines.push(`## ${section.title}`);
    for (const [k, v] of section.rows) {
      lines.push(`  ${k}: ${v}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
