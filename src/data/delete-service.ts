/**
 * Pure helpers for the configured `delete_service` shell-command flow.
 *
 * Two functions, no class:
 *   - {@link canDeleteItem} — gate that the render path uses to
 *     enable/disable the trash icon on a thumb.
 *   - {@link deleteItem} — invokes `hass.callService(domain, service, { path })`
 *     for the configured delete service after path-prefix validation.
 *
 * Why pure helpers and not a `DeleteServiceClient` class: the only
 * "state" they need (the source-entity map for combined-mode delete
 * eligibility) lives on `SensorSourceClient`. Threading a getter through
 * the args is simpler than a third client.
 *
 * Audit C4: combined-mode deletion only flows through the sensor's
 * delete service. A media-source URI in combined mode is intentionally
 * not deletable — that's a property the gate enforces, not a bug. If a
 * future PR adds media-source deletion, this file is the seam.
 */

import { DELETE_PREFIX_NORMALIZED } from "../const";
import type { CameraGalleryCardConfig } from "../config/normalize";
import type { HomeAssistant } from "../types/hass";
import { frigateEventIdFromSrc, isFrigateRoot } from "../util/frigate";
import { parseServiceParts, toFsPath } from "./sensor-source";

export interface CanDeleteArgs {
  /** The src field from a CardItem. */
  src: string | undefined;
  /** Normalized config — only the fields below are read. */
  config: Pick<
    CameraGalleryCardConfig,
    "source_mode" | "allow_delete" | "delete_service" | "frigate_delete_service"
  > | null;
  /** From `SensorSourceClient.getSrcEntityMap()`. Required for combined-mode gate. */
  srcEntityMap: ReadonlyMap<string, string>;
}

/**
 * `true` when `src` is a Frigate event item AND a `frigate_delete_service`
 * is configured. Used both as a delete-eligibility check and as the
 * dispatch switch in `deleteItem`. Requires the URI to carry a parseable
 * Frigate event id (snapshots and clip events qualify; recordings don't).
 */
function isFrigateDeleteEligible(
  src: string | undefined,
  config: Pick<CameraGalleryCardConfig, "frigate_delete_service"> | null
): boolean {
  if (!src) return false;
  if (!isFrigateRoot(src)) return false;
  if (frigateEventIdFromSrc(src) === null) return false;
  return parseServiceParts(config?.frigate_delete_service) !== null;
}

/**
 * Return `true` iff the thumb's trash icon should appear:
 *   - sensor item: mode is `sensor` or `combined` (with sensor-backed src),
 *     `allow_delete` is on, and `delete_service` parses.
 *   - Frigate event item (any mode): `frigate_delete_service` is configured
 *     and `allow_delete` is on. The two paths are independent — a setup
 *     can have only-sensor-delete, only-Frigate-delete, or both.
 */
export function canDeleteItem(args: CanDeleteArgs): boolean {
  const { src, config, srcEntityMap } = args;
  if (!src) return false;
  if (!config?.allow_delete) return false;
  // Frigate path — works in any mode where the item is a Frigate event.
  if (isFrigateDeleteEligible(src, config)) return true;
  // Sensor / combined-sensor-backed path.
  const mode = config?.source_mode;
  if (mode !== "sensor" && mode !== "combined") return false;
  if (mode === "combined" && !srcEntityMap.has(src)) return false;
  return parseServiceParts(config?.delete_service) !== null;
}

export interface DeleteItemArgs {
  hass: HomeAssistant | null;
  src: string;
  config: Pick<
    CameraGalleryCardConfig,
    "source_mode" | "allow_delete" | "delete_service" | "frigate_delete_service" | "delete_confirm"
  > | null;
  srcEntityMap: ReadonlyMap<string, string>;
  /** Confirm prompt; defaults to `window.confirm`. Inject for tests. */
  confirm?: (message: string) => boolean;
}

/**
 * Invoke the appropriate delete service for `src`. Two dispatch paths:
 *
 *   1. **Frigate event item** — calls `frigate_delete_service` with
 *      `{ event_id, camera }` so the configured `rest_command` can hit
 *      Frigate's `DELETE /api/events/<id>` endpoint via HA (no CORS,
 *      no `frigate_url` required).
 *
 *   2. **Sensor / combined-sensor item** — calls `delete_service` with
 *      `{ path }` (the legacy shell-command flow). The path-prefix gate
 *      (`fsPath.startsWith(DELETE_PREFIX_NORMALIZED)`) prevents a
 *      malformed `src` from passing an arbitrary filesystem path to
 *      the user's shell command.
 *
 * Returns `true` on success, `false` on any gate failure (mode wrong,
 * prefix mismatch, user cancelled, callService threw).
 */
export async function deleteItem(args: DeleteItemArgs): Promise<boolean> {
  const { hass, src, config, srcEntityMap, confirm = defaultConfirm } = args;
  if (!hass) return false;
  if (!canDeleteItem({ src, config, srcEntityMap })) return false;

  // Frigate dispatch wins when the URI is a Frigate event AND the
  // service is configured — leaves the sensor path alone in combined
  // setups for non-Frigate items.
  if (isFrigateDeleteEligible(src, config)) {
    const sp = parseServiceParts(config?.frigate_delete_service);
    if (!sp) return false;
    const eventId = frigateEventIdFromSrc(src);
    if (!eventId) return false;
    if (config?.delete_confirm) {
      if (!confirm("Delete this Frigate event?")) return false;
    }
    // Camera segment: `media-source://frigate/<inst>/event/clips/<camera>/<id>`.
    // Some users template `{{ camera }}` into their rest_command for path
    // interpolation; pass it through alongside `event_id`.
    const camera = extractFrigateCameraFromSrc(src);
    try {
      await hass.callService(sp.domain, sp.service, { event_id: eventId, camera });
      return true;
    } catch {
      return false;
    }
  }

  // Sensor / combined-sensor path.
  const sp = parseServiceParts(config?.delete_service);
  if (!sp) return false;

  const fsPath = toFsPath(src);
  if (!fsPath || !fsPath.startsWith(DELETE_PREFIX_NORMALIZED)) return false;

  if (config?.delete_confirm) {
    if (!confirm("Are you sure you want to delete this file?")) return false;
  }

  try {
    await hass.callService(sp.domain, sp.service, { path: fsPath });
    return true;
  } catch {
    return false;
  }
}

/** Extract the camera segment from a Frigate event URI. Returns "" when not parseable. */
function extractFrigateCameraFromSrc(src: string): string {
  // Shape: `media-source://frigate/<inst>/event/<media_type>/<camera>/<event_id>`
  const m = String(src ?? "").match(/^media-source:\/\/frigate\/[^/]+\/event\/[^/]+\/([^/]+)\//);
  return m?.[1] ?? "";
}

function defaultConfirm(message: string): boolean {
  // Browser-only fallback. Tests inject their own.
  return typeof window !== "undefined" && typeof window.confirm === "function"
    ? window.confirm(message)
    : false;
}
