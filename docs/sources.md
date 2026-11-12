# Sources

[← Back to README](../README.md)

Where the card gets its media from: sensor, media or combined mode, how the sources are walked, and the date format for file paths.

### Sources

- Sensor entities with `fileList` (sensor mode)
- Home Assistant `media_source` (media mode)
- **Combined mode** — use a sensor entity and a media source simultaneously, merged into a single timeline
- Multiple sensors or media folders

#### Choosing a source mode

| You have…                                               | Use                    |
| ------------------------------------------------------- | ---------------------- |
| Frigate (add-on or container)                           | `media`                |
| Files in `/config/www/<folder>/` saved by an automation | `sensor` (+ FileTrack) |
| A NAS or external folder mounted as a media source      | `media`                |
| A mix of the above                                      | `combined`             |

**Sensor mode** reads file paths from a Home Assistant sensor's `fileList` attribute. You create that sensor with the **FileTrack** integration.

**Media mode** uses Home Assistant's built-in media browser — anything you can browse in HA (Frigate, Samba, local media) works as a source.

**Combined mode** merges a sensor source and a media source into one timeline (useful when you have both legacy snapshot files and a newer Frigate setup).

> [!TIP]
> Curious how Frigate, Reolink and custom NVRs are handled internally? See [How sources are routed](#how-sources-are-routed-under-the-hood) below.

#### How sources are routed under the hood

When you use `source_mode: media` (or `combined`), the card picks an engine per media-source URI:

| URI prefix                                               | Engine                                                                       | `path_datetime_format`                                               |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `media-source://frigate/...`                             | Frigate REST / events path — uses event-id timestamps directly               | not needed                                                           |
| `media-source://reolink/...`                             | Dedicated Reolink engine — parses Reolink's folder/file titles intrinsically | not needed                                                           |
| Anything else (Synology, BlueIris, NAS, custom NVR, ...) | Generic calendar walker                                                      | **required** — set this to match how dates appear in your file paths |

A few notes on the generic walker:

- The NVR must be visible as a `media-source://...` in Home Assistant's **Media** browser (sidebar). Without that, the card can't browse it.
- NVRs that only expose RTSP / SMB without a media-source integration can fall back to `source_mode: sensor` with a FileTrack-style sensor that lists the file paths.
- If `path_datetime_format` is missing or wrong, the gallery won't be able to group by day or sort by time — but clips still appear. Use the **Auto-detect format** button in the editor to probe your sources and suggest a format.

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

### Frigate

- **WebSocket via HA integration** (default) — uses the official Frigate HA integration's WS API. CORS-free, no `frigate_url` required, works with standalone Frigate containers. **New events arrive in real time** — no polling, no refresh.
- **Direct REST API** (`frigate_url`, optional) — even faster if your Frigate is reachable from the browser
- Automatic fallback: if REST fails, WS path takes over
- Automatic Frigate snapshot thumbnails
- **Bounding boxes on thumbnails** (`frigate_thumb_bbox: true`) — uses Frigate's annotated snapshot as the thumbnail. Requires `snapshots.bounding_box: true` in your Frigate camera config
- **Event clustering** (`frigate_event_cluster: true`) — events for the same camera and label that follow each other within `frigate_event_cluster_gap_sec` seconds (default 30) collapse into one thumbnail with a count badge. Tap the badge to expand the cluster
- **Server-side scoping** — `frigate_cameras` and `frigate_labels` limit which events the card loads at all (see [Frigate, scoped to one camera](#frigate-scoped-to-one-camera))
- **Frigate clip delete** via `rest_command` — see [Delete setup](gallery.md#delete-setup)

## Path datetime format

The card extracts timestamps from a single configurable pattern, `path_datetime_format`, that matches the _tail_ of each item's path (or media-source URI). The `/` character separates directory levels; the leaf segment matches the filename.

> [!WARNING]
> `path_datetime_format` is needed in **all source modes** (sensor, media, combined) — without it, items load but have no dates: no day grouping, no day navigation, no time sort. The only built-in exception is Frigate via `media-source://frigate/...` URIs, which carry their own event-id timestamps. Use the editor's **Auto-detect path datetime format** button (Advanced → Path parsing) if you're unsure what to set.

| Token | Meaning                                                         |
| ----- | --------------------------------------------------------------- |
| YYYY  | 4-digit year                                                    |
| YY    | 2-digit year (pivots at 2000)                                   |
| MM    | 2-digit month                                                   |
| DD    | 2-digit day                                                     |
| HH    | 2-digit hour (24h)                                              |
| mm    | 2-digit minute                                                  |
| ss    | 2-digit second                                                  |
| X     | 10-digit Unix timestamp in seconds (decoded to local time)      |
| x     | 13-digit Unix timestamp in milliseconds (decoded to local time) |

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

## Examples

#### Minimal — sensor mode

For users with file sensors (FileTrack) pointing at local camera storage. **Create the FileTrack sensors first** via _Settings → Devices & Services → FileTrack_ (or use the editor's **Create new FileTrack sensor** button on the Source tab) — the entity ids below should match what you created.

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entities:
  - sensor.frontdoor_files
  - sensor.driveway_files
path_datetime_format: YYYY-MM-DD_HH-mm-ss # matches "2026-03-09_12-31-10_person.jpg"
delete_service: shell_command.gallery_delete # see "Delete setup"
object_filters:
  - person
  - car
```

> [!NOTE]
> The `path_datetime_format` line is what gives your items dates. Adjust it to match how your snapshot files are actually named — the example here matches the recommended filename format (`YYYY-MM-DD_HH-mm-ss_<object>.jpg`). See [Path datetime format](#path-datetime-format) for more layouts, or use **Auto-detect** in the editor.

#### Frigate via HA integration (no `frigate_url` needed)

For Frigate add-on or standalone container — uses the HA WebSocket path, CORS-free. If you also want clip delete to work, set up `rest_command.delete_frigate` first — see [Delete setup](gallery.md#delete-setup).

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

#### Frigate, scoped to one camera

Multiple cameras configured in Frigate, but this card instance should only
ever show one of them (e.g. a dedicated per-camera dashboard page)?
`frigate_cameras` / `frigate_labels` filter server-side, before the gallery
ever sees the other cameras' events — unlike `object_filters`, which only
controls which filter _buttons_ are shown and has to be tapped manually.

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
>
> - `top` has no visible effect at e.g. 2, 3, 4, 6, 9, 12 or 16 cameras — at those counts every row already holds the same number of tiles, so there's no size difference to move.
> - `hero`'s supporting strip gets thin above roughly 8 cameras (at 9 cameras each supporting tile is 1/8 of the width). Pin `live_grid_columns` to fix the shape — `hero` with `live_grid_columns: 4` on 9 cameras gives one hero tile plus two rows of four.

#### Reolink NVR / Doorbell / camera

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
