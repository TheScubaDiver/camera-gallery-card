// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { wireDragSort } from "./drag-sort";

function list(keys: string[], zones?: Record<string, string[]>) {
  const root = document.createElement("div");
  const row = (k: string) =>
    `<div class="row" data-k="${k}" draggable="true"><span class="grip">⠿</span>${k}</div>`;
  root.innerHTML = zones
    ? Object.entries(zones)
        .map(([z, ks]) => `<div class="zone" data-z="${z}">${ks.map(row).join("")}</div>`)
        .join("")
    : keys.map(row).join("");
  document.body.append(root);
  return root;
}
const el = (root: Element, k: string) => root.querySelector(`[data-k="${k}"]`) as HTMLElement;
const zoneEl = (root: Element, z: string) => root.querySelector(`[data-z="${z}"]`) as HTMLElement;
const fire = (target: Element, type: string) =>
  target.dispatchEvent(new Event(type, { bubbles: true }));

describe("wireDragSort", () => {
  it("reorders onto another item with the mouse", () => {
    const root = list(["a", "b", "c"]);
    const onDrop = vi.fn();
    wireDragSort({ root, item: ".row", keyOf: (e) => e.dataset["k"], grip: ".grip", onDrop });
    fire(el(root, "c"), "dragstart");
    fire(el(root, "a"), "drop");
    expect(onDrop).toHaveBeenCalledWith({ src: "c", before: "a", zone: null });
  });

  it("ignores a drop on the item itself", () => {
    const root = list(["a", "b"]);
    const onDrop = vi.fn();
    wireDragSort({ root, item: ".row", keyOf: (e) => e.dataset["k"], grip: ".grip", onDrop });
    fire(el(root, "a"), "dragstart");
    fire(el(root, "a"), "drop");
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("drops at the end of a zone's empty space", () => {
    const root = list([], { row1: ["a", "b"], row2: [] });
    const onDrop = vi.fn();
    wireDragSort({
      root,
      item: ".row",
      keyOf: (e) => e.dataset["k"],
      grip: ".grip",
      zone: ".zone",
      zoneKeyOf: (e) => e.dataset["z"],
      onDrop,
    });
    fire(el(root, "a"), "dragstart");
    fire(zoneEl(root, "row2"), "drop");
    expect(onDrop).toHaveBeenCalledWith({ src: "a", before: null, zone: "row2" });
  });

  it("lets canDrop refuse a zone", () => {
    const root = list([], { row1: ["pill"], menu: [] });
    const onDrop = vi.fn();
    wireDragSort({
      root,
      item: ".row",
      keyOf: (e) => e.dataset["k"],
      grip: ".grip",
      zone: ".zone",
      zoneKeyOf: (e) => e.dataset["z"],
      canDrop: (_src, zone) => zone !== "menu",
      onDrop,
    });
    fire(el(root, "pill"), "dragstart");
    fire(zoneEl(root, "menu"), "drop");
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("reorders by touch from the grip", () => {
    const root = list(["a", "b", "c"]);
    const onDrop = vi.fn();
    wireDragSort({ root, item: ".row", keyOf: (e) => e.dataset["k"], grip: ".grip", onDrop });
    // jsdom has no layout: point the hit test at item "a".
    (document as unknown as { elementFromPoint: () => Element }).elementFromPoint = () =>
      el(root, "a");
    const grip = el(root, "c").querySelector(".grip") as HTMLElement;
    grip.dispatchEvent(new Event("touchstart", { cancelable: true }));
    const end = new Event("touchend", { cancelable: true });
    Object.defineProperty(end, "changedTouches", { value: [{ clientX: 1, clientY: 1 }] });
    grip.dispatchEvent(end);
    expect(onDrop).toHaveBeenCalledWith({ src: "c", before: "a", zone: null });
  });
});
