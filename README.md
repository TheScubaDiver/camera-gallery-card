# Camera Gallery Card

Custom **Home Assistant Lovelace card** for browsing camera media in a clean **timeline-style gallery** with preview player, object filters, optional live view, and a built-in visual editor.

**Current version:** `v2.10.0` <!-- x-release-please-version -->

<p align="center">
  <img src="https://github.com/user-attachments/assets/1c71ada8-98bb-435e-bbc6-b6974186c2e0" width="30%" />
  <img src="https://github.com/user-attachments/assets/40caf878-bc55-4cfd-9381-3a353785acf3" width="30%" />
</p>

---

## Installation

### HACS (Recommended)

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=TheScubadiver&repository=camera-gallery-card&category=plugin)

1. Click the button above
2. Click **Download**
3. Restart Home Assistant

### FileTrack (optional – for sensor mode)

> **Using sensor mode?** Follow the steps below to set up your file sensors.

The **FileTrack** integration creates a sensor that scans a folder and exposes its contents as a `fileList` attribute — this is what the Camera Gallery Card reads in **sensor mode**.

FileTrack is a fork of the archived [files integration by TarheelGrad1998](https://github.com/TarheelGrad1998/files).

1. Open **HACS**
2. Go to **Integrations**
3. Click the three-dot menu and choose **Custom repositories**
4. Add `https://github.com/TheScubadiver/FileTrack` as an **Integration**
5. Search for **FileTrack** and install it
6. **Restart Home Assistant**
7. Go to **Settings → Devices & Services** and add **FileTrack**

> [!NOTE]
> Once you have installed FileTrack, you can leave it alone. No need to configure anything in FileTrack — everything is configured in the card editor UI.

<img width="434" height="181" alt="Scherm­afbeelding 2026-03-28 om 13 51 00" src="https://github.com/user-attachments/assets/3d0bb033-7523-4204-bedf-2548cebbbec1" />

---

## Features

### Gallery

- Image & video preview
- **Fullscreen image viewer** — tap to open in fullscreen, rotates to landscape on mobile
- Timeline thumbnails with lazy loading
- Day grouping
- Filename timestamp parsing
- Object filter buttons with custom icon support
- Object detection pill in timestamp bar
- Horizontal or vertical thumbnail layout
- Mobile friendly
- Media type icon (image / video)
- Cover / Contain option for media display

<img width="490" height="407" alt="Scherm­afbeelding 2026-03-29 om 17 05 49" src="https://github.com/user-attachments/assets/6817a0ae-5d57-4ebf-8c8d-b5452c66ad66" />

### Sources

- Sensor entities with `fileList`
- Home Assistant `media_source`
- **Combined mode** — use a sensor entity and a media source simultaneously, merged into a single timeline
- Multiple sensors or media folders

### Live view

- Native Home Assistant **WebRTC live preview**
- Redesigned live view layout: camera name on the left, controls on the right
- **Controls mode** — choose between `overlay` (controls fade out after inactivity) or `fixed` (always visible)
- Native fullscreen button (iOS + Android/desktop)
- **Pinch to zoom in fullscreen** — touch, trackpad, and Ctrl + scroll wheel; pan with the mouse after zooming in
- **Aspect ratio toggle** — quickly switch between 16:9, 4:3 and 1:1, remembered per camera
- Live badge
- **Multiple live cameras** — configure several cameras and switch between them using chevron arrows
- **Multi-camera grid layout** (`live_layout: grid`) — show all cameras at once, tap a tile to focus on one
- **Multiple RTSP streams** — configure multiple named RTSP streams via `live_stream_urls`
- Default live camera
- Camera friendly names and entity IDs in selector
- Auto-teardown of stream + push-to-talk on view switch (no audio/bandwidth leak)

### Actions

- **Menu buttons** — configure custom action buttons (toggle, navigate, perform action, etc.) accessible via a hamburger menu during live view
- Delete (sensor files + Frigate clips)
- Multiple delete with red selection style
- Download
- Long-press action menu

### Frigate

- **WebSocket via HA integration** (default) — uses the official Frigate HA integration's WS API. CORS-free, no `frigate_url` required, works with standalone Frigate containers
- **Direct REST API** (`frigate_url`, optional) — even faster if your Frigate is reachable from the browser
- Automatic fallback: if REST fails, WS path takes over
- Automatic Frigate snapshot thumbnails
- **Frigate clip delete** via `rest_command` — see [Delete setup](#delete-setup)

### Thumbnails

- Automatic frame capture for **all** video sources in media source mode
  - Frigate cameras: Frigate snapshot
  - All other sources (NAS, Blue Iris, etc.): first-frame capture
- Sensor mode: first-frame capture

### Video controls

- Video autoplay toggle (gallery)
- Separate auto-mute toggle for gallery and live view
- Per-object filter color customization

<img width="441" height="307" alt="Scherm­afbeelding 2026-03-29 om 20 49 53" src="https://github.com/user-attachments/assets/bdcde10e-b882-444f-a99d-0ae0073e68a7" />

### Editor

Built-in Lovelace editor with tabs:

- **General**
- **Viewer**
- **Live**
- **Thumbnails**
- **Styling**

Features:

- Entity suggestions
- Media folder browser (starts at root)
- Field validation
- Object filter picker
- Controls mode dropdown (Overlay / Fixed)
- Menu buttons tab — configure action buttons with entity, icon, label and on/off icon
- Frigate URL field — set the direct Frigate API URL (shown in media and combined mode)
- **Auto-detect path datetime format** — scans your sources and suggests a working format
- Cleanup of legacy config keys
- Live preview in the HA card picker
- Create new FileTrack sensor from the General tab

### Debug mode

Enable **Debug mode** in the General tab to surface a debug pill in live view. Tapping it opens a diagnostics modal with card version, HA info, Frigate state, runtime queue stats, and the active source/path. Useful for support questions and issue reports.

### Styling

The **Styling** tab provides a visual editor for colors and border radius.

<details>
<summary>Show styling sections</summary>

| Section | Options |
|---|---|
| Card | Background, Border color, Border radius |
| Preview bar | Bar text color, Pill color |
| Thumbnails | Bar background, Bar text color, Border radius |
| Filter buttons | Background, Icon color, Active background, Active icon color, Border radius |
| Today / Date / Live | Text color, Chevron color, Live active color, Border radius |

</details>

---

## Delete setup

The card supports two independent delete paths. Configure either or both — they're complementary:

### Sensor file delete (shell_command)

For sensor mode items (and combined-mode sensor-backed items). Add a `shell_command` to your `configuration.yaml`:

```yaml
shell_command:
  gallery_delete: 'rm -f "{{ path }}"'
```

Then in the card editor: **General → Delete services → Sensor** → pick `shell_command.gallery_delete`.

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

Then in the card editor: **General → Delete services → Frigate** → pick `rest_command.delete_frigate`.

> [!TIP]
> Frigate's DELETE event endpoint wipes the clip, snapshot, and thumbnail in one call. The card hides paired items together after a successful delete.

### Confirmation & bulk

- `delete_confirm` — show confirmation dialog (default: `true`)
- `allow_bulk_delete` — enable multi-select bulk delete (default: `true`)

---

## Configuration options

<details>
<summary>Show all configuration options</summary>

| Option | Description |
|------|------|
| **Source** | |
| `source_mode` | `sensor`, `media`, or `combined` |
| `entity / entities` | Sensor source(s) |
| `media_source / media_sources` | Media browser source(s) |
| `path_datetime_format` | Format pattern for parsing timestamps from paths (required for `media` / `combined`) |
| `max_media` | Max media items |
| **Frigate** | |
| `frigate_url` | Optional direct Frigate REST API URL (e.g. `http://192.168.1.x:5000`). If omitted, the card uses the HA Frigate integration via WebSocket |
| **Gallery view** | |
| `start_mode` | Default view: `gallery` or `live` |
| `preview_position` | `top` or `bottom` |
| `clean_mode` | Hide overlays when preview is closed |
| `object_fit` | Media display mode: `cover` or `contain` |
| `aspect_ratio` | Preview aspect ratio: `16:9`, `4:3`, or `1:1` |
| `autoplay` | Auto-play videos in gallery |
| `auto_muted` | Auto-mute videos in gallery |
| **Thumbnails** | |
| `thumb_layout` | `horizontal` or `vertical` |
| `thumb_size` | Thumbnail size in px |
| `thumb_bar_position` | Thumb timestamp bar position |
| `thumb_sort_order` | `newest_first` or `oldest_first` |
| `bar_position` | Preview timestamp bar position |
| `bar_opacity` | Preview timestamp bar opacity |
| **Live view** | |
| `live_enabled` | Enable live mode |
| `live_camera_entity` | Default camera entity for live view |
| `live_camera_entities` | Camera entities visible in the live picker |
| `live_layout` | `single` or `grid` (multi-camera) |
| `live_grid_labels` | Show camera name labels in grid mode |
| `live_stream_urls` | Array of named RTSP streams: `[{url, name}]` |
| `live_auto_muted` | Auto-mute audio in live view |
| `controls_mode` | Live controls display: `overlay` or `fixed` |
| `show_camera_title` | Show camera name in controls bar |
| `persistent_controls` | Always show controls (don't fade out) |
| `menu_buttons` | Configurable action buttons in the hamburger menu |
| **Filters** | |
| `object_filters` | Filter buttons (built-in and custom) |
| `object_colors` | Color per object filter |
| **Delete** | |
| `delete_service` | Sensor file delete service (`shell_command.*`) |
| `frigate_delete_service` | Frigate clip delete service (`rest_command.*`) |
| `delete_confirm` | Show confirmation before deleting (default: `true`) |
| `allow_bulk_delete` | Enable bulk delete (default: `true`) |
| **Layout & misc** | |
| `card_height` | Card height in px |
| `pill_size` | Pill text size (px) — pills scale around this |
| `debug_enabled` | Show debug pill with diagnostics in live view |
| `style_variables` | Custom CSS variable overrides |

</details>

---

## Example configurations

### Minimal — sensor mode

For users with file sensors (FileTrack) pointing at local camera storage:

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entities:
  - sensor.frontdoor_files
  - sensor.driveway_files
delete_service: shell_command.gallery_delete
object_filters:
  - person
  - car
```

### Frigate via HA integration (no `frigate_url` needed)

For Frigate add-on or standalone container — uses the HA WebSocket path, CORS-free:

```yaml
type: custom:camera-gallery-card
source_mode: media
media_sources:
  - media-source://frigate/main/event/clips/all/all/recent/7
path_datetime_format: YYYY/MM/DD/HHmmss
frigate_delete_service: rest_command.delete_frigate
live_enabled: true
live_camera_entities:
  - camera.frontdoor
  - camera.driveway
live_layout: single
object_filters:
  - person
  - car
```

---

## Styling / CSS variables

All visual styling can be customized via the **Styling** tab in the editor.

<details>
<summary>Show all CSS variables</summary>

| Variable | Element | Default |
|---|---|---|
| `--cgc-card-bg` | Card background | theme card color |
| `--cgc-card-border-color` | Card border | theme divider color |
| `--r` | Card border radius | `10px` |
| `--cgc-tsbar-txt` | Preview bar text color | `#fff` |
| `--cgc-pill-bg` | Preview pill background | theme secondary bg |
| `--cgc-tbar-bg` | Thumbnail bar background | theme secondary bg |
| `--cgc-tbar-txt` | Thumbnail bar text color | theme text color |
| `--cgc-thumb-radius` | Thumbnail border radius | `10px` |
| `--cgc-obj-btn-bg` | Filter button background | theme secondary bg |
| `--cgc-obj-icon-color` | Filter icon color | theme text color |
| `--cgc-obj-btn-active-bg` | Active filter background | primary color |
| `--cgc-obj-icon-active-color` | Active filter icon color | `#fff` |
| `--cgc-obj-btn-radius` | Filter button border radius | `10px` |
| `--cgc-ctrl-txt` | Today/date/live text color | theme secondary text |
| `--cgc-ctrl-chevron` | Date navigation chevron color | theme text color |
| `--cgc-live-active-bg` | Live button active background | error color |
| `--cgc-ctrl-radius` | Controls bar border radius | `10px` |
| `--cgc-pill-size` | Pill text size (px). Fixed-mode pill height scales as `2 ×` this value | `14px` |

</details>

---

## Object filters

Supported built-in filters:
```
bicycle · bird · bus · car · cat · dog · motorcycle · person · truck · visitor
```

Custom filters with a custom icon can be added via the editor.

Object filter colors can be assigned per filter type in the editor.

> [!TIP]
> Recommended filename format for object detection:
> ```
> 2026-03-09_12-31-10_person.jpg
> 2026-03-09_12-31-10_car.mp4
> ```

---

## Path datetime format

The card extracts timestamps from a single configurable pattern, `path_datetime_format`, that matches the *tail* of each item's path (or media-source URI). The `/` character separates directory levels; the leaf segment matches the filename. The format is required for `media` and `combined` modes (Frigate REST is exempt — it uses event-id timestamps).

| Token | Meaning |
|------|------|
| YYYY | 4-digit year |
| YY | 2-digit year (pivots at 2000) |
| MM | 2-digit month |
| DD | 2-digit day |
| HH | 2-digit hour (24h) |
| mm | 2-digit minute |
| ss | 2-digit second |

### Layouts

The same knob handles three real-world archive shapes — and for nested archives the walker discovers the date tree without browsing inside day folders, then loads each day's files only when the user navigates to it. Very large archives (thousands of days) stay snappy.

**A. Flat folder — all files in one directory**
```
/media/cam/RLC_20260502_050106.mp4
            └────date────┘└─time─┘
path_datetime_format: RLC_YYYYMMDD_HHmmss.mp4
```

The literal extension is optional — leave it off and the format matches as a substring of the filename, useful when timestamps are surrounded by other tokens (`RLC-520A-front_00_20260502050106.mp4` matches `YYYYMMDDHHmmss`).

**B. Date-named folder — recordings inside daily folders**
```
/media/recordings/20260502/173154.mp4
                  └─date─┘ └─time─┘
path_datetime_format: YYYYMMDD/HHmmss
```

If the filenames carry no time tokens, write just `YYYYMMDD` — the card uses the folder name as the dayKey and shows files in their natural order.

**C. Nested folders — year/month/day/file**
```
/media/cam/Front/2026/04/30/RLC_20260430131245.mp4
                 └y─┘└m┘└d┘ └─────filename─────┘
path_datetime_format: YYYY/MM/DD/RLC_YYYYMMDDHHmmss.mp4
```

(Reolink/FTP shape — see [issue #99](https://github.com/TheScubaDiver/camera-gallery-card/issues/99).)

---

## License

MIT License
