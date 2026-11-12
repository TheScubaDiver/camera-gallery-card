/**
 * Which fullscreen API the gallery pill should use for a clip.
 * webkit: native player on iOS/macOS and the only option inside the
 * Companion apps. standard: requestFullscreen elsewhere. overlay: the
 * card's own CSS overlay, same as images.
 */
export type VideoFullscreenMode = "webkit" | "standard" | "overlay";

export interface FullscreenCapableVideo {
  webkitSupportsFullscreen?: boolean;
  webkitEnterFullscreen?: unknown;
  requestFullscreen?: unknown;
}

export function pickVideoFullscreen(
  video: FullscreenCapableVideo | null | undefined,
  fullscreenEnabled: boolean
): VideoFullscreenMode {
  if (!video) return "overlay";
  if (video.webkitSupportsFullscreen && typeof video.webkitEnterFullscreen === "function") {
    return "webkit";
  }
  if (fullscreenEnabled && typeof video.requestFullscreen === "function") return "standard";
  return "overlay";
}

/**
 * Gallery clips: the card's own overlay unless `gallery_fullscreen: video`,
 * which hands the playing preview to the platform player (falling back to
 * the overlay where no native fullscreen exists).
 */
export function galleryFullscreenTarget(
  mode: string | undefined,
  video: FullscreenCapableVideo | null | undefined,
  fullscreenEnabled: boolean
): VideoFullscreenMode {
  if (mode !== "video") return "overlay";
  return pickVideoFullscreen(video, fullscreenEnabled);
}

/** A pause this close to the exit event is iPhone's doing, not the user's. */
export const EXIT_PAUSE_WINDOW_MS = 1000;

/**
 * iPhone WebKit pauses the clip when leaving native fullscreen, a beat
 * after webkitendfullscreen fires. Resume only if the clip was playing
 * when we went fullscreen and the pause landed around the exit.
 */
export function shouldResumeAfterExit(
  wasPlaying: boolean,
  pausedAt: number | null,
  exitedAt: number
): boolean {
  return wasPlaying && pausedAt !== null && pausedAt >= exitedAt - EXIT_PAUSE_WINDOW_MS;
}

export interface ResumableVideo {
  paused: boolean;
  addEventListener(type: string, fn: () => void, opts?: { once: boolean }): void;
  play(): Promise<void>;
}

/** Live view has no user pause, so any pause after exit is iPhone's. */
export function armWebkitExitResume(video: ResumableVideo, delayMs = 500): void {
  video.addEventListener(
    "webkitendfullscreen",
    () => {
      setTimeout(() => {
        if (video.paused) video.play().catch(() => {});
      }, delayMs);
    },
    { once: true }
  );
}

export type LiveFullscreenTarget = "webkit" | "standard" | "card";

/**
 * Live view: card-level unless `live_fullscreen: video` on a single
 * camera. Grid always goes card-level since there is more than one video.
 */
export function liveFullscreenTarget(
  mode: string | undefined,
  isGrid: boolean,
  video: FullscreenCapableVideo | null | undefined,
  fullscreenEnabled: boolean
): LiveFullscreenTarget {
  if (mode !== "video" || isGrid) return "card";
  const pick = pickVideoFullscreen(video, fullscreenEnabled);
  return pick === "overlay" ? "card" : pick;
}

/**
 * Playback state handed between the preview video and the card overlay's
 * own `<video>`, so opening the overlay continues the clip instead of
 * restarting it, and closing it hands the position back (#155 / #239).
 */
export interface PlaybackHandoff {
  src: string;
  time: number;
  playing: boolean;
  rate: number;
}

export interface HandoffVideo {
  currentSrc?: string;
  src?: string;
  currentTime?: number;
  paused?: boolean;
  ended?: boolean;
  playbackRate?: number;
}

/** Snapshot of a video's playback, or null when it has no source. */
export function captureHandoff(video: HandoffVideo | null | undefined): PlaybackHandoff | null {
  const src = String(video?.currentSrc || video?.src || "");
  if (!video || !src) return null;
  return {
    src,
    time: Number.isFinite(video.currentTime) ? Number(video.currentTime) : 0,
    playing: video.paused === false && video.ended !== true,
    rate: Number(video.playbackRate) > 0 ? Number(video.playbackRate) : 1,
  };
}

/** Whether two media URLs point at the same file (relative vs absolute, same query). */
export function sameMediaUrl(a: unknown, b: unknown, base = "http://localhost/"): boolean {
  const sa = String(a ?? ""),
    sb = String(b ?? "");
  if (!sa || !sb) return false;
  try {
    return new URL(sa, base).href === new URL(sb, base).href;
  } catch {
    return sa === sb;
  }
}

/**
 * Where to continue: the handed-off time, or 0 when it's unknown or within
 * half a second of the end (a finished clip starts over).
 */
export function handoffStartTime(handoff: PlaybackHandoff | null, duration: number): number {
  if (!handoff || !(handoff.time > 0)) return 0;
  if (Number.isFinite(duration) && duration > 0 && handoff.time >= duration - 0.5) return 0;
  return handoff.time;
}
