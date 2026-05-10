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
import { parseServiceParts, toFsPath } from "./sensor-source";

export interface CanDeleteArgs {
  /** The src field from a CardItem. */
  src: string | undefined;
  /** Normalized config — only the fields below are read. */
  config: Pick<CameraGalleryCardConfig, "source_mode" | "allow_delete" | "delete_service"> | null;
  /** From `SensorSourceClient.getSrcEntityMap()`. Required for combined-mode gate. */
  srcEntityMap: ReadonlyMap<string, string>;
}

/**
 * Return `true` iff the thumb's trash icon should appear:
 *   - mode is `sensor` or `combined`
 *   - in combined mode, the item is sensor-backed (entry in the map)
 *   - `allow_delete` is on
 *   - `delete_service` parses as `domain.service`
 */
export function canDeleteItem(args: CanDeleteArgs): boolean {
  const { src, config, srcEntityMap } = args;
  if (!src) return false;
  const mode = config?.source_mode;
  if (mode !== "sensor" && mode !== "combined") return false;
  if (mode === "combined" && !srcEntityMap.has(src)) return false;
  if (!config?.allow_delete) return false;
  return parseServiceParts(config?.delete_service) !== null;
}

export interface DeleteItemArgs {
  hass: HomeAssistant | null;
  src: string;
  config: Pick<
    CameraGalleryCardConfig,
    "source_mode" | "allow_delete" | "delete_service" | "delete_confirm"
  > | null;
  srcEntityMap: ReadonlyMap<string, string>;
  /** Confirm prompt; defaults to `window.confirm`. Inject for tests. */
  confirm?: (message: string) => boolean;
}

/**
 * Invoke the configured `delete_service` for `src`. Returns `true` on
 * success, `false` on every gate failure (mode wrong, prefix mismatch,
 * user cancelled the confirm, callService threw).
 *
 * The path-prefix gate (`fsPath.startsWith(DELETE_PREFIX_NORMALIZED)`)
 * is the safety net that prevents a malformed `src` from passing an
 * arbitrary filesystem path to the user's shell command.
 */
export async function deleteItem(args: DeleteItemArgs): Promise<boolean> {
  const { hass, src, config, srcEntityMap, confirm = defaultConfirm } = args;
  if (!hass) return false;
  if (!canDeleteItem({ src, config, srcEntityMap })) return false;

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

function defaultConfirm(message: string): boolean {
  // Browser-only fallback. Tests inject their own.
  return typeof window !== "undefined" && typeof window.confirm === "function"
    ? window.confirm(message)
    : false;
}
