import { describe, expect, it } from "vitest";
import {
  buildTriggerMap,
  frigateEventCamera,
  isTriggerActivation,
  LiveTriggerController,
  type FireContext,
} from "./live-triggers";

type View = { mode: string; camera: string | null };

const OPTS = { holdMs: 30_000, cooldownMs: 10_000, interactionGraceMs: 15_000 };
const GALLERY: View = { mode: "media", camera: null };

function ctx(over: Partial<FireContext<View>> = {}): FireContext<View> {
  return { blocked: false, currentView: GALLERY, showingCamera: null, ...over };
}

describe("LiveTriggerController", () => {
  it("switches to the triggered camera", () => {
    const c = new LiveTriggerController<View>(OPTS);
    expect(c.fire("camera.door", 1000, ctx())).toEqual({ action: "switch", camera: "camera.door" });
    expect(c.holding).toBe(true);
    expect(c.camera).toBe("camera.door");
  });

  it("goes back to the previous view after the hold time", () => {
    const c = new LiveTriggerController<View>(OPTS);
    c.fire("camera.door", 0, ctx());
    expect(c.tick(29_000)).toEqual({ action: "none" });
    expect(c.tick(30_000)).toEqual({ action: "return", to: "previous", view: GALLERY });
    expect(c.holding).toBe(false);
    expect(c.tick(31_000)).toEqual({ action: "none" });
  });

  it("stays put when the user touched the card during the hold", () => {
    const c = new LiveTriggerController<View>(OPTS);
    c.fire("camera.door", 0, ctx());
    c.userInteracted(5_000);
    expect(c.tick(30_000)).toEqual({ action: "release" });
  });

  it("restarts the hold on a new trigger and keeps the original view", () => {
    const c = new LiveTriggerController<View>({ ...OPTS, cooldownMs: 0 });
    const live: View = { mode: "live", camera: "camera.door" };
    c.fire("camera.door", 0, ctx());
    // Second trigger 20 s later: the card now shows the door camera.
    expect(
      c.fire("camera.door", 20_000, ctx({ currentView: live, showingCamera: "camera.door" }))
    ).toEqual({
      action: "extend",
      camera: "camera.door",
    });
    expect(c.tick(30_000)).toEqual({ action: "none" });
    expect(c.tick(50_000)).toEqual({ action: "return", to: "previous", view: GALLERY });
  });

  it("lets the last trigger win when another camera fires", () => {
    const c = new LiveTriggerController<View>(OPTS);
    c.fire("camera.door", 0, ctx());
    const r = c.fire("camera.garden", 5_000, ctx({ showingCamera: "camera.door" }));
    expect(r).toEqual({ action: "switch", camera: "camera.garden" });
    expect(c.camera).toBe("camera.garden");
    expect(c.tick(35_000)).toEqual({ action: "return", to: "previous", view: GALLERY });
  });

  it("ignores a repeat trigger for the same camera inside the cooldown", () => {
    const c = new LiveTriggerController<View>(OPTS);
    c.fire("camera.door", 0, ctx());
    expect(c.fire("camera.door", 9_000, ctx())).toEqual({ action: "ignore", reason: "cooldown" });
    // The ignored trigger does not extend the hold.
    expect(c.tick(30_000).action).toBe("return");
  });

  it("keeps the cooldown per camera", () => {
    const c = new LiveTriggerController<View>(OPTS);
    c.fire("camera.door", 0, ctx());
    expect(c.fire("camera.garden", 1_000, ctx()).action).toBe("switch");
  });

  it("does not switch while blocked (fullscreen, PiP, talkback)", () => {
    const c = new LiveTriggerController<View>(OPTS);
    expect(c.fire("camera.door", 0, ctx({ blocked: true }))).toEqual({
      action: "ignore",
      reason: "blocked",
    });
    expect(c.holding).toBe(false);
    // A blocked trigger does not start the cooldown.
    expect(c.fire("camera.door", 1_000, ctx()).action).toBe("switch");
  });

  it("does not switch shortly after the user touched the card", () => {
    const c = new LiveTriggerController<View>(OPTS);
    c.userInteracted(10_000);
    expect(c.fire("camera.door", 20_000, ctx())).toEqual({
      action: "ignore",
      reason: "interaction",
    });
    expect(c.fire("camera.door", 25_000, ctx()).action).toBe("switch");
  });

  it("returns to the gallery when returnTo is gallery", () => {
    const c = new LiveTriggerController<View>({ ...OPTS, returnTo: "gallery" });
    c.fire("camera.door", 0, ctx({ currentView: { mode: "live", camera: "camera.garden" } }));
    expect(c.tick(30_000)).toEqual({ action: "return", to: "gallery" });
  });

  it("only releases when returnTo is stay", () => {
    const c = new LiveTriggerController<View>({ ...OPTS, returnTo: "stay" });
    c.fire("camera.door", 0, ctx());
    expect(c.tick(30_000)).toEqual({ action: "release" });
  });

  it("reset forgets the run and the cooldowns", () => {
    const c = new LiveTriggerController<View>(OPTS);
    c.fire("camera.door", 0, ctx());
    c.reset();
    expect(c.holding).toBe(false);
    expect(c.fire("camera.door", 1_000, ctx()).action).toBe("switch");
  });
});

describe("isTriggerActivation", () => {
  it("fires when a sensor turns on, not when it turns off or stays on", () => {
    expect(isTriggerActivation("binary_sensor.door_motion", "off", "on")).toBe(true);
    expect(isTriggerActivation("binary_sensor.door_motion", "on", "off")).toBe(false);
    expect(isTriggerActivation("binary_sensor.door_motion", "on", "on")).toBe(false);
  });

  it("accepts the usual active states", () => {
    for (const s of ["open", "detected", "occupied", "home", "ringing"]) {
      expect(isTriggerActivation("sensor.x", "idle", s)).toBe(true);
    }
    expect(isTriggerActivation("sensor.x", "idle", "clear")).toBe(false);
  });

  it("fires when a sensor comes back active, not when it goes unavailable", () => {
    expect(isTriggerActivation("binary_sensor.door_motion", "unavailable", "on")).toBe(true);
    expect(isTriggerActivation("binary_sensor.door_motion", "on", "unavailable")).toBe(false);
  });

  it("fires an event entity on every new event timestamp", () => {
    const a = "2026-11-12T10:00:00.000+00:00";
    const b = "2026-11-12T10:05:00.000+00:00";
    expect(isTriggerActivation("event.doorbell", a, b)).toBe(true);
    expect(isTriggerActivation("event.doorbell", b, b)).toBe(false);
  });

  it("does not fire an event entity that returns from unavailable", () => {
    expect(isTriggerActivation("event.doorbell", "unavailable", "2026-11-12T10:00:00+00:00")).toBe(
      false
    );
    expect(isTriggerActivation("event.doorbell", "2026-11-12T10:00:00+00:00", "unavailable")).toBe(
      false
    );
  });
});

describe("buildTriggerMap", () => {
  it("maps each trigger entity to its cameras", () => {
    const map = buildTriggerMap([
      { id: "camera.door", triggers: ["binary_sensor.door_motion", "event.doorbell"] },
      { id: "camera.garden", triggers: ["binary_sensor.door_motion", " "] },
    ]);
    expect(map.get("event.doorbell")).toEqual(["camera.door"]);
    expect(map.get("binary_sensor.door_motion")).toEqual(["camera.door", "camera.garden"]);
    expect(map.has(" ")).toBe(false);
  });
});

describe("frigateEventCamera", () => {
  const cams = ["camera.front_door", "camera.garden"];
  const ev = (type: string, camera: string, label = "person") => ({
    type,
    after: { camera, label },
  });

  it("matches a new Frigate event to camera.<name>", () => {
    expect(frigateEventCamera(ev("new", "front_door"), cams)).toBe("camera.front_door");
  });

  it("ignores update and end messages", () => {
    expect(frigateEventCamera(ev("update", "front_door"), cams)).toBeNull();
    expect(frigateEventCamera(ev("end", "front_door"), cams)).toBeNull();
  });

  it("ignores cameras that are not in the live list", () => {
    expect(frigateEventCamera(ev("new", "shed"), cams)).toBeNull();
  });

  it("filters on labels when given", () => {
    expect(frigateEventCamera(ev("new", "garden", "cat"), cams, ["person"])).toBeNull();
    expect(frigateEventCamera(ev("new", "garden", "person"), cams, ["person"])).toBe(
      "camera.garden"
    );
  });

  it("survives malformed payloads", () => {
    expect(frigateEventCamera(null, cams)).toBeNull();
    expect(frigateEventCamera({ type: "new" }, cams)).toBeNull();
    expect(frigateEventCamera("garbage", cams)).toBeNull();
  });
});
