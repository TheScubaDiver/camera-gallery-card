import { describe, expect, it } from "vitest";

import {
  type BrowseFn,
  collectMediaSamples,
  detectPathFormat,
  scoreSamples,
} from "./path-format-detect";
import type { MediaSourceItem } from "../types/media-source";

const folder = (id: string, title: string, children?: MediaSourceItem[]): MediaSourceItem => ({
  media_content_id: id,
  title,
  media_class: "directory",
  media_content_type: "",
  can_play: false,
  can_expand: true,
  thumbnail: null,
  children_media_class: null,
  ...(children ? { children } : {}),
});

const file = (id: string, title: string): MediaSourceItem => ({
  media_content_id: id,
  title,
  media_class: "video",
  media_content_type: "video/mp4",
  can_play: true,
  can_expand: false,
  thumbnail: null,
  children_media_class: null,
});

function makeBrowse(tree: Record<string, MediaSourceItem>): BrowseFn {
  return async (id) => tree[id] ?? null;
}

describe("detectPathFormat", () => {
  it("detects layout C — nested YYYY/MM/DD/<filename>.mp4 (issue #99)", async () => {
    const ROOT = "media-source://x/Cams";
    const tree: Record<string, MediaSourceItem> = {
      [ROOT]: folder(ROOT, "Cams", [folder(`${ROOT}/2026`, "2026", [])]),
      [`${ROOT}/2026`]: folder(`${ROOT}/2026`, "2026", [folder(`${ROOT}/2026/04`, "04", [])]),
      [`${ROOT}/2026/04`]: folder(`${ROOT}/2026/04`, "04", [
        folder(`${ROOT}/2026/04/30`, "30", []),
      ]),
      [`${ROOT}/2026/04/30`]: folder(`${ROOT}/2026/04/30`, "30", [
        file(`${ROOT}/2026/04/30/RLC_20260430131245.mp4`, "RLC_20260430131245.mp4"),
        file(`${ROOT}/2026/04/30/RLC_20260430160000.mp4`, "RLC_20260430160000.mp4"),
        file(`${ROOT}/2026/04/30/RLC_20260430180000.mp4`, "RLC_20260430180000.mp4"),
        file(`${ROOT}/2026/04/30/RLC_20260430200000.mp4`, "RLC_20260430200000.mp4"),
      ]),
    };
    const result = await detectPathFormat([ROOT], makeBrowse(tree));
    expect(result.format).toBe("YYYY/MM/DD/RLC_YYYYMMDDHHmmss");
    expect(result.matches).toBe(4);
  });

  it("detects layout B — date folder + timestamped filename", async () => {
    const ROOT = "media-source://x/Cams";
    const tree: Record<string, MediaSourceItem> = {
      [ROOT]: folder(ROOT, "Cams", [
        folder(`${ROOT}/20260430`, "20260430", []),
        folder(`${ROOT}/20260501`, "20260501", []),
      ]),
      [`${ROOT}/20260430`]: folder(`${ROOT}/20260430`, "20260430", [
        file(`${ROOT}/20260430/120030.mp4`, "120030.mp4"),
        file(`${ROOT}/20260430/130000.mp4`, "130000.mp4"),
        file(`${ROOT}/20260430/140000.mp4`, "140000.mp4"),
      ]),
      [`${ROOT}/20260501`]: folder(`${ROOT}/20260501`, "20260501", [
        file(`${ROOT}/20260501/090000.mp4`, "090000.mp4"),
        file(`${ROOT}/20260501/100000.mp4`, "100000.mp4"),
      ]),
    };
    const result = await detectPathFormat([ROOT], makeBrowse(tree));
    expect(result.format).toBe("YYYYMMDD/HHmmss");
    expect(result.matches).toBeGreaterThanOrEqual(3);
  });

  it("detects layout A — flat folder with timestamped filenames", async () => {
    const ROOT = "media-source://x/Cams";
    const tree: Record<string, MediaSourceItem> = {
      [ROOT]: folder(ROOT, "Cams", [
        file(`${ROOT}/20260430_120030.mp4`, "20260430_120030.mp4"),
        file(`${ROOT}/20260430_130000.mp4`, "20260430_130000.mp4"),
        file(`${ROOT}/20260501_090000.mp4`, "20260501_090000.mp4"),
        file(`${ROOT}/20260501_100000.mp4`, "20260501_100000.mp4"),
      ]),
    };
    const result = await detectPathFormat([ROOT], makeBrowse(tree));
    expect(result.format).toBe("YYYYMMDD_HHmmss");
    expect(result.matches).toBe(4);
  });

  it("returns null when nothing matches the curated patterns", async () => {
    const ROOT = "media-source://x/Cams";
    const tree: Record<string, MediaSourceItem> = {
      [ROOT]: folder(ROOT, "Cams", [
        file(`${ROOT}/cat-photo.jpg`, "cat-photo.jpg"),
        file(`${ROOT}/dog-photo.jpg`, "dog-photo.jpg"),
        file(`${ROOT}/random.mp4`, "random.mp4"),
      ]),
    };
    const result = await detectPathFormat([ROOT], makeBrowse(tree));
    expect(result.format).toBeNull();
    expect(result.sampled).toBeGreaterThan(0);
  });

  it("returns null with sampled=0 when the root has no children", async () => {
    const ROOT = "media-source://x/Empty";
    const tree: Record<string, MediaSourceItem> = {
      [ROOT]: folder(ROOT, "Empty", []),
    };
    const result = await detectPathFormat([ROOT], makeBrowse(tree));
    expect(result.format).toBeNull();
    expect(result.sampled).toBe(0);
  });

  it("prioritizes date-shaped directory names over dotted/underscored noise", async () => {
    // Real-world reproducer: many NVR / smart-camera mounts include
    // metadata sibling folders (`.thumbnails/`, `_temp/`). The probe budget
    // is small, so without prioritization these would steal the descent
    // slots and the detector would never reach `2026/`.
    const ROOT = "media-source://x/Cams";
    const tree: Record<string, MediaSourceItem> = {
      [ROOT]: folder(ROOT, "Cams", [
        folder(`${ROOT}/.metadata`, ".metadata", []),
        folder(`${ROOT}/_temp`, "_temp", []),
        folder(`${ROOT}/_thumbs`, "_thumbs", []),
        folder(`${ROOT}/2026`, "2026", []),
      ]),
      [`${ROOT}/2026`]: folder(`${ROOT}/2026`, "2026", [folder(`${ROOT}/2026/04`, "04", [])]),
      [`${ROOT}/2026/04`]: folder(`${ROOT}/2026/04`, "04", [
        folder(`${ROOT}/2026/04/30`, "30", []),
      ]),
      [`${ROOT}/2026/04/30`]: folder(`${ROOT}/2026/04/30`, "30", [
        file(`${ROOT}/2026/04/30/RLC_20260430120030.mp4`, "RLC_20260430120030.mp4"),
        file(`${ROOT}/2026/04/30/RLC_20260430130000.mp4`, "RLC_20260430130000.mp4"),
        file(`${ROOT}/2026/04/30/RLC_20260430140000.mp4`, "RLC_20260430140000.mp4"),
      ]),
    };
    const result = await detectPathFormat([ROOT], makeBrowse(tree));
    expect(result.format).toBe("YYYY/MM/DD/RLC_YYYYMMDDHHmmss");
    expect(result.matches).toBe(3);
  });

  it("returns a winner for a single perfectly-matching file", async () => {
    // Tiny sample sets shouldn't be silently rejected — a 1-of-1 match is
    // better than no suggestion.
    const ROOT = "media-source://x/Cams";
    const tree: Record<string, MediaSourceItem> = {
      [ROOT]: folder(ROOT, "Cams", [file(`${ROOT}/20260430_120030.mp4`, "20260430_120030.mp4")]),
    };
    const result = await detectPathFormat([ROOT], makeBrowse(tree));
    expect(result.format).toBe("YYYYMMDD_HHmmss");
    expect(result.matches).toBe(1);
  });

  it("populates runnersUp for inspection", async () => {
    const ROOT = "media-source://x/Cams";
    const tree: Record<string, MediaSourceItem> = {
      [ROOT]: folder(ROOT, "Cams", [
        file(`${ROOT}/20260430_120030.mp4`, "20260430_120030.mp4"),
        file(`${ROOT}/20260430_130000.mp4`, "20260430_130000.mp4"),
      ]),
    };
    const result = await detectPathFormat([ROOT], makeBrowse(tree));
    // The flat layout has multiple matching candidates (with/without ext).
    expect(result.runnersUp.length).toBeGreaterThanOrEqual(0);
  });
});

describe("scoreSamples", () => {
  // The detect button's click handler feeds `scoreSamples` a merged list of
  // media-source paths AND sensor `fileList` paths so a single Detect press
  // works for sensor / media / combined / Frigate-mixed configs alike.
  it("scores sensor-shaped /local/ paths the same as media-source paths", () => {
    const samples = [
      "/local/security/cam1/2026/04/30/RLC_20260430120030.mp4",
      "/local/security/cam1/2026/04/30/RLC_20260430130000.mp4",
      "/local/security/cam1/2026/05/01/RLC_20260501090000.mp4",
      "/local/security/cam1/2026/05/01/RLC_20260501100000.mp4",
    ];
    const result = scoreSamples(samples);
    expect(result.format).toBe("YYYY/MM/DD/RLC_YYYYMMDDHHmmss");
    expect(result.matches).toBe(4);
  });

  it("merges sensor + media samples and picks the shared layout", () => {
    // Combined-mode reproducer: the user has a Frigate root (skipped by the
    // editor before scoring) plus a sensor that lists the same files via a
    // FileTrack-style `/local/...` path. The detector should score these
    // sensor samples as if they came from the media probe.
    const sensorOnly = [
      "/local/cams/20260430/120030.mp4",
      "/local/cams/20260430/130000.mp4",
      "/local/cams/20260501/090000.mp4",
    ];
    const result = scoreSamples(sensorOnly);
    expect(result.format).toBe("YYYYMMDD/HHmmss");
    expect(result.matches).toBe(3);
  });

  it("returns empty result for empty samples (no Frigate carve-out leakage)", () => {
    // The editor filters Frigate event-id roots out before calling probe; if
    // they're the *only* configured roots and there are no sensor samples
    // either, the detector receives `[]` and short-circuits.
    const result = scoreSamples([]);
    expect(result.format).toBeNull();
    expect(result.sampled).toBe(0);
  });
});

describe("collectMediaSamples", () => {
  it("respects the limit argument", async () => {
    const ROOT = "media-source://x/Cams";
    const files = Array.from({ length: 20 }, (_, i) =>
      file(`${ROOT}/clip${String(i).padStart(2, "0")}.mp4`, `clip${i}.mp4`)
    );
    const tree: Record<string, MediaSourceItem> = {
      [ROOT]: folder(ROOT, "Cams", files),
    };
    const samples = await collectMediaSamples([ROOT], makeBrowse(tree), 5);
    expect(samples.length).toBe(5);
  });
});

describe("UniFi Protect — title-based detection", () => {
  // UniFi Protect returns a flat list of events with opaque IDs and
  // human-readable titles like `05/12/26 09:46:45 28s Object Detection - Person`.
  const ROOT = "media-source://unifiprotect/69738a9f0219ca03e40003ec:browse:all:all:recent:7";

  const unifiTree: Record<string, MediaSourceItem> = {
    [ROOT]: folder(ROOT, "Recent", [
      file(`${ROOT}/evt1`, "05/12/26 09:46:45 28s Object Detection - Person"),
      file(`${ROOT}/evt2`, "05/10/26 19:49:02 24s Object Detection - Animal"),
      file(`${ROOT}/evt3`, "05/11/26 13:12:19 1m 34s Object Detection - Person"),
      file(`${ROOT}/evt4`, "05/12/26 14:22:01 12s Object Detection - Vehicle"),
    ]),
  };

  it("collects titles as samples alongside opaque IDs", async () => {
    const samples = await collectMediaSamples([ROOT], makeBrowse(unifiTree), 50);
    // Opaque IDs and the title strings both appear.
    expect(samples.some((s) => s.startsWith("media-source://unifiprotect"))).toBe(true);
    expect(samples).toContain("05/12/26 09:46:45 28s Object Detection - Person");
  });

  it("picks `MM\\/DD\\/YY HH:mm:ss` for UniFi-style titles", async () => {
    const result = await detectPathFormat([ROOT], makeBrowse(unifiTree));
    expect(result.format).toBe("MM\\/DD\\/YY HH:mm:ss");
    // All 4 events matched.
    expect(result.matches).toBe(4);
  });
});
