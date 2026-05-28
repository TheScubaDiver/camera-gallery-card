import { describe, expect, it, vi } from "vitest";

import { detectPtzType, dispatchPan, getPtzConfig, joystickResolve, ptzCapabilities } from "./ptz";
import type { CameraGalleryCardConfig } from "../config/normalize";

const cfg = (over: Partial<CameraGalleryCardConfig> = {}): CameraGalleryCardConfig =>
  ({
    live_ptz_enabled: true,
    live_ptz_speed: 5,
    live_ptz_cameras: {},
    ...over,
  }) as CameraGalleryCardConfig;

describe("getPtzConfig", () => {
  it("returns null when ptz is globally disabled", () => {
    const c = cfg({
      live_ptz_enabled: false,
      live_ptz_cameras: { "camera.a": { type: "ezviz" } },
    });
    expect(getPtzConfig(c, "camera.a")).toBeNull();
  });

  it("returns null for synthetic stream ids", () => {
    const c = cfg({
      live_ptz_cameras: { __cgc_stream_0__: { type: "ezviz" } },
    });
    expect(getPtzConfig(c, "__cgc_stream_0__")).toBeNull();
  });

  it("returns null when the camera has no entry", () => {
    expect(getPtzConfig(cfg(), "camera.unknown")).toBeNull();
  });

  it("returns the entry as-is when the camera is configured", () => {
    const c = cfg({
      live_ptz_cameras: { "camera.a": { type: "ezviz" } },
    });
    const out = getPtzConfig(c, "camera.a");
    expect(out).toEqual({ type: "ezviz" });
  });
});

describe("dispatchPan", () => {
  it("presses the derived button entity on phase:start for ezviz", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan({ callService }, "camera.front_door", { type: "ezviz" }, "up", "start", 5);
    expect(callService).toHaveBeenCalledWith(
      "button",
      "press",
      {},
      { entity_id: "button.front_door_ptz_up" }
    );
  });

  it("is a no-op on phase:stop for ezviz (no stop service in the integration)", async () => {
    const callService = vi.fn();
    await dispatchPan({ callService }, "camera.front_door", { type: "ezviz" }, "up", "stop", 5);
    expect(callService).not.toHaveBeenCalled();
  });

  it("honours a user-supplied button_prefix override", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan(
      { callService },
      "camera.front_door",
      { type: "ezviz", button_prefix: "button.cam_lobby" },
      "left",
      "start",
      5
    );
    expect(callService.mock.calls[0]?.[3]).toEqual({
      entity_id: "button.cam_lobby_ptz_left",
    });
  });

  it("probes localised suffixes against hass.states", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    const states = { "button.front_door_ptz_omhoog": {} };
    await dispatchPan(
      { callService, states },
      "camera.front_door",
      { type: "ezviz" },
      "up",
      "start",
      5
    );
    expect(callService.mock.calls[0]?.[3]).toEqual({
      entity_id: "button.front_door_ptz_omhoog",
    });
  });

  it("falls back to the English suffix when nothing in hass.states matches", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan(
      { callService, states: {} },
      "camera.front_door",
      { type: "ezviz" },
      "right",
      "start",
      5
    );
    expect(callService.mock.calls[0]?.[3]).toEqual({
      entity_id: "button.front_door_ptz_right",
    });
  });

  it("rejects for unknown ptz types", async () => {
    const callService = vi.fn();
    await expect(
      // @ts-expect-error -- testing the unhappy path
      dispatchPan({ callService }, "camera.x", { type: "mystery" }, "up", "start", 5)
    ).rejects.toThrow(/Unknown PTZ type/);
    expect(callService).not.toHaveBeenCalled();
  });
});

describe("joystickResolve", () => {
  const cx = 100;
  const cy = 100;
  const r = 50;

  it("returns null inside the dead-zone", () => {
    expect(joystickResolve(cx, cy, r, 101, 101)).toEqual({
      direction: null,
      horizontal: null,
      vertical: null,
      magnitude: 0,
    });
  });

  it("returns 'right' when the thumb is pulled rightward", () => {
    const out = joystickResolve(cx, cy, r, 140, 102);
    expect(out.direction).toBe("right");
    expect(out.magnitude).toBeGreaterThan(0.5);
  });

  it("returns 'up' when pulled upward", () => {
    expect(joystickResolve(cx, cy, r, 100, 50).direction).toBe("up");
  });

  it("clamps magnitude to 1.0 past the rim", () => {
    const out = joystickResolve(cx, cy, r, 500, 100);
    expect(out.magnitude).toBe(1);
  });

  it("returns null for a zero-radius base", () => {
    expect(joystickResolve(0, 0, 0, 5, 5)).toEqual({
      direction: null,
      horizontal: null,
      vertical: null,
      magnitude: 0,
    });
  });

  it("reports both axes on a diagonal pull", () => {
    const out = joystickResolve(cx, cy, r, 135, 65);
    expect(out.horizontal).toBe("right");
    expect(out.vertical).toBe("up");
  });

  it("reports only the dominant axis when the off-axis stays inside the dead-zone", () => {
    // Hard right, only 2 px off centre vertically — secondary axis suppressed.
    const out = joystickResolve(cx, cy, r, 140, 102);
    expect(out.horizontal).toBe("right");
    expect(out.vertical).toBeNull();
  });
});

describe("detectPtzType", () => {
  it("picks reolink when a ptz_stop button exists", () => {
    expect(
      detectPtzType("camera.front", {
        states: {
          "button.front_ptz_stop": {},
          "button.front_ptz_left": {},
        },
      })
    ).toBe("reolink");
  });

  it("picks ezviz when only direction buttons exist (no stop)", () => {
    expect(
      detectPtzType("camera.front", {
        states: { "button.front_ptz_omhoog": {} },
      })
    ).toBe("ezviz");
  });

  it("strips substream suffixes so Reolink NVR slugs auto-detect", () => {
    // Camera entity carries `_sub`; the buttons live on the parent slug.
    expect(
      detectPtzType("camera.front_door_sub", {
        states: { "button.front_door_ptz_stop": {} },
      })
    ).toBe("reolink");
  });

  it("picks frigate only when the camera itself is Frigate-managed AND the service exists", () => {
    expect(
      detectPtzType("camera.x", {
        // Frigate's camera entity exposes camera_name + client_id.
        states: { "camera.x": { attributes: { camera_name: "x", client_id: "frigate" } } },
        services: { frigate: { ptz: {} } },
      })
    ).toBe("frigate");
  });

  it("does not pick frigate for a non-Frigate camera even if the service exists", () => {
    expect(
      detectPtzType("camera.deurbel", {
        states: { "camera.deurbel": { attributes: {} } },
        services: { frigate: { ptz: {} } },
      })
    ).toBeNull();
  });

  it("never auto-picks onvif (camera-specific capability can't be inferred)", () => {
    expect(
      detectPtzType("camera.x", {
        states: { "camera.x": { attributes: {} } },
        services: { onvif: { ptz: {} } },
      })
    ).toBeNull();
  });

  it("prefers reolink over frigate when both signals are present", () => {
    expect(
      detectPtzType("camera.x", {
        states: {
          "button.x_ptz_stop": {},
          "camera.x": { attributes: { camera_name: "x", client_id: "frigate" } },
        },
        services: { frigate: { ptz: {} } },
      })
    ).toBe("reolink");
  });

  it("returns null when nothing matches", () => {
    expect(detectPtzType("camera.x", { states: {}, services: {} })).toBeNull();
  });
});

describe("actions override (YAML escape hatch)", () => {
  it("dispatches the user-supplied service for a configured direction", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan(
      { callService },
      "camera.foscam",
      {
        type: "ezviz",
        actions: {
          left: {
            start: {
              service: "foscam.ptz",
              data: { movement: "left" },
              target: { entity_id: "camera.foscam" },
            },
          },
        },
      },
      "left",
      "start",
      5
    );
    expect(callService).toHaveBeenCalledWith(
      "foscam",
      "ptz",
      { movement: "left" },
      { entity_id: "camera.foscam" }
    );
  });

  it("falls through to the built-in dispatcher for directions without an override", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan(
      { callService },
      "camera.front_door",
      {
        type: "ezviz",
        actions: { left: { start: { service: "foscam.ptz" } } },
      },
      "up",
      "start",
      5
    );
    expect(callService).toHaveBeenCalledWith(
      "button",
      "press",
      {},
      { entity_id: "button.front_door_ptz_up" }
    );
  });

  it("falls through to the built-in stop when an override has no .stop", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan(
      { callService },
      "camera.driveway",
      {
        type: "frigate",
        actions: { left: { start: { service: "foscam.ptz" } } },
      },
      "left",
      "stop",
      5
    );
    expect(callService).toHaveBeenCalledWith(
      "frigate",
      "ptz",
      { action: "stop" },
      { entity_id: "camera.driveway" }
    );
  });
});

describe("ptzCapabilities", () => {
  it("reports ezviz as non-continuous (needs polling fallback)", () => {
    expect(ptzCapabilities({ type: "ezviz" }).continuous).toBe(false);
  });

  it("reports reolink + frigate as continuous", () => {
    expect(ptzCapabilities({ type: "reolink" }).continuous).toBe(true);
    expect(ptzCapabilities({ type: "frigate" }).continuous).toBe(true);
  });
});

describe("dispatchPan — reolink", () => {
  it("presses the direction button on start", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan(
      { callService, states: { "button.front_porch_ptz_left": {} } },
      "camera.front_porch",
      { type: "reolink" },
      "left",
      "start",
      5
    );
    expect(callService).toHaveBeenCalledWith(
      "button",
      "press",
      {},
      { entity_id: "button.front_porch_ptz_left" }
    );
  });

  it("presses the ptz_stop button on stop", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan(
      { callService, states: { "button.front_porch_ptz_stop": {} } },
      "camera.front_porch",
      { type: "reolink" },
      "left",
      "stop",
      5
    );
    expect(callService).toHaveBeenCalledWith(
      "button",
      "press",
      {},
      { entity_id: "button.front_porch_ptz_stop" }
    );
  });
});

describe("dispatchPan — onvif", () => {
  it("issues ContinuousMove with the right axis for pan", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan({ callService }, "camera.driveway", { type: "onvif" }, "right", "start", 5);
    expect(callService).toHaveBeenCalledWith(
      "onvif",
      "ptz",
      expect.objectContaining({ move_mode: "ContinuousMove", pan: "RIGHT" }),
      { entity_id: "camera.driveway" }
    );
  });

  it("issues ContinuousMove with the right axis for tilt", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan({ callService }, "camera.driveway", { type: "onvif" }, "up", "start", 5);
    expect(callService.mock.calls[0]?.[2]).toMatchObject({
      move_mode: "ContinuousMove",
      tilt: "UP",
    });
  });

  it("scales the 1–9 speed to ONVIF's 0–1 float", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan(
      { callService },
      "camera.driveway",
      { type: "onvif", speed: 9 },
      "right",
      "start",
      5
    );
    expect(callService.mock.calls[0]?.[2]).toMatchObject({ speed: 1 });
  });

  it("stops with move_mode: Stop", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan({ callService }, "camera.driveway", { type: "onvif" }, "right", "stop", 5);
    expect(callService).toHaveBeenCalledWith(
      "onvif",
      "ptz",
      { move_mode: "Stop" },
      { entity_id: "camera.driveway" }
    );
  });
});

describe("dispatchPan — frigate", () => {
  it("calls frigate.ptz with action:move + argument on start", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan({ callService }, "camera.driveway", { type: "frigate" }, "right", "start", 5);
    expect(callService).toHaveBeenCalledWith(
      "frigate",
      "ptz",
      { action: "move", argument: "right" },
      { entity_id: "camera.driveway" }
    );
  });

  it("calls frigate.ptz with action:stop on stop", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan({ callService }, "camera.driveway", { type: "frigate" }, "right", "stop", 5);
    expect(callService).toHaveBeenCalledWith(
      "frigate",
      "ptz",
      { action: "stop" },
      { entity_id: "camera.driveway" }
    );
  });
});
