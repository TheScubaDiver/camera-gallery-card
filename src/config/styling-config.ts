/**
 * Typed configuration for the editor's "Styling" tab.
 *
 * `STYLE_SECTIONS` is the single source of truth for every CSS-variable knob
 * and config-key slider/select that the editor exposes. The card reads it
 * (via `genStyleSectionDefaults`) to emit `:host` radius defaults; the editor
 * reads it to build the styling tab; PR 11's `ha-form` schema generator will
 * consume the same array unchanged.
 *
 * The discriminated union below forces each variant to declare only the
 * fields it actually uses — adding a control without its required fields
 * fails `tsc`. Audit cleanups (A1/A2/A4/A7) are applied at the array level.
 */

import {
  BAR_OPACITY_MAX,
  BAR_OPACITY_MIN,
  CARD_HEIGHT_DEFAULT,
  CARD_HEIGHT_MAX,
  CARD_HEIGHT_MIN,
  CARD_RADIUS_DEFAULT,
  CARD_RADIUS_MAX,
  CARD_RADIUS_MIN,
  CTRL_RADIUS_DEFAULT,
  CTRL_RADIUS_MAX,
  CTRL_RADIUS_MIN,
  DEFAULT_BAR_OPACITY,
  OBJ_BTN_RADIUS_DEFAULT,
  OBJ_BTN_RADIUS_MAX,
  OBJ_BTN_RADIUS_MIN,
  PILL_SIZE_DEFAULT,
  PILL_SIZE_MAX,
  PILL_SIZE_MIN,
  ROW_GAP_DEFAULT,
  ROW_GAP_MAX,
  ROW_GAP_MIN,
  THUMB_RADIUS,
  THUMB_RADIUS_MAX,
  THUMB_RADIUS_MIN,
  type CssVarKey,
} from "../const";

export interface StyleSelectOption {
  readonly value: string;
  readonly label: string;
}

interface StyleControlBase {
  readonly label: string;
}

/** A color picker writing into a CSS variable. */
export interface ColorControl extends StyleControlBase {
  readonly type: "color";
  /** DOM id of the editor's color-picker host element. */
  readonly hostId: string;
  readonly variable: CssVarKey;
}

/** A numeric slider writing into a CSS variable (px). */
export interface RadiusControl extends StyleControlBase {
  readonly type: "radius";
  readonly variable: CssVarKey;
  readonly min: number;
  readonly max: number;
  /** Emitted as `${default}px` into the `:host` default block. */
  readonly default: number;
}

/** A numeric slider writing into a config key (not a CSS variable). */
export interface SliderControl extends StyleControlBase {
  readonly type: "slider";
  /** DOM id of the `<input type="range">`. */
  readonly id: string;
  /** DOM id of the value-display element next to the slider. */
  readonly valId: string;
  readonly configKey: string;
  readonly min: number;
  readonly max: number;
  readonly default: number;
  /** Suffix shown in the display (e.g. "px", "%"). */
  readonly unit: string;
}

/** A dropdown writing into a config key. */
export interface SelectControl extends StyleControlBase {
  readonly type: "select";
  readonly configKey: string;
  readonly options: readonly StyleSelectOption[];
  /**
   * Optional predicate to mute the control. Typed loosely (`unknown` config)
   * to avoid a circular import from `config/normalize.ts`; the callback does
   * its own narrowing.
   */
  readonly disabledFn?: (config: Readonly<Record<string, unknown>>) => boolean;
}

export type StyleControl = ColorControl | RadiusControl | SliderControl | SelectControl;

export interface StyleSection {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly controls: readonly StyleControl[];
}

/**
 * Editor styling-tab schema. Cleaned up vs. the legacy JS array:
 *   A1: `--r` → `--cgc-card-radius` (was outside the `--cgc-*` namespace).
 *   A2: `bar_opacity` default re-pointed at `DEFAULT_BAR_OPACITY` (was 45;
 *        const.ts says 30 — a fresh card opened in the editor was silently
 *        shifting opacity on reset).
 *   A4: "Background" / "Background color" / "Bar background" labels
 *        normalized to "Background" (and "Bar background" for the thumb-bar
 *        case where the section header doesn't disambiguate).
 *   A7: radius and slider ranges sourced from `const.ts` so the struct
 *        validator and the editor share one set of bounds.
 */
export const STYLE_SECTIONS: readonly StyleSection[] = [
  {
    id: "card",
    label: "Card",
    icon: "mdi:card-outline",
    controls: [
      { type: "color", hostId: "bgcolor-host", variable: "--cgc-card-bg", label: "Background" },
      {
        type: "color",
        hostId: "bordercolor-host",
        variable: "--cgc-card-border-color",
        label: "Border color",
      },
      {
        type: "radius",
        variable: "--cgc-card-radius",
        label: "Border radius",
        min: CARD_RADIUS_MIN,
        max: CARD_RADIUS_MAX,
        default: CARD_RADIUS_DEFAULT,
      },
      {
        type: "slider",
        id: "cardheight",
        valId: "cardheightval",
        configKey: "card_height",
        label: "Height",
        min: CARD_HEIGHT_MIN,
        max: CARD_HEIGHT_MAX,
        default: CARD_HEIGHT_DEFAULT,
        unit: "px",
      },
    ],
  },
  {
    id: "preview",
    label: "Pills",
    icon: "mdi:image-outline",
    controls: [
      {
        type: "color",
        hostId: "tsbar-txt-host",
        variable: "--cgc-tsbar-txt",
        label: "Text / icon color",
      },
      { type: "color", hostId: "pill-bg-host", variable: "--cgc-pill-bg", label: "Background" },
      {
        type: "radius",
        variable: "--cgc-pill-size",
        label: "Size",
        min: PILL_SIZE_MIN,
        max: PILL_SIZE_MAX,
        default: PILL_SIZE_DEFAULT,
      },
      {
        type: "slider",
        id: "barop",
        valId: "barval",
        configKey: "bar_opacity",
        label: "Opacity",
        min: BAR_OPACITY_MIN,
        max: BAR_OPACITY_MAX,
        default: DEFAULT_BAR_OPACITY,
        unit: "%",
      },
      {
        type: "select",
        configKey: "bar_position",
        label: "Position",
        disabledFn: (c) => c["controls_mode"] === "fixed",
        options: [
          { value: "top", label: "Top" },
          { value: "bottom", label: "Bottom" },
          { value: "hidden", label: "Hidden" },
        ],
      },
    ],
  },
  {
    id: "thumbs",
    label: "Thumbnails",
    icon: "mdi:view-grid-outline",
    controls: [
      {
        type: "color",
        hostId: "tbarbg-host",
        variable: "--cgc-tbar-bg",
        label: "Bar background",
      },
      {
        type: "color",
        hostId: "tbar-txt-host",
        variable: "--cgc-tbar-txt",
        label: "Bar text color",
      },
      {
        type: "radius",
        variable: "--cgc-thumb-radius",
        label: "Border radius",
        min: THUMB_RADIUS_MIN,
        max: THUMB_RADIUS_MAX,
        default: THUMB_RADIUS,
      },
    ],
  },
  {
    id: "filters",
    label: "Filter buttons",
    icon: "mdi:filter-outline",
    controls: [
      {
        type: "color",
        hostId: "filterbg-host",
        variable: "--cgc-obj-btn-bg",
        label: "Background",
      },
      {
        type: "color",
        hostId: "iconcolor-host",
        variable: "--cgc-obj-icon-color",
        label: "Icon color",
      },
      {
        type: "color",
        hostId: "btnactive-host",
        variable: "--cgc-obj-btn-active-bg",
        label: "Active background",
      },
      {
        type: "color",
        hostId: "iconactive-host",
        variable: "--cgc-obj-icon-active-color",
        label: "Active icon color",
      },
      {
        type: "radius",
        variable: "--cgc-obj-btn-radius",
        label: "Border radius",
        min: OBJ_BTN_RADIUS_MIN,
        max: OBJ_BTN_RADIUS_MAX,
        default: OBJ_BTN_RADIUS_DEFAULT,
      },
    ],
  },
  {
    id: "controls",
    label: "Today / Date / Live",
    icon: "mdi:calendar-outline",
    controls: [
      {
        type: "color",
        hostId: "ctrl-txt-host",
        variable: "--cgc-ctrl-txt",
        label: "Text color",
      },
      {
        type: "color",
        hostId: "ctrl-chevron-host",
        variable: "--cgc-ctrl-chevron",
        label: "Chevron color",
      },
      {
        type: "color",
        hostId: "live-active-host",
        variable: "--cgc-live-active-bg",
        label: "Live active color",
      },
      {
        type: "color",
        hostId: "delete-bg-host",
        variable: "--cgc-delete-bg",
        label: "Delete button color",
      },
      {
        type: "radius",
        variable: "--cgc-ctrl-radius",
        label: "Border radius",
        min: CTRL_RADIUS_MIN,
        max: CTRL_RADIUS_MAX,
        default: CTRL_RADIUS_DEFAULT,
      },
    ],
  },
  {
    id: "talkback",
    label: "Two-way audio",
    icon: "mdi:microphone-outline",
    controls: [
      {
        type: "color",
        hostId: "talkback-bg-host",
        variable: "--cgc-talkback-bg",
        label: "Background",
      },
      {
        type: "slider",
        id: "talkbackop",
        valId: "talkbackopval",
        configKey: "talkback_opacity",
        label: "Opacity",
        min: BAR_OPACITY_MIN,
        max: BAR_OPACITY_MAX,
        default: DEFAULT_BAR_OPACITY,
        unit: "%",
      },
    ],
  },
  {
    id: "layout",
    label: "Layout",
    icon: "mdi:format-line-spacing",
    controls: [
      {
        type: "slider",
        id: "rowgap",
        valId: "rowgapval",
        configKey: "row_gap",
        label: "Row spacing",
        min: ROW_GAP_MIN,
        max: ROW_GAP_MAX,
        default: ROW_GAP_DEFAULT,
        unit: "px",
      },
    ],
  },
];

/**
 * Emit `:host`-scope CSS variable defaults for radius controls. Slider/select
 * controls write to config keys (not CSS), and color defaults come from the
 * HA-theme fallbacks already in the `:host` block.
 *
 * The output is a single newline-joined string ready for Lit's `unsafeCSS`.
 * Pure: no runtime dependencies, no I/O — computed once at module load.
 */
export function genStyleSectionDefaults(): string {
  const lines: string[] = [];
  for (const section of STYLE_SECTIONS) {
    for (const ctrl of section.controls) {
      if (ctrl.type === "radius") {
        lines.push(`${ctrl.variable}: ${ctrl.default}px;`);
      }
    }
  }
  return lines.join("\n");
}
