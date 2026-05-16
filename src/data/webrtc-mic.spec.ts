import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifyMicError,
  ICE_SERVERS,
  WebRtcMicClient,
  type MicError,
  type MicScheduler,
  type WebRtcMicClientOptions,
  type WebRtcMicInputs,
} from "./webrtc-mic";
import {
  MIC_ERROR_DISPLAY_MS,
  MIC_ICE_CONNECT_TIMEOUT_MS,
  MIC_ICE_DISCONNECT_GRACE_MS,
  MIC_PERSISTENT_NOTIFICATION_THROTTLE_MS,
  MIC_RETRY_DELAY_MS,
  MIC_STATS_POLL_MS,
  MIC_WS_CONNECT_TIMEOUT_MS,
} from "../const";

// ─── Fakes ────────────────────────────────────────────────────────────

interface PendingTimer {
  fn: () => void;
  at: number;
  handle: number;
  repeating: boolean;
  ms: number;
}

/**
 * Deterministic scheduler. Specs advance time via `tick(ms)` and assert that
 * the side-effects fire in the order the production code scheduled them.
 */
function makeScheduler(): MicScheduler & {
  tick: (ms: number) => void;
  now: () => number;
  pending: () => number;
} {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, PendingTimer>();
  const rafs = new Map<number, (t: number) => void>();
  let nextRaf = 1;

  function advanceTo(target: number): void {
    while (true) {
      let nextDue: PendingTimer | null = null;
      for (const t of timers.values()) {
        if (t.at <= target && (nextDue === null || t.at < nextDue.at)) nextDue = t;
      }
      if (!nextDue) break;
      now = nextDue.at;
      if (nextDue.repeating) {
        nextDue.at = now + nextDue.ms;
      } else {
        timers.delete(nextDue.handle);
      }
      nextDue.fn();
    }
    now = target;
  }

  return {
    setTimeout: (fn, ms): number => {
      const handle = nextHandle++;
      timers.set(handle, { fn, at: now + ms, handle, repeating: false, ms });
      return handle;
    },
    clearTimeout: (h): void => {
      timers.delete(h);
    },
    setInterval: (fn, ms): number => {
      const handle = nextHandle++;
      timers.set(handle, { fn, at: now + ms, handle, repeating: true, ms });
      return handle;
    },
    clearInterval: (h): void => {
      timers.delete(h);
    },
    requestAnimationFrame: (fn): number => {
      const handle = nextRaf++;
      rafs.set(handle, fn);
      return handle;
    },
    cancelAnimationFrame: (h): void => {
      rafs.delete(h);
    },
    tick(ms: number): void {
      advanceTo(now + ms);
      // Drain any pending RAFs once per tick (production browser fires once
      // per frame; one fire per tick is enough for the spec).
      const pending = Array.from(rafs.entries());
      rafs.clear();
      for (const [, fn] of pending) fn(now);
    },
    now: (): number => now,
    pending: (): number => timers.size,
  };
}

interface FakeMediaStreamTrack {
  kind: "audio" | "video";
  stop: ReturnType<typeof vi.fn>;
}

function makeFakeStream(): MediaStream {
  const tracks: FakeMediaStreamTrack[] = [{ kind: "audio", stop: vi.fn() }];
  return {
    getTracks: () => tracks as unknown as MediaStreamTrack[],
    getAudioTracks: () => tracks as unknown as MediaStreamTrack[],
    getVideoTracks: () => [],
  } as unknown as MediaStream;
}

class FakeRTCPeerConnection {
  iceConnectionState: RTCIceConnectionState = "new";
  connectionState: RTCPeerConnectionState = "new";
  oniceconnectionstatechange: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  onconnectionstatechange: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  onicecandidate: ((this: RTCPeerConnection, ev: RTCPeerConnectionIceEvent) => unknown) | null =
    null;
  closed = false;
  config: RTCConfiguration | null = null;
  transceivers: Array<{ kind: string; direction: string; track?: MediaStreamTrack | string }> = [];
  localDescriptionSdp: string | null = null;
  remoteDescriptions: RTCSessionDescriptionInit[] = [];
  iceCandidatesAdded: RTCIceCandidateInit[] = [];
  statsEntries: unknown[] = [];

  constructor(config?: RTCConfiguration) {
    this.config = config ?? null;
  }

  addTransceiver(
    track: MediaStreamTrack | string,
    init?: { direction?: string }
  ): RTCRtpTransceiver {
    this.transceivers.push({
      kind: typeof track === "string" ? track : track.kind,
      direction: init?.direction ?? "",
      track,
    });
    return {} as RTCRtpTransceiver;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "v=0\r\nm=audio offer\r\n" };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescriptionSdp = desc.sdp ?? null;
  }

  get localDescription(): RTCSessionDescription | null {
    return this.localDescriptionSdp
      ? ({ sdp: this.localDescriptionSdp } as RTCSessionDescription)
      : null;
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescriptions.push(desc);
  }

  async addIceCandidate(cand: RTCIceCandidateInit): Promise<void> {
    if (typeof cand.candidate === "string" && cand.candidate.startsWith("bad")) {
      throw new Error("bad candidate");
    }
    this.iceCandidatesAdded.push(cand);
  }

  close(): void {
    this.closed = true;
  }

  async getStats(): Promise<{ forEach: (cb: (s: unknown) => void) => void }> {
    const entries = this.statsEntries;
    return { forEach: (cb): void => entries.forEach(cb) };
  }

  fireIceState(state: RTCIceConnectionState): void {
    this.iceConnectionState = state;
    this.oniceconnectionstatechange?.call(this as unknown as RTCPeerConnection, new Event("ice"));
  }

  fireConnectionState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.onconnectionstatechange?.call(this as unknown as RTCPeerConnection, new Event("state"));
  }

  fireIceCandidate(candidate: string | null): void {
    const ev = {
      candidate: candidate === null ? null : ({ candidate } as RTCIceCandidate),
    } as RTCPeerConnectionIceEvent;
    this.onicecandidate?.call(this as unknown as RTCPeerConnection, ev);
  }
}

class FakeWebSocket {
  static OPEN = 1;
  readyState = 0; // CONNECTING
  sent: string[] = [];
  closeCalls: number = 0;
  url: string;

  onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
  onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls++;
  }

  triggerOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.call(this as unknown as WebSocket, new Event("open"));
  }

  triggerMessage(payload: unknown): void {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    this.onmessage?.call(this as unknown as WebSocket, { data } as MessageEvent);
  }

  triggerError(): void {
    this.onerror?.call(this as unknown as WebSocket, new Event("error"));
  }

  triggerClose(code: number): void {
    this.onclose?.call(
      this as unknown as WebSocket,
      { code, wasClean: false, reason: "" } as CloseEvent
    );
  }
}

(globalThis as unknown as { WebSocket: typeof FakeWebSocket }).WebSocket = FakeWebSocket;

interface FakeAudioContext {
  state: AudioContextState;
  createMediaStreamSource: ReturnType<typeof vi.fn>;
  createAnalyser: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  suspend: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function makeFakeAudioContext(): FakeAudioContext {
  const analyser = {
    fftSize: 0,
    getByteTimeDomainData: vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = 130;
    }),
  };
  const ctx: FakeAudioContext = {
    state: "running",
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
    createAnalyser: vi.fn(() => analyser),
    resume: vi.fn(async () => {
      ctx.state = "running";
    }),
    suspend: vi.fn(async () => {
      ctx.state = "suspended";
    }),
    close: vi.fn(async () => {
      ctx.state = "closed";
    }),
  };
  return ctx;
}

// ─── Common test rig ──────────────────────────────────────────────────

interface Harness {
  client: WebRtcMicClient;
  scheduler: ReturnType<typeof makeScheduler>;
  pcs: FakeRTCPeerConnection[];
  sockets: FakeWebSocket[];
  notifies: MicError[];
  changes: number;
  errors: MicError[];
  inputs: WebRtcMicInputs;
  audioContext: FakeAudioContext | null;
  getUserMedia: ReturnType<typeof vi.fn>;
  setGumImpl: (impl: (c: MediaStreamConstraints) => Promise<MediaStream>) => void;
}

function makeHarness(
  options: Partial<WebRtcMicClientOptions> & {
    gum?: (c: MediaStreamConstraints) => Promise<MediaStream>;
    noMediaDevices?: boolean;
  } = {}
): Harness {
  const scheduler = makeScheduler();
  const pcs: FakeRTCPeerConnection[] = [];
  const sockets: FakeWebSocket[] = [];
  const notifies: MicError[] = [];
  const errors: MicError[] = [];
  let changes = 0;
  let audioContext: FakeAudioContext | null = null;

  let gumImpl = options.gum ?? (async (): Promise<MediaStream> => makeFakeStream());
  const getUserMedia = vi.fn((c: MediaStreamConstraints) => gumImpl(c));
  const mediaDevices: MediaDevices | undefined = options.noMediaDevices
    ? undefined
    : ({ getUserMedia } as unknown as MediaDevices);

  const inputs: WebRtcMicInputs = {
    signPath: vi.fn(async (path: string) => ({ path: `/signed${path}?token=x` })),
    buildWsUrl: vi.fn((signed, name): string => `wss://ha.local${signed.path}&url=${name}`),
    notify: vi.fn((err) => {
      notifies.push(err);
    }),
  };

  const baseOpts: WebRtcMicClientOptions = {
    inputs,
    onChange: () => {
      changes++;
    },
    onError: (err) => {
      errors.push(err);
    },
    audioContextFactory: () => {
      audioContext = makeFakeAudioContext();
      return audioContext as unknown as AudioContext;
    },
    peerConnectionFactory: (config) => {
      const pc = new FakeRTCPeerConnection(config);
      pcs.push(pc);
      return pc as unknown as RTCPeerConnection;
    },
    webSocketFactory: (url) => {
      const ws = new FakeWebSocket(url);
      sockets.push(ws);
      return ws as unknown as WebSocket;
    },
    schedule: scheduler,
    now: () => scheduler.now(),
  };
  if (mediaDevices !== undefined) baseOpts.mediaDevices = mediaDevices;
  if (options.audioProcessing) baseOpts.audioProcessing = options.audioProcessing;
  if (options.iceServers) baseOpts.iceServers = options.iceServers;
  if (options.iceTransportPolicy) baseOpts.iceTransportPolicy = options.iceTransportPolicy;
  const client = new WebRtcMicClient(baseOpts);

  return {
    client,
    scheduler,
    pcs,
    sockets,
    notifies,
    errors,
    inputs,
    getUserMedia,
    get changes(): number {
      return changes;
    },
    get audioContext(): FakeAudioContext | null {
      return audioContext;
    },
    setGumImpl: (impl): void => {
      gumImpl = impl;
    },
  } as Harness;
}

/**
 * Drive `client.start(streamName)` through to `active`. The handshake is
 * the SDP exchange; the state machine then waits for ICE to actually
 * connect — we simulate that with `fireIceState("connected")`. Returns the
 * active socket.
 */
async function driveSuccessfulHandshake(
  h: Harness,
  streamName = "front_door"
): Promise<FakeWebSocket> {
  const p = h.client.start(streamName);
  await flush();
  const ws = h.sockets[h.sockets.length - 1];
  if (!ws) throw new Error("expected ws");
  ws.triggerOpen();
  await flush();
  ws.triggerMessage({ type: "webrtc/answer", value: "v=0\r\nm=audio answer\r\n" });
  await flush();
  await p;
  const pc = h.pcs[h.pcs.length - 1];
  if (!pc) throw new Error("expected pc");
  pc.fireIceState("connected");
  await flush();
  return ws;
}

async function flush(): Promise<void> {
  // Drain microtask queue so awaits inside the client resolve before the
  // spec moves on.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────

describe("classifyMicError", () => {
  it("maps NotAllowedError to permission-denied", () => {
    const err = new DOMException("denied", "NotAllowedError");
    expect(classifyMicError(err)).toEqual({ code: "permission-denied", detail: "denied" });
  });

  it("maps NotFoundError to device-not-found", () => {
    const err = new DOMException("nope", "NotFoundError");
    expect(classifyMicError(err)).toEqual({ code: "device-not-found", detail: "nope" });
  });

  it("maps NotReadableError to device-in-use", () => {
    const err = new DOMException("busy", "NotReadableError");
    expect(classifyMicError(err)).toEqual({ code: "device-in-use", detail: "busy" });
  });

  it("maps AbortError to aborted", () => {
    const err = new DOMException("aborted", "AbortError");
    expect(classifyMicError(err)).toEqual({ code: "aborted" });
  });

  it("normalises a pre-tagged MicError into a clean { code, detail } pair", () => {
    const tagged: MicError = { code: "ice-failed", detail: "failed" };
    expect(classifyMicError(tagged)).toEqual({ code: "ice-failed", detail: "failed" });
  });

  it("classifies a plain Error as unknown with its message", () => {
    expect(classifyMicError(new Error("boom"))).toEqual({ code: "unknown", detail: "boom" });
  });

  it("classifies a thrown string as unknown using String(err)", () => {
    expect(classifyMicError("hello")).toEqual({ code: "unknown", detail: "hello" });
  });
});

describe("ICE_SERVERS structural sanity", () => {
  it("defaults to STUN-only — no public TURN relay by default", () => {
    const allUrls = ICE_SERVERS.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
    expect(allUrls.some((u) => typeof u === "string" && u.startsWith("stun:"))).toBe(true);
    expect(allUrls.every((u) => typeof u === "string" && u.startsWith("stun:"))).toBe(true);
  });
});

describe("WebRtcMicClient — happy path", () => {
  it("transitions idle → connecting → connecting (after SDP) → active (after ICE) via the WS handshake", async () => {
    const h = makeHarness();
    expect(h.client.state()).toBe("idle");
    const promise = h.client.start("front_door");
    await flush();
    expect(h.client.state()).toBe("connecting");

    const ws = h.sockets[0]!;
    ws.triggerOpen();
    await flush();
    expect(ws.sent.some((s) => JSON.parse(s).type === "webrtc/offer")).toBe(true);

    ws.triggerMessage({ type: "webrtc/answer", value: "v=0\r\nm=audio answer\r\n" });
    await flush();
    await promise;

    // SDP exchange complete but ICE not connected yet — still "connecting".
    expect(h.client.state()).toBe("connecting");
    expect(h.client.isActive()).toBe(false);

    h.pcs[0]!.fireIceState("connected");
    await flush();
    expect(h.client.state()).toBe("active");
    expect(h.client.isActive()).toBe(true);
    expect(h.pcs[0]!.remoteDescriptions[0]).toEqual({
      type: "answer",
      sdp: "v=0\r\nm=audio answer\r\n",
    });
  });

  it("connectionState also promotes connecting → active (browsers that only fire that surface)", async () => {
    const h = makeHarness();
    const p = h.client.start("front_door");
    await flush();
    h.sockets[0]!.triggerOpen();
    await flush();
    h.sockets[0]!.triggerMessage({ type: "webrtc/answer", value: "sdp" });
    await flush();
    await p;
    expect(h.client.state()).toBe("connecting");
    h.pcs[0]!.fireConnectionState("connected");
    await flush();
    expect(h.client.state()).toBe("active");
  });

  it("passes iceServers, iceTransportPolicy and bundlePolicy:max-bundle to the PC config", async () => {
    const customIce: RTCIceServer[] = [
      { urls: "stun:custom.example:3478" },
      { urls: "turn:custom.example:3478", username: "u", credential: "c" },
    ];
    const h = makeHarness({ iceServers: customIce, iceTransportPolicy: "relay" });
    await driveSuccessfulHandshake(h);
    const config = h.pcs[0]?.config;
    expect(config).toBeDefined();
    expect(config?.iceServers).toEqual(customIce);
    expect(config?.iceTransportPolicy).toBe("relay");
    expect(config?.bundlePolicy).toBe("max-bundle");
    expect(config?.rtcpMuxPolicy).toBe("require");
  });

  it("toggle() on active stops without re-calling getUserMedia", async () => {
    const h = makeHarness();
    await driveSuccessfulHandshake(h);
    expect(h.getUserMedia).toHaveBeenCalledTimes(1);

    await h.client.toggle("front_door");
    expect(h.client.state()).toBe("idle");
    expect(h.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("re-entrant start() while connecting is a no-op", async () => {
    const h = makeHarness();
    const first = h.client.start("front_door");
    await flush();
    expect(h.client.state()).toBe("connecting");

    await h.client.start("front_door"); // second call should bail immediately
    await flush();
    expect(h.sockets.length).toBe(1);

    h.sockets[0]!.triggerOpen();
    await flush();
    h.sockets[0]!.triggerMessage({ type: "webrtc/answer", value: "sdp" });
    await flush();
    await first;
    h.pcs[0]!.fireIceState("connected");
    await flush();
    expect(h.client.state()).toBe("active");
  });

  it("forwards ICE candidates to the WS as webrtc/candidate", async () => {
    const h = makeHarness();
    await driveSuccessfulHandshake(h);
    const pc = h.pcs[0]!;
    const ws = h.sockets[0]!;
    ws.sent = [];

    pc.fireIceCandidate("candidate:abc 1 udp 100 1.2.3.4 9 typ host");
    expect(JSON.parse(ws.sent[0]!)).toEqual({
      type: "webrtc/candidate",
      value: "candidate:abc 1 udp 100 1.2.3.4 9 typ host",
    });

    pc.fireIceCandidate(null);
    expect(JSON.parse(ws.sent[1]!)).toEqual({ type: "webrtc/candidate", value: "" });
  });

  it("forwards webrtc/candidate messages to addIceCandidate, swallowing bad-candidate failures", async () => {
    const h = makeHarness();
    await driveSuccessfulHandshake(h);
    const ws = h.sockets[0]!;
    const pc = h.pcs[0]!;

    ws.triggerMessage({
      type: "webrtc/candidate",
      value: "candidate:1 1 udp 100 1.2.3.4 9 typ host",
    });
    await flush();
    expect(pc.iceCandidatesAdded[0]).toEqual({
      candidate: "candidate:1 1 udp 100 1.2.3.4 9 typ host",
      sdpMid: "0",
    });

    ws.triggerMessage({ type: "webrtc/candidate", value: "bad candidate" });
    await flush();
    // No throw; client state stays active.
    expect(h.client.state()).toBe("active");
  });
});

describe("WebRtcMicClient — error classification", () => {
  it("missing mediaDevices ⇒ https-required (no signPath call)", async () => {
    const h = makeHarness({ noMediaDevices: true });
    await h.client.start("front_door");
    expect(h.client.error()).toEqual({ code: "https-required" });
    expect(h.inputs.signPath).not.toHaveBeenCalled();
  });

  it("empty streamName ⇒ stream-not-found (no getUserMedia call)", async () => {
    const h = makeHarness();
    await h.client.start("");
    expect(h.client.error()).toEqual({ code: "stream-not-found" });
    expect(h.getUserMedia).not.toHaveBeenCalled();
  });

  it("NotAllowedError from getUserMedia ⇒ permission-denied", async () => {
    const h = makeHarness({
      gum: async (): Promise<MediaStream> => {
        throw new DOMException("denied", "NotAllowedError");
      },
    });
    await h.client.start("front_door");
    expect(h.client.error()?.code).toBe("permission-denied");
    expect(h.errors[0]?.code).toBe("permission-denied");
  });

  it("NotFoundError ⇒ device-not-found", async () => {
    const h = makeHarness({
      gum: async (): Promise<MediaStream> => {
        throw new DOMException("nope", "NotFoundError");
      },
    });
    await h.client.start("front_door");
    expect(h.client.error()?.code).toBe("device-not-found");
  });

  it("NotReadableError ⇒ device-in-use", async () => {
    const h = makeHarness({
      gum: async (): Promise<MediaStream> => {
        throw new DOMException("busy", "NotReadableError");
      },
    });
    await h.client.start("front_door");
    expect(h.client.error()?.code).toBe("device-in-use");
  });

  it("WS close code 1006 ⇒ ws-connect-failed with detail", async () => {
    const h = makeHarness();
    const p = h.client.start("front_door");
    await flush();
    h.sockets[0]!.triggerClose(1006);
    await flush();
    // First failure triggers a transient retry; let it elapse and fail again.
    h.scheduler.tick(MIC_RETRY_DELAY_MS);
    await flush();
    h.sockets[1]!.triggerClose(1006);
    await flush();
    await p;
    expect(h.client.error()?.code).toBe("ws-connect-failed");
    expect(h.client.error()?.detail).toContain("abnormal closure");
  });

  it("WS open never fires within MIC_WS_CONNECT_TIMEOUT_MS ⇒ ws-timeout", async () => {
    const h = makeHarness();
    const p = h.client.start("front_door");
    await flush();
    // First timeout triggers a transient retry.
    h.scheduler.tick(MIC_WS_CONNECT_TIMEOUT_MS);
    await flush();
    h.scheduler.tick(MIC_RETRY_DELAY_MS);
    await flush();
    // Second timeout surfaces the error.
    h.scheduler.tick(MIC_WS_CONNECT_TIMEOUT_MS);
    await flush();
    await flush();
    await p;
    expect(h.client.error()?.code).toBe("ws-timeout");
  });

  it("go2rtc {type:error} ⇒ ws-server-error with detail", async () => {
    const h = makeHarness();
    const p = h.client.start("front_door");
    await flush();
    h.sockets[0]!.triggerOpen();
    await flush();
    h.sockets[0]!.triggerMessage({ type: "error", value: "no such stream" });
    await flush();
    await p;
    expect(h.client.error()).toEqual({ code: "ws-server-error", detail: "no such stream" });
  });

  it("ICE state failed ⇒ ice-failed and stop is called", async () => {
    const h = makeHarness();
    await driveSuccessfulHandshake(h);
    const pc = h.pcs[0]!;
    pc.fireIceState("failed");
    expect(h.client.state()).toBe("idle");
    expect(h.client.error()?.code).toBe("ice-failed");
  });

  it("ICE never reaches connected within MIC_ICE_CONNECT_TIMEOUT_MS ⇒ ice-failed", async () => {
    const h = makeHarness();
    const p = h.client.start("front_door");
    await flush();
    h.sockets[0]!.triggerOpen();
    await flush();
    h.sockets[0]!.triggerMessage({ type: "webrtc/answer", value: "sdp" });
    await flush();
    await p;
    expect(h.client.state()).toBe("connecting");
    // Tick past the ICE connect timeout — ICE never fired connected.
    h.scheduler.tick(MIC_ICE_CONNECT_TIMEOUT_MS);
    await flush();
    expect(h.client.state()).toBe("idle");
    expect(h.client.error()?.code).toBe("ice-failed");
    expect(h.client.error()?.detail).toBe("connect timeout");
  });

  it("ICE 'disconnected' before reaching connected ⇒ immediate ice-failed (no grace)", async () => {
    const h = makeHarness();
    const p = h.client.start("front_door");
    await flush();
    h.sockets[0]!.triggerOpen();
    await flush();
    h.sockets[0]!.triggerMessage({ type: "webrtc/answer", value: "sdp" });
    await flush();
    await p;
    expect(h.client.state()).toBe("connecting");
    h.pcs[0]!.fireIceState("disconnected");
    await flush();
    expect(h.client.state()).toBe("idle");
    expect(h.client.error()?.code).toBe("ice-failed");
  });

  it("ICE 'disconnected' after connected → grace window → recover ⇒ no error", async () => {
    const h = makeHarness();
    await driveSuccessfulHandshake(h);
    expect(h.client.state()).toBe("active");
    h.pcs[0]!.fireIceState("disconnected");
    await flush();
    // Still active during the grace window.
    expect(h.client.state()).toBe("active");
    // Recover before grace fires.
    h.scheduler.tick(MIC_ICE_DISCONNECT_GRACE_MS - 100);
    await flush();
    h.pcs[0]!.fireIceState("connected");
    await flush();
    expect(h.client.state()).toBe("active");
    expect(h.client.error()).toBeNull();
    // Grace timer should have been cancelled — advancing further must not fire.
    h.scheduler.tick(MIC_ICE_DISCONNECT_GRACE_MS);
    await flush();
    expect(h.client.state()).toBe("active");
  });

  it("ICE 'disconnected' after connected → grace expires ⇒ ice-failed", async () => {
    const h = makeHarness();
    await driveSuccessfulHandshake(h);
    h.pcs[0]!.fireIceState("disconnected");
    await flush();
    expect(h.client.state()).toBe("active");
    h.scheduler.tick(MIC_ICE_DISCONNECT_GRACE_MS);
    await flush();
    expect(h.client.state()).toBe("idle");
    expect(h.client.error()?.code).toBe("ice-failed");
    expect(h.client.error()?.detail).toBe("disconnected");
  });

  it("non-Error thrown values fall through to unknown via String(err)", async () => {
    const h = makeHarness({
      gum: async (): Promise<MediaStream> => {
        throw "boom";
      },
    });
    await h.client.start("front_door");
    expect(h.client.error()).toEqual({ code: "unknown", detail: "boom" });
  });
});

describe("WebRtcMicClient — retry behaviour", () => {
  it("retries once on ws-timeout then succeeds", async () => {
    const h = makeHarness();
    const p = h.client.start("front_door");
    await flush();
    h.scheduler.tick(MIC_WS_CONNECT_TIMEOUT_MS);
    await flush();
    h.scheduler.tick(MIC_RETRY_DELAY_MS);
    await flush();
    await flush();
    // Second WS attempt succeeds.
    expect(h.sockets.length).toBe(2);
    h.sockets[1]!.triggerOpen();
    await flush();
    h.sockets[1]!.triggerMessage({ type: "webrtc/answer", value: "sdp" });
    await flush();
    await p;
    h.pcs[1]!.fireIceState("connected");
    await flush();
    expect(h.client.state()).toBe("active");
    expect(h.client.error()).toBeNull();
  });

  it("permission-denied does not retry", async () => {
    const h = makeHarness({
      gum: async (): Promise<MediaStream> => {
        throw new DOMException("denied", "NotAllowedError");
      },
    });
    await h.client.start("front_door");
    expect(h.getUserMedia).toHaveBeenCalledTimes(1);
  });
});

describe("WebRtcMicClient — lifecycle & leaks", () => {
  it("stop() closes WS, PC, stops every track and suspends AudioContext", async () => {
    const h = makeHarness();
    await driveSuccessfulHandshake(h);

    const pc = h.pcs[0]!;
    const ws = h.sockets[0]!;
    h.client.stop();
    expect(pc.closed).toBe(true);
    expect(ws.closeCalls).toBeGreaterThan(0);
    expect(h.audioContext?.suspend).toHaveBeenCalled();
    expect(h.audioContext?.close).not.toHaveBeenCalled();
    expect(h.client.state()).toBe("idle");
  });

  it("dispose() calls stop and then closes the AudioContext (idempotent)", async () => {
    const h = makeHarness();
    await driveSuccessfulHandshake(h);
    h.client.dispose();
    expect(h.audioContext?.close).toHaveBeenCalled();
    h.client.dispose(); // second call must not throw
    expect(h.audioContext?.close).toHaveBeenCalledTimes(1);
  });

  it("dispose() mid-handshake aborts; subsequent resolution does not flip active", async () => {
    const gumDeferred: { resolve: ((s: MediaStream) => void) | null } = { resolve: null };
    const h = makeHarness({
      gum: () =>
        new Promise<MediaStream>((resolve) => {
          gumDeferred.resolve = resolve;
        }),
    });
    const p = h.client.start("front_door");
    await flush();
    expect(h.client.state()).toBe("connecting");
    h.client.dispose();
    expect(h.client.state()).toBe("idle");
    gumDeferred.resolve?.(makeFakeStream());
    await p;
    expect(h.client.state()).toBe("idle");
  });

  it("setting an error fires onChange", async () => {
    const h = makeHarness({ noMediaDevices: true });
    const before = h.changes;
    await h.client.start("front_door");
    expect(h.changes).toBeGreaterThan(before);
  });
});

describe("WebRtcMicClient — notification throttling", () => {
  it("notify is throttled to one call per MIC_PERSISTENT_NOTIFICATION_THROTTLE_MS", async () => {
    const h = makeHarness({ noMediaDevices: true });
    await h.client.start("front_door");
    expect(h.notifies.length).toBe(1);
    expect(h.notifies[0]?.code).toBe("https-required");

    h.scheduler.tick(MIC_ERROR_DISPLAY_MS + 1);
    await flush();

    await h.client.start("front_door"); // immediate second failure
    expect(h.notifies.length).toBe(1); // throttled

    h.scheduler.tick(MIC_PERSISTENT_NOTIFICATION_THROTTLE_MS);
    await flush();

    await h.client.start("front_door");
    expect(h.notifies.length).toBe(2);
  });

  it("auto-clears error() after MIC_ERROR_DISPLAY_MS", async () => {
    const h = makeHarness({ noMediaDevices: true });
    await h.client.start("front_door");
    expect(h.client.error()).toEqual({ code: "https-required" });
    h.scheduler.tick(MIC_ERROR_DISPLAY_MS);
    await flush();
    expect(h.client.error()).toBeNull();
  });
});

describe("WebRtcMicClient — audio processing", () => {
  it("defaults all three audio constraints to true and forces channelCount:1 for voice", async () => {
    const h = makeHarness();
    await driveSuccessfulHandshake(h);
    const call = h.getUserMedia.mock.calls[0]?.[0];
    expect(call).toEqual({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });
  });

  it("constructor overrides flow through to getUserMedia", async () => {
    const h = makeHarness({
      audioProcessing: { echoCancellation: false },
    });
    await driveSuccessfulHandshake(h);
    const call = h.getUserMedia.mock.calls[0]?.[0];
    expect(call).toEqual({
      audio: {
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });
  });

  it("setAudioProcessing() takes effect on the next start()", async () => {
    const h = makeHarness();
    await driveSuccessfulHandshake(h);
    h.client.stop();
    h.client.setAudioProcessing({ noiseSuppression: false });
    await driveSuccessfulHandshake(h, "front_door");
    const second = h.getUserMedia.mock.calls[1]?.[0];
    expect(second).toEqual({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });
  });
});

describe("WebRtcMicClient — stats", () => {
  it("polls pc.getStats() every MIC_STATS_POLL_MS while active and snapshots into stats()", async () => {
    const h = makeHarness();
    await driveSuccessfulHandshake(h);
    const pc = h.pcs[0]!;
    pc.statsEntries = [
      {
        type: "remote-inbound-rtp",
        kind: "audio",
        roundTripTime: 0.05,
        packetsLost: 1,
        jitter: 0.003,
      },
      { type: "outbound-rtp", kind: "audio", packetsSent: 99 },
    ];
    h.scheduler.tick(MIC_STATS_POLL_MS);
    await flush();
    const s = h.client.stats();
    expect(s).not.toBeNull();
    expect(s?.rttMs).toBe(50);
    expect(s?.jitterMs).toBe(3);
    expect(s?.packetLossPct).toBeCloseTo(1, 1);
    expect(s?.iceState).toBe("connected");
  });

  it("stats() returns null while idle", () => {
    const h = makeHarness();
    expect(h.client.stats()).toBeNull();
  });

  it("stats polling does not start until ICE promotes to active", async () => {
    // Regression: stats + level-RAF were previously kicked off right after
    // the SDP answer (while state was still "connecting"). The level RAF's
    // first tick saw state !== "active" and exited permanently. Both must
    // start only inside _promoteToActive.
    const h = makeHarness();
    const p = h.client.start("front_door");
    await flush();
    h.sockets[0]!.triggerOpen();
    await flush();
    h.sockets[0]!.triggerMessage({ type: "webrtc/answer", value: "sdp" });
    await flush();
    await p;
    // SDP done, ICE not connected yet — stats poll should NOT have started.
    expect(h.scheduler.pending()).toBe(1); // only the ICE-connect-timeout timer
    h.pcs[0]!.fireIceState("connected");
    await flush();
    // Promoted to active — stats interval should now be scheduled.
    expect(h.scheduler.pending()).toBeGreaterThan(0);
  });
});

describe("WebRtcMicClient — stop/start re-use (no dispose)", () => {
  it("stop() leaves the client usable: a subsequent start() succeeds", async () => {
    // Regression: HA Lovelace fires disconnect+connect on tab switches.
    // The card calls stop() (not dispose()) on disconnect so the next
    // toggle works. Verify that pattern at the unit level.
    const h = makeHarness();
    await driveSuccessfulHandshake(h, "stream1");
    expect(h.client.state()).toBe("active");
    h.client.stop();
    expect(h.client.state()).toBe("idle");
    // Second start on a new stream — must work, not silently no-op.
    await driveSuccessfulHandshake(h, "stream2");
    expect(h.client.state()).toBe("active");
    expect(h.sockets.length).toBe(2);
    expect(h.sockets[1]?.url).toContain("stream2");
  });

  it("dispose() seals the client: a subsequent start() is a no-op (terminal teardown)", async () => {
    const h = makeHarness();
    h.client.dispose();
    await h.client.start("front_door");
    expect(h.client.state()).toBe("idle");
    expect(h.sockets.length).toBe(0);
  });
});
