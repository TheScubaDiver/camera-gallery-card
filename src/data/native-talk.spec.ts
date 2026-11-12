import { describe, expect, it } from "vitest";

import { nativeTalkShouldToggle, nativeTalkUiState, talkSource } from "./native-talk";

describe("talkSource", () => {
  const base = {
    cameraId: "camera.door",
    go2rtcStream: "",
    nativeSupported: true,
    nativeEnabled: undefined,
  };

  it("keeps the configured go2rtc backchannel first", () => {
    expect(talkSource({ ...base, go2rtcStream: "door_backchannel" })).toBe("go2rtc");
  });

  it("uses HA two-way audio when supported and nothing else is configured", () => {
    expect(talkSource(base)).toBe("native");
  });

  it("offers nothing when HA doesn't support it, it's disabled, or it isn't a camera entity", () => {
    expect(talkSource({ ...base, nativeSupported: false })).toBeNull();
    expect(talkSource({ ...base, nativeEnabled: false })).toBeNull();
    expect(talkSource({ ...base, cameraId: "__cgc_stream_0__" })).toBeNull();
  });
});

describe("nativeTalkUiState", () => {
  it("maps HA microphone states to the card's talkback states", () => {
    expect(nativeTalkUiState("off")).toEqual({ state: "idle", error: "" });
    expect(nativeTalkUiState("connecting")).toEqual({ state: "connecting", error: "" });
    expect(nativeTalkUiState("on")).toEqual({ state: "active", error: "" });
    expect(nativeTalkUiState("denied")).toEqual({ state: "idle", error: "permission-denied" });
    expect(nativeTalkUiState(undefined)).toEqual({ state: "idle", error: "" });
  });

  it("flags plain HTTP, where browsers block the microphone", () => {
    expect(nativeTalkUiState("off", { secureContext: false })).toEqual({
      state: "idle",
      error: "https-required",
    });
  });
});

describe("nativeTalkShouldToggle", () => {
  it("toggle mode toggles on press only", () => {
    expect(nativeTalkShouldToggle({ phase: "down", mode: "toggle", mic: "off" })).toBe(true);
    expect(nativeTalkShouldToggle({ phase: "down", mode: "toggle", mic: "on" })).toBe(true);
    expect(nativeTalkShouldToggle({ phase: "up", mode: "toggle", mic: "on" })).toBe(false);
  });

  it("push-to-talk starts on press and stops on release", () => {
    expect(nativeTalkShouldToggle({ phase: "down", mode: "ptt", mic: "off" })).toBe(true);
    expect(nativeTalkShouldToggle({ phase: "down", mode: "ptt", mic: "on" })).toBe(false);
    expect(nativeTalkShouldToggle({ phase: "up", mode: "ptt", mic: "on" })).toBe(true);
    expect(nativeTalkShouldToggle({ phase: "up", mode: "ptt", mic: "connecting" })).toBe(true);
    expect(nativeTalkShouldToggle({ phase: "up", mode: "ptt", mic: "off" })).toBe(false);
  });

  it("doesn't retry after the browser denied the microphone", () => {
    expect(nativeTalkShouldToggle({ phase: "down", mode: "toggle", mic: "denied" })).toBe(false);
    expect(nativeTalkShouldToggle({ phase: "down", mode: "ptt", mic: "denied" })).toBe(false);
  });
});
