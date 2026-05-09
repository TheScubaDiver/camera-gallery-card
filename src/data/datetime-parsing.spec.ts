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
