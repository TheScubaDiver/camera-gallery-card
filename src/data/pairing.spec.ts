import { describe, expect, it } from "vitest";

import { THUMBNAIL_MATCH_WINDOW_MS } from "../const";
import {
  dedupeByRelPath,
  pairMediaSourceThumbnails,
  pairSensorItems,
  pairVideoThumbnails,
} from "./pairing";

// Proximity fixtures: 2026-10-12 11:11:00 local, offsets in seconds. The
// filenames below spell out the same instants so each case reads as the
// files a camera would actually upload.
const T0 = new Date(2026, 9, 12, 11, 11, 0).getTime();
const at = (sec: number): number => T0 + sec * 1000;

interface TimedItem {
  id: string;
  dtMs?: number | undefined;
}
const byId = (x: TimedItem): string => x.id;
const byMs = (x: TimedItem): number | undefined => x.dtMs;

describe("pairVideoThumbnails", () => {
  it("returns empty result for null/undefined/empty input", () => {
    expect(pairVideoThumbnails(null, (x: { id: string }) => x.id)).toEqual({
      items: [],
      pairedThumbs: new Map(),
    });
    expect(pairVideoThumbnails(undefined, (x: { id: string }) => x.id)).toEqual({
      items: [],
      pairedThumbs: new Map(),
    });
    expect(pairVideoThumbnails([], (x: { id: string }) => x.id)).toEqual({
      items: [],
      pairedThumbs: new Map(),
    });
  });

  it("does not throw when items is non-array (defensive)", () => {
    // Cast through unknown so we can exercise the runtime guard.
    expect(
      pairVideoThumbnails("not an array" as unknown as readonly { id: string }[], (x) => x.id)
    ).toEqual({ items: [], pairedThumbs: new Map() });
  });

  it("collapses a single video + thumbnail pair", () => {
    const items = [{ id: "clip.mp4" }, { id: "clip.jpg" }];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, (x) => x.id);
    expect(filtered).toEqual([{ id: "clip.mp4" }]);
    expect(pairedThumbs.get("clip.mp4")).toBe("clip.jpg");
    expect(pairedThumbs.size).toBe(1);
  });

  it("matches stems case-insensitively", () => {
    const items = [{ id: "Clip.MP4" }, { id: "clip.JPG" }];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, (x) => x.id);
    expect(filtered).toEqual([{ id: "Clip.MP4" }]);
    expect(pairedThumbs.get("Clip.MP4")).toBe("clip.JPG");
  });

  it("preserves order; matched thumbnails are dropped", () => {
    const items = [
      { id: "a.mp4" },
      { id: "b.mp4" },
      { id: "a.jpg" },
      { id: "c.mp4" },
      { id: "b.png" },
    ];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, (x) => x.id);
    expect(filtered.map((x) => x.id)).toEqual(["a.mp4", "b.mp4", "c.mp4"]);
    expect(pairedThumbs.get("a.mp4")).toBe("a.jpg");
    expect(pairedThumbs.get("b.mp4")).toBe("b.png");
    expect(pairedThumbs.has("c.mp4")).toBe(false);
  });

  it("skips items where getKey returns undefined / empty", () => {
    const items = [{ id: "a.mp4" }, { id: "" }, { id: "a.jpg" }] as { id: string }[];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, (x) => x.id || undefined);
    expect(filtered.map((x) => x.id)).toEqual(["a.mp4", ""]);
    expect(pairedThumbs.get("a.mp4")).toBe("a.jpg");
  });

  it("does not pair a thumbnail with no matching video", () => {
    const items = [{ id: "orphan.jpg" }, { id: "video.mp4" }];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, (x) => x.id);
    expect(filtered.map((x) => x.id)).toEqual(["orphan.jpg", "video.mp4"]);
    expect(pairedThumbs.size).toBe(0);
  });

  it("supports all video extensions: mp4, webm, mov, m4v", () => {
    const items = [
      { id: "a.mp4" },
      { id: "b.webm" },
      { id: "c.mov" },
      { id: "d.m4v" },
      { id: "a.jpg" },
      { id: "b.jpeg" },
      { id: "c.png" },
      { id: "d.webp" },
    ];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, (x) => x.id);
    expect(filtered.map((x) => x.id)).toEqual(["a.mp4", "b.webm", "c.mov", "d.m4v"]);
    expect(pairedThumbs.size).toBe(4);
    expect(pairedThumbs.get("a.mp4")).toBe("a.jpg");
    expect(pairedThumbs.get("b.webm")).toBe("b.jpeg");
    expect(pairedThumbs.get("c.mov")).toBe("c.png");
    expect(pairedThumbs.get("d.m4v")).toBe("d.webp");
  });

  it("ignores non-image, non-video files (no false-positive pair)", () => {
    const items = [{ id: "log.txt" }, { id: "data.json" }];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, (x) => x.id);
    expect(filtered).toEqual(items);
    expect(pairedThumbs.size).toBe(0);
  });

  it("matches the last-seen video when multiple videos share a stem", () => {
    // Defensive contract: stem collisions are vanishingly rare in
    // practice (the source layout would have to put two videos with
    // identical stems in the same list). When it does happen, the second
    // entry wins because the index map is overwritten.
    const items = [{ id: "a.mp4" }, { id: "a.webm" }, { id: "a.jpg" }];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, (x) => x.id);
    expect(filtered.map((x) => x.id)).toEqual(["a.mp4", "a.webm"]);
    expect(pairedThumbs.get("a.webm")).toBe("a.jpg");
    expect(pairedThumbs.has("a.mp4")).toBe(false);
  });

  it("uses full path as input but matches by basename stem only", () => {
    const items = [
      { id: "/path/to/clip.mp4" },
      { id: "/path/to/clip.jpg" },
      { id: "/other/dir/clip.png" },
    ];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, (x) => x.id);
    // Both jpg and png have stem "clip" — the second one (png) wins because
    // it overwrites the pair map entry.
    expect(filtered.map((x) => x.id)).toEqual(["/path/to/clip.mp4"]);
    expect(pairedThumbs.get("/path/to/clip.mp4")).toBe("/other/dir/clip.png");
  });
});

describe("pairVideoThumbnails — timestamp proximity", () => {
  it("pairs a Reolink FTP still with the clip it was captured 2s into", () => {
    // The motivating case: the clip is named for its recording start
    // (pre-record buffer included), the still for the trigger frame.
    const items = [
      { id: "/ftp/Moss garden_00_20261012111141.jpg", dtMs: at(41) },
      { id: "/ftp/Moss garden_00_20261012111139.mp4", dtMs: at(39) },
    ];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, byId, byMs);
    expect(filtered.map((x) => x.id)).toEqual(["/ftp/Moss garden_00_20261012111139.mp4"]);
    expect(pairedThumbs.get("/ftp/Moss garden_00_20261012111139.mp4")).toBe(
      "/ftp/Moss garden_00_20261012111141.jpg"
    );
  });

  it("is opt-in: without `getMs` only exact stems pair", () => {
    const items = [
      { id: "/ftp/cam_00_20261012111141.jpg", dtMs: at(41) },
      { id: "/ftp/cam_00_20261012111139.mp4", dtMs: at(39) },
    ];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, byId);
    expect(filtered).toEqual(items);
    expect(pairedThumbs.size).toBe(0);
  });

  it("pairs at exactly the window edge but not one second past it", () => {
    // Checked on both sides: clip before the still, and clip after it.
    const edge = THUMBNAIL_MATCH_WINDOW_MS / 1000;
    const name = (sec: number, ext: string): string =>
      `/ftp/cam_00_202610121111${String(sec).padStart(2, "0")}.${ext}`;
    const pairCount = (videoSec: number, imageSec: number): number =>
      pairVideoThumbnails(
        [
          { id: name(videoSec, "mp4"), dtMs: at(videoSec) },
          { id: name(imageSec, "jpg"), dtMs: at(imageSec) },
        ],
        byId,
        byMs
      ).pairedThumbs.size;

    expect(pairCount(0, edge)).toBe(1);
    expect(pairCount(edge, 0)).toBe(1);
    expect(pairCount(0, edge + 1)).toBe(0);
    expect(pairCount(edge + 1, 0)).toBe(0);
  });

  it("matches in either direction (still before or after the clip start)", () => {
    const items = [
      { id: "/ftp/cam_00_20261012111139.jpg", dtMs: at(39) },
      { id: "/ftp/cam_00_20261012111141.mp4", dtMs: at(41) },
    ];
    const { pairedThumbs } = pairVideoThumbnails(items, byId, byMs);
    expect(pairedThumbs.get("/ftp/cam_00_20261012111141.mp4")).toBe(
      "/ftp/cam_00_20261012111139.jpg"
    );
  });

  it("skips items without a finite timestamp", () => {
    // No `path_datetime_format` match → no `dtMs` → no basis for proximity.
    for (const bad of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      const items = [
        { id: "/ftp/cam_00_20261012111141.jpg", dtMs: bad },
        { id: "/ftp/cam_00_20261012111139.mp4", dtMs: at(39) },
      ];
      expect(pairVideoThumbnails(items, byId, byMs).pairedThumbs.size).toBe(0);
    }
    const nullMs = pairVideoThumbnails(
      [{ id: "/ftp/cam_00_20261012111141.jpg" }, { id: "/ftp/cam_00_20261012111139.mp4" }],
      byId,
      () => null
    );
    expect(nullMs.pairedThumbs.size).toBe(0);
  });

  it("rolls over minute, hour and day boundaries inside one digit run", () => {
    const items = [
      { id: "/ftp/cam_00_20261012235958.mp4", dtMs: at(0) },
      { id: "/ftp/cam_00_20261013000003.jpg", dtMs: at(5) },
    ];
    const { pairedThumbs } = pairVideoThumbnails(items, byId, byMs);
    expect(pairedThumbs.get("/ftp/cam_00_20261012235958.mp4")).toBe(
      "/ftp/cam_00_20261013000003.jpg"
    );
  });

  it("pairs separator-style timestamps that differ only in the seconds", () => {
    const items = [
      { id: "/snaps/front_2026-10-12_11-11-39.mp4", dtMs: at(39) },
      { id: "/snaps/front_2026-10-12_11-11-41.jpg", dtMs: at(41) },
    ];
    expect(pairVideoThumbnails(items, byId, byMs).pairedThumbs.size).toBe(1);
  });

  it("leaves a separator-style minute rollover unpaired (documented limitation)", () => {
    // `11-11-59` → `11-12-01` differs in two digit runs split by `-`, which
    // is indistinguishable from a channel + time difference without the
    // format. Unpaired is the safe outcome — both tiles render as before.
    const items = [
      { id: "/snaps/front_2026-10-12_11-11-59.mp4", dtMs: at(59) },
      { id: "/snaps/front_2026-10-12_11-12-01.jpg", dtMs: at(61) },
    ];
    expect(pairVideoThumbnails(items, byId, byMs).pairedThumbs.size).toBe(0);
  });

  it("does not pair across NVR channels whose timestamps are close", () => {
    // Channel `00` vs `01` *and* the seconds differ: the mismatch spans the
    // `_` between them, so it isn't a single digit run.
    const items = [
      { id: "/ftp/NVR_00_20261012111141.jpg", dtMs: at(41) },
      { id: "/ftp/NVR_01_20261012111139.mp4", dtMs: at(39) },
    ];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, byId, byMs);
    expect(filtered).toEqual(items);
    expect(pairedThumbs.size).toBe(0);
  });

  it("does not pair names that differ only in digits when timestamps are equal", () => {
    // Same instant, different name → the digits that differ aren't the
    // timestamp (channel, sequence counter, folder-only date).
    const items = [
      { id: "/ftp/NVR_00_20261012111141.jpg", dtMs: at(41) },
      { id: "/ftp/NVR_01_20261012111141.mp4", dtMs: at(41) },
    ];
    expect(pairVideoThumbnails(items, byId, byMs).pairedThumbs.size).toBe(0);
  });

  it("does not pair files from different folders", () => {
    const items = [
      { id: "/ftp/cam1/clip_20261012111141.jpg", dtMs: at(41) },
      { id: "/ftp/cam2/clip_20261012111139.mp4", dtMs: at(39) },
    ];
    expect(pairVideoThumbnails(items, byId, byMs).pairedThumbs.size).toBe(0);
  });

  it("does not pair names of different shapes", () => {
    const items = [
      { id: "/ftp/front_20261012111141.jpg", dtMs: at(41) },
      { id: "/ftp/back_20261012111139.mp4", dtMs: at(39) },
      { id: "/ftp/front_20261012111139_end.mp4", dtMs: at(39) },
    ];
    expect(pairVideoThumbnails(items, byId, byMs).pairedThumbs.size).toBe(0);
  });

  it("is one-to-one: the closer still wins, the other stays a tile", () => {
    const items = [
      { id: "/ftp/cam_00_20261012111139.mp4", dtMs: at(39) },
      { id: "/ftp/cam_00_20261012111141.jpg", dtMs: at(41) },
      { id: "/ftp/cam_00_20261012111148.jpg", dtMs: at(48) },
    ];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, byId, byMs);
    expect(filtered.map((x) => x.id)).toEqual([
      "/ftp/cam_00_20261012111139.mp4",
      "/ftp/cam_00_20261012111148.jpg",
    ]);
    expect(pairedThumbs.get("/ftp/cam_00_20261012111139.mp4")).toBe(
      "/ftp/cam_00_20261012111141.jpg"
    );
  });

  it("prefers the clip that started before the still over a closer later one", () => {
    // The wrong-clip case: the still @44 belongs to the event recorded from
    // @30, not to the next clip, whose pre-record buffer opens at @45.
    const items = [
      { id: "/ftp/cam_00_20261012111130.mp4", dtMs: at(30) },
      { id: "/ftp/cam_00_20261012111144.jpg", dtMs: at(44) },
      { id: "/ftp/cam_00_20261012111145.mp4", dtMs: at(45) },
    ];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, byId, byMs);
    expect(filtered.map((x) => x.id)).toEqual([
      "/ftp/cam_00_20261012111130.mp4",
      "/ftp/cam_00_20261012111145.mp4",
    ]);
    expect(pairedThumbs.get("/ftp/cam_00_20261012111130.mp4")).toBe(
      "/ftp/cam_00_20261012111144.jpg"
    );
    expect(pairedThumbs.has("/ftp/cam_00_20261012111145.mp4")).toBe(false);
  });

  it("pairs back-to-back events each with the clip that started before them", () => {
    // Nearest-either-way would hand clip @45 to still @44 (1s) and strand
    // both clip @30 and still @50.
    const items = [
      { id: "/ftp/cam_00_20261012111130.mp4", dtMs: at(30) },
      { id: "/ftp/cam_00_20261012111144.jpg", dtMs: at(44) },
      { id: "/ftp/cam_00_20261012111145.mp4", dtMs: at(45) },
      { id: "/ftp/cam_00_20261012111150.jpg", dtMs: at(50) },
    ];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, byId, byMs);
    expect(filtered.map((x) => x.id)).toEqual([
      "/ftp/cam_00_20261012111130.mp4",
      "/ftp/cam_00_20261012111145.mp4",
    ]);
    expect(pairedThumbs.get("/ftp/cam_00_20261012111130.mp4")).toBe(
      "/ftp/cam_00_20261012111144.jpg"
    );
    expect(pairedThumbs.get("/ftp/cam_00_20261012111145.mp4")).toBe(
      "/ftp/cam_00_20261012111150.jpg"
    );
  });

  it("lets a still left over from the first tier fall back to a later clip", () => {
    // Clip @45 started before both stills; @50 is closer, so it wins tier 1.
    // Still @44 has no earlier clip left and takes clip @58 in tier 2.
    const items = [
      { id: "/ftp/cam_00_20261012111150.jpg", dtMs: at(50) },
      { id: "/ftp/cam_00_20261012111144.jpg", dtMs: at(44) },
      { id: "/ftp/cam_00_20261012111145.mp4", dtMs: at(45) },
      { id: "/ftp/cam_00_20261012111158.mp4", dtMs: at(58) },
    ];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, byId, byMs);
    expect(filtered.map((x) => x.id)).toEqual([
      "/ftp/cam_00_20261012111145.mp4",
      "/ftp/cam_00_20261012111158.mp4",
    ]);
    expect(pairedThumbs.get("/ftp/cam_00_20261012111145.mp4")).toBe(
      "/ftp/cam_00_20261012111150.jpg"
    );
    expect(pairedThumbs.get("/ftp/cam_00_20261012111158.mp4")).toBe(
      "/ftp/cam_00_20261012111144.jpg"
    );
  });

  it("resolves each tier closest-first across the list, not in input order", () => {
    // Greedy-per-still in input order would give clip @40 to still @50.
    const items = [
      { id: "/ftp/cam_00_20261012111150.jpg", dtMs: at(50) },
      { id: "/ftp/cam_00_20261012111142.jpg", dtMs: at(42) },
      { id: "/ftp/cam_00_20261012111140.mp4", dtMs: at(40) },
    ];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, byId, byMs);
    expect(filtered.map((x) => x.id)).toEqual([
      "/ftp/cam_00_20261012111150.jpg",
      "/ftp/cam_00_20261012111140.mp4",
    ]);
    expect(pairedThumbs.get("/ftp/cam_00_20261012111140.mp4")).toBe(
      "/ftp/cam_00_20261012111142.jpg"
    );
  });

  it("breaks a tie toward the earlier clip", () => {
    const items = [
      { id: "/ftp/cam_00_20261012111142.mp4", dtMs: at(42) },
      { id: "/ftp/cam_00_20261012111140.jpg", dtMs: at(40) },
      { id: "/ftp/cam_00_20261012111138.mp4", dtMs: at(38) },
    ];
    const { pairedThumbs } = pairVideoThumbnails(items, byId, byMs);
    expect(pairedThumbs.get("/ftp/cam_00_20261012111138.mp4")).toBe(
      "/ftp/cam_00_20261012111140.jpg"
    );
    expect(pairedThumbs.has("/ftp/cam_00_20261012111142.mp4")).toBe(false);
  });

  it("runs after the stem pass: a stem-paired clip takes no second still", () => {
    const items = [
      { id: "/ftp/cam_00_20261012111139.mp4", dtMs: at(39) },
      { id: "/ftp/cam_00_20261012111139.jpg", dtMs: at(39) },
      { id: "/ftp/cam_00_20261012111141.jpg", dtMs: at(41) },
    ];
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, byId, byMs);
    expect(filtered.map((x) => x.id)).toEqual([
      "/ftp/cam_00_20261012111139.mp4",
      "/ftp/cam_00_20261012111141.jpg",
    ]);
    expect(pairedThumbs.get("/ftp/cam_00_20261012111139.mp4")).toBe(
      "/ftp/cam_00_20261012111139.jpg"
    );
  });

  it("pairs every clip in a long same-camera run (windowed scan)", () => {
    // 200 clips a minute apart, each with a still 2s in. Newest-first, the
    // way the gallery lists arrive, so the scan has to sort for itself.
    const items: TimedItem[] = [];
    for (let i = 0; i < 200; i++) {
      const sec = i * 60;
      items.push({ id: `/ftp/cam_00_${String(sec).padStart(6, "0")}.mp4`, dtMs: at(sec) });
      items.push({ id: `/ftp/cam_00_${String(sec + 2).padStart(6, "0")}.jpg`, dtMs: at(sec + 2) });
    }
    items.reverse();
    const { items: filtered, pairedThumbs } = pairVideoThumbnails(items, byId, byMs);
    expect(filtered).toHaveLength(200);
    expect(filtered.every((x) => x.id.endsWith(".mp4"))).toBe(true);
    expect(pairedThumbs.size).toBe(200);
    expect(pairedThumbs.get("/ftp/cam_00_006000.mp4")).toBe("/ftp/cam_00_006002.jpg");
  });

  it("works on media-source URIs, case-insensitively", () => {
    const items = [
      {
        id: "media-source://media_source/local/ftp/Moss garden_00_20261012111139.MP4",
        dtMs: at(39),
      },
      {
        id: "media-source://media_source/local/FTP/moss garden_00_20261012111141.jpg",
        dtMs: at(41),
      },
    ];
    const { pairedThumbs } = pairVideoThumbnails(items, byId, byMs);
    expect(pairedThumbs.get(items[0]!.id)).toBe(items[1]!.id);
  });
});

describe("pairMediaSourceThumbnails", () => {
  it("delegates to pairVideoThumbnails using the `id` accessor", () => {
    const items = [{ id: "x.mp4" }, { id: "x.jpg" }];
    const result = pairMediaSourceThumbnails(items);
    expect(result.items).toEqual([{ id: "x.mp4" }]);
    expect(result.pairedThumbs.get("x.mp4")).toBe("x.jpg");
  });

  it("survives nullish items in the array", () => {
    const items = [{ id: "x.mp4" }, null as unknown as { id: string }, { id: "x.jpg" }];
    const result = pairMediaSourceThumbnails(items);
    expect(result.items).toEqual([{ id: "x.mp4" }, null]);
    expect(result.pairedThumbs.get("x.mp4")).toBe("x.jpg");
  });

  it("falls back to `dtMs` proximity", () => {
    const items = [
      { id: "media-source://media_source/local/cam_00_20261012111139.mp4", dtMs: at(39) },
      { id: "media-source://media_source/local/cam_00_20261012111141.jpg", dtMs: at(41) },
    ];
    const result = pairMediaSourceThumbnails(items);
    expect(result.items).toEqual([items[0]]);
    expect(result.pairedThumbs.get(items[0]!.id)).toBe(items[1]!.id);
  });
});

describe("pairSensorItems", () => {
  it("delegates to pairVideoThumbnails using the `src` accessor", () => {
    const items = [{ src: "/clip.mp4" }, { src: "/clip.jpg" }];
    const result = pairSensorItems(items);
    expect(result.items).toEqual([{ src: "/clip.mp4" }]);
    expect(result.pairedThumbs.get("/clip.mp4")).toBe("/clip.jpg");
  });

  it("preserves extra fields on paired items (e.g. dtMs)", () => {
    const items = [{ src: "/a.mp4", dtMs: 1000 }, { src: "/a.jpg", dtMs: 1000 }, { src: "/b.mp4" }];
    const { items: filtered } = pairSensorItems(items);
    expect(filtered).toEqual([{ src: "/a.mp4", dtMs: 1000 }, { src: "/b.mp4" }]);
  });

  it("falls back to `dtMs` proximity", () => {
    const items = [
      { src: "/local/ftp/cam_00_20261012111141.jpg", dtMs: at(41) },
      { src: "/local/ftp/cam_00_20261012111139.mp4", dtMs: at(39) },
    ];
    const result = pairSensorItems(items);
    expect(result.items).toEqual([items[1]]);
    expect(result.pairedThumbs.get("/local/ftp/cam_00_20261012111139.mp4")).toBe(
      "/local/ftp/cam_00_20261012111141.jpg"
    );
  });
});

describe("dedupeByRelPath", () => {
  it("returns empty array for null/undefined input", () => {
    expect(dedupeByRelPath(null)).toEqual([]);
    expect(dedupeByRelPath(undefined)).toEqual([]);
  });

  it("dedupes string items by themselves", () => {
    const out = dedupeByRelPath(["/a.mp4", "/A.mp4", "/b.mp4"]);
    expect(out).toEqual(["/a.mp4", "/b.mp4"]);
  });

  it("first occurrence wins (source-priority preservation)", () => {
    const a1 = { src: "/foo.mp4", origin: "first" };
    const a2 = { src: "/foo.mp4", origin: "second" };
    const out = dedupeByRelPath([a1, a2]);
    expect(out).toEqual([a1]);
  });

  it("equates media-source://media_source/<path> with bare /<path>", () => {
    const out = dedupeByRelPath(["media-source://media_source/local/clip.mp4", "/local/clip.mp4"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe("media-source://media_source/local/clip.mp4");
  });

  it("equates media-source://media_source (no trailing slash) with empty path", () => {
    // Edge case from the legacy chain: the second `replace` (without the
    // trailing slash) catches inputs that the first one misses. The
    // consolidated regex still strips the prefix and the input normalises
    // to the empty string, which is dropped.
    const out = dedupeByRelPath(["media-source://media_source"]);
    expect(out).toEqual([]);
  });

  it("does NOT collapse other media-source roots into bare paths", () => {
    // The card intentionally treats `media-source://frigate/...` and
    // `media-source://media_source/...` as distinct sources — only the
    // local/upload root is normalised onto bare paths.
    const out = dedupeByRelPath(["media-source://other/local/clip.mp4", "/local/clip.mp4"]);
    expect(out).toHaveLength(2);
  });

  it("collapses repeated slashes in the comparison key", () => {
    const out = dedupeByRelPath(["media-source://media_source//foo/bar.mp4", "/foo/bar.mp4"]);
    expect(out).toHaveLength(1);
  });

  it("trims leading and trailing slashes from the comparison key", () => {
    const out = dedupeByRelPath(["/foo.mp4", "foo.mp4/", "foo.mp4"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe("/foo.mp4");
  });

  it("uses media_content_id over path/id/src on objects", () => {
    const a = {
      media_content_id: "media-source://media_source/foo.mp4",
      path: "/should-not-be-used",
    };
    const b = { src: "/foo.mp4" };
    const out = dedupeByRelPath([a, b]);
    expect(out).toEqual([a]);
  });

  it("falls through media_content_id → path → id → src", () => {
    const a = { path: "/clip.mp4" };
    const b = { id: "/clip.mp4" };
    const c = { src: "/clip.mp4" };
    const out = dedupeByRelPath([a, b, c]);
    expect(out).toEqual([a]);
  });

  it("drops items that produce an empty normalized key", () => {
    const out = dedupeByRelPath(["", "/", "//", "media-source://", "/real.mp4"]);
    expect(out).toEqual(["/real.mp4"]);
  });

  it("treats casing as equivalent (lowercased key)", () => {
    const out = dedupeByRelPath(["/Foo.MP4", "/foo.mp4"]);
    expect(out).toEqual(["/Foo.MP4"]);
  });

  it("preserves item identity (returns original references)", () => {
    const items = [{ src: "/a.mp4" }, { src: "/b.mp4" }];
    const out = dedupeByRelPath(items);
    expect(out[0]).toBe(items[0]);
    expect(out[1]).toBe(items[1]);
  });

  it("ignores nullish entries", () => {
    const out = dedupeByRelPath([null, undefined, "/a.mp4", null]);
    expect(out).toEqual(["/a.mp4"]);
  });
});
