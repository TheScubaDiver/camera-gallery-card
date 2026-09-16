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
