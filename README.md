# Camera Gallery Card

Custom **Home Assistant Lovelace card** for browsing camera media in a clean **timeline-style gallery** with preview player, object filters, optional live view, and a built-in visual editor.

**Current version:** `v2.0.1`

<p align="center">
  <img src="https://github.com/user-attachments/assets/5efa9e10-9ac3-48bf-8abf-2a009e797e79" width="48%" />
  <img src="https://github.com/user-attachments/assets/75fbfa4c-c49b-4633-b304-79a939776d4f" width="48%" />
</p>

---

# Requirements

## Native WebRTC (required for Live View)

Live camera preview now uses **Home Assistant's native WebRTC streaming**.

No additional WebRTC integration is required anymore.

Your camera entity only needs to support WebRTC streaming within Home Assistant.

---
# Installation

## HACS

1. Open **HACS**
2. Go to **Frontend**
3. Add this repository
4. Install **Camera Gallery Card**
5. Reload Home Assistant


---

## FileTrack (optional – for sensor mode)

> **Using sensor mode?** Follow the steps below to set up your file sensors.

The **FileTrack** integration creates a sensor that scans a folder and exposes its contents as a `fileList` attribute — this is what the Camera Gallery Card reads in **sensor mode**.

FileTrack is a fork of the archived [files integration by TarheelGrad1998](https://github.com/TarheelGrad1998/files).

### Step 1 — Install

1. Open **HACS**
2. Go to **Integrations**
3. Click the three-dot menu and choose **Custom repositories**
4. Add `https://github.com/TheScubadiver/FileTrack` as an **Integration**
5. Search for **FileTrack** and install it
6. **Restart Home Assistant**
7. Go to **Settings → Devices & Services** and add **FileTrack**

No YAML configuration is needed — sensors are configured entirely through the card editor UI.

<img width="434" height="181" alt="Scherm­afbeelding 2026-03-28 om 13 51 00" src="https://github.com/user-attachments/assets/3d0bb033-7523-4204-bedf-2548cebbbec1" />

**Make sure to restart Home Assistant after creating the sensor**

### Step 2 — Use in the card

Once your FileTrack sensor is created, use it in the card:

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entity: sensor.frontdoor_gallery
```

---

# Features

### Gallery

- Image & video preview
- Timeline thumbnails with lazy loading
- Day grouping
- Filename timestamp parsing
- Object filter buttons with custom icon support
- Object detection pill in timestamp bar
- Horizontal or vertical thumbnail layout
- Mobile friendly
- Media type icon (image / video)
- Cover / Contain option for media display (`object_fit`)

### Sources

- `sensor` entities with `fileList`
- Home Assistant `media_source`
- Multiple sensors or media folders

### Live view

- Native Home Assistant **WebRTC live preview**
- Redesigned live view layout
- Live badge
- Camera switching with configurable picker (`live_camera_entities`)
- Default live camera
- Camera friendly names and entity IDs in selector

### Video controls

- Video autoplay toggle (gallery)
- Separate auto-mute toggle for gallery (`auto_muted`) and live view (`live_auto_muted`)
- Per-object filter color customization

### Actions

- Delete
- Multiple delete
- Download
- Long-press action menu

### Editor

Built-in Lovelace editor with tabs:

- **General**
- **Viewer**
- **Live**
- **Thumbnails**
- **Styling**

Features:

- Entity suggestions (`sensor.*`)
- Media folder browser (starts at root)
- Field validation
- Object filter picker
- Cleanup of legacy config keys
- Live preview in the HA card picker
- Create new FileTrack sensor from the General tab

### Styling

The **Styling** tab provides a visual editor for colors and border radius, organized in collapsible sections:

| Section | Options |
|---|---|
| Card | Background, Border color, Border radius |
| Preview bar | Bar text color, Pill color |
| Thumbnails | Bar background, Bar text color, Border radius |
| Filter buttons | Background, Icon color, Active background, Active icon color, Border radius |
| Today / Date / Live | Text color, Chevron color, Live active color, Border radius |

All styling options can also be set manually via `style_variables` using CSS custom properties (see below).

---

# Basic usage

## Sensor mode

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entity: sensor.frontdoor_gallery
```

Example `fileList` attribute:

```json
[
  "/local/camera/frontdoor/2026-03-09_12-32-10_person.jpg",
  "/local/camera/frontdoor/2026-03-09_12-33-01_person.mp4"
]
```

Files must be inside:

```text
/config/www/
```

---

## Media source mode

```yaml
type: custom:camera-gallery-card
source_mode: media
media_source: media-source://media_source/local/camera
```

Example with multiple folders:

```yaml
media_sources:
  - media-source://media_source/local/frontdoor
  - media-source://media_source/local/backyard
```

Frigate example:

```yaml
media_sources:
  - media-source://frigate/frigate/event-search/clips
  - media-source://frigate/frigate/event-search/snapshots
```

The media folder browser starts at the root, so you can navigate to any media source.

---

# Example configuration

```yaml
type: custom:camera-gallery-card

source_mode: sensor
entities:
  - sensor.frontdoor_gallery

preview_height: 320
preview_position: top

thumb_layout: horizontal
thumb_size: 140
max_media: 20

object_filters:
  - person
  - car
  - dog

live_enabled: true
live_camera_entity: camera.frontdoor
live_camera_entities:
  - camera.frontdoor
  - camera.backyard
live_auto_muted: true

object_fit: cover

delete_service: shell_command.delete_file
```

---

# Delete setup

To enable delete actions, create a shell command in Home Assistant:

```yaml
shell_command:
  delete_file: 'rm "$path"'
```

Then use that service in the card:

```yaml
delete_service: shell_command.delete_file
```

Optional delete options:

```yaml
allow_delete: true
allow_bulk_delete: true
delete_confirm: true
```

Notes:

- Delete actions only work when a `delete_service` is configured
- Delete is intended for files inside `/config/www/`
- Frigate media sources do not support delete actions

---

# Configuration options

| Option | Description |
|------|------|
| `source_mode` | `sensor` or `media` |
| `entity / entities` | Sensor source |
| `media_source / media_sources` | Media browser source |
| `preview_height` | Preview player height |
| `preview_position` | `top` or `bottom` |
| `preview_click_to_open` | Click to open preview |
| `bar_position` | Timestamp bar position |
| `bar_opacity` | Timestamp bar opacity |
| `thumb_layout` | `horizontal` or `vertical` |
| `thumb_size` | Thumbnail size |
| `thumb_bar_position` | Thumb timestamp bar |
| `max_media` | Max media items |
| `object_filters` | Filter buttons (built-in and custom) |
| `object_colors` | Color per object filter — `{ person: "#FF0000" }` |
| `entity_filter_map` | Map entity to object type — `{ camera.frontdoor: person }` |
| `live_enabled` | Enable live mode |
| `live_camera_entity` | Default camera entity for live view |
| `live_camera_entities` | Array of camera entity IDs visible in the live picker |
| `live_auto_muted` | Auto-mute audio in live view (`true` / `false`) |
| `autoplay` | Auto-play videos in gallery (`true` / `false`) |
| `auto_muted` | Auto-mute videos in gallery (`true` / `false`) |
| `object_fit` | Media display mode: `cover` or `contain` |
| `allow_delete` | Enable delete action |
| `allow_bulk_delete` | Enable bulk delete |
| `delete_confirm` | Show confirmation before deleting |
| `delete_service` | Delete file service |
| `style_variables` | Custom CSS variable overrides (see styling section) |

---

# Styling / CSS variables

All visual styling can be customized via the **Styling** tab in the editor, or manually via `style_variables` in YAML.

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

Example:

```yaml
style_variables: |
  --cgc-card-bg: transparent;
  --cgc-card-border-color: transparent;
  --r: 0px;
  --cgc-thumb-radius: 4px;
```

---

# Object filters

Supported built-in filters:

```text
bicycle
bird
bus
car
cat
dog
motorcycle
person
truck
visitor
```

Example:

```yaml
object_filters:
  - person
  - car
  - dog
```

## Custom object filters

Add your own filters with a custom icon using the editor, or via YAML:

```yaml
object_filters:
  - person
  - car
  - parcel: mdi:package-variant
  - woman: mdi:account
```

## Object filter colors

Assign a color to each filter icon:

```yaml
object_colors:
  person: "#2196F3"
  car: "#FF9800"
  parcel: "#4CAF50"
```

Recommended filename format:

```text
2026-03-09_12-31-10_person.jpg
2026-03-09_12-31-10_car.mp4
```

---

# Filename parsing

The card extracts timestamps from filenames for:

- sorting
- day grouping
- preview timestamps
- thumbnail labels

Example formats:

```text
2026-03-09_12-31-10_person.jpg
20260309_123110_person.jpg
clip-1741512345-person.mp4
```

Custom format:

```yaml
filename_datetime_format:
```

Tokens:

| Token | Meaning |
|------|------|
| YYYY | Year |
| MM | Month |
| DD | Day |
| HH | Hour |
| mm | Minutes |
| ss | Seconds |

Example:

```text
Deurbel_00_20260309183452.mp4
```

```yaml
filename_datetime_format: YYYYMMDDHHmmss
```

---

# License

MIT License
