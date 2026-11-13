import { describe, expect, it } from "vitest";
import { defaultEntityIcon, GENERIC_ENTITY_ICON } from "./entity-icon";

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
