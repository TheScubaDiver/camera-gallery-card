# Camera Gallery Card

Custom **Home Assistant Lovelace card** for browsing camera media in a clean **timeline-style gallery** with preview player, object filters, optional live view, and a built-in visual editor.

**Current version:** `v3.0.1` <!-- x-release-please-version -->

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

## Quick start

Got the card installed? Here's the fastest way to see something on screen.

1. In Home Assistant, open your dashboard and click **Edit dashboard** (top right).
2. Click **Add card** and search for **Camera Gallery Card**.
3. Pick a **source mode** when prompted:
   - **Sensor mode** — you have snapshot files in `/config/www/...` (e.g. saved by an automation). Also requires [FileTrack](#filetrack-optional--for-sensor-mode).
   - **Media mode** — you use Frigate, a NAS folder, or anything reachable via Home Assistant's media browser.
   - **Combined mode** — both at once, merged into one timeline.
4. Save. The editor walks you through the rest.

> [!TIP]
> Not sure which mode? See [Choosing a source mode](#choosing-a-source-mode) below.

> [!NOTE]
> The card shows files that **already exist**. It does *not* trigger snapshots itself — that's the job of a Home Assistant automation or your camera integration (e.g. Frigate). If your gallery is empty, you probably need to set up a snapshot automation first.

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
- **Favorites** — star any item with a tap; filter the timeline to show only favorites
- **Prev / next + keyboard navigation** — arrow buttons in the fullscreen viewer, plus <kbd>←</kbd>/<kbd>→</kbd> on desktop
- **Runtime mute pill** — tap-to-mute pill on the video preview, independent of the global auto-mute toggle

<img width="490" height="407" alt="Scherm­afbeelding 2026-03-29 om 17 05 49" src="https://github.com/user-attachments/assets/6817a0ae-5d57-4ebf-8c8d-b5452c66ad66" />

### Sources

- Sensor entities with `fileList` (sensor mode)
- Home Assistant `media_source` (media mode)
- **Combined mode** — use a sensor entity and a media source simultaneously, merged into a single timeline
- Multiple sensors or media folders

#### Choosing a source mode

| You have… | Use |
|---|---|
| Frigate (add-on or container) | `media` |
| Files in `/config/www/<folder>/` saved by an automation | `sensor` (+ FileTrack) |
| A NAS or external folder mounted as a media source | `media` |
| A mix of the above | `combined` |

**Sensor mode** reads file paths from a Home Assistant sensor's `fileList` attribute. You create that sensor with the **FileTrack** integration.

**Media mode** uses Home Assistant's built-in media browser — anything you can browse in HA (Frigate, Samba, local media) works as a source.

**Combined mode** merges a sensor source and a media source into one timeline (useful when you have both legacy snapshot files and a newer Frigate setup).

> [!TIP]
> Curious how Frigate, Reolink and custom NVRs are handled internally? See [How sources are routed](#how-sources-are-routed-under-the-hood) below.

#### How sources are routed under the hood

When you use `source_mode: media` (or `combined`), the card picks an engine per media-source URI:

| URI prefix | Engine | `path_datetime_format` |
|---|---|---|
| `media-source://frigate/...` | Frigate REST / events path — uses event-id timestamps directly | not needed |
| `media-source://reolink/...` | Dedicated Reolink engine — parses Reolink's folder/file titles intrinsically | not needed |
| Anything else (Synology, BlueIris, NAS, custom NVR, ...) | Generic calendar walker | **required** — set this to match how dates appear in your file paths |

A few notes on the generic walker:

- The NVR must be visible as a `media-source://...` in Home Assistant's **Media** browser (sidebar). Without that, the card can't browse it.
- NVRs that only expose RTSP / SMB without a media-source integration can fall back to `source_mode: sensor` with a FileTrack-style sensor that lists the file paths.
- If `path_datetime_format` is missing or wrong, the gallery won't be able to group by day or sort by time — but clips still appear. Use the **Auto-detect format** button in the editor to probe your sources and suggest a format.

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
- **Offline camera placeholder** — unavailable cameras show a clear "offline" tile instead of a black frame
- **Keyboard navigation** — <kbd>←</kbd>/<kbd>→</kbd> to switch between cameras in single layout
- Default live camera
- Camera friendly names and entity IDs in selector
- Auto-teardown of stream + push-to-talk on view switch (no audio/bandwidth leak)
- **Two-way audio (talkback)** — tap the mic pill in live view to speak through a camera's backchannel speaker. Per-camera, with tap-to-toggle or push-to-talk modes. *Advanced setup* — see [Two-way audio](#two-way-audio-advanced) below.

### Actions

- **Menu buttons** — configure custom action buttons (toggle, navigate, perform action, etc.) accessible via a hamburger menu during live view
- Delete (sensor files + Frigate clips)
- Multiple delete with red selection style
- Download
- Long-press action menu

### Frigate

- **WebSocket via HA integration** (default) — uses the official Frigate HA integration's WS API. CORS-free, no `frigate_url` required, works with standalone Frigate containers. **New events arrive in real time** — no polling, no refresh.
- **Direct REST API** (`frigate_url`, optional) — even faster if your Frigate is reachable from the browser
- Automatic fallback: if REST fails, WS path takes over
- Automatic Frigate snapshot thumbnails
- **Frigate clip delete** via `rest_command` — see [Delete setup](#delete-setup)

### Thumbnails

- Automatic frame capture for **all** video sources in media source mode
  - Frigate cameras: Frigate snapshot
  - All other sources (NAS, Blue Iris, etc.): first-frame capture
- Sensor mode: first-frame capture
- **Paired image + video** — when a snapshot and clip share the same filename stem they're shown as one item, with the image used as the thumbnail

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

> [!WARNING]
> The variable names in your `shell_command` and `rest_command` templates **must stay exactly as shown**. The card passes `{{ path }}` to the sensor delete service, and `{{ event_id }}` plus `{{ camera }}` to the Frigate delete service (so you can template `{{ camera }}` into the URL if your Frigate setup needs it). Renaming any of these (e.g. `{{ path }}` → `{{ filepath }}`) silently breaks the call. After editing `configuration.yaml`, restart Home Assistant (or reload YAML via *Developer Tools → YAML*).

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
| `path_datetime_format` | Format pattern for parsing timestamps from paths. Needed in **all source modes** for day grouping and time sort. Exceptions: Frigate sources (`media-source://frigate/...`) carry their own event-id timestamps, and Reolink sources (`media-source://reolink/...`) are parsed intrinsically by the dedicated engine |
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
| `live_mic_streams` | Per-camera map of go2rtc backchannel streams. See [Two-way audio](#two-way-audio-advanced) |
| `live_go2rtc_stream` | Legacy single-camera fallback for talkback |
| `live_go2rtc_url` | Optional direct go2rtc URL for the live video fast-path |
| `live_mic_mode` | Mic interaction model: `toggle` (default) or `ptt` |
| `live_mic_audio_processing` | Per-mic Web Audio constraints |
| `live_mic_ice_servers` | Advanced. Override built-in STUN list with custom STUN/TURN |
| `live_mic_force_relay` | Advanced. Force `iceTransportPolicy: "relay"` (TURN-only) |
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
| `row_gap` | Vertical spacing between rows (preview / controls / topbar / filters / thumbnails) in px. Default `8`, range 0–40 |
| `debug_enabled` | Show debug pill with diagnostics in live view |
| `style_variables` | Custom CSS variable overrides |

</details>

---

## Example configurations

### Two-way audio (talkback)

Multi-camera setup with mic on the two cameras that actually have speakers:

```yaml
type: custom:camera-gallery-card
source_mode: media
live_enabled: true
live_camera_entities:
  - camera.front_door     # mic-capable doorbell
  - camera.driveway       # mic-capable PTZ
  - camera.backyard       # no speaker, intentionally omitted from the map
live_mic_streams:
  camera.front_door: front_door     # go2rtc streams: key
  camera.driveway: driveway
live_mic_mode: ptt        # press-and-hold; omit for tap-to-toggle
```

See [Two-way audio (advanced)](#two-way-audio-advanced) for prerequisites and TURN setup.

### Minimal — sensor mode

For users with file sensors (FileTrack) pointing at local camera storage. **Create the FileTrack sensors first** via *Settings → Devices & Services → FileTrack* (or use the editor's **Create new FileTrack sensor** button on the General tab) — the entity ids below should match what you created.

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entities:
  - sensor.frontdoor_files
  - sensor.driveway_files
path_datetime_format: YYYY-MM-DD_HH-mm-ss   # matches "2026-03-09_12-31-10_person.jpg"
delete_service: shell_command.gallery_delete   # see "Delete setup"
object_filters:
  - person
  - car
```

> [!NOTE]
> The `path_datetime_format` line is what gives your items dates. Adjust it to match how your snapshot files are actually named — the example here matches the recommended filename format (`YYYY-MM-DD_HH-mm-ss_<object>.jpg`). See [Path datetime format](#path-datetime-format) for more layouts, or use **Auto-detect** in the editor.

### Frigate via HA integration (no `frigate_url` needed)

For Frigate add-on or standalone container — uses the HA WebSocket path, CORS-free. If you also want clip delete to work, set up `rest_command.delete_frigate` first — see [Delete setup](#delete-setup).

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

### Reolink NVR / Doorbell / camera

The official **Reolink HA integration** exposes recordings under
`media-source://reolink/...`. The card detects this prefix and routes
those sources through a dedicated engine (mirrors Advanced Camera
Card's approach) — no `path_datetime_format` needed, no `M`/`D` token
gymnastics, no manual day-URI:

```yaml
type: custom:camera-gallery-card
source_mode: media
media_sources:
  - media-source://reolink/CAM|01JVCNA6DC12AMNF2QE2SWXNK3|0
live_enabled: true
live_camera_entities:
  - camera.deurbel
```

How it works under the hood:
- The engine auto-promotes a `CAM|...` URI to `RES|...|main` so the user
  only has to copy the camera-level URI from HA's media browser. (Want
  the sub stream? Paste the `RES|...|sub` URI directly — the engine
  leaves explicit RES URIs alone.)
- Day folders titled `2026/4/9` (unpadded) are parsed directly — no
  date-token configuration.
- File titles starting with `HH:mm:ss` are parsed to derive each clip's
  timestamp; the rest of the title (duration, detection tags) is ignored
  for now.
- Playback uses HA's MP4 proxy URL via `media_source/resolve_media` —
  same fast path that Advanced Camera Card uses. No HLS wrapping.
- Thumbnails are intentionally not generated for Reolink clips (the
  integration provides none, and first-frame capture would re-fetch the
  MP4 via the camera proxy — same trade-off ACC makes). The Reolink
  brand mark is shown instead.

**Find your CAM URI:** open Home Assistant → Media → Reolink, click on
your camera, and copy the path from the breadcrumb. It looks like
`media-source://reolink/CAM|<long-id>|<channel>` where `<channel>` is
`0` for single-lens cameras and `0..N` for NVR channels.

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

The card extracts timestamps from a single configurable pattern, `path_datetime_format`, that matches the *tail* of each item's path (or media-source URI). The `/` character separates directory levels; the leaf segment matches the filename.

> [!WARNING]
> `path_datetime_format` is needed in **all source modes** (sensor, media, combined) — without it, items load but have no dates: no day grouping, no day navigation, no time sort. The only built-in exception is Frigate via `media-source://frigate/...` URIs, which carry their own event-id timestamps. Use the editor's **Auto-detect path datetime format** button (General tab) if you're unsure what to set.

| Token | Meaning |
|------|------|
| YYYY | 4-digit year |
| YY | 2-digit year (pivots at 2000) |
| MM | 2-digit month |
| DD | 2-digit day |
| HH | 2-digit hour (24h) |
| mm | 2-digit minute |
| ss | 2-digit second |
| X | 10-digit Unix timestamp in seconds (decoded to local time) |
| x | 13-digit Unix timestamp in milliseconds (decoded to local time) |

**Range filenames (`start-end`).** When a format includes the same date/time token twice (or the `X` token twice), the **first** capture is used as the canonical timestamp and the second is treated as a structural anchor. This is what lets a single format string describe `start-end`-style filenames without picking the wrong instant.

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

**D. Unix epoch in the filename**
```
/media/tapo/1706108297-1706108310.mp4
            └──start──┘ └───end───┘
path_datetime_format: X-X
```

Tapo Control writes `unix_start-unix_end.mp4`; `X-X` captures both but uses the start as the canonical time. A single epoch (`1706108297.mp4`) is just `X`. UniFi Protect's `.ubv` files encode the millisecond epoch — `B4FBE47EEF30_0_rotating_1642402659065.ubv` matches `x`.

**E. Calendar-range filenames**
```
/media/reolink/cam_20240315083000_20240315083127.mp4
                   └────start────┘└─────end────┘
path_datetime_format: YYYYMMDDHHmmss_YYYYMMDDHHmmss

/media/dahua/2024-03-15/ch1/dav/11/11.00.01-11.00.59[M][0@0][0].mp4
                                   └─start─┘└──end──┘
path_datetime_format: YYYY-MM-DD/HH.mm.ss-HH.mm.ss
```

Reolink SD-card exports and Dahua/Amcrest filenames carry two same-format timestamps; the first wins.

---

## Troubleshooting

**Gallery is empty.**

- In **sensor mode**: check that the sensor entity exists (*Developer Tools → States*) and its `fileList` attribute actually has files. If empty, FileTrack isn't seeing the folder.
- In **media mode**: open the editor and use the **media folder browser** — can you see your files there?
- Frigate? Make sure the Frigate HA integration is loaded (*Settings → Devices & Services*).

**Live view says "offline" or shows a placeholder.**
The camera entity is unavailable in Home Assistant. Check it in *Developer Tools → States* — it must report a live state to stream.

**Frigate clips don't appear.**
The `path_datetime_format` must match Frigate's path layout. Use the editor's **Auto-detect path datetime format** button (General tab) to let the card propose the right pattern, or see [Path datetime format](#path-datetime-format) for examples.

**Items load but aren't grouped by day (no dates, no day navigation).**
`path_datetime_format` is missing or doesn't match your filenames. The card needs it to extract dates from paths — without a match, items stay undated and the timeline loses day grouping, day navigation and time-based sort. The only built-in exception is Frigate via `media-source://frigate/...` URIs, which carry their own event-id timestamps. Use **Auto-detect** in the editor's General tab, or see [Path datetime format](#path-datetime-format).

**Delete does nothing / errors.**
Check that the `shell_command` or `rest_command` you point to is actually defined in `configuration.yaml` and that you restarted (or reloaded YAML) afterwards. Variable names like `{{ path }}` and `{{ event_id }}` must be **exact** — the card passes those names, renaming them breaks the call.

**Need more info?** Enable **Debug mode** in the General tab — a debug pill appears in live view; tap it for a diagnostics modal with version, HA info, Frigate state and runtime stats. Attach the contents when filing an [issue](https://github.com/TheScubaDiver/camera-gallery-card/issues).

---

## Two-way audio (advanced)

Two-way audio (talkback) lets you speak through a camera's backchannel speaker from the live view. Setup is more involved than the rest of the card — read this if you want to enable it.

**You need:**

- A camera with an **audio backchannel speaker** (most Reolink doorbells, some Hikvision, Tapo, etc.).
- The [AlexxIT/WebRTC](https://github.com/AlexxIT/WebRTC) HACS integration — provides the signed `/api/webrtc/ws` endpoint the card connects to.
- A go2rtc `streams:` entry that routes the camera's backchannel audio.

**Configuration:**

- `live_mic_streams: { <camera_id>: <go2rtc_stream_key> }` — map of cameras → go2rtc stream keys. The mic pill appears only on cameras present in this map.
- Optional `live_mic_mode: ptt` for push-to-talk (default is tap-to-toggle).
- Optional `live_mic_audio_processing` to tweak echo cancellation, noise suppression, AGC.
- Optional `live_mic_ice_servers` / `live_mic_force_relay` if you're behind symmetric NAT and need a TURN relay.

**Visual states:** the pill cycles through four states — idle, connecting, active, error — and announces them to screen readers. Transient WebSocket glitches retry automatically.

**Custom TURN (Coturn) for symmetric NAT.** Default is STUN-only — voice traffic stays direct on your LAN. If you need a relay (e.g. talking to a Tailscale endpoint from a flaky cellular network):

```yaml
live_mic_ice_servers:
  - urls: stun:stun.cloudflare.com:3478
  - urls:
      - turn:turn.example.com:3478
      - turns:turn.example.com:5349
    username: your_username
    credential: your_secret
# live_mic_force_relay: true   # only if direct ICE never succeeds
```

**Caveat for `live_stream_urls` (synthetic ids).** When you put mic config on a stream-URL entry, the key is `__cgc_stream_<N>__` where `N` is the position in `live_stream_urls`. If you reorder the array, the keys point at the wrong streams. Use the editor (it re-binds the inputs to the visible names) or stick to entity-keyed entries for stability.

See the [Two-way audio YAML example](#two-way-audio-talkback) for a working config.

---

## License

MIT License
