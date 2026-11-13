/**
 * Order of keys in the YAML the editor writes, so related options stay
 * together. Moved out of index.js unchanged.
 */

export const CGC_CONFIG_KEY_ORDER = [
  // ─── Card type ───
  "type",
  // ─── Source ───
  "source_mode",
  "entities",
  "media_sources",
  "frigate_url",
  "path_datetime_format",
  "max_media",
  "frigate_cameras",
  "frigate_labels",
  "frigate_thumb_bbox",
  "frigate_event_cluster",
  "frigate_event_cluster_gap_sec",
  // ─── Gallery ───
  "start_mode",
  "url_id",
  "preview_position",
  "object_fit",
  "controls_mode",
  "clean_mode",
  "fullscreen_zoom",
  "gallery_fullscreen",
  "show_camera_title",
  "persistent_controls",
  "autoplay",
  "auto_muted",
  "show_today",
  "show_media_filter",
  "show_favorite",
  "show_live",
  "preview_close_on_tap",
  "toolbar_order",
  "gallery_pills",
  "gallery_pills_align",
  "gallery_chevrons_enabled",
  // ─── Live ───
  "live_enabled",
  "live_auto_muted",
  "live_cameras",
  "live_camera_entities",
  "live_layout",
  "live_fullscreen",
  "live_grid_labels",
  "live_grid_columns",
  "live_grid_emphasis",
  "live_stream_url",
  "live_stream_name",
  "live_stream_urls",
  "live_go2rtc_url",
  "live_go2rtc_stream",
  "live_pills",
  "live_chevrons_enabled",
  "live_auto_recover",
  "tap_action",
  "live_mic_mode",
  "live_mic_audio_processing",
  "live_mic_shape",
  "live_mic_button_position",
  "live_mic_position",
  "live_native_talk",
  "live_triggers",
  "live_mic_waveform_enabled",
  "live_mic_waveform_sensitivity",
  "live_mic_ice_servers",
  "live_mic_force_relay",
  "live_mic_streams",
  "live_ptz_enabled",
  "live_ptz_position",
  "live_ptz_speed",
  "live_ptz_cameras",
  "menu_buttons",
  // ─── Thumbnails ───
  "thumb_layout",
  "thumb_bar_position",
  "thumb_size",
  "thumb_sort_order",
  "thumbnail_frame_pct",
  "thumb_off_opacity",
  "capture_video_thumbnails",
  // ─── Styling ───
  "aspect_ratio",
  "bar_position",
  "bar_opacity",
  "talkback_opacity",
  "chevron_opacity",
  "pill_size",
  "row_gap",
  "card_height",
  "style_variables",
  // ─── Filters / objects ───
  "object_filters",
  "object_colors",
  "entity_filter_map",
  // ─── Sync / favorites ───
  "sync_entity",
  // ─── Delete ───
  "allow_bulk_delete",
  "delete_confirm",
  "delete_service",
  "frigate_delete_service",
  // ─── Thumbnail menu ───
  "thumb_actions",
  // ─── Advanced ───
  "debug_enabled",
];

export function sortConfigKeysForOutput(config) {
  const out = {};
  for (const k of CGC_CONFIG_KEY_ORDER) {
    if (Object.prototype.hasOwnProperty.call(config, k)) out[k] = config[k];
  }
  // Unknown / forward-compat keys keep their existing order, appended.
  for (const k of Object.keys(config)) {
    if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = config[k];
  }
  return out;
}
