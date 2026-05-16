import { describe, expect, it } from "vitest";

import {
  buildFilenameDateRegex,
  dayKeyFromMs,
  dtKeyFromMs,
  dtMsFromSrc,
  extractDateTimeKey,
  extractDayKey,
  parseRawDateFields,
  uniqueDays,
} from "./datetime-parsing";
import type { DatetimeOptions } from "./datetime-parsing";

const opts = (pathFormat = ""): DatetimeOptions => ({ pathFormat });

describe("Null contract — no path_datetime_format means no date", () => {
  it("dtMsFromSrc returns null when pathFormat is empty", () => {
    expect(dtMsFromSrc("camera_2024-01-15_12-30-45.jpg", opts(""))).toBeNull();
  });

  it("extractDayKey returns null when pathFormat is empty", () => {
    expect(extractDayKey("20240115_123045.jpg", opts(""))).toBeNull();
  });

  it("extractDateTimeKey returns null when pathFormat is empty", () => {
    expect(extractDateTimeKey("some_1700000000_file.jpg", opts(""))).toBeNull();
  });

  it("returns null when the format compiles but doesn't match the path", () => {
    expect(dtMsFromSrc("garbage", opts("YYYY/MM/DD/HHmmss"))).toBeNull();
  });
});

describe("Bounds-checked regex match access", () => {
  it("parseRawDateFields returns null on no-match", () => {
    expect(parseRawDateFields("garbage", "YYYY-MM-DD")).toBeNull();
  });

  it("parseRawDateFields returns partial fields when format is partial", () => {
    const result = parseRawDateFields("2024-01-15", "YYYY-MM-DD");
    expect(result).toEqual({ year: 2024, month: 1, day: 15 });
  });

  it("parseRawDateFields returns null on empty inputs", () => {
    expect(parseRawDateFields("", "YYYY-MM-DD")).toBeNull();
    expect(parseRawDateFields("2024-01-15", "")).toBeNull();
  });

  it("buildFilenameDateRegex returns null on format with no tokens", () => {
    expect(buildFilenameDateRegex("just-a-string")).toBeNull();
    expect(buildFilenameDateRegex("")).toBeNull();
  });

  it("buildFilenameDateRegex compiles a known format", () => {
    const built = buildFilenameDateRegex("YYYY-MM-DD_HH:mm:ss");
    expect(built).not.toBeNull();
    expect(built?.fields).toEqual(["year", "month", "day", "hour", "minute", "second"]);
    expect(built?.regex.test("2024-01-15_12:30:45")).toBe(true);
  });
});

describe("Local-time round-trip invariant", () => {
  it("round-trip ms → dtKey → ms returns the same instant", () => {
    const ms = new Date(2024, 0, 15, 12, 30, 45).getTime();
    const dtKey = dtKeyFromMs(ms);
    expect(dtKey).not.toBeNull();
    const back = new Date(dtKey ?? "").getTime();
    expect(back).toBe(ms);
  });

  it("round-trip ms → dayKey → start-of-day ms aligns with local midnight", () => {
    const ms = new Date(2024, 0, 15, 12, 30, 45).getTime();
    const dk = dayKeyFromMs(ms);
    expect(dk).not.toBeNull();
    const startOfDay = new Date(`${dk}T00:00:00`).getTime();
    const expected = new Date(2024, 0, 15, 0, 0, 0).getTime();
    expect(startOfDay).toBe(expected);
  });

  it("dayKey is consistent across multiple ms within the same local day", () => {
    const morning = new Date(2024, 5, 1, 6, 0, 0).getTime();
    const evening = new Date(2024, 5, 1, 22, 0, 0).getTime();
    expect(dayKeyFromMs(morning)).toBe(dayKeyFromMs(evening));
  });

  it("dtKeyFromMs returns null on non-finite ms", () => {
    expect(dtKeyFromMs(NaN)).toBeNull();
    expect(dayKeyFromMs(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("Calendar correctness", () => {
  it("rejects Feb 31 from a path-format match", () => {
    expect(dtMsFromSrc("/cam/2024-02-31/clip.mp4", opts("YYYY-MM-DD"))).toBeNull();
  });

  it("rejects Feb 29 in a non-leap year", () => {
    expect(dtMsFromSrc("/cam/2023-02-29/clip.mp4", opts("YYYY-MM-DD"))).toBeNull();
  });

  it("accepts Feb 29 in a leap year", () => {
    const r = dtMsFromSrc("/cam/2024-02-29/clip.mp4", opts("YYYY-MM-DD"));
    expect(r).toBe(new Date(2024, 1, 29, 0, 0, 0).getTime());
  });
});

describe("Three layouts via path_datetime_format", () => {
  it("layout A — flat folder, full filename match with extension", () => {
    expect(
      extractDateTimeKey("/local/cam/RLC_20260502_050106.mp4", opts("RLC_YYYYMMDD_HHmmss.mp4"))
    ).toBe("2026-05-02T05:01:06");
  });

  it("layout A — substring filename match (issue #99 user's filename shape)", () => {
    expect(
      extractDateTimeKey("/local/cam/RLC-520A-front_00_20260502050106.mp4", opts("YYYYMMDDHHmmss"))
    ).toBe("2026-05-02T05:01:06");
  });

  it("layout B — date folder + time-named file", () => {
    expect(extractDayKey("/local/cam/20260502/120030.mp4", opts("YYYYMMDD/HHmmss"))).toBe(
      "2026-05-02"
    );
  });

  it("layout C — nested YYYY/MM/DD plus filename with time (issue #99 reproducer)", () => {
    const ms = dtMsFromSrc(
      "media-source://media_source/local/Cams/Front/2026/04/30/RLC-520A-front_00_20260430131245.mp4",
      opts("YYYY/MM/DD/RLC-520A-front_00_YYYYMMDDHHmmss.mp4")
    );
    expect(ms).toBe(new Date(2026, 3, 30, 13, 12, 45).getTime());
  });

  it("layout C with substring leaf — only date folders carry structure", () => {
    expect(
      extractDayKey(
        "media-source://media_source/local/Cams/Front/2026/04/30/anything.mp4",
        opts("YYYY/MM/DD")
      )
    ).toBe("2026-04-30");
  });
});

describe("Unix epoch tokens (X / x)", () => {
  it("X — single 10-digit Unix-seconds filename decodes to local time", () => {
    // 1706108297 = 2024-01-24T14:18:17Z. Pick a fixed instant and assert
    // the local-time round-trip is identity.
    const ms = 1706108297 * 1000;
    const expected = new Date(ms);
    const result = extractDateTimeKey("/media/tapo/1706108297.mp4", opts("X"));
    expect(result).not.toBeNull();
    // Round-trip via new Date(dtKey) returns the original ms.
    const back = new Date(result ?? "").getTime();
    expect(back).toBe(expected.getTime());
  });

  it("X-X — Tapo-style start-end range pins canonical time to the start", () => {
    // start=1706108297, end=1706108310 — should yield the start's ms.
    const startMs = 1706108297 * 1000;
    const ms = dtMsFromSrc("/media/tapo/1706108297-1706108310.mp4", opts("X-X"));
    expect(ms).toBe(startMs);
  });

  it("x — UniFi Protect-style 13-digit milliseconds epoch decodes correctly", () => {
    // Sub-second precision is dropped: we decode through year/month/day/hour/
    // minute/second fields, which has no slot for ms. That's fine for sort and
    // day-grouping — surveillance files don't need ms resolution.
    const epochMs = 1642402659065;
    const expectedMs = epochMs - (epochMs % 1000);
    const ms = dtMsFromSrc(
      "media-source://unifi/B4FBE47EEF30_0_rotating_1642402659065.ubv",
      opts("x")
    );
    expect(ms).toBe(expectedMs);
  });

  it("first-wins for duplicate calendar tokens (Reolink SD card range)", () => {
    // cam_20240315083000_20240315083127.mp4 — start vs end same day, different
    // minutes. With first-wins the result is the start.
    const ms = dtMsFromSrc(
      "/media/reolink/cam_20240315083000_20240315083127.mp4",
      opts("YYYYMMDDHHmmss_YYYYMMDDHHmmss")
    );
    expect(ms).toBe(new Date(2024, 2, 15, 8, 30, 0).getTime());
  });

  it("rejects non-finite or impossible epoch values gracefully", () => {
    // `X` requires exactly 10 digits. A 9-digit run shouldn't match.
    expect(dtMsFromSrc("/media/tapo/170610829.mp4", opts("X"))).toBeNull();
  });
});

describe("Format string is cached on repeated calls", () => {
  it("repeated calls return the same result without recompiling", () => {
    const fmt = "YYYY/MM/DD/HHmmss";
    const a = dtMsFromSrc("/x/2026/01/15/120030.mp4", opts(fmt));
    const b = dtMsFromSrc("/x/2026/01/15/120030.mp4", opts(fmt));
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });
});

describe("uniqueDays", () => {
  it("returns distinct dayKeys sorted newest-first", () => {
    expect(
      uniqueDays([
        { dayKey: "2026-01-15" },
        { dayKey: "2026-01-17" },
        { dayKey: "2026-01-15" },
        { dayKey: "2025-12-31" },
      ])
    ).toEqual(["2026-01-17", "2026-01-15", "2025-12-31"]);
  });

  it("skips items without a dayKey", () => {
    expect(uniqueDays([{ dayKey: "2026-04-29" }, { dayKey: null }, { dayKey: "" }, {}])).toEqual([
      "2026-04-29",
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(uniqueDays([])).toEqual([]);
  });
});
