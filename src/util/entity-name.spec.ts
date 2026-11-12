import { describe, expect, it, vi } from "vitest";

import type { HassEntity } from "../types/hass";
import { entityDisplayName, entitySearchText } from "./entity-name";

function st(entity_id: string, friendly_name?: string): HassEntity {
  return {
    entity_id,
    state: "idle",
    attributes: friendly_name ? { friendly_name } : {},
    last_changed: "",
    last_updated: "",
    context: { id: "", parent_id: null, user_id: null },
  } as HassEntity;
}

const states = {
  "camera.front_door": st("camera.front_door", "Front Door Camera"),
  "camera.bare": st("camera.bare"),
};

describe("entityDisplayName", () => {
  it("uses hass.formatEntityName when available (HA 2026.4+)", () => {
    const formatEntityName = vi.fn(() => "Front Door · Camera");
    expect(entityDisplayName({ states, formatEntityName }, "camera.front_door")).toBe(
      "Front Door · Camera"
    );
    expect(formatEntityName).toHaveBeenCalledWith(states["camera.front_door"]);
  });

  it("falls back to friendly_name on older Home Assistant", () => {
    expect(entityDisplayName({ states }, "camera.front_door")).toBe("Front Door Camera");
  });

  it("falls back to friendly_name when formatEntityName throws or returns nothing", () => {
    expect(
      entityDisplayName(
        {
          states,
          formatEntityName: () => {
            throw new Error("x");
          },
        },
        "camera.front_door"
      )
    ).toBe("Front Door Camera");
    expect(entityDisplayName({ states, formatEntityName: () => "" }, "camera.front_door")).toBe(
      "Front Door Camera"
    );
  });

  it("returns empty for unknown entities or entities without a name", () => {
    expect(entityDisplayName({ states }, "camera.missing")).toBe("");
    expect(entityDisplayName({ states }, "camera.bare")).toBe("");
    expect(entityDisplayName(null, "camera.front_door")).toBe("");
  });
});

describe("entitySearchText", () => {
  it("contains the display name, the legacy friendly_name and the id", () => {
    const text = entitySearchText(
      { states, formatEntityName: () => "Voordeur · Camera" },
      "camera.front_door"
    );
    expect(text).toContain("voordeur · camera");
    expect(text).toContain("front door camera");
    expect(text).toContain("camera.front_door");
  });
});
