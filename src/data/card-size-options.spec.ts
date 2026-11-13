// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CARD_GRID_OPTIONS, CARD_LAYOUT_OPTIONS } from "./card-registration";

// HA asks the card element for its size in the sections view. These must
// work on the real element, not just as constants.
beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  await import("../index.js");
});

describe("card size options", () => {
  it("getGridOptions returns the sections-view size", () => {
    const card: any = document.createElement("camera-gallery-card");
    expect(card.getGridOptions()).toEqual(CARD_GRID_OPTIONS);
  });

  it("getLayoutOptions returns the legacy size", () => {
    const card: any = document.createElement("camera-gallery-card");
    expect(card.getLayoutOptions()).toEqual(CARD_LAYOUT_OPTIONS);
  });
});
