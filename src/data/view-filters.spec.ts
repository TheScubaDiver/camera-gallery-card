import { describe, expect, it, vi } from "vitest";

import {
  detectObjectForSrc,
  isObjectFilterActive,
  isVideoForSrc,
  isVideoSmart,
  matchesObjectFilter,
  matchesTypeFilter,
  normalizeFilterArray,
} from "./view-filters";

describe("normalizeFilterArray", () => {
  it("lower-cases and trims", () => {
    expect(normalizeFilterArray(["Person ", " CAR", " "])).toEqual(["person", "car"]);
  });

  it("drops empty / null-ish entries", () => {
    expect(normalizeFilterArray(["", null, undefined, "  ", "person"] as unknown[])).toEqual([
      "person",
    ]);
  });

  it("returns [] for non-arrays", () => {
    expect(normalizeFilterArray(null)).toEqual([]);
    expect(normalizeFilterArray(undefined)).toEqual([]);
    expect(normalizeFilterArray("person" as unknown as unknown[])).toEqual([]);
  });
});

describe("isObjectFilterActive", () => {
  it("matches case-insensitively after trim", () => {
    expect(isObjectFilterActive(["person", "car"], "PERSON ")).toBe(true);
    expect(isObjectFilterActive(["person", "car"], "dog")).toBe(false);
  });

  it("returns false for empty target", () => {
    expect(isObjectFilterActive(["person"], "")).toBe(false);
    expect(isObjectFilterActive(["person"], " ")).toBe(false);
  });

  it("handles non-array filters", () => {
    expect(isObjectFilterActive(null, "person")).toBe(false);
  });
});

describe("isVideoSmart", () => {
  it("matches video/* MIME", () => {
    expect(isVideoSmart("clip.bin", "video/mp4")).toBe(true);
    expect(isVideoSmart("clip.bin", "Video/MP4")).toBe(true);
  });

  it("matches video class", () => {
    expect(isVideoSmart("clip.bin", undefined, "video")).toBe(true);
  });

  it("falls back to extension", () => {
    expect(isVideoSmart("clip.mp4")).toBe(true);
    expect(isVideoSmart("photo.jpg")).toBe(false);
  });

  it("returns false on null/undefined input", () => {
    expect(isVideoSmart(null)).toBe(false);
    expect(isVideoSmart(undefined)).toBe(false);
  });
});

describe("isVideoForSrc", () => {
  const isMediaSource = (src: string): boolean => src.startsWith("media-source://");

  it("uses meta when available (audit-fix #2 happy path)", () => {
    const getMeta = vi.fn(() => ({ title: "doorbell.bin", mime: "video/webm" }));
    expect(isVideoForSrc({ src: "media-source://x", isMediaSource, getMeta })).toBe(true);
    expect(getMeta).toHaveBeenCalledWith("media-source://x");
  });

  it("falls back to URL extension when meta is missing (audit-fix #2)", () => {
    const getMeta = vi.fn(() => undefined);
    expect(isVideoForSrc({ src: "media-source://path/clip.mp4", isMediaSource, getMeta })).toBe(
      true
    );
    expect(isVideoForSrc({ src: "media-source://path/photo.jpg", isMediaSource, getMeta })).toBe(
      false
    );
  });

  it("uses url-extension path for non-media-source ids", () => {
    expect(isVideoForSrc({ src: "/local/clip.mp4", isMediaSource, getMeta: vi.fn() })).toBe(true);
  });

  it("works without a getMeta provider", () => {
    expect(isVideoForSrc({ src: "media-source://x/clip.mp4", isMediaSource })).toBe(true);
  });
});

describe("matchesTypeFilter", () => {
  const isVid = (src: string): boolean => src.endsWith(".mp4");

  it("both off = show all (initial state)", () => {
    expect(
      matchesTypeFilter({
        src: "/clip.mp4",
        filterVideo: false,
        filterImage: false,
        isVideo: isVid,
      })
    ).toBe(true);
  });

  it("both on = show all", () => {
    expect(
      matchesTypeFilter({
        src: "/clip.mp4",
        filterVideo: true,
        filterImage: true,
        isVideo: isVid,
      })
    ).toBe(true);
  });

  it("video-only shows videos, hides images", () => {
    expect(
      matchesTypeFilter({
        src: "/clip.mp4",
        filterVideo: true,
        filterImage: false,
        isVideo: isVid,
      })
    ).toBe(true);
    expect(
      matchesTypeFilter({
        src: "/photo.jpg",
        filterVideo: true,
        filterImage: false,
        isVideo: isVid,
      })
    ).toBe(false);
  });

  it("image-only shows images, hides videos", () => {
    expect(
      matchesTypeFilter({
        src: "/clip.mp4",
        filterVideo: false,
        filterImage: true,
        isVideo: isVid,
      })
    ).toBe(false);
    expect(
      matchesTypeFilter({
        src: "/photo.jpg",
        filterVideo: false,
        filterImage: true,
        isVideo: isVid,
      })
    ).toBe(true);
  });
});

describe("detectObjectForSrc", () => {
  const getSrcEntity = (): string | undefined => undefined;
  const getSensorState = (): undefined => undefined;
  const getMediaTitle = (): undefined => undefined;
  const visibleFilters = ["person", "car", "dog"] as const;

  it("matches by filename alias in media mode", () => {
    expect(
      detectObjectForSrc({
        src: "/clip-of-a-Person.mp4",
        sourceMode: "media",
        visibleFilters,
        getSrcEntity,
        getSensorState,
        getMediaTitle,
      })
    ).toBe("person");
  });

  it("matches by Dutch alias (object-filters alias map)", () => {
    expect(
      detectObjectForSrc({
        src: "/snap-fiets-trigger.jpg",
        sourceMode: "media",
        visibleFilters: ["bicycle"],
        getSrcEntity,
        getSensorState,
        getMediaTitle,
      })
    ).toBe("bicycle");
  });

  it("matches by media title before src", () => {
    expect(
      detectObjectForSrc({
        src: "/abc.jpg",
        sourceMode: "media",
        visibleFilters: ["car"],
        getSrcEntity,
        getSensorState,
        getMediaTitle: () => "Driveway car arrival",
      })
    ).toBe("car");
  });

  it("returns null on no match", () => {
    expect(
      detectObjectForSrc({
        src: "/abc.jpg",
        sourceMode: "media",
        visibleFilters,
        getSrcEntity,
        getSensorState,
        getMediaTitle,
      })
    ).toBeNull();
  });

  it("returns null for empty src", () => {
    expect(
      detectObjectForSrc({
        src: "",
        sourceMode: "media",
        visibleFilters,
        getSrcEntity,
        getSensorState,
        getMediaTitle,
      })
    ).toBeNull();
  });

  it("walks visibleFilters in order and returns the first match", () => {
    expect(
      detectObjectForSrc({
        src: "/clip-person-and-car.mp4",
        sourceMode: "media",
        visibleFilters: ["car", "person"],
        getSrcEntity,
        getSensorState,
        getMediaTitle,
      })
    ).toBe("car");
  });

  it("uses sensor friendly_name in sensor mode", () => {
    const result = detectObjectForSrc({
      src: "/abc.jpg",
      sourceMode: "sensor",
      visibleFilters: ["dog"],
      getSrcEntity: () => "sensor.dog_cam",
      getSensorState: () =>
        ({
          entity_id: "sensor.dog_cam",
          state: "",
          attributes: { friendly_name: "Hond Camera" },
          last_changed: "",
          last_updated: "",
          context: { id: "", parent_id: null, user_id: null },
        }) as never,
      getMediaTitle,
    });
    expect(result).toBe("dog");
  });
});

describe("matchesObjectFilter", () => {
  const baseOpts = {
    src: "/clip.mp4",
    sourceMode: "media" as const,
    getSrcEntity: () => undefined,
    getSensorState: () => undefined,
  };

  it("empty filter list passes everything", () => {
    expect(
      matchesObjectFilter({
        ...baseOpts,
        filters: [],
        getObjectForSrc: () => null,
      })
    ).toBe(true);
  });

  it("normalizes filter list (audit-fix #4/5)", () => {
    const calls: string[] = [];
    expect(
      matchesObjectFilter({
        ...baseOpts,
        filters: [" Person ", "CAR", ""],
        getObjectForSrc: (src) => {
          calls.push(src);
          return "person";
        },
      })
    ).toBe(true);
    expect(calls).toEqual(["/clip.mp4"]);
  });

  it("returns false when detection misses", () => {
    expect(
      matchesObjectFilter({
        ...baseOpts,
        filters: ["person"],
        getObjectForSrc: () => null,
      })
    ).toBe(false);
  });

  it("returns false when detected object isn't in active filters", () => {
    expect(
      matchesObjectFilter({
        ...baseOpts,
        filters: ["car"],
        getObjectForSrc: () => "person",
      })
    ).toBe(false);
  });

  it("sensor mode routes through matchesObjectFilterForFileSensor", () => {
    const result = matchesObjectFilter({
      src: "/snap-dog.jpg",
      sourceMode: "sensor",
      filters: ["dog"],
      getSrcEntity: () => "sensor.cam",
      getSensorState: () => undefined,
      getObjectForSrc: () => null, // not consulted in sensor mode
    });
    expect(result).toBe(true);
  });
});
