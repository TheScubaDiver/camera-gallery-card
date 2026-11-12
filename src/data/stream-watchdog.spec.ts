import { describe, expect, it } from "vitest";
import { StreamWatchdog, type WatchSample } from "./stream-watchdog";

const OPTS = {
  stallMs: 6000,
  startupMs: 15000,
  retryDelaysMs: [0, 2000, 5000],
  healthyResetMs: 30000,
};

const VIDEO_A = { name: "A" };
const VIDEO_B = { name: "B" };

function sample(t: number, currentTime: number, extra: Partial<WatchSample> = {}): WatchSample {
  return { t, key: VIDEO_A, currentTime, paused: false, ended: false, ...extra };
}

/** Feed a stream that plays normally: currentTime follows the clock. */
function playFor(w: StreamWatchdog, from: number, to: number, key: unknown = VIDEO_A) {
  for (let t = from; t <= to; t += 1000) {
    w.observe(sample(t, t / 1000, { key }));
  }
}

describe("StreamWatchdog", () => {
  it("does nothing while the stream plays normally", () => {
    const w = new StreamWatchdog(OPTS);
    for (let t = 0; t <= 60000; t += 1000) {
      expect(w.observe(sample(t, t / 1000))).toBe("none");
    }
  });

  it("recovers a stream that was playing and then stops advancing", () => {
    const w = new StreamWatchdog(OPTS);
    playFor(w, 0, 10000); // playing, last advance at 10s
    // Frozen at currentTime 10 from here on.
    expect(w.observe(sample(11000, 10))).toBe("none");
    expect(w.observe(sample(15000, 10))).toBe("none");
    expect(w.observe(sample(16000, 10))).toBe("recover"); // 6s after last advance
    expect(w.recoveries).toBe(1);
  });

  it("gives a slow-starting stream the longer startup allowance", () => {
    const w = new StreamWatchdog(OPTS);
    w.observe(sample(0, 0));
    // Never advances, but only 14s have passed: still connecting.
    expect(w.observe(sample(7000, 0))).toBe("none");
    expect(w.observe(sample(14000, 0))).toBe("none");
    expect(w.observe(sample(15000, 0))).toBe("recover");
  });

  it("waits longer before each further attempt, then gives up once", () => {
    const w = new StreamWatchdog(OPTS);
    playFor(w, 0, 5000);
    // Attempt 1: 6s + 0s after the freeze at 5s.
    expect(w.observe(sample(11000, 5))).toBe("recover");
    // Rebuilt stream (new element) never starts: startup allowance 15s + 2s.
    w.observe(sample(11500, 0, { key: VIDEO_B }));
    expect(w.observe(sample(11500 + 16000, 0, { key: VIDEO_B }))).toBe("none");
    expect(w.observe(sample(11500 + 17000, 0, { key: VIDEO_B }))).toBe("recover");
    // Attempt 3: 15s + 5s.
    expect(w.observe(sample(11500 + 17000 + 19000, 0, { key: VIDEO_B }))).toBe("none");
    expect(w.observe(sample(11500 + 17000 + 20000, 0, { key: VIDEO_B }))).toBe("recover");
    // Out of attempts: one give-up, then silence.
    const t0 = 11500 + 17000 + 20000;
    expect(w.observe(sample(t0 + 14000, 0, { key: VIDEO_B }))).toBe("none");
    expect(w.observe(sample(t0 + 15000, 0, { key: VIDEO_B }))).toBe("give-up");
    expect(w.observe(sample(t0 + 60000, 0, { key: VIDEO_B }))).toBe("none");
  });

  it("starts over with a fresh allowance on a new video element", () => {
    const w = new StreamWatchdog(OPTS);
    playFor(w, 0, 10000);
    // Camera switch: new element, currentTime back at 0, long gap since the old one.
    expect(w.observe(sample(20000, 0, { key: VIDEO_B }))).toBe("none");
    expect(w.observe(sample(25000, 0, { key: VIDEO_B }))).toBe("none");
    expect(w.observe(sample(26000, 0.5, { key: VIDEO_B }))).toBe("none");
  });

  it("does not judge a paused or ended video", () => {
    const w = new StreamWatchdog(OPTS);
    playFor(w, 0, 3000);
    for (let t = 4000; t <= 60000; t += 1000) {
      expect(w.observe(sample(t, 3, { paused: true }))).toBe("none");
    }
    expect(w.observe(sample(61000, 3, { ended: true }))).toBe("none");
  });

  it("does not count blocked time as frozen time", () => {
    const w = new StreamWatchdog(OPTS);
    playFor(w, 0, 3000);
    // Hidden tab for a minute: no verdict, and the clock restarts every sample.
    for (let t = 4000; t <= 64000; t += 1000) {
      expect(w.observe(sample(t, 3), true)).toBe("none");
    }
    // Visible again: the allowance counts from the last blocked sample (64s),
    // not from the freeze 60 seconds earlier.
    expect(w.observe(sample(65000, 3))).toBe("none");
    expect(w.observe(sample(69000, 3))).toBe("none");
    expect(w.observe(sample(70000, 3))).toBe("recover");
  });

  it("ignores a missing video", () => {
    const w = new StreamWatchdog(OPTS);
    expect(w.observe(null)).toBe("none");
    expect(w.observe(null, true)).toBe("none");
  });

  it("restores the attempt counter after a long healthy stretch", () => {
    const w = new StreamWatchdog(OPTS);
    playFor(w, 0, 5000);
    expect(w.observe(sample(11000, 5))).toBe("recover");
    expect(w.recoveries).toBe(1);
    // Rebuilt stream plays for 31s straight.
    playFor(w, 12000, 44000, VIDEO_B);
    expect(w.recoveries).toBe(0);
    // A later freeze gets the full set of attempts again.
    expect(w.observe(sample(45000, 44, { key: VIDEO_B }))).toBe("none");
    expect(w.observe(sample(51000, 44, { key: VIDEO_B }))).toBe("recover");
  });

  it("lifts a give-up when the stream moves again by itself", () => {
    const w = new StreamWatchdog({ ...OPTS, retryDelaysMs: [0] });
    w.observe(sample(0, 0));
    expect(w.observe(sample(15000, 0))).toBe("recover");
    w.observe(sample(15500, 0, { key: VIDEO_B }));
    expect(w.observe(sample(15500 + 15000, 0, { key: VIDEO_B }))).toBe("give-up");
    // Network comes back and the video starts advancing.
    expect(w.observe(sample(40000, 1, { key: VIDEO_B }))).toBe("none");
    expect(w.observe(sample(41000, 2, { key: VIDEO_B }))).toBe("none");
    // Frozen again: judged again, and with no attempts left it gives up again.
    expect(w.observe(sample(46000, 2, { key: VIDEO_B }))).toBe("none");
    expect(w.observe(sample(47000, 2, { key: VIDEO_B }))).toBe("give-up");
  });

  it("reset() forgets the stream and the attempt counter", () => {
    const w = new StreamWatchdog(OPTS);
    playFor(w, 0, 5000);
    w.observe(sample(11000, 5));
    expect(w.recoveries).toBe(1);
    w.reset();
    expect(w.recoveries).toBe(0);
  });
});
