/**
 * Frozen live-stream detector.
 *
 * Pure decision logic, no DOM: the card samples its live `<video>` about once
 * a second and feeds the numbers in. The watchdog answers with what to do:
 * nothing, rebuild the stream (`recover`), or stop trying (`give-up`).
 *
 * A stream counts as frozen when the video claims to be playing but its
 * `currentTime` has not moved for a while. Two phases keep a slow connect
 * from being mistaken for a freeze:
 *   - startup: a fresh video element has not advanced yet — long allowance.
 *   - playing: it has advanced at least once — short allowance.
 * Each rebuilt stream is a new video element, so it starts in `startup`.
 */

/** Allowance before a stream that was playing is called frozen. */
export const STALL_MS = 6000;
/** Allowance for a fresh stream to start moving at all. */
export const STARTUP_MS = 15000;
/** Extra wait before the 1st, 2nd and 3rd rebuild. Its length is the attempt cap. */
export const RETRY_DELAYS_MS: readonly number[] = [0, 2000, 5000];
/** Continuous healthy playback after which the attempt counter starts over. */
export const HEALTHY_RESET_MS = 30000;
/** `currentTime` must move by more than this to count as progress. */
const MIN_ADVANCE_S = 0.01;

export interface WatchSample {
  /** Monotonic-ish clock in ms (Date.now() is fine). */
  t: number;
  /** Identity of the video element. A new element means a new stream. */
  key: unknown;
  currentTime: number;
  paused: boolean;
  ended: boolean;
}

export type WatchAction = "none" | "recover" | "give-up";

export interface StreamWatchdogOptions {
  stallMs?: number;
  startupMs?: number;
  retryDelaysMs?: readonly number[];
  healthyResetMs?: number;
}

export class StreamWatchdog {
  private readonly stallMs: number;
  private readonly startupMs: number;
  private readonly retryDelaysMs: readonly number[];
  private readonly healthyResetMs: number;

  private key: unknown = null;
  private lastTime = Number.NaN;
  private lastAdvanceAt = 0;
  private hasAdvanced = false;
  private healthySince = 0;
  private attempts = 0;
  private gaveUp = false;

  constructor(opts: StreamWatchdogOptions = {}) {
    this.stallMs = opts.stallMs ?? STALL_MS;
    this.startupMs = opts.startupMs ?? STARTUP_MS;
    this.retryDelaysMs = opts.retryDelaysMs ?? RETRY_DELAYS_MS;
    this.healthyResetMs = opts.healthyResetMs ?? HEALTHY_RESET_MS;
  }

  /** Rebuilds done since the counter last reset. */
  get recoveries(): number {
    return this.attempts;
  }

  /** True after a `give-up` verdict, until the stream moves again or reset(). */
  get givenUp(): boolean {
    return this.gaveUp;
  }

  /** Forget the current stream, e.g. after the user switched camera. */
  reset(): void {
    this.key = null;
    this.lastTime = Number.NaN;
    this.hasAdvanced = false;
    this.healthySince = 0;
    this.attempts = 0;
    this.gaveUp = false;
  }

  /**
   * Feed one sample. `blocked` means "do not judge right now": hidden tab,
   * native fullscreen or Picture-in-Picture, an active talkback. Blocked
   * samples also restart the clock, so the time spent blocked never counts
   * as frozen time.
   */
  observe(sample: WatchSample | null, blocked = false): WatchAction {
    if (!sample || blocked || sample.paused || sample.ended) {
      // Nothing to judge. Restart the clock so the first judged sample after
      // this gets a full allowance rather than inheriting the gap.
      if (sample) this.restartClock(sample);
      return "none";
    }

    if (sample.key !== this.key) {
      // A new stream (first sample, camera switch, or our own rebuild).
      this.key = sample.key;
      this.lastTime = sample.currentTime;
      this.lastAdvanceAt = sample.t;
      this.hasAdvanced = false;
      this.healthySince = 0;
      return "none";
    }

    const advanced = Number.isFinite(this.lastTime)
      ? Math.abs(sample.currentTime - this.lastTime) > MIN_ADVANCE_S
      : false;
    if (advanced) {
      this.lastTime = sample.currentTime;
      this.lastAdvanceAt = sample.t;
      if (!this.hasAdvanced) {
        this.hasAdvanced = true;
        this.healthySince = sample.t;
      }
      // Playing again by itself (or after a manual refresh): lift any give-up.
      this.gaveUp = false;
      if (this.attempts > 0 && sample.t - this.healthySince >= this.healthyResetMs) {
        this.attempts = 0;
      }
      return "none";
    }

    if (this.gaveUp) return "none";

    const stalledFor = sample.t - this.lastAdvanceAt;
    const base = this.hasAdvanced ? this.stallMs : this.startupMs;
    const delay = this.retryDelaysMs[this.attempts];
    if (delay === undefined) {
      // Out of attempts and still not moving.
      if (stalledFor >= base) {
        this.gaveUp = true;
        return "give-up";
      }
      return "none";
    }
    if (stalledFor >= base + delay) {
      this.attempts += 1;
      // The caller rebuilds the stream; the new element arrives under a new
      // key and starts its own startup allowance. Reset the clock now so an
      // unchanged key (a failed rebuild) is not judged on the old timestamp.
      this.lastAdvanceAt = sample.t;
      this.hasAdvanced = false;
      this.healthySince = 0;
      return "recover";
    }
    return "none";
  }

  private restartClock(sample: WatchSample): void {
    this.lastAdvanceAt = sample.t;
    if (sample.key === this.key) this.lastTime = sample.currentTime;
  }
}
