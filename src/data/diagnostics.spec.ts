import { describe, expect, it } from "vitest";

import type { CameraGalleryCardConfig } from "../config/normalize";
import type { HomeAssistant } from "../types/hass";
import {
  buildDiagnostics,
  type CameraResolutionState,
  diagnosticsToText,
  formatAspectRatio,
} from "./diagnostics";

const fakeNow = (): number => 1747049200000; // 2025-05-12T12:46:40Z, frozen

function cfg(over: Partial<CameraGalleryCardConfig> = {}): CameraGalleryCardConfig {
  return {
    type: "custom:camera-gallery-card",
    ...over,
  } as CameraGalleryCardConfig;
}

function hassWith(over: Partial<HomeAssistant> = {}, components: string[] = []): HomeAssistant {
  return {
    config: { version: "2026.5.0", components, ...(over.config as object) },
    states: over.states ?? {},
    locale: { language: "en", time_format: "language" } as never,
    ...over,
  } as HomeAssistant;
}

const baseNavigator = { userAgent: "Mozilla/5.0", onLine: true };
const baseMediaState = {};
const baseCameraResolutions: Readonly<Record<string, CameraResolutionState | undefined>> = {};

describe("formatAspectRatio", () => {
  it("computes simplified ratios", () => {
    expect(formatAspectRatio(1920, 1080)).toBe("16:9");
    expect(formatAspectRatio(1024, 768)).toBe("4:3");
    expect(formatAspectRatio(800, 800)).toBe("1:1");
  });

  it("returns ? for zero dims", () => {
    expect(formatAspectRatio(0, 1080)).toBe("?");
    expect(formatAspectRatio(1920, 0)).toBe("?");
  });
});

describe("buildDiagnostics", () => {
  it("structure: 7 sections in fixed order", () => {
    const sections = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass: hassWith(),
      config: cfg(),
      mediaState: baseMediaState,
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    expect(sections.map((s) => s.title)).toEqual([
      "Card",
      "Home Assistant",
      "Frigate integration",
      "Config summary",
      "Runtime state",
      "Live cameras",
      "Browser",
    ]);
  });

  it("Frigate Installed flips on hass.config.components", () => {
    const off = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass: hassWith(),
      config: cfg(),
      mediaState: baseMediaState,
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    expect(off[2]?.rows[0]).toEqual(["Installed", "no", "bad"]);

    const on = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass: hassWith({}, ["frigate", "default_config"]),
      config: cfg(),
      mediaState: baseMediaState,
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    expect(on[2]?.rows[0]).toEqual(["Installed", "yes", "ok"]);
  });

  it("Runtime: Last fetch warns when older than FRESH window, ok when within", () => {
    const fresh = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass: hassWith(),
      config: cfg(),
      mediaState: { loadedAt: fakeNow() - 60_000 },
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    const stale = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass: hassWith(),
      config: cfg(),
      mediaState: { loadedAt: fakeNow() - 10 * 60 * 1000 },
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    const never = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass: hassWith(),
      config: cfg(),
      mediaState: { loadedAt: 0 },
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    expect(fresh[4]?.rows[3]?.[2]).toBe("ok");
    expect(stale[4]?.rows[3]?.[2]).toBe("warn");
    expect(never[4]?.rows[3]?.[2]).toBe("bad");
  });

  it("Direct API: 'not configured' when frigate_url is absent", () => {
    const sections = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass: hassWith(),
      config: cfg(),
      mediaState: { frigateApiFailed: false },
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    expect(sections[4]?.rows[4]).toEqual(["Direct API", "not configured", null]);
  });

  it("Direct API: 'not configured' even when stale failure flag set after URL removed", () => {
    const sections = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass: hassWith(),
      config: cfg(),
      mediaState: { frigateApiFailed: true, frigateApiFailedAt: fakeNow() - 60_000 },
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    expect(sections[4]?.rows[4]).toEqual(["Direct API", "not configured", null]);
  });

  it("Direct API: 'failed (<age>)' / warn when frigate_url set and REST latched a failure", () => {
    const sections = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass: hassWith(),
      config: cfg({ frigate_url: "http://frigate.local" }),
      mediaState: { frigateApiFailed: true, frigateApiFailedAt: fakeNow() - 30_000 },
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    expect(sections[4]?.rows[4]).toEqual(["Direct API", "failed (30s ago)", "warn"]);
  });

  it("Direct API: 'ok' when frigate_url set and no failure latched", () => {
    const sections = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass: hassWith(),
      config: cfg({ frigate_url: "http://frigate.local" }),
      mediaState: { frigateApiFailed: false },
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    expect(sections[4]?.rows[4]).toEqual(["Direct API", "ok", "ok"]);
  });

  it("Live cameras: emits placeholder row when none configured", () => {
    const sections = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass: hassWith(),
      config: cfg(),
      mediaState: baseMediaState,
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    expect(sections[5]?.rows).toEqual([["(no cameras configured)", "—"]]);
  });

  it("Live cameras: detects web_rtc / hls / no streaming from supported_features", () => {
    const hass = hassWith(
      {
        states: {
          "camera.webrtc": {
            entity_id: "camera.webrtc",
            attributes: { friendly_name: "WebRTC Cam", supported_features: 2 },
          },
          "camera.hls": {
            entity_id: "camera.hls",
            attributes: { friendly_name: "HLS Cam", supported_features: 1 },
          },
          "camera.none": {
            entity_id: "camera.none",
            attributes: { friendly_name: "Nope" },
          },
        } as never,
      },
      []
    );
    const sections = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass,
      config: cfg({ live_camera_entities: ["camera.webrtc", "camera.hls", "camera.none"] }),
      mediaState: baseMediaState,
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: {
        "camera.webrtc": { state: "ok", w: 1920, h: 1080 },
        "camera.hls": { state: "loading" },
        "camera.none": { state: "unavailable" },
      },
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    const liveRows = sections[5]?.rows ?? [];
    expect(liveRows[0]).toEqual(["WebRTC Cam", "web_rtc (low-latency)", "ok"]);
    expect(liveRows[1]).toEqual(["  resolution", "1920×1080 (16:9)", "ok"]);
    expect(liveRows[2]).toEqual(["HLS Cam", "hls (~2-5s buffer)", "warn"]);
    expect(liveRows[3]).toEqual(["  resolution", "(loading…)", null]);
    expect(liveRows[4]).toEqual(["Nope", "(no streaming)", "bad"]);
    expect(liveRows[5]).toEqual(["  resolution", "(no entity_picture)", "warn"]);
  });

  it("Live cameras: missing entity marked bad", () => {
    const sections = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass: hassWith(),
      config: cfg({ live_camera_entities: ["camera.gone"] }),
      mediaState: baseMediaState,
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    expect(sections[5]?.rows[0]).toEqual(["camera.gone", "(entity not found)", "bad"]);
  });

  it("Live cameras: resolution error includes reason", () => {
    const hass = hassWith(
      {
        states: {
          "camera.err": {
            entity_id: "camera.err",
            attributes: { friendly_name: "Err Cam", supported_features: 2 },
          },
        } as never,
      },
      []
    );
    const sections = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass,
      config: cfg({ live_camera_entities: ["camera.err"] }),
      mediaState: baseMediaState,
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: { "camera.err": { state: "error", reason: "HTTP 500" } },
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    expect(sections[5]?.rows[1]).toEqual(["  resolution", "(snapshot failed: HTTP 500)", "warn"]);
  });

  it("Browser: offline marked bad", () => {
    const sections = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass: hassWith(),
      config: cfg(),
      mediaState: baseMediaState,
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: { userAgent: "Mozilla/5.0", onLine: false },
      now: fakeNow,
    });
    expect(sections[6]?.rows[1]).toEqual(["Connection", "offline", "bad"]);
  });

  it("(unknown) card version when blank", () => {
    const sections = buildDiagnostics({
      cardVersion: "",
      viewMode: "",
      hass: hassWith(),
      config: cfg(),
      mediaState: baseMediaState,
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    expect(sections[0]?.rows[0]).toEqual(["Version", "(unknown)"]);
    expect(sections[0]?.rows[1]).toEqual(["View mode", "—"]);
  });
});

describe("diagnosticsToText", () => {
  it("produces the legacy text layout", () => {
    const sections = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "media",
      hass: hassWith(),
      config: cfg(),
      mediaState: baseMediaState,
      frigateEventsActive: false,
      liveCardMounted: false,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    const generatedAt = new Date("2026-05-12T12:00:00.000Z");
    const text = diagnosticsToText(sections, generatedAt);
    expect(text.startsWith("Camera Gallery Card — Diagnostics\n")).toBe(true);
    expect(text.includes(`Generated: ${generatedAt.toISOString()}`)).toBe(true);
    expect(text.includes("## Card")).toBe(true);
    expect(text.includes("  Version: 2.10.0")).toBe(true);
    // section separator: blank line between section blocks.
    expect(text.match(/\n\n/g)?.length).toBeGreaterThan(2);
  });
});

describe("Microphone section", () => {
  it("is omitted when live_go2rtc_stream is not configured", () => {
    const sections = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "live",
      hass: hassWith(),
      config: cfg(),
      mediaState: baseMediaState,
      frigateEventsActive: false,
      liveCardMounted: true,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    expect(sections.find((s) => s.title === "Microphone")).toBeUndefined();
  });

  it("appears when live_go2rtc_stream is set, with `idle` and `—` rows by default", () => {
    const sections = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "live",
      hass: hassWith(),
      config: cfg({ live_go2rtc_stream: "front_door" }),
      mediaState: baseMediaState,
      frigateEventsActive: false,
      liveCardMounted: true,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    const mic = sections.find((s) => s.title === "Microphone");
    expect(mic).toBeDefined();
    const rows = Object.fromEntries((mic?.rows ?? []).map((r) => [r[0], r[1]]));
    expect(rows["State"]).toBe("idle");
    expect(rows["ICE state"]).toBe("—");
    expect(rows["RTT"]).toBe("—");
    expect(rows["go2rtc stream"]).toBe("front_door");
  });

  it("surfaces stats when active and shows error row when error is set", () => {
    const sections = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "live",
      hass: hassWith(),
      config: cfg({ live_go2rtc_stream: "front_door" }),
      mediaState: baseMediaState,
      frigateEventsActive: false,
      liveCardMounted: true,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
      micStats: {
        state: "active",
        iceState: "connected",
        rttMs: 42,
        packetLossPct: 1.5,
        jitterMs: 3,
        level: 0.42,
        audioProcessing: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
        },
      },
      micError: { code: "ws-server-error", detail: "no such stream" },
    });
    const mic = sections.find((s) => s.title === "Microphone");
    const rows = Object.fromEntries((mic?.rows ?? []).map((r) => [r[0], r[1]]));
    expect(rows["State"]).toBe("active");
    expect(rows["Last error"]).toBe("ws-server-error (no such stream)");
    expect(rows["RTT"]).toBe("42 ms");
    expect(rows["Packet loss"]).toBe("1.5%");
    expect(rows["Jitter"]).toBe("3 ms");
    expect(rows["Input level"]).toBe("42%");
    expect(rows["Audio processing"]).toBe("echo, no-ns, agc");
  });

  it("omits the Last error row when no error is set", () => {
    const sections = buildDiagnostics({
      cardVersion: "2.10.0",
      viewMode: "live",
      hass: hassWith(),
      config: cfg({ live_go2rtc_stream: "front_door" }),
      mediaState: baseMediaState,
      frigateEventsActive: false,
      liveCardMounted: true,
      liveLayoutOverride: null,
      cameraResolutions: baseCameraResolutions,
      navigatorInfo: baseNavigator,
      now: fakeNow,
    });
    const mic = sections.find((s) => s.title === "Microphone");
    const keys = (mic?.rows ?? []).map((r) => r[0]);
    expect(keys).not.toContain("Last error");
  });
});
