// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The real editor's menu-button entity field (#287): HA's entity picker is
// used when available, and picking an entity pre-fills an empty icon from it.
class FakeEntityPicker extends HTMLElement {
  hass: unknown;
  value = "";
  allowCustomEntity = false;
}

beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  customElements.define("ha-entity-picker", FakeEntityPicker);
  await import("../index.js");
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeEditor(menuButtons: Record<string, unknown>[]) {
  const ed: any = document.createElement("camera-gallery-card-editor");
  document.body.append(ed);
  ed.hass = {
    states: {
      "light.porch": {
        entity_id: "light.porch",
        state: "off",
        attributes: { friendly_name: "Porch" },
      },
      "cover.garage": {
        entity_id: "cover.garage",
        state: "closed",
        attributes: { device_class: "garage" },
      },
    },
    themes: {},
    config: { components: [] },
    locale: { language: "en" },
  };
  ed.setConfig({
    type: "custom:camera-gallery-card",
    live_enabled: true,
    live_cameras: [{ entity: "camera.x" }],
    menu_buttons: menuButtons,
  });
  ed._activeTab = "live";
  ed._v2OpenSections.set("live.menu", true);
  ed._render();
  return ed;
}

describe("editor menu-button entity picker", () => {
  it("uses HA's entity picker for each button and for the add form", () => {
    const ed = makeEditor([{ entity: "light.porch", icon: "mdi:lightbulb" }]);
    const pickers = ed.shadowRoot.querySelectorAll("ha-entity-picker");
    expect(pickers.length).toBe(2);
    expect(pickers[0].value).toBe("light.porch");
    expect(pickers[0].allowCustomEntity).toBe(true);
    ed.remove();
  });

  it("pre-fills the add form's icon from the picked entity", () => {
    const ed = makeEditor([]);
    const picker = ed.shadowRoot.querySelector("ha-entity-picker");
    picker.dispatchEvent(new CustomEvent("value-changed", { detail: { value: "cover.garage" } }));
    expect(ed.shadowRoot.getElementById("menubtn-icon-input").value).toBe("mdi:garage");
    ed.remove();
  });

  it("keeps an icon the user already typed", () => {
    const ed = makeEditor([]);
    ed.shadowRoot.getElementById("menubtn-icon-input").value = "mdi:star";
    ed.shadowRoot
      .querySelector("ha-entity-picker")
      .dispatchEvent(new CustomEvent("value-changed", { detail: { value: "cover.garage" } }));
    expect(ed.shadowRoot.getElementById("menubtn-icon-input").value).toBe("mdi:star");
    ed.remove();
  });

  it("changes an existing button's entity without touching its icon", () => {
    const ed = makeEditor([{ entity: "light.porch", icon: "mdi:outdoor-lamp" }]);
    ed.shadowRoot
      .querySelector("ha-entity-picker")
      .dispatchEvent(new CustomEvent("value-changed", { detail: { value: "cover.garage" } }));
    expect(ed._config.menu_buttons[0]).toMatchObject({
      entity: "cover.garage",
      icon: "mdi:outdoor-lamp",
    });
    ed.remove();
  });
});
