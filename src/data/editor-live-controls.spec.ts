// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";

// The real editor's Live → Controls zones (#286): Row 1, Row 2 and Menu,
// filled from live_pills and menu_buttons, rearranged by drag-and-drop.
beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  await import("../index.js");
});

function makeEditor(extra: Record<string, unknown> = {}) {
  const ed: any = document.createElement("camera-gallery-card-editor");
  document.body.append(ed);
  ed.hass = { states: {}, themes: {}, config: { components: [] }, locale: { language: "en" } };
  ed.setConfig({
    type: "custom:camera-gallery-card",
    live_enabled: true,
    live_cameras: [{ entity: "camera.x" }],
    menu_buttons: [
      { entity: "light.porch", icon: "mdi:lightbulb", title: "Porch" },
      { entity: "siren.garden", icon: "mdi:alarm-light", title: "Siren" },
    ],
    ...extra,
  });
  ed._activeTab = "live";
  ed._v2OpenSections.set("live.controls", true);
  ed._render();
  return ed;
}

const zoneKeys = (ed: any, zone: string) =>
  [...ed.shadowRoot.querySelectorAll(`[data-ctl-zone="${zone}"] [data-ctl-key]`)].map(
    (r: any) => r.dataset.ctlKey
  );
const row = (ed: any, key: string) => ed.shadowRoot.querySelector(`[data-ctl-key="${key}"]`);
const zone = (ed: any, key: string) => ed.shadowRoot.querySelector(`[data-ctl-zone="${key}"]`);
const drag = (ed: any, key: string, target: Element) => {
  row(ed, key).dispatchEvent(new Event("dragstart", { bubbles: true }));
  target.dispatchEvent(new Event("drop", { bubbles: true }));
};

describe("editor live controls zones", () => {
  it("shows built-in controls in Row 1 and menu buttons in Menu by default", () => {
    const ed = makeEditor();
    expect(zoneKeys(ed, "row1")).toEqual([
      "pill:mute",
      "pill:picker",
      "pill:pip",
      "pill:fullscreen",
      "pill:snapshot",
      "pill:refresh",
    ]);
    expect(zoneKeys(ed, "row2")).toEqual([]);
    expect(zoneKeys(ed, "menu")).toEqual(["btn:0", "btn:1"]);
    ed.remove();
  });

  it("moves a menu button between the built-in controls", () => {
    const ed = makeEditor();
    drag(ed, "btn:0", row(ed, "pill:picker"));
    expect(ed._config.menu_buttons[0]).toMatchObject({
      entity: "light.porch",
      placement: "controls",
      order: 11,
    });
    expect(ed._config.live_pills).toBeUndefined();
    ed.remove();
  });

  it("moves a built-in control to Row 2", () => {
    const ed = makeEditor();
    drag(ed, "pill:snapshot", zone(ed, "row2"));
    expect(ed._config.live_pills).toEqual({ snapshot: { row: 2 } });
    ed.remove();
  });

  it("does not put a built-in control in the menu", () => {
    const ed = makeEditor();
    drag(ed, "pill:mute", zone(ed, "menu"));
    expect(ed._config.live_pills).toBeUndefined();
    ed.remove();
  });

  it("moves a button back from the controls to the menu", () => {
    const ed = makeEditor({
      menu_buttons: [
        { entity: "light.porch", icon: "mdi:lightbulb", placement: "controls", order: 11, row: 2 },
      ],
    });
    expect(zoneKeys(ed, "row2")).toEqual(["btn:0"]);
    drag(ed, "btn:0", zone(ed, "menu"));
    expect(ed._config.menu_buttons[0]).toEqual({ entity: "light.porch", icon: "mdi:lightbulb" });
    ed.remove();
  });
});
