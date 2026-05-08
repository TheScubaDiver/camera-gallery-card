/**
 * Unified card-item shape produced by every data source (sensor, media-source,
 * combined). Render code consumes this; the path back to the original WS shape
 * lives in {@link MediaSourceItem}.
 *
 * Replaces the inline JSDoc `@typedef` historically used in `src/index.js`.
 *
 * `src` is the primary key:
 * - sensor mode: a normalized web path like `/local/recordings/clip.mp4`
 * - media-source mode: a `media-source://…` URI
 * - combined mode: a mix of both — dedupe-by-rel-path collapses overlap, with
 *   sensor entries winning on collision (so `_srcEntityMap` stays authoritative
 *   for delete-eligibility).
 *
 * `dtMs` is set only when the source provides an authoritative timestamp:
 * - Frigate REST API attaches it via the event-id
 * - Frigate media-source URIs encode the event-id and the parser extracts ms
 * - sensor mode never attaches it (path parsing happens in render)
 */
export interface CardItem {
  /** File path (sensor) or media-source URI (media). Stable key. */
  src: string;
  /** Milliseconds since epoch — only when the source provides it. */
  dtMs?: number;
}
