# Camera Gallery Card

Custom **Home Assistant Lovelace card** for browsing camera media in a clean **timeline-style gallery** with preview player, object filters, optional live view, and a built-in visual editor.

**Current version:** `v2.11.0` <!-- x-release-please-version -->

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
- **Two-way audio (talkback)** — tap the mic pill in live view to talk back through go2rtc. **Per-camera** — multi-camera setups can have mic talkback on some entries and not others; the pill appears/disappears as the user navigates the picker. Supports toggle and push-to-talk interaction, live input-level ring, four typed visual states (idle / connecting / active / error), retry on transient WebSocket glitches, screen-reader announcements, and reduced-motion fallback. **Prerequisites:** a camera with an audio backchannel speaker, the [AlexxIT/WebRTC](https://github.com/AlexxIT/WebRTC) HACS integration installed (provides the signed `/api/webrtc/ws` endpoint the card connects to), and a go2rtc `streams:` entry that routes the camera's backchannel. Configure with `live_mic_streams: { <camera_id>: <go2rtc_stream> }` (and optionally `live_mic_mode: ptt`, `live_mic_audio_processing`, or custom ICE servers via `live_mic_ice_servers` / `live_mic_force_relay`)

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
| `live_mic_streams` | Per-camera map of go2rtc backchannel streams. Keys are camera entity ids (`camera.front_door`) or synthetic stream ids (`__cgc_stream_0__` — see caveat below); values are non-empty go2rtc stream names. The mic pill appears only on cameras present in the map. Once *any* row is filled, the map is authoritative — cameras absent from it have no mic. Example: `live_mic_streams: { camera.front_door: front_door, camera.driveway: driveway }` |
| `live_go2rtc_stream` | Legacy single-camera fallback. Applies globally only when `live_mic_streams` is empty/absent. Filling any row in `live_mic_streams` makes the map authoritative and this key is ignored |
| `live_go2rtc_url` | Optional. Direct connection URL to an external go2rtc instance (e.g. `http://192.168.1.x:1984`) — used by the **live video** fast-path only, not by the mic. Leave empty to route through the WebRTC integration |
| `live_mic_mode` | Mic interaction model: `toggle` (default — tap to start/stop) or `ptt` (push-to-talk — press and hold while speaking) |
| `live_mic_audio_processing` | Per-mic Web Audio constraints. All true by default. Sub-keys: `echo_cancellation`, `noise_suppression`, `auto_gain_control`. (Capture is always mono — `channelCount: 1` — to halve upstream bandwidth without losing voice quality.) |
| `live_mic_ice_servers` | Advanced. Override the built-in STUN-only list with your own STUN/TURN servers. Same shape as WebRTC's `RTCIceServer`: `[{urls: "...", username: "...", credential: "..."}, ...]`. Default is STUN-only (Cloudflare + Google) — voice traffic stays direct and never proxies through a third party. Add a TURN entry here only if you're behind symmetric NAT (see Coturn example below) |
| `live_mic_force_relay` | Advanced. Set to `true` to force `iceTransportPolicy: "relay"` (TURN-only). Useless without a TURN server configured in `live_mic_ice_servers` |
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

**Caveat for `live_stream_urls` (synthetic ids).** When you put mic config on a stream-URL entry, the key is `__cgc_stream_<N>__` where `N` is the position in `live_stream_urls`. If you reorder the array, the keys point at the wrong streams. Use the editor (it re-binds the inputs to the visible names) or stick to entity-keyed entries for stability.

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

## License

MIT License
