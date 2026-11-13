/**
 * Which tap action applies to a tap on the live view (#244, #288).
 *
 *   - Grid tile: the camera's own `live_cameras[].tap_action`. Without one
 *     the tile keeps its built-in behaviour (focus that camera).
 *   - Single live view: the camera's own `tap_action` first, then the
 *     card-wide `tap_action`.
 *
 * An action of `none` counts as "configured": the tap then does nothing,
 * which is how a user switches a tile's focus behaviour off.
 */

export interface TapActionConfig {
  action: string;
  [key: string]: unknown;
}

export interface TapActionTargetInput {
  /** Per-camera action from the camera's `live_cameras` entry, if any. */
  cameraAction?: unknown;
  /** Card-wide `tap_action`, if any. */
  cardAction?: unknown;
  /** True for a grid tile, false for the single live view. */
  grid: boolean;
}

function usable(value: unknown): TapActionConfig | null {
  if (!value || typeof value !== "object") return null;
  const action = (value as Record<string, unknown>)["action"];
  return typeof action === "string" && action ? (value as TapActionConfig) : null;
}

/** The action to run, or null for the built-in behaviour. */
export function resolveTapAction(input: TapActionTargetInput): TapActionConfig | null {
  const own = usable(input.cameraAction);
  if (own) return own;
  if (input.grid) return null;
  return usable(input.cardAction);
}
