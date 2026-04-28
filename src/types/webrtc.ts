/**
 * Hand-typed shapes for the live-preview WebRTC path.
 *
 * Used with `hass.callWS({ type: "auth/sign_path", path: "/api/webrtc/ws" })`
 * and the AlexxIT/WebRTC integration's signaling protocol.
 */
export interface SignedPath {
  path: string;
}

export interface WebRtcAnswer {
  answer: string;
}
