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

1. Add the FileTrack repository:
   - **Home Assistant 2026.11 and newer:** go to **Settings → Marketplace → Add from link** and enter `TheScubadiver/FileTrack`
   - **Older versions:** open **HACS**, click the three-dot menu, choose **Custom repositories** and add `https://github.com/TheScubadiver/FileTrack` as an **Integration**
2. Install **FileTrack**
3. **Restart Home Assistant**
4. Go to **Settings → Devices & Services** and add **FileTrack**

> [!NOTE]
> Once you have installed FileTrack, you can leave it alone. No need to configure anything in FileTrack — everything is configured in the card editor UI.

<img width="434" height="181" alt="Scherm­afbeelding 2026-03-28 om 13 51 00" src="https://github.com/user-attachments/assets/3d0bb033-7523-4204-bedf-2548cebbbec1" />

---

## Features

### Gallery

- Image & video preview
- **Fullscreen image viewer** — tap to open in fullscreen, rotates to landscape on mobile, with pinch-to-zoom, pan, double-tap and mouse wheel zoom (turn zoom off with `fullscreen_zoom: false`)
- **Video clip fullscreen** — the card's own overlay by default (keeps your place in the clip); optionally the platform's native player via `gallery_fullscreen: video`
- Timeline thumbnails with lazy loading
- Day grouping, with a **date picker** and Today button to jump between days
- **Scroll time pill** — while you scroll the thumbnails, a small pill shows the date and time of the items in view
- Filename timestamp parsing
- Object filter buttons with custom icon support
- Object detection pill in timestamp bar
- Horizontal or vertical thumbnail layout
- Mobile friendly
- Media type icon (image / video)
- Cover / Contain option for media display
- **Preview-only mode** (`clean_mode`) — the card shows either the gallery or the preview, never both. Tap a thumbnail to open it full size; the back button returns to the gallery
- **Favorites** — star any item with a tap; filter the timeline to show only favorites
- **Prev / next navigation** — chevron arrows on the preview (hide them with `gallery_chevrons_enabled: false`), <kbd>←</kbd>/<kbd>→</kbd> in the fullscreen viewer on desktop, and on touch screens swipe left or right on a preview image
- **Swipe to delete** — on touch screens, swipe a thumbnail to the left to delete it (only when a delete service is set up for that item)
- **Preview pills** — configurable buttons over the preview: object indicator, index counter (`3/12`), auto-play all (plays the following clips one after another), mute, playback speed (1×, 2×, 0.5×), Picture-in-Picture, fullscreen and the time read-out. Turn each one on or off and reorder them in the editor (see [Pills and toolbar](#pills-and-toolbar))
- **Custom menu actions** — add your own entries to the long-press menu that call a Home Assistant action with the item's path or URL (see [Custom menu actions](#custom-menu-actions))
- **Sync entity** — set `sync_entity` to an `input_text` helper and the card writes the file name of the item you are viewing into it, for use in automations

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
- Live view layout: camera name on the left, controls on the right
- **Controls mode** — choose between `overlay` (controls fade out after inactivity) or `fixed` (always visible)
- **Live pills** — mute, camera picker, Picture-in-Picture, fullscreen, snapshot (saves a JPEG of the current frame) and refresh stream. Turn each one on or off and reorder them in the editor (see [Pills and toolbar](#pills-and-toolbar))
- **Native fullscreen** — set `live_fullscreen: video` to open the live stream in the platform's own player instead of the card overlay (grid layout always uses the card)
- **Pinch to zoom in card fullscreen** — touch, trackpad, and Ctrl + scroll wheel; pan with the mouse after zooming in
- **Aspect ratio toggle** — quickly switch between 16:9, 4:3 and 1:1, remembered per camera
- Live badge
- **Multiple live cameras** — configure several cameras and switch between them using chevron arrows (hide them with `live_chevrons_enabled: false`) or the camera picker. The first camera in the list opens first. See [Live cameras](#live-cameras)
- **Crop per camera** — zoom into a region of a camera's picture, e.g. only the doormat of a wide-angle doorbell. Set it visually with **Crop view** in the editor's Live tab
- **Multi-camera grid layout** (`live_layout: grid`) — show all cameras at once, tap a tile to focus on one. The grid shapes itself to the camera count so there are no empty cells, every tile keeps the card's configured aspect ratio, and the card's height adapts to fit. Pin the column count with `live_grid_columns`, or leave it automatic (narrow cards drop to fewer columns on their own). Control where the larger tiles land with `live_grid_emphasis`: `bottom` (default), `top`, or `hero`
- **RTSP streams** — add cameras by stream URL instead of a camera entity (see [Live cameras](#live-cameras))
- **Frozen-stream recovery** — if the live picture stops moving for about six seconds the card rebuilds the stream by itself, up to three tries (a stream that is still connecting gets 15 seconds before it counts as stuck). After the last try a "Stream stopped — Try again" notice appears. It never acts while the tab is hidden, in Picture-in-Picture, in native video fullscreen, or during talkback, and it only watches single-camera live view (not grid tiles). Turn it off with `live_auto_recover: false` or in the editor's Live tab.
- **Camera triggers** — motion, a person, the doorbell: the card switches to that camera's live view by itself and goes back afterwards. See [Camera triggers](#camera-triggers)
- **Offline camera placeholder** — unavailable cameras show a clear "offline" tile instead of a black frame
- **Keyboard navigation** — <kbd>←</kbd>/<kbd>→</kbd> to switch between cameras in single layout
- **Tap action** — choose what a tap on the live picture does with `tap_action`: a standard Home Assistant action (`more-info`, `toggle`, `perform-action`, `navigate`, `url`) or the card's own `fullscreen`, `snapshot` or `refresh`
- **PTZ overlay** — a joystick with zoom and home buttons for cameras that can pan and tilt. Built-in support for EZVIZ, Reolink, Frigate and ONVIF, plus a manual mode that calls any service (see [Manual service PTZ](#manual-service-ptz))
- Camera friendly names and entity IDs in selector
- Auto-teardown of stream + push-to-talk on view switch (no audio/bandwidth leak)
- **Two-way audio (talkback)** — tap the mic pill in live view to speak through a camera's backchannel speaker. Per-camera, with tap-to-toggle or push-to-talk modes, a full-width bar or a compact round button (`live_mic_shape`), and a live waveform while you talk. Active talkback temporarily unmutes listening, then restores your previous setting; manual speaker choices take priority. *Advanced setup* — see [Two-way audio](#two-way-audio-advanced) below.

Listening audio recovery reuses existing Home Assistant WebRTC receiver
tracks to allow speaker unmute after muted startup. It depends on
feature-detected player internals, so compatibility is not guaranteed across
frontend versions. Browser autoplay policy can also block listening; retry
with the speaker button and check **Debug → Listening audio**. Local automated
tests do not establish real camera audio or device fullscreen behavior.

### Actions

- **Menu buttons** — configure custom action buttons (toggle, navigate, perform action, etc.) in the hamburger menu during live view, or directly among the live controls. A button on an `input_select` / `select` entity opens a list of its options (see [Live menu buttons](#live-menu-buttons))
- Delete (sensor files + Frigate clips)
- Multiple delete with red selection style
- Download
- Long-press action menu

### Frigate

- **WebSocket via HA integration** (default) — uses the official Frigate HA integration's WS API. CORS-free, no `frigate_url` required, works with standalone Frigate containers. **New events arrive in real time** — no polling, no refresh.
- **Direct REST API** (`frigate_url`, optional) — even faster if your Frigate is reachable from the browser
- Automatic fallback: if REST fails, WS path takes over
- Automatic Frigate snapshot thumbnails
- **Bounding boxes on thumbnails** (`frigate_thumb_bbox: true`) — uses Frigate's annotated snapshot as the thumbnail. Requires `snapshots.bounding_box: true` in your Frigate camera config
- **Event clustering** (`frigate_event_cluster: true`) — events for the same camera and label that follow each other within `frigate_event_cluster_gap_sec` seconds (default 30) collapse into one thumbnail with a count badge. Tap the badge to expand the cluster
- **Server-side scoping** — `frigate_cameras` and `frigate_labels` limit which events the card loads at all (see [Frigate, scoped to one camera](#frigate-scoped-to-one-camera))
- **Frigate clip delete** via `rest_command` — see [Delete setup](#delete-setup)

### Thumbnails

- Automatic frame capture for **all** video sources in media source mode
  - Frigate cameras: Frigate snapshot
  - All other sources (NAS, Blue Iris, etc.): a frame captured from the clip
- Sensor mode: a frame captured from the clip
- **Choose the frame** — `thumbnail_frame_pct` picks where in the clip the frame is taken: `0` (default) is the first frame, `100` the last
- **Save bandwidth** — `capture_video_thumbnails: false` skips frame capture entirely and only shows thumbnails the server provides. Useful on slow or metered connections
- **Paired image + video** — when a snapshot and clip share the same filename stem they're shown as one item, with the image used as the thumbnail
  - Snapshots stamped a few seconds off their clip pair too (Reolink FTP: `Cam_00_20261012111141.jpg` + `Cam_00_20261012111139.mp4`), when `path_datetime_format` dates both files, their names differ only in the timestamp digits, and the times are within 15s. A clip that started before the snapshot wins over a closer one that started after it

### Video controls

- Video autoplay toggle (gallery)
- Separate auto-mute toggle for gallery and live view
- Per-object filter color customization

<img width="441" height="307" alt="Scherm­afbeelding 2026-03-29 om 20 49 53" src="https://github.com/user-attachments/assets/bdcde10e-b882-444f-a99d-0ae0073e68a7" />

### Editor

Built-in Lovelace editor. Each tab is split into sections you can fold open and closed:

| Tab | Sections |
|---|---|
| **Source** | View (default view, deep-link id), Source (source mode, sensors, media folders, create a FileTrack sensor), Frigate (shown in media and combined mode) |
| **Gallery** | Display, Playback, Controls (preview pills), Long-press actions |
| **Live** | Basics, Streams, Two-way audio, PTZ, Menu buttons, Controls (live pills, chevrons, frozen-stream recovery) |
| **Thumbnails** | Layout, Toolbar, Filters, Video frame |
| **Styling** | Colors, radius, opacity and spacing (see [Styling](#styling)) |
| **Advanced** | Path parsing (with auto-detect), Delete services, Diagnostics, Export YAML |

Features:

- Entity suggestions
- Media folder browser (starts at root)
- Field validation
- Object filter picker
- **Auto-detect path datetime format** — scans your sources and suggests a working format (Advanced → Path parsing)
- **Visual crop tool** per live camera (Live tab)
- Drag-and-drop ordering of pills and toolbar buttons
- **Export YAML** — copy the card's current config to the clipboard
- Cleanup of legacy config keys
- Live preview in the HA card picker
- Create a new FileTrack sensor from the Source tab

### Debug mode

Turn on **Debug mode** under **Advanced → Diagnostics** to show a debug pill in live view. Tapping it opens a diagnostics report with card version, HA info, Frigate state, runtime queue stats, and the active source/path. Useful for support questions and issue reports.

### Styling

The **Styling** tab provides a visual editor for colors, border radius, opacity and spacing.

<details>
<summary>Show styling sections</summary>

| Section | Options |
|---|---|
| Card | Background, Border color, Border radius, Height (`card_height`) |
| Pills | Text / icon color, Background, Size (`pill_size`), Opacity (`bar_opacity`) |
| Thumbnails | Bar background, Bar text color, Border radius, Unselected opacity (`thumb_off_opacity`) |
| Filter buttons | Background, Icon color, Active background, Active icon color, Border radius |
| Today / Date / Live | Text color, Chevron color, Live active color, Delete button color, Border radius |
| Two-way audio | Background, Opacity (`talkback_opacity`) |
| Live navigation | Background, Opacity (`chevron_opacity`) |
| Layout | Row spacing (`row_gap`) |

</details>

### Pills and toolbar

The buttons over the preview, over the live view and in the gallery toolbar can each be switched off and reordered. The editor does this for you (Gallery → Controls, Live → Controls, Thumbnails → Toolbar). In YAML you only list the ones you want to change; everything else keeps its default.

```yaml
gallery_pills:
  playback_speed:
    enabled: false
  pip:
    order: 5          # lower numbers show first
gallery_pills_align: left   # left, center (default) or right
live_pills:
  snapshot:
    enabled: false
toolbar_order:
  live: 5             # put the Live button first
show_media_filter: false
```

| Area | Key | Ids (default order) |
|---|---|---|
| Preview | `gallery_pills` | `object_indicator`, `index_counter`, `autoplay_all`, `mute`, `playback_speed`, `pip`, `fullscreen`, `video_time` |
| Live view | `live_pills` | `mute`, `picker`, `pip`, `fullscreen`, `snapshot`, `refresh` |
| Gallery toolbar | `toolbar_order` (order), `show_*` (on/off) | `today` (`show_today`), `media_filter` (`show_media_filter`), `favorite` (`show_favorite`), `live` (`show_live`) |

Each pill takes `enabled` (default `true`) and `order` (a number; the defaults are spaced by 10, so `15` lands between the first two). `gallery_pills_align` only applies when `controls_mode` is `overlay`. Some live pills only appear when they make sense: the camera picker needs at least two cameras, and the hamburger menu, PTZ and debug pills have their own settings.

---

## Delete setup

The card supports two independent delete paths. Configure either or both — they're complementary:

### Sensor file delete (shell_command)

For sensor mode items (and combined-mode sensor-backed items). Add a `shell_command` to your `configuration.yaml`:

```yaml
shell_command:
  gallery_delete: 'rm -f "{{ path }}"'
```

Then in the card editor: **Advanced → Delete services → File sensor** → pick `shell_command.gallery_delete`.

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

Then in the card editor: **Advanced → Delete services → Frigate** → pick `rest_command.delete_frigate`.

> [!TIP]
> Frigate's DELETE event endpoint wipes the clip, snapshot, and thumbnail in one call. The card hides paired items together after a successful delete.

> [!WARNING]
> The variable names in your `shell_command` and `rest_command` templates **must stay exactly as shown**. The card passes `{{ path }}` to the sensor delete service, and `{{ event_id }}` plus `{{ camera }}` to the Frigate delete service (so you can template `{{ camera }}` into the URL if your Frigate setup needs it). Renaming any of these (e.g. `{{ path }}` → `{{ filepath }}`) silently breaks the call. After editing `configuration.yaml`, restart Home Assistant (or reload YAML via *Developer Tools → YAML*).

### Confirmation & bulk

- `delete_confirm` — show confirmation dialog (default: `true`)
- `allow_bulk_delete` — enable multi-select bulk delete (default: `true`)

---

## Custom menu actions

Add your own entries to the long-press (right-click) menu of a thumbnail. Each one calls a Home Assistant action, such as a script, with details of the pressed item. This lets you, for example, archive a recording to permanent storage without downloading it first. You can set them up in the editor's Gallery tab under **Long-press actions**, or in YAML.

```yaml
thumb_actions:
  - name: Archive
    icon: mdi:archive-arrow-down
    perform_action: script.archive_clip
    data:
      path: "{path}"
      media_id: "{media_id}"
    confirmation: true
```

| Key | Description |
|---|---|
| `name` | Menu label (required) |
| `icon` | MDI icon (default `mdi:gesture-tap-button`) |
| `perform_action` | Action to call, in `domain.service` form (required) |
| `data` | Action data. Placeholders below are filled in per item |
| `target` | Optional action target (`entity_id`, `device_id`, `area_id`) |
| `confirmation` | `true`, or `{ text: "..." }`, to ask before running |

Placeholders, usable in any string inside `data` and `target`:

| Placeholder | Value |
|---|---|
| `{path}` | Filesystem path on the HA host, when the card can derive it: `media-source://media_source/local/…` becomes `/media/…`, and `/local/…` becomes `/config/www/…`. Empty for other media folders and for integration sources such as Frigate or Reolink |
| `{media_id}` | The item's own id: the `media-source://…` URI, or the sensor file path |
| `{url}` | A URL the browser can open. For media-source items this is a signed, short-lived URL |
| `{filename}` | The file name, e.g. `clip_2026-06-12_12-00-00.mp4` |

The placeholders use single braces, so they never clash with `{{ }}` templates inside your script. A script receives the values as variables, for example:

```yaml
script:
  archive_clip:
    fields:
      path:
        description: File to archive
    sequence:
      - action: shell_command.archive_clip
        data:
          path: "{{ path }}"

shell_command:
  archive_clip: 'cp "{{ path }}" /media/archive/'
```

> [!NOTE]
> If your media lives in a folder you added under `media_dirs` (anything other than `local`), the card can't see where that folder is on disk, so `{path}` stays empty. Pass `{media_id}` instead and map it to a path in your script.

---

## Live cameras

`live_cameras` is the list of cameras for live view. Each entry is either a Home Assistant camera entity or an RTSP stream URL, and per-camera settings sit on the same entry. The first camera in the list opens first. The editor's Live tab writes this list for you.

```yaml
live_enabled: true
live_cameras:
  - entity: camera.front_door
    name: Front door            # optional, overrides the friendly name
    mic: front_door             # optional, go2rtc stream for two-way audio
  - entity: camera.garden
    crop: { x: 20, y: 30, w: 50, h: 50 }   # optional, set with Crop view
  - url: rtsp://user:pass@192.168.1.20:554/stream1
    name: Shed
```

| Key | Description |
|---|---|
| `entity` | Camera entity. Use either `entity` or `url`, not both |
| `url` | RTSP stream URL, for a camera without an entity in Home Assistant |
| `name` | Display name. Empty uses the entity's friendly name |
| `mic` | go2rtc stream name that carries the camera's backchannel audio. See [Two-way audio](#two-way-audio-advanced) |
| `crop` | Visible region in percent of the full picture: `x`, `y` (top-left corner), `w`, `h` (size). Easiest to set with **Crop view** in the editor |
| `triggers` | Entities that switch the card to this camera when they turn active. See [Camera triggers](#camera-triggers) |

Stream URLs play through the [AlexxIT/WebRTC](https://github.com/AlexxIT/WebRTC) integration, or through your own go2rtc server when you set `live_go2rtc_url` (for example `http://192.168.1.10:1984`). If Home Assistant runs on HTTPS, that go2rtc URL must be HTTPS too, or the browser blocks it.

> [!NOTE]
> Older configs used `live_camera_entities`, `live_stream_urls`, `live_stream_url` / `live_stream_name` and `live_mic_streams` for the same information. They still work: the card converts them into `live_cameras` when it loads, and the editor saves the new form the next time you save. The old `live_camera_entity` (default camera) is folded in too, by moving that camera to the top of the list.

---

## Live menu buttons

`menu_buttons` adds action buttons to the live view. You can add them in the editor (Live tab → Menu buttons) or in YAML.

```yaml
menu_buttons:
  - entity: input_select.doorbell_reply
    icon: mdi:message-reply-text
    title: Auto-reply
    placement: controls        # show it among the live controls
  - entity: light.porch
    icon: mdi:lightbulb-outline
    icon_on: mdi:lightbulb
    color_on: "#f5a623"        # stays in the hamburger menu (the default)
```

| Key | Description |
|---|---|
| `entity` | Entity the button acts on (required) |
| `icon` / `icon_on` | Icon, and the icon while the entity is "on" |
| `color_on` / `color_off` | Button background while on / off |
| `title` | Label (default: the entity's friendly name) |
| `service` | Action to call instead of the default, in `domain.service` form. It is called with the button's `entity_id` |
| `state_on` | State that counts as "on" (default: `on`, `open`, `unlocked`, `playing`, `home`, …) |
| `placement` | `menu` (default) puts the button in the hamburger menu. `controls` shows it directly among the live control pills |

What a tap does:

- **`input_select` / `select` entities** open a list of their options, with the current one checked. Picking one calls `select_option`. This works well for things like a doorbell auto-reply message or a chime sound.
- **Automations** are triggered, and **scripts** are run.
- **Everything else** is toggled.
- A `service`, when set, always wins over these defaults.

In the editor (Live tab → Menu buttons), turn on **Show among live controls** for a button to set `placement: controls`. Turn it off to move the button back into the hamburger menu.

---

## Camera triggers

Let the card switch to a camera on its own when something happens there, for example on a wall tablet: motion at the front door shows the front door camera, and after a while the card goes back to what it showed before.

```yaml
live_enabled: true
live_cameras:
  - entity: camera.front_door
    triggers:
      - binary_sensor.front_door_motion
      - event.front_door_doorbell
  - entity: camera.garden
    triggers:
      - binary_sensor.garden_person_occupancy
live_triggers:               # optional, these are the defaults
  hold_seconds: 30
  cooldown_seconds: 10
  return_to: previous
```

**What counts as a trigger.** An entity in a camera's `triggers` list fires when it turns active: `on`, `open`, `detected`, `occupied`, `home` or `ringing`. An `event.*` entity (a doorbell press, for instance) fires on every new event. Turning off or staying on does nothing.

**What happens.** The card switches to that camera in single live view, also out of the gallery or the grid. When another trigger fires while it is showing, the last one wins and the timer starts over. `hold_seconds` after the last trigger the card goes back, unless someone tapped the card in the meantime: then it stays where they left it.

| `live_triggers` key | Meaning |
|---|---|
| `hold_seconds` | How long to stay after the last trigger, 5–3600 [`30`] |
| `cooldown_seconds` | Ignore repeat triggers for the same camera within this time, 0–3600 [`10`] |
| `return_to` | `previous` (the view it came from), `gallery`, or `stay` (keep showing the camera) [`previous`] |
| `frigate` | Also switch on new Frigate events [`false`]. See below |
| `frigate_labels` | Only these Frigate labels trigger, e.g. `[person]`. Empty means all |

**Frigate.** With `frigate: true`, a new Frigate event switches to `camera.<frigate camera name>` (the name the Frigate integration gives its camera entities), when that camera is in your live list. The card uses the Frigate instance of your Frigate media source, or Frigate's default `frigate` instance when the card has no Frigate media source.

**When it does not switch.** The card leaves you alone while you are using it: in fullscreen, in Picture-in-Picture, during talkback, with a menu or bulk select open, and for 15 seconds after the last tap or key press on the card.

In the editor: fill in **Triggers** on a camera under **Live → Basics → Cameras in picker**, and set the rest under **Live → Triggers**. Triggers for stream-URL cameras can only be set in YAML.

> [!NOTE]
> The card only reacts while the dashboard is open, for example on a tablet with a kiosk browser. It cannot wake a sleeping screen or open the dashboard; use a Home Assistant automation or your kiosk app for that.

---

## Notification deep-links

Opt-in URL parameters so an HA notification action can open this exact card straight into live view or the gallery. Nothing here does anything until you set `url_id` — without it the card ignores the query string entirely, which matters because the query string is page-scoped and would otherwise be picked up by every camera-gallery-card on the dashboard at once.

Set a `url_id` in the editor's **Source → View** section (or `url_id: porch` in YAML), then point a notification action at:

```
/lovelace/home?cgc_id=porch&cgc_camera=camera.porch_gate
```

| Parameter | Meaning |
|---|---|
| `cgc_id` | Must match the card's `url_id` exactly, or the whole query string is ignored |
| `cgc_view` | `live` or `gallery` — which screen to open |
| `cgc_camera` | An entry from the card's own live camera list — a camera entity, or `__cgc_stream_<n>__` for the n-th stream-URL camera, counting from 0 — opens live view on that camera |

A worked example, e.g. from a motion automation:

```yaml
action: notify.mobile_app_your_phone
data:
  message: "Motion at the porch"
  data:
    clickAction: "/lovelace/home?cgc_id=porch&cgc_camera=camera.porch_gate"
```

`?cgc_id=porch&cgc_view=gallery` opens the gallery on the newest clip regardless of `thumb_sort_order` — with one caveat: once a day has more items than `max_media` (default 50), the gallery only ever holds the oldest `max_media` of them under `oldest` sorting, so the deep link lands on the newest clip *within that truncated window*, not necessarily the day's actual newest clip. That truncation applies to `oldest` sorting generally, deep link or not.

> [!NOTE]
> `cgc_camera` only works together with live view. The gallery's sources are configured separately from the live camera list, and the card has no camera-to-clip mapping, so a camera can't filter the gallery. Passing `cgc_camera` therefore implies live view — and an explicit `cgc_view=gallery` makes `cgc_camera` be ignored.

> [!NOTE]
> Deep links apply when the card first initializes on page load. Navigating to the same URL within an already-open dashboard may not re-run that initialization, since Home Assistant is a single-page app — for a reliable deep link, the notification should open the dashboard fresh (e.g. via `clickAction`) rather than assume a tab already on the dashboard will react.

> [!NOTE]
> All of `cgc_id`, `cgc_view`, and `cgc_camera` are case-sensitive. `cgc_view=Gallery` isn't recognized as `gallery` — and if a camera is also present, that falls through to opening *live* instead, the opposite of what a mistyped gallery link probably intended. And if more than one card on the dashboard shares the same `url_id`, they'll all react to the same query string at once — keep `url_id` unique per card.

---

## Configuration options

Everything below can also be set in the visual editor. Defaults are shown in brackets.

<details>
<summary>Show all configuration options</summary>

| Option | Description |
|------|------|
| **Source** | |
| `source_mode` | `sensor`, `media`, or `combined`. Left out, the card picks `media` when only media sources are set, otherwise `sensor` |
| `entities` | Sensor source(s) with a `fileList` attribute (sensor and combined mode). A single `entity` is accepted too |
| `media_sources` | Media browser source(s), e.g. `media-source://frigate/...` (media and combined mode). A single `media_source` is accepted too |
| `path_datetime_format` | Format pattern for parsing timestamps from paths. Needed in **all source modes** for day grouping and time sort. Exceptions: Frigate sources (`media-source://frigate/...`) carry their own event-id timestamps, and Reolink sources (`media-source://reolink/...`) are parsed intrinsically by the dedicated engine. See [Path datetime format](#path-datetime-format) |
| `max_media` | Max media items per day, 1–500 [`50`] |
| **Frigate** | |
| `frigate_url` | Optional direct Frigate REST API URL (e.g. `http://192.168.1.x:5000`). If omitted, the card uses the HA Frigate integration via WebSocket |
| `frigate_cameras` | Server-side camera filter for Frigate sources (list of camera names, e.g. `[frontdoor]`). Empty/omitted means all cameras — Frigate's own default. Works with both the WS and REST (`frigate_url`) paths |
| `frigate_labels` | Server-side label filter for Frigate sources (list of labels, e.g. `[cat]`). Empty/omitted means all labels |
| `frigate_thumb_bbox` | Use Frigate's snapshot with bounding boxes as the thumbnail [`false`]. Needs `snapshots.bounding_box: true` in Frigate |
| `frigate_event_cluster` | Collapse events for the same camera and label that follow each other closely into one thumbnail [`false`] |
| `frigate_event_cluster_gap_sec` | Maximum gap in seconds between clustered events, 1–600 [`30`] |
| **Gallery** | |
| `start_mode` | Default view: `gallery` or `live` [`gallery`] |
| `url_id` | Opt-in id for notification deep-links. See [Notification deep-links](#notification-deep-links) |
| `preview_position` | `top` or `bottom` [`top`] |
| `clean_mode` | Preview-only mode: show either the gallery or the preview, not both [`false`] |
| `object_fit` | Media display mode: `cover` or `contain` [`cover`] |
| `aspect_ratio` | Preview aspect ratio: `16:9`, `4:3`, or `1:1` [`16:9`] |
| `autoplay` | Auto-play videos in gallery [`false`] |
| `auto_muted` | Start gallery videos muted [`true`] |
| `gallery_fullscreen` | Clip fullscreen: `overlay` (the card's viewer; continues where the clip was) or `video` (the platform's own player) [`overlay`] |
| `fullscreen_zoom` | Pinch, double-tap and wheel zoom in the fullscreen image viewer [`true`] |
| `gallery_chevrons_enabled` | Show the prev/next arrows on the preview [`true`] |
| `gallery_pills` | Turn preview pills on or off and reorder them. See [Pills and toolbar](#pills-and-toolbar) |
| `gallery_pills_align` | Preview pill row alignment: `left`, `center`, or `right` [`center`] |
| `sync_entity` | An `input_text` helper that receives the file name of the item you are viewing |
| **Gallery toolbar** | |
| `show_today` | Show the Today button [`true`] |
| `show_media_filter` | Show the video / image filter [`true`]. Only appears when the gallery holds both videos and images |
| `show_favorite` | Show the favorites filter [`true`] |
| `show_live` | Show the Live button [`true`] |
| `toolbar_order` | Reorder the toolbar buttons. See [Pills and toolbar](#pills-and-toolbar) |
| **Thumbnails** | |
| `thumb_layout` | `horizontal` or `vertical` [`horizontal`] |
| `thumb_size` | Thumbnail size in px, 40–220 [`86`] |
| `thumb_bar_position` | Thumbnail timestamp bar: `top`, `bottom`, or `hidden` [`bottom`] |
| `thumb_sort_order` | `newest` or `oldest` first [`newest`] |
| `thumb_off_opacity` | Opacity of thumbnails that are not selected, 0–100 % [`30`] |
| `thumbnail_frame_pct` | Where in a clip the thumbnail frame is taken, 0 (first frame) – 100 (last frame) [`0`] |
| `capture_video_thumbnails` | Capture a frame from clips that have no server thumbnail [`true`]. Turn off to save bandwidth |
| `bar_position` | Preview timestamp bar: `top`, `bottom`, or `hidden` [`top`] |
| `bar_opacity` | Opacity of the preview bar and pills, 0–100 % [`30`] |
| **Live view** | |
| `live_enabled` | Enable live mode [`false`] |
| `live_cameras` | The live cameras, each with `entity` or `url` and optional `name`, `mic`, `crop` and `triggers`. See [Live cameras](#live-cameras) |
| `live_layout` | `single` or `grid` (multi-camera) [`single`] |
| `live_fullscreen` | `card` (keeps pills, PTZ and zoom) or `video` (platform player) [`card`] |
| `live_auto_muted` | Start live view muted [`true`] |
| `live_auto_recover` | Rebuild a frozen live stream automatically [`true`] |
| `live_triggers` | Hold time, cooldown, return target and Frigate events for camera triggers. See [Camera triggers](#camera-triggers) |
| `live_chevrons_enabled` | Show the arrows that switch cameras [`true`] |
| `live_pills` | Turn live pills on or off and reorder them. See [Pills and toolbar](#pills-and-toolbar) |
| `tap_action` | Action fired when the single-camera live preview is tapped, using standard HA action syntax: `more-info`, `toggle`, `perform-action`, `navigate`, `url` (plus `confirmation`, `target`, `data`), `none`, or the card's own `fullscreen`, `snapshot`, `refresh`. Unset: a tap only shows the controls |
| `live_grid_labels` | Show camera name labels in grid mode [`true`] |
| `live_grid_columns` | Pin the grid's column count (1–8). Omit for automatic — narrow cards automatically use fewer columns |
| `live_grid_emphasis` | Where the larger tiles land: `bottom`, `top`, or `hero` [`bottom`]. See [Live view](#live-view) |
| `live_go2rtc_url` | Optional URL of your own go2rtc server, used for stream-URL cameras |
| `controls_mode` | Controls display: `overlay` (fade out) or `fixed` (always visible) [`overlay`] |
| `show_camera_title` | Show camera name in controls bar [`true`] |
| `persistent_controls` | Keep the controls visible instead of fading them out [`false`] |
| `menu_buttons` | Configurable action buttons in the hamburger menu or among the live controls. See [Live menu buttons](#live-menu-buttons) |
| **Two-way audio** | |
| `live_native_talk` | Use Home Assistant's own two-way audio (2026.11+) for cameras that support it and have no go2rtc mic stream [`true`] |
| `live_mic_mode` | `toggle` (tap to start and stop) or `ptt` (press and hold) [`toggle`] |
| `live_mic_shape` | `bar` (full width) or `button` (compact round button) [`bar`] |
| `live_mic_button_position` | Position of the round button: `left`, `center`, or `right` [`center`] |
| `live_mic_waveform_enabled` | Show a waveform while you talk [`true`] |
| `live_mic_waveform_sensitivity` | Waveform sensitivity: `low`, `medium`, or `high` [`medium`] |
| `live_mic_audio_processing` | Echo cancellation, noise suppression and auto gain: `{ echo_cancellation, noise_suppression, auto_gain_control }`, each [`true`] |
| `live_mic_ice_servers` | Advanced. Override built-in STUN list with custom STUN/TURN |
| `live_mic_force_relay` | Advanced. Force `iceTransportPolicy: "relay"` (TURN-only) [`false`] |
| **PTZ** | |
| `live_ptz_enabled` | Enable the PTZ joystick overlay [`false`] |
| `live_ptz_position` | PTZ overlay corner: `top-left`, `top-right`, `bottom-left`, or `bottom-right` [`bottom-left`] |
| `live_ptz_speed` | Global PTZ speed, 1–9, for integrations that support it [`5`] |
| `live_ptz_cameras` | Per-camera PTZ configuration. `type`: `ezviz` (default), `reolink`, `frigate`, `onvif` or `service`. See [Manual service PTZ](#manual-service-ptz) |
| **Filters** | |
| `object_filters` | Filter buttons (built-in and custom). See [Object filters](#object-filters) |
| `object_colors` | Color per object filter |
| **Delete** | |
| `delete_service` | Sensor file delete service (`shell_command.*`) |
| `frigate_delete_service` | Frigate clip delete service (`rest_command.*`) |
| `delete_confirm` | Show confirmation before deleting [`true`] |
| `allow_bulk_delete` | Enable bulk delete [`true`] |
| **Thumbnail menu** | |
| `thumb_actions` | Extra long-press menu entries that call an HA action. See [Custom menu actions](#custom-menu-actions) |
| **Layout & styling** | |
| `card_height` | Height in px of the thumbnail list in vertical layout, 0–1200. `0` uses the default of 320 px [`0`] |
| `pill_size` | Pill text size in px, 10–28 — pills scale around this [`14`] |
| `row_gap` | Vertical spacing between rows (preview / controls / topbar / filters / thumbnails) in px, 0–40 [`8`] |
| `talkback_opacity` | Opacity of the talkback bar, 0–100 % [`30`] |
| `chevron_opacity` | Opacity of the live camera arrows, 0–100 % [`30`] |
| `style_variables` | Custom CSS variable overrides. See [Styling / CSS variables](#styling--css-variables) |
| `debug_enabled` | Show debug pill with diagnostics in live view [`false`] |
| **Legacy (still read, converted on load)** | |
| `live_camera_entities`, `live_stream_urls`, `live_stream_url`, `live_stream_name`, `live_mic_streams` | Older ways to list live cameras and mic streams. Converted into `live_cameras`. See [Live cameras](#live-cameras) |
| `live_camera_entity` | Old default camera. Moved to the top of `live_cameras` |
| `live_go2rtc_stream` | Old single go2rtc mic stream, used only when no camera has a `mic` |

</details>

---

## Example configurations

### Two-way audio (talkback)

Multi-camera setup with mic on the two cameras that actually have speakers:

```yaml
type: custom:camera-gallery-card
source_mode: media
live_enabled: true
live_cameras:
  - entity: camera.front_door   # mic-capable doorbell
    mic: front_door             # go2rtc streams: key
  - entity: camera.driveway     # mic-capable PTZ
    mic: driveway
  - entity: camera.backyard     # no speaker, so no mic
live_mic_mode: ptt        # press-and-hold; omit for tap-to-toggle
```

See [Two-way audio (advanced)](#two-way-audio-advanced) for prerequisites and TURN setup.

### Manual service PTZ

For cameras controlled by a script or another Home Assistant service, use `type: service`. The format mirrors the custom PTZ configuration in `custom:webrtc-camera`:

```yaml
type: custom:camera-gallery-card
live_enabled: true
live_cameras:
  - entity: camera.some_camera_with_ptz
live_ptz_enabled: true
live_ptz_cameras:
  camera.some_camera_with_ptz:
    type: service
    service: script.camera_ptz
    data_left:
      direction: directionleft
    data_right:
      direction: directionright
    data_up:
      direction: directionup
    data_down:
      direction: directiondown
```

The card passes the selected `data_*` object unchanged to the configured service. The simple `data_left`/`data_right`/`data_up`/`data_down` form is pulse-based: a command is sent immediately and repeated while the joystick is held.

For services that start continuous movement, use WebRTC Camera's press/release form instead. The card sends `data_start_*` once when pressed and the matching `data_end_*` once when released:

```yaml
live_ptz_cameras:
  camera.some_camera_with_ptz:
    type: service
    service: icsee_ptz.move
    data_start_left:
      entity_id: binary_sensor.some_camera_motion_alarm
      cmd: DirectionLeft
    data_end_left:
      entity_id: binary_sensor.some_camera_motion_alarm
      cmd: Stop
    # Repeat start/end entries for right, up, and down.
```

Optional `data_zoom_in` and `data_zoom_out` objects together enable the zoom control; `data_home` enables the Home control. Service data may contain strings, numbers, booleans, and nested values. The visual editor exposes these objects as JSON fields; YAML uses the normal mapping syntax shown above.

### Minimal — sensor mode

For users with file sensors (FileTrack) pointing at local camera storage. **Create the FileTrack sensors first** via *Settings → Devices & Services → FileTrack* (or use the editor's **Create new FileTrack sensor** button on the Source tab) — the entity ids below should match what you created.

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
live_cameras:
  - entity: camera.frontdoor
  - entity: camera.driveway
live_layout: single
object_filters:
  - person
  - car
```

### Frigate, scoped to one camera

Multiple cameras configured in Frigate, but this card instance should only
ever show one of them (e.g. a dedicated per-camera dashboard page)?
`frigate_cameras` / `frigate_labels` filter server-side, before the gallery
ever sees the other cameras' events — unlike `object_filters`, which only
controls which filter *buttons* are shown and has to be tapped manually.

```yaml
type: custom:camera-gallery-card
source_mode: media
media_sources:
  - media-source://frigate/main/event-search/clips
frigate_cameras:
  - frig_kittycam_coral
frigate_labels:
  - cat
live_enabled: true
live_cameras:
  - entity: camera.frig_kittycam_coral
```

Grid mode, showing all cameras at once instead of one at a time:

```yaml
live_layout: grid
live_grid_columns: 2 # optional — omit to let the grid shape itself to the camera count
live_grid_emphasis: hero # optional — bottom (default), top, or hero
```

> [!NOTE]
> Upgrading from an older version? The grid used to force a square (2x2, 3x3, 4x4), leaving dead cells at any camera count that wasn't a perfect square. It now shapes itself to the camera count instead, and the card's **height changes to match** — most counts other than 4, 9 and 16 will look taller, shorter or wider than before. Three cameras, for example, becomes a single wide row. No cell is ever left empty.

> [!NOTE]
> `live_grid_emphasis` has two rough edges worth knowing about:
> - `top` has no visible effect at e.g. 2, 3, 4, 6, 9, 12 or 16 cameras — at those counts every row already holds the same number of tiles, so there's no size difference to move.
> - `hero`'s supporting strip gets thin above roughly 8 cameras (at 9 cameras each supporting tile is 1/8 of the width). Pin `live_grid_columns` to fix the shape — `hero` with `live_grid_columns: 4` on 9 cameras gives one hero tile plus two rows of four.

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
live_cameras:
  - entity: camera.deurbel
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
| `--cgc-card-radius` | Card border radius | `10px` |
| `--cgc-tsbar-txt` | Pill and preview bar text / icon color | `#fff` |
| `--cgc-pill-bg` | Pill background | `#000` |
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
| `--cgc-delete-bg` | Delete button background | live active color |
| `--cgc-talkback-bg` | Two-way audio bar background | pill background |
| `--cgc-chevron-bg` | Live camera arrow background | pill background |
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

A filter matches when its name (or an alias, such as `persoon` for `person`) appears anywhere in the filename or media title. A file tagged with several objects, like `frontdoor_1200_motorcycle_person.mp4`, shows up under each of them. Its thumbnail badge uses the first match in your filter order.

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
> `path_datetime_format` is needed in **all source modes** (sensor, media, combined) — without it, items load but have no dates: no day grouping, no day navigation, no time sort. The only built-in exception is Frigate via `media-source://frigate/...` URIs, which carry their own event-id timestamps. Use the editor's **Auto-detect path datetime format** button (Advanced → Path parsing) if you're unsure what to set.

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
The `path_datetime_format` must match Frigate's path layout. Use the editor's **Auto-detect path datetime format** button (Advanced → Path parsing) to let the card propose the right pattern, or see [Path datetime format](#path-datetime-format) for examples.

**Items load but aren't grouped by day (no dates, no day navigation).**
`path_datetime_format` is missing or doesn't match your filenames. The card needs it to extract dates from paths — without a match, items stay undated and the timeline loses day grouping, day navigation and time-based sort. The only built-in exception is Frigate via `media-source://frigate/...` URIs, which carry their own event-id timestamps. Use **Auto-detect** in the editor (Advanced → Path parsing), or see [Path datetime format](#path-datetime-format).

**Delete does nothing / errors.**
Check that the `shell_command` or `rest_command` you point to is actually defined in `configuration.yaml` and that you restarted (or reloaded YAML) afterwards. Variable names like `{{ path }}` and `{{ event_id }}` must be **exact** — the card passes those names, renaming them breaks the call.

**Need more info?** Turn on **Debug mode** under **Advanced → Diagnostics** — a debug pill appears in live view; tap it for a diagnostics report with version, HA info, Frigate state and runtime stats. Attach the contents when filing an [issue](https://github.com/TheScubaDiver/camera-gallery-card/issues).

---

## Two-way audio (advanced)

Two-way audio (talkback) lets you speak through a camera's backchannel speaker from the live view. There are two ways to set it up.

### Home Assistant two-way audio (2026.11 and newer, easiest)

Home Assistant 2026.11 can send your microphone to the camera itself. When it does, the card's talk button just works for that camera, with no go2rtc setup.

1. Turn on **Settings → System → Labs → Two-way audio**.
2. Use a camera whose integration supports it. At the time of writing that is Matter cameras and Reolink. Reolink must use **RTSP** (in the Reolink integration options), because RTMP and FLV can't carry audio back to the camera.
3. Open Home Assistant over **HTTPS**. Browsers only allow the microphone on secure pages.

The talk button appears on every camera for which Home Assistant reports two-way audio and that has no go2rtc mic stream set below. Toggle / push-to-talk and the button shape work the same. To turn it off, set `live_native_talk: false` (or switch off **Home Assistant two-way audio** in the editor's Two-way audio section).

### go2rtc backchannel (any version)

Setup is more involved than the rest of the card. A go2rtc mic stream set for a camera takes priority over Home Assistant's own two-way audio.

**You need:**

- A camera with an **audio backchannel speaker** (most Reolink doorbells, some Hikvision, Tapo, etc.).
- The [AlexxIT/WebRTC](https://github.com/AlexxIT/WebRTC) HACS integration — provides the signed `/api/webrtc/ws` endpoint the card connects to.
- A go2rtc `streams:` entry that routes the camera's backchannel audio.

**Configuration:**

- `mic: <go2rtc_stream_key>` on a camera in [`live_cameras`](#live-cameras) — the go2rtc stream that carries that camera's backchannel. The mic pill appears only on cameras with a `mic`. You can also set it in the editor under **Live → Two-way audio**.
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

Older configs set the mic streams in a separate `live_mic_streams` map. That still works and is converted into `mic` on each camera when the card loads.

See the [Two-way audio YAML example](#two-way-audio-talkback) for a working config.

---

## License

MIT License
