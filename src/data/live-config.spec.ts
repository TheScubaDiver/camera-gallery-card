import { describe, expect, it } from "vitest";

import type { CameraGalleryCardConfig } from "../config/normalize";
import type { HassEntity } from "../types/hass";
import {
  friendlyCameraName,
  getAllLiveCameraEntities,
  getGridCameraEntities,
  getLiveCameraEntityIds,
  getLiveCameraOptions,
  getStreamEntries,
  getStreamEntryById,
  gridDims,
  gridLayout,
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

  it("preserves the configured list order (no alphabetic sort)", () => {
    // Position 0 is the default camera, so the friendly-name sort the
    // helper used to apply would have silently overridden the user's
    // intentional ordering.
    const result = getAllLiveCameraEntities({
      config: cfg({ live_camera_entities: ["camera.x", "camera.y"] }),
      hassStates: {
        "camera.x": state({ entity_id: "camera.x" }),
        "camera.y": state({ entity_id: "camera.y" }),
      },
      localeTag: "en",
      friendlyName: (id) => (id === "camera.x" ? "Zebra" : "Aardvark"),
    });
    expect(result).toEqual(["camera.x", "camera.y"]);
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

describe("getLiveCameraEntityIds", () => {
  it("returns entity ids from legacy live_camera_entities", () => {
    expect(getLiveCameraEntityIds(cfg({ live_camera_entities: ["camera.a", "camera.b"] }))).toEqual(
      ["camera.a", "camera.b"]
    );
  });

  it("excludes orphan synthetic stream ids from mic-only legacy entries", () => {
    // A legacy `live_mic_streams` with a synthetic key but no matching
    // stream becomes a mic-only entry under `getCanonicalLiveCameras`,
    // stored on the `entity` field. Those aren't real HA entities and
    // should not leak into hass.states watch-lists.
    expect(
      getLiveCameraEntityIds(
        cfg({
          live_camera_entities: ["camera.real"],
          live_mic_streams: { [`${STREAM_ID_PREFIX}_0__`]: "orphan_mic" },
        })
      )
    ).toEqual(["camera.real"]);
  });

  it("returns [] for null/empty config", () => {
    expect(getLiveCameraEntityIds(null)).toEqual([]);
    expect(getLiveCameraEntityIds(cfg())).toEqual([]);
  });
});

describe("gridLayout", () => {
  it("fills every cell — row counts sum to the camera count", () => {
    for (let n = 1; n <= 20; n++) {
      const l = gridLayout(n);
      const sum = l.rowCounts.reduce((a, b) => a + b, 0);
      expect(sum, `n=${n}`).toBe(n);
    }
  });

  it("gives each row spans that exactly fill the unit width", () => {
    for (let n = 1; n <= 20; n++) {
      const l = gridLayout(n);
      for (const c of l.rowCounts) {
        expect(l.unit % c, `n=${n} row of ${c}`).toBe(0);
      }
      // Every tile span is an integer number of unit tracks.
      for (const s of l.tileSpans) {
        expect(Number.isInteger(s), `n=${n}`).toBe(true);
      }
      expect(l.tileSpans).toHaveLength(n);
    }
  });

  it("stays gapless under every emphasis, pinned or automatic, capped or not", () => {
    const emphases: Array<string | null | undefined> = ["bottom", "top", "hero", undefined];
    for (let n = 1; n <= 80; n++) {
      for (const emphasis of emphases) {
        const pins = [null, ...Array.from({ length: 8 }, (_, i) => i + 1)];
        for (const pin of pins) {
          for (let cap = 0; cap <= 4; cap++) {
            const l = gridLayout(n, {
              columns: pin,
              maxColumns: cap > 0 ? cap : null,
              emphasis,
            });
            const label = `n=${n} emphasis=${emphasis} pin=${pin} cap=${cap}`;
            const sum = l.rowCounts.reduce((a, b) => a + b, 0);
            expect(sum, label).toBe(n);
            for (const c of l.rowCounts) {
              expect(c, label).toBeGreaterThanOrEqual(1);
              expect(l.unit % c, `${label} row of ${c}`).toBe(0);
            }
            expect(l.tileSpans, label).toHaveLength(n);
            expect(l.cols, label).toBe(Math.max(...l.rowCounts));
            expect(l.rows, label).toBe(l.rowCounts.length);
          }
        }
      }
    }
  });

  it("puts 2 and 3 cameras in a single row", () => {
    expect(gridLayout(2)).toMatchObject({
      cols: 2,
      rows: 1,
      rowCounts: [2],
      unit: 2,
      templateColumns: "repeat(2, 1fr)",
      templateRows: "1fr",
      aspectRatio: "32/9",
    });
    expect(gridLayout(3)).toMatchObject({
      cols: 3,
      rows: 1,
      rowCounts: [3],
      unit: 3,
      templateRows: "1fr",
      aspectRatio: "16/3",
    });
  });

  it("splits 5 cameras 3/2 with a taller second row", () => {
    expect(gridLayout(5)).toMatchObject({
      cols: 3,
      rows: 2,
      rowCounts: [3, 2],
      unit: 6,
      tileSpans: [2, 2, 2, 3, 3],
      templateColumns: "repeat(6, 1fr)",
      templateRows: "2fr 3fr",
      aspectRatio: "32/15",
    });
  });

  it("splits 7 cameras 3/2/2", () => {
    expect(gridLayout(7)).toMatchObject({
      rowCounts: [3, 2, 2],
      unit: 6,
      tileSpans: [2, 2, 2, 3, 3, 3, 3],
      templateRows: "2fr 3fr 3fr",
      aspectRatio: "4/3",
    });
  });

  it("splits 8 cameras 3/3/2", () => {
    expect(gridLayout(8)).toMatchObject({
      rowCounts: [3, 3, 2],
      unit: 6,
      templateRows: "2fr 2fr 3fr",
      aspectRatio: "32/21",
    });
  });

  it("splits 10 cameras 4/3/3", () => {
    expect(gridLayout(10)).toMatchObject({
      cols: 4,
      rowCounts: [4, 3, 3],
      unit: 12,
      templateRows: "3fr 4fr 4fr",
      aspectRatio: "64/33",
    });
  });

  it("keeps perfect squares identical to the old square layout", () => {
    expect(gridLayout(4)).toMatchObject({
      cols: 2,
      rows: 2,
      rowCounts: [2, 2],
      unit: 2,
      templateRows: "1fr 1fr",
      aspectRatio: "16/9",
    });
    expect(gridLayout(9)).toMatchObject({
      cols: 3,
      rows: 3,
      templateRows: "1fr 1fr 1fr",
      aspectRatio: "16/9",
    });
    expect(gridLayout(16)).toMatchObject({
      cols: 4,
      rows: 4,
      templateRows: "1fr 1fr 1fr 1fr",
      aspectRatio: "16/9",
    });
  });

  it("flows past 16 cameras instead of clipping", () => {
    const l = gridLayout(20);
    expect(l.rowCounts.reduce((a, b) => a + b, 0)).toBe(20);
    expect(l.cols).toBe(5);
    expect(l.tileSpans).toHaveLength(20);
  });

  it("honours a pinned column count", () => {
    expect(gridLayout(5, { columns: 2 })).toMatchObject({
      cols: 2,
      rows: 3,
      rowCounts: [2, 2, 1],
      unit: 2,
      tileSpans: [1, 1, 1, 1, 2],
      templateColumns: "repeat(2, 1fr)",
      templateRows: "1fr 1fr 2fr",
    });
  });

  it("clamps a pinned column count to the camera count", () => {
    expect(gridLayout(2, { columns: 4 }).cols).toBe(2);
    expect(gridLayout(5, { columns: 0 }).cols).toBe(3); // 0 is falsy -> automatic
    expect(gridLayout(5, { columns: -1 }).cols).toBe(3); // invalid -> automatic
  });

  it("applies maxColumns to the automatic choice only", () => {
    expect(gridLayout(5, { maxColumns: 2 }).cols).toBe(2);
    expect(gridLayout(9, { maxColumns: 2 }).rowCounts).toEqual([2, 2, 2, 2, 1]);
    // An explicit pin beats the cap.
    expect(gridLayout(9, { columns: 3, maxColumns: 2 }).cols).toBe(3);
  });

  it("fills a pin greedily instead of re-spreading it away — the pinned count actually renders", () => {
    // Regression cases: the old even-spread step recomputed rowCounts from
    // `rows` alone, so whenever ceil(n / ceil(n / pinned)) !== pinned, the
    // pin was silently discarded in favor of a different column count.
    expect(gridLayout(4, { columns: 3 })).toMatchObject({
      cols: 3,
      rowCounts: [3, 1],
      templateColumns: "repeat(3, 1fr)",
    });
    expect(gridLayout(5, { columns: 4 })).toMatchObject({
      cols: 4,
      rowCounts: [4, 1],
      templateColumns: "repeat(4, 1fr)",
    });
    expect(gridLayout(6, { columns: 4 })).toMatchObject({
      cols: 4,
      rowCounts: [4, 2],
      templateColumns: "repeat(4, 1fr)",
    });
    // The worst case: pinning 4 used to produce output byte-identical to
    // the automatic 3-column layout, making the control appear inert.
    expect(gridLayout(9, { columns: 4 })).toMatchObject({
      cols: 4,
      rowCounts: [4, 4, 1],
      templateColumns: "repeat(4, 1fr)",
      templateRows: "1fr 1fr 4fr",
    });
  });

  it("never returns a `cols` that contradicts `templateColumns` / rowCounts", () => {
    for (let n = 1; n <= 40; n++) {
      // Automatic path.
      const auto = gridLayout(n);
      expect(auto.cols, `auto n=${n}`).toBe(Math.max(...auto.rowCounts));
      for (let pin = 1; pin <= 8; pin++) {
        const pinned = gridLayout(n, { columns: pin });
        expect(pinned.cols, `n=${n} pin=${pin}`).toBe(Math.max(...pinned.rowCounts));
        expect(pinned.cols, `n=${n} pin=${pin}`).toBe(Math.min(pin, n));
      }
    }
  });

  it("derives the aspect ratio from the configured tile ratio", () => {
    expect(gridLayout(4, { aspectRatio: "4/3" }).aspectRatio).toBe("4/3");
    expect(gridLayout(5, { aspectRatio: "4/3" }).aspectRatio).toBe("8/5");
    expect(gridLayout(4, { aspectRatio: "1/1" }).aspectRatio).toBe("1/1");
    // Garbage falls back to 16/9.
    expect(gridLayout(4, { aspectRatio: "nonsense" }).aspectRatio).toBe("16/9");
  });

  it("handles degenerate counts without dividing by zero", () => {
    for (const n of [0, -1, 1.5, NaN]) {
      const l = gridLayout(n as number);
      expect(l.cols).toBeGreaterThanOrEqual(1);
      expect(l.rows).toBeGreaterThanOrEqual(1);
      expect(l.unit).toBeGreaterThanOrEqual(1);
      expect(l.templateRows.length).toBeGreaterThan(0);
    }
  });

  describe("emphasis: top", () => {
    it("reverses the row order so the short row lands on top", () => {
      expect(gridLayout(5, { emphasis: "top" })).toMatchObject({
        rowCounts: [2, 3],
        unit: 6,
        templateRows: "3fr 2fr",
        aspectRatio: "32/15",
      });
      expect(gridLayout(7, { emphasis: "top" })).toMatchObject({
        rowCounts: [2, 2, 3],
        unit: 6,
        templateRows: "3fr 3fr 2fr",
        aspectRatio: "4/3",
      });
      expect(gridLayout(8, { emphasis: "top" })).toMatchObject({
        rowCounts: [2, 3, 3],
        unit: 6,
        templateRows: "3fr 2fr 2fr",
        aspectRatio: "32/21",
      });
      expect(gridLayout(10, { emphasis: "top" })).toMatchObject({
        rowCounts: [3, 3, 4],
        unit: 12,
        templateRows: "4fr 4fr 3fr",
        aspectRatio: "64/33",
      });
    });

    it("cannot change the aspect ratio — reordering rows doesn't change the span sum", () => {
      for (let n = 1; n <= 40; n++) {
        const bottom = gridLayout(n);
        const top = gridLayout(n, { emphasis: "top" });
        expect(top.aspectRatio, `n=${n}`).toBe(bottom.aspectRatio);
      }
    });

    it("is a visual no-op when every row is already equal", () => {
      for (const n of [2, 3, 4, 6, 9, 12, 16]) {
        const bottom = gridLayout(n);
        const top = gridLayout(n, { emphasis: "top" });
        expect(top.rowCounts, `n=${n}`).toEqual(bottom.rowCounts);
      }
    });
  });

  describe("emphasis: hero", () => {
    it("puts camera 1 alone on the top row, automatic columns", () => {
      expect(gridLayout(2, { emphasis: "hero" })).toMatchObject({
        rowCounts: [1, 1],
        unit: 1,
        templateRows: "1fr 1fr",
        aspectRatio: "8/9",
      });
      expect(gridLayout(3, { emphasis: "hero" })).toMatchObject({
        rowCounts: [1, 2],
        unit: 2,
        templateRows: "2fr 1fr",
        aspectRatio: "32/27",
      });
      expect(gridLayout(5, { emphasis: "hero" })).toMatchObject({
        rowCounts: [1, 4],
        unit: 4,
        templateRows: "4fr 1fr",
        aspectRatio: "64/45",
      });
      expect(gridLayout(9, { emphasis: "hero" })).toMatchObject({
        rowCounts: [1, 8],
        unit: 8,
        templateRows: "8fr 1fr",
        aspectRatio: "128/81",
      });
    });

    it("uses the pinned column count for the remainder", () => {
      expect(gridLayout(5, { emphasis: "hero", columns: 4 })).toMatchObject({
        rowCounts: [1, 4],
        unit: 4,
        templateRows: "4fr 1fr",
        aspectRatio: "64/45",
      });
      expect(gridLayout(9, { emphasis: "hero", columns: 4 })).toMatchObject({
        rowCounts: [1, 4, 4],
        unit: 4,
        templateRows: "4fr 1fr 1fr",
        aspectRatio: "32/27",
      });
      expect(gridLayout(13, { emphasis: "hero", columns: 4 })).toMatchObject({
        rowCounts: [1, 4, 4, 4],
        unit: 4,
        templateRows: "4fr 1fr 1fr 1fr",
        aspectRatio: "64/63",
      });
    });

    it("falls through to the normal layout when there's no meaningful hero (n < 2)", () => {
      const hero = gridLayout(1, { emphasis: "hero" });
      const bottom = gridLayout(1);
      expect(hero).toEqual(bottom);
    });

    describe("with maxColumns (narrow-screen cap)", () => {
      it("spreads the remainder at the capped column count instead of one wide strip", () => {
        expect(gridLayout(5, { emphasis: "hero", maxColumns: 2 }).rowCounts).toEqual([1, 2, 2]);
        expect(gridLayout(9, { emphasis: "hero", maxColumns: 2 }).rowCounts).toEqual([
          1, 2, 2, 2, 2,
        ]);
        expect(gridLayout(9, { emphasis: "hero", maxColumns: 3 }).rowCounts).toEqual([1, 3, 3, 2]);
        expect(gridLayout(7, { emphasis: "hero", maxColumns: 3 }).rowCounts).toEqual([1, 3, 3]);
      });

      it("keeps the single-strip remainder when there is no cap", () => {
        expect(gridLayout(5, { emphasis: "hero" }).rowCounts).toEqual([1, 4]);
        expect(gridLayout(9, { emphasis: "hero" }).rowCounts).toEqual([1, 8]);
        expect(gridLayout(12, { emphasis: "hero" }).rowCounts).toEqual([1, 11]);
      });

      it("leaves the layout untouched when the cap doesn't actually bind (cap >= n - 1)", () => {
        for (let n = 2; n <= 40; n++) {
          const baseline = gridLayout(n, { emphasis: "hero" });
          for (let cap = n - 1; cap <= n + 2; cap++) {
            expect(gridLayout(n, { emphasis: "hero", maxColumns: cap })).toEqual(baseline);
          }
        }
      });

      it("still lets an explicit pin beat the cap", () => {
        expect(gridLayout(9, { emphasis: "hero", columns: 4, maxColumns: 2 }).rowCounts).toEqual([
          1, 4, 4,
        ]);
      });
    });
  });

  describe("emphasis: bottom / unrecognised / absent", () => {
    it("produces byte-identical output to the current no-emphasis behaviour", () => {
      const bogus: Array<string | null | undefined> = ["bottom", "nonsense", null, undefined];
      for (let n = 1; n <= 40; n++) {
        const baseline = gridLayout(n);
        for (const emphasis of bogus) {
          const withEmphasis =
            emphasis === undefined ? gridLayout(n, {}) : gridLayout(n, { emphasis });
          expect(withEmphasis.rowCounts, `n=${n} emphasis=${emphasis}`).toEqual(baseline.rowCounts);
          expect(withEmphasis.templateRows, `n=${n} emphasis=${emphasis}`).toBe(
            baseline.templateRows
          );
          expect(withEmphasis.aspectRatio, `n=${n} emphasis=${emphasis}`).toBe(
            baseline.aspectRatio
          );
        }
        // Omitted `opts` entirely is also equivalent.
        expect(gridLayout(n)).toEqual(baseline);
      }
    });
  });
});

describe("gridDims", () => {
  it("still returns cols/rows for the counts it always handled", () => {
    expect(gridDims(4)).toEqual({ cols: 2, rows: 2 });
    expect(gridDims(9)).toEqual({ cols: 3, rows: 3 });
    expect(gridDims(16)).toEqual({ cols: 4, rows: 4 });
  });

  it("now packs odd counts instead of forcing a square", () => {
    expect(gridDims(5)).toEqual({ cols: 3, rows: 2 });
    expect(gridDims(2)).toEqual({ cols: 2, rows: 1 });
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
