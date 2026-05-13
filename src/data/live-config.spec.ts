import { describe, expect, it } from "vitest";

import type { CameraGalleryCardConfig } from "../config/normalize";
import type { HassEntity } from "../types/hass";
import {
  friendlyCameraName,
  getAllLiveCameraEntities,
  getLiveCameraOptions,
  getStreamEntries,
  getStreamEntryById,
  hasLiveConfig,
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
