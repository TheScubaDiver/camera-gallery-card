import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  armWebkitExitResume,
  captureHandoff,
  galleryFullscreenTarget,
  handoffStartTime,
  liveFullscreenTarget,
  pickVideoFullscreen,
  sameMediaUrl,
  shouldResumeAfterExit,
} from "./video-fullscreen";

const noop = () => {};

describe("pickVideoFullscreen", () => {
  it("falls back to the overlay without a video element", () => {
    expect(pickVideoFullscreen(null, true)).toBe("overlay");
  });

  it("prefers the webkit video fullscreen when the element supports it", () => {
    const video = {
      webkitSupportsFullscreen: true,
      webkitEnterFullscreen: noop,
      requestFullscreen: noop,
    };
    expect(pickVideoFullscreen(video, true)).toBe("webkit");
  });

  it("ignores webkitEnterFullscreen when the element reports no support yet", () => {
    const video = {
      webkitSupportsFullscreen: false,
      webkitEnterFullscreen: noop,
      requestFullscreen: noop,
    };
    expect(pickVideoFullscreen(video, true)).toBe("standard");
  });

  it("uses the standard API when the document allows it", () => {
    const video = { requestFullscreen: noop };
    expect(pickVideoFullscreen(video, true)).toBe("standard");
  });

  it("falls back to the overlay when the document forbids fullscreen", () => {
    const video = { requestFullscreen: noop };
    expect(pickVideoFullscreen(video, false)).toBe("overlay");
  });

  it("falls back to the overlay when no fullscreen API exists", () => {
    expect(pickVideoFullscreen({}, true)).toBe("overlay");
  });
});

describe("shouldResumeAfterExit", () => {
  const exitedAt = 10_000;

  it("resumes when iPhone pauses the clip right after leaving fullscreen", () => {
    expect(shouldResumeAfterExit(true, exitedAt + 50, exitedAt)).toBe(true);
  });

  it("resumes when the forced pause lands just before the exit event", () => {
    expect(shouldResumeAfterExit(true, exitedAt - 200, exitedAt)).toBe(true);
  });

  it("leaves a clip alone that the user paused earlier in fullscreen", () => {
    expect(shouldResumeAfterExit(true, exitedAt - 5_000, exitedAt)).toBe(false);
  });

  it("leaves a clip alone that was paused before entering fullscreen", () => {
    expect(shouldResumeAfterExit(false, exitedAt + 50, exitedAt)).toBe(false);
  });

  it("does nothing when no pause happened", () => {
    expect(shouldResumeAfterExit(true, null, exitedAt)).toBe(false);
  });
});

describe("armWebkitExitResume", () => {
  const makeVideo = () => {
    const listeners: Record<string, Array<() => void>> = {};
    return {
      paused: false,
      plays: 0,
      addEventListener(type: string, fn: () => void, opts?: { once: boolean }) {
        const wrapped = opts?.once
          ? () => {
              listeners[type] = (listeners[type] ?? []).filter((f) => f !== wrapped);
              fn();
            }
          : fn;
        (listeners[type] ??= []).push(wrapped);
      },
      fire(type: string) {
        for (const fn of [...(listeners[type] ?? [])]) fn();
      },
      play() {
        this.plays++;
        return Promise.resolve();
      },
    };
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("plays again once iPhone has paused the stream after exit", () => {
    const video = makeVideo();
    armWebkitExitResume(video);
    video.fire("webkitendfullscreen");
    video.paused = true;
    vi.advanceTimersByTime(500);
    expect(video.plays).toBe(1);
  });

  it("does nothing when playback survived the exit", () => {
    const video = makeVideo();
    armWebkitExitResume(video);
    video.fire("webkitendfullscreen");
    vi.advanceTimersByTime(500);
    expect(video.plays).toBe(0);
  });

  it("only reacts to the first exit", () => {
    const video = makeVideo();
    armWebkitExitResume(video);
    video.fire("webkitendfullscreen");
    video.paused = true;
    vi.advanceTimersByTime(500);
    video.fire("webkitendfullscreen");
    vi.advanceTimersByTime(500);
    expect(video.plays).toBe(1);
  });
});

describe("liveFullscreenTarget", () => {
  const webkitVideo = { webkitSupportsFullscreen: true, webkitEnterFullscreen: noop };
  const plainVideo = { requestFullscreen: noop };

  it("keeps the card path by default", () => {
    expect(liveFullscreenTarget(undefined, false, webkitVideo, true)).toBe("card");
    expect(liveFullscreenTarget("card", false, webkitVideo, true)).toBe("card");
  });

  it("keeps the card path for grid layout, whatever the setting", () => {
    expect(liveFullscreenTarget("video", true, webkitVideo, true)).toBe("card");
  });

  it("goes native on Apple for a single camera", () => {
    expect(liveFullscreenTarget("video", false, webkitVideo, true)).toBe("webkit");
  });

  it("uses the video element's requestFullscreen elsewhere", () => {
    expect(liveFullscreenTarget("video", false, plainVideo, true)).toBe("standard");
  });

  it("falls back to the card path without a video element", () => {
    expect(liveFullscreenTarget("video", false, null, true)).toBe("card");
  });

  it("falls back to the card path when element fullscreen is unavailable", () => {
    expect(liveFullscreenTarget("video", false, plainVideo, false)).toBe("card");
  });
});

describe("galleryFullscreenTarget", () => {
  const iosVideo = { webkitSupportsFullscreen: true, webkitEnterFullscreen: noop };
  const desktopVideo = { requestFullscreen: noop };

  it("keeps the card overlay by default", () => {
    expect(galleryFullscreenTarget(undefined, iosVideo, true)).toBe("overlay");
    expect(galleryFullscreenTarget("overlay", desktopVideo, true)).toBe("overlay");
  });

  it("uses the platform player when gallery_fullscreen is video", () => {
    expect(galleryFullscreenTarget("video", iosVideo, false)).toBe("webkit");
    expect(galleryFullscreenTarget("video", desktopVideo, true)).toBe("standard");
  });

  it("falls back to the overlay where no native fullscreen exists", () => {
    expect(galleryFullscreenTarget("video", {}, false)).toBe("overlay");
    expect(galleryFullscreenTarget("video", null, true)).toBe("overlay");
  });
});

describe("playback handoff", () => {
  it("captures position, play state and rate", () => {
    expect(
      captureHandoff({
        currentSrc: "https://ha/x.mp4",
        currentTime: 12.5,
        paused: false,
        ended: false,
        playbackRate: 1.5,
      })
    ).toEqual({ src: "https://ha/x.mp4", time: 12.5, playing: true, rate: 1.5 });
    expect(captureHandoff({ src: "/x.mp4", currentTime: 3, paused: true })).toMatchObject({
      playing: false,
      rate: 1,
    });
    expect(captureHandoff({ currentTime: 3 })).toBeNull();
    expect(captureHandoff(null)).toBeNull();
  });

  it("compares relative and absolute URLs of the same file", () => {
    expect(sameMediaUrl("/media/a.mp4?authSig=1", "http://localhost/media/a.mp4?authSig=1")).toBe(
      true
    );
    expect(sameMediaUrl("/media/a.mp4", "/media/b.mp4")).toBe(false);
    expect(sameMediaUrl("", "/media/a.mp4")).toBe(false);
  });

  it("continues where the preview was, unless at the end", () => {
    const h = { src: "/a.mp4", time: 42, playing: true, rate: 1 };
    expect(handoffStartTime(h, 120)).toBe(42);
    expect(handoffStartTime({ ...h, time: 119.8 }, 120)).toBe(0);
    expect(handoffStartTime({ ...h, time: 0 }, 120)).toBe(0);
    expect(handoffStartTime(null, 120)).toBe(0);
    expect(handoffStartTime(h, NaN)).toBe(42);
  });
});
