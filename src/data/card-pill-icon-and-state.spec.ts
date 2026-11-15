// @vitest-environment jsdom
import { render } from "lit";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// #306 in the card: own pill icons, and a control button with its state.
describe("card pills", () => {
  let card: any;

  beforeAll(async () => {
    vi.stubGlobal("__VERSION__", "test-local");
    await import("../index.js");
  });

  afterEach(() => card?.remove());

  function makeCard(config: Record<string, unknown>) {
    card = document.createElement("camera-gallery-card");
    card.requestUpdate = vi.fn();
    card.config = { live_enabled: true, live_cameras: [{ entity: "camera.door" }], ...config };
    card._hass = {
      states: { "cover.gate": { entity_id: "cover.gate", state: "open", attributes: {} } },
      formatEntityState: () => "Open",
      callService: vi.fn(),
    };
    document.body.appendChild(card);
    return card;
  }

  const draw = (tpl: unknown) => {
    const el = document.createElement("div");
    render(tpl, el);
    return el;
  };

  it("draws a live pill with its own icon", () => {
    makeCard({ live_pills: { snapshot: { icon: "mdi:camera-iris" } } });
    const el = draw(card._renderLivePillById("snapshot"));
    expect(el.querySelector("ha-icon")?.getAttribute("icon")).toBe("mdi:camera-iris");
  });

  it("uses icon_on for a muted live pill", () => {
    makeCard({ live_pills: { mute: { icon: "mdi:speaker", icon_on: "mdi:speaker-off" } } });
    card._liveMuted = true;
    expect(
      draw(card._renderLivePillById("mute")).querySelector("ha-icon")?.getAttribute("icon")
    ).toBe("mdi:speaker-off");
    card._liveMuted = false;
    expect(
      draw(card._renderLivePillById("mute")).querySelector("ha-icon")?.getAttribute("icon")
    ).toBe("mdi:speaker");
  });

  it("shows the state next to the icon with show_state", () => {
    makeCard({});
    const el = draw(
      card._renderControlMenuButton({ entity: "cover.gate", icon: "mdi:gate", show_state: true })
    );
    expect(el.querySelector("button span")?.textContent).toBe("Open");
    expect(el.querySelector("button")?.classList.contains("gallery-pill--wide")).toBe(true);
  });

  it("stays an icon-only pill without show_state", () => {
    makeCard({});
    const el = draw(card._renderControlMenuButton({ entity: "cover.gate", icon: "mdi:gate" }));
    expect(el.querySelector("button span")).toBeNull();
  });
});
