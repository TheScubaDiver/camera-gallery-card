/**
 * How the card presents itself to Home Assistant's dashboard UI.
 *
 * - {@link CARD_GRID_OPTIONS}: size in the sections view (HA 2024.11+
 *   `getGridOptions`, 12-column grid). Replaces the deprecated
 *   `getLayoutOptions` (4-column grid), which is kept only for older HA.
 * - {@link cardEntitySuggestion}: opt-in for the card picker's "By entity"
 *   tab (HA 2026.6+): picking a camera offers this card under "Community".
 */

import type { HassEntity } from "../types/hass";

/** Full width by default; at least half the section wide. */
export const CARD_GRID_OPTIONS = { columns: 12, min_columns: 6 } as const;

/** Legacy (pre-2024.11) equivalent of {@link CARD_GRID_OPTIONS}. */
export const CARD_LAYOUT_OPTIONS = { grid_columns: 4, grid_min_columns: 2 } as const;

export interface CardSuggestion {
  label?: string;
  config: Record<string, unknown>;
}

/**
 * Card-picker suggestion for `entityId`: a live view of that camera (the
 * kiosk-style live-only config, so it works without a media source).
 * `null` for anything that isn't a known camera entity.
 */
export function cardEntitySuggestion(
  hass: { states?: Readonly<Record<string, HassEntity>> } | null | undefined,
  entityId: string
): CardSuggestion | null {
  const id = String(entityId ?? "");
  if (!id.startsWith("camera.") || !hass?.states?.[id]) return null;
  return {
    config: {
      type: "custom:camera-gallery-card",
      source_mode: "sensor",
      entities: [],
      start_mode: "live",
      live_enabled: true,
      live_cameras: [{ entity: id, name: "" }],
    },
  };
}
