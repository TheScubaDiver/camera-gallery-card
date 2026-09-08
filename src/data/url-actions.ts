/**
 * Deep-link parsing for HA notification actions (issue #218).
 *
 * A notification action can point at `?cgc_id=<id>&cgc_view=…&cgc_camera=…`
 * to open this card straight into a specific camera's live view or the
 * gallery. Opt-in only: without a configured `url_id` the card ignores the
 * query string entirely, because it is page-scoped and would otherwise hit
 * every camera-gallery-card on the dashboard at once.
 *
 * The URL is attacker-supplyable, so `cgc_camera` is only honored when it
 * matches one of the card's own configured cameras, and every comparison is
 * exact/trimmed rather than fuzzy — bad input is ignored, never thrown on.
 *
 * `cgc_view=gallery` maps to the internal `"media"` view mode; the URL word
 * follows `start_mode`'s user-facing vocabulary instead.
 */

export interface UrlActions {
  /** The card's internal view mode, or null to leave it alone. */
  view: "live" | "media" | null;
  /** A validated camera entity id from the card's own list, or null. */
  camera: string | null;
}

// Frozen — this object is shared across every call that opts out, so it must
// stay read-only rather than become a footgun for a future caller that
// mutates its result in place.
const NULL_ACTIONS: UrlActions = Object.freeze({ view: null, camera: null });

export function parseUrlActions(opts: {
  /** A location search string, with or without the leading "?". */
  search: string | null | undefined;
  /** The card's `url_id` config value. Absent or empty means opt out. */
  urlId: string | null | undefined;
  /** The card's own live camera options. The allow-list for `cgc_camera`. */
  cameras: readonly string[];
  /** Whether the card has live config at all. */
  hasLiveConfig: boolean;
}): UrlActions {
  const urlId = (opts.urlId ?? "").trim();
  if (!urlId) return NULL_ACTIONS;

  const params = new URLSearchParams(opts.search ?? "");
  const cgcId = (params.get("cgc_id") ?? "").trim();
  if (cgcId !== urlId) return NULL_ACTIONS;

  // Exact match only — every other enum in this codebase is case-sensitive,
  // so `cgc_view=LIVE` is treated the same as any other unrecognized value.
  const rawView = params.get("cgc_view");
  let view: "live" | "media" | null =
    rawView === "live" ? "live" : rawView === "gallery" ? "media" : null;

  const rawCamera = (params.get("cgc_camera") ?? "").trim();
  const validCamera = rawCamera && opts.cameras.includes(rawCamera) ? rawCamera : null;

  let camera: string | null = null;
  if (rawView === "gallery") {
    // Explicit gallery wins — the gallery isn't camera-scoped, so a camera
    // here has nothing sane to do.
    camera = null;
  } else if (validCamera) {
    camera = validCamera;
    view = "live";
  }

  if (view === "live" && !opts.hasLiveConfig) return NULL_ACTIONS;

  return { view, camera };
}
