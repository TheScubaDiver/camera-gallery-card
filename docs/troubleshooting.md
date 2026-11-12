# Troubleshooting

[← Back to README](../README.md)

Common problems and how to fix them.

## Troubleshooting

**Gallery is empty.**

- In **sensor mode**: check that the sensor entity exists (_Developer Tools → States_) and its `fileList` attribute actually has files. If empty, FileTrack isn't seeing the folder.
- In **media mode**: open the editor and use the **media folder browser** — can you see your files there?
- Frigate? Make sure the Frigate HA integration is loaded (_Settings → Devices & Services_).

**Live view says "offline" or shows a placeholder.**
The camera entity is unavailable in Home Assistant. Check it in _Developer Tools → States_ — it must report a live state to stream.

**Frigate clips don't appear.**
The `path_datetime_format` must match Frigate's path layout. Use the editor's **Auto-detect path datetime format** button (Advanced → Path parsing) to let the card propose the right pattern, or see [Path datetime format](sources.md#path-datetime-format) for examples.

**Items load but aren't grouped by day (no dates, no day navigation).**
`path_datetime_format` is missing or doesn't match your filenames. The card needs it to extract dates from paths — without a match, items stay undated and the timeline loses day grouping, day navigation and time-based sort. The only built-in exception is Frigate via `media-source://frigate/...` URIs, which carry their own event-id timestamps. Use **Auto-detect** in the editor (Advanced → Path parsing), or see [Path datetime format](sources.md#path-datetime-format).

**Delete does nothing / errors.**
Check that the `shell_command` or `rest_command` you point to is actually defined in `configuration.yaml` and that you restarted (or reloaded YAML) afterwards. Variable names like `{{ path }}` and `{{ event_id }}` must be **exact** — the card passes those names, renaming them breaks the call.

**Need more info?** Turn on **Debug mode** under **Advanced → Diagnostics** — a debug pill appears in live view; tap it for a diagnostics report with version, HA info, Frigate state and runtime stats. Attach the contents when filing an [issue](https://github.com/TheScubaDiver/camera-gallery-card/issues).

---

### Debug mode

Turn on **Debug mode** under **Advanced → Diagnostics** to show a debug pill in live view. Tapping it opens a diagnostics report with card version, HA info, Frigate state, runtime queue stats, and the active source/path. Useful for support questions and issue reports.
