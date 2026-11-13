// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";

// Crop is looked up by the live view's camera id. Stream-URL cameras have
// the id `__cgc_stream_<n>__`, which a lookup by `entity`/`url` never
// matched, so their crop was ignored.
beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  await import("../index.js");
});

const CROP = { x: 10, y: 20, w: 50, h: 40, source_ar: "16/9" };

function makeCard(cameras: Record<string, unknown>[], selected: string) {
  const card: any = document.createElement("camera-gallery-card");
  card.requestUpdate = vi.fn();
  card.config = { live_enabled: true, live_layout: "single", live_cameras: cameras };
  card._aspectRatio = "16/9";
  card._liveSelectedCamera = selected;
  return card;
}

describe("live crop lookup", () => {
  it("applies the crop of an entity camera", () => {
    const card = makeCard([{ entity: "camera.door", name: "", crop: CROP }], "camera.door");
    expect(card._getLiveCropStyle()).toBe("--crop-x:10%;--crop-y:20%;--crop-w:50;--crop-h:40;");
  });

  it("applies the crop of a stream-URL camera", () => {
    const card = makeCard(
      [
        { entity: "camera.door", name: "" },
        { url: "rtsp://example/shed", name: "Shed", crop: CROP },
      ],
      "__cgc_stream_0__"
    );
    expect(card._getLiveCropStyle()).toBe("--crop-x:10%;--crop-y:20%;--crop-w:50;--crop-h:40;");
    // The pane takes the crop's shape: 16*50 : 9*40.
    expect(card._getPreviewAspectRatio(true)).toBe("800/360");
  });

  it("has no crop for a camera without one", () => {
    const card = makeCard([{ entity: "camera.door", name: "" }], "camera.door");
    expect(card._getLiveCropStyle()).toBe("");
    expect(card._getPreviewAspectRatio(true)).toBe("16/9");
  });
});
