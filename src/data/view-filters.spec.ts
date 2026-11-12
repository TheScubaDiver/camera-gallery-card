import { describe, expect, it, vi } from "vitest";

import {
  detectObjectForSrc,
  detectObjectsForSrc,
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

describe("detectObjectsForSrc", () => {
  const base = {
    sourceMode: "media" as const,
    getSrcEntity: (): string | undefined => undefined,
    getSensorState: (): undefined => undefined,
    getMediaTitle: (): undefined => undefined,
  };

  // #203: NVR scripts concatenate every detected object into the filename.
  it("returns every object tagged in the filename, in visibleFilters order", () => {
    expect(
      detectObjectsForSrc({
        ...base,
        src: "/media/frontdoor_20260612_1200_motorcycle_person.mp4",
        visibleFilters: ["person", "car", "motorcycle", "dog"],
      })
    ).toEqual(["person", "motorcycle"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(
      detectObjectsForSrc({ ...base, src: "/abc.jpg", visibleFilters: ["person", "car"] })
    ).toEqual([]);
  });

  it("returns an empty list for empty src", () => {
    expect(detectObjectsForSrc({ ...base, src: "  ", visibleFilters: ["person"] })).toEqual([]);
  });

  it("detectObjectForSrc stays the first of the list", () => {
    const opts = {
      ...base,
      src: "/cam_dog_motorcycle_person.mp4",
      visibleFilters: ["motorcycle", "person", "dog"],
    };
    expect(detectObjectsForSrc(opts)).toEqual(["motorcycle", "person", "dog"]);
    expect(detectObjectForSrc(opts)).toBe("motorcycle");
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
        getObjectsForSrc: () => [],
      })
    ).toBe(true);
  });

  it("normalizes filter list (audit-fix #4/5)", () => {
    const calls: string[] = [];
    expect(
      matchesObjectFilter({
        ...baseOpts,
        filters: [" Person ", "CAR", ""],
        getObjectsForSrc: (src) => {
          calls.push(src);
          return ["person"];
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
        getObjectsForSrc: () => [],
      })
    ).toBe(false);
  });

  it("returns false when no detected object is in active filters", () => {
    expect(
      matchesObjectFilter({
        ...baseOpts,
        filters: ["car"],
        getObjectsForSrc: () => ["person", "dog"],
      })
    ).toBe(false);
  });

  // #203: a multi-tagged file must show up under each of its objects, not
  // only under the first one detection happens to return.
  it("matches when any detected object is active, not just the first", () => {
    const objects = ["person", "motorcycle"];
    for (const filter of ["person", "motorcycle"]) {
      expect(
        matchesObjectFilter({ ...baseOpts, filters: [filter], getObjectsForSrc: () => objects })
      ).toBe(true);
    }
  });

  it("media mode end-to-end: concatenated tags match each object filter", () => {
    const src = "/media/frontdoor_20260612_1200_motorcycle_person.mp4";
    const getObjectsForSrc = (s: string): string[] =>
      detectObjectsForSrc({
        src: s,
        sourceMode: "media",
        visibleFilters: ["person", "motorcycle", "dog"],
        getSrcEntity: () => undefined,
        getSensorState: () => undefined,
        getMediaTitle: () => undefined,
      });
    const match = (filter: string): boolean =>
      matchesObjectFilter({ ...baseOpts, src, filters: [filter], getObjectsForSrc });
    expect(match("motorcycle")).toBe(true);
    expect(match("person")).toBe(true);
    expect(match("dog")).toBe(false);
  });

  it("sensor mode routes through matchesObjectFilterForFileSensor", () => {
    const result = matchesObjectFilter({
      src: "/snap-dog.jpg",
      sourceMode: "sensor",
      filters: ["dog"],
      getSrcEntity: () => "sensor.cam",
      getSensorState: () => undefined,
      getObjectsForSrc: () => [], // not consulted in sensor mode
    });
    expect(result).toBe(true);
  });
});
