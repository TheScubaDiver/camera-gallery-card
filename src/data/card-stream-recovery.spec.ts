// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Wires the real card's frozen-stream tick to the watchdog: a fake <video>
// whose currentTime we control, fake timers for the 1 s sampling interval.
// The rebuild itself is stubbed; what matters here is when the card asks for
// one, and when it refuses to.
let card: any;
let video: any;
let time: number;
let paused: boolean;

function freeze() {
  // currentTime stops moving; everything else stays "playing".
  Object.defineProperty(video, "currentTime", { get: () => time, configurable: true });
}

function playSeconds(seconds: number) {
  for (let i = 0; i < seconds; i++) {
    time += 1;
    vi.advanceTimersByTime(1000);
  }
}

function frozenSeconds(seconds: number) {
  vi.advanceTimersByTime(seconds * 1000);
}

beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  await import("../index.js");
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
  card = document.createElement("camera-gallery-card");
  card.requestUpdate = vi.fn();
  card.config = {
    live_cameras: [{ entity: "camera.test" }],
    live_go2rtc_url: "https://example.invalid",
  };
  card._viewMode = "live";
  card._isLiveActive = () => card._viewMode === "live";
  const root = card.attachShadow({ mode: "open" });
  Object.defineProperty(card, "renderRoot", { value: root });
  const host = document.createElement("div");
  host.id = "live-card-host";
  root.append(host);
  video = document.createElement("video");
  host.append(video);
  time = 0;
  paused = false;
  Object.defineProperty(video, "paused", { get: () => paused, configurable: true });
  Object.defineProperty(video, "currentTime", { get: () => time, configurable: true });
  card._recoverLiveStream = vi.fn();
  card._startStreamWatch();
});

afterEach(() => {
  card._stopStreamWatch();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("card frozen-stream recovery", () => {
  it("leaves a healthy stream alone", () => {
    playSeconds(60);
    expect(card._recoverLiveStream).not.toHaveBeenCalled();
  });

  it("rebuilds the stream once it has frozen for about six seconds", () => {
    playSeconds(10);
    freeze();
    frozenSeconds(5);
    expect(card._recoverLiveStream).not.toHaveBeenCalled();
    frozenSeconds(2);
    expect(card._recoverLiveStream).toHaveBeenCalledTimes(1);
  });

  it("does nothing when auto recovery is switched off", () => {
    card.config.live_auto_recover = false;
    playSeconds(10);
    freeze();
    frozenSeconds(60);
    expect(card._recoverLiveStream).not.toHaveBeenCalled();
  });

  it("does nothing outside the live view", () => {
    playSeconds(10);
    card._viewMode = "media";
    freeze();
    frozenSeconds(60);
    expect(card._recoverLiveStream).not.toHaveBeenCalled();
  });

  it("does not judge while Picture-in-Picture is open", () => {
    playSeconds(10);
    freeze();
    Object.defineProperty(document, "pictureInPictureElement", {
      value: video,
      configurable: true,
    });
    frozenSeconds(60);
    expect(card._recoverLiveStream).not.toHaveBeenCalled();
    Object.defineProperty(document, "pictureInPictureElement", { value: null, configurable: true });
  });

  it("does not judge while talkback is on", () => {
    playSeconds(10);
    freeze();
    card._micState = "active";
    frozenSeconds(60);
    expect(card._recoverLiveStream).not.toHaveBeenCalled();
  });

  it("does not judge a paused video", () => {
    playSeconds(10);
    paused = true;
    freeze();
    frozenSeconds(60);
    expect(card._recoverLiveStream).not.toHaveBeenCalled();
  });

  it("shows the stopped notice after the last attempt, and hides it again on 'Try again'", () => {
    playSeconds(5);
    freeze();
    // Attempt 1 after 6 s; the rebuild is stubbed, so the same element stays
    // frozen and is judged with the startup allowance (15 s) plus backoff.
    frozenSeconds(7);
    expect(card._recoverLiveStream).toHaveBeenCalledTimes(1);
    frozenSeconds(17);
    expect(card._recoverLiveStream).toHaveBeenCalledTimes(2);
    frozenSeconds(20);
    expect(card._recoverLiveStream).toHaveBeenCalledTimes(3);
    expect(card._streamLost).toBe(false);
    frozenSeconds(16);
    expect(card._streamLost).toBe(true);

    card._retryLiveStream();
    expect(card._streamLost).toBe(false);
    expect(card._recoverLiveStream).toHaveBeenCalledTimes(4);
  });

  it("hides the notice by itself when the stream starts moving again", () => {
    playSeconds(5);
    freeze();
    frozenSeconds(7 + 17 + 20 + 16);
    expect(card._streamLost).toBe(true);
    playSeconds(2);
    expect(card._streamLost).toBe(false);
  });

  it("resets the attempt counter when the camera changes", () => {
    playSeconds(5);
    freeze();
    frozenSeconds(7);
    expect(card._streamWatch.recoveries).toBe(1);
    card._resetStreamWatch();
    expect(card._streamWatch.recoveries).toBe(0);
  });
});
