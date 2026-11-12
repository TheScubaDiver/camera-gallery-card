import { describe, expect, it } from "vitest";

import { parseUrlActions } from "./url-actions";

function parse(over: {
  search?: string | null;
  urlId?: string | null | undefined;
  cameras?: readonly string[];
  hasLiveConfig?: boolean;
}) {
  return parseUrlActions({
    search: over.search ?? null,
    urlId: "urlId" in over ? over.urlId : "porch",
    cameras: over.cameras ?? ["camera.porch_gate", "camera.driveway"],
    hasLiveConfig: over.hasLiveConfig ?? true,
  });
}

describe("parseUrlActions — opt-out (no url_id)", () => {
  it("ignores a fully populated query string when url_id is unset", () => {
    expect(
      parse({
        urlId: undefined,
        search: "?cgc_id=porch&cgc_view=live&cgc_camera=camera.porch_gate",
      })
    ).toEqual({ view: null, camera: null });
  });

  it("ignores when url_id is null", () => {
    expect(parse({ urlId: null, search: "?cgc_id=porch&cgc_view=live" })).toEqual({
      view: null,
      camera: null,
    });
  });

  it("ignores when url_id is empty string", () => {
    expect(parse({ urlId: "", search: "?cgc_id=&cgc_view=live" })).toEqual({
      view: null,
      camera: null,
    });
  });

  it("ignores when url_id is whitespace only", () => {
    expect(parse({ urlId: "   ", search: "?cgc_id=porch&cgc_view=live" })).toEqual({
      view: null,
      camera: null,
    });
  });
});

describe("parseUrlActions — cgc_id gating", () => {
  it("mismatched cgc_id yields nulls", () => {
    expect(parse({ search: "?cgc_id=other&cgc_view=live" })).toEqual({
      view: null,
      camera: null,
    });
  });

  it("missing cgc_id yields nulls", () => {
    expect(parse({ search: "?cgc_view=live" })).toEqual({ view: null, camera: null });
  });

  it("matches after trimming both sides", () => {
    expect(parse({ urlId: " porch ", search: "?cgc_id=%20porch%20&cgc_view=live" })).toEqual({
      view: "live",
      camera: null,
    });
  });
});

describe("parseUrlActions — empty/degenerate search strings", () => {
  it.each([[""], ["?"], [null], [undefined]])("search=%p yields nulls", (search) => {
    expect(parse({ search: search as string | null })).toEqual({ view: null, camera: null });
  });

  it("a malformed query string that URLSearchParams still parses does not throw, and yields nulls for cgc_view", () => {
    expect(() => parse({ search: "?=&&cgc_view", urlId: "porch" })).not.toThrow();
    // No cgc_id present at all (the string has no `cgc_id=` key), so this
    // is gated out by rule 2 regardless of what cgc_view does.
    expect(parse({ search: "?=&&cgc_view" })).toEqual({ view: null, camera: null });
  });
});

describe("parseUrlActions — cgc_view", () => {
  it.each([
    ["live", "live"],
    ["gallery", "media"],
    ["", null],
    ["Live", null],
    ["LIVE", null],
    ["bogus", null],
  ] as const)("cgc_view=%s -> view=%s", (raw, expected) => {
    expect(parse({ search: `?cgc_id=porch&cgc_view=${raw}` })).toEqual({
      view: expected,
      camera: null,
    });
  });

  it("missing cgc_view yields view null when no camera resolves", () => {
    expect(parse({ search: "?cgc_id=porch" })).toEqual({ view: null, camera: null });
  });

  it("repeated cgc_view params: first wins (URLSearchParams.get behavior)", () => {
    expect(parse({ search: "?cgc_id=porch&cgc_view=live&cgc_view=gallery" })).toEqual({
      view: "live",
      camera: null,
    });
    expect(parse({ search: "?cgc_id=porch&cgc_view=gallery&cgc_view=live" })).toEqual({
      view: "media",
      camera: null,
    });
  });
});

describe("parseUrlActions — cgc_camera", () => {
  it("valid camera implies live when cgc_view is absent", () => {
    expect(parse({ search: "?cgc_id=porch&cgc_camera=camera.porch_gate" })).toEqual({
      view: "live",
      camera: "camera.porch_gate",
    });
  });

  it("valid camera implies live when cgc_view is present but not 'gallery'", () => {
    expect(parse({ search: "?cgc_id=porch&cgc_view=bogus&cgc_camera=camera.porch_gate" })).toEqual({
      view: "live",
      camera: "camera.porch_gate",
    });
  });

  it("cgc_view=live plus a valid camera together: camera set, view live", () => {
    expect(parse({ search: "?cgc_id=porch&cgc_view=live&cgc_camera=camera.porch_gate" })).toEqual({
      view: "live",
      camera: "camera.porch_gate",
    });
  });

  it("explicit cgc_view=gallery wins over a camera — camera is dropped", () => {
    expect(
      parse({ search: "?cgc_id=porch&cgc_view=gallery&cgc_camera=camera.porch_gate" })
    ).toEqual({
      view: "media",
      camera: null,
    });
  });

  it("invalid camera alone implies nothing", () => {
    expect(parse({ search: "?cgc_id=porch&cgc_camera=camera.bogus" })).toEqual({
      view: null,
      camera: null,
    });
  });

  it("invalid camera with cgc_view=live: view live, camera null", () => {
    expect(parse({ search: "?cgc_id=porch&cgc_view=live&cgc_camera=camera.bogus" })).toEqual({
      view: "live",
      camera: null,
    });
  });

  it("honours a camera id with surrounding whitespace from URL encoding", () => {
    expect(parse({ search: "?cgc_id=porch&cgc_camera=%20camera.porch_gate%20" })).toEqual({
      view: "live",
      camera: "camera.porch_gate",
    });
  });

  it("empty cameras allow-list never resolves a camera", () => {
    expect(parse({ search: "?cgc_id=porch&cgc_camera=camera.porch_gate", cameras: [] })).toEqual({
      view: null,
      camera: null,
    });
  });

  it("allow-list membership is exact, not prefix — a truncated entity id is rejected", () => {
    expect(
      parse({ search: "?cgc_id=porch&cgc_camera=camera.porch", cameras: ["camera.porch_gate"] })
    ).toEqual({ view: null, camera: null });
  });

  it("accepts a synthetic stream id (the __cgc_stream_N__ form from live_stream_urls) as cgc_camera", () => {
    expect(
      parse({
        search: "?cgc_id=porch&cgc_camera=__cgc_stream_0__",
        cameras: ["__cgc_stream_0__", "__cgc_stream_1__"],
      })
    ).toEqual({ view: "live", camera: "__cgc_stream_0__" });
  });
});

describe("parseUrlActions — hasLiveConfig gating", () => {
  it("drops a would-be live view (from cgc_view=live) when hasLiveConfig is false", () => {
    expect(parse({ search: "?cgc_id=porch&cgc_view=live", hasLiveConfig: false })).toEqual({
      view: null,
      camera: null,
    });
  });

  it("drops a would-be live view (implied by a valid camera) when hasLiveConfig is false", () => {
    expect(
      parse({
        search: "?cgc_id=porch&cgc_camera=camera.porch_gate",
        hasLiveConfig: false,
      })
    ).toEqual({ view: null, camera: null });
  });

  it("does not gate a gallery/media view on hasLiveConfig", () => {
    expect(parse({ search: "?cgc_id=porch&cgc_view=gallery", hasLiveConfig: false })).toEqual({
      view: "media",
      camera: null,
    });
  });
});
