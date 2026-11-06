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
 *
 * Caveat: Frigate **recordings** roots (e.g. `media-source://frigate/<inst>/recordings/...`)
 * don't carry event-ids in their URIs — items there have no auto-extractable
 * timestamp. Treat those as needing a `path_datetime_format` even though
 * they technically point at Frigate. See {@link isFrigateRecordingsRoot}.
 */
export function hasFrigateConfig(config: {
  frigate_url?: string | null | undefined;
  media_sources?: readonly string[] | null | undefined;
}): boolean {
  if ((config.frigate_url ?? "").trim()) return true;
  const roots = config.media_sources ?? [];
  return roots.some((r) => isFrigateRoot(r) && !isFrigateRecordingsRoot(r));
}

/** `true` for Frigate recordings roots whose URIs have no event-id. These
 * need `path_datetime_format` to extract per-item timestamps. */
export function isFrigateRecordingsRoot(uri: string | null | undefined): boolean {
  const s = String(uri ?? "");
  if (!isFrigateRoot(s)) return false;
  return /\/recordings(\/|$)/.test(s);
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

/**
 * Extract the raw event id (`<unix_epoch>.<micros>-<random>`) from a Frigate
 * media-source URI or REST URL. This is the form Frigate's
 * `DELETE /api/events/<id>` endpoint expects.
 */
export function frigateEventIdFromSrc(src: string | null | undefined): string | null {
  const m = String(src ?? "").match(
    /(?:^|[/_.-])(\d{9,11}(?:\.\d+)?-[a-z0-9]+)(?:\.[a-z0-9]+)?(?:[/?#]|$)/i
  );
  return m?.[1] ?? null;
}

// ---------- REST API ----------

/** Subset of fields the card consumes from a Frigate API event. */
export interface FrigateEvent {
  readonly id?: string | null;
  readonly start_time?: number | null;
  readonly end_time?: number | null;
  readonly label?: string | null;
  readonly camera?: string | null;
  /** Highest detection confidence reached during the event (0–1).
   * Used by the cluster pass to pick the representative event. */
  readonly top_score?: number | null;
  readonly score?: number | null;
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
 * Join a camera/label filter list into the comma-separated form Frigate's
 * REST API expects (`cameras=a,b` / `labels=x,y`). Empty/missing input
 * means "all" — Frigate's own default — so we omit the param entirely
 * rather than sending an empty string.
 */
function joinFilterParam(values: readonly string[] | null | undefined): string {
  const cleaned = (values ?? []).map((v) => String(v ?? "").trim()).filter((v) => v.length > 0);
  return cleaned.join(",");
}

/**
 * Fetch the Frigate REST `/api/events?limit=…` endpoint. Returns null on any
 * network/parse failure (timeout, non-2xx, non-array body) — caller should
 * treat null as "no Frigate items" and fall back to the media-source walk.
 *
 * `cameras`/`labels` scope the query server-side via Frigate's own
 * `cameras=`/`labels=` comma-separated filter params — omitted (or empty)
 * means "all cameras"/"all labels", matching Frigate's default.
 */
export async function fetchFrigateEvents(
  base: string,
  limit: number,
  opts: { timeoutMs?: number; cameras?: readonly string[]; labels?: readonly string[] } = {}
): Promise<FrigateEvent[] | null> {
  const trimmedBase = String(base ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!trimmedBase) return null;
  const timeoutMs = opts.timeoutMs ?? FRIGATE_API_REQUEST_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    const cameras = joinFilterParam(opts.cameras);
    const labels = joinFilterParam(opts.labels);
    if (cameras) params.set("cameras", cameras);
    if (labels) params.set("labels", labels);
    const resp = await fetch(`${trimmedBase}/api/events?${params.toString()}`, {
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
export function mapFrigateEventToItem(
  ev: FrigateEvent,
  base: string,
  opts?: { bbox?: boolean }
): MappedFrigateItem | null {
  const id = String(ev?.id || "");
  if (!id) return null;
  const trimmedBase = String(base ?? "")
    .trim()
    .replace(/\/+$/, "");
  const clipUrl = `${trimmedBase}/api/events/${id}/clip.mp4`;
  // When `bbox` is enabled, use Frigate's full snapshot endpoint with
  // bbox=1 and a height cap (server-side resize). The thumbnail endpoint
  // bakes no bbox even if `snapshots.bounding_box: true` is set in Frigate.
  const thumbUrl = opts?.bbox
    ? `${trimmedBase}/api/events/${id}/snapshot.jpg?bbox=1&height=200`
    : `${trimmedBase}/api/events/${id}/thumbnail.jpg`;
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

/**
 * Fetch Frigate events via the Frigate-hass-integration's
 * `frigate/events/get` WebSocket command. Same payload shape as the REST
 * endpoint, but routed through HA — so it works regardless of CORS and
 * without needing a `frigate_url` in the card config.
 *
 * `cameras`/`labels` are passed straight through to the WS command's own
 * `cameras`/`labels` filter arrays (see the Frigate HA integration's
 * `ws_api.py`) — omitted/empty means "all", same as the REST path.
 *
 * Returns null on any failure (no instance id, integration missing, transport
 * error). Caller treats null as "no events" and falls back to the REST/walk path.
 */
interface HassLike {
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
}
export async function fetchFrigateEventsViaWs(
  hass: HassLike | null | undefined,
  instanceId: string | null | undefined,
  limit?: number,
  opts: { cameras?: readonly string[]; labels?: readonly string[] } = {}
): Promise<FrigateEvent[] | null> {
  if (!hass || !instanceId) return null;
  try {
    const msg: Record<string, unknown> = {
      type: "frigate/events/get",
      instance_id: instanceId,
      has_clip: true,
    };
    if (typeof limit === "number" && limit > 0) msg["limit"] = limit;
    const cameras = (opts.cameras ?? []).map((c) => String(c ?? "").trim()).filter(Boolean);
    const labels = (opts.labels ?? []).map((l) => String(l ?? "").trim()).filter(Boolean);
    if (cameras.length) msg["cameras"] = cameras;
    if (labels.length) msg["labels"] = labels;
    const result = await hass.callWS<unknown>(msg);
    let parsed: unknown = result;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return null;
      }
    }
    if (Array.isArray(parsed)) return parsed as FrigateEvent[];
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract the Frigate instance id from a media-source URI like
 * `media-source://frigate/<inst>/event-search/clips`. Returns null when the
 * URI isn't a Frigate root.
 */
export function frigateInstanceIdFromRoot(uri: string | null | undefined): string | null {
  const s = String(uri ?? "");
  const m = s.match(/^media-source:\/\/frigate\/([^/]+)/);
  return m?.[1] ?? null;
}
