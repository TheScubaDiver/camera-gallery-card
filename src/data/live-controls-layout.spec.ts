import { describe, expect, it } from "vitest";
import { itemKey, liveControlZones, zonesToConfig } from "./live-controls-layout";

const keys = (items: Parameters<typeof itemKey>[0][]) => items.map(itemKey);
const ALL_PILLS = [
  "pill:mute",
  "pill:picker",
  "pill:pip",
  "pill:fullscreen",
  "pill:snapshot",
  "pill:refresh",
];

describe("liveControlZones", () => {
  it("puts every built-in pill on row 1 in catalog order by default", () => {
    const z = liveControlZones({}, []);
    expect(keys(z.row1)).toEqual(ALL_PILLS);
    expect(z.row2).toEqual([]);
    expect(z.menu).toEqual([]);
  });

  it("keeps buttons in the menu unless placed among the controls", () => {
    const z = liveControlZones({}, [
      { entity: "light.a" },
      { entity: "light.b", placement: "controls" },
    ]);
    expect(keys(z.menu)).toEqual(["btn:0"]);
    expect(keys(z.row1)).toEqual([...ALL_PILLS, "btn:1"]);
  });

  it("sorts buttons with an order between the pills", () => {
    const z = liveControlZones({}, [{ entity: "light.a", placement: "controls", order: 12 }]);
    expect(keys(z.row1)).toEqual([
      "pill:mute",
      "btn:0",
      "pill:picker",
      "pill:pip",
      "pill:fullscreen",
      "pill:snapshot",
      "pill:refresh",
    ]);
  });

  it("puts row 2 pills and buttons on the second row", () => {
    const z = liveControlZones({ snapshot: { row: 2 }, refresh: { row: 2, order: 5 } }, [
      { entity: "light.a", placement: "controls", row: 2, order: 50 },
    ]);
    expect(keys(z.row2)).toEqual(["pill:refresh", "pill:snapshot", "btn:0"]);
    expect(keys(z.row1)).toEqual(["pill:mute", "pill:picker", "pill:pip", "pill:fullscreen"]);
  });

  it("marks disabled pills but keeps their place", () => {
    const z = liveControlZones({ pip: { enabled: false } }, []);
    expect(z.row1.find((i) => i.kind === "pill" && i.id === "pip")).toEqual({
      kind: "pill",
      id: "pip",
      enabled: false,
    });
  });
});

describe("zonesToConfig", () => {
  it("leaves the default layout out of the config", () => {
    const out = zonesToConfig({ row1: ALL_PILLS, row2: [], menu: ["btn:0"] }, {}, [
      { entity: "light.a", icon: "mdi:x" },
    ]);
    expect(out.live_pills).toEqual({});
    expect(out.menu_buttons).toEqual([{ entity: "light.a", icon: "mdi:x" }]);
  });

  it("writes order and row for pills and buttons", () => {
    const out = zonesToConfig(
      { row1: ["pill:mute", "btn:0", "pill:picker"], row2: ["pill:snapshot"], menu: ["btn:1"] },
      {},
      [
        { entity: "light.a", icon: "mdi:a" },
        { entity: "light.b", icon: "mdi:b", placement: "controls", order: 99 },
      ]
    );
    // mute keeps 10, the button slots in at 11, picker keeps its default 15.
    expect(out.live_pills["picker"]).toBeUndefined();
    expect(out.live_pills["snapshot"]).toEqual({ row: 2 });
    expect(out.menu_buttons).toEqual([
      { entity: "light.a", icon: "mdi:a", placement: "controls", order: 11 },
      { entity: "light.b", icon: "mdi:b" },
    ]);
  });

  it("keeps a pill switched off", () => {
    const out = zonesToConfig(
      { row1: ["pill:mute"], row2: [], menu: [] },
      { mute: { enabled: false } },
      []
    );
    expect(out.live_pills["mute"]).toEqual({ enabled: false });
  });

  it("never puts a built-in pill in the menu", () => {
    const out = zonesToConfig(
      { row1: [], row2: [], menu: ["pill:mute"] },
      { mute: { order: 5 } },
      []
    );
    // Ignored in the menu; its previous setting is kept.
    expect(out.live_pills["mute"]).toEqual({ order: 5 });
  });

  it("never drops a button the editor didn't list", () => {
    const out = zonesToConfig({ row1: [], row2: [], menu: [] }, {}, [
      { entity: "light.a", icon: "mdi:a" },
    ]);
    expect(out.menu_buttons).toEqual([{ entity: "light.a", icon: "mdi:a" }]);
  });

  it("round-trips through liveControlZones", () => {
    const pills = { snapshot: { row: 2 } };
    const buttons = [
      { entity: "light.a", icon: "mdi:a", placement: "controls", order: 12 },
      { entity: "siren.b", icon: "mdi:b" },
    ];
    const z = liveControlZones(pills, buttons);
    const out = zonesToConfig(
      { row1: keys(z.row1), row2: keys(z.row2), menu: keys(z.menu) },
      pills,
      buttons
    );
    const again = liveControlZones(out.live_pills, out.menu_buttons);
    expect(keys(again.row1).map((k) => (k.startsWith("btn") ? "btn" : k))).toEqual(
      keys(z.row1).map((k) => (k.startsWith("btn") ? "btn" : k))
    );
    expect(keys(again.row2)).toEqual(keys(z.row2));
    expect(again.menu.length).toBe(1);
  });
});
