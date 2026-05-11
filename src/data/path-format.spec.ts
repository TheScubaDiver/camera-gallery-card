import { describe, expect, it } from "vitest";

import {
  dayKeyFromFields,
  matchPathPrefixDepth,
  matchPathTail,
  mergeFields,
  parsePathFormat,
  pathTailSegments,
} from "./path-format";

describe("parsePathFormat — segment shape", () => {
  it("returns null for empty / whitespace input", () => {
    expect(parsePathFormat("")).toBeNull();
    expect(parsePathFormat("   ")).toBeNull();
    expect(parsePathFormat(undefined)).toBeNull();
    expect(parsePathFormat(null)).toBeNull();
  });

  it("trims and collapses slashes before splitting", () => {
    const fmt = parsePathFormat("//YYYY//MM/DD//");
    expect(fmt?.segments.length).toBe(3);
    expect(fmt?.segments.map((s) => s.raw)).toEqual(["YYYY", "MM", "DD"]);
  });

  it("layout A — single segment with extension", () => {
    const fmt = parsePathFormat("RLC_YYYYMMDD_HHmmss.mp4");
    expect(fmt).not.toBeNull();
    expect(fmt?.segments.length).toBe(1);
    expect(fmt?.directoryDepth).toBe(0);
    expect(fmt?.leafIsFile).toBe(true);
    expect(fmt?.leafHasExtension).toBe(true);
  });

  it("layout A — single segment without extension (legacy substring style)", () => {
    const fmt = parsePathFormat("YYYYMMDDHHmmss");
    expect(fmt?.directoryDepth).toBe(0);
    expect(fmt?.leafIsFile).toBe(true);
    expect(fmt?.leafHasExtension).toBe(false);
  });

  it("layout B — date folder + filename with time", () => {
    const fmt = parsePathFormat("YYYYMMDD/HHmmss");
    expect(fmt?.segments.length).toBe(2);
    expect(fmt?.directoryDepth).toBe(1);
    expect(fmt?.leafIsFile).toBe(true);
  });

  it("layout B variant — date folder, filename has no time tokens (leaf is dir of files)", () => {
    const fmt = parsePathFormat("YYYYMMDD");
    // single segment with only date tokens, no extension, no time tokens → directory leaf
    expect(fmt?.segments.length).toBe(1);
    expect(fmt?.directoryDepth).toBe(1);
    expect(fmt?.leafIsFile).toBe(false);
  });

  it("layout C — nested YYYY/MM/DD/HHmmss", () => {
    const fmt = parsePathFormat("YYYY/MM/DD/HHmmss");
    expect(fmt?.segments.length).toBe(4);
    expect(fmt?.directoryDepth).toBe(3);
    expect(fmt?.leafIsFile).toBe(true);
  });

  it("layout C with literal extension", () => {
    const fmt = parsePathFormat("YYYY/MM/DD/RLC-front_HHmmss.mp4");
    expect(fmt?.directoryDepth).toBe(3);
    expect(fmt?.leafHasExtension).toBe(true);
  });

  it("supports literal-only segment as a fixed prefix", () => {
    const fmt = parsePathFormat("cameras/YYYY/MM/DD");
    expect(fmt?.segments.length).toBe(4);
    expect(fmt?.directoryDepth).toBe(4);
    expect(fmt?.segments[0]?.fields).toEqual([]);
    expect(fmt?.segments[0]?.regex.test("cameras")).toBe(true);
    expect(fmt?.segments[0]?.regex.test("c")).toBe(false);
  });
});

describe("matchPathTail — full-path matching", () => {
  it("issue #99 layout — YYYY/MM/DD plus filename with time", () => {
    const fmt = parsePathFormat("YYYY/MM/DD/RLC-520A-front_00_YYYYMMDDHHmmss.mp4")!;
    const path =
      "media-source://media_source/local/Cams/Front/2026/04/30/RLC-520A-front_00_20260430131245.mp4";
    const fields = matchPathTail(path, fmt);
    expect(fields).toEqual({
      year: 2026,
      month: 4,
      day: 30,
      hour: 13,
      minute: 12,
      second: 45,
    });
  });

  it("layout A flat — full filename match with extension", () => {
    const fmt = parsePathFormat("RLC_YYYYMMDD_HHmmss.mp4")!;
    const fields = matchPathTail(
      "media-source://media_source/local/Cams/RLC_20260502_050106.mp4",
      fmt
    );
    expect(fields).toEqual({
      year: 2026,
      month: 5,
      day: 2,
      hour: 5,
      minute: 1,
      second: 6,
    });
  });

  it("layout A flat — substring match on filename when no extension", () => {
    const fmt = parsePathFormat("YYYYMMDDHHmmss")!;
    // The filename has a `_00_` prefix after the front_ token; the substring
    // regex must skip past it to find the 14-digit run.
    const fields = matchPathTail(
      "media-source://media_source/local/Cams/RLC-520A-front_00_20260502050106.mp4",
      fmt
    );
    expect(fields?.year).toBe(2026);
    expect(fields?.month).toBe(5);
    expect(fields?.day).toBe(2);
  });

  it("layout A flat — digit-boundary lookarounds reject digit-bleeding matches", () => {
    // 16 contiguous digits with no boundary: regex must NOT lock onto an
    // arbitrary 14-digit window inside the run. Without (?<!\d)/(?!\d) the
    // first 14 digits would yield year 0020 (rejected by build) — but for
    // longer runs that happen to start with a valid year the failure is
    // silent. Anchored boundaries fix that.
    const fmt = parsePathFormat("YYYYMMDDHHmmss")!;
    const fields = matchPathTail("/x/y/0020260502050106.mp4", fmt);
    expect(fields).toBeNull();
  });

  it("layout A flat — picks the leftmost properly-bounded run", () => {
    // Two boundary-flanked 14-digit runs. The regex picks the first.
    const fmt = parsePathFormat("YYYYMMDDHHmmss")!;
    const fields = matchPathTail("/x/cam_19991231235959_20260502050106.mp4", fmt);
    expect(fields?.year).toBe(1999);
    expect(fields?.day).toBe(31);
  });

  it("rejects when extension does not match the literal in the format", () => {
    const fmt = parsePathFormat("RLC_YYYYMMDD_HHmmss.mp4")!;
    const fields = matchPathTail(
      "media-source://media_source/local/Cams/RLC_20260502_050106.jpg",
      fmt
    );
    expect(fields).toBeNull();
  });

  it("rejects layout B when month folder doesn't match", () => {
    const fmt = parsePathFormat("YYYY/MM/DD/HHmmss")!;
    const fields = matchPathTail(
      "media-source://media_source/local/Cams/2026/notamonth/30/050106.mp4",
      fmt
    );
    expect(fields).toBeNull();
  });

  it("returns null when path is shorter than the format depth", () => {
    const fmt = parsePathFormat("YYYY/MM/DD/HHmmss")!;
    expect(matchPathTail("media-source://x/y/z", fmt)).toBeNull();
  });

  it("plain (non-URI) path also works (sensor-mode src shape)", () => {
    const fmt = parsePathFormat("YYYY/MM/DD/RLC_YYYYMMDDHHmmss.mp4")!;
    const fields = matchPathTail("/local/cams/2026/04/30/RLC_20260430120030.mp4", fmt);
    expect(fields?.year).toBe(2026);
    expect(fields?.day).toBe(30);
    expect(fields?.hour).toBe(12);
  });
});

describe("matchPathPrefixDepth — per-segment matching for the calendar walker", () => {
  it("matches the year segment at depth 0", () => {
    const fmt = parsePathFormat("YYYY/MM/DD/HHmmss")!;
    expect(matchPathPrefixDepth("2026", fmt, 0)).toEqual({ year: 2026 });
    expect(matchPathPrefixDepth("notayear", fmt, 0)).toBeNull();
  });

  it("rejects depth out of range", () => {
    const fmt = parsePathFormat("YYYY/MM")!;
    expect(matchPathPrefixDepth("2026", fmt, -1)).toBeNull();
    expect(matchPathPrefixDepth("2026", fmt, 5)).toBeNull();
  });

  it("rejects a year string that's not exactly 4 digits at the year-segment", () => {
    const fmt = parsePathFormat("YYYY/MM/DD")!;
    expect(matchPathPrefixDepth("202", fmt, 0)).toBeNull();
    expect(matchPathPrefixDepth("20260", fmt, 0)).toBeNull();
  });
});

describe("dayKeyFromFields — pure assembly + calendar validation", () => {
  it("assembles a normal day", () => {
    expect(dayKeyFromFields({ year: 2026, month: 4, day: 30 })).toBe("2026-04-30");
  });

  it("zero-pads months and days", () => {
    expect(dayKeyFromFields({ year: 2024, month: 1, day: 5 })).toBe("2024-01-05");
  });

  it("rejects Feb 31", () => {
    expect(dayKeyFromFields({ year: 2024, month: 2, day: 31 })).toBeNull();
  });

  it("rejects non-leap Feb 29", () => {
    expect(dayKeyFromFields({ year: 2023, month: 2, day: 29 })).toBeNull();
  });

  it("accepts leap Feb 29", () => {
    expect(dayKeyFromFields({ year: 2024, month: 2, day: 29 })).toBe("2024-02-29");
  });

  it("returns null on partial fields", () => {
    expect(dayKeyFromFields({ year: 2026, month: 4 })).toBeNull();
    expect(dayKeyFromFields({})).toBeNull();
  });
});

describe("mergeFields", () => {
  it("merges in order — later wins", () => {
    expect(mergeFields({ year: 2026 }, { month: 4 }, { day: 30, year: 2025 })).toEqual({
      year: 2025,
      month: 4,
      day: 30,
    });
  });

  it("returns empty object on no inputs", () => {
    expect(mergeFields()).toEqual({});
  });
});

describe("pathTailSegments", () => {
  it("strips media-source:// prefix", () => {
    expect(pathTailSegments("media-source://media_source/local/cam/2026/04/30/x.mp4", 4)).toEqual([
      "2026",
      "04",
      "30",
      "x.mp4",
    ]);
  });

  it("returns the last n segments", () => {
    expect(pathTailSegments("/a/b/c/d", 2)).toEqual(["c", "d"]);
  });

  it("returns all segments if n exceeds path length", () => {
    expect(pathTailSegments("/a/b", 5)).toEqual(["a", "b"]);
  });
});
