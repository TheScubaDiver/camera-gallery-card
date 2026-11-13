/**
 * Aspect ratio of the live picture, from whatever element shows it (#289).
 *
 * Most cameras stream video (`<video>`, `videoWidth`/`videoHeight`). MJPEG
 * cameras (ESP32 and other simple IP cameras) are shown by Home Assistant
 * as an `<img>` pointing at `camera_proxy_stream`; their size is
 * `naturalWidth`/`naturalHeight`, known once the first frame arrived.
 */

interface MediaLike {
  localName?: string;
  videoWidth?: number;
  videoHeight?: number;
  naturalWidth?: number;
  naturalHeight?: number;
}

/** "W/H" for a video or image whose size is known, otherwise null. */
export function mediaAspect(el: MediaLike | null | undefined): string | null {
  if (!el) return null;
  const isVideo = el.localName === "video";
  const w = isVideo ? el.videoWidth : el.naturalWidth;
  const h = isVideo ? el.videoHeight : el.naturalHeight;
  if (!w || !h || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  return `${w}/${h}`;
}
