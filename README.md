# Camera Gallery Card

Custom **Home Assistant Lovelace card** for browsing camera media in a clean **timeline-style gallery** with preview player, object filters, optional live view, and a built-in visual editor.

**Current version:** `v2.0.1`

<p align="center">
  <img src="https://github.com/user-attachments/assets/1c71ada8-98bb-435e-bbc6-b6974186c2e0" width="48%" />
  <img src="https://github.com/user-attachments/assets/40caf878-bc55-4cfd-9381-3a353785acf3" width="48%" />
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
- Multiple sensors or media folders

### Live view

- Native Home Assistant **WebRTC live preview**
- Redesigned live view layout
- Live badge
- Camera switching with configurable picker
- Default live camera
- Camera friendly names and entity IDs in selector

### Video controls

- Video autoplay toggle (gallery)
- Separate auto-mute toggle for gallery and live view
- Per-object filter color customization

### Actions

- Delete
- Multiple delete
- Download
- Long-press action menu

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
- Cleanup of legacy config keys
- Live preview in the HA card picker
- Create new FileTrack sensor from the General tab

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

> [!TIP]
> To enable delete actions, configure a shell command in Home Assistant and provide the service name in the card editor under **General → Delete service**.

Optional delete options are also available in the editor:

- Confirm before deleting
- Allow bulk delete

> [!NOTE]
> Delete is intended for files inside `/config/www/`. Frigate media sources do not support delete actions.

---

## Configuration options

<details>
<summary>Show all configuration options</summary>

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
| `object_colors` | Color per object filter |
| `entity_filter_map` | Map entity to object type |
| `live_enabled` | Enable live mode |
| `live_camera_entity` | Default camera entity for live view |
| `live_camera_entities` | Camera entities visible in the live picker |
| `live_auto_muted` | Auto-mute audio in live view |
| `autoplay` | Auto-play videos in gallery |
| `auto_muted` | Auto-mute videos in gallery |
| `object_fit` | Media display mode: `cover` or `contain` |
| `allow_delete` | Enable delete action |
| `allow_bulk_delete` | Enable bulk delete |
| `delete_confirm` | Show confirmation before deleting |
| `delete_service` | Delete file service |
| `style_variables` | Custom CSS variable overrides |

</details>

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

## Filename parsing

The card extracts timestamps from filenames for sorting, day grouping, preview timestamps, and thumbnail labels.

Example supported formats:
```
2026-03-09_12-31-10_person.jpg
20260309_123110_person.jpg
clip-1741512345-person.mp4
```

A custom format can be set in the editor using these tokens:

| Token | Meaning |
|------|------|
| YYYY | Year |
| MM | Month |
| DD | Day |
| HH | Hour |
| mm | Minutes |
| ss | Seconds |

---

## License

MIT License
