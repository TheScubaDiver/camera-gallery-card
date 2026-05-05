import { describe, expect, it } from "vitest";

import { isVideo } from "./media-type";

describe("isVideo", () => {
  it("returns true for the supported video extensions", () => {
    expect(isVideo("clip.mp4")).toBe(true);
    expect(isVideo("clip.webm")).toBe(true);
    expect(isVideo("clip.mov")).toBe(true);
    expect(isVideo("clip.m4v")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isVideo("CLIP.MP4")).toBe(true);
    expect(isVideo("Clip.WebM")).toBe(true);
  });

  it("returns false for image extensions", () => {
    expect(isVideo("clip.jpg")).toBe(false);
    expect(isVideo("clip.png")).toBe(false);
    expect(isVideo("clip.webp")).toBe(false);
  });

  it("returns false for files with no extension", () => {
    expect(isVideo("clip")).toBe(false);
    expect(isVideo("/path/to/clip")).toBe(false);
  });

  it("strips query strings before testing", () => {
    expect(isVideo("/clip.mp4?token=abc")).toBe(true);
    expect(isVideo("/clip.jpg?token=abc")).toBe(false);
  });

  it("strips fragments before testing", () => {
    expect(isVideo("/clip.mp4#t=10")).toBe(true);
    expect(isVideo("/clip.jpg#anchor")).toBe(false);
  });

  it("strips both query and fragment", () => {
    expect(isVideo("/clip.mp4?x=1#frag")).toBe(true);
  });

  it("matches only at the end of the path", () => {
    // Stem-like substrings that look like extensions in the middle of
    // the path should not register as videos.
    expect(isVideo("/foo.mp4.txt")).toBe(false);
    expect(isVideo("/foo.mp4/bar.jpg")).toBe(false);
  });

  it("handles full URLs", () => {
    expect(isVideo("https://example.com/folder/clip.mp4")).toBe(true);
    expect(isVideo("media-source://media_source/local/clip.webm")).toBe(true);
  });

  it("returns false for null / undefined / empty input", () => {
    expect(isVideo(null)).toBe(false);
    expect(isVideo(undefined)).toBe(false);
    expect(isVideo("")).toBe(false);
  });
});
