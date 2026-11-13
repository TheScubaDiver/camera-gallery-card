# Live view

[← Back to README](../README.md)

Live cameras, the grid, the hybrid view, crop and rotation, camera triggers, PTZ, menu buttons and notification deep links.

### Live view

- Native Home Assistant **WebRTC live preview**
- Live view layout: camera name on the left, controls on the right
- **Controls mode** — choose between `overlay` (controls fade out after inactivity) or `fixed` (always visible)
- **Live pills** — mute, camera picker, Picture-in-Picture, fullscreen, snapshot (saves a JPEG of the current frame) and refresh stream. Turn each one on or off, reorder them and put them on a second row (see [Rows and order of the live controls](#rows-and-order-of-the-live-controls))
- **Native fullscreen** — set `live_fullscreen: video` to open the live stream in the platform's own player instead of the card overlay (grid layout always uses the card)
- **Pinch to zoom in card fullscreen** — touch, trackpad, and Ctrl + scroll wheel; pan with the mouse after zooming in
- **Aspect ratio toggle** — quickly switch between 16:9, 4:3 and 1:1, remembered per camera
- Live badge
- **Multiple live cameras** — configure several cameras and switch between them using chevron arrows (hide them with `live_chevrons_enabled: false`) or the camera picker. The first camera in the list opens first. See [Live cameras](#live-cameras)
- **Crop per camera** — zoom into a region of a camera's picture, e.g. only the doormat of a wide-angle doorbell. Set it visually with **Crop view** in the editor's Live tab
- **Multi-camera grid layout** (`live_layout: grid`) — show all cameras at once, tap a tile to focus on one. The grid shapes itself to the camera count so there are no empty cells, every tile keeps the card's configured aspect ratio, and the card's height adapts to fit. Pin the column count with `live_grid_columns`, or leave it automatic (narrow cards drop to fewer columns on their own). Control where the larger tiles land with `live_grid_emphasis`: `bottom` (default), `top`, or `hero`
- **RTSP streams** — add cameras by stream URL instead of a camera entity (see [Live cameras](#live-cameras))
- **Frozen-stream recovery** — if the live picture stops moving for about six seconds the card rebuilds the stream by itself, up to three tries (a stream that is still connecting gets 15 seconds before it counts as stuck). After the last try a "Stream stopped — Try again" notice appears. It never acts while the tab is hidden, in Picture-in-Picture, in native video fullscreen, or during talkback, and it only watches single-camera live view (not grid tiles). Turn it off with `live_auto_recover: false` or in the editor's Live tab.
- **Hybrid view** — the live feed with a drawer of recent clips you slide in from the side. See [Hybrid view](#hybrid-view)
- **Camera triggers** — motion, a person, the doorbell: the card switches to that camera's live view by itself and goes back afterwards. See [Camera triggers](#camera-triggers)
- **Rotation per camera** — turn a camera's picture by 90, 180 or 270 degrees, for a camera mounted upside down on a ceiling or on its side. See [Camera rotation](#camera-rotation)
- **Offline camera placeholder** — unavailable cameras show a clear "offline" tile instead of a black frame
- **Keyboard navigation** — <kbd>←</kbd>/<kbd>→</kbd> to switch between cameras in single layout
- **Tap action** — choose what a tap on the live picture does with `tap_action`: a standard Home Assistant action (`more-info`, `toggle`, `perform-action`, `navigate`, `url`) or the card's own `fullscreen`, `snapshot` or `refresh`
- **PTZ overlay** — a joystick with zoom and home buttons for cameras that can pan and tilt. Built-in support for EZVIZ, Reolink, Frigate and ONVIF, plus a manual mode that calls any service (see [Manual service PTZ](#manual-service-ptz))
- Camera friendly names and entity IDs in selector
- Auto-teardown of stream + push-to-talk on view switch (no audio/bandwidth leak)
- **Two-way audio (talkback)** — tap the mic pill in live view to speak through a camera's backchannel speaker. Per-camera, with tap-to-toggle or push-to-talk modes, a full-width bar or a compact round button (`live_mic_shape`), over the video or in its own row below or above it (`live_mic_position`), and a live waveform while you talk. Active talkback temporarily unmutes listening, then restores your previous setting; manual speaker choices take priority. _Advanced setup_ — see [Two-way audio](two-way-audio.md#two-way-audio-advanced) below.

Listening audio recovery reuses existing Home Assistant WebRTC receiver
tracks to allow speaker unmute after muted startup. It depends on
feature-detected player internals, so compatibility is not guaranteed across
frontend versions. Browser autoplay policy can also block listening; retry
with the speaker button and check **Debug → Listening audio**. Local automated
tests do not establish real camera audio or device fullscreen behavior.

## Live cameras

`live_cameras` is the list of cameras for live view. Each entry is either a Home Assistant camera entity or an RTSP stream URL, and per-camera settings sit on the same entry. The first camera in the list opens first. The editor's Live tab writes this list for you.

```yaml
live_enabled: true
live_cameras:
  - entity: camera.front_door
    name: Front door # optional, overrides the friendly name
    mic: front_door # optional, go2rtc stream for two-way audio
  - entity: camera.garden
    crop: { x: 20, y: 30, w: 50, h: 50 } # optional, set with Crop view
  - url: rtsp://user:pass@192.168.1.20:554/stream1
    name: Shed
```

| Key        | Description                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity`   | Camera entity. Use either `entity` or `url`, not both                                                                                       |
| `url`      | RTSP stream URL, for a camera without an entity in Home Assistant                                                                           |
| `name`     | Display name. Empty uses the entity's friendly name                                                                                         |
| `mic`      | go2rtc stream name that carries the camera's backchannel audio. See [Two-way audio](two-way-audio.md#two-way-audio-advanced)                |
| `crop`     | Visible region in percent of the full picture: `x`, `y` (top-left corner), `w`, `h` (size). Easiest to set with **Crop view** in the editor |
| `triggers` | Entities that switch the card to this camera when they turn active. See [Camera triggers](#camera-triggers)                                 |
| `rotation` | Turn the live picture clockwise: `0` (default), `90`, `180` or `270`. See [Camera rotation](#camera-rotation)                               |

Stream URLs play through the [AlexxIT/WebRTC](https://github.com/AlexxIT/WebRTC) integration, or through your own go2rtc server when you set `live_go2rtc_url` (for example `http://192.168.1.10:1984`). If Home Assistant runs on HTTPS, that go2rtc URL must be HTTPS too, or the browser blocks it.

> [!NOTE]
> Older configs used `live_camera_entities`, `live_stream_urls`, `live_stream_url` / `live_stream_name` and `live_mic_streams` for the same information. They still work: the card converts them into `live_cameras` when it loads, and the editor saves the new form the next time you save. The old `live_camera_entity` (default camera) is folded in too, by moving that camera to the top of the list.

---

## Hybrid view

Watch live and look back without leaving the live view: `start_mode: hybrid` opens the card on the live feed with a **CLIPS** tab on the right edge. Tap it (or, on a computer, hold the mouse over it for a moment) and a drawer with the recent clips slides in over the picture.

```yaml
live_enabled: true
live_cameras:
  - entity: camera.front_door
start_mode: hybrid
```

- **The clips** are the same ones the gallery shows, with the same filters, newest first (the 50 most recent). Frigate event groups show a count you can tap to expand, and each clip shows the detected object.
- **Play a clip** by tapping it: it plays in place of the live feed. **LIVE** at the top of the drawer takes you back.
- **Pick a day** with the calendar button at the top of the drawer.
- **Resize** the drawer by dragging its left edge, from a quarter to most of the picture.
- **List or grid**: switch with the button at the top; the card remembers your choice on that device.
- **Close** the drawer by tapping the live picture or the CLIPS tab again.
- **Live indicator**: while you watch live, the camera name pill turns light red, so you can tell live from a clip.

In hybrid view the gallery toolbar and thumbnail strip are hidden: the drawer replaces them. In the editor: **Source → View → Default view → Hybrid**.

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
live_triggers: # optional, these are the defaults
  hold_seconds: 30
  cooldown_seconds: 10
  return_to: previous
```

**What counts as a trigger.** An entity in a camera's `triggers` list fires when it turns active: `on`, `open`, `detected`, `occupied`, `home` or `ringing`. An `event.*` entity (a doorbell press, for instance) fires on every new event. Turning off or staying on does nothing.

**What happens.** The card switches to that camera in single live view, also out of the gallery or the grid. When another trigger fires while it is showing, the last one wins and the timer starts over. `hold_seconds` after the last trigger the card goes back, unless someone tapped the card in the meantime: then it stays where they left it.

| `live_triggers` key | Meaning                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `hold_seconds`      | How long to stay after the last trigger, 5–3600 [`30`]                                          |
| `cooldown_seconds`  | Ignore repeat triggers for the same camera within this time, 0–3600 [`10`]                      |
| `return_to`         | `previous` (the view it came from), `gallery`, or `stay` (keep showing the camera) [`previous`] |
| `frigate`           | Also switch on new Frigate events [`false`]. See below                                          |
| `frigate_labels`    | Only these Frigate labels trigger, e.g. `[person]`. Empty means all                             |

**Frigate.** With `frigate: true`, a new Frigate event switches to `camera.<frigate camera name>` (the name the Frigate integration gives its camera entities), when that camera is in your live list. The card uses the Frigate instance of your Frigate media source, or Frigate's default `frigate` instance when the card has no Frigate media source.

**When it does not switch.** The card leaves you alone while you are using it: in fullscreen, in Picture-in-Picture, during talkback, with a menu or bulk select open, and for 15 seconds after the last tap or key press on the card.

In the editor: fill in **Triggers** on a camera under **Live → Basics → Cameras in picker**, and set the rest under **Live → Triggers**. Triggers for stream-URL cameras can only be set in YAML.

> [!NOTE]
> The card only reacts while the dashboard is open, for example on a tablet with a kiosk browser. It cannot wake a sleeping screen or open the dashboard; use a Home Assistant automation or your kiosk app for that.

---

## Camera rotation

Turn a camera's live picture for a camera that hangs upside down or on its side. Set it per camera in the editor (**Live → Basics → Cameras in picker**, expand a camera, **Rotation**) or in YAML:

```yaml
live_cameras:
  - entity: camera.garage
    rotation: 180 # 0 (default), 90, 180 or 270, clockwise
```

- **Where it applies:** single-camera live view, card fullscreen and grid tiles, plus the **snapshot** pill, which saves the picture rotated.
- **Order:** the crop is taken from the camera's own picture first, then the result is rotated. A crop you drew before keeps showing the same part of the scene.
- **90 and 270 degrees** turn the picture on its side, so the live view takes the rotated shape: a 16:9 camera becomes a tall 9:16 view. Grid tiles keep their size and fill it with the rotated picture.
- **Not rotated:** recorded clips in the gallery, the platform player with `live_fullscreen: video`, and the PTZ arrows. With a rotated PTZ camera, the arrows still move the camera in its own directions.

---

## Live menu buttons

`menu_buttons` adds action buttons to the live view. You can add them in the editor (Live tab → Menu buttons) or in YAML. In the editor you pick the entity with Home Assistant's own entity picker, and the icon is filled in from that entity when the icon field is still empty. You can change it afterwards.

```yaml
menu_buttons:
  - entity: input_select.doorbell_reply
    icon: mdi:message-reply-text
    title: Auto-reply
    placement: controls # show it among the live controls
  - entity: light.porch
    icon: mdi:lightbulb-outline
    icon_on: mdi:lightbulb
    color_on: "#f5a623" # stays in the hamburger menu (the default)
```

| Key                      | Description                                                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity`                 | Entity the button acts on (required)                                                                                                                                                                      |
| `icon` / `icon_on`       | Icon, and the icon while the entity is "on"                                                                                                                                                               |
| `color_on` / `color_off` | Button background while on / off                                                                                                                                                                          |
| `title`                  | Label (default: the entity's friendly name)                                                                                                                                                               |
| `service`                | Action to call instead of the default, in `domain.service` form. It is called with the button's `entity_id`                                                                                               |
| `state_on`               | State that counts as "on" (default: `on`, `open`, `unlocked`, `playing`, `home`, …)                                                                                                                       |
| `placement`              | `menu` (default) puts the button in the hamburger menu. `controls` shows it directly among the live control pills                                                                                         |
| `order`                  | Position among the live controls, sorted together with the built-in pills (`mute` is 10, `picker` 15, `pip` 20, `fullscreen` 30, `snapshot` 35, `refresh` 40). Without it the button goes after the pills |
| `row`                    | `2` puts the button on a second row of live controls. See [Rows and order of the live controls](#rows-and-order-of-the-live-controls)                                                                     |

What a tap does:

- **`input_select` / `select` entities** open a list of their options, with the current one checked. Picking one calls `select_option`. This works well for things like a doorbell auto-reply message or a chime sound.
- **Automations** are triggered, and **scripts** are run.
- **Everything else** is toggled.
- A `service`, when set, always wins over these defaults.

In the editor you create buttons under **Live → Menu buttons**, and choose where each one shows under **Live → Controls**.

### Rows and order of the live controls

The live controls can sit on two rows, and your own menu buttons can sit between the built-in ones. In the editor, **Live → Controls** has three boxes:

- **Row 1**: next to the camera name.
- **Row 2**: a second row below it.
- **Menu ☰**: behind the menu button. Only your own buttons can go here.

Drag a control to the box and the place where you want it; the order in a box is the order on screen. Switch a built-in control off to hide it.

In YAML, built-in pills take `order` and `row` under `live_pills`, and menu buttons take `placement: controls` with `order` and `row`:

```yaml
live_pills:
  snapshot:
    row: 2
menu_buttons:
  - entity: light.porch
    icon: mdi:lightbulb
    placement: controls
    order: 11 # right after mute (10)
  - entity: siren.garden
    icon: mdi:alarm-light # no placement: in the menu
```

"Back to grid", PTZ, debug and the menu button itself keep their fixed place on row 1. Row 2 only appears when something is on it. Over the video it sits right-aligned under row 1; with `controls_mode: fixed` it is a second bar.

---

#### Manual service PTZ

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

## Notification deep-links

Opt-in URL parameters so an HA notification action can open this exact card straight into live view or the gallery. Nothing here does anything until you set `url_id` — without it the card ignores the query string entirely, which matters because the query string is page-scoped and would otherwise be picked up by every camera-gallery-card on the dashboard at once.

Set a `url_id` in the editor's **Source → View** section (or `url_id: porch` in YAML), then point a notification action at:

```
/lovelace/home?cgc_id=porch&cgc_camera=camera.porch_gate
```

| Parameter    | Meaning                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cgc_id`     | Must match the card's `url_id` exactly, or the whole query string is ignored                                                                                              |
| `cgc_view`   | `live` or `gallery` — which screen to open                                                                                                                                |
| `cgc_camera` | An entry from the card's own live camera list — a camera entity, or `__cgc_stream_<n>__` for the n-th stream-URL camera, counting from 0 — opens live view on that camera |

A worked example, e.g. from a motion automation:

```yaml
action: notify.mobile_app_your_phone
data:
  message: "Motion at the porch"
  data:
    clickAction: "/lovelace/home?cgc_id=porch&cgc_camera=camera.porch_gate"
```

`?cgc_id=porch&cgc_view=gallery` opens the gallery on the newest clip regardless of `thumb_sort_order` — with one caveat: once a day has more items than `max_media` (default 50), the gallery only ever holds the oldest `max_media` of them under `oldest` sorting, so the deep link lands on the newest clip _within that truncated window_, not necessarily the day's actual newest clip. That truncation applies to `oldest` sorting generally, deep link or not.

> [!NOTE]
> `cgc_camera` only works together with live view. The gallery's sources are configured separately from the live camera list, and the card has no camera-to-clip mapping, so a camera can't filter the gallery. Passing `cgc_camera` therefore implies live view — and an explicit `cgc_view=gallery` makes `cgc_camera` be ignored.

> [!NOTE]
> Deep links apply when the card first initializes on page load. Navigating to the same URL within an already-open dashboard may not re-run that initialization, since Home Assistant is a single-page app — for a reliable deep link, the notification should open the dashboard fresh (e.g. via `clickAction`) rather than assume a tab already on the dashboard will react.

> [!NOTE]
> All of `cgc_id`, `cgc_view`, and `cgc_camera` are case-sensitive. `cgc_view=Gallery` isn't recognized as `gallery` — and if a camera is also present, that falls through to opening _live_ instead, the opposite of what a mistyped gallery link probably intended. And if more than one card on the dashboard shares the same `url_id`, they'll all react to the same query string at once — keep `url_id` unique per card.
