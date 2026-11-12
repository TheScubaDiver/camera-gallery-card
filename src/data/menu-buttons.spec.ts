import { describe, expect, it } from "vitest";

import type { HassEntity } from "../types/hass";
import {
  isMenuButtonOn,
  menuButtonLabel,
  menuButtonTap,
  selectOptionCall,
  splitMenuButtons,
} from "./menu-buttons";

function st(
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {}
): HassEntity {
  return {
    entity_id,
    state,
    attributes,
    last_changed: "",
    last_updated: "",
    context: { id: "", parent_id: null, user_id: null },
  } as HassEntity;
}

describe("splitMenuButtons", () => {
  it("puts placement: controls on the controls row and keeps the rest in the menu, in order", () => {
    const a = { entity: "light.a", icon: "mdi:a" };
    const b = { entity: "light.b", icon: "mdi:b", placement: "controls" as const };
    const c = { entity: "light.c", icon: "mdi:c", placement: "menu" as const };
    const d = { entity: "light.d", icon: "mdi:d", placement: "controls" as const };
    expect(splitMenuButtons([a, b, c, d])).toEqual({ controls: [b, d], menu: [a, c] });
  });

  it("handles a missing list", () => {
    expect(splitMenuButtons(undefined)).toEqual({ controls: [], menu: [] });
  });
});

describe("isMenuButtonOn", () => {
  it("uses the built-in on-states without state_on", () => {
    expect(isMenuButtonOn({}, st("light.a", "on"))).toBe(true);
    expect(isMenuButtonOn({}, st("lock.a", "unlocked"))).toBe(true);
    expect(isMenuButtonOn({}, st("light.a", "off"))).toBe(false);
    expect(isMenuButtonOn({}, undefined)).toBe(false);
  });

  it("matches state_on exactly when set", () => {
    expect(isMenuButtonOn({ state_on: "Away" }, st("input_select.m", "Away"))).toBe(true);
    expect(isMenuButtonOn({ state_on: "Away" }, st("input_select.m", "on"))).toBe(false);
  });
});

describe("menuButtonTap", () => {
  const options = ["Leave at door", "Be right there", "No thanks"];

  // #215: a doorbell "auto-reply" input_select should offer its options.
  it("opens an option list for input_select and select entities", () => {
    expect(
      menuButtonTap(
        { entity: "input_select.doorbell_reply" },
        st("input_select.doorbell_reply", "Be right there", { options })
      )
    ).toEqual({ kind: "select", options, current: "Be right there" });
    expect(
      menuButtonTap(
        { entity: "select.chime" },
        st("select.chime", "ding", { options: ["ding", "dong"] })
      )
    ).toEqual({ kind: "select", options: ["ding", "dong"], current: "ding" });
  });

  it("falls back to toggle for a select entity without options", () => {
    expect(menuButtonTap({ entity: "input_select.x" }, st("input_select.x", "a"))).toEqual({
      kind: "call",
      call: { domain: "homeassistant", service: "toggle", data: { entity_id: "input_select.x" } },
    });
  });

  it("lets an explicit service win, even on a select entity", () => {
    expect(
      menuButtonTap(
        { entity: "input_select.doorbell_reply", service: "input_select.select_next" },
        st("input_select.doorbell_reply", "a", { options })
      )
    ).toEqual({
      kind: "call",
      call: {
        domain: "input_select",
        service: "select_next",
        data: { entity_id: "input_select.doorbell_reply" },
      },
    });
  });

  it("keeps the existing defaults for automations, scripts and other entities", () => {
    expect(menuButtonTap({ entity: "automation.x" }, undefined)).toMatchObject({
      call: { domain: "automation", service: "trigger" },
    });
    expect(menuButtonTap({ entity: "script.x" }, undefined)).toMatchObject({
      call: { domain: "script", service: "turn_on" },
    });
    expect(menuButtonTap({ entity: "light.x" }, undefined)).toMatchObject({
      call: { domain: "homeassistant", service: "toggle" },
    });
  });
});

describe("selectOptionCall", () => {
  it("uses the entity's own domain", () => {
    expect(selectOptionCall("input_select.r", "No thanks")).toEqual({
      domain: "input_select",
      service: "select_option",
      data: { entity_id: "input_select.r", option: "No thanks" },
    });
    expect(selectOptionCall("select.chime", "dong")).toMatchObject({ domain: "select" });
  });
});

describe("menuButtonLabel", () => {
  it("prefers title, then friendly name, then entity id", () => {
    const state = st("light.a", "on", { friendly_name: "Porch" });
    expect(menuButtonLabel({ entity: "light.a", title: "Lamp" }, state)).toBe("Lamp");
    expect(menuButtonLabel({ entity: "light.a" }, state)).toBe("Porch");
    expect(menuButtonLabel({ entity: "light.a" }, undefined)).toBe("light.a");
  });

  it("uses Home Assistant's display name when hass.formatEntityName exists", () => {
    const state = st("light.a", "on", { friendly_name: "Porch" });
    const hass = { formatEntityName: () => "Veranda · Lamp" };
    expect(menuButtonLabel({ entity: "light.a" }, state, hass)).toBe("Veranda · Lamp");
    expect(menuButtonLabel({ entity: "light.a", title: "Lamp" }, state, hass)).toBe("Lamp");
  });
});
