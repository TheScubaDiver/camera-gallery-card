import { describe, expect, it } from "vitest";
import { defaultEntityIcon, GENERIC_ENTITY_ICON, iconAfterEntityChange } from "./entity-icon";

describe("defaultEntityIcon", () => {
  it("prefers the entity's own icon", () => {
    expect(defaultEntityIcon("light.porch", { attributes: { icon: "mdi:outdoor-lamp" } })).toBe(
      "mdi:outdoor-lamp"
    );
  });

  it("uses the device class default", () => {
    expect(defaultEntityIcon("cover.garage", { attributes: { device_class: "garage" } })).toBe(
      "mdi:garage"
    );
    expect(defaultEntityIcon("switch.plug", { attributes: { device_class: "outlet" } })).toBe(
      "mdi:power-socket-eu"
    );
  });

  it("falls back to the domain default", () => {
    expect(defaultEntityIcon("light.porch", { attributes: {} })).toBe("mdi:lightbulb");
    expect(defaultEntityIcon("siren.hall")).toBe("mdi:alarm-light");
    expect(defaultEntityIcon("cover.x", { attributes: { device_class: "unknown_class" } })).toBe(
      "mdi:window-shutter"
    );
  });

  it("has a generic fallback", () => {
    expect(defaultEntityIcon("weird.thing", null)).toBe(GENERIC_ENTITY_ICON);
    expect(defaultEntityIcon("", undefined)).toBe(GENERIC_ENTITY_ICON);
  });

  it("ignores an empty icon attribute", () => {
    expect(defaultEntityIcon("lock.front", { attributes: { icon: "  " } })).toBe("mdi:lock");
  });
});

describe("defaultEntityIcon with the entity registry", () => {
  it("prefers the icon set in the entity settings", () => {
    expect(
      defaultEntityIcon("light.porch", { attributes: { icon: "mdi:a" } }, { icon: "mdi:b" })
    ).toBe("mdi:b");
  });

  it("ignores an empty registry icon", () => {
    expect(defaultEntityIcon("light.porch", { attributes: {} }, { icon: null })).toBe(
      "mdi:lightbulb"
    );
  });
});

describe("iconAfterEntityChange", () => {
  it("fills an empty icon", () => {
    expect(
      iconAfterEntityChange({
        currentIcon: "",
        previousDefault: null,
        nextDefault: "mdi:thermostat",
      })
    ).toBe("mdi:thermostat");
  });

  it("replaces the previous entity's automatic icon", () => {
    expect(
      iconAfterEntityChange({
        currentIcon: "mdi:lightbulb",
        previousDefault: "mdi:lightbulb",
        nextDefault: "mdi:thermostat",
      })
    ).toBe("mdi:thermostat");
  });

  it("keeps an icon the user chose", () => {
    expect(
      iconAfterEntityChange({
        currentIcon: "mdi:star",
        previousDefault: "mdi:lightbulb",
        nextDefault: "mdi:thermostat",
      })
    ).toBeNull();
  });
});
