/**
 * Per-camera rotation for the live view (0, 90, 180 or 270 degrees).
 *
 * Pure geometry, no DOM. The card turns the result into CSS variables on the
 * live host (or a grid tile) and into canvas operations for the snapshot.
 *
 * Order of operations: the crop is taken from the camera's own picture
 * first (inside the live host), then the host is rotated. So `crop` keeps
 * meaning "this part of the picture as the camera sends it".
 */

export type Rotation = 0 | 90 | 180 | 270;

export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

/** Snap any input to a supported rotation. Anything unusable becomes 0. */
export function normalizeRotation(value: unknown): Rotation {
  const n = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(n) || n % 90 !== 0) return 0;
  return (((n % 360) + 360) % 360) as Rotation;
}

/** 90 and 270 swap width and height. */
export function isQuarterTurn(rotation: Rotation): boolean {
  return rotation === 90 || rotation === 270;
}

/**
 * The aspect ratio after rotation, in the same "W/H" form the card uses for
 * CSS `aspect-ratio`. Accepts "W/H" or "W:H". Unparseable input is returned
 * unchanged.
 */
export function rotatedAspect(aspect: string, rotation: Rotation): string {
  if (!isQuarterTurn(rotation)) return aspect;
  const parts = String(aspect)
    .split(/[/:]/)
    .map((s) => s.trim());
  if (parts.length !== 2) return aspect;
  const [w, h] = parts;
  if (!(Number(w) > 0) || !(Number(h) > 0)) return aspect;
  return `${h}/${w}`;
}

/**
 * CSS variables for a rotated live picture, or "" for rotation 0 (configs
 * without rotation render exactly as before). The card rotates its own
 * live host element, laid out at the preview pane's size, or at the
 * swapped size for 90/270, so HA's stream element inside keeps filling it
 * as usual. A crop keeps working inside the host, unrotated.
 */
export function rotationStyle(rotation: Rotation): string {
  if (rotation === 0) return "";
  const quarter = isQuarterTurn(rotation);
  return `--rot:${rotation}deg;--rot-w:${quarter ? "100cqh" : "100cqw"};--rot-h:${quarter ? "100cqw" : "100cqh"};`;
}

/**
 * Turn a pan offset measured on screen into the rotated element's own
 * coordinates, so dragging right still moves the picture right.
 */
export function screenToLocal(x: number, y: number, rotation: Rotation): { x: number; y: number } {
  switch (rotation) {
    case 90:
      return { x: y, y: -x };
    case 180:
      return { x: -x, y: -y };
    case 270:
      return { x: -y, y: x };
    default:
      return { x, y };
  }
}

export interface SnapshotGeometry {
  /** Canvas size: the video size, swapped for a quarter turn. */
  width: number;
  height: number;
  /** Rotation to apply around the canvas center, in radians. */
  radians: number;
}

/**
 * Canvas size and rotation for a snapshot of a rotated live picture. Draw
 * with: translate(width / 2, height / 2), rotate(radians), then drawImage at
 * (-videoWidth / 2, -videoHeight / 2).
 */
export function snapshotGeometry(
  videoWidth: number,
  videoHeight: number,
  rotation: Rotation
): SnapshotGeometry {
  const quarter = isQuarterTurn(rotation);
  return {
    width: quarter ? videoHeight : videoWidth,
    height: quarter ? videoWidth : videoHeight,
    radians: (rotation * Math.PI) / 180,
  };
}
