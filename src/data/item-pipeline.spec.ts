import { describe, expect, it, vi } from "vitest";

import type { CombinedSourceClient } from "./combined-source";
import type { DatetimeOptions } from "./datetime-parsing";
import type { CardItem } from "../types/media-item";
import type { MediaSourceClient } from "./media-walker";
import type { SensorSourceClient } from "./sensor-source";
import {
  ItemPipelineClient,
  type EnrichedItem,
  mergeKnownDays,
  sortItemsByTime,
} from "./item-pipeline";

// ─── Test doubles ─────────────────────────────────────────────────────

type EnrichFn = (src: string) => CardItem;

function makeSensorClient(items: CardItem[] = []): SensorSourceClient {
  return {
    getItems: (enrich?: EnrichFn) => items.map((entry) => enrich?.(entry.src) ?? entry),
  } as unknown as SensorSourceClient;
}

function makeMediaClient(
  ids: string[] = [],
  dtMsForId: Record<string, number | null> = {},
  days: string[] = []
): MediaSourceClient {
  return {
    getIds: () => ids,
    getItems: (enrich?: EnrichFn) => ids.map((id) => enrich?.(id) ?? ({ src: id } as CardItem)),
    getDtMsForId: (id: string) => dtMsForId[id] ?? null,
    getDays: () => days,
  } as unknown as MediaSourceClient;
}

function makeCombinedClient(items: CardItem[] = []): CombinedSourceClient {
  return {
    getItems: (enrich: EnrichFn) => items.map((entry) => enrich(entry.src)),
  } as unknown as CombinedSourceClient;
}

const trueFilter = (): boolean => true;
const isMp4 = (src: string): boolean => src.endsWith(".mp4");

function defaultOpts(over: Partial<ConstructorParameters<typeof ItemPipelineClient>[0]> = {}) {
  return {
    sensorClient: over.sensorClient ?? makeSensorClient(),
    mediaClient: over.mediaClient ?? makeMediaClient(),
    combinedClient: over.combinedClient ?? makeCombinedClient(),
    getSourceMode: over.getSourceMode ?? (() => "sensor" as const),
    getSortOrder: over.getSortOrder ?? (() => "newest" as const),
    getSelectedDay: over.getSelectedDay ?? (() => null),
    getObjectFilters: over.getObjectFilters ?? (() => [] as unknown[]),
    getDtOpts: over.getDtOpts ?? ((): DatetimeOptions => ({ pathFormat: "" })),
    matchesObjectFilter: over.matchesObjectFilter ?? trueFilter,
    isVideoForSrc: over.isVideoForSrc ?? isMp4,
    ...over,
  };
}

// ─── Pure helpers ──────────────────────────────────────────────────────

describe("sortItemsByTime", () => {
  it("sorts dtMs descending for 'newest'", () => {
    const items: EnrichedItem[] = [
      { src: "a", dtMs: 100 },
      { src: "b", dtMs: 300 },
      { src: "c", dtMs: 200 },
    ];
    expect(sortItemsByTime(items, "newest").map((x) => x.src)).toEqual(["b", "c", "a"]);
  });

  it("reverses for 'oldest'", () => {
    const items: EnrichedItem[] = [
      { src: "a", dtMs: 100 },
      { src: "b", dtMs: 300 },
      { src: "c", dtMs: 200 },
    ];
    expect(sortItemsByTime(items, "oldest").map((x) => x.src)).toEqual(["a", "c", "b"]);
  });

  it("items without dtMs go after dated items in their group", () => {
    const items: EnrichedItem[] = [
      { src: "a", dtMs: 100 },
      { src: "b" },
      { src: "c", dtMs: 200 },
      { src: "d" },
    ];
    expect(sortItemsByTime(items, "newest").map((x) => x.src)).toEqual(["c", "a", "d", "b"]);
  });

  it("ties broken by reverse insertion order (newer indexes win)", () => {
    const items: EnrichedItem[] = [
      { src: "a", dtMs: 100 },
      { src: "b", dtMs: 100 },
      { src: "c", dtMs: 100 },
    ];
    expect(sortItemsByTime(items, "newest").map((x) => x.src)).toEqual(["c", "b", "a"]);
  });

  it("rejects NaN/Infinity dtMs as null (no crashy sort)", () => {
    const items: EnrichedItem[] = [
      { src: "a", dtMs: Number.NaN },
      { src: "b", dtMs: Number.POSITIVE_INFINITY },
      { src: "c", dtMs: 100 },
    ];
    const result = sortItemsByTime(items, "newest");
    expect(result[0]?.src).toBe("c");
    expect(result[0]?.dtMs).toBe(100);
    expect(result[1]?.dtMs).toBeNull();
    expect(result[2]?.dtMs).toBeNull();
  });

  it("decorates with dayKey from dtMs", () => {
    const localMidnightMs = new Date(2026, 4, 12, 0, 0, 0).getTime();
    const [entry] = sortItemsByTime([{ src: "a", dtMs: localMidnightMs }], "newest");
    expect(entry?.dayKey).toBe("2026-05-12");
  });
});

describe("mergeKnownDays", () => {
  it("uses calendar days when present, folds item-derived days in", () => {
    expect(
      mergeKnownDays(
        [{ dayKey: "2026-05-12" }, { dayKey: "2026-05-09" }],
        ["2026-05-13", "2026-05-12", "2026-05-11"]
      )
    ).toEqual(["2026-05-13", "2026-05-12", "2026-05-11", "2026-05-09"]);
  });

  it("falls back to unique item-derived days when calendar empty", () => {
    expect(
      mergeKnownDays([{ dayKey: "2026-05-10" }, { dayKey: "2026-05-12" }, { dayKey: null }, {}], [])
    ).toEqual(["2026-05-12", "2026-05-10"]);
  });
});

// ─── Client behaviour ─────────────────────────────────────────────────

describe("ItemPipelineClient.getItems", () => {
  it("dispatches to sensor client in sensor mode and enriches with dtMs", () => {
    const sensor = makeSensorClient([{ src: "/local/a.mp4" }]);
    const media = makeMediaClient([], { "/local/a.mp4": null });
    const pipeline = new ItemPipelineClient(
      defaultOpts({
        sensorClient: sensor,
        mediaClient: media,
        getSourceMode: () => "sensor",
        getDtOpts: () => ({ pathFormat: "YYYYMMDD_HHmmss" }),
      })
    );
    expect(pipeline.getItems()).toEqual([{ src: "/local/a.mp4" }]);
  });

  it("dispatches to media client in media mode", () => {
    const media = makeMediaClient(["media-source://x", "media-source://y"]);
    const pipeline = new ItemPipelineClient(
      defaultOpts({ mediaClient: media, getSourceMode: () => "media" })
    );
    const items = pipeline.getItems();
    expect(items.map((x) => x.src)).toEqual(["media-source://x", "media-source://y"]);
  });

  it("dispatches to combined client in combined mode", () => {
    const combined = makeCombinedClient([{ src: "/local/a.mp4" }, { src: "media-source://b" }]);
    const pipeline = new ItemPipelineClient(
      defaultOpts({ combinedClient: combined, getSourceMode: () => "combined" })
    );
    expect(pipeline.getItems().map((x) => x.src)).toEqual(["/local/a.mp4", "media-source://b"]);
  });

  it("filters out deleted src", () => {
    const sensor = makeSensorClient([{ src: "a" }, { src: "b" }, { src: "c" }]);
    const pipeline = new ItemPipelineClient(
      defaultOpts({
        sensorClient: sensor,
        getDeleted: () => new Set(["b"]),
      })
    );
    expect(pipeline.getItems().map((x) => x.src)).toEqual(["a", "c"]);
  });

  it("caches results across invocations until invalidate()", () => {
    const sensor = makeSensorClient([{ src: "a" }]);
    const spy = vi.spyOn(sensor, "getItems");
    const pipeline = new ItemPipelineClient(defaultOpts({ sensorClient: sensor }));

    const first = pipeline.getItems();
    const second = pipeline.getItems();
    expect(first).toBe(second);
    expect(spy).toHaveBeenCalledTimes(1);

    pipeline.invalidate();
    pipeline.getItems();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("ItemPipelineClient.resolveItemMs", () => {
  it("prefers source-attached dtMs from media client", () => {
    const media = makeMediaClient(["media-source://x"], {
      "media-source://x": 1747049200000,
    });
    const pipeline = new ItemPipelineClient(defaultOpts({ mediaClient: media }));
    expect(pipeline.resolveItemMs("media-source://x")).toBe(1747049200000);
  });

  it("falls back to user-format parsing", () => {
    const media = makeMediaClient([], {});
    const pipeline = new ItemPipelineClient(
      defaultOpts({
        mediaClient: media,
        getDtOpts: () => ({ pathFormat: "YYYY-MM-DD_HH-mm-ss" }),
      })
    );
    const got = pipeline.resolveItemMs("/local/2026-05-12_10-30-15_clip.mp4");
    expect(got).not.toBeNull();
    expect(new Date(got as number).getFullYear()).toBe(2026);
  });

  it("returns null when nothing matches", () => {
    const pipeline = new ItemPipelineClient(defaultOpts());
    expect(pipeline.resolveItemMs("/local/garbage.bin")).toBeNull();
  });
});

describe("ItemPipelineClient.getBaseList", () => {
  it("returns the empty baseline on empty items", () => {
    const pipeline = new ItemPipelineClient(defaultOpts());
    const base = pipeline.getBaseList();
    expect(base.rawItems).toEqual([]);
    expect(base.objFiltered).toEqual([]);
    expect(base.activeDay).toBeNull();
    expect(base.videoCount).toBe(0);
    expect(base.imageCount).toBe(0);
  });

  it("applies object filter and counts videos/images", () => {
    const dt = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getTime();
    const ms = dt(2026, 5, 12);
    const sensor = makeSensorClient([{ src: "/a.mp4" }, { src: "/b.jpg" }, { src: "/c.mp4" }]);
    const media = makeMediaClient([], { "/a.mp4": ms, "/b.jpg": ms, "/c.mp4": ms });
    const pipeline = new ItemPipelineClient(
      defaultOpts({
        sensorClient: sensor,
        mediaClient: media,
        matchesObjectFilter: (src) => src !== "/c.mp4",
      })
    );
    const base = pipeline.getBaseList();
    expect(base.objFiltered.map((x) => x.src).sort()).toEqual(["/a.mp4", "/b.jpg"]);
    expect(base.videoCount).toBe(1);
    expect(base.imageCount).toBe(1);
  });

  it("filters to selected day", () => {
    const dt = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getTime();
    const sensor = makeSensorClient([{ src: "/a.mp4" }, { src: "/b.mp4" }]);
    const media = makeMediaClient([], { "/a.mp4": dt(2026, 5, 12), "/b.mp4": dt(2026, 5, 11) });
    const pipeline = new ItemPipelineClient(
      defaultOpts({
        sensorClient: sensor,
        mediaClient: media,
        getSelectedDay: () => "2026-05-11",
      })
    );
    const base = pipeline.getBaseList();
    expect(base.activeDay).toBe("2026-05-11");
    expect(base.dayFiltered.map((x) => x.src)).toEqual(["/b.mp4"]);
  });

  it("active day defaults to newest day when selected day is null", () => {
    const dt = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getTime();
    const sensor = makeSensorClient([{ src: "/a" }, { src: "/b" }]);
    const media = makeMediaClient([], { "/a": dt(2026, 5, 10), "/b": dt(2026, 5, 12) });
    const pipeline = new ItemPipelineClient(
      defaultOpts({ sensorClient: sensor, mediaClient: media })
    );
    expect(pipeline.getBaseList().activeDay).toBe("2026-05-12");
  });

  it("re-sorts when getSortOrder() flips", () => {
    // Same day so the day filter doesn't trim — we're testing sort direction.
    const dt = (y: number, m: number, d: number, h: number): number =>
      new Date(y, m - 1, d, h).getTime();
    const sensor = makeSensorClient([{ src: "/a" }, { src: "/b" }]);
    const media = makeMediaClient([], { "/a": dt(2026, 5, 12, 9), "/b": dt(2026, 5, 12, 15) });
    let sort: "newest" | "oldest" = "newest";
    const pipeline = new ItemPipelineClient(
      defaultOpts({ sensorClient: sensor, mediaClient: media, getSortOrder: () => sort })
    );
    expect(pipeline.getBaseList().objFiltered.map((x) => x.src)).toEqual(["/b", "/a"]);
    sort = "oldest";
    pipeline.invalidate(); // sort order isn't itemsRev-tied; force rebuild.
    expect(pipeline.getBaseList().objFiltered.map((x) => x.src)).toEqual(["/a", "/b"]);
  });

  it("caches base list on stable inputs", () => {
    const sensor = makeSensorClient([{ src: "/a.mp4", dtMs: 1 }]);
    const filterRef = [] as unknown[];
    const matchesObjectFilter = vi.fn(() => true);
    const pipeline = new ItemPipelineClient(
      defaultOpts({
        sensorClient: sensor,
        matchesObjectFilter,
        getObjectFilters: () => filterRef,
      })
    );
    const a = pipeline.getBaseList();
    const b = pipeline.getBaseList();
    expect(a).toBe(b);
    expect(matchesObjectFilter).toHaveBeenCalledTimes(1);
  });

  it("rebuilds when invalidate() bumps the rev", () => {
    const sensor = makeSensorClient([{ src: "/a.mp4", dtMs: 1 }]);
    const matchesObjectFilter = vi.fn(() => true);
    const pipeline = new ItemPipelineClient(
      defaultOpts({ sensorClient: sensor, matchesObjectFilter })
    );
    pipeline.getBaseList();
    pipeline.invalidate();
    pipeline.getBaseList();
    expect(matchesObjectFilter).toHaveBeenCalledTimes(2);
  });

  it("fires onChange from invalidate()", () => {
    const onChange = vi.fn();
    const pipeline = new ItemPipelineClient(defaultOpts({ onChange }));
    pipeline.invalidate();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("ItemPipelineClient.getAllDays", () => {
  it("merges media calendar with item-derived dayKeys", () => {
    const media = makeMediaClient([], {}, ["2026-05-13", "2026-05-12"]);
    const pipeline = new ItemPipelineClient(defaultOpts({ mediaClient: media }));
    expect(pipeline.getAllDays([{ dayKey: "2026-05-11" }, { dayKey: "2026-05-13" }])).toEqual([
      "2026-05-13",
      "2026-05-12",
      "2026-05-11",
    ]);
  });
});
