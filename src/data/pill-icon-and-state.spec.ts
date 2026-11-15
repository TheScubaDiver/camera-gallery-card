import { describe, expect, it } from "vitest";

import { normalizeConfig } from "../config/normalize";
import type { HassEntity } from "../types/hass";
import { zonesToConfig } from "./live-controls-layout";
import { menuButtonStateText } from "./menu-buttons";
import { GALLERY_PILL_CATALOG, resolvePillIcon, resolvePillSettings } from "./pill-catalog";

// #306: own icons for the built-in pills, and a menu button's state as text.
const base = {
  source_mode: "sensor",
  entities: ["sensor.foo"],
  path_datetime_format: "YYYY-MM-DD",
};

describe("resolvePillIcon", () => {
  it("keeps the built-in icon without an override", () => {
    expect(resolvePillIcon(undefined, "mdi:camera", null, false)).toBe("mdi:camera");
    expect(resolvePillIcon({}, "mdi:volume-high", "mdi:volume-off", true)).toBe("mdi:volume-off");
  });

  it("uses icon, and icon_on while active", () => {
    const entry = { icon: "mdi:speaker", icon_on: "mdi:speaker-off" };
    expect(resolvePillIcon(entry, "mdi:volume-high", "mdi:volume-off", false)).toBe("mdi:speaker");
    expect(resolvePillIcon(entry, "mdi:volume-high", "mdi:volume-off", true)).toBe(
      "mdi:speaker-off"
    );
  });

  it("still shows the built-in active icon when only icon is set", () => {
    expect(
      resolvePillIcon({ icon: "mdi:speaker" }, "mdi:volume-high", "mdi:volume-off", true)
    ).toBe("mdi:volume-off");
  });

  it("keeps icon on an active pill without an active icon", () => {
    expect(
      resolvePillIcon({ icon: "mdi:pip" }, "mdi:picture-in-picture-bottom-right", null, true)
    ).toBe("mdi:pip");
  });
});

describe("menuButtonStateText", () => {
  const state = { entity_id: "cover.gate", state: "open", attributes: {} } as unknown as HassEntity;

  it("uses Home Assistant's formatted state", () => {
    expect(menuButtonStateText(state, { formatEntityState: () => "Open" })).toBe("Open");
  });

  it("falls back to the raw state, and is empty without one", () => {
    expect(menuButtonStateText(state, null)).toBe("open");
    expect(menuButtonStateText(undefined, null)).toBe("");
  });
});

describe("config", () => {
  it("accepts icon and icon_on on built-in pills, and show_state on buttons", () => {
    const { config } = normalizeConfig({
      ...base,
      live_pills: { snapshot: { icon: "mdi:camera-iris" } },
      gallery_pills: { mute: { icon: "mdi:speaker", icon_on: "mdi:speaker-off" } },
      menu_buttons: [{ entity: "cover.gate", icon: "mdi:gate", show_state: true }],
    });
    expect(config.live_pills["snapshot"]?.icon).toBe("mdi:camera-iris");
    expect(config.gallery_pills["mute"]?.icon_on).toBe("mdi:speaker-off");
    expect(config.menu_buttons[0]?.show_state).toBe(true);
  });

  it("keeps a gallery pill in place when only its icon is set", () => {
    const { config } = normalizeConfig({
      ...base,
      gallery_pills: { fullscreen: { icon: "mdi:arrow-expand" } },
    });
    const settings = resolvePillSettings(GALLERY_PILL_CATALOG, config.gallery_pills);
    expect(settings.get("fullscreen")?.order).toBe(50);
  });
});

describe("editor drag keeps pill icons", () => {
  it("carries icon and icon_on through zonesToConfig", () => {
    const out = zonesToConfig(
      { row1: ["pill:snapshot", "pill:mute"], row2: [], menu: [] },
      { snapshot: { icon: "mdi:camera-iris" }, mute: { icon_on: "mdi:speaker-off" } },
      []
    );
    expect(out.live_pills["snapshot"]?.icon).toBe("mdi:camera-iris");
    expect(out.live_pills["mute"]?.icon_on).toBe("mdi:speaker-off");
  });
});
