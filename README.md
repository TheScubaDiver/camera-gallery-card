![Camera Gallery Card](https://github.com/user-attachments/assets/c691413f-e475-4ff6-b636-352e420cef0b)

# Camera Gallery Card

Custom **Home Assistant Lovelace card** for browsing camera media in a clean **timeline-style gallery** with preview player, object filters, optional live view, and a built-in visual editor.

**Current version:** `v3.3.0` <!-- x-release-please-version -->

<p align="center">
  <img src="https://github.com/user-attachments/assets/1c71ada8-98bb-435e-bbc6-b6974186c2e0" width="30%" />
  <img src="https://github.com/user-attachments/assets/40caf878-bc55-4cfd-9381-3a353785acf3" width="30%" />
</p>

---

## Installation

### Marketplace (Home Assistant 2026.11 and newer)

Home Assistant 2026.11 has HACS built in as the **Marketplace**.

[![Open your Home Assistant instance and open this repository.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=TheScubadiver&repository=camera-gallery-card&category=plugin)

1. Click the button above, or go to **Settings → Marketplace** and search for **Camera Gallery Card**
2. Click **Install**
3. Reload your browser

The Marketplace adds the dashboard resource for you and shows updates under **Settings → Updates**.

### HACS (older Home Assistant versions)

On Home Assistant before 2026.11, the same button opens HACS. Click **Download**, then reload your browser.

## Quick start

Got the card installed? Here's the fastest way to see something on screen.

1. In Home Assistant, open your dashboard and click **Edit dashboard** (top right).
2. Click **Add card** and search for **Camera Gallery Card**. On Home Assistant 2026.6 and newer you can also pick a camera on the **By entity** tab: the card is suggested under **Community** as a live view of that camera.
3. Pick a **source mode** when prompted:
   - **Sensor mode** — you have snapshot files in `/config/www/...` (e.g. saved by an automation). Also requires [FileTrack](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/sources.md#filetrack-optional--for-sensor-mode).
   - **Media mode** — you use Frigate, a NAS folder, or anything reachable via Home Assistant's media browser.
   - **Combined mode** — both at once, merged into one timeline.
4. Save. The editor walks you through the rest.

> [!TIP]
> Not sure which mode? See [Choosing a source mode](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/sources.md#choosing-a-source-mode) below.

> [!NOTE]
> The card shows files that **already exist**. It does *not* trigger snapshots itself — that's the job of a Home Assistant automation or your camera integration (e.g. Frigate). If your gallery is empty, you probably need to set up a snapshot automation first.

> [!NOTE]
> Sensor mode needs the FileTrack integration. See [Sources → FileTrack](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/sources.md#filetrack-optional--for-sensor-mode).

## Features

- 🖼️ **[Timeline gallery](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/gallery.md)** — preview, day grouping, filters, favorites, swipe and long-press actions
- 🎥 **[Live view](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/live-view.md)** — single camera or multi-camera grid, pinch-zoom, fullscreen, snapshot
- ⚡ **[Camera triggers](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/live-view.md#camera-triggers)** — switch to a camera on motion, a person or the doorbell
- 🔄 **[Rotation and crop](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/live-view.md#camera-rotation)** — per camera
- 🎙️ **[Two-way audio](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/two-way-audio.md)** — talk through the camera's speaker
- 🕹️ **[PTZ](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/live-view.md#manual-service-ptz)** — joystick with zoom and home
- 🐾 **[Frigate and Reolink](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/sources.md#frigate)** — real-time events, clips, snapshots, clip delete
- 🎨 **[Styling](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/styling.md)** — colors, pills, toolbar, CSS variables

## Documentation

| Page | What's in it |
|---|---|
| [Sources](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/sources.md) | Sensor, media and combined mode, FileTrack, path date format, Frigate and Reolink examples |
| [Gallery](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/gallery.md) | Gallery features, object filters, custom menu actions, delete setup |
| [Live view](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/live-view.md) | Live cameras, grid, crop, rotation, triggers, menu buttons, PTZ, deep links |
| [Two-way audio](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/two-way-audio.md) | Home Assistant two-way audio, go2rtc backchannel, TURN |
| [Configuration](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/configuration.md) | The editor and every option in one table |
| [Styling](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/styling.md) | Styling tab, pills and toolbar, CSS variables |
| [Troubleshooting](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/troubleshooting.md) | Common problems, debug mode |

## Help

Gallery empty, items without dates, or delete doing nothing? See [Troubleshooting](https://github.com/TheScubaDiver/camera-gallery-card/blob/main/docs/troubleshooting.md). Still stuck? [Open an issue](https://github.com/TheScubaDiver/camera-gallery-card/issues).

## License

MIT License
