# Camera Gallery Card

A lightweight, swipeable media gallery card for [Home Assistant](https://www.home-assistant.io/) Lovelace.  
Browse `.jpg` snapshots and `.mp4` clips stored on your system — sorted by date, with day-by-day navigation, bulk selection, download, and delete support.

<table>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/49a8f360-185a-4e8d-bd4d-3ae464a2ac1e" width="280" /></td>
    <td><img src="https://github.com/user-attachments/assets/b62eb219-43fc-4238-af55-20d5ddf746ba" width="280" /></td>
  </tr>
</table>

> **Current version:** 1.0.2

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Source Modes](#source-modes)
- [File Sensor Setup](#file-sensor-setup)
- [Automation Example](#automation-example)
- [Card Configuration](#card-configuration)
- [Delete Setup](#delete-setup)
- [File Naming Convention](#file-naming-convention)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Credits](#credits)
- [Nederlandse versie](#nederlandse-versie)

---

## Features

- 🖼️ Full-width preview with swipe navigation
- 📍 Configurable preview position (top / bottom)
- 👆 Optional preview-on-click behavior
- 🎬 Inline video playback with auto-generated poster thumbnails
- 📅 Day-by-day filtering with date navigation
- 🔄 Dual source mode (File sensor or Media folder)
- 📦 Maximum thumbnail option to control exactly how many items are loaded and displayed
- ✅ Bulk select & delete mode (sensor mode only)
- ⬇️ One-tap download for any file
- 🕒 Configurable timestamp bar (top / bottom / hidden)
- 🔆 Adjustable timestamp bar opacity
- 🎨 Smart visual editor with dropdowns
- 📱 Fully responsive, touch-friendly design

---

## Installation

### HACS (recommended)

1. Open HACS in Home Assistant.
2. Go to **Frontend** → click the **⋮** menu → **Custom repositories**.
3. Add this repository URL:  
   `https://github.com/TheScubadiver/camera-gallery-card`
4. Select **Dashboard** as the category and click **Add**.
5. Search for **Camera Gallery Card** and click **Install**.
6. Restart Home Assistant.

### Manual

1. Download `camera-gallery-card.js` and `camera-gallery-card-editor.js` from the latest release.
2. Copy both files to `/config/www/camera-gallery-card/`.
3. Add the resource in **Settings → Dashboards → Resources**:
   - **URL:** `/local/camera-gallery-card/camera-gallery-card.js`
   - **Type:** JavaScript Module
4. Restart Home Assistant.

---

## Source Modes

The gallery supports two ways of loading media:

### File Sensor Mode

Uses a `sensor` entity with a `fileList` attribute.  
This mode supports delete functionality.

### Media Folder Mode

Loads files directly from Home Assistant’s Media Source browser.  
Delete functionality is not available in this mode.

---

## File Sensor Setup

The card requires a **file sensor** that scans a directory and exposes the file list as an attribute (default: `fileList`).

Commonly done with the **Files in a Folder** integration:  
https://github.com/TarheelGrad1998/files

### Example sensor

```yaml
sensor:
  - platform: files
    folder: /config/www/<your_media_folder>
    name: <your_gallery_sensor_name>
    sort: date
```

**Notes:**

- The folder must be inside `/config/www/`
- The entity will be `sensor.<your_gallery_sensor_name>`

---

## Automation Example

### Snapshot

```yaml
filename: "/config/www/<your_media_folder>/camera{{ now().strftime('%Y%m%d_%H%M%S') }}.jpg"
```

### Video clip

```yaml
filename: "/config/www/<your_media_folder>/camera{{ now().strftime('%Y%m%d_%H%M%S') }}.mp4"
```

---

## Card Configuration

### Sensor mode

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entity: sensor.<your_file_sensor_entity>
delete_service: shell_command.<your_delete_service_name>
preview_height: 320
thumb_size: 140
max_media: 200
bar_position: top
bar_opacity: 45
preview_click_to_open: false
```

### Media folder mode

```yaml
type: custom:camera-gallery-card
source_mode: media
media_source: local/<your_media_folder>
preview_height: 320
thumb_size: 140
max_media: 200
bar_position: top
bar_opacity: 45
preview_click_to_open: false
```

---

## Delete Setup

Delete is only supported in Sensor mode.

```yaml
shell_command:
  delete_file: "rm -f '{{ path }}'"
```

⚠️ Only files inside `/config/www/` can be deleted.

---

## File Naming Convention

Required pattern:

```
YYYYMMDD_HHMMSS
```

Example:

```
20250227_143022.jpg
```

---

## Troubleshooting

**No media found**

- Check sensor exists
- Check `fileList`
- Confirm files are in `/config/www/`

---

## License

MIT © TheScubadiver

---

## Credits

Built for the Home Assistant community.

---

# Nederlandse versie

## Camera Gallery Card

Een lichte, swipebare mediagalerij-kaart voor [Home Assistant](https://www.home-assistant.io/) Lovelace.  
Blader door `.jpg` snapshots en `.mp4` videoclips die lokaal op je systeem zijn opgeslagen — gesorteerd op datum, met navigatie per dag, bulkselectie, downloaden en verwijderen.

---

## Functionaliteiten

- 🖼️ Volledige previewbreedte met swipe-navigatie  
- 📍 Instelbare previewpositie (boven / onder)  
- 👆 Optioneel openen van de preview bij thumbnailklik  
- 🎬 Inline video-afspelen met automatisch gegenereerde thumbnails  
- 📅 Filteren per dag met datum-navigatie  
- 🔄 Twee bronmodi (Bestandssensor of Media map)  
- 📦 `max_media` optie om exact te bepalen hoeveel items worden geladen en weergegeven  
- ✅ Bulk selecteren & verwijderen (alleen sensormodus)  
- ⬇️ Bestanden downloaden met één tik  
- 🕒 Instelbare tijdsbalk (boven / onder / verborgen)  
- 🔆 Instelbare transparantie van de tijdsbalk  
- 🎨 Slimme visuele editor met automatische dropdowns  
- 📱 Volledig responsive en touch-vriendelijk  

---

## Installatie

### Via HACS (aanbevolen)

1. Open HACS in Home Assistant  
2. Ga naar **Frontend → Custom repositories**  
3. Voeg deze repository toe  
4. Installeer de kaart  
5. Herstart Home Assistant  

### Handmatig

1. Download de JS-bestanden  
2. Plaats ze in `/config/www/camera-gallery-card/`  
3. Voeg de resource toe via Dashboards → Resources  
4. Herstart Home Assistant  

---

## Bronmodi

### Bestandssensor-modus

Gebruikt een `sensor` met een `fileList` attribuut.  
Ondersteunt verwijderen van bestanden.

### Media map-modus

Laadt bestanden rechtstreeks vanuit Home Assistant Media Source.  
Verwijderen is hier niet beschikbaar.

---

## Bestandssensor instellen

Voorbeeld:

```yaml
sensor:
  - platform: files
    folder: /config/www/<jouw_media_map>
    name: jouw_gallery_sensor
    sort: date
```

De map moet binnen `/config/www/` staan.

---

## Kaartconfiguratie

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entity: sensor.jouw_gallery_sensor
preview_height: 320
thumb_size: 140
max_media: 200
bar_position: top
bar_opacity: 45
preview_click_to_open: false
```

---

## Verwijderen instellen

```yaml
shell_command:
  delete_file: "rm -f '{{ path }}'"
```

Alleen bestanden binnen `/config/www/` kunnen worden verwijderd.

⚠️ Verwijderen is permanent.

---

## Bestandsnaamconventie

Benodigd patroon:

```
YYYYMMDD_HHMMSS
```

Voorbeeld:

```
20250227_143022.jpg
```

---

## Probleemoplossing

**Geen media zichtbaar**

- Controleer of de sensor bestaat  
- Controleer of `fileList` gevuld is  
- Controleer of bestanden in `/config/www/` staan  

---

MIT © TheScubadiver
