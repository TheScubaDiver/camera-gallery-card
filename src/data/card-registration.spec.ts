import { describe, expect, it } from "vitest";

import { normalizeConfig } from "../config/normalize";
import type { HassEntity } from "../types/hass";
import { CARD_GRID_OPTIONS, cardEntitySuggestion } from "./card-registration";

const cam = {
  entity_id: "camera.voordeur",
  state: "idle",
  attributes: {},
} as unknown as HassEntity;
const hass = { states: { "camera.voordeur": cam } };

describe("CARD_GRID_OPTIONS", () => {
  it("uses the 12-column sections grid (full width, min half)", () => {
    expect(CARD_GRID_OPTIONS).toEqual({ columns: 12, min_columns: 6 });
  });
});

describe("cardEntitySuggestion", () => {
  it("suggests a live view for a camera entity", () => {
    const s = cardEntitySuggestion(hass, "camera.voordeur");
    expect(s?.config).toMatchObject({
      type: "custom:camera-gallery-card",
      start_mode: "live",
      live_enabled: true,
      live_cameras: [{ entity: "camera.voordeur", name: "" }],
    });
  });

  it("produces a config the card accepts", () => {
    const s = cardEntitySuggestion(hass, "camera.voordeur");
    expect(() => normalizeConfig(s!.config)).not.toThrow();
  });

  it("returns null for other domains and unknown cameras", () => {
    expect(cardEntitySuggestion(hass, "light.porch")).toBeNull();
    expect(cardEntitySuggestion(hass, "camera.missing")).toBeNull();
    expect(cardEntitySuggestion(null, "camera.voordeur")).toBeNull();
  });
});
