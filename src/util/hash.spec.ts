import { describe, expect, it } from "vitest";

import { fnv1aHash } from "./hash";

describe("fnv1aHash", () => {
  it("hashes the empty string to a known FNV-1a basis vector", () => {
    // FNV-1a offset basis 0x811c9dc5 (2166136261) → base-36 "ztntfp".
    // Locked in so any future engine/JS change that drifts the output
    // breaks this test instead of silently invalidating users' cached
    // keys (favorites, poster cache, etc.).
    expect(fnv1aHash("")).toBe("ztntfp");
  });

  it("returns deterministic output for fixed inputs (regression vectors)", () => {
    expect(fnv1aHash("hello")).toBe("m3bicr");
    expect(fnv1aHash("sensor.cam_files|sensor.other_files")).toBe("fwpou4");
  });

  it("is case-sensitive", () => {
    expect(fnv1aHash("Hello")).not.toBe(fnv1aHash("hello"));
  });

  it("differs between similar but distinct inputs", () => {
    expect(fnv1aHash("a|b")).not.toBe(fnv1aHash("a|c"));
    expect(fnv1aHash("ab")).not.toBe(fnv1aHash("ba"));
  });

  it("handles unicode via charCodeAt (UTF-16 code units)", () => {
    // The implementation walks `charCodeAt`, so two inputs with the
    // same UTF-16 representation hash identically; surrogate pairs
    // hash distinctly from BMP characters.
    expect(fnv1aHash("é")).toBe(fnv1aHash("é"));
    expect(fnv1aHash("🎥")).not.toBe(fnv1aHash("📹"));
  });

  it("returns a base-36 string", () => {
    for (const sample of ["", "x", "longer-input-string"]) {
      expect(fnv1aHash(sample)).toMatch(/^[0-9a-z]+$/);
    }
  });
});
