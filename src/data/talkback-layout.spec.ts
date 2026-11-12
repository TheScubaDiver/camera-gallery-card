import { describe, expect, it } from "vitest";
import { isTalkbackRow, talkbackPosition, talkbackRowJustify } from "./talkback-layout";

describe("talkbackPosition", () => {
  it("keeps below and above", () => {
    expect(talkbackPosition("below")).toBe("below");
    expect(talkbackPosition("above")).toBe("above");
  });

  it("falls back to overlay", () => {
    for (const v of ["overlay", undefined, null, "", "left", 3])
      expect(talkbackPosition(v)).toBe("overlay");
  });
});

describe("isTalkbackRow", () => {
  it("is a row for below and above only", () => {
    expect(isTalkbackRow("overlay")).toBe(false);
    expect(isTalkbackRow("below")).toBe(true);
    expect(isTalkbackRow("above")).toBe(true);
  });
});

describe("talkbackRowJustify", () => {
  it("stretches the bar", () => {
    expect(talkbackRowJustify("bar", "left")).toBe("stretch");
  });

  it("places the round button like live_mic_button_position", () => {
    expect(talkbackRowJustify("button", "left")).toBe("flex-start");
    expect(talkbackRowJustify("button", "right")).toBe("flex-end");
    expect(talkbackRowJustify("button", undefined)).toBe("center");
    expect(talkbackRowJustify("button", "center")).toBe("center");
  });
});
