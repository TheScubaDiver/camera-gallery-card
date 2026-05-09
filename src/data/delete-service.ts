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
  config: Pick<
    CameraGalleryCardConfig,
    "source_mode" | "allow_delete" | "delete_service" | "debug_enabled"
  > | null;
  /** From `SensorSourceClient.getSrcEntityMap()`. Required for combined-mode gate. */
  srcEntityMap: ReadonlyMap<string, string>;
}

/**
 * Return `true` iff the thumb's trash icon should appear:
 *   - mode is `sensor` or `combined`
 *   - in combined mode, the item is sensor-backed (entry in the map)
 *   - `allow_delete` is on
 *   - `delete_service` parses as `domain.service`
 *
 * When `config.debug_enabled` is true, logs the gate decision and the
 * specific failing condition via `console.info` for diagnostics. Remove
 * the logging once the source-mode-flip delete bug (PR #100 review) is
 * confirmed fixed.
 */
export function canDeleteItem(args: CanDeleteArgs): boolean {
  const { src, config, srcEntityMap } = args;
  const log = (result: boolean, reason: string): boolean => {
    if (config?.debug_enabled === true) {
      console.info("[cgc] canDeleteItem", {
        result,
        reason,
        src,
        mode: config?.source_mode,
        allow_delete: config?.allow_delete,
        delete_service: config?.delete_service,
        srcInMap: src ? srcEntityMap.has(src) : null,
        mapSize: srcEntityMap.size,
      });
    }
    return result;
  };

  if (!src) return log(false, "no-src");
  const mode = config?.source_mode;
  if (mode !== "sensor" && mode !== "combined") return log(false, `mode=${mode}`);
  if (mode === "combined" && !srcEntityMap.has(src))
    return log(false, "combined-not-sensor-backed");
  if (!config?.allow_delete) return log(false, "allow_delete=false");
  if (parseServiceParts(config?.delete_service) === null) {
    return log(false, `delete_service=${config?.delete_service ?? ""}`);
  }
  return log(true, "ok");
}

export interface DeleteItemArgs {
  hass: HomeAssistant | null;
  src: string;
  config: Pick<
    CameraGalleryCardConfig,
    "source_mode" | "allow_delete" | "delete_service" | "delete_confirm" | "debug_enabled"
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
 *
 * When `config.debug_enabled` is true, logs the failing gate (or success)
 * via `console.info` for diagnostics. Remove the logging once the
 * source-mode-flip delete bug (PR #100 review) is confirmed fixed.
 */
export async function deleteItem(args: DeleteItemArgs): Promise<boolean> {
  const { hass, src, config, srcEntityMap, confirm = defaultConfirm } = args;
  const log = (result: boolean, reason: string): boolean => {
    if (config?.debug_enabled === true) {
      console.info("[cgc] deleteItem", { result, reason, src });
    }
    return result;
  };

  if (!hass) return log(false, "no-hass");
  if (!canDeleteItem({ src, config, srcEntityMap })) return log(false, "gate-failed");

  const sp = parseServiceParts(config?.delete_service);
  if (!sp) return log(false, "service-parts-null");

  const fsPath = toFsPath(src);
  if (!fsPath || !fsPath.startsWith(DELETE_PREFIX_NORMALIZED)) {
    return log(false, `fs-prefix-mismatch fsPath=${fsPath}`);
  }

  if (config?.delete_confirm) {
    if (!confirm("Are you sure you want to delete this file?")) return log(false, "user-cancelled");
  }

  try {
    await hass.callService(sp.domain, sp.service, { path: fsPath });
    return log(true, "ok");
  } catch (err) {
    return log(false, `callService-threw ${err instanceof Error ? err.message : err}`);
  }
}

function defaultConfirm(message: string): boolean {
  // Browser-only fallback. Tests inject their own.
  return typeof window !== "undefined" && typeof window.confirm === "function"
    ? window.confirm(message)
    : false;
}
