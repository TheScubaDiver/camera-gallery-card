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
 * `folder_datetime_format` and/or `filename_datetime_format`. Files with no
 * matching format have no date and appear in the "Other" group.
 *
 * Locale-aware formatting (date/time strings, AM/PM detection) lives in
 * `util/locale.ts` so this module stays free of `Intl` and HA types.
 */

import { YEAR_2DIGIT_PIVOT } from "../const";

// ---------- Types ----------

export type DateField = "year" | "year2" | "month" | "day" | "hour" | "minute" | "second";

export interface PartialDateFields {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
}

export interface DatetimeResult {
  readonly dayKey: string; // "YYYY-MM-DD" (local)
  readonly dtKey: string; // "YYYY-MM-DDTHH:mm:ss" (local, no Z)
  readonly ms: number;
}

export interface DatetimeOptions {
  readonly folderFormat?: string;
  readonly filenameFormat?: string;
  /** Resolves `src` (which may be a media-source URI) to its parseable name. */
  readonly resolveName: (src: string) => string;
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

// ---------- Format mini-language ----------

/** Token → `(field, digit count)` pair. Single source of truth for the format mini-language. */
const TOKEN_SPECS = {
  YYYY: { field: "year", digits: 4 },
  YY: { field: "year2", digits: 2 },
  MM: { field: "month", digits: 2 },
  DD: { field: "day", digits: 2 },
  HH: { field: "hour", digits: 2 },
  mm: { field: "minute", digits: 2 },
  ss: { field: "second", digits: 2 },
} as const satisfies Record<string, { field: DateField; digits: number }>;

type TokenName = keyof typeof TOKEN_SPECS;

const TOKEN_RE = /(YYYY|YY|MM|DD|HH|mm|ss)/g;
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function buildFilenameDateRegex(
  format: string
): { regex: RegExp; fields: DateField[] } | null {
  const fmt = String(format ?? "").trim();
  if (!fmt) return null;
  const fields: DateField[] = [];
  let regexStr = "";
  let last = 0;
  for (let m = TOKEN_RE.exec(fmt); m !== null; m = TOKEN_RE.exec(fmt)) {
    const tok = m[0] as TokenName;
    const spec = TOKEN_SPECS[tok];
    regexStr += escapeRe(fmt.slice(last, m.index)) + `(\\d{${spec.digits}})`;
    fields.push(spec.field);
    last = m.index + tok.length;
  }
  regexStr += escapeRe(fmt.slice(last));
  if (!fields.length) return null;
  try {
    return { regex: new RegExp(regexStr), fields };
  } catch {
    return null;
  }
}

export function parseRawDateFields(name: string, format: string): PartialDateFields | null {
  if (!name || !format) return null;
  const built = buildFilenameDateRegex(format);
  if (!built) return null;
  const m = name.match(built.regex);
  if (!m) return null;
  const out: PartialDateFields = {};
  for (let i = 0; i < built.fields.length; i++) {
    const field = built.fields[i];
    const v = m[i + 1];
    if (!field || v === undefined) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (field === "year") out.year = n;
    else if (field === "year2") out.year = YEAR_2DIGIT_PIVOT + n;
    else out[field] = n;
  }
  return out;
}

// ---------- Path-segment helper ----------

function pathSegments(src: string): { folder: string; file: string } | null {
  const parts = String(src ?? "")
    .split("/")
    .filter(Boolean);
  if (parts.length < 2) return null;
  const folder = parts[parts.length - 2];
  const file = parts[parts.length - 1];
  if (folder === undefined || file === undefined) return null;
  return { folder, file: file.replace(/\.[^./.]+$/, "") };
}

// ---------- Explicit-format parsers ----------

export function parseFolderFileDatetime(
  src: string,
  opts: { folderFormat?: string; filenameFormat?: string }
): DatetimeResult | null {
  if (!opts.folderFormat) return null;
  const segs = pathSegments(src);
  if (!segs) return null;
  const folder = parseRawDateFields(segs.folder, opts.folderFormat);
  if (!folder) return null;
  const file = opts.filenameFormat ? parseRawDateFields(segs.file, opts.filenameFormat) : null;
  const year = folder.year ?? file?.year ?? new Date().getFullYear();
  const month = folder.month ?? file?.month;
  const day = folder.day ?? file?.day;
  if (month === undefined || day === undefined) return null;
  return build(
    year,
    month,
    day,
    file?.hour ?? folder.hour ?? 0,
    file?.minute ?? folder.minute ?? 0,
    file?.second ?? folder.second ?? 0
  );
}

export function parseDateFromFilename(src: string, opts: DatetimeOptions): DatetimeResult | null {
  if (!opts.filenameFormat) return null;
  const name = opts.resolveName(src);
  if (!name) return null;
  const f = parseRawDateFields(name, opts.filenameFormat);
  if (!f || f.year === undefined || f.month === undefined || f.day === undefined) {
    return null;
  }
  return build(f.year, f.month, f.day, f.hour, f.minute, f.second);
}

// ---------- Unified pipeline ----------

function tryParse(src: string, opts: DatetimeOptions): DatetimeResult | null {
  const folderFile = parseFolderFileDatetime(src, opts);
  if (folderFile) return folderFile;
  return parseDateFromFilename(src, opts);
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
