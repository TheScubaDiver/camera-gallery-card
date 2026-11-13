import { describe, expect, it } from "vitest";
import { resolveTapAction } from "./tap-action-target";

const nav = { action: "navigate", navigation_path: "/security/driveway" };
const card = { action: "more-info" };

describe("resolveTapAction", () => {
  it("uses the camera's own action on a grid tile", () => {
    expect(resolveTapAction({ cameraAction: nav, cardAction: card, grid: true })).toBe(nav);
  });

  it("keeps the built-in focus on a grid tile without its own action", () => {
    expect(resolveTapAction({ cardAction: card, grid: true })).toBeNull();
  });

  it("prefers the camera's action in single view", () => {
    expect(resolveTapAction({ cameraAction: nav, cardAction: card, grid: false })).toBe(nav);
  });

  it("falls back to the card-wide action in single view", () => {
    expect(resolveTapAction({ cardAction: card, grid: false })).toBe(card);
  });

  it("treats none as configured", () => {
    const none = { action: "none" };
    expect(resolveTapAction({ cameraAction: none, grid: true })).toBe(none);
  });

  it("ignores unusable values", () => {
    expect(resolveTapAction({ cameraAction: {}, cardAction: "x", grid: false })).toBeNull();
    expect(resolveTapAction({ cameraAction: { action: "" }, grid: true })).toBeNull();
    expect(resolveTapAction({ grid: false })).toBeNull();
  });
});
