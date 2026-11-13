/**
 * Pure helpers for `menu_buttons`: the live-view action buttons.
 *
 * Each button sits either in the hamburger menu (default) or, with
 * `placement: controls`, directly among the live control pills (#215).
 * A button on an `input_select` / `select` entity opens a list of its
 * options instead of toggling; picking one calls `select_option` (#215).
 */

import type { HassEntity } from "../types/hass";
import { entityDisplayName, type EntityNameSource } from "../util/entity-name";

export const MENU_BUTTON_PLACEMENTS = ["menu", "controls"] as const;
export type MenuButtonPlacement = (typeof MENU_BUTTON_PLACEMENTS)[number];

/** One `menu_buttons` entry, as validated by `structs.ts`. */
/** HA action config (`action` plus action-specific keys). */
export interface MenuButtonAction {
  action: string;
  [key: string]: unknown;
}

export interface MenuButtonConfig {
  /** Optional for shortcut buttons that only have a `tap_action` (#302). */
  entity?: string | undefined;
  icon: string;
  icon_on?: string | undefined;
  color_on?: string | undefined;
  color_off?: string | undefined;
  title?: string | undefined;
  service?: string | undefined;
  state_on?: string | undefined;
  placement?: MenuButtonPlacement | undefined;
  tap_action?: MenuButtonAction | undefined;
}

/** A service call ready for `hass.callService`. */
export interface MenuButtonCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

/** What tapping a button does. */
export type MenuButtonTap =
  | { kind: "call"; call: MenuButtonCall }
  | { kind: "select"; options: string[]; current: string }
  | { kind: "action"; action: MenuButtonAction }
  | { kind: "none" };

/** States that count as "on" when the button has no `state_on`. */
const ON_STATES = new Set([
  "on",
  "open",
  "opening",
  "unlocked",
  "playing",
  "paused",
  "home",
  "true",
  "heat",
  "cool",
  "heat_cool",
  "fan_only",
  "dry",
  "auto",
]);

/** Entity domains whose button opens an option list. */
const SELECT_DOMAINS = new Set(["input_select", "select"]);

export function entityDomain(entityId: unknown): string {
  return String(entityId ?? "").split(".")[0] ?? "";
}

/** Split buttons by where they render, keeping config order within each. */
export function splitMenuButtons<T extends object>(
  buttons: readonly T[] | null | undefined
): { controls: T[]; menu: T[] } {
  const controls: T[] = [];
  const menu: T[] = [];
  for (const b of buttons ?? []) {
    const placement = (b as { placement?: unknown } | null)?.placement;
    (placement === "controls" ? controls : menu).push(b);
  }
  return { controls, menu };
}

/** Whether the button shows its "on" look (`icon_on` / `color_on`). */
export function isMenuButtonOn(
  btn: Pick<MenuButtonConfig, "state_on">,
  state: HassEntity | null | undefined
): boolean {
  const value = state?.state ?? "";
  return btn.state_on ? value === btn.state_on : ON_STATES.has(value);
}

/**
 * What a tap does. An explicit `service` always wins; otherwise
 * `input_select` / `select` entities with options open a list, automations
 * trigger, scripts run, and everything else toggles.
 */
export function menuButtonTap(
  btn: Pick<MenuButtonConfig, "entity" | "service" | "tap_action">,
  state: HassEntity | null | undefined
): MenuButtonTap {
  // A tap action wins over the entity's own behaviour (#302).
  const ta = btn.tap_action;
  if (ta && typeof ta.action === "string" && ta.action) return { kind: "action", action: ta };
  const entity_id = btn.entity;
  if (!entity_id) return { kind: "none" };
  const svc = String(btn.service ?? "").trim();
  if (svc.includes(".")) {
    const [domain, service] = svc.split(".");
    return {
      kind: "call",
      call: { domain: domain ?? "", service: service ?? "", data: { entity_id } },
    };
  }

  const domain = entityDomain(entity_id);
  if (SELECT_DOMAINS.has(domain)) {
    const raw = state?.attributes?.["options"];
    const options = Array.isArray(raw) ? raw.map((o) => String(o)) : [];
    if (options.length) return { kind: "select", options, current: String(state?.state ?? "") };
  }

  const [d, s] =
    domain === "automation"
      ? ["automation", "trigger"]
      : domain === "script"
        ? ["script", "turn_on"]
        : ["homeassistant", "toggle"];
  return { kind: "call", call: { domain: d, service: s, data: { entity_id } } };
}

/** The `select_option` call for picking `option` on an (input_)select entity. */
export function selectOptionCall(entityId: string, option: string): MenuButtonCall {
  const domain = entityDomain(entityId) === "select" ? "select" : "input_select";
  return { domain, service: "select_option", data: { entity_id: entityId, option } };
}

/**
 * Button label: `title`, else the entity's display name (as the built-in
 * cards show it when `hass` is given, else `friendly_name`), else its id.
 */
export function menuButtonLabel(
  btn: Pick<MenuButtonConfig, "entity" | "title">,
  state: HassEntity | null | undefined,
  hass?: EntityNameSource | null
): string {
  if (btn.title) return btn.title;
  if (!btn.entity) return "";
  const states = state ? { [btn.entity]: state } : undefined;
  return (
    entityDisplayName({ states, formatEntityName: hass?.formatEntityName }, btn.entity) ||
    btn.entity
  );
}
