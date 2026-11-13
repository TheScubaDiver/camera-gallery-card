// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";

// Hybrid view: live feed with a side drawer of clips, opened from the CLIPS
// edge toggle. The gallery toolbar and thumbnail strip stay hidden.
beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  await import("../index.js");
});

const hass: any = {
  states: {
    "camera.door": {
      entity_id: "camera.door",
      state: "idle",
      attributes: { friendly_name: "Door" },
    },
    "sensor.files": {
      entity_id: "sensor.files",
      state: "2",
      attributes: { fileList: ["/media/a/20260101_120000.mp4", "/media/a/20260101_130000.mp4"] },
    },
  },
  user: { is_admin: true },
  locale: { language: "en", time_format: "24" },
  callWS: vi.fn(async () => ({})),
  callService: vi.fn(),
  hassUrl: (p: string) => p,
  connection: {
    subscribeEvents: vi.fn(async () => () => {}),
    subscribeMessage: vi.fn(async () => () => {}),
  },
};

async function makeCard(startMode: string) {
  const card: any = document.createElement("camera-gallery-card");
  card.setConfig({
    type: "custom:camera-gallery-card",
    entities: ["sensor.files"],
    path_datetime_format: "YYYYMMDD_HHmmss",
    live_enabled: true,
    live_cameras: [{ entity: "camera.door" }],
    start_mode: startMode,
  });
  card.hass = hass;
  document.body.appendChild(card);
  await card.updateComplete;
  return card;
}

describe("hybrid view", () => {
  it("starts in hybrid mode with the CLIPS toggle and no gallery toolbar", async () => {
    const card = await makeCard("hybrid");
    expect(card._viewMode).toBe("hybrid");
    expect(card._isLiveActive()).toBe(true);
    expect(card.shadowRoot.querySelector(".hybrid-edge-toggle")).not.toBeNull();
    expect(card.shadowRoot.querySelector(".topbar")).toBeNull();
    card.remove();
  });

  it("opens the drawer from the toggle", async () => {
    const card = await makeCard("hybrid");
    card.shadowRoot.querySelector(".hybrid-edge-toggle").click();
    await card.updateComplete;
    expect(card._hybridDrawerOpen).toBe(true);
    expect(card.shadowRoot.querySelector(".hybrid-drawer.open")).not.toBeNull();
    card.remove();
  });

  it("pulses the camera name pill only in hybrid mode", async () => {
    const hybrid = await makeCard("hybrid");
    expect(hybrid.shadowRoot.querySelector(".gallery-pill--live")).not.toBeNull();
    hybrid.remove();
    const live = await makeCard("live");
    expect(live.shadowRoot.querySelector(".gallery-pill--info")).not.toBeNull();
    expect(live.shadowRoot.querySelector(".gallery-pill--live")).toBeNull();
    live.remove();
  });

  it("has no drawer in gallery mode", async () => {
    const card = await makeCard("gallery");
    expect(card.shadowRoot.querySelector(".hybrid-edge-toggle")).toBeNull();
    card.remove();
  });
});
