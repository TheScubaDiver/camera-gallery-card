// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cardStyles } from "../styles";

// jsdom cannot measure native fullscreen or nested CSS layout, so assert the
// containment selectors against the actual cardStyles text: the CSS fallback
// gets dynamic-viewport + safe-area geometry while the owned top-layer
// popover gets its UA geometry reset — and only those two blocks do.
describe("live fullscreen popup containment", () => {
  it("resets only the owned popover and supports dynamic viewport/safe-area geometry", () => {
    expect(cardStyles.cssText).toContain(":host([data-live-fs][data-live-fs-popover])");
    const native = cardStyles.cssText
      .split(":host([data-live-fs])")[1]!
      .split("/* Mobile browser")[0]!;
    expect(native).not.toContain("100dvh");
    expect(native).not.toContain("safe-area");
    expect(cardStyles.cssText).toContain(":host([data-live-fs][data-live-fs-fallback])");
    expect(cardStyles.cssText).toContain("margin: 0 !important;");
    expect(cardStyles.cssText).toContain("height: 100vh !important;");
    expect(cardStyles.cssText).toContain("height: 100dvh !important;");
    for (const edge of ["top", "right", "bottom", "left"]) {
      expect(cardStyles.cssText).toContain(`env(safe-area-inset-${edge}, 0px)`);
    }
  });
});
