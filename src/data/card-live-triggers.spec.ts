// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Wires the real card's trigger handling to the controller: hass state
// changes and Frigate pushes go in, view switches come out. The switching
// helpers themselves are stubbed; what matters is when the card switches,
// to which camera, and when it goes back.
let card: any;
let states: Record<string, { state: string }>;

function hassWith(next: Record<string, string>) {
  const old = { states };
  states = { ...states };
  for (const [id, s] of Object.entries(next)) states[id] = { state: s };
  return { old, now: { states } };
}

function setStates(next: Record<string, string>) {
  const { old, now } = hassWith(next);
  card._checkTriggerEntities(old, now);
}

beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  await import("../index.js");
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
  card = document.createElement("camera-gallery-card");
  card.requestUpdate = vi.fn();
  card.config = {
    live_enabled: true,
    live_layout: "single",
    live_cameras: [
      {
        entity: "camera.door",
        name: "",
        triggers: ["binary_sensor.door_motion", "event.doorbell"],
      },
      { entity: "camera.garden", name: "", triggers: ["binary_sensor.garden_motion"] },
    ],
    live_triggers: { frigate: true, hold_seconds: 30, cooldown_seconds: 10, return_to: "previous" },
  };
  card._viewMode = "media";
  card._hasLiveConfig = () => true;
  card._isLiveActive = () => card._viewMode === "live";
  card._getLiveCameraOptions = () => ["camera.door", "camera.garden"];
  card._setViewMode = vi.fn((mode: string) => {
    card._viewMode = mode;
  });
  card._selectLiveCamera = vi.fn((cam: string) => {
    card._liveSelectedCamera = cam;
  });
  card._returnToGrid = vi.fn();
  card._onGridTileTap = vi.fn();
  states = {
    "binary_sensor.door_motion": { state: "off" },
    "binary_sensor.garden_motion": { state: "off" },
    "event.doorbell": { state: "2026-11-12T11:00:00+00:00" },
  };
});

afterEach(() => {
  card._stopTriggerTimer();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("card camera triggers", () => {
  it("switches from the gallery to the triggered camera's live view", () => {
    setStates({ "binary_sensor.door_motion": "on" });
    expect(card._setViewMode).toHaveBeenCalledWith("live");
    expect(card._liveSelectedCamera).toBe("camera.door");
  });

  it("goes back to the gallery after the hold time", () => {
    setStates({ "binary_sensor.door_motion": "on" });
    vi.advanceTimersByTime(29_000);
    expect(card._viewMode).toBe("live");
    vi.advanceTimersByTime(2_000);
    expect(card._setViewMode).toHaveBeenLastCalledWith("media");
    expect(card._viewMode).toBe("media");
  });

  it("stays when the user taps the card during the hold", () => {
    setStates({ "binary_sensor.door_motion": "on" });
    vi.advanceTimersByTime(5_000);
    // connectedCallback attaches this as a capture-phase pointerdown/keydown
    // listener; the card is not connected here, so call it directly.
    card._onCardInteraction();
    vi.advanceTimersByTime(60_000);
    expect(card._viewMode).toBe("live");
  });

  it("swaps camera when live view already shows another one", () => {
    card._viewMode = "live";
    card._liveSelectedCamera = "camera.garden";
    setStates({ "event.doorbell": "2026-11-12T12:00:00+00:00" });
    expect(card._selectLiveCamera).toHaveBeenCalledWith("camera.door");
    vi.advanceTimersByTime(31_000);
    // Back to the camera it showed before.
    expect(card._selectLiveCamera).toHaveBeenLastCalledWith("camera.garden");
  });

  it("taps the grid tile when the card is in grid layout", () => {
    card.config = { ...card.config, live_layout: "grid" };
    card._viewMode = "live";
    setStates({ "binary_sensor.garden_motion": "on" });
    expect(card._onGridTileTap).toHaveBeenCalledWith("camera.garden");
    vi.advanceTimersByTime(31_000);
    expect(card._returnToGrid).toHaveBeenCalled();
  });

  it("does not switch while the live view is fullscreen", () => {
    card._viewMode = "live";
    card._liveSelectedCamera = "camera.garden";
    card._liveFullscreen = true;
    setStates({ "binary_sensor.door_motion": "on" });
    expect(card._selectLiveCamera).not.toHaveBeenCalled();
  });

  it("does not switch during talkback", () => {
    card._micState = "active";
    setStates({ "binary_sensor.door_motion": "on" });
    expect(card._setViewMode).not.toHaveBeenCalled();
  });

  it("ignores a sensor turning off", () => {
    states["binary_sensor.door_motion"] = { state: "on" };
    setStates({ "binary_sensor.door_motion": "off" });
    expect(card._setViewMode).not.toHaveBeenCalled();
  });

  it("switches on a new Frigate event for a live camera", () => {
    card._onFrigateEventPush(
      JSON.stringify({ type: "new", after: { camera: "garden", label: "person" } })
    );
    expect(card._liveSelectedCamera).toBe("camera.garden");
    expect(card._setViewMode).toHaveBeenCalledWith("live");
  });

  it("ignores Frigate events when Frigate triggers are off", () => {
    card.config = {
      ...card.config,
      live_triggers: { ...card.config.live_triggers, frigate: false },
    };
    card._onFrigateEventPush({ type: "new", after: { camera: "garden", label: "person" } });
    expect(card._setViewMode).not.toHaveBeenCalled();
  });

  it("does nothing without triggers configured", () => {
    card.config = { live_enabled: true, live_cameras: [{ entity: "camera.door", name: "" }] };
    setStates({ "binary_sensor.door_motion": "on" });
    expect(card._setViewMode).not.toHaveBeenCalled();
  });
});
