/**
 * Pure navigation primitives.
 *
 * The card owns the side effects (`requestUpdate`, `_resetZoom`, scroll
 * pinning, selection state). These helpers only do the index math so it can
 * be unit-tested independently of Lit.
 *
 * Three callers in `src/index.js` previously hand-rolled the same patterns:
 *   - `_stepDay`  — clamp navigation over the day picker (no wrap)
 *   - `_navNext` / `_navPrev` — clamp navigation within the selected day's
 *     filtered list (no wrap)
 *   - `_navLiveCamera` — wrap navigation over the live-camera carousel
 */

/**
 * Step from `activeDay` by `delta` over a descending list of `dayKey`s,
 * clamping at the ends (no wrap). Used by the day-picker chevrons.
 *
 * - `null` `activeDay` (or one not in `days`) is treated as the first
 *   element — same fallback the legacy `_stepDay` used.
 * - Empty `days` returns `null` (caller stays a no-op).
 */
export function stepDay(
  activeDay: string | null,
  delta: 1 | -1,
  days: readonly string[]
): string | null {
  if (!days.length) return null;
  const first = days[0] ?? null;
  const current = activeDay && days.includes(activeDay) ? activeDay : first;
  if (current === null) return null;
  const idx = days.indexOf(current);
  const clamped = Math.min(Math.max(idx + delta, 0), days.length - 1);
  return days[clamped] ?? null;
}

/**
 * Move `current` by `delta` over a circular range `[0, length)`. Negative
 * deltas wrap correctly. Returns `current` unchanged when `length <= 0`.
 *
 * Used by the live-camera carousel where the user expects the picker to
 * cycle through cameras endlessly.
 */
export function circularNav(current: number, delta: number, length: number): number {
  if (length <= 0) return current;
  const offset = (((current + delta) % length) + length) % length;
  return offset;
}

/**
 * Step forward in a non-wrapping list. Returns `null` at the end so the
 * caller stays a no-op (matching `_navNext`'s `if (i >= listLen - 1) return;`).
 *
 * `current` may be `null`/`undefined` — treated as `0` so a fresh selection
 * advances to index 1, matching the legacy behaviour where
 * `this._selectedIndex ?? 0` is the implicit start.
 */
export function nextInList(current: number | null | undefined, length: number): number | null {
  const i = current ?? 0;
  if (length <= 0) return null;
  if (i >= length - 1) return null;
  return i + 1;
}

/**
 * Step backward in a non-wrapping list. Returns `null` at index 0 so the
 * caller stays a no-op.
 */
export function prevInList(current: number | null | undefined): number | null {
  const i = current ?? 0;
  if (i <= 0) return null;
  return i - 1;
}
