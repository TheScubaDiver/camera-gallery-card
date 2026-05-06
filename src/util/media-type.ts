/**
 * Media-type detection helpers.
 *
 * Pure, framework-free predicates for classifying URLs/paths by their
 * extension. The card uses these to decide whether a thumbnail needs a
 * first-frame poster (videos) or can render the file directly (images).
 *
 * Extension list intentionally mirrors the one used by `pairing.ts` for
 * the video/thumbnail pair-by-stem heuristic — the two are kept in
 * sync by hand. They use different regex shapes (capturing vs. just
 * testing), so a shared constant doesn't simplify the code.
 */

const VIDEO_EXTENSION_RE = /\.(mp4|webm|mov|m4v)$/i;

/**
 * True when `src` looks like a video file URL/path. Strips any query
 * string and fragment before testing the extension; case-insensitive.
 */
export function isVideo(src: string | null | undefined): boolean {
  if (src === null || src === undefined) return false;
  const path = String(src).split("?")[0]?.split("#")[0] ?? "";
  return VIDEO_EXTENSION_RE.test(path);
}
