/**
 * A sensible icon for an entity, for pre-filling the menu-button icon field
 * in the editor (#287).
 *
 * Order: the icon set on the entity in Home Assistant's entity settings
 * (registry), the entity's own `icon` attribute, then a default for its
 * device class, then a default for its domain. Mirrors
 * the common Home Assistant defaults; it does not need to be exhaustive,
 * because the field stays editable and is only filled when it is empty.
 */

interface EntityLike {
  attributes?: Record<string, unknown>;
}

/** The entity registry entry as HA exposes it on `hass.entities`. */
interface RegistryLike {
  icon?: string | null;
}

const DEVICE_CLASS_ICONS: Record<string, Record<string, string>> = {
  binary_sensor: {
    door: "mdi:door",
    garage_door: "mdi:garage",
    window: "mdi:window-closed",
    motion: "mdi:motion-sensor",
    occupancy: "mdi:home-account",
    presence: "mdi:home-account",
    smoke: "mdi:smoke-detector",
    moisture: "mdi:water-alert",
    opening: "mdi:square-outline",
    lock: "mdi:lock",
    sound: "mdi:music-note",
    vibration: "mdi:vibrate",
  },
  cover: {
    garage: "mdi:garage",
    gate: "mdi:gate",
    door: "mdi:door",
    blind: "mdi:blinds",
    curtain: "mdi:curtains",
    shutter: "mdi:window-shutter",
    awning: "mdi:awning-outline",
    window: "mdi:window-closed",
  },
  switch: {
    outlet: "mdi:power-socket-eu",
    switch: "mdi:toggle-switch",
  },
  sensor: {
    temperature: "mdi:thermometer",
    humidity: "mdi:water-percent",
    battery: "mdi:battery",
    illuminance: "mdi:brightness-5",
    power: "mdi:flash",
    energy: "mdi:lightning-bolt",
  },
};

const DOMAIN_ICONS: Record<string, string> = {
  light: "mdi:lightbulb",
  switch: "mdi:toggle-switch",
  input_boolean: "mdi:toggle-switch-outline",
  lock: "mdi:lock",
  cover: "mdi:window-shutter",
  fan: "mdi:fan",
  siren: "mdi:alarm-light",
  alarm_control_panel: "mdi:shield-home",
  script: "mdi:script-text",
  automation: "mdi:robot",
  scene: "mdi:palette",
  button: "mdi:gesture-tap-button",
  input_button: "mdi:gesture-tap-button",
  input_select: "mdi:format-list-bulleted",
  select: "mdi:format-list-bulleted",
  media_player: "mdi:cast",
  climate: "mdi:thermostat",
  camera: "mdi:cctv",
  vacuum: "mdi:robot-vacuum",
  valve: "mdi:pipe-valve",
  water_heater: "mdi:water-boiler",
  humidifier: "mdi:air-humidifier",
  binary_sensor: "mdi:radiobox-blank",
  sensor: "mdi:eye",
  person: "mdi:account",
  device_tracker: "mdi:account",
  number: "mdi:ray-vertex",
  input_number: "mdi:ray-vertex",
  input_text: "mdi:form-textbox",
  notify: "mdi:message",
  update: "mdi:package-up",
};

/** Fallback when nothing else matches. */
export const GENERIC_ENTITY_ICON = "mdi:gesture-tap-button";

export function defaultEntityIcon(
  entityId: string,
  entity?: EntityLike | null,
  registry?: RegistryLike | null
): string {
  const reg = registry?.icon;
  if (typeof reg === "string" && reg.trim()) return reg.trim();
  const own = entity?.attributes?.["icon"];
  if (typeof own === "string" && own.trim()) return own.trim();
  const domain = String(entityId || "").split(".")[0] ?? "";
  const dc = entity?.attributes?.["device_class"];
  if (typeof dc === "string") {
    const byClass = DEVICE_CLASS_ICONS[domain]?.[dc];
    if (byClass) return byClass;
  }
  return DOMAIN_ICONS[domain] ?? GENERIC_ENTITY_ICON;
}

/**
 * The icon a menu button should get after its entity changed (#287): the new
 * entity's icon when the field is empty or still holds the previous entity's
 * automatic icon. An icon the user chose themselves is kept (returns null).
 */
export function iconAfterEntityChange(opts: {
  currentIcon: string | null | undefined;
  previousDefault: string | null | undefined;
  nextDefault: string;
}): string | null {
  const cur = String(opts.currentIcon ?? "").trim();
  if (!cur) return opts.nextDefault;
  if (opts.previousDefault && cur === opts.previousDefault) return opts.nextDefault;
  return null;
}
