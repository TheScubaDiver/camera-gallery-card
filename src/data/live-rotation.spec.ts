import { describe, expect, it } from "vitest";
import {
  isQuarterTurn,
  normalizeRotation,
  rotatedAspect,
  rotationStyle,
  screenToLocal,
  snapshotGeometry,
} from "./live-rotation";

describe("normalizeRotation", () => {
  it("keeps the four supported values", () => {
    expect([0, 90, 180, 270].map(normalizeRotation)).toEqual([0, 90, 180, 270]);
  });

  it("wraps multiples of 90 into range", () => {
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
  });

  it("accepts numeric strings", () => {
    expect(normalizeRotation("180")).toBe(180);
  });

  it("turns anything else into 0", () => {
    for (const v of [45, "abc", null, undefined, NaN, {}]) expect(normalizeRotation(v)).toBe(0);
  });
});

describe("isQuarterTurn", () => {
  it("is true only for 90 and 270", () => {
    expect([0, 90, 180, 270].map((r) => isQuarterTurn(r as 0))).toEqual([false, true, false, true]);
  });
});

describe("rotatedAspect", () => {
  it("swaps width and height for a quarter turn", () => {
    expect(rotatedAspect("16/9", 90)).toBe("9/16");
    expect(rotatedAspect("4:3", 270)).toBe("3/4");
  });

  it("leaves 0 and 180 alone", () => {
    expect(rotatedAspect("16/9", 0)).toBe("16/9");
    expect(rotatedAspect("16/9", 180)).toBe("16/9");
  });

  it("returns unparseable input unchanged", () => {
    expect(rotatedAspect("auto", 90)).toBe("auto");
  });
});

describe("rotationStyle", () => {
  it("is empty without rotation, so the render stays as it was", () => {
    expect(rotationStyle(0)).toBe("");
  });

  it("swaps the host box for a quarter turn", () => {
    expect(rotationStyle(90)).toBe("--rot:90deg;--rot-w:100cqh;--rot-h:100cqw;");
    expect(rotationStyle(270)).toBe("--rot:270deg;--rot-w:100cqh;--rot-h:100cqw;");
  });

  it("keeps the host box for 180", () => {
    expect(rotationStyle(180)).toBe("--rot:180deg;--rot-w:100cqw;--rot-h:100cqh;");
  });
});

describe("screenToLocal", () => {
  it("leaves the pan alone without rotation", () => {
    expect(screenToLocal(10, 5, 0)).toEqual({ x: 10, y: 5 });
  });

  it("turns a screen pan into the rotated element's coordinates", () => {
    // Rotating the local result back by the rotation must give the screen pan.
    const back = (x: number, y: number, deg: number) => {
      const r = (deg * Math.PI) / 180;
      return {
        x: Math.round(x * Math.cos(r) - y * Math.sin(r)),
        y: Math.round(x * Math.sin(r) + y * Math.cos(r)),
      };
    };
    for (const deg of [90, 180, 270] as const) {
      const local = screenToLocal(10, 5, deg);
      expect(back(local.x, local.y, deg)).toEqual({ x: 10, y: 5 });
    }
  });
});

describe("snapshotGeometry", () => {
  it("swaps the canvas for a quarter turn", () => {
    expect(snapshotGeometry(1920, 1080, 90)).toEqual({
      width: 1080,
      height: 1920,
      radians: Math.PI / 2,
    });
  });

  it("keeps the canvas size for 180", () => {
    expect(snapshotGeometry(1920, 1080, 180)).toEqual({
      width: 1920,
      height: 1080,
      radians: Math.PI,
    });
  });
});
