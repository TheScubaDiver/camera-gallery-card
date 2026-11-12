// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cardStyles } from "../styles";

const poster =
  "data:image/svg+xml," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"/>');

beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  await import("../index.js");
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// jsdom cannot measure native fullscreen or nested CSS layout. Check the
// fullscreen selector against the actual Lit-rendered siblings instead;
// the camera-free Chrome fixture supplies the pixel-height regression.
async function renderLiveCard(options: Record<string, unknown> = {}) {
  const card: any = document.createElement("camera-gallery-card");
  for (const method of [
    "_startMediaPoll",
    "_subscribeFrigateEvents",
    "_mountLiveCard",
    "_setupThumbObserver",
    "_scheduleVisibleMediaWork",
    "_queueSensorPosterWork",
    "_queueSnapshotResolveForVisibleThumbs",
  ]) {
    vi.spyOn(card, method).mockImplementation(() => {});
  }
  vi.spyOn(card._posterClient, "prewarm").mockResolvedValue(undefined);
  vi.spyOn(card, "_computeBaseList").mockReturnValue({
    rawItems: [{ src: poster }],
    objFiltered: [{ src: poster }],
    days: ["2026-01-01"],
    newestDay: "2026-01-01",
    activeDay: "2026-01-01",
    videoCount: 0,
    imageCount: 1,
  });
  card.setConfig({
    entities: ["sensor.synthetic"],
    path_datetime_format: "YYYY-MM-DD",
    live_enabled: true,
    live_cameras: [{ entity: "camera.synthetic", mic: "synthetic" }, { entity: "camera.other" }],
    aspect_ratio: "4:3",
    persistent_controls: true,
    live_mic_waveform_enabled: false,
    ...options,
  });
  card._viewMode = "live";
  card._hass = {
    states: {
      "camera.synthetic": { state: "idle", attributes: {} },
      "camera.other": { state: "idle", attributes: {} },
    },
    locale: { language: "en" },
  };
  document.body.append(card);
  await card.updateComplete;
  return card;
}

function fullscreenHiddenSelector() {
  const fullscreen = cardStyles.cssText.split(":host([data-live-fs])")[1]!.split("\n  .panel")[0]!;
  return fullscreen.match(/& (:is\([^)]*\))\s*\{\s*display: none !important;/)![1];
}

describe("live fullscreen gallery chrome", () => {
  it("overrides the built-in HA player height cap only in card fullscreen", () => {
    // HA WebRTC and HLS both use max-height: var(--video-max-height,
    // calc(100vh - 97px)) on the nested video. This inherited percentage
    // resolves against its filled host, including fixed controls/grid tiles.
    const fullscreen = cardStyles.cssText
      .split(":host([data-live-fs])")[1]!
      .split("\n  .panel")[0]!;
    expect(fullscreen).toContain("--video-max-height: 100%;");
    expect(cardStyles.cssText.match(/--video-max-height:/g)).toHaveLength(1);
    expect(cardStyles.cssText.split(":host([data-live-fs])")[0]).not.toContain(
      "--video-max-height"
    );
    // Scoped to the fullscreen host only; no global max-height reset.
  });

  it.each([86, 104])("hides actual gallery wrapper flex items with thumb_size=%s", async (size) => {
    const card = await renderLiveCard({ thumb_size: size });
    const panel = card.shadowRoot.querySelector(".panel")!;
    const preview = panel.querySelector(".preview")!;
    const topbar = panel.querySelector(".topbar")!;
    const timeline = panel.querySelector(".timeline")!;
    expect(topbar.parentElement).toBe(panel);
    expect(timeline.parentElement).toBe(panel);
    // Hiding only .seg/.datepill/.tthumbs leaves these two siblings behind,
    // including .tthumbs-wrap's min-height and the panel's row gaps.
    expect(timeline.querySelector(".tthumbs-wrap")).not.toBeNull();
    const hidden = fullscreenHiddenSelector();
    expect(topbar.matches(hidden)).toBe(true);
    expect(timeline.matches(hidden)).toBe(true);
    expect(preview.matches(hidden)).toBe(false);
    expect(preview.querySelector("#live-card-host")).not.toBeNull();
    for (const selector of [".live-controls-bar", ".mic-talkback-bar", ".pnav"]) {
      expect(preview.querySelector(selector)).not.toBeNull();
      expect(preview.querySelector(selector).matches(hidden)).toBe(false);
    }
    // Chrome-only styles are scoped to fullscreen; exiting restores the same
    // gallery elements rather than deleting or rebuilding their state.
    card.setAttribute("data-live-fs", "");
    card.removeAttribute("data-live-fs");
    await card.updateComplete;
    expect(panel.querySelector(".timeline")).toBe(timeline);
    expect(panel.querySelector(".topbar")).toBe(topbar);
  });

  it("keeps fixed live controls outside the preview visible", async () => {
    const card = await renderLiveCard({ controls_mode: "fixed" });
    const controls = card.shadowRoot.querySelector(".controls-bar-fixed");
    expect(controls).not.toBeNull();
    expect(controls.matches(fullscreenHiddenSelector())).toBe(false);
  });
});
