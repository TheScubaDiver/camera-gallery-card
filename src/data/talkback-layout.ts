/**
 * Where the talkback control sits (issue #257).
 *
 *   - `overlay` (default): floats over the live picture, as it always has.
 *   - `below` / `above`: its own row under or over the preview, so it never
 *     covers the camera view (handy on phones).
 *
 * Pure helpers, no DOM. The card renders the same control in both places;
 * these decide which place and how the row variant is laid out.
 */

export type TalkbackPosition = "overlay" | "below" | "above";

export const TALKBACK_POSITIONS: readonly TalkbackPosition[] = ["overlay", "below", "above"];

/** The configured position, falling back to `overlay` for anything else. */
export function talkbackPosition(value: unknown): TalkbackPosition {
  return value === "below" || value === "above" ? value : "overlay";
}

/** True when the control renders in its own row instead of over the video. */
export function isTalkbackRow(position: TalkbackPosition): boolean {
  return position !== "overlay";
}

/**
 * Flex alignment of the row for the round button shape, following
 * `live_mic_button_position`. The bar shape always spans the row.
 */
export function talkbackRowJustify(
  shape: "bar" | "button",
  buttonPosition: unknown
): "stretch" | "flex-start" | "center" | "flex-end" {
  if (shape === "bar") return "stretch";
  if (buttonPosition === "left") return "flex-start";
  if (buttonPosition === "right") return "flex-end";
  return "center";
}
