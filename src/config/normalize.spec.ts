import { describe, expect, it } from "vitest";

import {
  hasLegacyKeys,
  normalizeConfig,
  normalizeMediaRoot,
  normalizeMediaRoots,
  normalizeSensorEntities,
} from "./normalize";

// Minimal valid input — sensor mode with one entity and a folder format.
const minimalSensor = {
  source_mode: "sensor",
  entities: ["sensor.foo"],
  path_datetime_format: "YYYY-MM-DD",
};

const minimalMedia = {
  source_mode: "media",
  media_sources: ["media-source://media_source/local/foo"],
  path_datetime_format: "YYYY-MM-DD",
};

describe("normalizeSensorEntities", () => {
  it("trims and dedupes (case-insensitive)", () => {
    expect(normalizeSensorEntities(["sensor.A", " sensor.a ", "sensor.B"])).toEqual([
      "sensor.A",
      "sensor.B",
    ]);
  });

  it("accepts a singular value", () => {
    expect(normalizeSensorEntities("sensor.foo")).toEqual(["sensor.foo"]);
  });

  it("uses fallbackSingle when listOrSingle is undefined/null/empty-string", () => {
    expect(normalizeSensorEntities(undefined, "sensor.fallback")).toEqual(["sensor.fallback"]);
    expect(normalizeSensorEntities(null, "sensor.fallback")).toEqual(["sensor.fallback"]);
    expect(normalizeSensorEntities("", "sensor.fallback")).toEqual(["sensor.fallback"]);
  });

  it("does NOT fall back when an empty array is passed (legacy semantics)", () => {
    expect(normalizeSensorEntities([], "sensor.fallback")).toEqual([]);
  });

  it("returns [] for nullish/empty", () => {
    expect(normalizeSensorEntities(null)).toEqual([]);
    expect(normalizeSensorEntities(undefined)).toEqual([]);
    expect(normalizeSensorEntities("")).toEqual([]);
  });
});

describe("normalizeMediaRoot — canonical prefix handling", () => {
  it("passes a fully-qualified URI through (collapsing slashes)", () => {
    expect(normalizeMediaRoot("media-source://media_source/local/foo/")).toBe(
      "media-source://media_source/local/foo"
    );
  });

  it("rewrites bare 'frigate' shortcut into media-source URI", () => {
    expect(normalizeMediaRoot("frigate/x/y")).toBe("media-source://frigate/x/y");
  });

  it("rewrites bare path into local media-source URI", () => {
    expect(normalizeMediaRoot("camera/2024")).toBe("media-source://media_source/camera/2024");
  });

  it("returns empty string for nullish input", () => {
    expect(normalizeMediaRoot(null)).toBe("");
    expect(normalizeMediaRoot("")).toBe("");
  });
});

describe("normalizeMediaRoots — array form, dedup, drop empties", () => {
  it("dedupes case-insensitively", () => {
    expect(normalizeMediaRoots(["frigate/x", "FRIGATE/x", "frigate/y"])).toEqual([
      "media-source://frigate/x",
      "media-source://frigate/y",
    ]);
  });
});

describe("hasLegacyKeys — detect raw input that needs migration", () => {
  it("detects each legacy key", () => {
    expect(hasLegacyKeys({ entity: "sensor.x" })).toBe(true);
    expect(hasLegacyKeys({ media_source: "x" })).toBe(true);
    expect(hasLegacyKeys({ media_folder_favorites: ["x"] })).toBe(true);
    expect(hasLegacyKeys({ media_folders_fav: ["x"] })).toBe(true);
    expect(hasLegacyKeys({ shell_command: "x" })).toBe(true);
    expect(hasLegacyKeys({ preview_click_to_open: true })).toBe(true);
    expect(hasLegacyKeys({ filename_datetime_format: "YYYYMMDD" })).toBe(true);
    expect(hasLegacyKeys({ folder_datetime_format: "YYYY-MM-DD" })).toBe(true);
  });

  it("returns false on canonical input", () => {
    expect(hasLegacyKeys(minimalSensor)).toBe(false);
  });

  it("returns false on non-objects", () => {
    expect(hasLegacyKeys(null)).toBe(false);
    expect(hasLegacyKeys("foo")).toBe(false);
  });
});

describe("Legacy key migration", () => {
  it("migrates `entity` → `entities`", () => {
    const { config } = normalizeConfig({
      ...minimalSensor,
      entities: undefined,
      entity: "sensor.foo",
    });
    expect(config.entities).toEqual(["sensor.foo"]);
  });

  it("when both `entity` and `entities` present, `entities` wins", () => {
    const { config } = normalizeConfig({
      source_mode: "sensor",
      path_datetime_format: "YYYY-MM-DD",
      entities: ["sensor.a"],
      entity: "sensor.b",
    });
    expect(config.entities).toEqual(["sensor.a"]);
  });

  it("migrates `media_source` (singular) → `media_sources`", () => {
    const { config } = normalizeConfig({
      source_mode: "media",
      path_datetime_format: "YYYY-MM-DD",
      media_source: "frigate/recordings",
    });
    expect(config.media_sources).toEqual(["media-source://frigate/recordings"]);
  });

  it("migrates `media_folder_favorites` → `media_sources`", () => {
    const { config } = normalizeConfig({
      source_mode: "media",
      path_datetime_format: "YYYY-MM-DD",
      media_folder_favorites: ["frigate/x"],
    });
    expect(config.media_sources).toEqual(["media-source://frigate/x"]);
  });

  it("migrates `media_folders_fav` → `media_sources`", () => {
    const { config } = normalizeConfig({
      source_mode: "media",
      path_datetime_format: "YYYY-MM-DD",
      media_folders_fav: ["frigate/x"],
    });
    expect(config.media_sources).toEqual(["media-source://frigate/x"]);
  });

  it("migrates `shell_command` → `delete_service`", () => {
    const { config } = normalizeConfig({
      ...minimalSensor,
      shell_command: "shell.delete_file",
    });
    expect(config.delete_service).toBe("shell.delete_file");
  });

  it("`delete_service` wins over `shell_command` when both present", () => {
    const { config } = normalizeConfig({
      ...minimalSensor,
      delete_service: "ds.new",
      shell_command: "ds.legacy",
    });
    expect(config.delete_service).toBe("ds.new");
  });

  it("migrates `folder_datetime_format` alone → `path_datetime_format`", () => {
    const { config } = normalizeConfig({
      source_mode: "sensor",
      entities: ["sensor.foo"],
      folder_datetime_format: "YYYY-MM-DD",
    });
    expect(config.path_datetime_format).toBe("YYYY-MM-DD");
    expect(
      (config as unknown as { folder_datetime_format?: unknown }).folder_datetime_format
    ).toBeUndefined();
  });

  it("migrates `filename_datetime_format` alone → `path_datetime_format`", () => {
    const { config } = normalizeConfig({
      source_mode: "sensor",
      entities: ["sensor.foo"],
      filename_datetime_format: "YYYYMMDD_HHmmss",
    });
    expect(config.path_datetime_format).toBe("YYYYMMDD_HHmmss");
  });

  it("migrates `folder + filename` → joined `path_datetime_format`", () => {
    const { config } = normalizeConfig({
      source_mode: "sensor",
      entities: ["sensor.foo"],
      folder_datetime_format: "YYYY-MM-DD",
      filename_datetime_format: "YYYYMMDD_HHmmss",
    });
    expect(config.path_datetime_format).toBe("YYYY-MM-DD/YYYYMMDD_HHmmss");
  });

  it("explicit `path_datetime_format` wins over legacy fields", () => {
    const { config } = normalizeConfig({
      source_mode: "sensor",
      entities: ["sensor.foo"],
      path_datetime_format: "YYYY/MM/DD/HHmmss",
      folder_datetime_format: "ignored",
      filename_datetime_format: "ignored",
    });
    expect(config.path_datetime_format).toBe("YYYY/MM/DD/HHmmss");
  });

  it("legacy datetime keys are removed from the canonical output", () => {
    const { config } = normalizeConfig({
      source_mode: "sensor",
      entities: ["sensor.foo"],
      folder_datetime_format: "YYYY-MM-DD",
      filename_datetime_format: "HHmmss",
    });
    expect(
      (config as unknown as { folder_datetime_format?: unknown }).folder_datetime_format
    ).toBeUndefined();
    expect(
      (config as unknown as { filename_datetime_format?: unknown }).filename_datetime_format
    ).toBeUndefined();
  });
});

describe("Cross-field rules", () => {
  it("source_mode auto-infers `media` when only media_sources present", () => {
    const { config } = normalizeConfig({
      path_datetime_format: "YYYY-MM-DD",
      media_sources: ["frigate/x"],
    });
    expect(config.source_mode).toBe("media");
  });

  it("source_mode auto-infers `sensor` when only entities present", () => {
    const { config } = normalizeConfig({
      path_datetime_format: "YYYY-MM-DD",
      entities: ["sensor.foo"],
    });
    expect(config.source_mode).toBe("sensor");
  });

  it("explicit source_mode is honoured", () => {
    const { config } = normalizeConfig({
      source_mode: "combined",
      entities: ["sensor.foo"],
      media_sources: ["frigate/x"],
      path_datetime_format: "YYYY-MM-DD",
    });
    expect(config.source_mode).toBe("combined");
  });

  it("sensor mode without entity throws", () => {
    expect(() =>
      normalizeConfig({ source_mode: "sensor", path_datetime_format: "YYYY-MM-DD" })
    ).toThrow(/entity.*required.*sensor/);
  });

  it("media mode without sources throws", () => {
    expect(() =>
      normalizeConfig({ source_mode: "media", path_datetime_format: "YYYY-MM-DD" })
    ).toThrow(/required.*media/);
  });

  it("combined mode without entities throws", () => {
    expect(() =>
      normalizeConfig({
        source_mode: "combined",
        media_sources: ["frigate/x"],
        path_datetime_format: "YYYY-MM-DD",
      })
    ).toThrow(/entity.*required.*combined/);
  });

  it("missing path_datetime_format AND no Frigate config throws", () => {
    expect(() => normalizeConfig({ source_mode: "sensor", entities: ["sensor.foo"] })).toThrow(
      /path_datetime_format/
    );
  });

  it("Frigate config makes datetime formats optional", () => {
    const { config } = normalizeConfig({
      source_mode: "media",
      media_sources: ["frigate/x"],
      // no formats — Frigate event-ids carry the time
    });
    expect(config.media_sources).toContain("media-source://frigate/x");
  });
});

describe("Delete gating", () => {
  it("media mode clears delete_service and forces bulk OFF", () => {
    const { config } = normalizeConfig({
      source_mode: "media",
      media_sources: ["frigate/x"],
      path_datetime_format: "YYYY-MM-DD",
      delete_service: "shell.delete_file",
    });
    expect(config.allow_bulk_delete).toBe(false);
    expect(config.delete_service).toBe("");
  });

  it("sensor mode keeps a valid delete_service intact", () => {
    const { config } = normalizeConfig({
      ...minimalSensor,
      delete_service: "shell.delete_file",
    });
    expect(config.delete_service).toBe("shell.delete_file");
  });

  it("rejects delete_service that's not in `domain.service` shape", () => {
    expect(() =>
      normalizeConfig({
        ...minimalSensor,
        delete_service: "not-a-service",
      })
    ).toThrow(/invalid config/);
  });
});

describe("object_filters loose input shape", () => {
  it("accepts plain string entries", () => {
    const { config, customIcons } = normalizeConfig({
      ...minimalSensor,
      object_filters: ["person", "car"],
    });
    expect(config.object_filters).toEqual(["person", "car"]);
    expect(customIcons).toEqual({});
  });

  it("extracts custom icons from `{name: icon}` entries", () => {
    const { config, customIcons } = normalizeConfig({
      ...minimalSensor,
      object_filters: [{ person: "mdi:walk" }, "car"],
    });
    expect(config.object_filters).toEqual(["person", "car"]);
    expect(customIcons).toEqual({ person: "mdi:walk" });
  });

  it("dedupes case-insensitively, keeps first icon", () => {
    const { config, customIcons } = normalizeConfig({
      ...minimalSensor,
      object_filters: [{ Person: "mdi:walk" }, { PERSON: "mdi:run" }, "person"],
    });
    expect(config.object_filters).toEqual(["person"]);
    expect(customIcons).toEqual({ person: "mdi:walk" });
  });

  it("silently drops unknown filter names (legacy behaviour)", () => {
    const { config } = normalizeConfig({
      ...minimalSensor,
      object_filters: ["person", "ufo", "car"],
    });
    expect(config.object_filters).toEqual(["person", "car"]);
  });
});

describe("entity_filter_map filtering", () => {
  it("drops entries with unknown filter values", () => {
    const { config } = normalizeConfig({
      ...minimalSensor,
      entity_filter_map: {
        "sensor.a": "person",
        "sensor.b": "ufo",
        "sensor.c": "car",
      },
    });
    expect(config.entity_filter_map).toEqual({
      "sensor.a": "person",
      "sensor.c": "car",
    });
  });

  it("lowercases filter values", () => {
    const { config } = normalizeConfig({
      ...minimalSensor,
      entity_filter_map: { "sensor.a": "PERSON" },
    });
    expect(config.entity_filter_map).toEqual({ "sensor.a": "person" });
  });
});

describe("Audit fix #4 — numeric clamp ranges as struct refinements", () => {
  it("rejects out-of-range thumb_size", () => {
    expect(() => normalizeConfig({ ...minimalSensor, thumb_size: 30 })).toThrow(/invalid config/);
    expect(() => normalizeConfig({ ...minimalSensor, thumb_size: 300 })).toThrow(/invalid config/);
  });

  it("error message names the range (not just 'integer')", () => {
    expect(() => normalizeConfig({ ...minimalSensor, thumb_size: 30 })).toThrow(
      /thumb_size.*between 40 and 220.*got 30/
    );
  });

  it("rejects negative bar_opacity", () => {
    expect(() => normalizeConfig({ ...minimalSensor, bar_opacity: -1 })).toThrow(/invalid config/);
  });

  it("rejects max_media outside [1, 500]", () => {
    expect(() => normalizeConfig({ ...minimalSensor, max_media: 0 })).toThrow(/invalid config/);
    expect(() => normalizeConfig({ ...minimalSensor, max_media: 1000 })).toThrow(/invalid config/);
  });
});

describe("Audit fix #5/#6 — malformed array entries become validation errors", () => {
  it("rejects live_stream_urls with missing url", () => {
    expect(() =>
      normalizeConfig({
        ...minimalSensor,
        live_stream_urls: [{ name: "foo" }],
      })
    ).toThrow(/invalid config/);
  });

  it("rejects menu_buttons with missing entity", () => {
    expect(() =>
      normalizeConfig({
        ...minimalSensor,
        menu_buttons: [{ icon: "mdi:foo" }],
      })
    ).toThrow(/invalid config/);
  });
});

describe("Audit fix #2/#3 — aspect_ratio + controls_mode strictly enumerated", () => {
  it("rejects unknown aspect_ratio", () => {
    expect(() => normalizeConfig({ ...minimalSensor, aspect_ratio: "99:99" })).toThrow(
      /invalid config/
    );
  });

  it("rejects unknown controls_mode", () => {
    expect(() => normalizeConfig({ ...minimalSensor, controls_mode: "weird" })).toThrow(
      /invalid config/
    );
  });
});

describe("Defaults are applied", () => {
  it("fills missing booleans with their DEFAULT_*", () => {
    const { config } = normalizeConfig(minimalSensor);
    expect(config.autoplay).toBe(false);
    expect(config.auto_muted).toBe(true);
    expect(config.live_auto_muted).toBe(true);
  });

  it("fills missing numeric fields with their DEFAULT_*", () => {
    const { config } = normalizeConfig(minimalSensor);
    expect(config.bar_opacity).toBe(30);
    expect(config.thumb_size).toBe(86);
    expect(config.max_media).toBe(50);
    expect(config.pill_size).toBe(14);
  });

  it("fills missing enums with their DEFAULT_*", () => {
    const { config } = normalizeConfig(minimalSensor);
    expect(config.aspect_ratio).toBe("16:9");
    expect(config.object_fit).toBe("cover");
    expect(config.controls_mode).toBe("overlay");
    expect(config.bar_position).toBe("top");
  });
});

describe("preview_close_on_tap inherits clean_mode by default", () => {
  it("defaults to true when clean_mode is true and not explicitly set", () => {
    const { config } = normalizeConfig({ ...minimalSensor, clean_mode: true });
    expect(config.preview_close_on_tap).toBe(true);
  });

  it("defaults to false when clean_mode is false", () => {
    const { config } = normalizeConfig({ ...minimalSensor });
    expect(config.preview_close_on_tap).toBe(false);
  });

  it("explicit `preview_close_on_tap: false` wins even when clean_mode is true", () => {
    const { config } = normalizeConfig({
      ...minimalSensor,
      clean_mode: true,
      preview_close_on_tap: false,
    });
    expect(config.preview_close_on_tap).toBe(false);
  });

  it("explicit `preview_close_on_tap: true` wins when clean_mode is false", () => {
    const { config } = normalizeConfig({
      ...minimalSensor,
      preview_close_on_tap: true,
    });
    expect(config.preview_close_on_tap).toBe(true);
  });
});

describe("entities accepts loose YAML scalar form", () => {
  it("normalizes a plain `entities: 'sensor.cam'` string into an array", () => {
    const { config } = normalizeConfig({
      source_mode: "sensor",
      path_datetime_format: "YYYY-MM-DD",
      entities: "sensor.cam",
    });
    expect(config.entities).toEqual(["sensor.cam"]);
  });
});

describe("clean_mode legacy alias", () => {
  it("`preview_click_to_open` aliases `clean_mode` when latter not present", () => {
    const { config } = normalizeConfig({
      ...minimalSensor,
      preview_click_to_open: true,
    });
    expect(config.clean_mode).toBe(true);
  });

  it("explicit `clean_mode` wins over alias", () => {
    const { config } = normalizeConfig({
      ...minimalSensor,
      clean_mode: false,
      preview_click_to_open: true,
    });
    expect(config.clean_mode).toBe(false);
  });
});

describe("Idempotence — running normalize on already-canonical output is a no-op", () => {
  it("normalizeConfig(normalizeConfig(x).config) === normalizeConfig(x).config", () => {
    const first = normalizeConfig({
      ...minimalMedia,
      object_filters: [{ person: "mdi:walk" }, "car"],
    });
    const second = normalizeConfig(first.config);
    expect(second.config).toEqual(first.config);
  });
});
