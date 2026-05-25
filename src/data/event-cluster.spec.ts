import { describe, it, expect } from "vitest";

import { clusterFrigateEvents } from "./event-cluster";
import type { FrigateEvent } from "../util/frigate";

const ev = (
  id: string,
  start_time: number,
  camera = "voordeur",
  label = "person",
  top_score = 0.5
): FrigateEvent => ({ id, start_time, camera, label, top_score });

describe("clusterFrigateEvents", () => {
  it("returns input unchanged when gapSec <= 0", () => {
    const events = [ev("a", 100), ev("b", 105)];
    const out = clusterFrigateEvents(events, 0);
    expect(out.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("returns input unchanged when fewer than 2 events", () => {
    expect(clusterFrigateEvents([], 30)).toEqual([]);
    const single = [ev("a", 100)];
    expect(clusterFrigateEvents(single, 30).map((e) => e.id)).toEqual(["a"]);
  });

  it("collapses consecutive same-camera same-label events within gap", () => {
    const events = [
      ev("a", 100, "voordeur", "person", 0.6),
      ev("b", 115, "voordeur", "person", 0.9),
      ev("c", 125, "voordeur", "person", 0.7),
    ];
    const out = clusterFrigateEvents(events, 30);
    // Highest top_score (b, 0.9) wins
    expect(out.map((e) => e.id)).toEqual(["b"]);
  });

  it("keeps events separate when gap exceeds threshold", () => {
    const events = [
      ev("a", 100),
      ev("b", 135), // 35s gap, > 30
    ];
    const out = clusterFrigateEvents(events, 30);
    expect(out.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("does not merge across different cameras", () => {
    const events = [
      ev("a", 100, "voordeur", "person", 0.5),
      ev("b", 105, "achterdeur", "person", 0.9),
    ];
    const out = clusterFrigateEvents(events, 30);
    expect(out.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("does not merge across different labels", () => {
    const events = [ev("a", 100, "voordeur", "person", 0.5), ev("b", 105, "voordeur", "car", 0.9)];
    const out = clusterFrigateEvents(events, 30);
    expect(out.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("passes through events without camera/label/start_time", () => {
    const events: FrigateEvent[] = [
      ev("a", 100),
      { id: "b", start_time: 105, camera: "voordeur" }, // no label
      { id: "c", start_time: 110, label: "person" }, // no camera
      { id: "d", camera: "voordeur", label: "person" }, // no start_time
      ev("e", 115, "voordeur", "person", 0.8),
    ];
    const out = clusterFrigateEvents(events, 30);
    // a + e cluster (e wins on score). b/c/d pass through (no key/time).
    const ids = out.map((e) => e.id).sort();
    expect(ids).toEqual(["b", "c", "d", "e"]);
  });

  it("falls back to score when top_score is absent", () => {
    const events: FrigateEvent[] = [
      { id: "a", start_time: 100, camera: "c", label: "p", score: 0.4 },
      { id: "b", start_time: 110, camera: "c", label: "p", score: 0.8 },
    ];
    const out = clusterFrigateEvents(events, 30);
    expect(out.map((e) => e.id)).toEqual(["b"]);
  });

  it("handles unsorted input by sorting on start_time", () => {
    const events = [
      ev("c", 130, "x", "p", 0.5),
      ev("a", 100, "x", "p", 0.9),
      ev("b", 115, "x", "p", 0.7),
    ];
    const out = clusterFrigateEvents(events, 60);
    // All three within 60s of their neighbors after sorting. a wins (0.9).
    expect(out.map((e) => e.id)).toEqual(["a"]);
  });
});
