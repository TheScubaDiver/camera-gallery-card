/**
 * Sensor source data path. Reads `fileList` attributes off Home Assistant
 * sensor entities (typically created by FileTrack), normalizes paths to web
 * form, dedupes, pairs same-stem video/thumbnail siblings.
 *
 * Owns:
 * - `srcEntityMap: Map<src, entityId>` — drives delete-eligibility in
 *   `delete-service` and combined-mode (sensor-backed items only).
 * - `sensorPairedThumbs: Map<videoSrc, thumbSrc>` — surfaced to render so a
 *   sibling jpg can act as the poster for an mp4.
 *
 * Lifecycle mirrors {@link FavoritesStore}: card constructs once, calls
 * `setHass` on every hass setter, calls `load(config)` on every setConfig.
 *
 * Pure helpers (`toWebPath`, `toFsPath`, `parseServiceParts`) are exported
 * alongside the class — they're file-path parsing primitives reused by
 * `delete-service` without needing a client instance.
 */

import { ATTR_NAME } from "../const";
import type { CameraGalleryCardConfig } from "../config/normalize";
import type { CardItem } from "../types/media-item";
import type { HomeAssistant } from "../types/hass";
import { dedupeByRelPath, pairSensorItems } from "./pairing";

/** `(src) => CardItem` enrichment hook. The card injects a closure that
 * reads its datetime-parsing helpers; the client stays framework-free. */
export type Enrich = (src: string) => CardItem;

const DEFAULT_ENRICH: Enrich = (src) => ({ src });

export interface SensorSourceClientOptions {
  /** Fired after every successful `getItems()` call so the card can `requestUpdate()`. */
  onChange?: (() => void) | undefined;
}

/**
 * Convert `/config/www/foo.mp4` (HA filesystem) ↔ `/local/foo.mp4` (web).
 * Sensors typically emit either; the renderer wants the `/local/` form so
 * `<img src>` / `<video src>` resolve against HA's static asset host.
 *
 * Returns `""` for falsy input. URI-decoding failures fall through to the
 * raw path (audit A2) — better to render a path with `%ZZ` than to silently
 * drop the item; downstream `<img>` fetches will surface the URL error.
 */
export function toWebPath(p: unknown): string {
  if (!p) return "";
  const v = String(p).trim();
  if (v.startsWith("/config/www/")) {
    return "/local/" + v.slice("/config/www/".length);
  }
  if (v === "/config/www") return "/local";
  return v;
}

/**
 * Convert a web URL or `/local/` path into the HA filesystem path consumed
 * by the user-configured `delete_service` (`shell_command.cgc_delete` etc.).
 *
 * Returns `""` if the path is outside `/local/` / `/config/www/` — that's
 * the prefix gate the delete service relies on.
 */
export function toFsPath(src: unknown): string {
  if (!src) return "";
  let clean = String(src).trim();
  clean = (clean.split("?")[0] ?? "").split("#")[0] ?? "";
  try {
    if (clean.startsWith("http://") || clean.startsWith("https://")) {
      clean = new URL(clean).pathname;
    }
  } catch {
    // Malformed URL — fall through to raw path.
  }
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // URIError on malformed sequences (audit A2) — keep `clean` as the
    // pre-decode value rather than dropping the item.
  }
  if (clean.startsWith("/local/")) {
    return "/config/www/" + clean.slice("/local/".length);
  }
  if (clean.startsWith("/config/www/")) return clean;
  return "";
}

/**
 * Split a `domain.service` string into `{ domain, service }` parts.
 * Returns `null` if either side is empty (caller treats absence as
 * "delete unavailable" — `_thumbCanDelete` falls back to `false`).
 *
 * The struct (`structs.ts`) already enforces the `domain.service` regex so
 * post-normalize values are well-shaped; this helper stays defensive
 * because the editor reads pre-normalize YAML and may pass an unvalidated
 * string from in-progress edits.
 */
export function parseServiceParts(deleteService: unknown): {
  domain: string;
  service: string;
} | null {
  if (typeof deleteService !== "string") return null;
  const [domain, service] = deleteService.split(".");
  if (!domain || !service) return null;
  return { domain, service };
}

/**
 * Stateful sensor-source client. Card wires it as:
 *
 *     this._sensorClient = new SensorSourceClient({ onChange: () => this.requestUpdate() });
 *     // setHass on every hass setter, load() on every setConfig
 */
export class SensorSourceClient {
  private _hass: HomeAssistant | null = null;
  private _config: CameraGalleryCardConfig | null = null;
  private _srcEntityMap: Map<string, string> = new Map();
  private _sensorPairedThumbs: Map<string, string> = new Map();
  private readonly _onChange?: (() => void) | undefined;

  constructor(opts: SensorSourceClientOptions = {}) {
    this._onChange = opts.onChange;
  }

  /** Update the cached `hass` reference. Cheap; called from every hass setter. */
  setHass(hass: HomeAssistant | null): void {
    this._hass = hass;
  }

  /** Update the cached config. The internal `srcEntityMap` is rebuilt on every
   * `getItems()` call, so source-mode flips don't leak stale entries. */
  load(config: CameraGalleryCardConfig | null): void {
    this._config = config;
  }

  /**
   * The configured sensor entity list. Filters falsy entries (audit A5)
   * so `entities: ["sensor.a", null]` no longer reads `hass.states["null"]`.
   */
  getEntityIds(): readonly string[] {
    const raw = this._config?.entities;
    if (!Array.isArray(raw)) return [];
    return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
  }

  /**
   * Read-only view of the source → entity map. Combined-source and
   * delete-service consume this; mutation lives inside this class.
   */
  getSrcEntityMap(): ReadonlyMap<string, string> {
    return this._srcEntityMap;
  }

  /** Read-only view of the videoSrc → thumbnailSrc map. */
  getSensorPairedThumbs(): ReadonlyMap<string, string> {
    return this._sensorPairedThumbs;
  }

  /**
   * Build `CardItem[]` from the configured sensor entities. Side effect:
   * unconditionally rebuilds `srcEntityMap` and `sensorPairedThumbs` — so
   * a source-mode flip never sees stale entries from a previous call.
   *
   * `enrich` is injected by the card (closes over `_resolveItemMs` so the
   * client can stay framework-free).
   */
  getItems(enrich: Enrich = DEFAULT_ENRICH): CardItem[] {
    const entities = this.getEntityIds();
    const list: string[] = [];
    this._srcEntityMap = new Map();

    for (const entityId of entities) {
      const st = this._hass?.states?.[entityId];
      const raw = st?.attributes?.[ATTR_NAME];
      const part = parseFileList(raw);
      for (const src of part) {
        if (!this._srcEntityMap.has(src)) this._srcEntityMap.set(src, entityId);
      }
      list.push(...part);
    }

    const enriched = dedupeByRelPath(list).map((src) => enrich(String(src)));
    const { items: paired, pairedThumbs } = pairSensorItems(enriched);
    this._sensorPairedThumbs = pairedThumbs;
    if (this._onChange) this._onChange();
    return paired;
  }
}

/**
 * Parse a sensor's `fileList` attribute into normalized web paths.
 *
 * Sensor sources may emit:
 *   - a string array (canonical)
 *   - a JSON-stringified array (FileTrack legacy)
 *   - a single JSON-stringified path (rare)
 *
 * Returns `string[]` of `/local/`-prefixed web paths. Falsy input → `[]`.
 */
function parseFileList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => toWebPath(x)).filter((s): s is string => Boolean(s));
  }
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => toWebPath(x)).filter((s): s is string => Boolean(s));
      }
      return [toWebPath(raw)].filter((s): s is string => Boolean(s));
    } catch {
      return [toWebPath(raw)].filter((s): s is string => Boolean(s));
    }
  }
  return [];
}
