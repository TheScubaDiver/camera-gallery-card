/**
 * Home Assistant's own two-way audio (HA 2026.11, Labs "Two-way audio").
 *
 * When a camera's integration supports it, HA reports
 * `two_way_audio: true` from the `camera/capabilities` websocket command and
 * `ha-camera-stream` gains a public `toggleMicrophone()` that sends the
 * browser microphone back over the existing WebRTC session. The stream fires
 * `microphone-changed` with `{ state: "off" | "connecting" | "on" | "denied" }`.
 *
 * The card's go2rtc backchannel (`live_mic_streams`) keeps priority: native
 * talk is only used for cameras without a configured backchannel, and can be
 * turned off with `live_native_talk: false`.
 */

/** `microphone-changed` states from HA's WebRTC player. */
export type NativeMicState = "off" | "connecting" | "on" | "denied";

/** The talkback UI states the card already renders for go2rtc. */
export interface TalkUiState {
  state: "idle" | "connecting" | "active";
  /** Error code (the card's existing mic error codes); `""` when there is none. */
  error: "" | "permission-denied" | "https-required";
}

/** Which backchannel the talk button uses for the current camera, if any. */
export function talkSource(opts: {
  cameraId: string;
  /** go2rtc backchannel stream configured for this camera (`""` = none). */
  go2rtcStream: string;
  /** HA reported `two_way_audio: true` for this camera. */
  nativeSupported: boolean;
  /** `live_native_talk` from the config (absent = on). */
  nativeEnabled: boolean | undefined;
}): "go2rtc" | "native" | null {
  if (opts.go2rtcStream) return "go2rtc";
  if (!String(opts.cameraId ?? "").startsWith("camera.")) return null;
  if (opts.nativeEnabled === false || !opts.nativeSupported) return null;
  return "native";
}

/** Map HA's microphone state onto the card's talkback UI states. */
export function nativeTalkUiState(
  mic: NativeMicState | string | null | undefined,
  { secureContext = true }: { secureContext?: boolean } = {}
): TalkUiState {
  if (!secureContext) return { state: "idle", error: "https-required" };
  switch (mic) {
    case "on":
      return { state: "active", error: "" };
    case "connecting":
      return { state: "connecting", error: "" };
    case "denied":
      return { state: "idle", error: "permission-denied" };
    default:
      return { state: "idle", error: "" };
  }
}

/**
 * Whether a pointer event should call `toggleMicrophone()`.
 * Toggle mode toggles on press; push-to-talk starts on press and stops on
 * release (or when the pointer leaves / is cancelled).
 */
export function nativeTalkShouldToggle(opts: {
  phase: "down" | "up";
  mode: "toggle" | "ptt" | string | undefined;
  mic: NativeMicState | string | null | undefined;
}): boolean {
  const live = opts.mic === "on" || opts.mic === "connecting";
  if (opts.mode === "ptt") return opts.phase === "down" ? !live && opts.mic !== "denied" : live;
  return opts.phase === "down" && opts.mic !== "denied";
}
