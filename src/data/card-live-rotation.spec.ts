// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The real card's rotation wiring: aspect ratio of the live pane, the CSS
// variables on the live host and grid tiles, and the snapshot canvas.
let card: any;

function cams(...entries: Record<string, unknown>[]) {
  card.config = { live_enabled: true, live_layout: "single", live_cameras: entries };
  // Without hass the card has no camera states; list the configured ones.
  card._getLiveCameraOptions = () =>
    entries.map((e, i) => (e["entity"] as string) || `__cgc_stream_${i}__`);
}

beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  await import("../index.js");
});

beforeEach(() => {
  card = document.createElement("camera-gallery-card");
  card.requestUpdate = vi.fn();
  card._aspectRatio = "16/9";
  card._liveLayoutOverride = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("card live rotation", () => {
  it("keeps the configured aspect ratio without rotation", () => {
    cams({ entity: "camera.garage", name: "" });
    expect(card._getPreviewAspectRatio(true)).toBe("16/9");
    expect(card._getLiveRotationStyle()).toBe("");
  });

  it("keeps the aspect ratio for 180 degrees", () => {
    cams({ entity: "camera.garage", name: "", rotation: 180 });
    expect(card._getPreviewAspectRatio(true)).toBe("16/9");
    expect(card._getLiveRotationStyle()).toContain("--rot:180deg");
  });

  it("swaps the aspect ratio for 90 degrees", () => {
    cams({ entity: "camera.hall", name: "", rotation: 90 });
    expect(card._getPreviewAspectRatio(true)).toBe("9/16");
    expect(card._getLiveRotationStyle()).toContain("--rot-w:100cqh");
  });

  it("swaps the crop's aspect ratio and keeps the crop on its own path", () => {
    cams({
      entity: "camera.hall",
      name: "",
      rotation: 270,
      crop: { x: 0, y: 0, w: 50, h: 100, source_ar: "16/9" },
    });
    // Crop is 16*50 : 9*100 = 800/900, rotated → 900/800.
    expect(card._getPreviewAspectRatio(true)).toBe("900/800");
    expect(card._getLiveRotationStyle()).toBe("--rot:270deg;--rot-w:100cqh;--rot-h:100cqw;");
    expect(card._getLiveCropStyle()).toContain("--crop-w:50;");
  });

  it("follows the selected camera", () => {
    cams({ entity: "camera.a", name: "" }, { entity: "camera.b", name: "", rotation: 90 });
    expect(card._getLiveRotationStyle()).toBe("");
    card._liveSelectedCamera = "camera.b";
    expect(card._getLiveRotationStyle()).toContain("--rot:90deg");
  });

  it("rotates a stream-URL camera", () => {
    cams({ url: "rtsp://example/cam", name: "Shed", rotation: 180 });
    card._liveSelectedCamera = "__cgc_stream_0__";
    expect(card._getLiveRotationStyle()).toContain("--rot:180deg");
  });

  it("leaves the gallery aspect ratio alone", () => {
    cams({ entity: "camera.hall", name: "", rotation: 90 });
    expect(card._getPreviewAspectRatio(false)).toBe("16/9");
  });

  it("does not rotate the grid host; tiles rotate themselves", () => {
    card.config = {
      live_enabled: true,
      live_layout: "grid",
      live_cameras: [
        { entity: "camera.a", name: "", rotation: 270 },
        { entity: "camera.b", name: "" },
      ],
    };
    expect(card._getLiveRotationStyle()).toBe("");

    const rotated = document.createElement("div");
    card._applyTileRotation(rotated, "camera.a");
    expect(rotated.classList.contains("has-rot")).toBe(true);
    expect(rotated.style.getPropertyValue("--rot")).toBe("270deg");
    expect(rotated.style.getPropertyValue("--rot-w")).toBe("100cqh");

    // Rotation removed later: the tile is cleaned up.
    card.config = { ...card.config, live_cameras: [{ entity: "camera.a", name: "" }] };
    card._applyTileRotation(rotated, "camera.a");
    expect(rotated.classList.contains("has-rot")).toBe(false);
    expect(rotated.style.getPropertyValue("--rot")).toBe("");
  });

  it("saves the snapshot rotated", () => {
    cams({ entity: "camera.hall", name: "", rotation: 90 });
    const video = { videoWidth: 1920, videoHeight: 1080 };
    card._findLiveVideo = () => video;
    const ctx = { translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() };
    let canvas: HTMLCanvasElement | null = null;
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "canvas") {
        canvas = el as HTMLCanvasElement;
        (el as any).getContext = () => ctx;
        (el as any).toBlob = () => {};
      }
      return el;
    });
    card._captureLiveSnapshot();
    expect(canvas!.width).toBe(1080);
    expect(canvas!.height).toBe(1920);
    expect(ctx.translate).toHaveBeenCalledWith(540, 960);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(ctx.drawImage).toHaveBeenCalledWith(video, -960, -540, 1920, 1080);
  });
});
