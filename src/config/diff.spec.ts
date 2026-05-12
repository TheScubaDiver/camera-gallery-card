import { describe, expect, it } from "vitest";

import { configDiff } from "./diff";
import type { CameraGalleryCardConfig } from "./normalize";

const baseConfig = (overrides: Partial<CameraGalleryCardConfig> = {}): CameraGalleryCardConfig =>
  ({
    type: "custom:camera-gallery-card",
    source_mode: "sensor",
    entities: ["sensor.foo"],
    media_sources: [],
    autoplay: false,
    auto_muted: true,
    live_enabled: false,
    live_auto_muted: true,
    live_camera_entity: "",
    live_camera_entities: [],
    start_mode: "gallery",
    allow_bulk_delete: true,
    delete_confirm: true,
    delete_service: "",
    object_filters: [],
    object_colors: {},
    entity_filter_map: {},
    bar_opacity: 30,
    bar_position: "top",
    thumb_size: 86,
    thumb_bar_position: "bottom",
    thumb_layout: "horizontal",
    thumb_sort_order: "newest",
    thumbnail_frame_pct: 0,
    pill_size: 14,
    aspect_ratio: "16:9",
    object_fit: "cover",
    controls_mode: "overlay",
    style_variables: "",
    show_camera_title: true,
    persistent_controls: false,
    preview_position: "top",
    clean_mode: false,
    preview_close_on_tap: false,
    max_media: 50,
    menu_buttons: [],
    path_datetime_format: "",
    ...overrides,
  }) as CameraGalleryCardConfig;

describe("configDiff — first call (prev null)", () => {
  it("treats first setConfig as a source change", () => {
    const result = configDiff(null, baseConfig());
    expect(result.isSourceChange).toBe(true);
    expect(result.isUiOnly).toBe(false);
    expect(result.changedKeys).toEqual([]);
  });
});

describe("configDiff — source-affecting changes invalidate caches", () => {
  it("source_mode change is a source change", () => {
    const prev = baseConfig({ source_mode: "sensor" });
    const next = baseConfig({ source_mode: "media", media_sources: ["x"] });
    const result = configDiff(prev, next);
    expect(result.isSourceChange).toBe(true);
    expect(result.isUiOnly).toBe(false);
  });

  it("entities change is a source change", () => {
    const prev = baseConfig({ entities: ["sensor.a"] });
    const next = baseConfig({ entities: ["sensor.a", "sensor.b"] });
    const result = configDiff(prev, next);
    expect(result.isSourceChange).toBe(true);
  });

  it("media_sources change is a source change", () => {
    const prev = baseConfig({ media_sources: ["a"] });
    const next = baseConfig({ media_sources: ["b"] });
    expect(configDiff(prev, next).isSourceChange).toBe(true);
  });

  it("max_media change is a source change", () => {
    const prev = baseConfig({ max_media: 50 });
    const next = baseConfig({ max_media: 100 });
    expect(configDiff(prev, next).isSourceChange).toBe(true);
  });

  it("delete_service change is a source change", () => {
    const prev = baseConfig({ delete_service: "" });
    const next = baseConfig({ delete_service: "shell.delete_file" });
    expect(configDiff(prev, next).isSourceChange).toBe(true);
  });
});

describe("configDiff — UI-only changes skip cache invalidation", () => {
  it("only thumb_size changed → ui-only", () => {
    const prev = baseConfig({ thumb_size: 86 });
    const next = baseConfig({ thumb_size: 100 });
    const result = configDiff(prev, next);
    expect(result.isSourceChange).toBe(false);
    expect(result.isUiOnly).toBe(true);
  });

  it("multiple ui-only keys all changed → still ui-only", () => {
    const prev = baseConfig({ thumb_size: 86, bar_opacity: 30 });
    const next = baseConfig({ thumb_size: 100, bar_opacity: 50 });
    expect(configDiff(prev, next).isUiOnly).toBe(true);
  });

  it("ui-only + source key changed → not ui-only, is source change", () => {
    const prev = baseConfig({ thumb_size: 86, max_media: 50 });
    const next = baseConfig({ thumb_size: 100, max_media: 100 });
    const result = configDiff(prev, next);
    expect(result.isUiOnly).toBe(false);
    expect(result.isSourceChange).toBe(true);
  });

  it("unknown key changed → neither ui-only nor source", () => {
    const prev = baseConfig();
    const next = baseConfig({ style_variables: "x" });
    const result = configDiff(prev, next);
    expect(result.isSourceChange).toBe(false);
    expect(result.isUiOnly).toBe(false);
    expect(result.changedKeys).toContain("style_variables");
  });
});

describe("configDiff — no changes", () => {
  it("identical configs report no changes and not ui-only", () => {
    const prev = baseConfig();
    const next = baseConfig();
    const result = configDiff(prev, next);
    expect(result.changedKeys).toEqual([]);
    expect(result.isUiOnly).toBe(false);
    expect(result.isSourceChange).toBe(false);
  });
});
