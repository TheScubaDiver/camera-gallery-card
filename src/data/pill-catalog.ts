/**
 * Catalog of pills that can appear in the gallery overlay strip.
 *
 * The card render reads from this catalog + the user's sparse
 * `gallery_pills` config to decide which pills to show and in what
 * order. Each entry carries:
 *
 *   - `id`           stable string used as the YAML key
 *   - `label`        short human-readable name (editor UI)
 *   - `defaultOrder` position in the row out-of-the-box (lower = earlier)
 *
 * Render logic + condition checks stay in `src/index.js` — this module
 * is purely the metadata that's shared between the renderer and the
 * editor.
 */

export interface PillCatalogEntry {
  id: string;
  label: string;
  defaultOrder: number;
  /**
   * MDI icon name shown next to the label in the editor's drag-en-drop
   * list. Must be present in `CGC_ICONS` (`src/index.js`) — the editor
   * renders via the `svgIcon()` helper which uses a hand-picked subset.
   */
  icon?: string;
  /**
   * Short text shown in the editor's icon slot for pills that render
   * text content at runtime (counter, speed, time read-out) — keeps
   * the editor preview honest about what the actual pill looks like.
   * Takes precedence over `icon` when both are set.
   */
  previewText?: string;
}

/**
 * Gallery overlay pills. Catalog order matches the default render order
 * — first entry sits leftmost, last entry rightmost. Spaced by 10 so a
 * user can squeeze new pills between defaults without renumbering.
 *
 * The back/close-preview pill isn't in the catalog because disabling it
 * would strand users in preview mode with no way out; it's rendered
 * unconditionally before the catalog pills in `src/index.js`.
 */
export const GALLERY_PILL_CATALOG: readonly PillCatalogEntry[] = [
  { id: "object_indicator", label: "Object indicator", defaultOrder: 20, icon: "mdi:magnify" },
  { id: "index_counter", label: "Index counter", defaultOrder: 30, previewText: "1/4" },
  { id: "autoplay_all", label: "Auto-play all", defaultOrder: 33, icon: "mdi:playlist-play" },
  { id: "mute", label: "Mute toggle", defaultOrder: 40, icon: "mdi:volume-high" },
  { id: "playback_speed", label: "Playback speed", defaultOrder: 43, previewText: "1×" },
  {
    id: "pip",
    label: "Picture-in-Picture",
    defaultOrder: 45,
    icon: "mdi:picture-in-picture-bottom-right",
  },
  { id: "fullscreen", label: "Fullscreen", defaultOrder: 50, icon: "mdi:fullscreen" },
  {
    id: "video_time",
    label: "Time read-out (bottom-right)",
    defaultOrder: 60,
    previewText: "0:00",
  },
];

/**
 * Live-view overlay pills. Same shape + helpers as the gallery catalog
 * but drives the pill row on the live-camera screen. Pills with their
 * own gate (hamburger only with menu_buttons configured, PTZ only when
 * supported, etc.) stay hardcoded in `src/index.js`. The picker pill is
 * in the catalog but still gated to ≥2 cameras — its toggle is useful
 * because the chevrons offer an alternative way to switch cameras.
 */
export const LIVE_PILL_CATALOG: readonly PillCatalogEntry[] = [
  { id: "mute", label: "Mute toggle", defaultOrder: 10, icon: "mdi:volume-high" },
  { id: "picker", label: "Camera picker", defaultOrder: 15, icon: "mdi:cctv" },
  {
    id: "pip",
    label: "Picture-in-Picture",
    defaultOrder: 20,
    icon: "mdi:picture-in-picture-bottom-right",
  },
  { id: "fullscreen", label: "Fullscreen", defaultOrder: 30, icon: "mdi:fullscreen" },
  { id: "snapshot", label: "Snapshot", defaultOrder: 35, icon: "mdi:camera" },
  { id: "refresh", label: "Refresh stream", defaultOrder: 40, icon: "mdi:refresh" },
];

/**
 * Gallery top-toolbar buttons (Today / Video-filter / Favorites / Live).
 * Enabled state still lives in the existing `show_*` config keys for
 * backwards-compatibility; this catalog only carries label + default
 * order. Effective order is `toolbar_order[id]` if set, otherwise the
 * `defaultOrder` below. The date-picker pill is not in this catalog —
 * it's always-on and renders at a fixed position before these buttons.
 */
export interface ToolbarCatalogEntry extends PillCatalogEntry {
  /** Config key that holds the boolean enabled-state for this button. */
  showKey: string;
}

export const TOOLBAR_CATALOG: readonly ToolbarCatalogEntry[] = [
  { id: "today", label: "Today", defaultOrder: 10, showKey: "show_today" },
  {
    id: "media_filter",
    label: "Video / image filter",
    defaultOrder: 20,
    showKey: "show_media_filter",
  },
  { id: "favorite", label: "Favorites", defaultOrder: 30, showKey: "show_favorite" },
  { id: "live", label: "Live", defaultOrder: 40, showKey: "show_live" },
];

export interface PillSettings {
  enabled: boolean;
  order: number;
}

/**
 * Resolve a pill's effective settings: user override > catalog default.
 * Pills not mentioned in config use the catalog defaults (enabled, order).
 * Unknown ids in config are ignored.
 */
export function resolvePillSettings(
  catalog: readonly PillCatalogEntry[],
  config: Record<string, { enabled?: boolean; order?: number }> | undefined
): Map<string, PillSettings> {
  const out = new Map<string, PillSettings>();
  for (const entry of catalog) {
    const override = config?.[entry.id];
    const enabled = override?.enabled !== false; // default true
    const order = typeof override?.order === "number" ? override.order : entry.defaultOrder;
    out.set(entry.id, { enabled, order });
  }
  return out;
}

/**
 * Build the final render list — enabled pills sorted by their effective
 * `order`. Ties break by catalog order so the result is deterministic
 * even when two user-supplied orders collide.
 */
export function sortPillsByOrder(
  catalog: readonly PillCatalogEntry[],
  settings: ReadonlyMap<string, PillSettings>
): string[] {
  const items: Array<{ id: string; order: number; catalogIdx: number }> = [];
  catalog.forEach((entry, i) => {
    const s = settings.get(entry.id);
    if (!s || !s.enabled) return;
    items.push({ id: entry.id, order: s.order, catalogIdx: i });
  });
  items.sort((a, b) => a.order - b.order || a.catalogIdx - b.catalogIdx);
  return items.map((x) => x.id);
}
