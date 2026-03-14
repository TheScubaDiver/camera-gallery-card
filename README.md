# Camera Gallery Card

Custom **Home Assistant Lovelace card** for browsing camera media in a clean **timeline-style gallery** with preview player, object filters, optional live view, and a built-in visual editor.

**Current version:** `v1.8.0`

<p align="center">
  <img src="https://github.com/user-attachments/assets/5efa9e10-9ac3-48bf-8abf-2a009e797e79" width="48%" />
  <img src="https://github.com/user-attachments/assets/75fbfa4c-c49b-4633-b304-79a939776d4f" width="48%" />
</p>

---

# Requirements

## Native WebRTC (required for Live View)

Live camera preview now uses **Home Assistant’s native WebRTC streaming**.

No additional WebRTC integration is required anymore.

Your camera entity only needs to support WebRTC streaming within Home Assistant.

---

## Files integration (optional – for sensor mode)

If you want to use **sensor mode**, create sensors with a `fileList` attribute using the **Files integration**.

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=TarheelGrad1998&repository=files&category=integration">
  <img src="https://my.home-assistant.io/badges/hacs_repository.svg" />
</a>

https://github.com/TarheelGrad1998/files

---

# Features

### Gallery

- Image & video preview
- Timeline thumbnails
- Day grouping
- Filename timestamp parsing
- Object filter buttons
- Horizontal or vertical thumbnail layout
- Mobile friendly
- Media type icon (image / video)

### Sources

- `sensor` entities with `fileList`
- Home Assistant `media_source`
- Multiple sensors or media folders

### Live view

- Native Home Assistant **WebRTC live preview**
- Live badge
- Camera switching
- Default live mode
- Camera friendly names in selector

### Video controls

- Video autoplay toggle
- Video auto-mute toggle

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

Features:

- Entity suggestions (`sensor.*`)
- Media folder suggestions
- Field validation
- Object filter picker
- Cleanup of legacy config keys

---

# Installation

## HACS

1. Open **HACS**
2. Go to **Frontend**
3. Add this repository
4. Install **Camera Gallery Card**
5. Reload Home Assistant

---

## Manual

Copy files to:

```text
/config/www/
```

Add resource:

```yaml
url: /local/camera-gallery-card.js
type: module
```

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
| `object_filters` | Filter buttons |
| `live_enabled` | Enable live mode |
| `live_camera_entity` | Camera entity |
| `live_default` | Start in live mode |
| `video_autoplay` | Enable automatic video playback |
| `video_auto_mute` | Automatically mute videos |
| `delete_service` | Delete file service |

---

# Object filters

Supported filters:

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
