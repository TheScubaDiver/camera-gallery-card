# Styling

[← Back to README](../README.md)

Colors, radius, opacity and spacing, and which buttons show where.

### Styling

The **Styling** tab provides a visual editor for colors, border radius, opacity and spacing.

<details>
<summary>Show styling sections</summary>

| Section             | Options                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- |
| Card                | Background, Border color, Border radius, Height (`card_height`)                         |
| Pills               | Text / icon color, Background, Size (`pill_size`), Opacity (`bar_opacity`)              |
| Thumbnails          | Bar background, Bar text color, Border radius, Unselected opacity (`thumb_off_opacity`) |
| Filter buttons      | Background, Icon color, Active background, Active icon color, Border radius             |
| Today / Date / Live | Text color, Chevron color, Live active color, Delete button color, Border radius        |
| Two-way audio       | Background, Opacity (`talkback_opacity`)                                                |
| Live navigation     | Background, Opacity (`chevron_opacity`)                                                 |
| Layout              | Row spacing (`row_gap`)                                                                 |

</details>

### Pills and toolbar

The buttons over the preview, over the live view and in the gallery toolbar can each be switched off and reordered. The editor does this for you (Gallery → Controls, Live → Controls, Thumbnails → Toolbar). In YAML you only list the ones you want to change; everything else keeps its default.

```yaml
gallery_pills:
  playback_speed:
    enabled: false
  pip:
    order: 5 # lower numbers show first
gallery_pills_align: left # left, center (default) or right
live_pills:
  snapshot:
    enabled: false
toolbar_order:
  live: 5 # put the Live button first
show_media_filter: false
```

| Area            | Key                                        | Ids (default order)                                                                                              |
| --------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Preview         | `gallery_pills`                            | `object_indicator`, `index_counter`, `autoplay_all`, `mute`, `playback_speed`, `pip`, `fullscreen`, `video_time` |
| Live view       | `live_pills`                               | `mute`, `picker`, `pip`, `fullscreen`, `snapshot`, `refresh`                                                     |
| Gallery toolbar | `toolbar_order` (order), `show_*` (on/off) | `today` (`show_today`), `media_filter` (`show_media_filter`), `favorite` (`show_favorite`), `live` (`show_live`) |

Each pill takes `enabled` (default `true`) and `order` (a number; the defaults are spaced by 10, so `15` lands between the first two). Live pills also take `row: 2`, and your own menu buttons can sit between them; see [Rows and order of the live controls](live-view.md#rows-and-order-of-the-live-controls). `gallery_pills_align` only applies when `controls_mode` is `overlay`. Some live pills only appear when they make sense: the camera picker needs at least two cameras, and the hamburger menu, PTZ and debug pills have their own settings.

---

## Styling / CSS variables

All visual styling can be customized via the **Styling** tab in the editor.

<details>
<summary>Show all CSS variables</summary>

| Variable                      | Element                                                                | Default              |
| ----------------------------- | ---------------------------------------------------------------------- | -------------------- |
| `--cgc-card-bg`               | Card background                                                        | theme card color     |
| `--cgc-card-border-color`     | Card border                                                            | theme divider color  |
| `--cgc-card-radius`           | Card border radius                                                     | `10px`               |
| `--cgc-tsbar-txt`             | Pill and preview bar text / icon color                                 | `#fff`               |
| `--cgc-pill-bg`               | Pill background                                                        | `#000`               |
| `--cgc-tbar-bg`               | Thumbnail bar background                                               | theme secondary bg   |
| `--cgc-tbar-txt`              | Thumbnail bar text color                                               | theme text color     |
| `--cgc-thumb-radius`          | Thumbnail border radius                                                | `10px`               |
| `--cgc-obj-btn-bg`            | Filter button background                                               | theme secondary bg   |
| `--cgc-obj-icon-color`        | Filter icon color                                                      | theme text color     |
| `--cgc-obj-btn-active-bg`     | Active filter background                                               | primary color        |
| `--cgc-obj-icon-active-color` | Active filter icon color                                               | `#fff`               |
| `--cgc-obj-btn-radius`        | Filter button border radius                                            | `10px`               |
| `--cgc-ctrl-txt`              | Today/date/live text color                                             | theme secondary text |
| `--cgc-ctrl-chevron`          | Date navigation chevron color                                          | theme text color     |
| `--cgc-live-active-bg`        | Live button active background                                          | error color          |
| `--cgc-delete-bg`             | Delete button background                                               | live active color    |
| `--cgc-talkback-bg`           | Two-way audio bar background                                           | pill background      |
| `--cgc-chevron-bg`            | Live camera arrow background                                           | pill background      |
| `--cgc-ctrl-radius`           | Controls bar border radius                                             | `10px`               |
| `--cgc-pill-size`             | Pill text size (px). Fixed-mode pill height scales as `2 ×` this value | `14px`               |

</details>
