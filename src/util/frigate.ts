/**
 * Frigate-specific source helpers.
 *
 * Source-aware enrichment for items produced by the Frigate integration.
 * This is NOT generic auto-detection — every helper here is gated on a
 * documented Frigate contract (event-id format, media-source URI shape).
 */

/** Canonical media-source URI prefix used by the Frigate HA integration. */
export const FRIGATE_URI_PREFIX = "media-source://frigate";

/** Frigate's media-source root for the snapshot library. */
export const FRIGATE_SNAPSHOTS_ROOT = `${FRIGATE_URI_PREFIX}/frigate/event-search/snapshots`;

/**
 * Sanity range used when interpreting a numeric run as a Unix epoch:
 * 2000-01-01 (946684800) .. 2100-01-01 (4102444800). Anything outside
 * this is rejected as a regex false-positive.
 */
const MIN_REASONABLE_EPOCH_SEC = 946684800;
const MAX_REASONABLE_EPOCH_SEC = 4102444800;

const FRIGATE_API_REQUEST_TIMEOUT_MS = 15000;

/** True when `uri` is the Frigate media-source root (or a path under it). */
export function isFrigateRoot(uri: string | null | undefined): boolean {
  const s = String(uri ?? "");
  return s.includes(`${FRIGATE_URI_PREFIX}/`) || s === FRIGATE_URI_PREFIX;
}

/**
 * True when the card config wires up Frigate in any form — either the REST
 * API (`frigate_url`) or a media-source root pointing at the Frigate
 * integration. Use this when deciding whether path-based datetime formats
 * are required: Frigate items get their time from event-ids, so the format
 * fields are optional in Frigate-only setups.
 */
export function hasFrigateConfig(config: {
  frigate_url?: string | null | undefined;
  media_sources?: readonly string[] | null | undefined;
}): boolean {
  if ((config.frigate_url ?? "").trim()) return true;
  const roots = config.media_sources ?? [];
  return roots.some(isFrigateRoot);
}

/**
 * Extract the start-time epoch (ms) from a Frigate-shaped URI/URL.
 *
 * Frigate event IDs are `<unix_epoch_with_microseconds>-<random>`, e.g.
 *   "1741975616.16659-zgolc3"
 * which appears in both REST URLs (`.../api/events/<id>/clip.mp4`) and
 * media-source URIs (`media-source://frigate/<inst>/event/clips/<cam>/<id>`).
 *
 * Returns null when no Frigate-shaped event id is present, or when the
 * epoch is outside the sanity range.
 */
export function frigateEventIdMs(src: string): number | null {
  const m = String(src ?? "").match(
    /(?:^|[/_.-])(\d{9,11}(?:\.\d+)?)-[a-z0-9]+(?:\.[a-z0-9]+)?(?:[/?#]|$)/i
  );
  if (!m?.[1]) return null;
  const sec = Number.parseFloat(m[1]);
  if (!Number.isFinite(sec)) return null;
  if (sec < MIN_REASONABLE_EPOCH_SEC || sec > MAX_REASONABLE_EPOCH_SEC) return null;
  return sec * 1000;
}

// ---------- REST API ----------

/** Subset of fields the card consumes from a Frigate API event. */
export interface FrigateEvent {
  readonly id?: string | null;
  readonly start_time?: number | null;
  readonly label?: string | null;
  readonly camera?: string | null;
}

/** The card-shaped media item built from a Frigate event. */
export interface FrigateClipItem {
  readonly cls: "video";
  readonly id: string;
  readonly mime: "video/mp4";
  readonly title: string;
  readonly thumb: string;
  readonly dtMs?: number;
}

export interface MappedFrigateItem {
  readonly item: FrigateClipItem;
  /** The clip URL the caller should register in its url cache for `item.id`. */
  readonly clipUrl: string;
}

/**
 * Fetch the Frigate REST `/api/events?limit=…` endpoint. Returns null on any
 * network/parse failure (timeout, non-2xx, non-array body) — caller should
 * treat null as "no Frigate items" and fall back to the media-source walk.
 */
export async function fetchFrigateEvents(
  base: string,
  limit: number,
  opts: { timeoutMs?: number } = {}
): Promise<FrigateEvent[] | null> {
  const trimmedBase = String(base ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!trimmedBase) return null;
  const timeoutMs = opts.timeoutMs ?? FRIGATE_API_REQUEST_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${trimmedBase}/api/events?limit=${limit}`, {
      signal: ctrl.signal,
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as unknown;
    return Array.isArray(body) ? (body as FrigateEvent[]) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convert one Frigate API event into the card's media item shape, plus the
 * clip URL the caller should register in its url cache. Returns null when
 * the event has no id (defensive — Frigate always supplies one).
 */
export function mapFrigateEventToItem(ev: FrigateEvent, base: string): MappedFrigateItem | null {
  const id = String(ev?.id || "");
  if (!id) return null;
  const trimmedBase = String(base ?? "")
    .trim()
    .replace(/\/+$/, "");
  const clipUrl = `${trimmedBase}/api/events/${id}/clip.mp4`;
  const thumbUrl = `${trimmedBase}/api/events/${id}/thumbnail.jpg`;
  const startSec = Number(ev.start_time);
  const ts = Number.isFinite(startSec) && startSec > 0 ? Math.round(startSec * 1000) : 0;
  const label = String(ev.label || "");
  const camera = String(ev.camera || "");
  const title = [ts ? new Date(ts).toLocaleString() : "", camera, label]
    .filter(Boolean)
    .join(" — ");
  const item: FrigateClipItem = {
    cls: "video",
    id,
    mime: "video/mp4",
    title,
    thumb: thumbUrl,
    // ts === 0 only when ev.start_time is missing/falsy — leave dtMs absent
    // so the gallery falls back to path parsing instead of pinning to 1970.
    ...(ts ? { dtMs: ts } : {}),
  };
  return { item, clipUrl };
}
