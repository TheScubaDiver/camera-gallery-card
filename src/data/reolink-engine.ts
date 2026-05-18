/**
 * Reolink-specific media-source engine.
 *
 * A dedicated walker that knows Reolink's URI shape and title format,
 * bypassing the generic `path_datetime_format`-driven calendar walker
 * entirely. Reolink users get zero-config gallery support — just point
 * `media_sources` at a CAM or RES URI and the engine does the rest.
 *
 * URI hierarchy (pipe-delimited identifiers, not path components):
 *
 *   media-source://reolink/CAM|<configEntry>|<channel>
 *     └─ media-source://reolink/RES|<configEntry>|<channel>|<main|sub>
 *          └─ media-source://reolink/DAY|<configEntry>|<channel>|<res>|<YYYY>|<M>|<D>
 *               └─ media-source://reolink/FILE|<configEntry>|<basename>.mp4|<start>|<end>
 *
 * Title formats:
 *   - DAY folders:  `"2026/4/9"`  (unpadded month/day)
 *   - FILE clips:   `"14:24:00 0:01:08 Motion Person Doorbell"`
 *                    └─time─┘ └─dur─┘ └─detection labels─┘
 *
 * Playback path: HA's Reolink integration resolves FILE content-ids to
 * a `/api/reolink/...` MP4 proxy URL via `media_source/resolve_media`
 * for .mp4 / NVR / hub firmwares. RTMP-firmware cameras still get an
 * HLS playlist — the caller picks the player element by mime_type.
 */

import type { CalendarEntry, Calendar } from "./media-tree";
import type { MsItem } from "./media-walker";
import type { MediaSourceItem } from "../types/media-source";

const REOLINK_PREFIX = "media-source://reolink/";
const CAM_RE = /^media-source:\/\/reolink\/CAM\|([^|]+)\|(\d+)$/;
const DAY_TITLE_RE = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
const FILE_TIME_RE = /^(\d{1,2}):(\d{2}):(\d{2})\b/;

/** `true` when the id is any Reolink media-source URI. */
export function isReolinkRoot(id: string | null | undefined): boolean {
  if (id === null || id === undefined) return false;
  return String(id).toLowerCase().startsWith(REOLINK_PREFIX);
}

/**
 * Promote a CAM URI to a RES URI using the requested resolution. RES and
 * deeper URIs pass through unchanged. Returns `null` when the input is
 * malformed (so the caller can surface a config error rather than walk
 * a garbage root).
 *
 * `resolution` defaults to "main" (high-res stream); `low` maps to "sub".
 */
export function normalizeReolinkRoot(
  id: string,
  resolution: "main" | "sub" = "main"
): string | null {
  if (!isReolinkRoot(id)) return null;
  const camMatch = CAM_RE.exec(id);
  if (camMatch) {
    const [, configEntry, channel] = camMatch;
    return `media-source://reolink/RES|${configEntry}|${channel}|${resolution}`;
  }
  // Already at RES level or deeper — pass through. We don't downgrade
  // explicit RES/DAY/FILE URIs even if `resolution` disagrees; the user
  // who hand-wrote a deeper URI knows what they want.
  return id;
}

/** Stateless browse function — same shape as media-tree's `BrowseFn`. */
export type BrowseFn = (mediaId: string) => Promise<MediaSourceItem | null>;

/**
 * Parse a DAY folder title `"YYYY/M/D"` into `{year, month, day}`. Returns
 * `null` on malformed input. Unpadded month/day are accepted by design.
 */
export function parseDayTitle(title: string): { year: number; month: number; day: number } | null {
  const m = DAY_TITLE_RE.exec(String(title ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!isCalendarDate(year, month, day)) return null;
  return { year, month, day };
}

/**
 * Parse a Reolink FILE title's leading time token:
 *   `"14:24:00 0:01:08 Motion Person Doorbell"`
 *    └─time─┘ └ ignored tail (duration + detection labels) ┘
 *
 * Returns `{hour, minute, second}` when the title starts with `HH:mm:ss`,
 * `null` otherwise. We deliberately ignore the duration and detection
 * labels in the tail: neither is consumed downstream right now, and
 * surfacing them would be dead state. If the gallery ever grows a
 * "filter by object" feature for Reolink, this is the spot to re-extend.
 */
export function parseFileTitle(
  title: string
): { hour: number; minute: number; second: number } | null {
  const raw = String(title ?? "").trim();
  if (!raw) return null;
  const tokens = raw.split(/\s+/);
  const timeTok = tokens[0];
  const m = timeTok ? FILE_TIME_RE.exec(timeTok) : null;
  if (!m) return null;
  return {
    hour: Number(m[1]),
    minute: Number(m[2]),
    second: Number(m[3]),
  };
}

/**
 * Build a `YYYY-MM-DD` dayKey from numeric fields. Validates calendar
 * shape (Feb 31 → null). Inlined to keep this module dependency-free.
 */
function isCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(year, month - 1, day);
  return probe.getFullYear() === year && probe.getMonth() + 1 === month && probe.getDate() === day;
}

function formatDayKey(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/**
 * Phase A: discover available days under one or more Reolink roots
 * (CAM or RES URIs). Browses RES once per root, walks its children
 * (DAY folders), records each day's URI. Does NOT browse day folders
 * — files are loaded lazily on user navigation via `loadReolinkDay`.
 */
export async function discoverReolink(
  roots: readonly string[],
  browse: BrowseFn,
  opts: {
    resolution?: "main" | "sub";
    isStale?: () => boolean;
  } = {}
): Promise<Calendar> {
  const resolution = opts.resolution ?? "main";
  const isStale = opts.isStale ?? (() => false);
  const byDay = new Map<string, CalendarEntry[]>();

  for (const raw of roots) {
    if (isStale()) break;
    const root = normalizeReolinkRoot(raw, resolution);
    if (!root) continue;
    const node = await browse(root);
    if (!node || isStale()) continue;
    const children = Array.isArray(node.children) ? node.children : [];
    for (const ch of children) {
      if (!ch?.media_content_id) continue;
      const title = String(ch.title ?? "");
      const parsed = parseDayTitle(title);
      if (!parsed) continue;
      const key = formatDayKey(parsed.year, parsed.month, parsed.day);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push({
        leafId: String(ch.media_content_id),
        leafName: title,
        dayKey: key,
      });
    }
  }

  const days = Array.from(byDay.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return { byDay, days };
}

/**
 * Phase B: load files for one day. Browses every DAY-leaf registered
 * for `dayKey`, extracts the time from each file's title, and combines
 * it with the parent day's year/month/day to yield a complete dtMs.
 */
export async function loadReolinkDay(
  calendar: Calendar,
  dayKey: string,
  browse: BrowseFn,
  opts: { isStale?: () => boolean } = {}
): Promise<MsItem[]> {
  const isStale = opts.isStale ?? (() => false);
  const entries = calendar.byDay.get(dayKey) ?? [];
  if (entries.length === 0) return [];
  const out: MsItem[] = [];
  const [yStr, mStr, dStr] = dayKey.split("-");
  const baseYear = Number(yStr);
  const baseMonth = Number(mStr);
  const baseDay = Number(dStr);

  for (const entry of entries) {
    if (isStale()) break;
    const node = await browse(entry.leafId);
    if (!node || isStale()) continue;
    const children = Array.isArray(node.children) ? node.children : [];
    for (const ch of children) {
      if (!ch?.media_content_id) continue;
      const title = String(ch.title ?? "");
      const parsed = parseFileTitle(title);
      const dtMs = parsed
        ? new Date(
            baseYear,
            baseMonth - 1,
            baseDay,
            parsed.hour,
            parsed.minute,
            parsed.second
          ).getTime()
        : 0;
      const item: MsItem = {
        id: String(ch.media_content_id),
        title,
        cls: String(ch.media_class ?? "video"),
        mime: String(ch.media_content_type ?? "video/mp4"),
        thumb: String(ch.thumbnail ?? ""),
        ...(dtMs ? { dtMs } : {}),
      };
      out.push(item);
    }
  }

  // Newest-first within the day.
  out.sort((a, b) => (b.dtMs ?? 0) - (a.dtMs ?? 0));
  return out;
}
