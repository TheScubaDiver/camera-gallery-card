/**
 * WebRTC two-way audio (mic) client.
 *
 * Owns every piece of mic state the card used to carry inline:
 *   - capture stream + audio track
 *   - peer connection + WebSocket signaling channel
 *   - retry / abort / error ledger
 *   - AudioContext + AnalyserNode for the input-level ring
 *   - periodic `getStats()` snapshot for the diagnostics modal
 *
 * Architecture parallel to {@link PosterCacheClient} / {@link MediaSourceClient}:
 *
 *   - Constructor wires read-only **closures** (signPath, buildWsUrl, notify)
 *     instead of taking a raw `HomeAssistant` ref — the client stays
 *     dialect-agnostic and is trivially testable with fakes. The card builds
 *     the closures once over `this._hass`.
 *   - `setHass(hass)` is intentionally a no-op for now (signature reserved for
 *     parity with the other clients in case future stats / device-list
 *     features need it). The closures already capture the hass-bound work.
 *   - `start(streamName)` / `stop()` / `toggle(streamName)` are the user-facing
 *     operations. State transitions are linear: idle → connecting → active →
 *     idle. Re-entry while connecting is a no-op (S3).
 *   - `dispose()` closes everything (PC, WS, tracks, AudioContext, timers) and
 *     aborts any pending handshake. Card calls from `disconnectedCallback`.
 *
 * DOM coupling is fully injectable: `mediaDevices`, `audioContextFactory`,
 * `peerConnectionFactory`, `webSocketFactory`, and the timer/RAF scheduler all
 * default to the browser globals but every spec overrides them with fakes.
 */

import {
  MIC_ERROR_DISPLAY_MS,
  MIC_ICE_CONNECT_TIMEOUT_MS,
  MIC_ICE_DISCONNECT_GRACE_MS,
  MIC_LEVEL_RAF_THROTTLE_MS,
  MIC_MAX_TRANSIENT_RETRIES,
  MIC_PERSISTENT_NOTIFICATION_THROTTLE_MS,
  MIC_RETRY_DELAY_MS,
  MIC_STATS_POLL_MS,
  MIC_WS_CONNECT_TIMEOUT_MS,
} from "../const";
import type { HomeAssistant } from "../types/hass";
import type { SignedPath } from "../types/webrtc";

// ─── Public types ────────────────────────────────────────────────────────

export type MicState = "idle" | "connecting" | "active";

export type MicErrorCode =
  | "https-required"
  | "permission-denied"
  | "device-not-found"
  | "device-in-use"
  | "ws-connect-failed"
  | "ws-timeout"
  | "ws-server-error"
  | "ice-failed"
  | "stream-not-found"
  | "aborted"
  | "unknown";

export interface MicError {
  code: MicErrorCode;
  detail?: string;
}

export interface MicAudioProcessing {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export interface MicStats {
  state: MicState;
  iceState: RTCIceConnectionState | "closed";
  rttMs: number | null;
  packetLossPct: number | null;
  jitterMs: number | null;
  level: number;
  audioProcessing: MicAudioProcessing;
}

export interface WebRtcMicInputs {
  /** Sign a `/api/...` path so the WS handshake can authenticate. */
  signPath: (path: string) => Promise<SignedPath>;
  /** Build the WS URL from a signed path + go2rtc stream name. Card owns
   * the HA URL surgery so the data layer stays dialect-agnostic. */
  buildWsUrl: (signed: SignedPath, streamName: string) => string;
  /** Surface a HA `persistent_notification.create` (throttled). Receives
   * the typed `MicError`; the card formats it to a user-facing string so
   * the data layer stays locale-agnostic and never leaks internal codes
   * like `ws-server-error` into the HA notification panel. */
  notify: (err: MicError) => void;
}

export interface MicScheduler {
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (h: number) => void;
  setInterval: (fn: () => void, ms: number) => number;
  clearInterval: (h: number) => void;
  requestAnimationFrame: (fn: (t: number) => void) => number;
  cancelAnimationFrame: (h: number) => void;
}

export interface WebRtcMicClientOptions {
  inputs: WebRtcMicInputs;
  onChange: () => void;
  onError?: (err: MicError) => void;

  /** Per-track audio constraints (echo / noise / AGC) baseline. Overrides
   * the all-true defaults; `setAudioProcessing()` updates live. */
  audioProcessing?: Partial<MicAudioProcessing>;

  /** ICE servers passed to every `new RTCPeerConnection()`. Default = the
   * built-in `ICE_SERVERS` (public STUN + openrelay TURN). Power users with
   * a private Coturn override here. */
  iceServers?: ReadonlyArray<RTCIceServer>;

  /** Sets `iceTransportPolicy` on the PC. Default `"all"`; `"relay"`
   * forces TURN-only (some symmetric-NAT setups). */
  iceTransportPolicy?: RTCIceTransportPolicy;

  // Injection seams (specs override).
  mediaDevices?: MediaDevices;
  audioContextFactory?: () => AudioContext;
  peerConnectionFactory?: (config: RTCConfiguration) => RTCPeerConnection;
  webSocketFactory?: (url: string) => WebSocket;
  schedule?: MicScheduler;
  now?: () => number;
}

/**
 * Default ICE servers — **STUN-only** by design.
 *
 * Two-way audio is overwhelmingly LAN-bound: a browser on the same WiFi
 * (or HA Companion on the same Tailscale tunnel) talking to a camera on
 * the same network. STUN alone almost always succeeds in that topology,
 * and importantly does *not* route the user's microphone audio through a
 * third-party relay.
 *
 * Earlier versions defaulted to the public `openrelay.metered.ca` TURN.
 * That was a privacy regression — every failed direct ICE handshake
 * would silently proxy the user's voice through a free public relay
 * with no SLA and known rate limits. Users behind symmetric NAT who
 * genuinely need TURN configure it explicitly via `live_mic_ice_servers`
 * (see README for a Coturn snippet).
 */
export const ICE_SERVERS: ReadonlyArray<RTCIceServer> = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
];

/** ID used for the throttled persistent_notification. Card-namespaced. */
export const MIC_NOTIFICATION_ID = "cgc_mic_error";

// ─── Internal helpers ────────────────────────────────────────────────────

const DEFAULT_AUDIO_PROCESSING: MicAudioProcessing = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const defaultScheduler: MicScheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
  clearTimeout: (h) => globalThis.clearTimeout(h),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms) as unknown as number,
  clearInterval: (h) => globalThis.clearInterval(h),
  requestAnimationFrame: (fn) => globalThis.requestAnimationFrame(fn),
  cancelAnimationFrame: (h) => globalThis.cancelAnimationFrame(h),
};

/**
 * Classify an unknown error thrown / rejected during the handshake into a
 * tagged {@link MicError}. The card maps the code to a localized string at
 * render time; the data layer stays locale-agnostic.
 *
 * `DOMException.name` is the source of truth for `getUserMedia` rejections;
 * WS close codes get a separate path. Anything we can't recognise becomes
 * `unknown` carrying the stringified detail.
 */
export function classifyMicError(err: unknown): MicError {
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as MicError).code === "string"
  ) {
    // Build a clean { code, detail? } pair — strip any extra fields the
    // caller may have piggy-backed (e.g. an Error instance carrying our
    // tag for cross-Promise propagation).
    const tagged = err as MicError;
    return tagged.detail === undefined
      ? { code: tagged.code }
      : { code: tagged.code, detail: tagged.detail };
  }
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "SecurityError") {
      return { code: "permission-denied", detail: err.message };
    }
    if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
      return { code: "device-not-found", detail: err.message };
    }
    if (err.name === "NotReadableError" || err.name === "AbortError") {
      return err.name === "AbortError"
        ? { code: "aborted" }
        : { code: "device-in-use", detail: err.message };
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: "unknown", detail: message };
}

/**
 * Build `MediaTrackConstraints` for `getUserMedia`. `channelCount: 1` is
 * the right default for voice — Opus auto-negotiates sample rate, but mono
 * halves the upstream bandwidth without losing intelligibility. Cameras
 * with audio backchannels are virtually always mono speakers anyway.
 */
function buildAudioConstraints(ap: MicAudioProcessing): MediaTrackConstraints {
  return {
    echoCancellation: ap.echoCancellation,
    noiseSuppression: ap.noiseSuppression,
    autoGainControl: ap.autoGainControl,
    channelCount: 1,
  };
}

// ─── The client ───────────────────────────────────────────────────────────

export class WebRtcMicClient {
  private readonly _inputs: WebRtcMicInputs;
  private readonly _onChange: () => void;
  private readonly _onError: ((err: MicError) => void) | undefined;
  private readonly _mediaDevices: MediaDevices | undefined;
  private readonly _audioContextFactory: (() => AudioContext) | undefined;
  private readonly _peerConnectionFactory: (config: RTCConfiguration) => RTCPeerConnection;
  private readonly _webSocketFactory: (url: string) => WebSocket;
  private readonly _schedule: MicScheduler;
  private readonly _now: () => number;

  // ─── Mutable state ──────────────────────────────────────────────────────
  private _state: MicState = "idle";
  private _error: MicError | null = null;
  private _audioProcessing: MicAudioProcessing = { ...DEFAULT_AUDIO_PROCESSING };
  private _iceServers: ReadonlyArray<RTCIceServer> = ICE_SERVERS;
  private _iceTransportPolicy: RTCIceTransportPolicy = "all";

  private _stream: MediaStream | null = null;
  private _pc: RTCPeerConnection | null = null;
  private _ws: WebSocket | null = null;
  private _audioContext: AudioContext | null = null;
  private _analyser: AnalyserNode | null = null;
  private _analyserBuf: Uint8Array | null = null;
  private _level = 0;

  private _abort: AbortController | null = null;
  private _errorTimer: number | null = null;
  private _statsInterval: number | null = null;
  private _levelRaf: number | null = null;
  private _lastLevelTickAt = 0;
  /** Set by `_performHandshake` after the SDP answer; cleared once ICE
   * transitions to `connected`/`completed`. While set, an ICE-disconnect
   * is fatal (we haven't even fully connected once yet). */
  private _iceConnectTimer: number | null = null;
  /** Set when ICE transitions to `disconnected` after we'd reached
   * `connected`. Cleared if ICE recovers within the grace window;
   * otherwise fires and surfaces `ice-failed`. */
  private _iceGraceTimer: number | null = null;
  // Initialised so the first error always fires `notify` — only later
  // failures within the throttle window are dropped.
  private _lastNotifyAt = -MIC_PERSISTENT_NOTIFICATION_THROTTLE_MS;
  private _retriesUsed = 0;

  private _lastStats: MicStats | null = null;
  private _iceState: RTCIceConnectionState | "closed" = "new";

  private _disposed = false;

  constructor(opts: WebRtcMicClientOptions) {
    this._inputs = opts.inputs;
    this._onChange = opts.onChange;
    this._onError = opts.onError;
    this._mediaDevices =
      opts.mediaDevices ?? (typeof navigator !== "undefined" ? navigator.mediaDevices : undefined);
    this._audioContextFactory = opts.audioContextFactory;
    this._peerConnectionFactory =
      opts.peerConnectionFactory ?? ((config): RTCPeerConnection => new RTCPeerConnection(config));
    this._webSocketFactory = opts.webSocketFactory ?? ((url): WebSocket => new WebSocket(url));
    this._schedule = opts.schedule ?? defaultScheduler;
    this._now = opts.now ?? (() => Date.now());
    if (opts.audioProcessing) {
      this._audioProcessing = { ...DEFAULT_AUDIO_PROCESSING, ...opts.audioProcessing };
    }
    if (opts.iceServers && opts.iceServers.length > 0) this._iceServers = opts.iceServers;
    if (opts.iceTransportPolicy) this._iceTransportPolicy = opts.iceTransportPolicy;
  }

  /** Reserved for future hass-dependent state refresh; today the closures
   * passed to the constructor already capture the hass-bound work. */
  setHass(_hass: HomeAssistant | null): void {
    /* noop — see class docstring */
  }

  state(): MicState {
    return this._state;
  }

  isActive(): boolean {
    return this._state === "active";
  }

  level(): number {
    return this._level;
  }

  error(): MicError | null {
    return this._error;
  }

  stats(): MicStats | null {
    if (this._state === "idle") return null;
    return this._lastStats ?? this._snapshotStats(null);
  }

  audioProcessing(): MicAudioProcessing {
    return { ...this._audioProcessing };
  }

  /** Update the audio constraints baseline. Takes effect on the next
   * `start()` — already-active sessions keep their existing track. */
  setAudioProcessing(ap: Partial<MicAudioProcessing>): void {
    this._audioProcessing = { ...this._audioProcessing, ...ap };
  }

  /** Replace the ICE config (servers + transport policy). Takes effect on
   * the next `start()`. Passing `null`/`undefined` for either field falls
   * back to the built-in defaults. Used by the card when the user edits
   * `live_mic_ice_servers` / `live_mic_force_relay` in YAML. */
  setIceConfig(opts: {
    iceServers?: ReadonlyArray<RTCIceServer> | null;
    iceTransportPolicy?: RTCIceTransportPolicy | null;
  }): void {
    if (opts.iceServers === null || (opts.iceServers && opts.iceServers.length === 0)) {
      this._iceServers = ICE_SERVERS;
    } else if (opts.iceServers !== undefined) {
      this._iceServers = opts.iceServers;
    }
    if (opts.iceTransportPolicy === null) {
      this._iceTransportPolicy = "all";
    } else if (opts.iceTransportPolicy !== undefined) {
      this._iceTransportPolicy = opts.iceTransportPolicy;
    }
  }

  // ─── Operations ─────────────────────────────────────────────────────────

  async toggle(streamName: string): Promise<void> {
    if (this._state === "active") {
      this.stop();
      return;
    }
    if (this._state === "connecting") return; // re-entrancy guard (S3)
    await this.start(streamName);
  }

  async start(streamName: string): Promise<void> {
    if (this._disposed) return;
    if (this._state !== "idle") return;
    this._retriesUsed = 0;
    await this._startInternal(streamName);
  }

  stop(): void {
    this._cancelLevelRaf();
    this._cancelStatsInterval();
    this._cancelIceConnectTimeout();
    this._cancelIceGrace();
    if (this._abort) {
      this._abort.abort();
      this._abort = null;
    }
    if (this._ws) {
      try {
        this._ws.close();
      } catch {
        /* already closing */
      }
      this._ws = null;
    }
    if (this._pc) {
      try {
        this._pc.close();
      } catch {
        /* already closing */
      }
      this._pc = null;
    }
    if (this._stream) {
      try {
        this._stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* track already stopped */
      }
      this._stream = null;
    }
    this._analyser = null;
    this._analyserBuf = null;
    this._level = 0;
    if (this._audioContext && this._audioContext.state !== "closed") {
      // Suspend (not close) so subsequent toggles reuse the context cheaply.
      this._audioContext.suspend().catch(() => {
        /* runtime may reject on already-closed contexts */
      });
    }
    this._iceState = "closed";
    this._lastStats = null;
    if (this._state !== "idle") {
      this._state = "idle";
      this._onChange();
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.stop();
    if (this._errorTimer !== null) {
      this._schedule.clearTimeout(this._errorTimer);
      this._errorTimer = null;
    }
    this._error = null;
    if (this._audioContext) {
      try {
        const ctx = this._audioContext;
        if (ctx.state !== "closed") {
          ctx.close().catch(() => {
            /* runtime may reject on already-closed */
          });
        }
      } catch {
        /* noop */
      }
      this._audioContext = null;
    }
  }

  // ─── Internal handshake ─────────────────────────────────────────────────

  private async _startInternal(streamName: string): Promise<void> {
    const name = String(streamName ?? "").trim();
    if (!name) {
      this._fail({ code: "stream-not-found" });
      return;
    }
    if (!this._mediaDevices || typeof this._mediaDevices.getUserMedia !== "function") {
      this._fail({ code: "https-required" });
      return;
    }

    this._abort = new AbortController();
    const signal = this._abort.signal;
    this._state = "connecting";
    this._error = null;
    this._onChange();

    try {
      // 1. Capture local audio. Result is stored on `this._stream` so the
      // teardown path can stop tracks even if the next async step throws.
      const stream = await this._mediaDevices.getUserMedia({
        audio: buildAudioConstraints(this._audioProcessing),
        video: false,
      });
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      this._stream = stream;

      // 2. Wire AudioContext + AnalyserNode for the level meter.
      this._mountAnalyser(stream);

      // 3. Sign the WS path.
      const signed = await this._inputs.signPath("/api/webrtc/ws");
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      const wsUrl = this._inputs.buildWsUrl(signed, name);

      // 4. Build the peer connection. `bundlePolicy: "max-bundle"` keeps
      //    every track on a single RTP transport — fewer ports to traverse,
      //    cleaner SDP, and required by go2rtc's negotiation expectations.
      //    `rtcpMuxPolicy: "require"` is the modern default but stated
      //    explicitly to lock the contract.
      const pc = this._peerConnectionFactory({
        iceServers: [...this._iceServers],
        iceTransportPolicy: this._iceTransportPolicy,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      });
      this._pc = pc;
      pc.oniceconnectionstatechange = (): void => this._onIceStateChange();
      // `connectionState` is the modern, monotonic version of
      // `iceConnectionState`. Both fire — we route both through the same
      // handler so we work on browsers that only fire one or the other.
      pc.onconnectionstatechange = (): void => this._onConnectionStateChange();

      const audioTracks = stream.getAudioTracks();
      const audioTrack = audioTracks[0];
      if (!audioTrack) throw new Error("no audio track");
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver(audioTrack, { direction: "sendonly" });

      // 5. Open the WS and race the offer/answer.
      const ws = this._webSocketFactory(wsUrl);
      this._ws = ws;
      await this._performHandshake(pc, ws, signal);
      if (signal.aborted) throw new DOMException("aborted", "AbortError");

      // 6. SDP exchange done — but ICE may still be gathering / connecting.
      //    State stays "connecting" until ICE flips to connected/completed
      //    (or the ICE-connect timeout fires). Stats polling and the level
      //    RAF start inside `_promoteToActive` — running them during
      //    "connecting" was buggy: the level RAF's tick guard exits on
      //    the very first frame when state isn't "active", killing the
      //    loop permanently before ICE ever connects.
      this._armIceConnectTimeout();
      // If ICE already finished gathering during the handshake (rare but
      // possible on LAN), promote to active immediately.
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        this._promoteToActive();
      }
      this._onChange();
    } catch (err) {
      const classified = classifyMicError(err);
      if (classified.code === "aborted") {
        // User-initiated cancellation — silent reset, no toast / retry.
        this._teardown();
        return;
      }
      if (this._shouldRetry(classified)) {
        this._retriesUsed += 1;
        this._teardown(); // aborts the old signal; that's fine — we don't reuse it
        await new Promise<void>((resolve) => {
          this._schedule.setTimeout(resolve, MIC_RETRY_DELAY_MS);
        });
        // The retry-window cancel signal is `_disposed` (not the old signal,
        // which is intentionally aborted by `_teardown`).
        if (this._disposed) return;
        await this._startInternal(name);
        return;
      }
      this._teardown();
      this._fail(classified);
    }
  }

  private async _performHandshake(
    pc: RTCPeerConnection,
    ws: WebSocket,
    signal: AbortSignal
  ): Promise<void> {
    return await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeoutHandle: number | null = null;
      const onAbort = (): void => {
        if (settled) return;
        settled = true;
        if (timeoutHandle !== null) this._schedule.clearTimeout(timeoutHandle);
        reject(new DOMException("aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });

      timeoutHandle = this._schedule.setTimeout(() => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        const cause: MicError = { code: "ws-timeout" };
        reject(Object.assign(new Error("ws-timeout"), cause));
      }, MIC_WS_CONNECT_TIMEOUT_MS) as number;

      const finishOk = (): void => {
        if (settled) return;
        settled = true;
        if (timeoutHandle !== null) this._schedule.clearTimeout(timeoutHandle);
        signal.removeEventListener("abort", onAbort);
        resolve();
      };
      const finishErr = (err: Error): void => {
        if (settled) return;
        settled = true;
        if (timeoutHandle !== null) this._schedule.clearTimeout(timeoutHandle);
        signal.removeEventListener("abort", onAbort);
        reject(err);
      };

      pc.onicecandidate = (e: RTCPeerConnectionIceEvent): void => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const candidate = e.candidate ? e.candidate.candidate : "";
        try {
          ws.send(JSON.stringify({ type: "webrtc/candidate", value: candidate }));
        } catch {
          /* WS closed mid-send — handshake will fail via close path */
        }
      };

      ws.onopen = async (): Promise<void> => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          ws.send(JSON.stringify({ type: "webrtc/offer", value: pc.localDescription?.sdp ?? "" }));
        } catch (err) {
          finishErr(err instanceof Error ? err : new Error(String(err)));
        }
      };

      ws.onmessage = async (evt: MessageEvent): Promise<void> => {
        try {
          const data = typeof evt.data === "string" ? evt.data : String(evt.data);
          const msg = JSON.parse(data) as { type?: string; value?: string };
          if (msg.type === "webrtc/answer") {
            await pc.setRemoteDescription({ type: "answer", sdp: msg.value ?? "" });
            finishOk();
          } else if (msg.type === "webrtc/candidate") {
            const v = msg.value;
            if (v) {
              try {
                await pc.addIceCandidate({ candidate: v, sdpMid: "0" });
              } catch {
                /* ICE candidate add failures are not fatal */
              }
            }
          } else if (msg.type === "error") {
            const cause: MicError = { code: "ws-server-error", detail: msg.value ?? "" };
            finishErr(Object.assign(new Error(msg.value ?? "go2rtc error"), cause));
          }
        } catch (err) {
          finishErr(err instanceof Error ? err : new Error(String(err)));
        }
      };

      ws.onerror = (): void => {
        const cause: MicError = { code: "ws-connect-failed" };
        finishErr(Object.assign(new Error("ws-connect-failed"), cause));
      };

      ws.onclose = (e: CloseEvent): void => {
        if (e.code === 1000) return;
        const cause: MicError = {
          code: "ws-connect-failed",
          detail: e.code === 1006 ? "abnormal closure (reverse proxy?)" : `close ${e.code}`,
        };
        finishErr(Object.assign(new Error(cause.detail ?? "ws closed"), cause));
      };
    });
  }

  // ─── ICE state machine ──────────────────────────────────────────────────
  //
  // RTCPeerConnection has two state surfaces:
  //   - `iceConnectionState`: legacy but universally fired. Values include
  //     `new`, `checking`, `connected`, `completed`, `failed`, `disconnected`,
  //     `closed`.
  //   - `connectionState`: modern, monotonic aggregate. Same nominal values
  //     but transitions in a more predictable order.
  //
  // We route both through `_handleIceLikeState` so we work on browsers that
  // fire only one of the two (older Firefox / Safari).
  //
  // The handshake completes when SDP answer is received, but media isn't
  // actually flowing until ICE connectivity is established. We keep the
  // pill in "connecting" until ICE transitions to `connected`/`completed`
  // (capped by `MIC_ICE_CONNECT_TIMEOUT_MS`). After that:
  //   - `failed` → terminal, fire `ice-failed` immediately.
  //   - `disconnected` → may be a transient WiFi blip; arm a grace timer
  //     for `MIC_ICE_DISCONNECT_GRACE_MS`, fire `ice-failed` if not back.
  //   - back to `connected`/`completed` → cancel the grace timer.

  private _onIceStateChange(): void {
    if (!this._pc) return;
    this._iceState = this._pc.iceConnectionState;
    this._handleIceLikeState(this._pc.iceConnectionState);
  }

  private _onConnectionStateChange(): void {
    if (!this._pc) return;
    // Mirror `connectionState` into `_iceState` so diagnostics show the
    // most informative value; the union type already allows the broader set.
    this._handleIceLikeState(this._pc.connectionState as RTCIceConnectionState);
  }

  private _handleIceLikeState(state: RTCIceConnectionState | RTCPeerConnectionState): void {
    if (state === "connected" || state === "completed") {
      this._cancelIceConnectTimeout();
      this._cancelIceGrace();
      if (this._state === "connecting") this._promoteToActive();
      return;
    }
    if (state === "failed") {
      this._cancelIceConnectTimeout();
      this._cancelIceGrace();
      this._fail({ code: "ice-failed", detail: state });
      return;
    }
    if (state === "disconnected") {
      // Pre-connect "disconnected" is fatal (we haven't connected yet).
      // Post-connect "disconnected" gets a grace window — modern browsers
      // routinely flap during WiFi handoffs.
      if (this._state === "active") {
        this._armIceGrace();
      } else {
        this._fail({ code: "ice-failed", detail: state });
      }
    }
  }

  private _promoteToActive(): void {
    if (this._state !== "connecting") return;
    this._state = "active";
    // Start the level meter and stats poll here, not when the SDP answer
    // arrives — the level RAF's `state !== "active"` guard would otherwise
    // exit immediately and never restart.
    this._startStatsInterval();
    this._startLevelRaf();
    this._onChange();
  }

  private _armIceConnectTimeout(): void {
    this._cancelIceConnectTimeout();
    this._iceConnectTimer = this._schedule.setTimeout(() => {
      this._iceConnectTimer = null;
      if (this._state === "connecting") {
        this._fail({ code: "ice-failed", detail: "connect timeout" });
      }
    }, MIC_ICE_CONNECT_TIMEOUT_MS) as number;
  }

  private _cancelIceConnectTimeout(): void {
    if (this._iceConnectTimer !== null) {
      this._schedule.clearTimeout(this._iceConnectTimer);
      this._iceConnectTimer = null;
    }
  }

  private _armIceGrace(): void {
    if (this._iceGraceTimer !== null) return;
    this._iceGraceTimer = this._schedule.setTimeout(() => {
      this._iceGraceTimer = null;
      // If we're still active and the ICE state is still disconnected (or
      // worse), give up. If ICE recovered, `_handleIceLikeState` already
      // cancelled this timer.
      if (this._state === "active") {
        this._fail({ code: "ice-failed", detail: "disconnected" });
      }
    }, MIC_ICE_DISCONNECT_GRACE_MS) as number;
  }

  private _cancelIceGrace(): void {
    if (this._iceGraceTimer !== null) {
      this._schedule.clearTimeout(this._iceGraceTimer);
      this._iceGraceTimer = null;
    }
  }

  // ─── Retry decision ─────────────────────────────────────────────────────

  private _shouldRetry(err: MicError): boolean {
    if (this._retriesUsed >= MIC_MAX_TRANSIENT_RETRIES) return false;
    return err.code === "ws-connect-failed" || err.code === "ws-timeout";
  }

  // ─── Error surfacing ────────────────────────────────────────────────────

  private _fail(err: MicError): void {
    if (err.code === "aborted") {
      this._teardown();
      return;
    }
    this._error = err;
    this._teardown();
    if (this._errorTimer !== null) this._schedule.clearTimeout(this._errorTimer);
    this._errorTimer = this._schedule.setTimeout(() => {
      this._error = null;
      this._errorTimer = null;
      this._onChange();
    }, MIC_ERROR_DISPLAY_MS) as number;
    this._notify(err);
    this._onError?.(err);
    this._onChange();
  }

  private _notify(err: MicError): void {
    const now = this._now();
    if (now - this._lastNotifyAt < MIC_PERSISTENT_NOTIFICATION_THROTTLE_MS) return;
    this._lastNotifyAt = now;
    this._inputs.notify(err);
  }

  /** Tear down PC/WS/stream/analyser without surfacing an error. Used by
   * the retry path and by the failure path before `_fail` records state. */
  private _teardown(): void {
    if (this._abort) {
      this._abort.abort();
      this._abort = null;
    }
    if (this._ws) {
      try {
        this._ws.close();
      } catch {
        /* noop */
      }
      this._ws = null;
    }
    if (this._pc) {
      try {
        this._pc.close();
      } catch {
        /* noop */
      }
      this._pc = null;
    }
    if (this._stream) {
      try {
        this._stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* noop */
      }
      this._stream = null;
    }
    this._cancelLevelRaf();
    this._cancelStatsInterval();
    this._cancelIceConnectTimeout();
    this._cancelIceGrace();
    this._analyser = null;
    this._analyserBuf = null;
    this._level = 0;
    this._iceState = "closed";
    this._lastStats = null;
    if (this._state !== "idle") {
      this._state = "idle";
    }
  }

  // ─── Level meter (AudioContext + AnalyserNode) ──────────────────────────

  private _mountAnalyser(stream: MediaStream): void {
    let ctx = this._audioContext;
    if (!ctx) {
      const make = this._audioContextFactory ?? ((): AudioContext => new AudioContext());
      try {
        ctx = make();
        this._audioContext = ctx;
      } catch {
        // AudioContext not available — level meter stays at 0.
        return;
      }
    }
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {
        /* user gesture required on some browsers; level just stays 0 */
      });
    }
    try {
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      src.connect(analyser);
      this._analyser = analyser;
      this._analyserBuf = new Uint8Array(analyser.fftSize);
    } catch {
      // jsdom / older browsers may not support stream-source — fall back
      // gracefully; the rest of the choreography still works.
    }
  }

  private _startLevelRaf(): void {
    if (this._levelRaf !== null) return;
    const tick = (t: number): void => {
      if (this._state !== "active") {
        this._levelRaf = null;
        return;
      }
      if (t - this._lastLevelTickAt >= MIC_LEVEL_RAF_THROTTLE_MS) {
        this._lastLevelTickAt = t;
        this._updateLevel();
      }
      this._levelRaf = this._schedule.requestAnimationFrame(tick);
    };
    this._levelRaf = this._schedule.requestAnimationFrame(tick);
  }

  private _cancelLevelRaf(): void {
    if (this._levelRaf !== null) {
      this._schedule.cancelAnimationFrame(this._levelRaf);
      this._levelRaf = null;
    }
  }

  private _updateLevel(): void {
    const a = this._analyser;
    const buf = this._analyserBuf;
    if (!a || !buf) return;
    // Use a fresh ArrayBuffer-backed view per tick so the strict
    // Uint8Array<ArrayBuffer> typing on getByteTimeDomainData is satisfied.
    const view = new Uint8Array(buf.buffer as ArrayBuffer);
    a.getByteTimeDomainData(view);
    let sum = 0;
    for (let i = 0; i < view.length; i++) {
      const v = (view[i] ?? 128) - 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / view.length) / 128; // 0..1
    // Smooth: weighted toward the new sample but with a short tail.
    this._level = this._level * 0.5 + rms * 0.5;
  }

  // ─── Stats polling ──────────────────────────────────────────────────────

  private _startStatsInterval(): void {
    if (this._statsInterval !== null) return;
    void this._collectStats();
    this._statsInterval = this._schedule.setInterval(() => {
      void this._collectStats();
    }, MIC_STATS_POLL_MS) as number;
  }

  private _cancelStatsInterval(): void {
    if (this._statsInterval !== null) {
      this._schedule.clearInterval(this._statsInterval);
      this._statsInterval = null;
    }
  }

  private async _collectStats(): Promise<void> {
    const pc = this._pc;
    if (!pc) return;
    try {
      const report = await pc.getStats();
      let rttMs: number | null = null;
      let packetsLost: number | null = null;
      let packetsSent: number | null = null;
      let jitterMs: number | null = null;
      report.forEach((entry: unknown) => {
        if (!entry || typeof entry !== "object") return;
        const stat = entry as Record<string, unknown>;
        const type = stat["type"];
        if (type === "remote-inbound-rtp" && stat["kind"] === "audio") {
          const rtt = stat["roundTripTime"];
          if (typeof rtt === "number") rttMs = Math.round(rtt * 1000);
          const lost = stat["packetsLost"];
          if (typeof lost === "number") packetsLost = lost;
          const jit = stat["jitter"];
          if (typeof jit === "number") jitterMs = Math.round(jit * 1000);
        } else if (type === "outbound-rtp" && stat["kind"] === "audio") {
          const sent = stat["packetsSent"];
          if (typeof sent === "number") packetsSent = sent;
        }
      });
      let packetLossPct: number | null = null;
      if (packetsSent !== null && packetsLost !== null && packetsSent > 0) {
        packetLossPct = (packetsLost / (packetsSent + packetsLost)) * 100;
      }
      this._lastStats = this._snapshotStats({ rttMs, packetLossPct, jitterMs });
    } catch {
      /* stats not available — keep the last snapshot */
    }
  }

  private _snapshotStats(
    overrides: {
      rttMs?: number | null;
      packetLossPct?: number | null;
      jitterMs?: number | null;
    } | null
  ): MicStats {
    return {
      state: this._state,
      iceState: this._iceState,
      rttMs: overrides?.rttMs ?? this._lastStats?.rttMs ?? null,
      packetLossPct: overrides?.packetLossPct ?? this._lastStats?.packetLossPct ?? null,
      jitterMs: overrides?.jitterMs ?? this._lastStats?.jitterMs ?? null,
      level: this._level,
      audioProcessing: { ...this._audioProcessing },
    };
  }
}
