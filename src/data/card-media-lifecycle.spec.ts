// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the real card handlers and mic onChange closure without contacting
// HA, requesting capture, opening real fullscreen surfaces or a real peer
// connection. The shadow chains are real so fullscreen retargeting and
// teardown walk the actual tree.
let card: any;
let camera: any;
let player: any;
let video: any;
let audio: any;
let tracks: any[];
let pc: any;
let stream: any;

function remoteMedia() {
  audio = { kind: "audio", readyState: "live", stop: vi.fn(), clone: vi.fn() };
  tracks = [];
  stream = { getAudioTracks: () => tracks, addTrack: vi.fn((track) => tracks.push(track)) };
  pc = { getReceivers: vi.fn(() => [{ track: audio }]), connectionState: "connected" };
  player._peerConnection = pc;
  player._remoteStream = stream;
  video.srcObject = stream;
}

function micState(state: string) {
  card._micClient._state = state;
  card._micClient._onChange();
}

beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  await import("../index.js");
});

beforeEach(() => {
  vi.useFakeTimers();
  card = document.createElement("camera-gallery-card");
  card.requestUpdate = vi.fn();
  card._scheduleMicLevelRaf = vi.fn();
  card.config = {
    live_cameras: [{ entity: "camera.test", mic: "test" }],
    live_go2rtc_url: "https://example.invalid",
  };
  card._viewMode = "live";
  card._isLiveActive = () => card._viewMode === "live";
  const root = card.attachShadow({ mode: "open" });
  Object.defineProperty(card, "renderRoot", { value: root });
  const host = document.createElement("div");
  host.id = "live-card-host";
  root.append(host);
  camera = document.createElement("ha-camera-stream");
  camera.muted = true;
  player = document.createElement("ha-web-rtc-player");
  player.muted = true;
  camera.attachShadow({ mode: "open" }).append(player);
  video = document.createElement("video");
  video.muted = true;
  video.play = vi.fn(() => Promise.resolve());
  video.pause = vi.fn();
  video.load = vi.fn();
  player.attachShadow({ mode: "open" }).append(video);
  host.append(camera);
  card._liveCard = camera;
  card._liveAudioSuspended = false;
  remoteMedia();
});

afterEach(() => {
  card._teardownLiveView();
  card._clearPreviewVideoHostPlayback();
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("real card listening/talkback lifecycle", () => {
  it("recovers existing receiver audio while remaining silent at every layer", () => {
    const writes: boolean[] = [];
    let muted = true;
    Object.defineProperty(video, "muted", {
      get: () => muted,
      set: (value) => {
        writes.push(value);
        muted = value;
      },
    });
    card._syncLiveMuted();
    expect(tracks).toEqual([audio]);
    expect(camera.muted && player.muted && video.muted).toBe(true);
    expect(writes).not.toContain(false);
    expect(video.play).not.toHaveBeenCalled();
    expect(audio.clone).not.toHaveBeenCalled();
    expect(audio.stop).not.toHaveBeenCalled();
  });

  it("speaker unmute applies all layers and calls play synchronously in the gesture", () => {
    card._toggleLiveMute();
    expect(camera.muted || player.muted || video.muted).toBe(false);
    expect(tracks).toEqual([audio]);
    expect(video.play).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(stream.addTrack).toHaveBeenCalledTimes(1);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it("temporarily unmutes only when talkback becomes active and restores on stop", () => {
    micState("connecting");
    expect(card._liveMuted).toBe(true);
    micState("active");
    expect(video.muted).toBe(false);
    card._micClient.stop();
    expect(card._liveMuted).toBe(true);
    expect(video.muted).toBe(true);
    expect(card._talkbackAudio).toBeNull();
  });

  it("preserves prior unmuted listening after talkback", () => {
    card._toggleLiveMute();
    micState("connecting");
    micState("active");
    card._micClient.stop();
    expect(card._liveMuted).toBe(false);
    expect(video.muted).toBe(false);
  });

  it.each([true, false])("preserves manual choice during active talkback: muted=%s", (muted) => {
    micState("connecting");
    micState("active");
    card._toggleLiveMute();
    if (!muted) card._toggleLiveMute();
    card._micClient.stop();
    expect(card._liveMuted).toBe(muted);
    expect(video.muted).toBe(muted);
  });

  it("honors a manual choice during the mic handshake", () => {
    micState("connecting");
    card._toggleLiveMute();
    card._toggleLiveMute();
    micState("active");
    expect(video.muted).toBe(true);
    card._micClient.stop();
    expect(video.muted).toBe(true);
  });

  it("failed/cancelled microphone setup never unmutes", () => {
    micState("connecting");
    micState("idle");
    expect(video.muted).toBe(true);
    expect(video.play).not.toHaveBeenCalled();
    expect(card._talkbackAudio).toBeNull();
  });

  it("PTT release cancels a connecting session through the real pointer handlers", () => {
    card.config.live_mic_mode = "ptt";
    card._getEffectiveLiveCamera = () => "camera.test";
    vi.spyOn(card._micClient, "start").mockImplementation(async () => micState("connecting"));
    const event = { stopPropagation: vi.fn() };
    card._onMicPointerDown(event);
    expect(card._micState).toBe("connecting");
    card._onMicPointerUp(event);
    expect(card._micState).toBe("idle");
    expect(card._liveMuted).toBe(true);
  });

  it("late receiver tracks recover without requiring another speaker click", () => {
    pc.getReceivers.mockReturnValue([]);
    card._toggleLiveMute();
    expect(tracks).toHaveLength(0);
    pc.getReceivers.mockReturnValue([{ track: audio }]);
    vi.advanceTimersByTime(500);
    expect(tracks).toEqual([audio]);
    expect(video.play).toHaveBeenCalledTimes(2);
  });

  it("re-reads the current connection and stream after reconnect", () => {
    card._toggleLiveMute();
    const oldPc = pc;
    oldPc.getReceivers.mockClear();
    remoteMedia();
    vi.advanceTimersByTime(500);
    expect(tracks).toEqual([audio]);
    expect(oldPc.getReceivers).not.toHaveBeenCalled();
    expect(pc.getReceivers).toHaveBeenCalled();
  });

  it("does not add audio to a stale/unmounted stream or reuse an ended track", () => {
    video.srcObject = {};
    card._syncLiveMuted();
    expect(stream.addTrack).not.toHaveBeenCalled();
    video.srcObject = stream;
    audio.readyState = "ended";
    vi.advanceTimersByTime(500);
    expect(stream.addTrack).not.toHaveBeenCalled();
  });

  it("delayed shadow video discovery is lifecycle-bound", () => {
    video.remove();
    card._syncLiveMuted();
    expect(tracks).toHaveLength(0);
    player.shadowRoot.append(video);
    vi.advanceTimersByTime(500);
    expect(tracks).toEqual([audio]);
    expect(video.muted).toBe(true);
    card._teardownLiveView();
    const reads = pc.getReceivers.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(pc.getReceivers).toHaveBeenCalledTimes(reads);
    expect(card._liveAudioTimer).toBeNull();
    expect(audio.stop).not.toHaveBeenCalled();
  });

  it("reports unsupported HA internals safely", () => {
    delete player._peerConnection;
    delete player._remoteStream;
    card._syncLiveMuted();
    expect(card._liveAudioStatus).toContain("unsupported");
    expect(video.muted).toBe(true);
    expect(stream.addTrack).not.toHaveBeenCalled();
  });

  it("keeps autoplay rejection visible across polls, without unhandled rejection", async () => {
    video.play.mockRejectedValue(new Error("policy"));
    card._toggleLiveMute();
    await Promise.resolve();
    vi.advanceTimersByTime(1000);
    expect(card._liveAudioPlaybackError).toContain("autoplay policy");
    expect(card._buildDiagnostics().at(-1).rows[0][1]).toContain("autoplay policy");
  });

  it("clears an obsolete autoplay diagnostic when listening is muted", async () => {
    video.play.mockRejectedValue(new Error("policy"));
    card._toggleLiveMute();
    await Promise.resolve();
    card._toggleLiveMute();
    expect(card._liveAudioPlaybackError).toBe("");
  });

  it.each([true, false])("real mount seeds configured startup mute=%s", async (muted) => {
    card.config.live_auto_muted = muted;
    camera.remove();
    vi.spyOn(card, "_ensureLiveCard").mockResolvedValue(camera);
    vi.spyOn(card, "_setupAutoAspectRatio").mockImplementation(() => {});
    await card._mountLiveCard();
    expect(camera.parentElement.id).toBe("live-card-host");
    expect(camera.muted).toBe(muted);
    expect(player.muted).toBe(muted);
    expect(video.muted).toBe(muted);
    expect(tracks).toEqual([audio]);
    expect(!!card._liveAudioTimer).toBe(true);
  });

  it("a pending mount cannot reattach or restart audio after teardown", async () => {
    let resolve!: (value: any) => void;
    vi.spyOn(card, "_ensureLiveCard").mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const mounting = card._mountLiveCard();
    card._teardownLiveView();
    resolve(camera);
    await mounting;
    expect(camera.parentElement).toBeNull();
    expect(card._liveAudioTimer).toBeNull();
    expect(card._liveAudioSuspended).toBe(true);
  });

  it("a late HA component definition cannot resurrect a torn-down player", async () => {
    let resolve!: () => void;
    vi.spyOn(customElements, "whenDefined").mockReturnValue(
      new Promise<any>((done) => {
        resolve = () => done(undefined);
      })
    );
    card._liveCard = null;
    const pending = card._ensureLiveCard();
    card._teardownLiveView();
    resolve();
    expect(await pending).toBeNull();
    expect(card._liveCard).toBeNull();
  });

  it("a cancelled URL setup cannot open a socket after late HA signing", async () => {
    let resolve!: (value: any) => void;
    const close = vi.fn();
    vi.stubGlobal(
      "RTCPeerConnection",
      class {
        close = close;
        addTransceiver = vi.fn();
      }
    );
    const socket = vi.fn();
    vi.stubGlobal("WebSocket", socket);
    card.config.live_go2rtc_url = "";
    card._hass = {
      callWS: vi.fn(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      ),
    };
    const pending = card._ensureLiveCardFromUrlImpl("test-stream", "stream:test-stream");
    card._teardownLiveView();
    resolve({ path: "/test-only" });
    expect(await pending).toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
    expect(socket).not.toHaveBeenCalled();
    expect(card._liveCard).toBeNull();
    expect(card._signedWsPath).toBeNull();
  });

  // Deferred to pr3 (camera-switch semantics): the integrate
  // "real camera switch tears down before selecting and mounting the next
  // camera" row (D+E) lands with the camera-switch PR.

  it("real media view switch cancels talkback and audio synchronization", () => {
    micState("active");
    card._setViewMode("media");
    expect(card._micState).toBe("idle");
    expect(video.muted).toBe(true);
    expect(card._liveAudioTimer).toBeNull();
    expect(card._liveCard).toBeNull();
  });

  it("disconnect cancels live work; reconnect requests a fresh render/mount", () => {
    micState("active");
    card.disconnectedCallback();
    expect(card._liveCard).toBeNull();
    expect(card._liveAudioTimer).toBeNull();
    expect(card._micState).toBe("idle");
    card.requestUpdate.mockClear();
    card.connectedCallback();
    expect(card.requestUpdate).toHaveBeenCalled();
    card.disconnectedCallback();
  });

  it("view teardown silences before mic restoration and cancels all audio retry work", () => {
    card._toggleLiveMute();
    micState("connecting");
    micState("active");
    card._teardownLiveView();
    expect(video.muted).toBe(true);
    expect(card._micState).toBe("idle");
    expect(card._talkbackAudio).toBeNull();
    expect(card._liveAudioTimer).toBeNull();
    expect(audio.stop).not.toHaveBeenCalled();
  });
});

describe("real card fullscreen handlers", () => {
  beforeEach(() => {
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    card.requestFullscreen = vi.fn(() => Promise.resolve());
    video.requestFullscreen = vi.fn(() => Promise.resolve());
  });

  function nestedFullscreen(property: "fullscreenElement" | "webkitFullscreenElement") {
    // Real shadow roots, with the retargeted fullscreen properties supplied
    // by the browser. The card's parent root is two levels below document.
    const outer = document.createElement("div");
    const outerRoot = outer.attachShadow({ mode: "open" });
    const inner = document.createElement("div");
    const innerRoot = inner.attachShadow({ mode: "open" });
    outerRoot.append(inner);
    innerRoot.append(card);
    Object.defineProperty(document, property, { configurable: true, value: outer });
    Object.defineProperty(outerRoot, property, { configurable: true, value: inner });
    Object.defineProperty(innerRoot, property, { configurable: true, value: card });
    return innerRoot;
  }

  it.each(["fullscreenElement", "webkitFullscreenElement"] as const)(
    "activates and clears card layout under nested shadow containers (%s)",
    (property) => {
      const root = nestedFullscreen(property);
      card._onFullscreenChange();
      expect(card.hasAttribute("data-live-fs")).toBe(true);
      expect(card._ownsFullscreen()).toBe(true);
      Object.defineProperty(root, property, { configurable: true, value: null });
      Object.defineProperty(document, property, { configurable: true, value: null });
      card._onFullscreenChange();
      expect(card.hasAttribute("data-live-fs")).toBe(false);
      expect(card._ownsFullscreen()).toBe(false);
    }
  );

  it.each(["fullscreenElement", "webkitFullscreenElement"] as const)(
    "the fullscreen control exits a nested card instead of re-entering (%s)",
    (property) => {
      nestedFullscreen(property);
      const exit = vi.fn(() => Promise.resolve());
      Object.defineProperty(document, "exitFullscreen", {
        configurable: true,
        writable: true,
        value: exit,
      });
      card._toggleLiveFullscreen();
      expect(exit).toHaveBeenCalledTimes(1);
      expect(card.requestFullscreen).not.toHaveBeenCalled();
      Object.defineProperty(document, property, { configurable: true, value: null });
    }
  );

  it.each(["fullscreenElement", "webkitFullscreenElement"] as const)(
    "does not claim another card under the same nested container (%s)",
    (property) => {
      const root = nestedFullscreen(property);
      const other = document.createElement("div");
      root.append(other);
      Object.defineProperty(root, property, { configurable: true, value: other });
      const exit = vi.fn(() => Promise.resolve());
      Object.defineProperty(document, "exitFullscreen", {
        configurable: true,
        writable: true,
        value: exit,
      });
      card._onFullscreenChange();
      card._exitOwnedFullscreen();
      expect(card.hasAttribute("data-live-fs")).toBe(false);
      expect(card._ownsFullscreen()).toBe(false);
      expect(exit).not.toHaveBeenCalled();
      Object.defineProperty(document, property, { configurable: true, value: null });
    }
  );

  it("Android Companion takes the CSS card path", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android; wv) Home Assistant/test");
    card._toggleLiveFullscreen();
    expect(card.requestFullscreen).not.toHaveBeenCalled();
    expect(card.hasAttribute("data-live-fs")).toBe(true);
    card._toggleLiveFullscreen();
    expect(card.hasAttribute("data-live-fs")).toBe(false);
  });

  it("teardown exits owned standard fullscreen but never another card's fullscreen", () => {
    document.exitFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: document.createElement("div"),
    });
    card._teardownLiveView();
    expect(document.exitFullscreen).not.toHaveBeenCalled();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: card });
    card._teardownLiveView();
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
  });

  it("teardown exits iOS native fullscreen before detaching live media", () => {
    video.webkitDisplayingFullscreen = true;
    video.webkitExitFullscreen = vi.fn();
    card._teardownLiveView();
    expect(video.webkitExitFullscreen).toHaveBeenCalledTimes(1);
  });
});

describe("same-host top-layer card fullscreen fallback", () => {
  let open: boolean;
  beforeEach(() => {
    open = false;
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: false });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    card.showPopover = vi.fn(() => {
      open = true;
    });
    card.hidePopover = vi.fn(() => {
      open = false;
    });
    const matches = card.matches.bind(card);
    card.matches = vi.fn((selector: string) =>
      selector === ":popover-open" ? open : matches(selector)
    );
  });

  it("promotes the existing host without changing media, parent, mute or teardown", () => {
    const parent = document.createElement("div");
    parent.append(card);
    const teardown = vi.spyOn(card, "_teardownLiveView");
    card._toggleLiveFullscreen();
    expect(card.getAttribute("popover")).toBe("manual");
    expect(card.hasAttribute("data-live-fs-popover")).toBe(true);
    expect(open).toBe(true);
    expect(card.parentElement).toBe(parent);
    expect(card._liveCard).toBe(camera);
    expect(video.srcObject).toBe(stream);
    expect(video.muted).toBe(true);
    expect(teardown).not.toHaveBeenCalled();
    card._toggleLiveFullscreen();
    expect(card.hidePopover).toHaveBeenCalledTimes(1);
    expect(open).toBe(false);
    expect(card.hasAttribute("popover")).toBe(false);
    expect(card.hasAttribute("data-live-fs")).toBe(false);
    expect(card._liveFallbackCleanup).toBeNull();
  });

  it.each(["unavailable", "throws", "no-open"])(
    "retains conservative CSS fullscreen when popover %s",
    (reason) => {
      if (reason === "unavailable") card.showPopover = undefined;
      if (reason === "throws")
        card.showPopover.mockImplementation(() => {
          throw new Error("unsupported");
        });
      if (reason === "no-open") card.showPopover.mockImplementation(() => {});
      card._toggleLiveFullscreen();
      expect(card._liveFullscreen).toBe(true);
      expect(card.hasAttribute("data-live-fs")).toBe(true);
      expect(card.hasAttribute("popover")).toBe(false);
      card._toggleLiveFullscreen();
      expect(card._liveFullscreen).toBe(false);
    }
  );

  it("does not take ownership of a pre-existing popover attribute", () => {
    card.setAttribute("popover", "auto");
    card._toggleLiveFullscreen();
    card._toggleLiveFullscreen();
    expect(card.showPopover).not.toHaveBeenCalled();
    expect(card.hidePopover).not.toHaveBeenCalled();
    expect(card.getAttribute("popover")).toBe("auto");
  });

  it.each(["disconnect", "configuration"])("pairs popover cleanup on %s", (reason) => {
    card._toggleLiveFullscreen();
    if (reason === "disconnect") card.disconnectedCallback();
    else
      card.setConfig({
        entities: ["sensor.synthetic"],
        path_datetime_format: "YYYY-MM-DD",
        live_enabled: false,
      });
    expect(open).toBe(false);
    expect(card._liveFallbackCleanup).toBeNull();
  });

  it.each(["Escape", "popstate", "hashchange"])(
    "dismisses on %s without writing history",
    (reason) => {
      const push = vi.spyOn(history, "pushState");
      const replace = vi.spyOn(history, "replaceState");
      card._toggleLiveFullscreen();
      vi.spyOn(document, "activeElement", "get").mockReturnValue(card);
      window.dispatchEvent(
        reason === "Escape"
          ? new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
          : new Event(reason)
      );
      expect(open).toBe(false);
      expect(push).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
    }
  );

  it("routes Escape to the focused top card instead of an earlier background fallback", () => {
    card._toggleLiveFullscreen();
    const top: any = document.createElement("camera-gallery-card");
    top.requestUpdate = vi.fn();
    top._isLiveActive = () => true;
    top.showPopover = vi.fn();
    top.hidePopover = vi.fn();
    top.matches = vi.fn(() => true);
    top._enterCardFullscreenFallback();
    vi.spyOn(document, "activeElement", "get").mockReturnValue(top);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    expect(top._liveFullscreen).toBe(false);
    expect(card._liveFullscreen).toBe(true);
    expect(card.hidePopover).not.toHaveBeenCalled();
    top._teardownLiveView();
  });

  it.each(["hidden", "bubble-close"])(
    "closes when its composed ancestor becomes %s",
    async (reason) => {
      const parent = document.createElement("div");
      parent.className = "bubble-pop-up is-popup-opened";
      const root = parent.attachShadow({ mode: "open" });
      root.append(card);
      card._toggleLiveFullscreen();
      if (reason === "hidden") parent.hidden = true;
      else parent.classList.add("is-closing");
      await Promise.resolve();
      expect(open).toBe(false);
      expect(card._liveFullscreen).toBe(false);
    }
  );

  it("ignores unrelated native exit, cleans up on own native entry and ignores deferred toggle", () => {
    card._toggleLiveFullscreen();
    card._onFullscreenChange();
    expect(open).toBe(true);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: card });
    card._onFullscreenChange();
    expect(open).toBe(false);
    expect(card.hasAttribute("data-live-fs")).toBe(true);
    card.dispatchEvent(new Event("toggle"));
    expect(card.hasAttribute("data-live-fs")).toBe(true);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
  });

  it("restores focus and the original tabindex after exit", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const restore = vi.spyOn(trigger, "focus");
    card.setAttribute("tabindex", "0");
    card._toggleLiveFullscreen();
    expect(card.getAttribute("tabindex")).toBe("-1");
    card._toggleLiveFullscreen();
    expect(card.getAttribute("tabindex")).toBe("0");
    expect(restore).toHaveBeenCalledWith({ preventScroll: true });
    trigger.remove();
  });

  it("does not resurrect a popup closed while native entry was pending", async () => {
    const parent = document.createElement("div");
    parent.className = "bubble-pop-up is-popup-opened";
    parent.append(card);
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    let reject!: (reason: Error) => void;
    card.requestFullscreen = vi.fn(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        })
    );
    card._toggleLiveFullscreen();
    parent.classList.add("is-popup-closed");
    reject(new Error("denied"));
    await Promise.resolve();
    expect(card.showPopover).not.toHaveBeenCalled();
    expect(card.hasAttribute("data-live-fs")).toBe(false);
  });

  it("handles external popover dismissal and ignores a stale close after re-entry", () => {
    card._toggleLiveFullscreen();
    open = false;
    card.dispatchEvent(new Event("toggle"));
    expect(card._liveFullscreen).toBe(false);
    card._toggleLiveFullscreen();
    card.dispatchEvent(new Event("toggle"));
    expect(card._liveFullscreen).toBe(true);
  });
});
