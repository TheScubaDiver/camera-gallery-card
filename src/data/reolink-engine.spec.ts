import { describe, expect, it } from "vitest";

import {
  discoverReolink,
  isReolinkRoot,
  loadReolinkDay,
  normalizeReolinkRoot,
  parseDayTitle,
  parseFileTitle,
  type BrowseFn,
} from "./reolink-engine";
import type { MediaSourceItem } from "../types/media-source";

const folder = (id: string, title: string, children?: MediaSourceItem[]): MediaSourceItem => ({
  media_content_id: id,
  title,
  media_class: "channel",
  media_content_type: "playlist",
  can_play: false,
  can_expand: true,
  thumbnail: null,
  children_media_class: "video",
  ...(children ? { children } : {}),
});

const file = (id: string, title: string): MediaSourceItem => ({
  media_content_id: id,
  title,
  media_class: "video",
  media_content_type: "video",
  can_play: true,
  can_expand: false,
  thumbnail: null,
  children_media_class: null,
});

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

describe("isReolinkRoot", () => {
  it("matches every Reolink URI shape", () => {
    expect(isReolinkRoot("media-source://reolink/CAM|abc|0")).toBe(true);
    expect(isReolinkRoot("media-source://reolink/RES|abc|0|main")).toBe(true);
    expect(isReolinkRoot("media-source://reolink/DAY|abc|0|main|2026|4|9")).toBe(true);
    expect(isReolinkRoot("media-source://reolink/FILE|abc|x.mp4|...|...")).toBe(true);
  });

  it("rejects non-Reolink sources", () => {
    expect(isReolinkRoot("media-source://media_source/local/cam")).toBe(false);
    expect(isReolinkRoot("media-source://frigate/main/event")).toBe(false);
    expect(isReolinkRoot("")).toBe(false);
    expect(isReolinkRoot(null)).toBe(false);
    expect(isReolinkRoot(undefined)).toBe(false);
  });
});

describe("normalizeReolinkRoot", () => {
  it("promotes a CAM URI to RES on the main stream", () => {
    expect(normalizeReolinkRoot("media-source://reolink/CAM|01JABC|0")).toBe(
      "media-source://reolink/RES|01JABC|0|main"
    );
  });

  it("passes through explicit RES URIs unchanged (main or sub)", () => {
    expect(normalizeReolinkRoot("media-source://reolink/RES|01JABC|0|main")).toBe(
      "media-source://reolink/RES|01JABC|0|main"
    );
    // A user who hand-wrote RES|sub keeps the sub stream.
    expect(normalizeReolinkRoot("media-source://reolink/RES|01JABC|0|sub")).toBe(
      "media-source://reolink/RES|01JABC|0|sub"
    );
  });

  it("returns null for non-Reolink input", () => {
    expect(normalizeReolinkRoot("media-source://other/x")).toBeNull();
    expect(normalizeReolinkRoot("not a uri")).toBeNull();
  });
});

describe("parseDayTitle", () => {
  it("accepts unpadded month and day", () => {
    expect(parseDayTitle("2026/4/9")).toEqual({ year: 2026, month: 4, day: 9 });
    expect(parseDayTitle("2026/12/31")).toEqual({ year: 2026, month: 12, day: 31 });
  });

  it("accepts zero-padded month and day", () => {
    expect(parseDayTitle("2026/04/09")).toEqual({ year: 2026, month: 4, day: 9 });
  });

  it("rejects invalid calendar dates", () => {
    expect(parseDayTitle("2026/13/1")).toBeNull(); // month > 12
    expect(parseDayTitle("2026/2/30")).toBeNull(); // Feb 30
    expect(parseDayTitle("2026/0/9")).toBeNull(); // month 0
  });

  it("rejects malformed shapes", () => {
    expect(parseDayTitle("Deurbel 2026/4/9")).toBeNull(); // prefix
    expect(parseDayTitle("2026-04-09")).toBeNull(); // dashes
    expect(parseDayTitle("")).toBeNull();
  });
});

describe("parseFileTitle", () => {
  it("extracts HH:mm:ss from a typical Reolink title", () => {
    const r = parseFileTitle("14:24:00 0:01:08 Motion Person Doorbell");
    expect(r).toEqual({ hour: 14, minute: 24, second: 0 });
  });

  it("extracts time from a bare timestamp title (no tail)", () => {
    expect(parseFileTitle("09:42:15")).toEqual({ hour: 9, minute: 42, second: 15 });
  });

  it("returns null on malformed input", () => {
    expect(parseFileTitle("")).toBeNull();
    expect(parseFileTitle("not a clip title")).toBeNull();
  });
});

describe("discoverReolink — Phase A", () => {
  const RES = "media-source://reolink/RES|01JABC|0|main";
  const tree: Record<string, MediaSourceItem> = {
    [RES]: folder(RES, "High res.", [
      folder("media-source://reolink/DAY|01JABC|0|main|2026|5|17", "2026/5/17"),
      folder("media-source://reolink/DAY|01JABC|0|main|2026|5|16", "2026/5/16"),
      folder("media-source://reolink/DAY|01JABC|0|main|2026|4|9", "2026/4/9"),
      // non-matching sibling — should be skipped silently
      folder("media-source://reolink/RECENT|01JABC|0", "Recent"),
    ]),
  };

  it("returns one day entry per matched child", async () => {
    const { browse } = makeBrowse(tree);
    const cal = await discoverReolink([RES], browse);
    expect(cal.days).toEqual(["2026-05-17", "2026-05-16", "2026-04-09"]);
    expect(cal.byDay.get("2026-04-09")?.[0]?.leafId).toBe(
      "media-source://reolink/DAY|01JABC|0|main|2026|4|9"
    );
  });

  it("auto-promotes a CAM root to RES on the main stream", async () => {
    const camTree: Record<string, MediaSourceItem> = {
      "media-source://reolink/RES|01JABC|0|main": folder(
        "media-source://reolink/RES|01JABC|0|main",
        "High res.",
        [folder("media-source://reolink/DAY|01JABC|0|main|2026|5|17", "2026/5/17")]
      ),
    };
    const { browse, browsedIds } = makeBrowse(camTree);
    const cal = await discoverReolink(["media-source://reolink/CAM|01JABC|0"], browse);
    expect(cal.days).toEqual(["2026-05-17"]);
    expect(browsedIds).toContain("media-source://reolink/RES|01JABC|0|main");
  });

  it("skips non-Reolink roots silently", async () => {
    const { browse, browsedIds } = makeBrowse({});
    const cal = await discoverReolink(["media-source://other/x"], browse);
    expect(cal.days).toEqual([]);
    expect(browsedIds).toEqual([]);
  });
});

describe("loadReolinkDay — Phase B", () => {
  const RES = "media-source://reolink/RES|01JABC|0|main";
  const DAY = "media-source://reolink/DAY|01JABC|0|main|2026|4|9";
  const tree: Record<string, MediaSourceItem> = {
    [RES]: folder(RES, "High res.", [folder(DAY, "2026/4/9", [])]),
    [DAY]: folder(DAY, "2026/4/9", [
      file(
        "media-source://reolink/FILE|01JABC|recA.mp4|20260409142400|20260409142508",
        "14:24:00 0:01:08 Motion Doorbell"
      ),
      file(
        "media-source://reolink/FILE|01JABC|recB.mp4|20260409094215|20260409094240",
        "09:42:15 0:00:25 Motion Person"
      ),
    ]),
  };

  it("combines parent dayKey with file title time to a full dtMs", async () => {
    const { browse } = makeBrowse(tree);
    const cal = await discoverReolink([RES], browse);
    const items = await loadReolinkDay(cal, "2026-04-09", browse);
    expect(items.length).toBe(2);
    const earliest = items.find((i) => i.id.includes("recB"));
    expect(earliest?.dtMs).toBe(new Date(2026, 3, 9, 9, 42, 15).getTime());
    const latest = items.find((i) => i.id.includes("recA"));
    expect(latest?.dtMs).toBe(new Date(2026, 3, 9, 14, 24, 0).getTime());
  });

  it("sorts items newest-first within the day", async () => {
    const { browse } = makeBrowse(tree);
    const cal = await discoverReolink([RES], browse);
    const items = await loadReolinkDay(cal, "2026-04-09", browse);
    expect(items[0]?.id).toContain("recA"); // 14:24 > 09:42
    expect(items[1]?.id).toContain("recB");
  });

  it("returns [] for a dayKey not in the calendar", async () => {
    const { browse } = makeBrowse(tree);
    const cal = await discoverReolink([RES], browse);
    expect(await loadReolinkDay(cal, "1999-01-01", browse)).toEqual([]);
  });
});
