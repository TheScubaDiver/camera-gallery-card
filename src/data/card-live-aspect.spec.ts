// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The real card sizes its live pane to the picture (#289): video streams via
// videoWidth/videoHeight, MJPEG cameras via the <img> HA shows for them.
let card: any;
let streamRoot: ShadowRoot;

function setSize(el: HTMLElement, props: Record<string, number>) {
  for (const [k, v] of Object.entries(props))
    Object.defineProperty(el, k, { value: v, configurable: true });
}

beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  await import("../index.js");
});

beforeEach(() => {
  vi.useFakeTimers();
  card = document.createElement("camera-gallery-card");
  card.requestUpdate = vi.fn();
  card._aspectRatio = "16/9";
  const root = card.attachShadow({ mode: "open" });
  Object.defineProperty(card, "renderRoot", { value: root });
  const host = document.createElement("div");
  host.id = "live-card-host";
  root.append(host);
  const stream = document.createElement("div");
  host.append(stream);
  streamRoot = stream.attachShadow({ mode: "open" });
});

afterEach(() => {
  if (card._autoAspectObs) clearInterval(card._autoAspectObs);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("card live aspect ratio", () => {
  it("uses an MJPEG image's size once its first frame is in", () => {
    const img = document.createElement("img");
    setSize(img, { naturalWidth: 0, naturalHeight: 0 });
    streamRoot.append(img);
    card._setupAutoAspectRatio();
    expect(card._aspectRatio).toBe("16/9");
    setSize(img, { naturalWidth: 1280, naturalHeight: 960 });
    vi.advanceTimersByTime(500);
    expect(card._aspectRatio).toBe("1280/960");
  });

  it("uses a video's size", () => {
    const video = document.createElement("video");
    setSize(video, { videoWidth: 1920, videoHeight: 1080 });
    streamRoot.append(video);
    card._setupAutoAspectRatio();
    expect(card._aspectRatio).toBe("1920/1080");
  });

  it("prefers the video when both are present", () => {
    const img = document.createElement("img");
    setSize(img, { naturalWidth: 640, naturalHeight: 480 });
    const video = document.createElement("video");
    setSize(video, { videoWidth: 1920, videoHeight: 1080 });
    streamRoot.append(img, video);
    card._setupAutoAspectRatio();
    expect(card._aspectRatio).toBe("1920/1080");
  });

  it("stops trying after a while without a picture", () => {
    card._setupAutoAspectRatio();
    vi.advanceTimersByTime(16_000);
    expect(card._autoAspectObs).toBeNull();
    expect(card._aspectRatio).toBe("16/9");
  });
});
