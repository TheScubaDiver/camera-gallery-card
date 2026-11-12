/**
 * Decide what the long-press "Download" action should actually fetch (#204).
 *
 * The playback URL of an item is not always a file. Frigate event clips, for
 * example, resolve through media-source to an HLS playlist
 * (`/api/frigate/<inst>/vod/<cam>/start/<s>/end/<e>/index.m3u8`): fine for
 * playback, but saving it yields a tiny `index.m3u8` instead of the video.
 *
 * - Frigate event clips → the Frigate integration's `clip.mp4` endpoint
 *   (`/api/frigate/<inst>/notifications/<event_id>/clip.mp4`), the same
 *   proxy the card already uses for Frigate thumbnails.
 * - Any other HLS playlist → `stream`: the caller explains instead of saving
 *   a playlist file.
 * - Everything else → the resolved URL, named after its last path segment.
 */

import { FRIGATE_URI_PREFIX } from "../util/frigate";

export type DownloadTarget =
  { kind: "file"; url: string; filename: string } | { kind: "stream"; url: string };

const FRIGATE_EVENT_CLIP_RE = new RegExp(
  `^${FRIGATE_URI_PREFIX.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}/([^/]+)/event/clips/([^/]+)/([^/?#]+)$`
);

/** `{ instance, camera, eventId }` for a Frigate event clip media-source id, else null. */
export function parseFrigateEventClipId(
  src: unknown
): { instance: string; camera: string; eventId: string } | null {
  const m = FRIGATE_EVENT_CLIP_RE.exec(String(src ?? "").trim());
  if (!m) return null;
  return {
    instance: m[1] as string,
    camera: m[2] as string,
    eventId: m[3] as string,
  };
}

function stripQuery(url: string): string {
  return (url.split("?")[0] ?? "").split("#")[0] ?? "";
}

/** Decoded last path segment of a URL, or `"download"`. */
export function filenameFromUrl(url: unknown): string {
  const last =
    stripQuery(String(url ?? ""))
      .replace(/\/+$/, "")
      .split("/")
      .pop() || "";
  try {
    return decodeURIComponent(last) || "download";
  } catch {
    return last || "download";
  }
}

/** True when the URL points at an HLS playlist rather than a media file. */
export function isHlsPlaylistUrl(url: unknown): boolean {
  return /\.m3u8$/i.test(stripQuery(String(url ?? "")));
}

/**
 * @param src         The item id (`media-source://…` URI or sensor path/URL).
 * @param resolvedUrl The browser-reachable playback URL, when already resolved.
 */
export function resolveDownloadTarget(src: unknown, resolvedUrl?: unknown): DownloadTarget {
  const frigate = parseFrigateEventClipId(src);
  if (frigate) {
    const { instance, camera, eventId } = frigate;
    return {
      kind: "file",
      url: `/api/frigate/${encodeURIComponent(instance)}/notifications/${encodeURIComponent(eventId)}/clip.mp4`,
      filename: `${camera}_${eventId}.mp4`,
    };
  }

  const url = String(resolvedUrl ?? "").trim() || String(src ?? "").trim();
  if (isHlsPlaylistUrl(url)) return { kind: "stream", url };
  return { kind: "file", url, filename: filenameFromUrl(url) };
}
