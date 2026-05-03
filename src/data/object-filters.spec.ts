import { describe, expect, it } from "vitest";

import { AVAILABLE_OBJECT_FILTERS } from "../const";
import {
  DEFAULT_OBJECT_ICON,
  FILTER_ALIASES,
  OBJECT_FILTER_ICONS,
  filterLabel,
  filterLabelList,
  getFilterAliases,
  itemFilenameForFilter,
  matchesObjectFilterForFileSensor,
  objectColor,
  objectIcon,
  sensorTextForFilter,
} from "./object-filters";

describe("filterLabel", () => {
  it("returns the canonical filter name when known (case-insensitive)", () => {
    expect(filterLabel("person")).toBe("person");
    expect(filterLabel("PERSON")).toBe("person");
    expect(filterLabel(" car ")).toBe("car");
  });

  it("returns 'selected' for unknown values", () => {
    expect(filterLabel("ufo")).toBe("selected");
    expect(filterLabel("")).toBe("selected");
  });
});

describe("filterLabelList", () => {
  it("joins known filters with comma + space", () => {
    expect(filterLabelList(["person", "car"])).toBe("person, car");
  });

  it("returns 'selected' for empty input", () => {
    expect(filterLabelList([])).toBe("selected");
  });

  it("drops unknowns and returns 'selected' if everything is unknown", () => {
    expect(filterLabelList(["ufo", "yeti"])).toBe("selected");
  });
});

describe("getFilterAliases", () => {
  it("returns the alias list for a known filter", () => {
    expect(getFilterAliases("person")).toContain("persoon");
    expect(getFilterAliases("dog")).toContain("hond");
    expect(getFilterAliases("car")).toContain("voertuig");
  });

  it("returns a single-element list for unknown filters", () => {
    expect(getFilterAliases("ufo")).toEqual(["ufo"]);
  });

  it("returns empty list for empty input", () => {
    expect(getFilterAliases("")).toEqual([]);
    expect(getFilterAliases("  ")).toEqual([]);
  });

  it("each known filter has at least one alias", () => {
    for (const f of AVAILABLE_OBJECT_FILTERS) {
      expect(FILTER_ALIASES[f].length).toBeGreaterThan(0);
    }
  });

  it("every alias is already lowercase and trimmed (matcher relies on this)", () => {
    for (const f of AVAILABLE_OBJECT_FILTERS) {
      for (const alias of FILTER_ALIASES[f]) {
        expect(alias).toBe(alias.toLowerCase().trim());
      }
    }
  });
});

describe("objectIcon", () => {
  it("uses the canonical icon when known", () => {
    expect(objectIcon("person")).toBe(OBJECT_FILTER_ICONS.person);
    expect(objectIcon("car")).toBe(OBJECT_FILTER_ICONS.car);
  });

  it("returns DEFAULT_OBJECT_ICON for unknown", () => {
    expect(objectIcon("ufo")).toBe(DEFAULT_OBJECT_ICON);
  });

  it("custom icon overrides the canonical map", () => {
    expect(objectIcon("person", { person: "mdi:walk" })).toBe("mdi:walk");
  });

  it("custom override wins even for unknown filter names (user-defined)", () => {
    expect(objectIcon("ufo", { ufo: "mdi:rocket" })).toBe("mdi:rocket");
  });

  it("custom fallback is used when neither override nor canonical map matches", () => {
    expect(objectIcon("ufo", {}, "mdi:magnify")).toBe("mdi:magnify");
  });

  it("returns empty string for null/empty input", () => {
    expect(objectIcon(null)).toBe("");
    expect(objectIcon("")).toBe("");
  });

  it("each known filter has an icon entry", () => {
    for (const f of AVAILABLE_OBJECT_FILTERS) {
      expect(OBJECT_FILTER_ICONS[f]).toMatch(/^mdi:/);
    }
  });
});

describe("objectColor", () => {
  it("returns the configured color for a filter", () => {
    expect(objectColor("person", { person: "#ff0000" })).toBe("#ff0000");
  });

  it("returns currentColor when no color is configured", () => {
    expect(objectColor("person", {})).toBe("currentColor");
  });

  it("returns currentColor for null filter", () => {
    expect(objectColor(null, { person: "#ff0000" })).toBe("currentColor");
  });
});

describe("itemFilenameForFilter", () => {
  it("lower-cases a string input", () => {
    expect(itemFilenameForFilter("CAMERA_2024.JPG")).toBe("camera_2024.jpg");
  });

  it("prefers `filename` field on items", () => {
    expect(itemFilenameForFilter({ filename: "Front.MP4", path: "ignored" })).toBe("front.mp4");
  });

  it("falls through to `name`, then `basename`, …", () => {
    expect(itemFilenameForFilter({ name: "Top.jpg" })).toBe("top.jpg");
    expect(itemFilenameForFilter({ basename: "X" })).toBe("x");
  });

  it("returns empty string for nullish input", () => {
    expect(itemFilenameForFilter(null)).toBe("");
    expect(itemFilenameForFilter(undefined)).toBe("");
  });

  it("returns empty string when no field is set", () => {
    expect(itemFilenameForFilter({})).toBe("");
  });
});

describe("sensorTextForFilter", () => {
  it("combines entity_id and friendly_name (lower-cased)", () => {
    const state = {
      entity_id: "sensor.kitchen",
      state: "on",
      attributes: { friendly_name: "Kitchen Camera" },
      last_changed: "",
      last_updated: "",
      context: { id: "", parent_id: null, user_id: null },
    };
    expect(sensorTextForFilter("sensor.kitchen", state)).toBe("sensor.kitchen kitchen camera");
  });

  it("falls back to `name` when no friendly_name", () => {
    const state = {
      entity_id: "sensor.x",
      state: "on",
      attributes: { name: "Garage" },
      last_changed: "",
      last_updated: "",
      context: { id: "", parent_id: null, user_id: null },
    };
    expect(sensorTextForFilter("sensor.x", state)).toBe("sensor.x garage");
  });

  it("returns just the entity_id when no state", () => {
    expect(sensorTextForFilter("sensor.x", null)).toBe("sensor.x");
  });
});

describe("matchesObjectFilterForFileSensor", () => {
  const state = {
    entity_id: "sensor.front_door",
    state: "on",
    attributes: { friendly_name: "Front Doorbell" },
    last_changed: "",
    last_updated: "",
    context: { id: "", parent_id: null, user_id: null },
  };

  it("matches an alias in the filename", () => {
    expect(
      matchesObjectFilterForFileSensor(
        "snapshots/2024/persoon-event.jpg",
        "person",
        "sensor.front_door",
        state
      )
    ).toBe(true);
  });

  it("matches an alias in the sensor friendly name", () => {
    const fileSrc = "events/snapshot.jpg";
    expect(
      matchesObjectFilterForFileSensor(fileSrc, "visitor", "sensor.bell", {
        ...state,
        attributes: { friendly_name: "Bezoeker camera" },
      })
    ).toBe(true);
  });

  it("returns false when no alias matches", () => {
    expect(matchesObjectFilterForFileSensor("snapshots/cat.jpg", "person", "sensor.x", state)).toBe(
      false
    );
  });

  it("unknown filter falls through as 'no match'", () => {
    // Single-element alias list with the unknown filter name; very unlikely
    // to appear in either filename or sensor text.
    expect(matchesObjectFilterForFileSensor("snapshots/cat.jpg", "ufo", "sensor.x", state)).toBe(
      false
    );
  });

  it("empty filter passes through as `true`", () => {
    expect(matchesObjectFilterForFileSensor("snapshots/cat.jpg", "", "sensor.x", state)).toBe(true);
  });
});
