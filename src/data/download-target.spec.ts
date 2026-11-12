import { describe, expect, it } from "vitest";

import {
  filenameFromUrl,
  isHlsPlaylistUrl,
  parseFrigateEventClipId,
  resolveDownloadTarget,
} from "./download-target";

const FRIGATE_CLIP = "media-source://frigate/frigate/event/clips/voortuin/1794484859.171722-xbebcm";
// What HA's media-source resolves that clip to (observed on a real install).
const FRIGATE_HLS =
  "/api/frigate/frigate/vod/voortuin/start/1794484854/end/1794484892/index.m3u8?authSig=abc";

describe("parseFrigateEventClipId", () => {
  it("splits instance, camera and event id", () => {
    expect(parseFrigateEventClipId(FRIGATE_CLIP)).toEqual({
      instance: "frigate",
      camera: "voortuin",
      eventId: "1794484859.171722-xbebcm",
    });
  });

  it("rejects non-event Frigate ids and other sources", () => {
    expect(
      parseFrigateEventClipId("media-source://frigate/frigate/event/snapshots/cam/1-x")
    ).toBeNull();
    expect(
      parseFrigateEventClipId("media-source://frigate/frigate/recordings/cam/2026-11-12")
    ).toBeNull();
    expect(parseFrigateEventClipId("media-source://media_source/local/clip.mp4")).toBeNull();
    expect(parseFrigateEventClipId("")).toBeNull();
  });
});

describe("isHlsPlaylistUrl", () => {
  it("detects .m3u8 with or without query", () => {
    expect(isHlsPlaylistUrl(FRIGATE_HLS)).toBe(true);
    expect(isHlsPlaylistUrl("/x/INDEX.M3U8")).toBe(true);
    expect(isHlsPlaylistUrl("/local/clip.mp4?authSig=x")).toBe(false);
  });
});

describe("filenameFromUrl", () => {
  it("takes the decoded last segment", () => {
    expect(filenameFromUrl("/media/local/My%20Clip.mp4?authSig=x")).toBe("My Clip.mp4");
  });

  it("falls back to 'download'", () => {
    expect(filenameFromUrl("")).toBe("download");
    expect(filenameFromUrl("/")).toBe("download");
  });
});

describe("resolveDownloadTarget", () => {
  // #204: downloading a Frigate clip saved the HLS playlist (index.m3u8).
  it("downloads Frigate event clips as mp4 via the notifications proxy", () => {
    expect(resolveDownloadTarget(FRIGATE_CLIP, FRIGATE_HLS)).toEqual({
      kind: "file",
      url: "/api/frigate/frigate/notifications/1794484859.171722-xbebcm/clip.mp4",
      filename: "voortuin_1794484859.171722-xbebcm.mp4",
    });
  });

  it("does the same before the playback URL is resolved", () => {
    expect(resolveDownloadTarget(FRIGATE_CLIP, "")).toMatchObject({
      kind: "file",
      url: "/api/frigate/frigate/notifications/1794484859.171722-xbebcm/clip.mp4",
    });
  });

  it("reports other HLS playlists as streams instead of saving them", () => {
    expect(
      resolveDownloadTarget("media-source://some_integration/cam/clip", "/api/x/index.m3u8")
    ).toEqual({ kind: "stream", url: "/api/x/index.m3u8" });
  });

  it("downloads regular files from their resolved URL", () => {
    expect(
      resolveDownloadTarget(
        "media-source://media_source/local/cam/clip.mp4",
        "/media/local/cam/clip.mp4?authSig=x"
      )
    ).toEqual({
      kind: "file",
      url: "/media/local/cam/clip.mp4?authSig=x",
      filename: "clip.mp4",
    });
  });

  it("falls back to the item src for sensor paths", () => {
    expect(resolveDownloadTarget("/local/snapshots/2026-11-12_12-00-00_person.jpg")).toEqual({
      kind: "file",
      url: "/local/snapshots/2026-11-12_12-00-00_person.jpg",
      filename: "2026-11-12_12-00-00_person.jpg",
    });
  });
});
