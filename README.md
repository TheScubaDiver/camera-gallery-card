# Camera Gallery Card

A lightweight, swipeable media gallery card for Home Assistant Lovelace. Browse snapshots and video clips from either file-list sensors or Home Assistant Media Source — with day-by-day navigation, object filters, download support, and optional delete actions.

The card is built for touch devices, tablets, and dashboards, and works especially well with Frigate media.

> **Current version:** 1.1.3

---

# Table of Contents

- [Features](#features)
- [Installation](#installation)
  - [HACS Installation](#hacs-installation)
  - [Manual Installation](#manual-installation)
- [Source Modes](#source-modes)
  - [Sensor Mode](#sensor-mode)
  - [Media Source Mode](#media-source-mode)
- [Frigate Usage](#frigate-usage)
- [Delete Setup](#delete-setup)
- [Configuration Options](#configuration-options)
- [Example Configurations](#example-configurations)
- [Notes](#notes)
- [License](#license)

---

# Features

- Full preview area for images and videos
- Swipe navigation inside the preview
- Preview position configurable: **top** or **bottom**
- Optional **click-to-open preview**
- Optional **tap-to-close preview**
- Inline video playback
- Automatic video poster generation
- Day-by-day navigation with **Today shortcut**
- Object filter buttons (`person`, `car`, `dog`, `cat`, etc.)
- Multi-select object filtering
- Source mode: **sensor or media**
- Support for **multiple sensors**
- Support for **multiple media folders**
- Horizontal thumbnail strip with **mouse wheel / trackpad scrolling**
- Configurable thumbnail size
- Configurable timestamp bar (top / bottom / hidden)
- Adjustable timestamp bar opacity
- Download button for current item
- Select mode for multiple items
- Bulk delete support (sensor mode)
- UI-only config updates without full reload
- Responsive layout
- Optimized for **tablets and dashboards**

---

# Installation

## HACS Installation

1. Open **HACS**
2. Go to **Frontend**
3. Click **⋮ → Custom repositories**
4. Add:

```
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

```
/config/www/camera-gallery-card/
```

Add resource:

**Settings → Dashboards → Resources**

```
URL: /local/camera-gallery-card/camera-gallery-card.js
Type: JavaScript Module
```

Restart Home Assistant.

---

# Source Modes

The card supports two different ways of loading media.

---

# Sensor Mode

Uses a sensor with a `fileList` attribute.

Example sensor output:

```
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

✔ Delete support  
✔ Fast loading  
✔ Works with custom folders  

### Notes

Sensor must expose:

```
fileList
```

Paths under:

```
/config/www/
```

are automatically converted to:

```
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

✔ Works directly with Media Source  
✔ Ideal for Frigate  
✔ No sensors required  

### Notes

Delete functionality is **not available** in media mode.

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

```
/config/www/
```

Example valid path:

```
/config/www/camera-gallery/clip1.mp4
```

---

# Configuration Options

### Source

| Option | Description |
|------|------|
| `source_mode` | sensor or media |
| `entity` | single sensor |
| `entities` | multiple sensors |
| `media_source` | single media folder |
| `media_sources` | multiple media folders |
| `max_media` | limit number of items |

### Preview

| Option | Description |
|------|------|
| `preview_position` | top / bottom |
| `preview_height` | preview height |
| `preview_click_to_open` | enable gated preview |
| `preview_close_on_tap` | allow closing preview |

### Bars & Thumbnails

| Option | Description |
|------|------|
| `bar_position` | top / bottom / hidden |
| `bar_opacity` | preview bar opacity |
| `thumb_size` | thumbnail size |
| `thumb_bar_position` | top / bottom / hidden |

### Object Filters

```
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

### Delete Options

- `allow_delete`
- `allow_bulk_delete`
- `delete_service`
- `delete_confirm`

---

# Example Configurations

### Basic sensor setup

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entity: sensor.camera_files
preview_position: top
preview_height: 320
```

### Multiple sensors

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

### Media Source

```yaml
type: custom:camera-gallery-card
source_mode: media
media_source: media-source://media_source/camera-gallery
thumb_size: 140
max_media: 30
```

### Frigate setup

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
```

---

# Notes

Supported image formats:

```
jpg
jpeg
png
webp
gif
```

Supported video formats:

```
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

---

# License

MIT License
