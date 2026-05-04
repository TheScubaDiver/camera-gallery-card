/**
 * Pure helpers for the object-filter pipeline (per-item label, icon, color
 * lookup; filename/sensor text extraction; per-filter alias matching).
 *
 * State-coupled methods on the card (toggling `_objectFilters`,
 * cache-aware `_objectForSrc`, mode-branching `_matchesObjectFilterValue`)
 * stay there — they read live card state. The card calls into these pure
 * helpers for the leaf-level transforms.
 */

import { AVAILABLE_OBJECT_FILTERS, type ObjectFilter } from "../const";
import type { HassEntity } from "../types/hass";

/** Default icon when the filter name isn't in `OBJECT_FILTER_ICONS`. */
export const DEFAULT_OBJECT_ICON = "mdi:shape";

/** Default color when no per-filter color is configured. Matches CSS `currentColor`. */
const DEFAULT_OBJECT_COLOR = "currentColor";

/**
 * Per-filter MDI icons. Keyed by `ObjectFilter` so adding a new filter to
 * `AVAILABLE_OBJECT_FILTERS` forces an icon entry — TypeScript catches it.
 */
export const OBJECT_FILTER_ICONS: Readonly<Record<ObjectFilter, string>> = {
  bicycle: "mdi:bicycle",
  bird: "mdi:bird",
  bus: "mdi:bus",
  car: "mdi:car",
  cat: "mdi:cat",
  dog: "mdi:dog",
  motorcycle: "mdi:motorbike",
  person: "mdi:account",
  truck: "mdi:truck",
  visitor: "mdi:doorbell-video",
};

/**
 * Per-filter alias lists, including English + Dutch tokens (the original
 * card author writes Dutch). Used to match filter intent in filenames and
 * sensor friendly names. A filter not in this map falls back to its own
 * canonical name as a single alias.
 *
 * **Invariant:** every alias here is already lowercase and trimmed.
 * `matchesObjectFilterForFileSensor` relies on this — it does not re-normalize
 * per-match. The structural test in `object-filters.spec.ts` enforces it.
 */
export const FILTER_ALIASES: Readonly<Record<ObjectFilter, readonly string[]>> = {
  bicycle: ["bicycle", "fiets", "fietser", "bike"],
  bird: ["bird", "vogel", "vogels"],
  bus: ["bus"],
  car: ["car", "auto", "autos", "voertuig", "vehicle"],
  cat: ["cat", "kat", "katten"],
  dog: ["dog", "hond", "honden"],
  motorcycle: ["motorcycle", "motor", "motorbike"],
  person: ["person", "persoon", "personen"],
  truck: ["truck", "vrachtwagen"],
  visitor: ["visitor", "visitors", "bezoeker", "bezoekers", "bezoek"],
};

/** Set form of `AVAILABLE_OBJECT_FILTERS` for O(1) membership checks. */
export const KNOWN_FILTERS: ReadonlySet<string> = new Set(AVAILABLE_OBJECT_FILTERS);

/** Narrow an arbitrary string to `ObjectFilter` if it matches one of the canonical names. */
function asObjectFilter(s: string): ObjectFilter | null {
  return KNOWN_FILTERS.has(s) ? (s as ObjectFilter) : null;
}

/**
 * Display label for a filter. Returns the canonical filter name itself when
 * it's known, otherwise `"selected"` (so the UI shows a generic count).
 */
export function filterLabel(value: string): string {
  return asObjectFilter(value.toLowerCase().trim()) ?? "selected";
}

/**
 * Comma-joined display label for a list of filters. Returns `"selected"`
 * when the list is empty.
 */
export function filterLabelList(values: readonly string[]): string {
  const labels = values.map((x) => filterLabel(x)).filter((x) => x !== "selected");
  return labels.length ? labels.join(", ") : "selected";
}

/**
 * Aliases for a filter name. Unknown names produce a single-element list
 * containing themselves (so user-defined custom filter names still work in
 * the matcher), or an empty list for empty input.
 */
export function getFilterAliases(filter: string): readonly string[] {
  const f = filter.toLowerCase().trim();
  const known = asObjectFilter(f);
  if (known) return FILTER_ALIASES[known];
  return f ? [f] : [];
}

/**
 * MDI icon for a filter name, with optional per-filter overrides (from the
 * `object_filters: [{ name: icon }]` config entries) and an optional
 * fallback when the name isn't in `OBJECT_FILTER_ICONS`.
 */
export function objectIcon(
  obj: string | null,
  customIcons: Readonly<Record<string, string>> = {},
  fallback: string = DEFAULT_OBJECT_ICON
): string {
  if (!obj) return "";
  const override = customIcons[obj];
  if (override) return override;
  const known = asObjectFilter(obj);
  return known ? OBJECT_FILTER_ICONS[known] : fallback;
}

/**
 * Per-filter colour from the config's `object_colors` map. Returns
 * `currentColor` when no colour is configured for the filter.
 */
export function objectColor(obj: string | null, colors: Readonly<Record<string, string>>): string {
  if (!obj) return DEFAULT_OBJECT_COLOR;
  return colors[obj] ?? DEFAULT_OBJECT_COLOR;
}

/** Common shape for `fileList` items + media-source items used by object filters. */
export interface FilterableItem {
  filename?: string;
  name?: string;
  basename?: string;
  path?: string;
  file?: string;
  fullpath?: string;
  src?: string;
}

/**
 * Lower-cased filename-ish string for matching. Accepts either a raw URL/ID
 * string or a `FilterableItem` shape; tries the most-specific field first.
 */
export function itemFilenameForFilter(input: string | FilterableItem | null | undefined): string {
  if (!input) return "";
  if (typeof input === "string") return input.toLowerCase();

  const candidate =
    input.filename ??
    input.name ??
    input.basename ??
    input.path ??
    input.file ??
    input.fullpath ??
    input.src ??
    "";
  return candidate.toLowerCase();
}

/**
 * Lower-cased "what does this sensor look like" string — entity ID plus
 * `friendly_name` (or `name`) attribute. Used by alias-based matching for
 * sensor-source items.
 */
export function sensorTextForFilter(
  sensorEntityId: string,
  sensorState: HassEntity | null | undefined
): string {
  const attrs = sensorState?.attributes;
  const friendly = typeof attrs?.["friendly_name"] === "string" ? attrs["friendly_name"] : "";
  const name = typeof attrs?.["name"] === "string" ? attrs["name"] : "";
  const label = (friendly || name).toLowerCase();
  return `${sensorEntityId.toLowerCase()} ${label}`.trim();
}

/**
 * True when *any* alias for the filter appears in either the item's
 * filename-ish text or the sensor's friendly-name text. Empty alias lists
 * pass-through as `true` (legacy behaviour: unknown filter doesn't filter
 * anything out).
 */
export function matchesObjectFilterForFileSensor(
  src: string | FilterableItem | null | undefined,
  filter: string,
  sensorEntityId: string,
  sensorState: HassEntity | null | undefined = null
): boolean {
  const aliases = getFilterAliases(filter);
  if (!aliases.length) return true;

  const sensorText = sensorTextForFilter(sensorEntityId, sensorState);
  const fileText = itemFilenameForFilter(src);

  return aliases.some((alias) => sensorText.includes(alias) || fileText.includes(alias));
}
