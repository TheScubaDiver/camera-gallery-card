/**
 * Pure regex primitives for the `YYYY/MM/DD/HH/mm/ss` date-token mini-language.
 *
 * Lives in its own module so both `datetime-parsing.ts` and `path-format.ts`
 * can depend on it without forming a cycle.
 */

import { YEAR_2DIGIT_PIVOT } from "../const";

export type DateField = "year" | "year2" | "month" | "day" | "hour" | "minute" | "second";

export interface PartialDateFields {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
}

/** Token → `(field, digit count)` pair. Single source of truth for the mini-language. */
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
