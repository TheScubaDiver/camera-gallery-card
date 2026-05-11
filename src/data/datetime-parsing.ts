/**
 * Pure datetime parsing for filenames and folder paths.
 *
 * INVARIANT — local time everywhere.
 * `dtKey`/`dayKey` strings are local-time. ISO strings with `T` and without `Z`
 * parse as local in modern engines (ECMA-262 §21.4.1.18). All ms values are
 * built via local `getX` / `new Date(local args)` so the round-trip
 * `ms → dtKey → new Date(dtKey).getTime()` returns the same instant.
 *
 * EXPLICIT-ONLY: dates are extracted only when the user configures
 * `path_datetime_format`. Files with no matching format have no date and
 * appear in the "Other" group. The format mini-language is documented in
 * `path-format.ts`; this module owns the regex compilation primitives
 * (`buildFilenameDateRegex`, `parseRawDateFields`) the path parser builds
 * on, plus the high-level `dtMsFromSrc` / `extractDayKey` API used by
 * runtime callers.
 *
 * Locale-aware formatting (date/time strings, AM/PM detection) lives in
 * `util/locale.ts` so this module stays free of `Intl` and HA types.
 */

import {
  buildFilenameDateRegex,
  type DateField,
  type PartialDateFields,
  parseRawDateFields,
} from "./date-tokens";
import { matchPathTail, parsePathFormat, type PathFormat } from "./path-format";

// Re-exports — preserve the public API surface of `datetime-parsing.ts`.
export { buildFilenameDateRegex, parseRawDateFields };
export type { DateField, PartialDateFields };

// ---------- Types ----------

export interface DatetimeResult {
  readonly dayKey: string; // "YYYY-MM-DD" (local)
  readonly dtKey: string; // "YYYY-MM-DDTHH:mm:ss" (local, no Z)
  readonly ms: number;
}

export interface DatetimeOptions {
  /** The user's `path_datetime_format` value. Empty string means "no format
   * configured" — runtime callers receive `null` from `dtMsFromSrc` etc. */
  readonly pathFormat: string;
}

// ---------- Build & validate ----------

const pad = (n: number, len = 2): string => String(n).padStart(len, "0");

/** Builds a result from local-time components, rejecting invalid/overflow dates. */
function build(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): DatetimeResult | null {
  if (!Number.isFinite(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return null;
  }
  const d = new Date(year, month - 1, day, hour, minute, second);
  // Reject calendar overflow (Feb 31 → Mar 3, etc.).
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  const dayKey = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  const dtKey = `${dayKey}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
  return { dayKey, dtKey, ms: d.getTime() };
}

// ---------- Path-format pipeline ----------

/**
 * Parse `src` against a precompiled `PathFormat`. Returns `null` if the
 * format doesn't match, year/month/day aren't all captured, or the
 * resulting date is invalid (Feb 31 etc.). Hour/minute/second default to
 * 0 when not captured.
 */
export function parsePathFormatDatetime(src: string, fmt: PathFormat): DatetimeResult | null {
  const fields = matchPathTail(src, fmt);
  if (!fields) return null;
  if (fields.year === undefined || fields.month === undefined || fields.day === undefined) {
    return null;
  }
  return build(
    fields.year,
    fields.month,
    fields.day,
    fields.hour ?? 0,
    fields.minute ?? 0,
    fields.second ?? 0
  );
}

/**
 * Cache of compiled `PathFormat`s keyed by the raw format string. Compiling
 * the regex per call would be wasteful — a typical render iterates over
 * hundreds of items with the same format string.
 */
const PATH_FORMAT_CACHE = new Map<string, PathFormat | null>();

function getCompiled(format: string): PathFormat | null {
  if (PATH_FORMAT_CACHE.has(format)) return PATH_FORMAT_CACHE.get(format) ?? null;
  const compiled = parsePathFormat(format);
  PATH_FORMAT_CACHE.set(format, compiled);
  return compiled;
}

function tryParse(src: string, opts: DatetimeOptions): DatetimeResult | null {
  const fmt = opts.pathFormat ? getCompiled(opts.pathFormat) : null;
  if (!fmt) return null;
  return parsePathFormatDatetime(src, fmt);
}

export const dtMsFromSrc = (src: string, opts: DatetimeOptions): number | null =>
  tryParse(src, opts)?.ms ?? null;

export const extractDayKey = (src: string, opts: DatetimeOptions): string | null =>
  tryParse(src, opts)?.dayKey ?? null;

export const extractDateTimeKey = (src: string, opts: DatetimeOptions): string | null =>
  tryParse(src, opts)?.dtKey ?? null;

// ---------- ms ↔ key ----------

export function dayKeyFromMs(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dtKeyFromMs(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return (
    `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

// ---------- Aggregation ----------

/**
 * Distinct dayKeys from a list of items, sorted descending (newest first).
 * Items with no dayKey are skipped. Sort is lexicographic on the canonical
 * `"YYYY-MM-DD"` shape — equivalent to chronological order.
 */
export function uniqueDays(items: readonly { dayKey?: string | null }[]): string[] {
  const set = new Set<string>();
  for (const it of items) {
    if (it?.dayKey) set.add(it.dayKey);
  }
  return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
}
