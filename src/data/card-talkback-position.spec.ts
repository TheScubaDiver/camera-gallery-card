// @vitest-environment jsdom
import { render } from "lit";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The real card's talkback control in its two placements (#257): floating
// over the video (default) and as its own row below/above the preview.
let card: any;

function barStyle(inRow: boolean): string {
  const host = document.createElement("div");
  render(card._renderMicTalkbackBar(inRow), host);
  return host.querySelector(".mic-talkback-bar")?.getAttribute("style") ?? "";
}

beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  await import("../index.js");
});

beforeEach(() => {
  card = document.createElement("camera-gallery-card");
  card.requestUpdate = vi.fn();
  card.config = {
    live_enabled: true,
    live_cameras: [{ entity: "camera.door", name: "", mic: "door" }],
  };
  card._getEffectiveLiveCamera = () => "camera.door";
  card._talkSourceFor = () => "go2rtc";
  card._micState = "idle";
  card._micErrorCode = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("card talkback position", () => {
  it("floats over the video by default", () => {
    const s = barStyle(false);
    expect(s).toContain("position:absolute");
    expect(s).toContain("color:#fff");
  });

  it("renders in flow with card colors as a row", () => {
    const s = barStyle(true);
    expect(s).toContain("position:relative");
    expect(s).toContain("width:100%");
    expect(s).toContain("color:var(--cgc-txt)");
    expect(s).toContain("background:var(--cgc-obj-btn-bg, var(--cgc-ui-bg))");
    expect(s).not.toContain("position:absolute");
  });

  it("keeps the round button round and unstretched in a row", () => {
    card.config = { ...card.config, live_mic_shape: "button" };
    const s = barStyle(true);
    expect(s).toContain("border-radius:50%");
    expect(s).not.toContain("width:100%");
  });

  it("still shows the active state color in a row", () => {
    card._micState = "active";
    expect(barStyle(true)).toContain("rgba(220, 38, 38, 0.30)");
  });

  it("renders nothing without a talk source", () => {
    card._talkSourceFor = () => null;
    expect(barStyle(true)).toBe("");
  });
});
