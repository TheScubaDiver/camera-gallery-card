import { describe, expect, it } from "vitest";

import { circularNav, nextInList, prevInList, stepDay } from "./navigation";

describe("stepDay", () => {
  const days = ["2026-05-12", "2026-05-11", "2026-05-10"];

  it("returns null on empty days", () => {
    expect(stepDay("2026-05-12", 1, [])).toBeNull();
    expect(stepDay(null, -1, [])).toBeNull();
  });

  it("treats null active day as first element", () => {
    expect(stepDay(null, 1, days)).toBe("2026-05-11");
    expect(stepDay(null, -1, days)).toBe("2026-05-12");
  });

  it("treats out-of-set active day as first element", () => {
    expect(stepDay("2099-01-01", 1, days)).toBe("2026-05-11");
  });

  it("steps forward (toward older days for descending input)", () => {
    expect(stepDay("2026-05-12", 1, days)).toBe("2026-05-11");
    expect(stepDay("2026-05-11", 1, days)).toBe("2026-05-10");
  });

  it("steps backward (toward newer days)", () => {
    expect(stepDay("2026-05-10", -1, days)).toBe("2026-05-11");
    expect(stepDay("2026-05-11", -1, days)).toBe("2026-05-12");
  });

  it("clamps at the end (no wrap)", () => {
    expect(stepDay("2026-05-10", 1, days)).toBe("2026-05-10");
    expect(stepDay("2026-05-12", -1, days)).toBe("2026-05-12");
  });

  it("clamps with single-element days", () => {
    expect(stepDay("2026-05-12", 1, ["2026-05-12"])).toBe("2026-05-12");
    expect(stepDay("2026-05-12", -1, ["2026-05-12"])).toBe("2026-05-12");
  });
});

describe("circularNav", () => {
  it("returns current when length is zero or negative", () => {
    expect(circularNav(0, 1, 0)).toBe(0);
    expect(circularNav(2, -1, 0)).toBe(2);
    expect(circularNav(0, 1, -3)).toBe(0);
  });

  it("wraps forward past the end", () => {
    expect(circularNav(2, 1, 3)).toBe(0);
    expect(circularNav(2, 2, 3)).toBe(1);
  });

  it("wraps backward past zero", () => {
    expect(circularNav(0, -1, 3)).toBe(2);
    expect(circularNav(0, -4, 3)).toBe(2);
  });

  it("handles deltas larger than length", () => {
    expect(circularNav(0, 5, 3)).toBe(2);
    expect(circularNav(1, -7, 3)).toBe(0);
  });

  it("is a no-op with delta 0", () => {
    expect(circularNav(1, 0, 3)).toBe(1);
  });
});

describe("nextInList", () => {
  it("returns null at end", () => {
    expect(nextInList(2, 3)).toBeNull();
  });

  it("returns next index in middle", () => {
    expect(nextInList(0, 3)).toBe(1);
    expect(nextInList(1, 3)).toBe(2);
  });

  it("treats null/undefined as 0", () => {
    expect(nextInList(null, 3)).toBe(1);
    expect(nextInList(undefined, 3)).toBe(1);
  });

  it("returns null on empty list", () => {
    expect(nextInList(0, 0)).toBeNull();
    expect(nextInList(null, 0)).toBeNull();
  });
});

describe("prevInList", () => {
  it("returns null at start", () => {
    expect(prevInList(0)).toBeNull();
    expect(prevInList(null)).toBeNull();
    expect(prevInList(undefined)).toBeNull();
  });

  it("returns previous index in middle", () => {
    expect(prevInList(1)).toBe(0);
    expect(prevInList(2)).toBe(1);
  });
});
