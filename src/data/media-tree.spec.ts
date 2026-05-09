import { describe, expect, it, vi } from "vitest";

import { discoverTree, loadDay, type BrowseFn } from "./media-tree";
import { parsePathFormat } from "./path-format";
import type { MediaSourceItem } from "../types/media-source";

/** Tiny helper to build a `MediaSourceItem` skeleton. */
const folder = (id: string, title: string, children?: MediaSourceItem[]): MediaSourceItem => ({
  media_content_id: id,
  title,
  media_class: "directory",
  media_content_type: "",
  can_play: false,
  can_expand: true,
  thumbnail: null,
  children_media_class: null,
  ...(children ? { children } : {}),
});

const file = (id: string, title: string, type = "video/mp4"): MediaSourceItem => {
  const isVideo = type.startsWith("video/");
  const isImage = type.startsWith("image/");
  return {
    media_content_id: id,
    title,
    media_class: isVideo ? "video" : isImage ? "image" : "url",
    media_content_type: type,
    can_play: isVideo || isImage,
    can_expand: false,
    thumbnail: null,
    children_media_class: null,
  };
};

/** Build an in-memory tree-backed browse function. Records which IDs were browsed. */
function makeBrowse(tree: Record<string, MediaSourceItem>): {
  browse: BrowseFn;
  browsedIds: string[];
} {
  const browsedIds: string[] = [];
  const browse: BrowseFn = async (id) => {
    browsedIds.push(id);
    return tree[id] ?? null;
  };
  return { browse, browsedIds };
}

describe("discoverTree — Layout A (flat folder)", () => {
  const fmt = parsePathFormat("RLC_YYYYMMDD_HHmmss.mp4")!;
  const ROOT = "media-source://media_source/local/Cams";
  const tree: Record<string, MediaSourceItem> = {
    [ROOT]: folder(ROOT, "Cams", [
      file(`${ROOT}/RLC_20260502_050106.mp4`, "RLC_20260502_050106.mp4"),
      file(`${ROOT}/RLC_20260502_120000.mp4`, "RLC_20260502_120000.mp4"),
      file(`${ROOT}/RLC_20260501_080000.mp4`, "RLC_20260501_080000.mp4"),
      file(`${ROOT}/junk_no_date.txt`, "junk_no_date.txt", "text/plain"), // unrenderable
      file(`${ROOT}/RLC_no_match.mp4`, "RLC_no_match.mp4"), // renderable but format-mismatch
    ]),
  };

  it("eagerly returns all renderable items in one browse", async () => {
    const { browse, browsedIds } = makeBrowse(tree);
    const result = await discoverTree([ROOT], fmt, browse);
    expect(result.isLazy).toBe(false);
    expect(browsedIds).toEqual([ROOT]);
    // 4 renderable; the .txt is filtered out
    expect(result.eagerItems.length).toBe(4);
  });

  it("buckets items by dayKey via the format", async () => {
    const { browse } = makeBrowse(tree);
    const result = await discoverTree([ROOT], fmt, browse);
    expect(Array.from(result.calendar.byDay.keys()).sort()).toEqual(["2026-05-01", "2026-05-02"]);
    expect(result.calendar.days).toEqual(["2026-05-02", "2026-05-01"]);
  });

  it("attaches dtMs to format-matching items", async () => {
    const { browse } = makeBrowse(tree);
    const result = await discoverTree([ROOT], fmt, browse);
    const may2morning = result.eagerItems.find((item) => item.id.endsWith("050106.mp4"));
    expect(may2morning?.dtMs).toBe(new Date(2026, 4, 2, 5, 1, 6).getTime());
  });

  it("includes unmatched items but without dtMs", async () => {
    const { browse } = makeBrowse(tree);
    const result = await discoverTree([ROOT], fmt, browse);
    const noMatch = result.eagerItems.find((item) => item.id.endsWith("no_match.mp4"));
    expect(noMatch).toBeDefined();
    expect(noMatch?.dtMs).toBeUndefined();
  });

  it("dedupes calendar entries per (root, dayKey) regardless of file count", async () => {
    // Hundreds of files on the same day should produce ONE calendar entry.
    const FAT_ROOT = "media-source://x/Fat";
    const filesOnSameDay = Array.from({ length: 50 }, (_, i) =>
      file(`${FAT_ROOT}/RLC_20260502_${String(i).padStart(6, "0")}.mp4`, `RLC_20260502_${i}.mp4`)
    );
    const fatTree: Record<string, MediaSourceItem> = {
      [FAT_ROOT]: folder(FAT_ROOT, "Fat", filesOnSameDay),
    };
    const { browse } = makeBrowse(fatTree);
    const result = await discoverTree([FAT_ROOT], fmt, browse);
    expect(result.eagerItems.length).toBe(50);
    expect(result.calendar.byDay.get("2026-05-02")?.length).toBe(1);
  });
});

describe("discoverTree — Layout C (nested YYYY/MM/DD)", () => {
  const fmt = parsePathFormat("YYYY/MM/DD/RLC_YYYYMMDDHHmmss.mp4")!;
  const ROOT = "media-source://x/Cams";

  // Issue #99 reproducer shape: 2 months, multiple days each.
  const tree: Record<string, MediaSourceItem> = {
    [ROOT]: folder(ROOT, "Cams", [
      folder(`${ROOT}/2026`, "2026", []),
      folder(`${ROOT}/_thumbs`, "_thumbs", []), // non-matching sibling
    ]),
    [`${ROOT}/2026`]: folder(`${ROOT}/2026`, "2026", [
      folder(`${ROOT}/2026/04`, "04", []),
      folder(`${ROOT}/2026/05`, "05", []),
    ]),
    [`${ROOT}/2026/04`]: folder(`${ROOT}/2026/04`, "04", [
      folder(`${ROOT}/2026/04/28`, "28", []),
      folder(`${ROOT}/2026/04/29`, "29", []),
      folder(`${ROOT}/2026/04/30`, "30", []),
    ]),
    [`${ROOT}/2026/05`]: folder(`${ROOT}/2026/05`, "05", [
      folder(`${ROOT}/2026/05/01`, "01", []),
      folder(`${ROOT}/2026/05/02`, "02", []),
    ]),
  };

  it("discovers all days across both months without browsing day folders", async () => {
    const { browse, browsedIds } = makeBrowse(tree);
    const result = await discoverTree([ROOT], fmt, browse);
    expect(result.isLazy).toBe(true);
    expect(result.calendar.days).toEqual([
      "2026-05-02",
      "2026-05-01",
      "2026-04-30",
      "2026-04-29",
      "2026-04-28",
    ]);
    // Browsed: root, 2026, 2026/04, 2026/05. NOT any /XX day folder.
    expect(browsedIds.sort()).toEqual(
      [ROOT, `${ROOT}/2026`, `${ROOT}/2026/04`, `${ROOT}/2026/05`].sort()
    );
    // Day folders are 3 path-levels deep under root: `<ROOT>/<YYYY>/<MM>/<DD>`.
    // Assert no such ids were browsed.
    const dayPath = new RegExp(`^${ROOT.replace(/[/.]/g, "\\$&")}\\/\\d{4}\\/\\d{2}\\/\\d{2}$`);
    expect(browsedIds.some((id) => dayPath.test(id))).toBe(false);
  });

  it("skips non-matching sibling directories (_thumbs)", async () => {
    const { browse, browsedIds } = makeBrowse(tree);
    await discoverTree([ROOT], fmt, browse);
    expect(browsedIds.includes(`${ROOT}/_thumbs`)).toBe(false);
  });

  it("calendar.byDay maps each day to its leaf-dir media id", async () => {
    const { browse } = makeBrowse(tree);
    const result = await discoverTree([ROOT], fmt, browse);
    expect(result.calendar.byDay.get("2026-04-30")?.[0]?.leafId).toBe(`${ROOT}/2026/04/30`);
    expect(result.calendar.byDay.get("2026-05-01")?.[0]?.leafId).toBe(`${ROOT}/2026/05/01`);
  });

  it("returns no eager items in lazy mode", async () => {
    const { browse } = makeBrowse(tree);
    const result = await discoverTree([ROOT], fmt, browse);
    expect(result.eagerItems).toEqual([]);
  });
});

describe("loadDay — Phase B browse-on-demand", () => {
  const fmt = parsePathFormat("YYYY/MM/DD/RLC_YYYYMMDDHHmmss.mp4")!;
  const ROOT = "media-source://x/Cams";

  const tree: Record<string, MediaSourceItem> = {
    [ROOT]: folder(ROOT, "Cams", [folder(`${ROOT}/2026`, "2026", [])]),
    [`${ROOT}/2026`]: folder(`${ROOT}/2026`, "2026", [folder(`${ROOT}/2026/04`, "04", [])]),
    [`${ROOT}/2026/04`]: folder(`${ROOT}/2026/04`, "04", [folder(`${ROOT}/2026/04/30`, "30", [])]),
    [`${ROOT}/2026/04/30`]: folder(`${ROOT}/2026/04/30`, "30", [
      file(`${ROOT}/2026/04/30/RLC_20260430131245.mp4`, "RLC_20260430131245.mp4"),
      file(`${ROOT}/2026/04/30/RLC_20260430160000.mp4`, "RLC_20260430160000.mp4"),
    ]),
  };

  it("browses only the day-leaf and returns its files with dtMs attached", async () => {
    const { browse, browsedIds } = makeBrowse(tree);
    const discovery = await discoverTree([ROOT], fmt, browse);
    browsedIds.length = 0; // reset

    const items = await loadDay(discovery.calendar, "2026-04-30", fmt, browse);
    expect(browsedIds).toEqual([`${ROOT}/2026/04/30`]);
    expect(items.length).toBe(2);
    const first = items.find((i) => i.id.endsWith("131245.mp4"));
    expect(first?.dtMs).toBe(new Date(2026, 3, 30, 13, 12, 45).getTime());
  });

  it("returns [] for a dayKey that's not in the calendar", async () => {
    const { browse } = makeBrowse(tree);
    const discovery = await discoverTree([ROOT], fmt, browse);
    expect(await loadDay(discovery.calendar, "1999-01-01", fmt, browse)).toEqual([]);
  });
});

describe("Cancellation — isStale aborts mid-walk", () => {
  it("returns early when isStale becomes true between browse rounds", async () => {
    const fmt = parsePathFormat("YYYY/MM/DD/HHmmss")!;
    const ROOT = "media-source://x/Cams";
    const tree: Record<string, MediaSourceItem> = {
      [ROOT]: folder(ROOT, "Cams", [folder(`${ROOT}/2026`, "2026", [])]),
      [`${ROOT}/2026`]: folder(`${ROOT}/2026`, "2026", [folder(`${ROOT}/2026/04`, "04", [])]),
    };
    const { browse, browsedIds } = makeBrowse(tree);

    const isStale = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const result = await discoverTree([ROOT], fmt, browse, { isStale });
    expect(result.calendar.days.length).toBe(0);
    // Walked at least one level, then bailed.
    expect(browsedIds.length).toBeGreaterThan(0);
  });
});
