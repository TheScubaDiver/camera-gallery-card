/** Narrow compatibility adapter for HA's muted-start WebRTC audio omission.
 * Reuses receiver tracks; HA retains ownership of stream/track cleanup.
 * No new stream, capture, cloning, negotiation or temporary unmute.
 */
interface HaWebRtcPlayer extends HTMLElement {
  muted: boolean;
  _peerConnection?: RTCPeerConnection;
  _remoteStream?: MediaStream;
}

export interface LiveAudioSyncResult {
  video: HTMLVideoElement | null;
  recovered: boolean;
  status: string;
}

function descendants(root: Element): Element[] {
  const result = [root];
  for (const element of root.querySelectorAll("*")) result.push(element);
  // Shadow roots can nest through camera-stream -> WebRTC/HLS -> video.
  for (let i = 0; i < result.length; i++) {
    const shadow = result[i]?.shadowRoot;
    if (shadow) result.push(...shadow.querySelectorAll("*"));
  }
  return result;
}

export function syncLiveAudio(root: Element, muted: boolean): LiveAudioSyncResult {
  const elements = descendants(root);
  const video = elements.find((el) => el.localName === "video") as HTMLVideoElement | undefined;
  // Apply the desired state at every layer, before adding receiver tracks.
  // Updating just the DOM video is insufficient: Lit may overwrite it later.
  for (const el of elements) {
    if (
      ["video", "ha-camera-stream", "ha-web-rtc-player", "ha-hls-player"].includes(el.localName)
    ) {
      const player = el as HTMLElement & { muted: boolean };
      if (player.muted !== muted) player.muted = muted;
    }
  }
  const player = elements.find((el) => el.localName === "ha-web-rtc-player") as
    | HaWebRtcPlayer
    | undefined;
  if (!player)
    return { video: video ?? null, recovered: false, status: "Standard media mute control" };
  // Read the current internals on EVERY call; a reconnect replaces both.
  const pc = player._peerConnection;
  const stream = player._remoteStream;
  if (!pc || !stream) {
    const supported = "_peerConnection" in player || "_remoteStream" in player;
    return {
      video: video ?? null,
      recovered: false,
      status: supported
        ? "Waiting for WebRTC audio"
        : "HA audio recovery unsupported: player internals unavailable",
    };
  }
  if (pc.connectionState === "closed" || pc.signalingState === "closed") {
    return {
      video: video ?? null,
      recovered: false,
      status: "Waiting for current WebRTC connection",
    };
  }
  if (
    typeof pc.getReceivers !== "function" ||
    typeof stream.getAudioTracks !== "function" ||
    typeof stream.addTrack !== "function"
  ) {
    return {
      video: video ?? null,
      recovered: false,
      status: "HA audio recovery unsupported: receiver/stream API unavailable",
    };
  }
  // Never attach audio to a stale video or a stream not yet mounted by HA.
  if (!video || video.srcObject !== stream) {
    return { video: video ?? null, recovered: false, status: "Waiting for current WebRTC media" };
  }
  let recovered = false;
  try {
    const existing = stream.getAudioTracks();
    for (const receiver of pc.getReceivers()) {
      const track = receiver.track;
      if (track?.kind !== "audio" || track.readyState === "ended" || existing.includes(track))
        continue;
      stream.addTrack(track);
      recovered = true;
    }
    return {
      video,
      recovered,
      status: stream.getAudioTracks().length
        ? "WebRTC listening audio ready"
        : "No WebRTC audio receiver yet",
    };
  } catch {
    return {
      video,
      recovered,
      status: "HA audio recovery unsupported: receiver/stream access failed",
    };
  }
}
