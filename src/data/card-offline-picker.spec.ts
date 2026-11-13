// @vitest-environment jsdom
import { render } from "lit";
import { beforeAll, describe, expect, it, vi } from "vitest";

// An offline camera replaces the live stage with a placeholder. The camera
// picker used to live only in the live stage, so the picker pill did nothing
// on an offline camera: you couldn't switch away from it.
beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  await import("../index.js");
});

function makeCard(state: string) {
  const card: any = document.createElement("camera-gallery-card");
  card.requestUpdate = vi.fn();
  card.config = {
    live_enabled: true,
    live_layout: "single",
    live_cameras: [
      { entity: "camera.achtertuin", name: "" },
      { entity: "camera.voordeur", name: "" },
    ],
  };
  card._hass = {
    states: {
      "camera.achtertuin": {
        entity_id: "camera.achtertuin",
        state,
        attributes: { friendly_name: "Tapo Achtertuin" },
      },
      "camera.voordeur": {
        entity_id: "camera.voordeur",
        state: "idle",
        attributes: { friendly_name: "Voordeur" },
      },
    },
  };
  card._liveSelectedCamera = "camera.achtertuin";
  card._getLiveCameraOptions = () => ["camera.achtertuin", "camera.voordeur"];
  return card;
}

function renderInner(card: any) {
  const host = document.createElement("div");
  render(card._renderLiveInner(), host);
  return host;
}

describe("camera picker on an offline camera", () => {
  it("shows the picker over the offline placeholder", () => {
    const card = makeCard("unavailable");
    card._showLivePicker = true;
    const host = renderInner(card);
    expect(host.querySelector(".live-offline")).not.toBeNull();
    expect(host.querySelector(".live-picker")).not.toBeNull();
  });

  it("shows no picker until it is opened", () => {
    const card = makeCard("unavailable");
    card._showLivePicker = false;
    const host = renderInner(card);
    expect(host.querySelector(".live-offline")).not.toBeNull();
    expect(host.querySelector(".live-picker")).toBeNull();
  });

  it("still shows the picker for an online camera", () => {
    const card = makeCard("idle");
    card._showLivePicker = true;
    const host = renderInner(card);
    expect(host.querySelector(".live-offline")).toBeNull();
    expect(host.querySelector(".live-picker")).not.toBeNull();
  });
});
