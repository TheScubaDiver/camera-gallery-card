import { describe, expect, it } from "vitest";

import { galleryState } from "./gallery-state";

const base = { itemCount: 0, usingMediaSource: true, mediaLoading: false, hasLive: false };

describe("galleryState", () => {
  it("renders the card normally once there are items, even while refreshing", () => {
    expect(galleryState({ ...base, itemCount: 3, mediaLoading: true, hasLive: true })).toEqual({
      loading: false,
      liveOnly: false,
      emptyMessage: null,
    });
  });

  // #184: the card must keep its layout (skeletons) instead of a bare
  // "Loading media…" line while the first media listing is in flight.
  it("shows skeletons while the first media listing loads, without a live camera", () => {
    expect(galleryState({ ...base, mediaLoading: true })).toEqual({
      loading: true,
      liveOnly: false,
      emptyMessage: null,
    });
  });

  // #184: with a live camera the gallery chrome used to be hidden while
  // loading (treated as live-only), so it popped in when clips arrived.
  it("shows skeletons, not live-only, while loading with a live camera", () => {
    expect(galleryState({ ...base, mediaLoading: true, hasLive: true })).toEqual({
      loading: true,
      liveOnly: false,
      emptyMessage: null,
    });
  });

  it("falls back to live-only once loading finished with no items (#169)", () => {
    expect(galleryState({ ...base, hasLive: true })).toEqual({
      loading: false,
      liveOnly: true,
      emptyMessage: null,
    });
  });

  it("shows 'No media found.' once loading finished with no items and no live camera", () => {
    expect(galleryState(base)).toEqual({
      loading: false,
      liveOnly: false,
      emptyMessage: "No media found.",
    });
  });

  it("ignores the media loading flag in sensor mode", () => {
    expect(galleryState({ ...base, usingMediaSource: false, mediaLoading: true })).toEqual({
      loading: false,
      liveOnly: false,
      emptyMessage: "No media found.",
    });
  });
});
