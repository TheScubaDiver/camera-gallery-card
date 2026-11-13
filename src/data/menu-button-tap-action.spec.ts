// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { normalizeConfig } from "../config/normalize";
import { menuButtonLabel, menuButtonTap } from "./menu-buttons";

// Shortcut menu buttons (#302): a `tap_action` instead of, or on top of,
// the entity's own toggle/service.
const base = {
  source_mode: "sensor",
  entities: ["sensor.foo"],
  path_datetime_format: "YYYY-MM-DD",
};
const navigate = { action: "navigate", navigation_path: "/security/driveway" };

describe("menuButtonTap with a tap_action", () => {
  it("runs the tap action for a button without an entity", () => {
    expect(menuButtonTap({ tap_action: navigate }, null)).toEqual({
      kind: "action",
      action: navigate,
    });
  });

  it("prefers the tap action over the entity's toggle", () => {
    const tap = menuButtonTap({ entity: "light.porch", tap_action: navigate }, null);
    expect(tap.kind).toBe("action");
  });

  it("keeps toggling an entity button without a tap action", () => {
    const tap = menuButtonTap({ entity: "light.porch" }, null);
    expect(tap).toEqual({
      kind: "call",
      call: { domain: "homeassistant", service: "toggle", data: { entity_id: "light.porch" } },
    });
  });

  it("does nothing for a button with neither", () => {
    expect(menuButtonTap({}, null)).toEqual({ kind: "none" });
  });

  it("labels a shortcut button by its title, or empty without one", () => {
    expect(menuButtonLabel({ title: "Driveway" }, null)).toBe("Driveway");
    expect(menuButtonLabel({}, null)).toBe("");
  });
});

describe("menu_buttons config", () => {
  it("accepts a button with a tap_action and no entity", () => {
    const { config } = normalizeConfig({
      ...base,
      menu_buttons: [{ icon: "mdi:cctv", title: "Driveway", tap_action: navigate }],
    });
    expect(config.menu_buttons[0]?.tap_action).toEqual(navigate);
    expect(config.menu_buttons[0]?.entity).toBeUndefined();
  });

  it("rejects a button with neither an entity nor a tap_action", () => {
    expect(() =>
      normalizeConfig({ ...base, menu_buttons: [{ icon: "mdi:cctv", title: "Nothing" }] })
    ).toThrow(/invalid config/);
  });

  it("still accepts a plain entity button", () => {
    const { config } = normalizeConfig({
      ...base,
      menu_buttons: [{ entity: "light.porch", icon: "mdi:lightbulb" }],
    });
    expect(config.menu_buttons[0]?.entity).toBe("light.porch");
  });
});

describe("card: tapping a shortcut button", () => {
  let card: any;

  beforeAll(async () => {
    vi.stubGlobal("__VERSION__", "test-local");
    await import("../index.js");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    card?.remove();
  });

  function makeCard() {
    card = document.createElement("camera-gallery-card");
    card.requestUpdate = vi.fn();
    card.config = { live_enabled: true, live_cameras: [{ entity: "camera.door" }] };
    card._hass = { states: {}, callService: vi.fn() };
    document.body.appendChild(card);
    return card;
  }

  it("navigates without touching an entity", () => {
    makeCard();
    vi.spyOn(history, "pushState").mockImplementation(() => {});
    card._onMenuButtonTap({ icon: "mdi:cctv", tap_action: navigate });
    expect(history.pushState).toHaveBeenCalledWith(null, "", "/security/driveway");
    expect(card._hass.callService).not.toHaveBeenCalled();
  });

  it("hands assist to Home Assistant as a hass-action event", () => {
    makeCard();
    const seen = vi.fn();
    card.addEventListener("hass-action", (e: CustomEvent) => seen(e.detail));
    card._onMenuButtonTap({ icon: "mdi:microphone", tap_action: { action: "assist" } });
    expect(seen).toHaveBeenCalledWith({
      config: { tap_action: { action: "assist" } },
      action: "tap",
    });
  });

  it("still toggles a plain entity button", () => {
    makeCard();
    card._onMenuButtonTap({ entity: "light.porch", icon: "mdi:lightbulb" });
    expect(card._hass.callService).toHaveBeenCalledWith("homeassistant", "toggle", {
      entity_id: "light.porch",
    });
  });
});
