import { describe, expect, it } from "vitest";

import {
  buildThumbActionCall,
  fillThumbActionPlaceholders,
  thumbActionConfirmText,
  thumbActionContext,
  thumbItemFilename,
  thumbItemPath,
} from "./thumb-actions";

describe("thumbItemPath", () => {
  it("maps the default local media dir to /media", () => {
    expect(
      thumbItemPath("media-source://media_source/local/tapo_control/back_door/videos/clip.mp4")
    ).toBe("/media/tapo_control/back_door/videos/clip.mp4");
  });

  it("decodes encoded characters in media-source ids", () => {
    expect(thumbItemPath("media-source://media_source/local/Kids%20Room/a%20b.jpg")).toBe(
      "/media/Kids Room/a b.jpg"
    );
  });

  it("returns empty for other media dirs and integration sources", () => {
    expect(thumbItemPath("media-source://media_source/security/clip.mp4")).toBe("");
    expect(thumbItemPath("media-source://frigate/frigate/event/clips/porch/123")).toBe("");
    expect(thumbItemPath("media-source://reolink/CAM|abc|def")).toBe("");
  });

  it("maps /local URLs to /config/www like delete_service", () => {
    expect(thumbItemPath("/local/snapshots/front/2026-01-01_12-00-00.jpg")).toBe(
      "/config/www/snapshots/front/2026-01-01_12-00-00.jpg"
    );
    expect(thumbItemPath("https://ha.local:8123/local/snap.jpg?authSig=x")).toBe(
      "/config/www/snap.jpg"
    );
  });

  it("returns empty for empty input", () => {
    expect(thumbItemPath("")).toBe("");
    expect(thumbItemPath(null)).toBe("");
  });
});

describe("thumbItemFilename", () => {
  it("takes the decoded last segment without query or hash", () => {
    expect(thumbItemFilename("media-source://media_source/local/cam/My%20Clip.mp4")).toBe(
      "My Clip.mp4"
    );
    expect(thumbItemFilename("/local/snap.jpg?authSig=abc#x")).toBe("snap.jpg");
  });

  it("returns empty for empty input", () => {
    expect(thumbItemFilename(undefined)).toBe("");
  });
});

describe("thumbActionContext", () => {
  it("builds every placeholder value for a media-source item", () => {
    expect(
      thumbActionContext(
        "media-source://media_source/local/tapo/clip.mp4",
        "/media/local/tapo/clip.mp4?authSig=abc"
      )
    ).toEqual({
      media_id: "media-source://media_source/local/tapo/clip.mp4",
      url: "/media/local/tapo/clip.mp4?authSig=abc",
      path: "/media/tapo/clip.mp4",
      filename: "clip.mp4",
    });
  });

  it("falls back to the item id as url when nothing was resolved", () => {
    expect(thumbActionContext("/local/snap.jpg").url).toBe("/local/snap.jpg");
  });
});

describe("fillThumbActionPlaceholders", () => {
  const ctx = { media_id: "ms://x", url: "/u", path: "/media/x.mp4", filename: "x.mp4" };

  it("replaces placeholders inside strings, arrays and nested objects", () => {
    expect(
      fillThumbActionPlaceholders(
        { file: "{path}", tags: ["{filename}", "keep"], nested: { id: "id={media_id}" } },
        ctx
      )
    ).toEqual({ file: "/media/x.mp4", tags: ["x.mp4", "keep"], nested: { id: "id=ms://x" } });
  });

  it("leaves unknown placeholders, HA templates and non-strings untouched", () => {
    expect(
      fillThumbActionPlaceholders(
        { a: "{other}", b: "{{ states('x') }}", n: 5, t: true, z: null },
        ctx
      )
    ).toEqual({ a: "{other}", b: "{{ states('x') }}", n: 5, t: true, z: null });
  });
});

describe("buildThumbActionCall", () => {
  const ctx = thumbActionContext("media-source://media_source/local/tapo/clip.mp4", "/signed");

  it("splits perform_action and fills data and target", () => {
    expect(
      buildThumbActionCall(
        {
          name: "Archive",
          perform_action: "script.archive_clip",
          data: { path: "{path}", url: "{url}" },
          target: { entity_id: "script.archive_clip" },
        },
        ctx
      )
    ).toEqual({
      domain: "script",
      service: "archive_clip",
      data: { path: "/media/tapo/clip.mp4", url: "/signed" },
      target: { entity_id: "script.archive_clip" },
    });
  });

  it("sends empty data and no target when none are configured", () => {
    expect(buildThumbActionCall({ name: "Ping", perform_action: "script.ping" }, ctx)).toEqual({
      domain: "script",
      service: "ping",
      data: {},
    });
  });

  it("returns null for a perform_action that isn't domain.service", () => {
    expect(buildThumbActionCall({ name: "Bad", perform_action: "script" }, ctx)).toBeNull();
    expect(buildThumbActionCall({ name: "Bad", perform_action: "a.b.c" }, ctx)).toBeNull();
  });
});

describe("thumbActionConfirmText", () => {
  it("is null without confirmation", () => {
    expect(thumbActionConfirmText({ name: "Archive", perform_action: "s.a" })).toBeNull();
    expect(
      thumbActionConfirmText({ name: "Archive", perform_action: "s.a", confirmation: false })
    ).toBeNull();
  });

  it("uses the custom text, or the action name as a question", () => {
    expect(
      thumbActionConfirmText({
        name: "Archive",
        perform_action: "s.a",
        confirmation: { text: "Archive this clip?" },
      })
    ).toBe("Archive this clip?");
    expect(
      thumbActionConfirmText({ name: "Archive", perform_action: "s.a", confirmation: true })
    ).toBe("Archive?");
  });
});
