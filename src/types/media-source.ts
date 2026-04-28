/**
 * Hand-typed shapes for the `media_source/browse_media` WebSocket endpoint.
 *
 * Mirrors `homeassistant.components.media_source.models.BrowseMediaSource`
 * (Python). No published TypeScript types exist for this endpoint — the HA
 * frontend defines `MediaPlayerItem` in `src/data/media-player.ts` but it's
 * not packaged.
 */

/**
 * Canonical Home Assistant media classes. Used for `media_class` and
 * `children_media_class`.
 *
 * Source: `homeassistant.components.media_player.const.MediaClass` —
 * https://github.com/home-assistant/core/blob/dev/homeassistant/components/media_player/const.py
 */
export type MediaClass =
  | "album"
  | "app"
  | "artist"
  | "channel"
  | "composer"
  | "contributor"
  | "directory"
  | "episode"
  | "game"
  | "genre"
  | "image"
  | "movie"
  | "music"
  | "playlist"
  | "podcast"
  | "season"
  | "track"
  | "tv_show"
  | "url"
  | "video";

export interface MediaSourceItem {
  title: string;
  media_class: MediaClass;
  /**
   * Free-form content type; often a MIME type (`"video/mp4"`) but also
   * domain-specific values like `"movie"` or `"directory"`. Don't narrow.
   */
  media_content_type: string;
  media_content_id: string;
  can_play: boolean;
  can_expand: boolean;
  thumbnail: string | null;
  children_media_class: MediaClass | null;
  /**
   * Children are returned by reference from the WS response — `readonly`
   * prevents accidental mutation propagating back to the cache.
   */
  children?: readonly MediaSourceItem[];
  not_shown?: number;
}
