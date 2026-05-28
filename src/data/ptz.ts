/**
 * PTZ (pan / tilt / zoom) command layer.
 *
 * Pure helpers that turn user intent into HA service calls. The card UI
 * imports a handful of these and consumes the typed results — there is
 * no DOM access or `requestUpdate` here.
 *
 *  - `getPtzConfig(config, cameraId)` resolves the per-camera entry from
 *    `live_ptz_cameras`, returning `null` when PTZ isn't enabled for
 *    that camera. Synthetic stream ids (`__cgc_stream_*__`) never have
 *    PTZ.
 *  - `detectPtzType(cameraId, hass)` picks a dispatcher type for a
 *    camera by probing `hass.states` + `hass.services`. Used by the
 *    editor's auto-detect.
 *  - `ptzCapabilities(ptz)` reports continuous / zoomable / homeable
 *    flags so the UI can hide buttons the integration can't drive and
 *    so the press handler knows whether to set up its polling
 *    fallback.
 *  - `resolvePtzPosition(config)` returns the effective overlay corner
 *    after auto-flipping for pill-bar conflicts.
 *  - `joystickResolve(...)` converts a pointer position on the virtual
 *    joystick into `{direction, magnitude}`.
 *  - `dispatchPan(hass, cameraId, ptz, direction, phase, globalSpeed)`
 *    and `dispatchAction(... zoom_in | zoom_out | home, phase, ...)`
 *    call the right HA service for the configured `type`. New types
 *    plug in here without touching the UI.
 */

import { PTZ_DIRECTIONS, PTZ_SPEED_MIN, PTZ_SPEED_MAX } from "../const";
import type { PtzDirection, PtzPosition, PtzType } from "../const";
import { STREAM_ID_PREFIX } from "./live-config";
import type { CameraGalleryCardConfig } from "../config/normalize";

export type { PtzDirection, PtzPosition };

/**
 * Resolve the effective PTZ overlay corner given the card's bar/controls
 * config. Auto-flips vertically when the user's chosen corner would clash
 * with the pill bar (overlay-mode only — in `controls_mode: fixed` the
 * bar lives outside the preview, so any corner is fair game).
 *
 *   bar_position=top + controls_mode=overlay → must be bottom-*
 *   bar_position=bottom + controls_mode=overlay → must be top-*
 *   bar_position=hidden | controls_mode=fixed → user's pick wins
 *
 * Returns the same value when no flip is needed, so callers can compare
 * against `config.live_ptz_position` to know whether a flip happened.
 */
export function resolvePtzPosition(
  config:
    | { live_ptz_position?: string; bar_position?: string; controls_mode?: string }
    | null
    | undefined
): PtzPosition {
  const desired = (config?.live_ptz_position ?? "bottom-left") as PtzPosition;
  if (config?.controls_mode === "fixed") return desired;
  const bp = config?.bar_position;
  if (bp !== "top" && bp !== "bottom") return desired;
  const isTop = desired.startsWith("top");
  if (bp === "top" && isTop) return desired.replace("top", "bottom") as PtzPosition;
  if (bp === "bottom" && !isTop) return desired.replace("bottom", "top") as PtzPosition;
  return desired;
}

/**
 * Press lifecycle phase passed to `dispatchPan`. Modelled on ACC's
 * `executePTZAction` so types that natively support ContinuousMove (Reolink,
 * Frigate, ONVIF) can keep the motor running between `start` and `stop`.
 *
 * For pulse-only types (`ezviz`) the card supplements `start` with its own
 * repeat-interval timer; `stop` is a no-op at the service layer because the
 * underlying integration has no stop call. See `ptzCapabilities()`.
 */
export type PtzPhase = "start" | "stop";

/**
 * What the dispatcher actually supports per type. The UI layer reads this to
 * hide buttons the integration can't drive, and to decide whether to use
 * start/stop alone (`continuous: true`) or fall back on polling.
 */
export interface PtzCapabilities {
  /** True when start/stop alone is enough — no polling fallback needed. */
  continuous: boolean;
  /** True when zoom_in/zoom_out are dispatchable. */
  zoomable: boolean;
  /** True when a "home" action is dispatchable (presets in the API or a dedicated home button). */
  homeable: boolean;
}

/**
 * Extended action set passed to `dispatchAction`. Pan is the four cardinals;
 * everything else is "named" actions (zoom in/out, home).
 */
export type PtzZoom = "zoom_in" | "zoom_out";
export type PtzNamedAction = PtzZoom | "home";

/** One free-form HA service call used as a per-direction override. */
export interface PtzServiceCall {
  service: string;
  data?: Record<string, string>;
  target?: { entity_id?: string | string[] };
}

/** Start + optional stop pair for one direction. */
export interface PtzActionPair {
  start: PtzServiceCall;
  stop?: PtzServiceCall;
}

/**
 * Optional per-direction overrides. When a key is set, the dispatcher
 * skips its built-in lookup for that direction and calls the user's
 * service instead. Home is one-shot, hence no stop.
 */
export interface PtzActions {
  up?: PtzActionPair;
  down?: PtzActionPair;
  left?: PtzActionPair;
  right?: PtzActionPair;
  zoom_in?: PtzActionPair;
  zoom_out?: PtzActionPair;
  home?: { start: PtzServiceCall };
}

/**
 * Manual per-action entity map (the "manual-first" path). Each value is the
 * exact entity the dispatcher drives: a `button.*` for pan/zoom/stop, a
 * `select.*_ptz_preset` for home. Filled by the editor's per-button pickers
 * (and its Detect helper). An absent key falls back to auto-derivation;
 * `actions` (free-form service call) still wins over this.
 */
export interface PtzButtons {
  up?: string;
  down?: string;
  left?: string;
  right?: string;
  zoom_in?: string;
  zoom_out?: string;
  stop?: string;
  home?: string;
}

/** Resolved per-camera PTZ config (struct-narrowed shape). */
export interface PtzCameraConfig {
  type: PtzType;
  /**
   * Optional override for the EZVIZ button-entity prefix. The HA EZVIZ
   * integration exposes one button per direction at
   * `button.<base>_ptz_<dir>`. We auto-derive `<base>` from the camera
   * entity id; if your install renamed the buttons, set this to the full
   * prefix (no trailing `_ptz_<dir>`).
   */
  button_prefix?: string;
  /**
   * Speed has no effect on the modern button-based EZVIZ integration
   * (each press sends a fixed pulse). Kept on the type so the field
   * still round-trips through YAML and so a future integration that
   * does honour speed plugs in without breaking config.
   */
  speed?: number;
  /**
   * Per-direction service-call overrides. Each entry replaces the
   * built-in dispatcher for that key — useful for cameras the supported
   * types don't cover (Foscam, Tapo without ONVIF, custom scripts).
   */
  actions?: PtzActions;
  /**
   * Manual per-action entity map. Pressed/selected directly when set,
   * before any auto-derivation. `actions` still takes precedence.
   */
  buttons?: PtzButtons;
}

/** Minimal hass surface — only what `dispatchPan` uses. */
export interface HassLike {
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: { entity_id?: string | string[] }
  ) => Promise<unknown>;
  /**
   * Used by `ezvizButtonEntity` to probe candidate entity ids when the
   * HA EZVIZ integration created localised entity names. Loose typing
   * keeps this struct portable across HA SDK versions — we only need
   * existence checks, never field reads.
   */
  states?: Readonly<Record<string, unknown>>;
}

/**
 * Direction-suffix candidates for the EZVIZ / Reolink button entities.
 * HA slugifies the localised translation_key into the entity id, so a
 * Dutch install ends up with `..._ptz_omhoog` instead of `..._ptz_up`.
 * We try English first (the platform default), then a handful of common
 * locale variants — first hit in `hass.states` wins.
 */
const EZVIZ_DIRECTION_SUFFIXES: Record<PtzDirection, readonly string[]> = {
  // HA slugifies the localized button name into the entity id — Dutch
  // "PTZ naar beneden" becomes `..._ptz_naar_beneden`, not `..._ptz_omlaag`.
  // Each list below covers the localisations we've actually seen in the
  // wild plus the obvious alternates per language.
  up: ["up", "omhoog", "naar_boven", "oben", "hoch", "arriba", "haut", "su", "gore", "opp"],
  down: [
    "down",
    "naar_beneden",
    "omlaag",
    "neer",
    "unten",
    "runter",
    "abajo",
    "bas",
    "giu",
    "dolu",
    "ned",
  ],
  left: ["left", "links", "naar_links", "izquierda", "gauche", "sinistra", "venstre", "stanga"],
  right: ["right", "rechts", "naar_rechts", "derecha", "droite", "destra", "hoyre", "dreapta"],
};

/** All keys of `PtzButtons`, used for safe iteration over untyped config. */
const PTZ_BUTTON_KEYS = [
  "up",
  "down",
  "left",
  "right",
  "zoom_in",
  "zoom_out",
  "stop",
  "home",
] as const;

/**
 * Return the per-camera PTZ entry, or `null` when:
 *   - the global `live_ptz_enabled` is off,
 *   - the camera id is a synthetic stream (no entity to target),
 *   - the camera has no entry in `live_ptz_cameras`.
 *
 * Synthetic stream ids start with `__cgc_stream` (see `live-config.ts`).
 * Filtered here so the overlay can render strictly on resolvable entities.
 */
export function getPtzConfig(
  config: CameraGalleryCardConfig | null | undefined,
  cameraId: string | null | undefined
): PtzCameraConfig | null {
  if (!config?.live_ptz_enabled) return null;
  const id = String(cameraId ?? "").trim();
  if (!id || id.startsWith(STREAM_ID_PREFIX)) return null;
  const map = config.live_ptz_cameras;
  if (!map || typeof map !== "object") return null;
  const entry = map[id];
  if (!entry) return null;
  const out: PtzCameraConfig = { type: entry.type };
  if (entry.speed !== undefined) out.speed = entry.speed;
  if (entry.button_prefix !== undefined && entry.button_prefix.trim() !== "") {
    out.button_prefix = entry.button_prefix.trim();
  }
  if (entry.actions) {
    // Struct validation already trims this to the shape we need; cast and
    // pass through. `exactOptionalPropertyTypes`-safe because callers
    // only read keys that are present.
    out.actions = entry.actions as PtzActions;
  }
  if (entry.buttons && typeof entry.buttons === "object") {
    // Keep only non-empty, trimmed entity ids so a blank field left behind
    // by the editor doesn't shadow auto-derivation with an empty string.
    const src = entry.buttons as Record<string, unknown>;
    const buttons: PtzButtons = {};
    for (const key of PTZ_BUTTON_KEYS) {
      const v = src[key];
      if (typeof v === "string" && v.trim() !== "") buttons[key] = v.trim();
    }
    if (Object.keys(buttons).length > 0) out.buttons = buttons;
  }
  return out;
}

/**
 * Call one of the user-supplied service calls. `service` is split on the
 * first dot — anything before is the HA domain, the rest is the service
 * name. Malformed input rejects so callers can surface it the same way
 * they handle any other dispatcher failure.
 */
function callOverride(hass: HassLike, call: PtzServiceCall): Promise<unknown> {
  const svc = String(call?.service ?? "").trim();
  const dot = svc.indexOf(".");
  if (dot <= 0 || dot === svc.length - 1) {
    return Promise.reject(new Error(`Malformed PTZ action service: '${svc}'`));
  }
  const domain = svc.slice(0, dot);
  const service = svc.slice(dot + 1);
  return hass.callService(domain, service, call.data ?? {}, call.target);
}

/**
 * Resolve an optional action override for a given pan direction. Returns
 * `null` when nothing's configured for that key — caller falls through to
 * the type-specific built-in dispatcher.
 */
function getDirectionOverride(ptz: PtzCameraConfig, key: PtzDirection): PtzActionPair | null {
  return ptz.actions?.[key] ?? null;
}

/**
 * Resolve an optional action override for a zoom or home action.
 */
function getActionOverride(
  ptz: PtzCameraConfig,
  key: PtzNamedAction
): { start: PtzServiceCall; stop?: PtzServiceCall } | null {
  return ptz.actions?.[key] ?? null;
}

/**
 * The user-set entity for one action from the manual `buttons` map, or
 * `undefined` when unset/blank — caller then falls through to built-in
 * auto-derivation. `getPtzConfig` already trims/drops blanks, but we
 * re-guard here so direct callers (tests, future paths) stay safe.
 */
function explicitButton(ptz: PtzCameraConfig, key: keyof PtzButtons): string | undefined {
  const v = ptz.buttons?.[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/**
 * Resolve the EZVIZ button entity for a given direction. The HA EZVIZ
 * integration was rewritten to expose button entities (one per direction)
 * instead of an `ezviz.ptz` service — pressing the button moves the
 * camera one fixed-duration pulse in that direction.
 *
 * Lookup strategy:
 *   1. Compute the prefix: `ptz.button_prefix` (user-supplied) if set,
 *      else auto-derived from the camera entity id (`camera.front_door`
 *      → `button.front_door`).
 *   2. Probe `hass.states` against each direction-suffix candidate
 *      (English first, then common locale variants). First match wins —
 *      so a Dutch install with `..._ptz_omhoog` resolves correctly.
 *   3. Fall back to the English suffix when nothing matches. Gives a
 *      recognisable "entity ..._ptz_up not found" error rather than a
 *      silent no-op.
 */
// Probed entity ids cache. Joystick + continuous-pan re-call this at
// pointer rate; without memoisation EZVIZ pans burn ~1k hass.states key
// probes per second. Confirmed hits only — guesses stay uncached so a
// late-appearing entity can still resolve.
const ezvizEntityCache = new Map<string, string>();

function ezvizButtonEntity(
  cameraEntityId: string,
  direction: PtzDirection,
  buttonPrefix?: string,
  hassStates?: Readonly<Record<string, unknown>>
): string {
  const cacheKey = `${cameraEntityId}|${direction}|${buttonPrefix ?? ""}`;
  const cached = ezvizEntityCache.get(cacheKey);
  if (cached && hassStates && cached in hassStates) return cached;
  const suffixes = EZVIZ_DIRECTION_SUFFIXES[direction];
  for (const prefix of candidateButtonPrefixes(cameraEntityId, buttonPrefix)) {
    if (!hassStates) {
      // No probing possible — first prefix is the canonical guess.
      return `${prefix}_ptz_${suffixes[0] ?? direction}`;
    }
    for (const sfx of suffixes) {
      const candidate = `${prefix}_ptz_${sfx}`;
      if (candidate in hassStates) {
        ezvizEntityCache.set(cacheKey, candidate);
        return candidate;
      }
    }
  }
  // Last-resort fallback when nothing in `hass.states` matched — return
  // the canonical English-suffix guess off the primary prefix so the
  // resulting "entity not found" error is recognisable.
  const primary = candidateButtonPrefixes(cameraEntityId, buttonPrefix)[0];
  return `${primary}_ptz_${suffixes[0] ?? direction}`;
}

/**
 * Suffixes typically tacked onto Reolink (and similar NVR / multi-channel)
 * camera entity ids that *don't* appear on the button entities. Stripping
 * these gives us a second prefix to probe so multi-channel users get
 * auto-detection without having to set `button_prefix` manually.
 *
 * Examples seen in the wild:
 *   - Reolink with substreams: `camera.front_door_sub` →
 *     buttons live at `button.front_door_ptz_*`.
 *   - Multi-channel NVRs: `camera.driveway_clear` → buttons at
 *     `button.driveway_ptz_*`.
 */
const STRIPPABLE_CAMERA_SUFFIXES = ["_sub", "_main", "_clear", "_fluent", "_balanced"] as const;

/**
 * Slug portion of a camera's PTZ entity ids — the stem you'd prepend a
 * domain to (`button.`, `select.`, etc.). When the user supplies an
 * explicit `button_prefix` we trim it; otherwise we derive from the
 * camera entity id. Note: NVR/substream stripping happens only in
 * `candidateButtonPrefixes`, since that's a probe-list concern.
 */
function cameraBaseSlug(cameraEntityId: string, buttonPrefix?: string): string {
  if (buttonPrefix && buttonPrefix.trim()) {
    return buttonPrefix
      .trim()
      .replace(/\.+$/, "")
      .replace(/_+$/, "")
      .replace(/^button\./, "");
  }
  return cameraEntityId.replace(/^camera\./, "");
}

/**
 * Build the ordered list of `button.<prefix>` candidates to probe. The
 * first entry is the canonical one (used as the "guess" when nothing
 * matches in `hass.states`); subsequent entries are progressively-trimmed
 * variants that cover NVR / substream naming patterns.
 */
function candidateButtonPrefixes(cameraEntityId: string, buttonPrefix?: string): string[] {
  if (buttonPrefix && buttonPrefix.trim()) {
    return [buttonPrefix.trim().replace(/\.+$/, "").replace(/_+$/, "")];
  }
  const base = cameraBaseSlug(cameraEntityId);
  const out = [`button.${base}`];
  for (const suffix of STRIPPABLE_CAMERA_SUFFIXES) {
    if (base.endsWith(suffix)) {
      const stripped = base.slice(0, -suffix.length);
      if (stripped && stripped !== base) out.push(`button.${stripped}`);
    }
  }
  return out;
}

/**
 * Localised suffix candidates for the Reolink PTZ stop button. ACC matches
 * on `unique_id` (always English) but we live in entity-id space; the
 * HA Reolink integration uses `translation_key: "ptz_stop"`, which becomes
 * `..._ptz_stop` in English, `..._ptz_stoppen` in some installs, etc.
 */
const REOLINK_STOP_SUFFIXES: readonly string[] = ["stop", "stoppen", "anhalten", "arret", "parar"];

/**
 * Best-effort detection of which PTZ dispatcher type fits a given camera.
 * Used by the editor to pre-fill the "Integration" dropdown so users don't
 * have to know the underlying mechanism.
 *
 * Detection order (most specific → least specific):
 *   1. Dedicated `ptz_stop` button → reolink (continuous, button-based)
 *   2. Direction `ptz_<dir>` button → ezviz (pulse, button-based)
 *   3. `frigate.ptz` service available → frigate
 *   4. `onvif.ptz` service available → onvif
 *
 * Returns `null` when nothing matches; the caller can fall back to a
 * sensible default (`ezviz`).
 */
export function detectPtzType(
  cameraEntityId: string,
  hass: {
    states?: Readonly<Record<string, unknown>>;
    services?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  }
): PtzType | null {
  if (hass.states) {
    // Probe every candidate prefix — covers Reolink substream / NVR
    // entity ids where the buttons live on a parent slug
    // (e.g. `camera.front_door_sub` → `button.front_door_*`).
    const prefixes = candidateButtonPrefixes(cameraEntityId);
    for (const prefix of prefixes) {
      for (const sfx of REOLINK_STOP_SUFFIXES) {
        if (`${prefix}_ptz_${sfx}` in hass.states) return "reolink";
      }
    }
    for (const prefix of prefixes) {
      for (const dir of PTZ_DIRECTIONS) {
        for (const sfx of EZVIZ_DIRECTION_SUFFIXES[dir]) {
          if (`${prefix}_ptz_${sfx}` in hass.states) return "ezviz";
        }
      }
    }
  }
  // Service-based dispatchers (Frigate/ONVIF) need camera-specific
  // evidence — a globally-registered service says nothing about whether
  // *this* camera supports PTZ. Without that we'd light up every camera
  // in the editor just because Frigate-the-integration is installed.
  //
  // Frigate: only when the camera entity itself is a Frigate-managed
  //   camera AND `frigate.ptz` exists. The Frigate integration's camera
  //   entity exposes `camera_name` + `client_id` attributes (there is no
  //   `frigate_camera_name`); the pair together is the Frigate signature.
  // ONVIF: cannot be reliably detected from `hass.states` alone (the
  //   camera entity attributes don't expose PTZ capability), so we skip
  //   auto-detect and require the user to pick "ONVIF" manually.
  const attrs = (
    hass.states?.[cameraEntityId] as { attributes?: Record<string, unknown> } | undefined
  )?.attributes;
  const isFrigate = !!attrs && "camera_name" in attrs && "client_id" in attrs;
  if (isFrigate && hass.services?.["frigate"] && "ptz" in hass.services["frigate"]) {
    return "frigate";
  }
  return null;
}

/**
 * Resolve the Reolink `ptz_stop` button. Returns `null` when nothing matches
 * — the caller treats that as "no stop available" and silently skips the
 * stop call (motion will time out on the camera side instead).
 */
function reolinkStopEntity(
  cameraEntityId: string,
  buttonPrefix?: string,
  hassStates?: Readonly<Record<string, unknown>>
): string | null {
  const prefixes = candidateButtonPrefixes(cameraEntityId, buttonPrefix);
  if (hassStates) {
    for (const prefix of prefixes) {
      for (const sfx of REOLINK_STOP_SUFFIXES) {
        const candidate = `${prefix}_ptz_${sfx}`;
        if (candidate in hassStates) return candidate;
      }
    }
  }
  // English default off the canonical prefix — same rationale as the
  // direction helpers: if nothing exists, surface a recognisable
  // "entity not found" error.
  return `${prefixes[0]}_ptz_stop`;
}

/**
 * Resolve the Reolink zoom button (`_ptz_zoom_in` / `_ptz_zoom_out`). Probes
 * each candidate prefix against hass.states so substream / NVR cameras whose
 * buttons live on a stripped slug resolve correctly — the direction helpers
 * already do this; zoom historically didn't and targeted the unstripped
 * prefix. Falls back to the canonical prefix when nothing matches. Zoom
 * button names aren't localised by the integration the way directions are,
 * so there's no per-language probing here — non-English installs use the
 * manual `buttons` map instead.
 */
function zoomButtonEntity(
  cameraEntityId: string,
  buttonPrefix: string | undefined,
  hassStates: Readonly<Record<string, unknown>> | undefined,
  action: PtzZoom
): string {
  const prefixes = candidateButtonPrefixes(cameraEntityId, buttonPrefix);
  if (hassStates) {
    for (const p of prefixes) {
      const cand = `${p}_ptz_${action}`;
      if (cand in hassStates) return cand;
    }
  }
  return `${prefixes[0]}_ptz_${action}`;
}

/**
 * Stream-quality tokens the Reolink integration appends to camera entity ids
 * (localised at entity creation) which the PTZ *button* entities do NOT
 * carry. Used to recover the button stem from a camera id regardless of UI
 * language or stream/lens position.
 */
const STREAM_QUALITY_TOKENS = [
  "sub",
  "main",
  "clear",
  "fluent",
  "balanced",
  "vloeiend",
  "helder",
  "gebalanceerd", // nl
  "klar",
  "fluessig",
  "fluid", // de
  "clair",
  "fluide",
  "equilibre", // fr
  "claro",
  "fluido",
  "equilibrado", // es
] as const;

/**
 * Best-effort recovery of the `button.<stem>` slug a camera's PTZ buttons
 * live on. Tries the camera base as-is, then with each known stream-quality
 * token removed (anywhere in the slug — covers `_vloeiend` mid-string in
 * dual-lens ids). Returns the first stem under which any `_ptz_*` button
 * actually exists, else `null`.
 */
function detectButtonStem(
  cameraEntityId: string,
  states: Readonly<Record<string, unknown>>
): string | null {
  const base = cameraEntityId.replace(/^camera\./, "");
  const candidates = [base];
  for (const t of STREAM_QUALITY_TOKENS) {
    const re = new RegExp(`_${t}(?=_|$)`);
    if (re.test(base)) candidates.push(base.replace(re, ""));
  }
  const keys = Object.keys(states);
  for (const c of candidates) {
    const pre = `button.${c}`;
    if (keys.some((k) => k.startsWith(`${pre}_ptz_`))) return pre;
  }
  return null;
}

/**
 * Resolve the concrete PTZ entities for a camera by probing hass.states —
 * the engine behind the editor's "Detect buttons" action. Returns only
 * entities that actually exist, so the editor can pre-fill the manual
 * `buttons` map and leave the rest blank for the user to pick. Handles
 * localised direction / stop names and stream-suffixed / dual-lens camera
 * ids. Zoom is matched on the English slug only (the integration doesn't
 * localise it), so a non-English zoom button stays unfilled by design.
 */
export function detectPtzButtons(
  cameraEntityId: string,
  hass: { states?: Readonly<Record<string, unknown>> }
): PtzButtons {
  const states = hass?.states;
  if (!states) return {};
  const stem = detectButtonStem(cameraEntityId, states);
  if (!stem) return {};
  const out: PtzButtons = {};
  for (const dir of PTZ_DIRECTIONS) {
    const e = ezvizButtonEntity(cameraEntityId, dir, stem, states);
    if (e in states) out[dir] = e;
  }
  const stop = reolinkStopEntity(cameraEntityId, stem, states);
  if (stop && stop in states) out.stop = stop;
  for (const z of ["zoom_in", "zoom_out"] as const) {
    const e = `${stem}_ptz_${z}`;
    if (e in states) out[z] = e;
  }
  const sel = `select.${stem.replace(/^button\./, "")}_ptz_preset`;
  if (sel in states) out.home = sel;
  return out;
}

/** What `joystickResolve` returns per pointer frame. */
export interface JoystickResult {
  /** Dominant cardinal direction, or `null` when the thumb sits inside the dead-zone. */
  direction: PtzDirection | null;
  /**
   * Horizontal component when meaningfully pulled (past the per-axis
   * dead-zone), else `null`. Same for `vertical`. Lets continuous-type
   * dispatchers that accept both pan + tilt (ONVIF) send a true
   * diagonal call. Pulse-types ignore these and use `direction`.
   */
  horizontal: "left" | "right" | null;
  vertical: "up" | "down" | null;
  /** Distance from centre normalized to the base radius, clamped 0–1. */
  magnitude: number;
}

/**
 * Resolve a pointer position into a `{direction, magnitude}` pair for a
 * virtual joystick. Centre + base radius come from the renderer.
 *
 *   - `magnitude < deadzone` → `direction: null, magnitude: 0`. The caller
 *     treats this as "release" so the dispatcher stops.
 *   - Otherwise the dominant axis (|dx| vs |dy|) picks the cardinal
 *     direction. Magnitude is the fraction of the way to the rim,
 *     clamped to 1.0 so dispatchers can use it as a 0–1 speed scalar.
 *
 * `direction` always collapses to the dominant cardinal axis — that's
 * what pulse-types and single-axis continuous-types (Reolink button.press,
 * Frigate `move`) consume. `horizontal`/`vertical` carry the per-axis
 * components when both are meaningfully engaged, so ONVIF (which accepts
 * pan + tilt in one ContinuousMove call) can issue a true diagonal.
 */
export function joystickResolve(
  centerX: number,
  centerY: number,
  baseRadius: number,
  clientX: number,
  clientY: number,
  options?: { deadzone?: number }
): JoystickResult {
  if (!Number.isFinite(baseRadius) || baseRadius <= 0) {
    return { direction: null, horizontal: null, vertical: null, magnitude: 0 };
  }
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  const dist = Math.hypot(dx, dy);
  const magnitude = Math.min(1, dist / baseRadius);
  const deadzone = options?.deadzone ?? 0.15;
  if (magnitude < deadzone) {
    return { direction: null, horizontal: null, vertical: null, magnitude: 0 };
  }
  // Per-axis dead-zone: half the radial dead-zone is enough that a slight
  // sideways drift past the radial threshold doesn't latch a second axis
  // immediately. Tuned so that pulling more than ~30 % off the dominant
  // axis is what flips on the secondary axis for diagonal dispatch.
  const axisDead = baseRadius * deadzone * 0.5;
  const horizontal: "left" | "right" | null =
    Math.abs(dx) >= axisDead ? (dx >= 0 ? "right" : "left") : null;
  const vertical: "up" | "down" | null =
    Math.abs(dy) >= axisDead ? (dy >= 0 ? "down" : "up") : null;
  const direction: PtzDirection =
    Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "down" : "up";
  return { direction, horizontal, vertical, magnitude };
}

/**
 * Resolve the speed for a pan command. Per-camera override wins; otherwise
 * the global `live_ptz_speed` from config; otherwise the struct default.
 * Always clamped to the EZVIZ-accepted range so a malformed config can't
 * push an out-of-range value over the wire.
 */
function resolveSpeed(ptz: PtzCameraConfig, globalSpeed: number): number {
  const raw = ptz.speed ?? globalSpeed;
  if (!Number.isFinite(raw)) return Math.round((PTZ_SPEED_MIN + PTZ_SPEED_MAX) / 2);
  return Math.max(PTZ_SPEED_MIN, Math.min(PTZ_SPEED_MAX, Math.round(raw)));
}

/**
 * Capabilities of the current dispatcher type. `continuous: true` means the
 * caller can rely on `start`/`stop` alone (the underlying integration keeps
 * the camera moving in between). `continuous: false` means each `start` is
 * a fixed-duration pulse and the caller must repeat it to achieve sustained
 * motion (EZVIZ today).
 */
export function ptzCapabilities(ptz: PtzCameraConfig): PtzCapabilities {
  switch (ptz.type) {
    case "ezviz":
      // Most consumer EZVIZ cams (C6N etc.) are pan/tilt only — no optical
      // zoom. The HA integration doesn't expose home either. Keep capability
      // flags conservative so the UI doesn't render buttons that no-op.
      return { continuous: false, zoomable: false, homeable: false };
    case "reolink":
      // Reolink doesn't expose a `_ptz_home` button, but the integration
      // surfaces `select.<base>_ptz_preset` whose first option (or one
      // literally named "Home") doubles as the home position. We flag
      // home as supported and let `dispatchAction` resolve the actual
      // call against that select entity.
      return { continuous: true, zoomable: true, homeable: true };
    case "frigate":
      return { continuous: true, zoomable: true, homeable: false };
    case "onvif":
      return { continuous: true, zoomable: true, homeable: false };
    default:
      return { continuous: false, zoomable: false, homeable: false };
  }
}

/**
 * Issue one pan/tilt action. Behaviour depends on the dispatcher type and the
 * `phase`:
 *   - For pulse types (`ezviz`): `phase: "start"` fires one pulse;
 *     `phase: "stop"` is a no-op (resolves to `undefined`) because the
 *     integration has no stop call. The caller owns the repeat-interval
 *     timer in that case.
 *   - For continuous types (Reolink, ONVIF, Frigate — planned): `start`
 *     begins motion; `stop` halts it. No repeat timer needed.
 *
 * Returns a Promise so callers can `.catch` uniformly. Resolves to
 * `undefined` for ignored phases.
 */
export function dispatchPan(
  hass: HassLike,
  cameraEntityId: string,
  ptz: PtzCameraConfig,
  direction: PtzDirection,
  phase: PtzPhase,
  globalSpeed: number,
  /**
   * Optional secondary axis for diagonal pan. The joystick passes this
   * when both the horizontal and vertical components clear the dead-zone
   * — only ONVIF's `onvif.ptz` accepts pan+tilt in one ContinuousMove
   * call, so other dispatchers ignore the value.
   */
  secondaryDirection?: PtzDirection | null
): Promise<unknown> {
  // YAML escape hatch: if the user configured `actions.<dir>.start` (and
  // optionally `.stop`), route through it instead of the built-in
  // dispatcher. Lets users wire up cameras the supported types can't
  // cover (Foscam, Tapo without ONVIF, custom scripts).
  const override = getDirectionOverride(ptz, direction);
  if (override) {
    if (phase === "start") return callOverride(hass, override.start);
    if (override.stop) return callOverride(hass, override.stop);
    // No stop override set — fall through to the built-in stop (so the
    // continuous-type integration still halts on release).
  }

  if (ptz.type === "ezviz") {
    // EZVIZ button-based integration has no stop call. Treat `stop` as a
    // no-op at the service layer; the card-side interval clearing handles
    // the actual "stop pulsing" behaviour.
    if (phase === "stop") return Promise.resolve(undefined);
    const entityId =
      explicitButton(ptz, direction) ??
      ezvizButtonEntity(cameraEntityId, direction, ptz.button_prefix, hass.states);
    // `target.entity_id` is the modern HA shape; the button-based EZVIZ
    // integration was added in the same generation that made `target` canonical.
    return hass.callService("button", "press", {}, { entity_id: entityId });
  }

  if (ptz.type === "reolink") {
    // Reolink exposes a `ptz_stop` button alongside the direction buttons.
    // The HA integration translates `button.press` into a ContinuousMove
    // (start) or Stop (stop) under the hood, so this card just needs to
    // press the right button per phase.
    if (phase === "stop") {
      const stopId =
        explicitButton(ptz, "stop") ??
        reolinkStopEntity(cameraEntityId, ptz.button_prefix, hass.states);
      if (!stopId) return Promise.resolve(undefined);
      return hass.callService("button", "press", {}, { entity_id: stopId });
    }
    // Reolink direction buttons share the same naming pattern as EZVIZ,
    // so we lean on the same suffix-probing helper (unless explicitly set).
    const entityId =
      explicitButton(ptz, direction) ??
      ezvizButtonEntity(cameraEntityId, direction, ptz.button_prefix, hass.states);
    return hass.callService("button", "press", {}, { entity_id: entityId });
  }

  if (ptz.type === "onvif") {
    // ONVIF: `onvif.ptz` drives pan / tilt / zoom in ContinuousMove until
    // a Stop call comes in. Speed maps 1–9 → 0–1. When `secondaryDirection`
    // is on the other axis from `direction`, the call sets both `pan`
    // and `tilt` for true diagonal motion (the integration accepts both
    // in one call; this is the win over our other dispatchers).
    if (phase === "stop") {
      return hass.callService("onvif", "ptz", { move_mode: "Stop" }, { entity_id: cameraEntityId });
    }
    const onvifSpeed = resolveSpeed(ptz, globalSpeed) / PTZ_SPEED_MAX;
    const axisMap: Record<PtzDirection, { key: "pan" | "tilt"; value: string }> = {
      left: { key: "pan", value: "LEFT" },
      right: { key: "pan", value: "RIGHT" },
      up: { key: "tilt", value: "UP" },
      down: { key: "tilt", value: "DOWN" },
    };
    const primary = axisMap[direction];
    const data: Record<string, unknown> = {
      move_mode: "ContinuousMove",
      speed: onvifSpeed,
      [primary.key]: primary.value,
    };
    if (secondaryDirection) {
      const secondary = axisMap[secondaryDirection];
      // Only add the secondary axis when it's actually different from the
      // primary — a joystick stuck on one axis shouldn't accidentally
      // overwrite the primary value here.
      if (secondary.key !== primary.key) data[secondary.key] = secondary.value;
    }
    return hass.callService("onvif", "ptz", data, { entity_id: cameraEntityId });
  }

  if (ptz.type === "frigate") {
    // Frigate exposes a single `frigate.ptz` service with `action: move|stop`
    // and `argument: <direction>` for moves. Target is the camera entity
    // itself — no per-direction entity lookup needed. Mirrors ACC's
    // Frigate dispatcher exactly.
    if (phase === "stop") {
      return hass.callService("frigate", "ptz", { action: "stop" }, { entity_id: cameraEntityId });
    }
    return hass.callService(
      "frigate",
      "ptz",
      { action: "move", argument: direction },
      { entity_id: cameraEntityId }
    );
  }

  return Promise.reject(new Error(`Unknown PTZ type: ${String(ptz.type)}`));
}

/**
 * Issue a zoom or home action with the same start/stop phasing model as
 * `dispatchPan`. Callers that want a quick one-shot (e.g. home recall via
 * preset script) typically only emit `start` and ignore `stop`; for
 * continuous types the integration's stop service handles both pan and
 * zoom uniformly, so we just delegate.
 */
export function dispatchAction(
  hass: HassLike,
  cameraEntityId: string,
  ptz: PtzCameraConfig,
  action: PtzNamedAction,
  phase: PtzPhase,
  globalSpeed: number
): Promise<unknown> {
  // YAML escape hatch (zoom / home). Same fall-through logic as
  // `dispatchPan`: explicit `start` and (for zoom) optional `stop`
  // override the built-in dispatcher; if `stop` isn't supplied the
  // built-in stop still fires so motion halts on release.
  const override = getActionOverride(ptz, action);
  if (override) {
    if (phase === "start") return callOverride(hass, override.start);
    if (override.stop) return callOverride(hass, override.stop);
  }

  if (action === "home") {
    // Home is a one-shot. Only act on phase:"start" so a press-and-hold
    // doesn't keep retriggering recall while the camera is still moving.
    if (phase === "stop") return Promise.resolve(undefined);
    if (ptz.type === "reolink") {
      // Reolink: select the Home preset on `select.<base>_ptz_preset`.
      // Prefer an option literally named "Home" (case-insensitive); else
      // fall back to the first option in the list — that's the standard
      // home slot in PTZ firmware.
      const selectEntity =
        explicitButton(ptz, "home") ??
        `select.${cameraBaseSlug(cameraEntityId, ptz.button_prefix)}_ptz_preset`;
      const state = hass.states?.[selectEntity] as
        | { attributes?: { options?: unknown } }
        | undefined;
      const options = Array.isArray(state?.attributes?.options)
        ? (state.attributes.options as unknown[]).filter((o): o is string => typeof o === "string")
        : [];
      if (options.length === 0) {
        return Promise.reject(
          new Error(`No preset options on ${selectEntity}; cannot resolve home`)
        );
      }
      const homeOption = options.find((o) => o.toLowerCase() === "home") ?? options[0];
      return hass.callService(
        "select",
        "select_option",
        { option: homeOption },
        { entity_id: selectEntity }
      );
    }
    if (ptz.type === "frigate") {
      return hass.callService(
        "frigate",
        "ptz",
        { action: "preset", argument: "home" },
        { entity_id: cameraEntityId }
      );
    }
    if (ptz.type === "onvif") {
      // GotoPreset with preset 0 is the de-facto "home" position in ONVIF.
      return hass.callService(
        "onvif",
        "ptz",
        { move_mode: "GotoPreset", preset: 0 },
        { entity_id: cameraEntityId }
      );
    }
    return Promise.reject(new Error(`home not supported for type: ${String(ptz.type)}`));
  }

  // zoom_in / zoom_out
  if (ptz.type === "reolink") {
    // Reolink exposes button.<base>_ptz_zoom_in / _zoom_out alongside the
    // direction buttons. Stop = same shared ptz_stop button.
    if (phase === "stop") {
      const stopId =
        explicitButton(ptz, "stop") ??
        reolinkStopEntity(cameraEntityId, ptz.button_prefix, hass.states);
      if (!stopId) return Promise.resolve(undefined);
      return hass.callService("button", "press", {}, { entity_id: stopId });
    }
    const entityId =
      explicitButton(ptz, action) ??
      zoomButtonEntity(cameraEntityId, ptz.button_prefix, hass.states, action);
    return hass.callService("button", "press", {}, { entity_id: entityId });
  }
  if (ptz.type === "frigate") {
    if (phase === "stop") {
      return hass.callService("frigate", "ptz", { action: "stop" }, { entity_id: cameraEntityId });
    }
    return hass.callService(
      "frigate",
      "ptz",
      { action: "zoom", argument: action === "zoom_in" ? "in" : "out" },
      { entity_id: cameraEntityId }
    );
  }
  if (ptz.type === "onvif") {
    if (phase === "stop") {
      return hass.callService("onvif", "ptz", { move_mode: "Stop" }, { entity_id: cameraEntityId });
    }
    const onvifSpeed = resolveSpeed(ptz, globalSpeed) / PTZ_SPEED_MAX;
    return hass.callService(
      "onvif",
      "ptz",
      {
        move_mode: "ContinuousMove",
        speed: onvifSpeed,
        zoom: action === "zoom_in" ? "ZOOM_IN" : "ZOOM_OUT",
      },
      { entity_id: cameraEntityId }
    );
  }
  return Promise.reject(new Error(`zoom not supported for type: ${String(ptz.type)}`));
}
