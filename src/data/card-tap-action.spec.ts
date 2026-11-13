// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The real card's tap handling (#244, #288): grid tiles with and without a
// per-camera tap_action, and the single view with per-camera and card-wide
// actions.
let card: any;

beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  await import("../index.js");
});

beforeEach(() => {
  card = document.createElement("camera-gallery-card");
  card.requestUpdate = vi.fn();
  card._onGridTileTap = vi.fn();
  card._viewMode = "live";
  card._liveLayoutOverride = null;
  card._getLiveCameraOptions = () => ["camera.driveway", "camera.garden"];
  card._pathHasClass = () => false;
  card.config = {
    live_enabled: true,
    live_layout: "grid",
    live_cameras: [
      {
        entity: "camera.driveway",
        name: "",
        tap_action: { action: "navigate", navigation_path: "/security/driveway" },
      },
      { entity: "camera.garden", name: "" },
    ],
  };
  vi.spyOn(history, "pushState").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("card tap actions", () => {
  it("runs a tile's own tap_action instead of focusing", () => {
    const changed = vi.fn();
    window.addEventListener("location-changed", changed);
    card._onGridTileClick("camera.driveway");
    expect(history.pushState).toHaveBeenCalledWith(null, "", "/security/driveway");
    expect(changed).toHaveBeenCalled();
    expect(card._onGridTileTap).not.toHaveBeenCalled();
    window.removeEventListener("location-changed", changed);
  });

  it("focuses a tile without its own tap_action", () => {
    card._onGridTileClick("camera.garden");
    expect(card._onGridTileTap).toHaveBeenCalledWith("camera.garden");
  });

  it("does nothing on a tile with action none", () => {
    card.config.live_cameras[1].tap_action = { action: "none" };
    card._onGridTileClick("camera.garden");
    expect(card._onGridTileTap).not.toHaveBeenCalled();
  });

  it("ignores the card-wide tap_action on grid tiles", () => {
    card.config.tap_action = { action: "navigate", navigation_path: "/elsewhere" };
    card._onGridTileClick("camera.garden");
    expect(card._onGridTileTap).toHaveBeenCalledWith("camera.garden");
    expect(history.pushState).not.toHaveBeenCalled();
  });

  it("uses the camera's own action in single view, before the card-wide one", () => {
    card.config = {
      ...card.config,
      live_layout: "single",
      tap_action: { action: "navigate", navigation_path: "/elsewhere" },
    };
    card._liveSelectedCamera = "camera.driveway";
    expect(card._runTapAction([])).toBe(true);
    expect(history.pushState).toHaveBeenCalledWith(null, "", "/security/driveway");
  });

  it("falls back to the card-wide action in single view", () => {
    card.config = {
      ...card.config,
      live_layout: "single",
      tap_action: { action: "navigate", navigation_path: "/elsewhere" },
    };
    card._liveSelectedCamera = "camera.garden";
    card._runTapAction([]);
    expect(history.pushState).toHaveBeenCalledWith(null, "", "/elsewhere");
  });

  it("opens more-info for the camera on screen, also when it was never picked", () => {
    card.config = {
      ...card.config,
      live_layout: "single",
      live_cameras: [{ entity: "camera.garden", name: "" }],
      tap_action: { action: "more-info" },
    };
    card._getLiveCameraOptions = () => ["camera.garden"];
    card._liveSelectedCamera = null;
    const info = vi.fn();
    card.addEventListener("hass-more-info", info);
    expect(card._runTapAction([])).toBe(true);
    expect(info.mock.calls[0]?.[0].detail).toEqual({ entityId: "camera.garden" });
  });
});
