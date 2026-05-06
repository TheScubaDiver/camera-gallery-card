import { describe, expect, it } from "vitest";

import {
  dedupeByRelPath,
  pairMediaSourceThumbnails,
  pairSensorItems,
  pairVideoThumbnails,
} from "./pairing";

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
