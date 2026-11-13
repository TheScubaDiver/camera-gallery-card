import { describe, expect, it } from "vitest";
import { mediaAspect } from "./live-aspect";

describe("mediaAspect", () => {
  it("reads a video's size", () => {
    expect(mediaAspect({ localName: "video", videoWidth: 1920, videoHeight: 1080 })).toBe(
      "1920/1080"
    );
  });

  it("reads an MJPEG image's size", () => {
    expect(mediaAspect({ localName: "img", naturalWidth: 1280, naturalHeight: 960 })).toBe(
      "1280/960"
    );
  });

  it("is null until the size is known", () => {
    expect(mediaAspect({ localName: "video", videoWidth: 0, videoHeight: 0 })).toBeNull();
    expect(mediaAspect({ localName: "img", naturalWidth: 0, naturalHeight: 0 })).toBeNull();
    expect(mediaAspect(null)).toBeNull();
  });

  it("does not read a video's natural size or an image's video size", () => {
    expect(mediaAspect({ localName: "video", naturalWidth: 4, naturalHeight: 3 })).toBeNull();
    expect(mediaAspect({ localName: "img", videoWidth: 16, videoHeight: 9 })).toBeNull();
  });
});
