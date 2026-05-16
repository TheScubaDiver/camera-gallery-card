/**
 * Pure regex primitives for the `YYYY/MM/DD/HH/mm/ss` date-token mini-language.
 *
 * Lives in its own module so both `datetime-parsing.ts` and `path-format.ts`
 * can depend on it without forming a cycle.
 */

import { YEAR_2DIGIT_PIVOT } from "../const";

export type DateField =
  | "year"
  | "year2"
  | "month"
  | "day"
  | "hour"
  | "minute"
  | "second"
  | "epochSec"
  | "epochMs";

export interface PartialDateFields {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
}

/** Token → `(field, digit count)` pair. Single source of truth for the mini-language.
 *
 * `X` / `x` mirror the moment.js / dayjs / luxon convention: `X` = Unix seconds
 * (10 digits), `x` = Unix milliseconds (13 digits). Captured numbers are
 * decoded to local-time year/month/day/hour/minute/second by `fillField`, so
 * downstream merge / build code never sees an `epoch*` field. */
const TOKEN_SPECS = {
  YYYY: { field: "year", digits: 4 },
  YY: { field: "year2", digits: 2 },
  MM: { field: "month", digits: 2 },
  DD: { field: "day", digits: 2 },
  HH: { field: "hour", digits: 2 },
  mm: { field: "minute", digits: 2 },
  ss: { field: "second", digits: 2 },
  X: { field: "epochSec", digits: 10 },
  x: { field: "epochMs", digits: 13 },
} as const satisfies Record<string, { field: DateField; digits: number }>;

type TokenName = keyof typeof TOKEN_SPECS;

// Longest tokens first so the alternation greedily matches `YYYY` before `YY`.
// Single-char tokens last; left-to-right alternation order is what `TOKEN_RE.exec`
// relies on for unambiguous tokenization.
const TOKEN_RE = /(YYYY|YY|MM|DD|HH|mm|ss|X|x)/g;
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

/** Write a captured token value into `out`, decoding compound tokens (year2,
 * epochSec, epochMs) into their constituent calendar fields.
 *
 * **First-wins** on duplicates: if a target field is already set, this is a
 * no-op. That's what makes range-style formats (`X-X` for Tapo,
 * `YYYYMMDDHHmmss_YYYYMMDDHHmmss` for Reolink SD, `HH.mm.ss-HH.mm.ss` for
 * Dahua) yield the start time — the second occurrence is a structural anchor
 * that the parser still has to walk past, but its capture is discarded. */
export function fillField(out: PartialDateFields, field: DateField, raw: string): void {
  const n = Number(raw);
  if (!Number.isFinite(n)) return;
  if (field === "year") {
    if (out.year === undefined) out.year = n;
  } else if (field === "year2") {
    if (out.year === undefined) out.year = YEAR_2DIGIT_PIVOT + n;
  } else if (field === "epochSec" || field === "epochMs") {
    // Already-decoded epoch wins over later captures (range start-time).
    if (out.year !== undefined) return;
    const ms = field === "epochSec" ? n * 1000 : n;
    if (!Number.isFinite(ms)) return;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return;
    out.year = d.getFullYear();
    out.month = d.getMonth() + 1;
    out.day = d.getDate();
    out.hour = d.getHours();
    out.minute = d.getMinutes();
    out.second = d.getSeconds();
  } else if (out[field] === undefined) {
    out[field] = n;
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
    fillField(out, field, v);
  }
  return out;
}
