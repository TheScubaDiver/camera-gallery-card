import { describe, expect, it } from "vitest";

import type { CameraGalleryCardConfig } from "../config/normalize";
import type { HassEntity } from "../types/hass";
import {
  friendlyCameraName,
  getAllLiveCameraEntities,
  getGridCameraEntities,
  getLiveCameraOptions,
  getStreamEntries,
  getStreamEntryById,
  gridDims,
  hasAnyMicStream,
  hasLiveConfig,
  isGridLayout,
  micStreamForCamera,
  STREAM_ID_PREFIX,
} from "./live-config";

function cfg(over: Partial<CameraGalleryCardConfig> = {}): CameraGalleryCardConfig {
  return {
    type: "custom:camera-gallery-card",
    ...over,
  } as CameraGalleryCardConfig;
}

function state(over: Partial<HassEntity> = {}): HassEntity {
  return {
    entity_id: over.entity_id ?? "camera.x",
    state: "idle",
    attributes: over.attributes ?? {},
    last_changed: "",
    last_updated: "",
    context: { id: "", parent_id: null, user_id: null },
  } as HassEntity;
}

describe("getStreamEntries", () => {
  it("returns [] for null/empty config", () => {
    expect(getStreamEntries(null)).toEqual([]);
    expect(getStreamEntries(cfg())).toEqual([]);
  });

  it("normalizes live_stream_urls array, falls back to Stream N for missing names", () => {
    const result = getStreamEntries(
      cfg({
        live_stream_urls: [
          { url: "http://a", name: "Door" },
          { url: " http://b ", name: "" },
          { url: "  ", name: "skipped" },
        ],
      })
    );
    expect(result).toEqual([
      { id: `${STREAM_ID_PREFIX}_0__`, url: "http://a", name: "Door" },
      { id: `${STREAM_ID_PREFIX}_1__`, url: "http://b", name: "Stream 2" },
    ]);
  });

  it("falls back to live_stream_url singular when plural is empty/missing", () => {
    const result = getStreamEntries(
      cfg({
        live_stream_url: "http://single",
        live_stream_name: "Driveway",
      })
    );
    expect(result).toEqual([
      { id: `${STREAM_ID_PREFIX}_0__`, url: "http://single", name: "Driveway" },
    ]);
  });

  it("singular fallback uses default name when none configured", () => {
    expect(getStreamEntries(cfg({ live_stream_url: "http://x" }))).toEqual([
      { id: `${STREAM_ID_PREFIX}_0__`, url: "http://x", name: "Stream" },
    ]);
  });

  it("prefers plural over singular when both present", () => {
    const result = getStreamEntries(
      cfg({
        live_stream_urls: [{ url: "http://a", name: "A" }],
        live_stream_url: "http://b",
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe("http://a");
  });
});

describe("getStreamEntryById", () => {
  const c = cfg({
    live_stream_urls: [
      { url: "http://a", name: "A" },
      { url: "http://b", name: "B" },
    ],
  });

  it("returns null for non-stream ids", () => {
    expect(getStreamEntryById(c, "camera.front")).toBeNull();
    expect(getStreamEntryById(c, "")).toBeNull();
    expect(getStreamEntryById(c, null)).toBeNull();
  });

  it("exact-matches by synthetic id", () => {
    expect(getStreamEntryById(c, `${STREAM_ID_PREFIX}_1__`)?.url).toBe("http://b");
  });

  it("legacy `__cgc_stream__` alias falls back to first entry", () => {
    expect(getStreamEntryById(c, "__cgc_stream__")?.url).toBe("http://a");
  });

  it("returns null when index id is out of range", () => {
    expect(getStreamEntryById(c, `${STREAM_ID_PREFIX}_99__`)).toBeNull();
  });
});

describe("getAllLiveCameraEntities", () => {
  const friendlyName = (id: string): string => id;

  it("returns [] when live_camera_entities is empty", () => {
    expect(
      getAllLiveCameraEntities({
        config: cfg(),
        hassStates: { "camera.x": state() },
        localeTag: undefined,
        friendlyName,
      })
    ).toEqual([]);
  });

  it("filters to camera.* allowed in config that hass has state for", () => {
    const result = getAllLiveCameraEntities({
      config: cfg({ live_camera_entities: ["camera.a", "camera.b", "camera.missing"] }),
      hassStates: {
        "camera.a": state({ entity_id: "camera.a" }),
        "camera.b": state({ entity_id: "camera.b" }),
        "sensor.x": state({ entity_id: "sensor.x" }),
      },
      localeTag: undefined,
      friendlyName,
    });
    expect(new Set(result)).toEqual(new Set(["camera.a", "camera.b"]));
  });

  it("sorts by friendly name", () => {
    const result = getAllLiveCameraEntities({
      config: cfg({ live_camera_entities: ["camera.x", "camera.y"] }),
      hassStates: {
        "camera.x": state({ entity_id: "camera.x" }),
        "camera.y": state({ entity_id: "camera.y" }),
      },
      localeTag: "en",
      friendlyName: (id) => (id === "camera.x" ? "Zebra" : "Aardvark"),
    });
    expect(result).toEqual(["camera.y", "camera.x"]);
  });
});

describe("getLiveCameraOptions", () => {
  it("orders streams before entities", () => {
    const result = getLiveCameraOptions({
      config: cfg({
        live_camera_entities: ["camera.a"],
        live_stream_urls: [{ url: "http://x", name: "S" }],
      }),
      hassStates: { "camera.a": state({ entity_id: "camera.a" }) },
      localeTag: undefined,
      friendlyName: (id) => id,
    });
    expect(result).toEqual([`${STREAM_ID_PREFIX}_0__`, "camera.a"]);
  });
});

describe("hasLiveConfig", () => {
  it("requires live_enabled", () => {
    expect(hasLiveConfig({ config: cfg(), streamCount: 5, cameraCount: 5 })).toBe(false);
  });

  it("true when at least one stream", () => {
    expect(
      hasLiveConfig({ config: cfg({ live_enabled: true }), streamCount: 1, cameraCount: 0 })
    ).toBe(true);
  });

  it("true when at least one camera", () => {
    expect(
      hasLiveConfig({ config: cfg({ live_enabled: true }), streamCount: 0, cameraCount: 1 })
    ).toBe(true);
  });

  it("false when enabled but no streams/cameras", () => {
    expect(
      hasLiveConfig({ config: cfg({ live_enabled: true }), streamCount: 0, cameraCount: 0 })
    ).toBe(false);
  });
});

describe("friendlyCameraName", () => {
  it("returns the stream entry name for a stream id", () => {
    const c = cfg({ live_stream_urls: [{ url: "http://a", name: "Door Camera" }] });
    expect(
      friendlyCameraName({ entityId: `${STREAM_ID_PREFIX}_0__`, config: c, hassStates: {} })
    ).toBe("Door Camera");
  });

  it("defaults to 'Stream' for unknown stream ids", () => {
    expect(
      friendlyCameraName({ entityId: `${STREAM_ID_PREFIX}_9__`, config: cfg(), hassStates: {} })
    ).toBe("Stream");
  });

  it("uses friendly_name attribute when present", () => {
    expect(
      friendlyCameraName({
        entityId: "camera.front",
        config: cfg(),
        hassStates: {
          "camera.front": state({
            entity_id: "camera.front",
            attributes: { friendly_name: "Front Yard" },
          }),
        },
      })
    ).toBe("Front Yard");
  });

  it("falls back to title-cased local part", () => {
    expect(
      friendlyCameraName({ entityId: "camera.back_yard", config: cfg(), hassStates: {} })
    ).toBe("Back yard");
  });

  it("returns empty string on empty input", () => {
    expect(friendlyCameraName({ entityId: "", config: cfg(), hassStates: {} })).toBe("");
  });
});

describe("getGridCameraEntities", () => {
  it("returns [] for null/empty config", () => {
    expect(getGridCameraEntities(null)).toEqual([]);
    expect(getGridCameraEntities(cfg())).toEqual([]);
  });

  it("filters non-camera.* entries", () => {
    expect(
      getGridCameraEntities(
        cfg({
          live_camera_entities: ["camera.front", "sensor.x", "binary_sensor.y", "camera.back"],
        })
      )
    ).toEqual(["camera.front", "camera.back"]);
  });

  it("preserves the order from config", () => {
    expect(
      getGridCameraEntities(
        cfg({ live_camera_entities: ["camera.back", "camera.front", "camera.side"] })
      )
    ).toEqual(["camera.back", "camera.front", "camera.side"]);
  });

  it("ignores non-string entries", () => {
    expect(
      getGridCameraEntities(
        cfg({
          live_camera_entities: ["camera.front", null as unknown as string, "camera.back"],
        })
      )
    ).toEqual(["camera.front", "camera.back"]);
  });
});

describe("gridDims", () => {
  it("returns 2x2 for counts 0..4", () => {
    for (const n of [0, 1, 2, 3, 4]) {
      expect(gridDims(n)).toEqual({ cols: 2, rows: 2 });
    }
  });

  it("returns 3x3 for counts 5..9", () => {
    for (const n of [5, 6, 7, 8, 9]) {
      expect(gridDims(n)).toEqual({ cols: 3, rows: 3 });
    }
  });

  it("returns 4x4 for counts 10..16", () => {
    for (const n of [10, 12, 16]) {
      expect(gridDims(n)).toEqual({ cols: 4, rows: 4 });
    }
  });

  it("returns 4x4 for counts > 16 (cap, no 5x5 fallback)", () => {
    expect(gridDims(17)).toEqual({ cols: 4, rows: 4 });
    expect(gridDims(100)).toEqual({ cols: 4, rows: 4 });
  });
});

describe("isGridLayout", () => {
  it("returns false for null config", () => {
    expect(isGridLayout(null, null)).toBe(false);
  });

  it("returns false when override is single, even with grid + 2+ cameras", () => {
    expect(
      isGridLayout(
        cfg({
          live_layout: "grid",
          live_camera_entities: ["camera.a", "camera.b"],
        }),
        "single"
      )
    ).toBe(false);
  });

  it("returns false when live_layout is not 'grid'", () => {
    expect(
      isGridLayout(
        cfg({
          live_layout: "single",
          live_camera_entities: ["camera.a", "camera.b"],
        }),
        null
      )
    ).toBe(false);
  });

  it("returns false when grid is requested but fewer than 2 cameras are eligible", () => {
    expect(isGridLayout(cfg({ live_layout: "grid", live_camera_entities: [] }), null)).toBe(false);
    expect(
      isGridLayout(cfg({ live_layout: "grid", live_camera_entities: ["camera.a"] }), null)
    ).toBe(false);
  });

  it("returns true with grid + 2+ camera.* entities and no override", () => {
    expect(
      isGridLayout(
        cfg({
          live_layout: "grid",
          live_camera_entities: ["camera.a", "camera.b"],
        }),
        null
      )
    ).toBe(true);
    expect(
      isGridLayout(
        cfg({
          live_layout: "grid",
          live_camera_entities: ["camera.a", "camera.b", "camera.c"],
        }),
        null
      )
    ).toBe(true);
  });
});

describe("micStreamForCamera", () => {
  it("returns '' for null config / empty camera id", () => {
    expect(micStreamForCamera("camera.x", null)).toBe("");
    expect(micStreamForCamera(null, cfg())).toBe("");
    expect(micStreamForCamera("", cfg())).toBe("");
  });

  it("returns the per-camera mapping when set", () => {
    expect(
      micStreamForCamera(
        "camera.front_door",
        cfg({
          live_mic_streams: {
            "camera.front_door": "front_door",
            "camera.driveway": "driveway",
          },
        })
      )
    ).toBe("front_door");
    expect(
      micStreamForCamera(
        "camera.driveway",
        cfg({
          live_mic_streams: {
            "camera.front_door": "front_door",
            "camera.driveway": "driveway",
          },
        })
      )
    ).toBe("driveway");
  });

  it("supports synthetic stream ids as keys", () => {
    expect(
      micStreamForCamera(
        `${STREAM_ID_PREFIX}_0__`,
        cfg({ live_mic_streams: { [`${STREAM_ID_PREFIX}_0__`]: "backyard" } })
      )
    ).toBe("backyard");
  });

  it("does NOT fall back to legacy live_go2rtc_stream when the map has entries — map is authoritative", () => {
    // Once any row in the per-camera map is filled, the legacy global
    // fallback is ignored. This prevents surprise mic pills on cameras
    // the user didn't configure in a multi-camera setup.
    expect(
      micStreamForCamera(
        "camera.missing",
        cfg({
          live_mic_streams: { "camera.front_door": "front_door" },
          live_go2rtc_stream: "legacy_default",
        })
      )
    ).toBe("");
  });

  it("falls back to live_go2rtc_stream when the map is absent entirely", () => {
    expect(micStreamForCamera("camera.x", cfg({ live_go2rtc_stream: "legacy_default" }))).toBe(
      "legacy_default"
    );
  });

  it("falls back to live_go2rtc_stream when the map has only whitespace-only values (= effectively empty)", () => {
    expect(
      micStreamForCamera(
        "camera.front_door",
        cfg({
          live_mic_streams: { "camera.front_door": "   " },
          live_go2rtc_stream: "fallback",
        })
      )
    ).toBe("fallback");
  });

  it("returns '' when neither the per-camera map nor the legacy fallback resolves", () => {
    expect(micStreamForCamera("camera.x", cfg({ live_mic_streams: {} }))).toBe("");
  });
});

describe("hasAnyMicStream", () => {
  it("false for null/empty config", () => {
    expect(hasAnyMicStream(null)).toBe(false);
    expect(hasAnyMicStream(cfg())).toBe(false);
  });

  it("true when the map has at least one non-empty value", () => {
    expect(hasAnyMicStream(cfg({ live_mic_streams: { "camera.x": "front_door" } }))).toBe(true);
  });

  it("false when the map exists but every value is empty", () => {
    expect(hasAnyMicStream(cfg({ live_mic_streams: { "camera.x": "", "camera.y": "  " } }))).toBe(
      false
    );
  });

  it("true when only the legacy single-stream is set", () => {
    expect(hasAnyMicStream(cfg({ live_go2rtc_stream: "front_door" }))).toBe(true);
  });
});
