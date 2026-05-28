/**
 * PTZ resolution "scenario lab".
 *
 * Exercises the REAL dispatcher (`dispatchPan` / `dispatchAction` /
 * `detectPtzType`) against fabricated `hass.states` that mirror what the
 * Home Assistant Reolink integration actually creates — across language
 * (English vs Dutch) and camera shape (single-channel vs dual-lens).
 *
 * Each test asserts the entity the dispatcher *currently* hits. Tests
 * tagged `BUG:` document behaviour that is wrong today and that the
 * upcoming button-prefix / zoom-localisation fix is meant to flip. Tests
 * tagged `OK:` document behaviour that already works and must keep
 * working. Run with: `npx vitest run src/data/ptz-scenarios.spec.ts`.
 */
import { describe, it, expect, vi } from "vitest";

import { detectPtzType, detectPtzButtons, dispatchPan, dispatchAction, getPtzConfig } from "./ptz";
import type { PtzCameraConfig } from "./ptz";
import type { CameraGalleryCardConfig } from "../config/normalize";

const cfg = (over: Partial<CameraGalleryCardConfig> = {}): CameraGalleryCardConfig =>
  ({
    live_ptz_enabled: true,
    live_ptz_speed: 5,
    live_ptz_cameras: {},
    ...over,
  }) as CameraGalleryCardConfig;

type States = Record<string, unknown>;

/** Dutch / English Reolink PTZ button word per action (slugified name). */
const WORDS = {
  en: {
    up: "up",
    down: "down",
    left: "left",
    right: "right",
    zoom_in: "zoom_in",
    zoom_out: "zoom_out",
    stop: "stop",
  },
  nl: {
    up: "omhoog",
    down: "omlaag",
    left: "links",
    right: "rechts",
    zoom_in: "inzoomen",
    zoom_out: "uitzoomen",
    stop: "stoppen",
  },
} as const;

/**
 * Fabricate the entities a Reolink channel exposes. `stem` is the real
 * button slug (no stream suffix). `cameraId` is the camera entity (which
 * DOES carry a localized stream suffix). Buttons live on `stem`, never on
 * the camera slug — that mismatch is the whole bug.
 */
function reolinkChannel(stem: string, cameraId: string, lang: "en" | "nl"): States {
  const w = WORDS[lang];
  const s: States = { [cameraId]: { attributes: { friendly_name: cameraId } } };
  for (const word of Object.values(w)) s[`${stem}_ptz_${word}`] = {};
  s[`${stem.replace(/^button\./, "select.")}_ptz_preset`] = {
    attributes: { options: ["Home", "Voordeur"] },
  };
  return s;
}

/** Run one pan dispatch on a fresh recorder; return the [domain,svc,data,target] call. */
async function pan(
  states: States,
  cam: string,
  ptz: PtzCameraConfig,
  dir: "up" | "down" | "left" | "right",
  phase: "start" | "stop" = "start"
) {
  const callService = vi.fn().mockResolvedValue(undefined);
  await dispatchPan({ callService, states }, cam, ptz, dir, phase, 5);
  return callService.mock.calls[0];
}

/** Run one zoom/home dispatch on a fresh recorder. */
async function act(
  states: States,
  cam: string,
  ptz: PtzCameraConfig,
  action: "zoom_in" | "zoom_out" | "home",
  phase: "start" | "stop" = "start"
) {
  const callService = vi.fn().mockResolvedValue(undefined);
  await dispatchAction({ callService, states }, cam, ptz, action, phase, 5);
  return callService.mock.calls[0];
}

const target = (call: unknown[] | undefined) =>
  (call?.[3] as { entity_id?: string } | undefined)?.entity_id;

// ───────────────────────────────────────────────────────────────────────────
// Scenario 1 — NL single-channel, NO prefix (the reporter's exact situation)
//   camera.keuken_vloeiend  +  buttons at button.keuken_ptz_*
// ───────────────────────────────────────────────────────────────────────────
describe("NL single-channel, no button_prefix (camera.keuken_vloeiend)", () => {
  const CAM = "camera.keuken_vloeiend";
  const states = reolinkChannel("button.keuken", CAM, "nl");
  const ptz: PtzCameraConfig = { type: "reolink" };

  it("BUG: editor auto-detect fails to recognise the camera as PTZ-capable", () => {
    // `_vloeiend` is not stripped, so the stop-button probe never finds it.
    expect(detectPtzType(CAM, { states })).toBeNull();
  });

  it("BUG: pan targets a non-existent button (keeps the stream suffix)", async () => {
    expect(target(await pan(states, CAM, ptz, "up"))).toBe("button.keuken_vloeiend_ptz_up");
    // The real, existing button is button.keuken_ptz_omhoog — never hit.
    expect(states["button.keuken_ptz_omhoog"]).toBeDefined();
  });

  it("BUG: stop targets a non-existent button — camera would keep moving", async () => {
    expect(target(await pan(states, CAM, ptz, "left", "stop"))).toBe(
      "button.keuken_vloeiend_ptz_stop"
    );
  });

  it("BUG: zoom targets a non-existent button", async () => {
    expect(target(await act(states, CAM, ptz, "zoom_in"))).toBe(
      "button.keuken_vloeiend_ptz_zoom_in"
    );
  });

  it("BUG: home rejects (no select.keuken_vloeiend_ptz_preset)", async () => {
    await expect(
      dispatchAction({ callService: vi.fn(), states }, CAM, ptz, "home", "start", 5)
    ).rejects.toThrow(/No preset options/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 2 — EN single-channel, NO prefix (auto-strip path works… mostly)
//   camera.keuken_fluent  +  buttons at button.keuken_ptz_*
// ───────────────────────────────────────────────────────────────────────────
describe("EN single-channel, no button_prefix (camera.keuken_fluent)", () => {
  const CAM = "camera.keuken_fluent";
  const states = reolinkChannel("button.keuken", CAM, "en");
  const ptz: PtzCameraConfig = { type: "reolink" };

  it("OK: auto-detect works (_fluent is in the strip list)", () => {
    expect(detectPtzType(CAM, { states })).toBe("reolink");
  });

  it("OK: pan resolves via the stripped prefix", async () => {
    expect(target(await pan(states, CAM, ptz, "up"))).toBe("button.keuken_ptz_up");
  });

  it("OK: stop resolves via the stripped prefix", async () => {
    expect(target(await pan(states, CAM, ptz, "up", "stop"))).toBe("button.keuken_ptz_stop");
  });

  it("OK: zoom now resolves via the stripped prefix (zoomButtonEntity fix)", async () => {
    // Previously targeted the unstripped button.keuken_fluent_ptz_zoom_in;
    // now probes candidate prefixes and finds the real button.
    expect(target(await act(states, CAM, ptz, "zoom_in"))).toBe("button.keuken_ptz_zoom_in");
  });

  it("BUG: home ignores the strip fallback (uses unstripped slug) and rejects", async () => {
    await expect(
      dispatchAction({ callService: vi.fn(), states }, CAM, ptz, "home", "start", 5)
    ).rejects.toThrow(/No preset options/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 3 — NL single-channel WITH button_prefix (the proposed primary fix)
// ───────────────────────────────────────────────────────────────────────────
describe("NL single-channel WITH button_prefix=button.keuken", () => {
  const CAM = "camera.keuken_vloeiend";
  const states = reolinkChannel("button.keuken", CAM, "nl");
  const ptz: PtzCameraConfig = { type: "reolink", button_prefix: "button.keuken" };

  it("OK: pan up resolves the localized button", async () => {
    expect(target(await pan(states, CAM, ptz, "up"))).toBe("button.keuken_ptz_omhoog");
  });
  it("OK: pan down resolves the localized button", async () => {
    expect(target(await pan(states, CAM, ptz, "down"))).toBe("button.keuken_ptz_omlaag");
  });
  it("OK: pan left/right resolve", async () => {
    expect(target(await pan(states, CAM, ptz, "left"))).toBe("button.keuken_ptz_links");
    expect(target(await pan(states, CAM, ptz, "right"))).toBe("button.keuken_ptz_rechts");
  });
  it("OK: stop resolves the localized stop button", async () => {
    expect(target(await pan(states, CAM, ptz, "up", "stop"))).toBe("button.keuken_ptz_stoppen");
  });
  it("OK: home resolves the preset select and picks 'Home'", async () => {
    const call = await act(states, CAM, ptz, "home");
    expect(call?.[0]).toBe("select");
    expect(call?.[1]).toBe("select_option");
    expect((call?.[2] as { option?: string }).option).toBe("Home");
    expect(target(call)).toBe("select.keuken_ptz_preset");
  });
  it("BUG: zoom still fails — not localized (presses _zoom_in not _inzoomen)", async () => {
    expect(target(await act(states, CAM, ptz, "zoom_in"))).toBe("button.keuken_ptz_zoom_in");
    expect(states["button.keuken_ptz_inzoomen"]).toBeDefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 4 — EN single-channel WITH button_prefix (everything works)
// ───────────────────────────────────────────────────────────────────────────
describe("EN single-channel WITH button_prefix=button.keuken", () => {
  const CAM = "camera.keuken_fluent";
  const states = reolinkChannel("button.keuken", CAM, "en");
  const ptz: PtzCameraConfig = { type: "reolink", button_prefix: "button.keuken" };

  it("OK: pan / stop / zoom / home all resolve", async () => {
    expect(target(await pan(states, CAM, ptz, "up"))).toBe("button.keuken_ptz_up");
    expect(target(await pan(states, CAM, ptz, "up", "stop"))).toBe("button.keuken_ptz_stop");
    expect(target(await act(states, CAM, ptz, "zoom_in"))).toBe("button.keuken_ptz_zoom_in");
    expect(target(await act(states, CAM, ptz, "home"))).toBe("select.keuken_ptz_preset");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 5 — Dual-lens, no prefix (mid-string stream token → always breaks)
//   camera.tuin_vloeiend_lens_0  +  buttons at button.tuin_lens_0_ptz_*
// ───────────────────────────────────────────────────────────────────────────
describe("Dual-lens, no button_prefix", () => {
  it("BUG: NL dual-lens auto-detect fails", () => {
    const CAM = "camera.tuin_vloeiend_lens_0";
    const states = reolinkChannel("button.tuin_lens_0", CAM, "nl");
    expect(detectPtzType(CAM, { states })).toBeNull();
  });
  it("BUG: EN dual-lens auto-detect ALSO fails (stream token is mid-string)", () => {
    const CAM = "camera.tuin_fluent_lens_0";
    const states = reolinkChannel("button.tuin_lens_0", CAM, "en");
    expect(detectPtzType(CAM, { states })).toBeNull();
  });
  it("BUG: NL dual-lens pan targets non-existent button", async () => {
    const CAM = "camera.tuin_vloeiend_lens_0";
    const states = reolinkChannel("button.tuin_lens_0", CAM, "nl");
    expect(target(await pan(states, CAM, { type: "reolink" }, "up"))).toBe(
      "button.tuin_vloeiend_lens_0_ptz_up"
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 6 — Dual-lens WITH button_prefix (directions/stop/home fixed, zoom not)
// ───────────────────────────────────────────────────────────────────────────
describe("Dual-lens WITH button_prefix=button.tuin_lens_0 (NL)", () => {
  const CAM = "camera.tuin_vloeiend_lens_0";
  const states = reolinkChannel("button.tuin_lens_0", CAM, "nl");
  const ptz: PtzCameraConfig = { type: "reolink", button_prefix: "button.tuin_lens_0" };

  it("OK: pan + stop + home resolve", async () => {
    expect(target(await pan(states, CAM, ptz, "up"))).toBe("button.tuin_lens_0_ptz_omhoog");
    expect(target(await pan(states, CAM, ptz, "up", "stop"))).toBe(
      "button.tuin_lens_0_ptz_stoppen"
    );
    expect(target(await act(states, CAM, ptz, "home"))).toBe("select.tuin_lens_0_ptz_preset");
  });
  it("BUG: zoom not localized", async () => {
    expect(target(await act(states, CAM, ptz, "zoom_in"))).toBe("button.tuin_lens_0_ptz_zoom_in");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 7 — Manual per-button override (the safety net) fixes anything
// ───────────────────────────────────────────────────────────────────────────
describe("Manual actions override (safety net)", () => {
  const CAM = "camera.keuken_vloeiend";
  const states = reolinkChannel("button.keuken", CAM, "nl");

  it("OK: override fixes localized zoom that the built-in dispatcher misses", async () => {
    const ptz: PtzCameraConfig = {
      type: "reolink",
      button_prefix: "button.keuken",
      actions: {
        zoom_in: {
          start: { service: "button.press", target: { entity_id: "button.keuken_ptz_inzoomen" } },
        },
      },
    };
    expect(target(await act(states, CAM, ptz, "zoom_in"))).toBe("button.keuken_ptz_inzoomen");
  });

  it("OK: override fixes a single renamed direction button without touching the rest", async () => {
    const ptz: PtzCameraConfig = {
      type: "reolink",
      button_prefix: "button.keuken",
      actions: {
        up: {
          start: { service: "button.press", target: { entity_id: "button.weird_renamed_up" } },
        },
      },
    };
    expect(target(await pan(states, CAM, ptz, "up"))).toBe("button.weird_renamed_up");
    // down still uses the prefix-derived localized button
    expect(target(await pan(states, CAM, ptz, "down"))).toBe("button.keuken_ptz_omlaag");
  });

  it("OK: malformed override service rejects (surfaced like any dispatcher error)", async () => {
    const ptz: PtzCameraConfig = {
      type: "reolink",
      actions: { up: { start: { service: "buttonpress", target: { entity_id: "x" } } } },
    };
    await expect(
      dispatchPan({ callService: vi.fn(), states }, CAM, ptz, "up", "start", 5)
    ).rejects.toThrow(/Malformed PTZ action service/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 8 — EZVIZ (pulse, button-based): same prefix/locale logic as reolink
// ───────────────────────────────────────────────────────────────────────────
describe("EZVIZ type", () => {
  const CAM = "camera.front_door";
  const ptz: PtzCameraConfig = { type: "ezviz" };

  it("OK: pan start presses the derived button (no states → English guess)", async () => {
    expect(target(await pan({}, CAM, ptz, "up"))).toBe("button.front_door_ptz_up");
  });
  it("OK: pan start probes localized button when present", async () => {
    const states = { "button.front_door_ptz_omhoog": {} };
    expect(target(await pan(states, CAM, ptz, "up"))).toBe("button.front_door_ptz_omhoog");
  });
  it("OK: pan stop is a no-op (integration has no stop call)", async () => {
    const callService = vi.fn();
    await dispatchPan({ callService, states: {} }, CAM, ptz, "up", "stop", 5);
    expect(callService).not.toHaveBeenCalled();
  });
  it("OK: button_prefix override is honoured", async () => {
    const p: PtzCameraConfig = { type: "ezviz", button_prefix: "button.cam_lobby" };
    expect(target(await pan({}, CAM, p, "left"))).toBe("button.cam_lobby_ptz_left");
  });
  it("OK: zoom is rejected (consumer EZVIZ has no zoom)", async () => {
    await expect(
      dispatchAction({ callService: vi.fn(), states: {} }, CAM, ptz, "zoom_in", "start", 5)
    ).rejects.toThrow(/zoom not supported for type: ezviz/);
  });
  it("OK: home is rejected (no home on EZVIZ)", async () => {
    await expect(
      dispatchAction({ callService: vi.fn(), states: {} }, CAM, ptz, "home", "start", 5)
    ).rejects.toThrow(/home not supported for type: ezviz/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 9 — FRIGATE (service-based on the camera entity, no buttons)
// ───────────────────────────────────────────────────────────────────────────
describe("FRIGATE type", () => {
  const CAM = "camera.driveway";
  const ptz: PtzCameraConfig = { type: "frigate" };

  it("OK: pan move/stop call frigate.ptz on the camera entity", async () => {
    const start = await pan({}, CAM, ptz, "up");
    expect(start?.slice(0, 3)).toEqual(["frigate", "ptz", { action: "move", argument: "up" }]);
    expect(target(start)).toBe(CAM);
    const stop = await pan({}, CAM, ptz, "up", "stop");
    expect(stop?.slice(0, 3)).toEqual(["frigate", "ptz", { action: "stop" }]);
  });
  it("OK: zoom in/out map to argument in/out", async () => {
    expect((await act({}, CAM, ptz, "zoom_in"))?.[2]).toEqual({ action: "zoom", argument: "in" });
    expect((await act({}, CAM, ptz, "zoom_out"))?.[2]).toEqual({ action: "zoom", argument: "out" });
  });
  it("OK: home calls preset home", async () => {
    expect((await act({}, CAM, ptz, "home"))?.[2]).toEqual({ action: "preset", argument: "home" });
  });
  it("OK: home on stop phase is a no-op", async () => {
    const callService = vi.fn();
    await dispatchAction({ callService, states: {} }, CAM, ptz, "home", "stop", 5);
    expect(callService).not.toHaveBeenCalled();
  });
  it("OK: auto-detect needs the frigate camera attrs (camera_name + client_id) AND the service", () => {
    // The Frigate integration's camera entity exposes camera_name + client_id.
    const states = { [CAM]: { attributes: { camera_name: "driveway", client_id: "frigate" } } };
    const services = { frigate: { ptz: {} } };
    expect(detectPtzType(CAM, { states, services })).toBe("frigate");
    expect(detectPtzType(CAM, { states })).toBeNull(); // service missing
    expect(detectPtzType(CAM, { states: { [CAM]: { attributes: {} } }, services })).toBeNull(); // attrs missing
    // camera_name without client_id is not enough (avoids false positives)
    expect(
      detectPtzType(CAM, { states: { [CAM]: { attributes: { camera_name: "x" } } }, services })
    ).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 10 — ONVIF (ContinuousMove + speed scaling + diagonal)
// ───────────────────────────────────────────────────────────────────────────
describe("ONVIF type", () => {
  const CAM = "camera.ptz_cam";
  const ptz: PtzCameraConfig = { type: "onvif" };

  it("OK: pan maps direction to pan/tilt axis with scaled speed", async () => {
    const up = await pan({}, CAM, ptz, "up");
    expect(up?.[0]).toBe("onvif");
    expect(up?.[1]).toBe("ptz");
    const data = up?.[2] as { move_mode: string; tilt: string; speed: number };
    expect(data.move_mode).toBe("ContinuousMove");
    expect(data.tilt).toBe("UP");
    expect(data.speed).toBeCloseTo(5 / 9, 5);
    const left = await pan({}, CAM, ptz, "left");
    expect((left?.[2] as { pan: string }).pan).toBe("LEFT");
  });
  it("OK: stop sends move_mode Stop", async () => {
    expect((await pan({}, CAM, ptz, "up", "stop"))?.[2]).toEqual({ move_mode: "Stop" });
  });
  it("OK: per-camera speed override scales (9/9 = 1.0)", async () => {
    const data = (await pan({}, CAM, { type: "onvif", speed: 9 }, "right"))?.[2] as {
      speed: number;
    };
    expect(data.speed).toBeCloseTo(1, 5);
  });
  it("OK: diagonal sets both pan and tilt in one call", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan({ callService, states: {} }, CAM, ptz, "up", "start", 5, "right");
    const data = callService.mock.calls[0]?.[2] as { tilt: string; pan: string };
    expect(data.tilt).toBe("UP");
    expect(data.pan).toBe("RIGHT");
  });
  it("OK: same-axis secondary is ignored (no overwrite)", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await dispatchPan({ callService, states: {} }, CAM, ptz, "left", "start", 5, "right");
    const data = callService.mock.calls[0]?.[2] as { pan: string };
    expect(data.pan).toBe("LEFT"); // primary wins, "right" not applied
  });
  it("OK: zoom in/out + stop", async () => {
    expect((await act({}, CAM, ptz, "zoom_in"))?.[2]).toMatchObject({ zoom: "ZOOM_IN" });
    expect((await act({}, CAM, ptz, "zoom_out"))?.[2]).toMatchObject({ zoom: "ZOOM_OUT" });
    expect((await act({}, CAM, ptz, "zoom_in", "stop"))?.[2]).toEqual({ move_mode: "Stop" });
  });
  it("OK: home goes to preset 0", async () => {
    expect((await act({}, CAM, ptz, "home"))?.[2]).toEqual({ move_mode: "GotoPreset", preset: 0 });
  });
  it("OK: not auto-detectable (must be picked manually)", () => {
    expect(detectPtzType(CAM, { states: { [CAM]: { attributes: {} } } })).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 11 — Reolink home / preset select edge cases
// ───────────────────────────────────────────────────────────────────────────
describe("Reolink home preset edge cases", () => {
  const CAM = "camera.keuken";
  const ptz: PtzCameraConfig = { type: "reolink", button_prefix: "button.keuken" };
  const withOptions = (options: unknown) => ({
    "select.keuken_ptz_preset": { attributes: { options } },
  });

  it("picks the option literally named 'Home' (case-insensitive)", async () => {
    const call = await act(withOptions(["Voordeur", "HOME", "Tuin"]), CAM, ptz, "home");
    expect((call?.[2] as { option: string }).option).toBe("HOME");
  });
  it("falls back to the first option when there is no 'Home'", async () => {
    const call = await act(withOptions(["Voordeur", "Tuin"]), CAM, ptz, "home");
    expect((call?.[2] as { option: string }).option).toBe("Voordeur");
  });
  it("rejects on an empty options list", async () => {
    await expect(
      dispatchAction(
        { callService: vi.fn(), states: withOptions([]) },
        CAM,
        ptz,
        "home",
        "start",
        5
      )
    ).rejects.toThrow(/No preset options/);
  });
  it("rejects when the preset select entity is missing", async () => {
    await expect(
      dispatchAction({ callService: vi.fn(), states: {} }, CAM, ptz, "home", "start", 5)
    ).rejects.toThrow(/No preset options/);
  });
  it("ignores non-string options when choosing", async () => {
    const call = await act(withOptions([1, "Tuin", null]), CAM, ptz, "home");
    expect((call?.[2] as { option: string }).option).toBe("Tuin");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 12 — button_prefix normalization
// ───────────────────────────────────────────────────────────────────────────
describe("button_prefix normalization", () => {
  const states = {
    "button.keuken_ptz_up": {},
    "select.keuken_ptz_preset": { attributes: { options: ["Home"] } },
  };
  it("strips a trailing underscore", async () => {
    const p: PtzCameraConfig = { type: "reolink", button_prefix: "button.keuken_" };
    expect(target(await pan(states, "camera.x", p, "up"))).toBe("button.keuken_ptz_up");
  });
  it("strips a trailing dot", async () => {
    const p: PtzCameraConfig = { type: "reolink", button_prefix: "button.keuken." };
    expect(target(await pan(states, "camera.x", p, "up"))).toBe("button.keuken_ptz_up");
  });
  it("derives the select slug from the prefix (strips leading 'button.')", async () => {
    const p: PtzCameraConfig = { type: "reolink", button_prefix: "button.keuken" };
    expect(target(await act(states, "camera.anything", p, "home"))).toBe(
      "select.keuken_ptz_preset"
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 13 — Localized direction resolution across languages
// ───────────────────────────────────────────────────────────────────────────
describe("Localized direction probing (multi-language)", () => {
  const cases: Array<[string, "up" | "down" | "left" | "right", string]> = [
    ["German hoch", "up", "hoch"],
    ["German runter", "down", "runter"],
    ["French haut", "up", "haut"],
    ["French gauche", "left", "gauche"],
    ["Spanish abajo", "down", "abajo"],
    ["Spanish derecha", "right", "derecha"],
    ["Italian giu", "down", "giu"],
    ["Norwegian hoyre", "right", "hoyre"],
  ];
  for (const [name, dir, word] of cases) {
    it(`resolves ${name}`, async () => {
      const states = { [`button.cam_ptz_${word}`]: {} };
      expect(target(await pan(states, "camera.cam", { type: "reolink" }, dir))).toBe(
        `button.cam_ptz_${word}`
      );
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 14 — ezviz entity-resolution cache (stale entry must not be served)
// ───────────────────────────────────────────────────────────────────────────
describe("button-entity resolution cache", () => {
  const CAM = "camera.cachecam";
  const ptz: PtzCameraConfig = { type: "ezviz" };

  it("a guess is not cached; a later-appearing entity still resolves", async () => {
    expect(target(await pan({}, CAM, ptz, "up"))).toBe("button.cachecam_ptz_up"); // guess
    const states = { "button.cachecam_ptz_omhoog": {} };
    expect(target(await pan(states, CAM, ptz, "up"))).toBe("button.cachecam_ptz_omhoog"); // resolves
  });

  it("a cached hit is re-validated against current states (stale not served)", async () => {
    const states = { "button.cachecam2_ptz_omhoog": {} };
    expect(target(await pan(states, "camera.cachecam2", ptz, "up"))).toBe(
      "button.cachecam2_ptz_omhoog"
    );
    // entity gone → must not keep returning the cached omhoog
    expect(target(await pan({}, "camera.cachecam2", ptz, "up"))).toBe("button.cachecam2_ptz_up");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 15 — detectPtzType precedence
// ───────────────────────────────────────────────────────────────────────────
describe("detectPtzType precedence", () => {
  it("reolink wins when a stop button exists (even alongside directions)", () => {
    const states = { "button.cam_ptz_up": {}, "button.cam_ptz_stop": {} };
    expect(detectPtzType("camera.cam", { states })).toBe("reolink");
  });
  it("ezviz when only direction buttons exist (no stop)", () => {
    expect(detectPtzType("camera.cam", { states: { "button.cam_ptz_up": {} } })).toBe("ezviz");
  });
  it("ezviz via localized direction (Dutch) with no stop", () => {
    expect(detectPtzType("camera.cam", { states: { "button.cam_ptz_omhoog": {} } })).toBe("ezviz");
  });
  it("null when nothing matches", () => {
    expect(detectPtzType("camera.cam", { states: {} })).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 16 — getPtzConfig plumbing
// ───────────────────────────────────────────────────────────────────────────
describe("getPtzConfig plumbing", () => {
  it("returns null when globally disabled", () => {
    expect(
      getPtzConfig(
        cfg({ live_ptz_enabled: false, live_ptz_cameras: { "camera.a": { type: "reolink" } } }),
        "camera.a"
      )
    ).toBeNull();
  });
  it("returns null for synthetic stream ids", () => {
    expect(
      getPtzConfig(
        cfg({ live_ptz_cameras: { __cgc_stream_0__: { type: "ezviz" } } }),
        "__cgc_stream_0__"
      )
    ).toBeNull();
  });
  it("passes through type, speed, trimmed button_prefix and actions", () => {
    const c = cfg({
      live_ptz_cameras: {
        "camera.a": {
          type: "reolink",
          speed: 7,
          button_prefix: "  button.keuken  ",
          actions: {
            up: { start: { service: "button.press", target: { entity_id: "button.x" } } },
          },
        },
      },
    });
    expect(getPtzConfig(c, "camera.a")).toEqual({
      type: "reolink",
      speed: 7,
      button_prefix: "button.keuken",
      actions: { up: { start: { service: "button.press", target: { entity_id: "button.x" } } } },
    });
  });
  it("omits an empty/whitespace-only button_prefix", () => {
    const c = cfg({ live_ptz_cameras: { "camera.a": { type: "reolink", button_prefix: "   " } } });
    expect(getPtzConfig(c, "camera.a")).toEqual({ type: "reolink" });
  });
  it("passes through the buttons map, trimming and dropping blanks", () => {
    const c = cfg({
      live_ptz_cameras: {
        "camera.a": {
          type: "reolink",
          buttons: { up: "  button.x_ptz_up  ", down: "", left: "   ", stop: "button.x_ptz_stop" },
        },
      },
    });
    expect(getPtzConfig(c, "camera.a")).toEqual({
      type: "reolink",
      buttons: { up: "button.x_ptz_up", stop: "button.x_ptz_stop" },
    });
  });
  it("omits the buttons key entirely when every value is blank", () => {
    const c = cfg({ live_ptz_cameras: { "camera.a": { type: "reolink", buttons: { up: "  " } } } });
    expect(getPtzConfig(c, "camera.a")).toEqual({ type: "reolink" });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 17 — manual `buttons` map is honoured (manual-first path)
// ───────────────────────────────────────────────────────────────────────────
describe("Manual buttons map", () => {
  const CAM = "camera.keuken_vloeiend";
  const states = {
    ...reolinkChannel("button.keuken", CAM, "nl"),
    "select.custom_preset": { attributes: { options: ["Home", "Voordeur"] } },
  };

  it("presses the explicit pan / stop / zoom entities", async () => {
    const ptz: PtzCameraConfig = {
      type: "reolink",
      buttons: { up: "button.custom_up", stop: "button.custom_stop", zoom_in: "button.custom_zin" },
    };
    expect(target(await pan(states, CAM, ptz, "up"))).toBe("button.custom_up");
    expect(target(await pan(states, CAM, ptz, "up", "stop"))).toBe("button.custom_stop");
    expect(target(await act(states, CAM, ptz, "zoom_in"))).toBe("button.custom_zin");
  });

  it("uses the explicit home select entity", async () => {
    const ptz: PtzCameraConfig = { type: "reolink", buttons: { home: "select.custom_preset" } };
    const call = await act(states, CAM, ptz, "home");
    expect(target(call)).toBe("select.custom_preset");
    expect((call?.[2] as { option: string }).option).toBe("Home");
  });

  it("buttons win over auto-derivation even when button_prefix is set", async () => {
    const ptz: PtzCameraConfig = {
      type: "reolink",
      button_prefix: "button.keuken",
      buttons: { up: "button.override_up" },
    };
    expect(target(await pan(states, CAM, ptz, "up"))).toBe("button.override_up");
    // a key NOT in buttons still falls back to the prefix-derived localized one
    expect(target(await pan(states, CAM, ptz, "down"))).toBe("button.keuken_ptz_omlaag");
  });

  it("a free-form actions override still wins over the buttons map", async () => {
    const ptz: PtzCameraConfig = {
      type: "reolink",
      buttons: { up: "button.from_buttons" },
      actions: {
        up: { start: { service: "button.press", target: { entity_id: "button.from_actions" } } },
      },
    };
    expect(target(await pan(states, CAM, ptz, "up"))).toBe("button.from_actions");
  });

  it("a blank buttons value falls through to auto-derivation", async () => {
    const ptz: PtzCameraConfig = {
      type: "reolink",
      button_prefix: "button.keuken",
      buttons: { up: "   " },
    };
    expect(target(await pan(states, CAM, ptz, "up"))).toBe("button.keuken_ptz_omhoog");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Scenario 18 — detectPtzButtons (engine behind the editor "Detect" button)
// ───────────────────────────────────────────────────────────────────────────
describe("detectPtzButtons", () => {
  it("NL single-channel: finds localized dirs + stop + home, leaves zoom blank", () => {
    const CAM = "camera.keuken_vloeiend";
    const states = reolinkChannel("button.keuken", CAM, "nl");
    expect(detectPtzButtons(CAM, { states })).toEqual({
      up: "button.keuken_ptz_omhoog",
      down: "button.keuken_ptz_omlaag",
      left: "button.keuken_ptz_links",
      right: "button.keuken_ptz_rechts",
      stop: "button.keuken_ptz_stoppen",
      home: "select.keuken_ptz_preset",
      // no zoom_in/zoom_out — NL zoom buttons (_inzoomen) aren't English-probed
    });
  });

  it("EN single-channel: finds everything including zoom", () => {
    const CAM = "camera.keuken_fluent";
    const states = reolinkChannel("button.keuken", CAM, "en");
    expect(detectPtzButtons(CAM, { states })).toEqual({
      up: "button.keuken_ptz_up",
      down: "button.keuken_ptz_down",
      left: "button.keuken_ptz_left",
      right: "button.keuken_ptz_right",
      zoom_in: "button.keuken_ptz_zoom_in",
      zoom_out: "button.keuken_ptz_zoom_out",
      stop: "button.keuken_ptz_stop",
      home: "select.keuken_ptz_preset",
    });
  });

  it("NL dual-lens: recovers the stem by stripping the mid-string stream token", () => {
    const CAM = "camera.tuin_vloeiend_lens_0";
    const states = reolinkChannel("button.tuin_lens_0", CAM, "nl");
    expect(detectPtzButtons(CAM, { states })).toMatchObject({
      up: "button.tuin_lens_0_ptz_omhoog",
      stop: "button.tuin_lens_0_ptz_stoppen",
      home: "select.tuin_lens_0_ptz_preset",
    });
  });

  it("returns {} when no PTZ buttons exist for the camera", () => {
    expect(detectPtzButtons("camera.doorbell", { states: { "camera.doorbell": {} } })).toEqual({});
  });
});
