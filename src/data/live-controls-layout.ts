/**
 * Where each live control sits (#286): row 1 (next to the camera name),
 * row 2 (a second row below it) or the hamburger menu.
 *
 * Two kinds of controls share the rows:
 *   - built-in pills from LIVE_PILL_CATALOG (mute, picker, PiP, ...), set in
 *     `live_pills[id]` with `enabled`, `order` and an optional `row: 2`;
 *   - custom `menu_buttons`. `placement: controls` puts one among the pills,
 *     with optional `order` and `row: 2`; otherwise it sits in the menu.
 *
 * Both are sorted together by `order` within their row. A button without an
 * `order` goes after the pills (today's behaviour), in list order. Built-in
 * pills can't go in the menu.
 *
 * `zonesToConfig` is the reverse: the editor hands over the three lists the
 * user dragged into shape and gets the `live_pills` / `menu_buttons` to save.
 */

import { LIVE_PILL_CATALOG, type PillCatalogEntry } from "./pill-catalog";

export type ZoneKey = "row1" | "row2" | "menu";

export type ControlItem =
  { kind: "pill"; id: string; enabled: boolean } | { kind: "button"; index: number };

export interface ControlZones {
  row1: ControlItem[];
  row2: ControlItem[];
  menu: ControlItem[];
}

interface PillOverride {
  enabled?: boolean;
  order?: number;
  row?: number;
}

interface ButtonLike {
  placement?: string;
  order?: number;
  row?: number;
  [key: string]: unknown;
}

/** Orders for buttons without an explicit `order`: after every pill. */
const BUTTON_ORDER_BASE = 1000;

/** Stable key for an item, as the editor's drag-and-drop uses it. */
export function itemKey(item: ControlItem): string {
  return item.kind === "pill" ? `pill:${item.id}` : `btn:${item.index}`;
}

export function liveControlZones(
  livePills: Record<string, PillOverride> | null | undefined,
  menuButtons: readonly ButtonLike[] | null | undefined,
  catalog: readonly PillCatalogEntry[] = LIVE_PILL_CATALOG
): ControlZones {
  type Sorted = { item: ControlItem; order: number; tie: number };
  const rows: Record<"row1" | "row2", Sorted[]> = { row1: [], row2: [] };
  const menu: ControlItem[] = [];

  catalog.forEach((entry, i) => {
    const o = livePills?.[entry.id];
    const order = typeof o?.order === "number" ? o.order : entry.defaultOrder;
    const row = o?.row === 2 ? "row2" : "row1";
    rows[row].push({
      item: { kind: "pill", id: entry.id, enabled: o?.enabled !== false },
      order,
      tie: i,
    });
  });

  (menuButtons ?? []).forEach((btn, index) => {
    if (btn?.placement !== "controls") {
      menu.push({ kind: "button", index });
      return;
    }
    const order = typeof btn.order === "number" ? btn.order : BUTTON_ORDER_BASE + index;
    const row = btn.row === 2 ? "row2" : "row1";
    rows[row].push({ item: { kind: "button", index }, order, tie: catalog.length + index });
  });

  const sorted = (list: Sorted[]) =>
    list.sort((a, b) => a.order - b.order || a.tie - b.tie).map((s) => s.item);
  return { row1: sorted(rows.row1), row2: sorted(rows.row2), menu };
}

/**
 * Turn the editor's three lists back into config. A pill keeps its catalog
 * order where the sequence allows, so pills the user didn't move stay out of
 * the YAML. Menu buttons are
 * re-listed in zone order: row 1, row 2, then menu.
 */
export function zonesToConfig<B extends ButtonLike>(
  zones: { row1: readonly string[]; row2: readonly string[]; menu: readonly string[] },
  livePills: Record<string, PillOverride> | null | undefined,
  menuButtons: readonly B[] | null | undefined,
  catalog: readonly PillCatalogEntry[] = LIVE_PILL_CATALOG
): { live_pills: Record<string, PillOverride>; menu_buttons: B[] } {
  const pills: Record<string, PillOverride> = {};
  const buttons: B[] = [];
  const src = menuButtons ?? [];

  const place = (keys: readonly string[], zone: ZoneKey) => {
    // Give each control the smallest order that keeps the row's sequence,
    // preferring a pill's catalog default so untouched pills stay out of
    // the YAML. Buttons slot in right after whatever comes before them.
    let last = 0;
    keys.forEach((key) => {
      if (key.startsWith("pill:")) {
        const id = key.slice(5);
        const entry = catalog.find((e) => e.id === id);
        if (!entry || zone === "menu") return;
        const order = entry.defaultOrder > last ? entry.defaultOrder : last + 1;
        last = order;
        const out: PillOverride = {};
        if (livePills?.[id]?.enabled === false) out.enabled = false;
        if (order !== entry.defaultOrder) out.order = order;
        if (zone === "row2") out.row = 2;
        if (Object.keys(out).length) pills[id] = out;
        return;
      }
      const btn = src[Number(key.slice(4))];
      if (!btn) return;
      const next = { ...btn };
      delete next.order;
      delete next.row;
      if (zone === "menu") {
        delete next.placement;
      } else {
        last += 1;
        next.placement = "controls";
        next.order = last;
        if (zone === "row2") next.row = 2;
      }
      buttons.push(next);
    });
  };
  place(zones.row1, "row1");
  place(zones.row2, "row2");
  place(zones.menu, "menu");

  // Pills the editor didn't list (shouldn't happen) keep their old settings.
  for (const entry of catalog) {
    const listed = [...zones.row1, ...zones.row2].includes(`pill:${entry.id}`);
    if (!listed && livePills?.[entry.id]) pills[entry.id] = { ...livePills[entry.id] };
  }
  // Same for buttons: never drop one because of an editor glitch.
  src.forEach((btn, i) => {
    const key = `btn:${i}`;
    if (![...zones.row1, ...zones.row2, ...zones.menu].includes(key)) buttons.push({ ...btn });
  });

  return { live_pills: pills, menu_buttons: buttons };
}
