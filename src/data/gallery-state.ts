/**
 * What the card should render when it has no gallery items (yet).
 *
 * Media-source listings (e.g. a Reolink SD card) can take seconds. Before
 * #184 a card with a live camera hid its whole gallery chrome while loading
 * (it looked like a live-only card) and a card without one showed a bare
 * "Loading media…" line, so the layout jumped once the clips arrived. While
 * the first listing is in flight the card now renders its normal layout with
 * skeleton thumbnails instead.
 */

export interface GalleryStateInput {
  /** Number of gallery items currently known (before type/favorite filters). */
  itemCount: number;
  /** `source_mode` is `media` or `combined`. */
  usingMediaSource: boolean;
  /** The media-source client is still fetching a listing. */
  mediaLoading: boolean;
  /** A live camera is configured. */
  hasLive: boolean;
}

export interface GalleryState {
  /** No items yet, but a media listing is in flight: render skeletons. */
  loading: boolean;
  /** No items and nothing loading, but a live camera exists (#169). */
  liveOnly: boolean;
  /** Render only this message instead of the card, or `null` to render the card. */
  emptyMessage: string | null;
}

/** Number of placeholder tiles shown in the thumbnail strip while loading. */
export const SKELETON_THUMB_COUNT = 8;

export function galleryState(input: GalleryStateInput): GalleryState {
  const empty = input.itemCount <= 0;
  const loading = empty && input.usingMediaSource && input.mediaLoading;
  const liveOnly = empty && !loading && input.hasLive;
  const emptyMessage = empty && !loading && !liveOnly ? "No media found." : null;
  return { loading, liveOnly, emptyMessage };
}
