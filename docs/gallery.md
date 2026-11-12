# Gallery

[← Back to README](../README.md)

The timeline gallery: preview, thumbnails, filters, favorites, the long-press menu and deleting.

### Gallery

- Image & video preview
- **Fullscreen image viewer** — tap to open in fullscreen, rotates to landscape on mobile, with pinch-to-zoom, pan, double-tap and mouse wheel zoom (turn zoom off with `fullscreen_zoom: false`)
- **Video clip fullscreen** — the card's own overlay by default (keeps your place in the clip); optionally the platform's native player via `gallery_fullscreen: video`
- Timeline thumbnails with lazy loading
- Day grouping, with a **date picker** and Today button to jump between days
- **Scroll time pill** — while you scroll the thumbnails, a small pill shows the date and time of the items in view
- Filename timestamp parsing
- Object filter buttons with custom icon support
- Object detection pill in timestamp bar
- Horizontal or vertical thumbnail layout
- Mobile friendly
- Media type icon (image / video)
- Cover / Contain option for media display
- **Preview-only mode** (`clean_mode`) — the card shows either the gallery or the preview, never both. Tap a thumbnail to open it full size; the back button returns to the gallery
- **Favorites** — star any item with a tap; filter the timeline to show only favorites
- **Prev / next navigation** — chevron arrows on the preview (hide them with `gallery_chevrons_enabled: false`), <kbd>←</kbd>/<kbd>→</kbd> in the fullscreen viewer on desktop, and on touch screens swipe left or right on a preview image
- **Swipe to delete** — on touch screens, swipe a thumbnail to the left to delete it (only when a delete service is set up for that item)
- **Preview pills** — configurable buttons over the preview: object indicator, index counter (`3/12`), auto-play all (plays the following clips one after another), mute, playback speed (1×, 2×, 0.5×), Picture-in-Picture, fullscreen and the time read-out. Turn each one on or off and reorder them in the editor (see [Pills and toolbar](styling.md#pills-and-toolbar))
- **Custom menu actions** — add your own entries to the long-press menu that call a Home Assistant action with the item's path or URL (see [Custom menu actions](#custom-menu-actions))
- **Sync entity** — set `sync_entity` to an `input_text` helper and the card writes the file name of the item you are viewing into it, for use in automations

<img width="490" height="407" alt="Scherm­afbeelding 2026-03-29 om 17 05 49" src="https://github.com/user-attachments/assets/6817a0ae-5d57-4ebf-8c8d-b5452c66ad66" />

### Thumbnails

- Automatic frame capture for **all** video sources in media source mode
  - Frigate cameras: Frigate snapshot
  - All other sources (NAS, Blue Iris, etc.): a frame captured from the clip
- Sensor mode: a frame captured from the clip
- **Choose the frame** — `thumbnail_frame_pct` picks where in the clip the frame is taken: `0` (default) is the first frame, `100` the last
- **Save bandwidth** — `capture_video_thumbnails: false` skips frame capture entirely and only shows thumbnails the server provides. Useful on slow or metered connections
- **Paired image + video** — when a snapshot and clip share the same filename stem they're shown as one item, with the image used as the thumbnail
  - Snapshots stamped a few seconds off their clip pair too (Reolink FTP: `Cam_00_20261012111141.jpg` + `Cam_00_20261012111139.mp4`), when `path_datetime_format` dates both files, their names differ only in the timestamp digits, and the times are within 15s. A clip that started before the snapshot wins over a closer one that started after it

### Video controls

- Video autoplay toggle (gallery)
- Separate auto-mute toggle for gallery and live view
- Per-object filter color customization

<img width="441" height="307" alt="Scherm­afbeelding 2026-03-29 om 20 49 53" src="https://github.com/user-attachments/assets/bdcde10e-b882-444f-a99d-0ae0073e68a7" />

### Actions

- **Menu buttons** — configure custom action buttons (toggle, navigate, perform action, etc.) in the hamburger menu during live view, or directly among the live controls. A button on an `input_select` / `select` entity opens a list of its options (see [Live menu buttons](live-view.md#live-menu-buttons))
- Delete (sensor files + Frigate clips)
- Multiple delete with red selection style
- Download
- Long-press action menu

## Object filters

Supported built-in filters:

```
bicycle · bird · bus · car · cat · dog · motorcycle · person · truck · visitor
```

Custom filters with a custom icon can be added via the editor.

A filter matches when its name (or an alias, such as `persoon` for `person`) appears anywhere in the filename or media title. A file tagged with several objects, like `frontdoor_1200_motorcycle_person.mp4`, shows up under each of them. Its thumbnail badge uses the first match in your filter order.

Object filter colors can be assigned per filter type in the editor.

> [!TIP]
> Recommended filename format for object detection:
>
> ```
> 2026-03-09_12-31-10_person.jpg
> 2026-03-09_12-31-10_car.mp4
> ```

---

## Custom menu actions

Add your own entries to the long-press (right-click) menu of a thumbnail. Each one calls a Home Assistant action, such as a script, with details of the pressed item. This lets you, for example, archive a recording to permanent storage without downloading it first. You can set them up in the editor's Gallery tab under **Long-press actions**, or in YAML.

```yaml
thumb_actions:
  - name: Archive
    icon: mdi:archive-arrow-down
    perform_action: script.archive_clip
    data:
      path: "{path}"
      media_id: "{media_id}"
    confirmation: true
```

| Key              | Description                                                  |
| ---------------- | ------------------------------------------------------------ |
| `name`           | Menu label (required)                                        |
| `icon`           | MDI icon (default `mdi:gesture-tap-button`)                  |
| `perform_action` | Action to call, in `domain.service` form (required)          |
| `data`           | Action data. Placeholders below are filled in per item       |
| `target`         | Optional action target (`entity_id`, `device_id`, `area_id`) |
| `confirmation`   | `true`, or `{ text: "..." }`, to ask before running          |

Placeholders, usable in any string inside `data` and `target`:

| Placeholder  | Value                                                                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{path}`     | Filesystem path on the HA host, when the card can derive it: `media-source://media_source/local/…` becomes `/media/…`, and `/local/…` becomes `/config/www/…`. Empty for other media folders and for integration sources such as Frigate or Reolink |
| `{media_id}` | The item's own id: the `media-source://…` URI, or the sensor file path                                                                                                                                                                              |
| `{url}`      | A URL the browser can open. For media-source items this is a signed, short-lived URL                                                                                                                                                                |
| `{filename}` | The file name, e.g. `clip_2026-06-12_12-00-00.mp4`                                                                                                                                                                                                  |

The placeholders use single braces, so they never clash with `{{ }}` templates inside your script. A script receives the values as variables, for example:

```yaml
script:
  archive_clip:
    fields:
      path:
        description: File to archive
    sequence:
      - action: shell_command.archive_clip
        data:
          path: "{{ path }}"

shell_command:
  archive_clip: 'cp "{{ path }}" /media/archive/'
```

> [!NOTE]
> If your media lives in a folder you added under `media_dirs` (anything other than `local`), the card can't see where that folder is on disk, so `{path}` stays empty. Pass `{media_id}` instead and map it to a path in your script.

---

## Delete setup

The card supports two independent delete paths. Configure either or both — they're complementary:

### Sensor file delete (shell_command)

For sensor mode items (and combined-mode sensor-backed items). Add a `shell_command` to your `configuration.yaml`:

```yaml
shell_command:
  gallery_delete: 'rm -f "{{ path }}"'
```

Then in the card editor: **Advanced → Delete services → File sensor** → pick `shell_command.gallery_delete`.

> [!NOTE]
> Sensor delete is path-based. The path must start with `/config/www/` (or resolve from `/local/`). Media-source URIs without a filesystem mapping can't use this path.

### Frigate clip delete (rest_command)

For Frigate event items in any source mode. Add a `rest_command` that calls Frigate's `DELETE /api/events/<id>` endpoint:

```yaml
rest_command:
  delete_frigate:
    url: "http://frigate.local:5000/api/events/{{ event_id }}"
    method: DELETE
```

Then in the card editor: **Advanced → Delete services → Frigate** → pick `rest_command.delete_frigate`.

> [!TIP]
> Frigate's DELETE event endpoint wipes the clip, snapshot, and thumbnail in one call. The card hides paired items together after a successful delete.

> [!WARNING]
> The variable names in your `shell_command` and `rest_command` templates **must stay exactly as shown**. The card passes `{{ path }}` to the sensor delete service, and `{{ event_id }}` plus `{{ camera }}` to the Frigate delete service (so you can template `{{ camera }}` into the URL if your Frigate setup needs it). Renaming any of these (e.g. `{{ path }}` → `{{ filepath }}`) silently breaks the call. After editing `configuration.yaml`, restart Home Assistant (or reload YAML via _Developer Tools → YAML_).

### Confirmation & bulk

- `delete_confirm` — show confirmation dialog (default: `true`)
- `allow_bulk_delete` — enable multi-select bulk delete (default: `true`)
