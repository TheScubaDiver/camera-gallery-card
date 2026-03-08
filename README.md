# Camera Gallery Card

<p align="center">
<img src="https://github.com/user-attachments/assets/4d5b240b-b04b-446c-9f55-8104e593c11e" width="48%">
<img src="https://github.com/user-attachments/assets/be095e81-f0fb-40ee-849f-e3e05be6a95c" width="48%">
</p>

<p align="center">
<img src="https://github.com/user-attachments/assets/e3cb7c8a-fdad-40bb-bd0f-bc8951169bdb" width="48%">
<img src="https://github.com/user-attachments/assets/be6ad1e5-3588-4fcc-8fe5-8a0c37a2fda5" width="48%">
</p>

<p align="center">
<img src="https://github.com/user-attachments/assets/d50a40f7-e418-4ba4-92ca-7c7f25ecb264" width="48%">
</p>


A lightweight, swipeable media gallery card for Home Assistant Lovelace. Browse snapshots and video clips from either file-list sensors or Home Assistant Media Source — with day-by-day navigation, object filters, download support, optional delete actions, and built-in live camera preview.

The card is built for touch devices, tablets, and dashboards, and works especially well with Frigate media.

> **Current version:** 1.3.0

---

# Table of Contents

- [Features](#features)
- [Installation](#installation)
  - [HACS Installation](#hacs-installation)
  - [Manual Installation](#manual-installation)
- [Source Modes](#source-modes)
  - [Sensor Mode](#sensor-mode)
  - [Media Source Mode](#media-source-mode)
- [Live Mode](#live-mode)
- [Frigate Usage](#frigate-usage)
- [Delete Setup](#delete-setup)
- [Configuration Options](#configuration-options)
- [Example Configurations](#example-configurations)
- [Notes](#notes)
- [License](#license)

---

# Features

- Full preview area for images, videos, and optional live camera view
- Swipe navigation inside the preview
- Optional built-in **live camera preview**
- Configurable preview position: **top** or **bottom**
- Optional **click-to-open preview**
- Inline video playback
- Automatic video poster generation
- Day-by-day navigation with **Today** shortcut
- Object filter buttons (`person`, `car`, `dog`, `cat`, etc.)
- Multi-select object filtering
- Source mode: **sensor** or **media**
- Support for **multiple sensors**
- Support for **multiple media folders**
- Horizontal thumbnail strip with **mouse wheel / trackpad scrolling**
- Configurable thumbnail size
- Configurable preview bar position (**top / bottom / hidden**)
- Adjustable preview bar opacity
- Configurable thumbnail bar position (**top / bottom / hidden**)
- Download button for current item
- Select mode for multiple items
- Bulk delete support (**sensor mode only**)
- UI-only config updates without full reload
- Responsive layout
- Optimized for **tablets and dashboards**
- Native Home Assistant editor with tabs and autocomplete

---

# Installation

## HACS Installation

1. Open **HACS**
2. Go to **Frontend**
3. Click **⋮ → Custom repositories**
4. Add:

```text
https://github.com/TheScubadiver/camera-gallery-card
```

Category: **Dashboard**

5. Install **Camera Gallery Card**
6. Restart Home Assistant

---

## Manual Installation

Download:

- `camera-gallery-card.js`
- `camera-gallery-card-editor.js`

Copy them to:

```text
/config/www/camera-gallery-card/
```

Add resource in **Settings → Dashboards → Resources**:

```text
URL: /local/camera-gallery-card/camera-gallery-card.js
Type: JavaScript Module
```

Restart Home Assistant.

---

# Source Modes

The card supports two different ways of loading media.

---

# Sensor Mode

Uses one or more sensors with a `fileList` attribute.

Example sensor output:

```text
/config/www/camera-gallery/clip1.mp4
/config/www/camera-gallery/snapshot1.jpg
```

Example card:

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entity: sensor.camera_files
```

Multiple sensors:

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entities:
  - sensor.camera_files_front
  - sensor.camera_files_back
```

### Advantages

- Delete support
- Fast loading
- Works with custom folders
- Supports combining multiple sensors into one gallery

### Notes

Sensor must expose:

```text
fileList
```

Paths under:

```text
/config/www/
```

are automatically converted to:

```text
/local/
```

---

# Media Source Mode

Loads files directly from **Home Assistant Media Source**.

Recommended when using **Frigate**.

Example:

```yaml
type: custom:camera-gallery-card
source_mode: media
media_source: media-source://frigate/frigate/event-search/clips
```

Multiple folders:

```yaml
type: custom:camera-gallery-card
source_mode: media
media_sources:
  - media-source://frigate/frigate/event-search/clips
  - media-source://frigate/frigate/event-search/snapshots
```

### Advantages

- Works directly with Media Source
- Ideal for Frigate
- No sensors required
- Supports multiple folders in a single gallery

### Notes

Delete functionality is **not available** in media mode.

---

# Live Mode

The card can optionally show a live camera stream inside the main preview area.

Live mode uses a Home Assistant `camera.*` entity and can be enabled per card.

Example:

```yaml
type: custom:camera-gallery-card
source_mode: media
media_sources:
  - media-source://frigate/frigate/event-search/clips
live_enabled: true
live_camera_entity: camera.voordeur
live_default: false
```

### Live options

- `live_enabled` — enable live mode
- `live_camera_entity` — camera entity used for live preview
- `live_default` — start the card in live mode

### Notes

- Live mode appears inside the same preview area as media
- Recorded media and live preview can exist in the same card
- The live provider is handled internally and does not require configuration

---

# Frigate Usage

Example configuration for Frigate media:

```yaml
type: custom:camera-gallery-card
source_mode: media
media_sources:
  - media-source://frigate/frigate/event-search/clips
  - media-source://frigate/frigate/event-search/snapshots
preview_position: top
object_filters:
  - person
  - car
  - dog
  - cat
live_enabled: true
live_camera_entity: camera.voordeur
```

---

# Delete Setup

Delete only works in **sensor mode**.

Create a shell command.

Add to `configuration.yaml`:

```yaml
shell_command:
  camera_gallery_delete: 'bash -lc "rm -f -- \"{{ path }}\""'
```

Restart Home Assistant.

Then configure the card:

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entity: sensor.camera_files
delete_service: shell_command.camera_gallery_delete
```

### Safety

Files can only be deleted inside:

```text
/config/www/
```

Example valid path:

```text
/config/www/camera-gallery/clip1.mp4
```

---

# Configuration Options

## Source

| Option | Description |
|---|---|
| `source_mode` | `sensor` or `media` |
| `entity` | single sensor |
| `entities` | multiple sensors |
| `media_source` | single media folder |
| `media_sources` | multiple media folders |
| `max_media` | maximum number of items loaded |

## Preview

| Option | Description |
|---|---|
| `preview_position` | `top` / `bottom` |
| `preview_height` | preview height in px |
| `preview_click_to_open` | only show preview after selecting an item |

## Live

| Option | Description |
|---|---|
| `live_enabled` | enable live mode |
| `live_camera_entity` | camera entity used for live preview |
| `live_default` | open card in live mode |

## Bars & Thumbnails

| Option | Description |
|---|---|
| `bar_position` | `top` / `bottom` / `hidden` |
| `bar_opacity` | preview bar opacity |
| `thumb_size` | thumbnail size |
| `thumb_bar_position` | `top` / `bottom` / `hidden` |

## Object Filters

```yaml
object_filters:
  - person
  - car
  - dog
  - cat
```

Max: **4 filters**

Supported:

- person
- car
- dog
- cat
- truck
- bus
- bicycle
- motorcycle
- bird

## Delete Options

| Option | Description |
|---|---|
| `delete_service` | Home Assistant service used to delete files |
| `allow_delete` | enable single delete action |
| `allow_bulk_delete` | enable multi-select delete |
| `delete_confirm` | require confirmation before delete |

---

# Example Configurations

## Basic sensor setup

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entity: sensor.camera_files
preview_position: top
preview_height: 320
```

## Multiple sensors

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entities:
  - sensor.camera_files_front
  - sensor.camera_files_back
delete_service: shell_command.camera_gallery_delete
allow_delete: true
allow_bulk_delete: true
delete_confirm: true
```

## Media Source

```yaml
type: custom:camera-gallery-card
source_mode: media
media_source: media-source://media_source/camera-gallery
thumb_size: 140
max_media: 30
```

## Frigate setup

```yaml
type: custom:camera-gallery-card
source_mode: media
media_sources:
  - media-source://frigate/frigate/event-search/clips
  - media-source://frigate/frigate/event-search/snapshots
preview_position: top
preview_click_to_open: true
object_filters:
  - person
  - car
  - dog
  - cat
live_enabled: true
live_camera_entity: camera.voordeur
```

## Live-first setup

```yaml
type: custom:camera-gallery-card
source_mode: media
media_sources:
  - media-source://frigate/frigate/event-search/clips
live_enabled: true
live_camera_entity: camera.voordeur
live_default: true
preview_position: top
preview_height: 400
thumb_size: 140
```

---

# Notes

Supported image formats:

```text
jpg
jpeg
png
webp
gif
```

Supported video formats:

```text
mp4
webm
mov
m4v
```

Media is automatically sorted by timestamp when possible.

Works best on:

- Tablets
- Wall dashboards
- Touch screens

The editor includes:

- Tabbed layout
- Sensor autocomplete
- Media source autocomplete
- Live validation for sensors and media folders

Legacy editor-only options such as `live_provider` and `show_live_toggle` have been removed to simplify configuration.

---

# License

MIT License
