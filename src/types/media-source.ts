/**
 * Hand-typed shapes for the `media_source/browse_media` WebSocket endpoint.
 *
 * Mirrors `homeassistant.components.media_source.models.BrowseMediaSource`
 * (Python). No published TypeScript types exist for this endpoint — the HA
 * frontend defines `MediaPlayerItem` in `src/data/media-player.ts` but it's
 * not packaged.
 */
export interface MediaSourceItem {
  title: string;
  media_class: string;
  media_content_type: string;
  media_content_id: string;
  can_play: boolean;
  can_expand: boolean;
  thumbnail: string | null;
  children_media_class: string | null;
  children?: MediaSourceItem[];
  not_shown?: number;
}
