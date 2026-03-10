# Camera Gallery Card

Custom Home Assistant Lovelace card for browsing camera media with a clean timeline-style gallery, preview player, object filters, optional camera live view, and a built-in visual editor.

**Current version:** `v1.6.0`

<p align="center">
  <img src="https://github.com/user-attachments/assets/5efa9e10-9ac3-48bf-8abf-2a009e797e79" width="48%" />
  <img src="https://github.com/user-attachments/assets/75fbfa4c-c49b-4633-b304-79a939776d4f" width="48%" />
</p>


The card supports:

- media from `sensor` entities with a `fileList` attribute  
- media from Home Assistant `media_source`  
- optional live camera preview  
- thumbnail actions such as delete, bulk delete, and download  
- a custom Lovelace editor with suggestions and validation  

---

# Features

## Gallery
- Preview for images and videos
- Thumbnail timeline
- Day-based navigation
- Timestamp parsing from filenames
- Object filter buttons
- Horizontal or vertical thumbnail layout
- Optional live camera mode
- Mobile-friendly interactions
- Media Source support
- Sensor-based file list support

## Actions
- Single delete
- Multiple delete
- Download media
- Long press thumbnail action sheet

## Editor
- Built-in visual config editor
- Separate tabs for:
  - General
  - Viewer
  - Live
  - Thumbnails
- Entity suggestions for compatible `sensor.*` entities
- Dynamic media folder suggestions for `media-source://...`
- Field validation for sensors and media folders
- Object filter picker with icons
- Automatic cleanup of deprecated / legacy config keys

---

# Installation

## HACS

1. Open **HACS**
2. Go to **Frontend**
3. Click **Custom repositories**
4. Add this repository
5. Install **Camera Gallery Card**
6. Reload Home Assistant

---

## Manual

1. Copy the files:

```
camera-gallery-card.js
camera-gallery-card-editor.js
```

to:

```
/config/www/
```

2. Add Lovelace resource:

```yaml
url: /local/camera-gallery-card.js
type: module
```

3. Reload Home Assistant.

---

# Basic usage

## Sensor mode

Use sensors that expose a `fileList` attribute.

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entity: sensor.camera_events
```

Multiple sensors:

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entities:
  - sensor.frontdoor_gallery
  - sensor.backyard_gallery
```

Example `fileList` attribute:

```json
[
  "/local/camera/frontdoor/2026-03-09_12-32-10_person.jpg",
  "/local/camera/frontdoor/2026-03-09_12-33-01_person.mp4"
]
```

---

## Media Source mode

Browse media directly from Home Assistant media sources.

```yaml
type: custom:camera-gallery-card
source_mode: media
media_source: media-source://media_source/local/camera
```

Multiple media folders:

```yaml
type: custom:camera-gallery-card
source_mode: media
media_sources:
  - media-source://media_source/local/frontdoor
  - media-source://media_source/local/backyard
```

Frigate example:

```yaml
type: custom:camera-gallery-card
source_mode: media
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
preview_click_to_open: false

bar_position: top
bar_opacity: 45

thumb_layout: horizontal
thumb_size: 140
thumb_bar_position: bottom
max_media: 20

object_filters:
  - person
  - car
  - dog

live_enabled: true
live_camera_entity: camera.frontdoor
live_default: false

delete_service: shell_command.delete_file
```

---

# Configuration options

| Option | Type | Default | Description |
|------|------|------|------|
| `source_mode` | string | `sensor` | `sensor` or `media` |
| `entity` | string | — | Single sensor |
| `entities` | list | — | Multiple sensors |
| `media_source` | string | — | Single media root |
| `media_sources` | list | — | Multiple media roots |
| `preview_height` | number | `320` | Preview height |
| `preview_position` | string | `top` | `top` or `bottom` |
| `preview_click_to_open` | boolean | `false` | Only open preview after click |
| `bar_position` | string | `top` | Preview timestamp bar |
| `bar_opacity` | number | `45` | Preview bar opacity |
| `thumb_layout` | string | `horizontal` | Thumbnail layout |
| `thumb_size` | number | `140` | Thumbnail size |
| `thumb_bar_position` | string | `bottom` | Thumbnail bar position |
| `max_media` | number | `20` | Maximum media loaded |
| `object_filters` | list | `[]` | Visible object filters |
| `live_enabled` | boolean | `false` | Enable live preview |
| `live_camera_entity` | string | — | Camera entity |
| `live_default` | boolean | `false` | Start in live mode |
| `delete_service` | string | — | Delete file service |

---

# Object filters

<img width="476" height="40" alt="Scherm­afbeelding 2026-03-09 om 12 51 30" src="https://github.com/user-attachments/assets/84307f8a-7cdd-49b4-8fb6-c89ae7403823" />

Supported object filters:

- `bicycle`
- `bird`
- `bus`
- `car`
- `cat`
- `dog`
- `motorcycle`
- `person`
- `truck`

Example:

```yaml
object_filters:
  - person
  - car
  - dog
```

Recommended filenames:

```
2026-03-09_12-31-10_person.jpg
2026-03-09_12-31-10_car.mp4
2026-03-09_12-31-10_dog.jpg
```

---

# Live mode

<img width="497" height="425" alt="Scherm­afbeelding 2026-03-09 om 12 52 40" src="https://github.com/user-attachments/assets/e6c1129a-7690-4f1c-8ac1-a4cb306add26" />
<img width="502" height="428" alt="Scherm­afbeelding 2026-03-09 om 12 52 49" src="https://github.com/user-attachments/assets/7c32f1ba-7892-480c-9e6e-0f6f771a1777" />

Enable live camera preview inside the gallery.

```yaml
live_enabled: true
live_camera_entity: camera.frontdoor
live_default: true
```

Features:

- Live preview badge
- Camera switch support
- Optional start in live mode

---

# Thumbnail actions

<img width="432" height="300" alt="Scherm­afbeelding 2026-03-09 om 12 50 48" src="https://github.com/user-attachments/assets/72705dab-3372-4d38-891b-379356bfc589" />

Long press a thumbnail to open the action menu.

Available actions:

- Delete
- Multiple delete
- Download

Notes:

- Delete requires a configured service.
- Frigate media sources do not support delete actions.

---

# Delete setup

Example shell command:

```yaml
shell_command:
  delete_file: 'rm "$path"'
```

Card config:

```yaml
delete_service: shell_command.delete_file
```

Delete operations are restricted to files inside:

```
/config/www/
```

for safety.

---

# Editor
<p align="center">
  <img src="https://github.com/user-attachments/assets/a0858a81-3ad3-4b24-b3f8-3ce8107d98b0" width="200">
  <img src="https://github.com/user-attachments/assets/4cd00913-ceef-4556-a1fc-0802c231d9e4" width="200">
  <img src="https://github.com/user-attachments/assets/306dc7b2-880d-456a-94cb-32d64f70e4aa" width="200">
  <img src="https://github.com/user-attachments/assets/3fc8fbf1-5fda-4240-87c6-354c49940bc2" width="200">
</p>

The card includes a custom Lovelace editor.

File:

```
camera-gallery-card-editor.js
```

## Editor tabs

### General
- Source mode
- File sensors
- Media folders
- Delete service

### Viewer
- Preview height
- Preview position
- Open-on-click
- Preview bar position
- Preview bar opacity

### Live
- Enable live preview
- Camera entity
- Start in live mode

### Thumbnails
- Thumbnail layout
- Thumbnail size
- Maximum thumbnails
- Thumbnail bar position
- Object filter selector

---

# Editor smart features

### Entity suggestions

The editor suggests compatible entities automatically.

Requirements:

- domain `sensor`
- attribute `fileList`

---

### Media folder suggestions

Dynamic suggestions using Home Assistant media browser.

Examples:

```
media-source://frigate/frigate/event-search/clips
media-source://frigate/frigate/event-search/snapshots
media-source://media_source/local
```

---

### Validation

Sensor entries are valid when:

- entity starts with `sensor.`
- entity exists in Home Assistant

Media folder entries are valid when:

- path starts with `media-source://`
- entry is a folder (not a file)

---

# Supported file types

Images:

```
jpg
jpeg
png
webp
gif
```

Videos:

```
mp4
webm
mov
m4v
```

---

# Filename parsing

The card extracts timestamps from filenames.

Examples:

```
2026-03-09_12-31-10_person.jpg
20260309_123110_person.jpg
clip-1741512345-person.mp4
```

Used for:

- sorting newest to oldest
- day grouping
- preview timestamps
- thumbnail labels

### Filename date format

The card can read the date and time from your filenames.

If your files use a custom format, you can define it with:

```yaml
filename_datetime_format:
```

### Tokens

| Token | Meaning |
|------|--------|
| YYYY | Year |
| MM | Month |
| DD | Day |
| HH | Hour |
| mm | Minutes |
| ss | Seconds |

### Example 1

Filename:

```
Deurbel_00_20260309183452.mp4
```

Config:

```yaml
filename_datetime_format: YYYYMMDDHHmmss
```

### Example 2

Filename:

```
Deurbel_00_2026-03-09-183452.mp4
```

Config:

```yaml
filename_datetime_format: YYYY-MM-DD-HHmmss
```

Only define the **date/time pattern**, not the full filename.

If this option is not set, the card will try to detect the date automatically.

---

# License

MIT License
