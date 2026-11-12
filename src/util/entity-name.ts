/**
 * Entity display names that match Home Assistant's built-in cards.
 *
 * Since 2026.11 HA composes display names from the entity name plus its
 * context (usually the device), and `friendly_name` is slated for
 * deprecation. `hass.formatEntityName` (HA 2026.4+) produces the same name
 * the built-in cards show; on older versions we fall back to
 * `friendly_name`.
 */

import type { HassEntity } from "../types/hass";

/** The slice of `hass` this module needs. */
export interface EntityNameSource {
  states?: Readonly<Record<string, HassEntity>> | undefined;
  formatEntityName?:
    ((stateObj: HassEntity, name?: unknown, options?: unknown) => string) | undefined;
}

/**
 * Display name for `entityId`, or `""` when Home Assistant knows nothing
 * about it (callers pick their own fallback, e.g. the entity id).
 */
export function entityDisplayName(
  hass: EntityNameSource | null | undefined,
  entityId: string
): string {
  const stateObj = hass?.states?.[entityId];
  if (!stateObj) return "";
  if (typeof hass?.formatEntityName === "function") {
    try {
      const name = String(hass.formatEntityName(stateObj) ?? "").trim();
      if (name) return name;
    } catch {
      // Older or partial frontends: fall through to friendly_name.
    }
  }
  const friendly = stateObj.attributes?.["friendly_name"];
  return typeof friendly === "string" ? friendly.trim() : "";
}

/**
 * Lower-cased text to search an entity by: its display name, its legacy
 * `friendly_name` (old names stay searchable) and its id.
 */
export function entitySearchText(
  hass: EntityNameSource | null | undefined,
  entityId: string
): string {
  const friendly = hass?.states?.[entityId]?.attributes?.["friendly_name"];
  return [entityDisplayName(hass, entityId), typeof friendly === "string" ? friendly : "", entityId]
    .join(" ")
    .toLowerCase();
}
