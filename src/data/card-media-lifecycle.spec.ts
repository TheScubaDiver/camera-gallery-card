// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the real card fullscreen/lifecycle handlers without contacting HA,
// requesting capture, or opening real fullscreen surfaces. The shadow chains
// are real so fullscreen retargeting and teardown walk the actual tree.
let card: any;
let camera: any;
let player: any;
let video: any;
let stream: any;

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
    live_cameras: [{ entity: "camera.test" }],
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
  stream = {};
  video.srcObject = stream;
});

afterEach(() => {
  card._teardownLiveView();
  card._clearPreviewVideoHostPlayback();
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("real card live-media lifecycle", () => {
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

  function prepareCameraSwitch() {
    Object.defineProperty(card, "updateComplete", { value: Promise.resolve(true) });
    vi.spyOn(card, "_mountLiveCard").mockResolvedValue(undefined);
    const exit = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
    return exit;
  }

  it.each(["fullscreenElement", "webkitFullscreenElement"] as const)(
    "camera selection retains nested card fullscreen and releases the old media (%s)",
    async (property) => {
      const exit = prepareCameraSwitch();
      nestedFullscreen(property);
      card._onFullscreenChange();
      // PR3 trim: the integrate row also drives mic/talkback state
      // (micState helper, _talkbackAudio/_liveAudioTimer, audio.stop) — those
      // fields land with the audio PR (E), not with camera-switch continuity.
      const socket = { close: vi.fn() };
      const connection = { close: vi.fn() };
      card._rtcWebSocket = socket;
      card._rtcPeerConnection = connection;
      const generation = card._liveViewGeneration;
      await card._selectLiveCamera("camera.other");
      expect(card.hasAttribute("data-live-fs")).toBe(true);
      expect(card._ownsFullscreen()).toBe(true);
      expect(exit).not.toHaveBeenCalled();
      expect(card.requestFullscreen).not.toHaveBeenCalled();
      expect(card._liveViewGeneration).toBe(generation + 1);
      expect(video.pause).toHaveBeenCalled();
      expect(video.srcObject).toBeNull();
      expect(camera.parentElement).toBeNull();
      expect(socket.close).toHaveBeenCalledTimes(1);
      expect(connection.close).toHaveBeenCalledTimes(1);
      Object.defineProperty(document, property, { configurable: true, value: null });
    }
  );

  it("arrows retain CSS card fullscreen through successive selections", async () => {
    const exit = prepareCameraSwitch();
    card.config.live_cameras.push({ entity: "camera.other" }, { entity: "camera.third" });
    card._hass = { states: { "camera.test": {}, "camera.other": {}, "camera.third": {} } };
    card._liveFullscreen = true;
    card.setAttribute("data-live-fs", "");
    card._navLiveCamera(1);
    card._navLiveCamera(1);
    await Promise.resolve();
    expect(card._liveSelectedCamera).toBe("camera.third");
    expect(card._liveFullscreen).toBe(true);
    expect(card.hasAttribute("data-live-fs")).toBe(true);
    expect(exit).not.toHaveBeenCalled();
    expect(card.requestFullscreen).not.toHaveBeenCalled();
  });

  it("a selection never exits another card's nested fullscreen", async () => {
    const exit = prepareCameraSwitch();
    const root = nestedFullscreen("fullscreenElement");
    const other = document.createElement("div");
    root.append(other);
    Object.defineProperty(root, "fullscreenElement", { configurable: true, value: other });
    await card._selectLiveCamera("camera.other");
    expect(exit).not.toHaveBeenCalled();
    expect(card.hasAttribute("data-live-fs")).toBe(false);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
  });

  it.each(["fullscreenElement", "webkitFullscreenElement"] as const)(
    "a selection exits descendant fullscreen before replacing the player (%s)",
    async (property) => {
      const exit = prepareCameraSwitch();
      nestedFullscreen(property);
      Object.defineProperty(card.renderRoot, property, { configurable: true, value: camera });
      card.setAttribute("data-live-fs", "");
      await card._selectLiveCamera("camera.other");
      expect(exit).toHaveBeenCalledTimes(1);
      expect(card.hasAttribute("data-live-fs")).toBe(false);
      Object.defineProperty(document, property, { configurable: true, value: null });
    }
  );

  it("a selection exits iOS native video fullscreen", async () => {
    // PR3 trim: the integrate row also checks _liveVideoFsCleanup + video
    // control restore — those belong to the PR#239 backport (A) and land
    // with that PR, not with camera-switch continuity.
    prepareCameraSwitch();
    video.webkitDisplayingFullscreen = true;
    video.webkitExitFullscreen = vi.fn();
    await card._selectLiveCamera("camera.other");
    expect(video.webkitExitFullscreen).toHaveBeenCalledTimes(1);
    expect(card.hasAttribute("data-live-fs")).toBe(false);
    video.webkitDisplayingFullscreen = false;
  });

  it.each(["media", "disconnect", "configuration"])(
    "preserved card fullscreen still exits on %s",
    async (reason) => {
      const exit = prepareCameraSwitch();
      nestedFullscreen("fullscreenElement");
      card._onFullscreenChange();
      await card._selectLiveCamera("camera.other");
      if (reason === "media") card._setViewMode("media");
      else if (reason === "disconnect") card.disconnectedCallback();
      else
        card.setConfig({
          type: "custom:camera-gallery-card",
          entities: ["sensor.synthetic"],
          path_datetime_format: "YYYY-MM-DD",
          live_enabled: false,
        });
      expect(exit).toHaveBeenCalled();
      expect(card.hasAttribute("data-live-fs")).toBe(false);
      expect(card._liveFullscreen).toBe(false);
      Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    }
  );

  it.each(["resolve", "reject"])(
    "pending card entry can %s across a camera selection without exit/re-entry",
    async (outcome) => {
      const exit = prepareCameraSwitch();
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      card.requestFullscreen.mockReturnValue(
        new Promise<void>((done, fail) => {
          resolve = done;
          reject = fail;
        })
      );
      card._toggleLiveFullscreen();
      await card._selectLiveCamera("camera.other");
      if (outcome === "resolve") {
        nestedFullscreen("fullscreenElement");
        card._onFullscreenChange();
        resolve();
      } else reject(new Error("denied"));
      await Promise.resolve();
      expect(card.hasAttribute("data-live-fs")).toBe(true);
      expect(exit).not.toHaveBeenCalled();
      expect(card.requestFullscreen).toHaveBeenCalledTimes(1);
      Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    }
  );

  it.each(["control", "native-exit"])(
    "a genuine %s invalidates a pending card request after a camera selection",
    async (reason) => {
      prepareCameraSwitch();
      let reject!: (error: Error) => void;
      card.requestFullscreen.mockReturnValue(
        new Promise((_, fail) => {
          reject = fail;
        })
      );
      card._toggleLiveFullscreen();
      await card._selectLiveCamera("camera.other");
      const root = nestedFullscreen("fullscreenElement");
      card._onFullscreenChange();
      if (reason === "control") card._toggleLiveFullscreen();
      Object.defineProperty(root, "fullscreenElement", { configurable: true, value: null });
      Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
      card._onFullscreenChange();
      reject(new Error("denied"));
      await Promise.resolve();
      expect(card.hasAttribute("data-live-fs")).toBe(false);
      expect(card._liveFullscreen).toBe(false);
    }
  );

  it("rapid real mounts discard older readiness and seed the final camera muted", async () => {
    Object.defineProperty(card, "updateComplete", { value: Promise.resolve(true) });
    card.config.live_cameras.push({ entity: "camera.other" }, { entity: "camera.third" });
    card._hass = {
      states: {
        "camera.other": { last_changed: "other" },
        "camera.third": { last_changed: "third" },
      },
    };
    card._liveFullscreen = true;
    card.setAttribute("data-live-fs", "");
    let release!: () => void;
    vi.spyOn(customElements, "whenDefined").mockReturnValue(
      new Promise<CustomElementConstructor>((done) => {
        release = () => done(HTMLElement);
      })
    );
    vi.spyOn(card, "_setupAutoAspectRatio").mockImplementation(() => {});
    const mount = vi.spyOn(card, "_mountLiveCard");
    await card._selectLiveCamera("camera.other");
    await card._selectLiveCamera("camera.third");
    release();
    await Promise.all(mount.mock.results.map((result) => result.value));
    expect(card._liveCardConfigKey).toBe("webrtc:camera.third");
    expect(card._liveCard.stateObj.last_changed).toBe("third");
    expect(card.renderRoot.querySelector("#live-card-host").childElementCount).toBe(1);
    expect(card._liveCard.muted).toBe(true);
    expect(card.hasAttribute("data-live-fs")).toBe(true);
    expect(camera.parentElement).toBeNull();
    // PR3 trim: the integrate row also asserts `audio.stop` untouched —
    // receiver-audio tracking lands with the audio PR (E).
  });

  it("a true exit during camera readiness prevents a late remount", async () => {
    Object.defineProperty(card, "updateComplete", { value: Promise.resolve(true) });
    let release!: () => void;
    vi.spyOn(customElements, "whenDefined").mockReturnValue(
      new Promise<CustomElementConstructor>((done) => {
        release = () => done(HTMLElement);
      })
    );
    const mount = vi.spyOn(card, "_mountLiveCard");
    await card._selectLiveCamera("camera.other");
    card._setViewMode("media");
    release();
    await Promise.all(mount.mock.results.map((result) => result.value));
    expect(card._liveCard).toBeNull();
    expect(card.renderRoot.querySelector("#live-card-host").childElementCount).toBe(0);
    // PR3 trim: the integrate row also expects `_liveAudioTimer` null — that
    // field lands with the audio PR (E).
    expect(card.hasAttribute("data-live-fs")).toBe(false);
  });

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

  it("a late native fullscreen entry is released after live teardown", async () => {
    let resolve!: () => void;
    card.requestFullscreen.mockReturnValue(
      new Promise<void>((done) => {
        resolve = done;
      })
    );
    document.exitFullscreen = vi.fn(() => Promise.resolve());
    card._toggleLiveFullscreen();
    card._teardownLiveView();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: card });
    resolve();
    await Promise.resolve();
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
  });

  it("stale card fullscreen rejection does not enable CSS fullscreen after teardown", async () => {
    let reject!: (reason: Error) => void;
    card.requestFullscreen.mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    card._toggleLiveFullscreen();
    card._teardownLiveView();
    reject(new Error("denied"));
    await Promise.resolve();
    expect(card.hasAttribute("data-live-fs")).toBe(false);
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

  it("keeps popover open across a camera switch and clears it on true teardown", async () => {
    Object.defineProperty(card, "updateComplete", { value: Promise.resolve(true) });
    vi.spyOn(card, "_mountLiveCard").mockResolvedValue(undefined);
    card._toggleLiveFullscreen();
    await card._selectLiveCamera("camera.other");
    expect(open).toBe(true);
    expect(card.showPopover).toHaveBeenCalledTimes(1);
    expect(card.hidePopover).not.toHaveBeenCalled();
    // PR3 trim: the integrate row also expects `video.muted` true — the
    // silence-first mute write lands with the audio PR (E).
    expect(video.srcObject).toBeNull();
    card._setViewMode("media");
    expect(open).toBe(false);
    expect(card.hasAttribute("data-live-fs-popover")).toBe(false);
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
