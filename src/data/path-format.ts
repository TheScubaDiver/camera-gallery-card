/**
 * `path_datetime_format` parser. The single source of truth for how the
 * card derives a date+time from a media-source path.
 *
 * The format is split on `/` into segments. Each segment is compiled to its
 * own anchored regex via the same token mini-language used elsewhere
 * (`YYYY`/`MM`/`DD`/`HH`/`mm`/`ss`). Three real-world layouts fall out of
 * one config knob:
 *
 *   - Layout A (flat folder): one segment, e.g. `RLC_YYYYMMDD_HHmmss.mp4`
 *   - Layout B (date-named folder + files): two segments, e.g.
 *     `YYYYMMDD/HHmmss` (or one segment if the leaf folder name is the date
 *     and filenames carry no time)
 *   - Layout C (nested): N segments, e.g. `YYYY/MM/DD/HHmmss`
 *
 * `directoryDepth` is the number of directory levels the calendar walker
 * must descend before reaching files. `leafIsFile` distinguishes "last
 * segment matches a filename" from "last segment matches the leaf folder
 * name". Both are cheap heuristics — last segment contains a time token
 * (HH/mm/ss) or a literal extension (`.mp4`/`.jpg`/…) ⇒ it's a file.
 */

import { YEAR_2DIGIT_PIVOT } from "../const";
import { buildFilenameDateRegex, type DateField, type PartialDateFields } from "./date-tokens";

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const TIME_TOKEN_RE = /HH|mm|ss/;
const FILE_EXT_RE = /\.[a-z0-9]{2,5}$/i;

/** A single `/`-separated segment of the format, compiled to a regex. */
export interface PathSegmentSpec {
  /** Regex matching this segment's path component. Directory segments are
   * anchored; the leaf-filename segment is unanchored when the format
   * doesn't carry a literal extension, matching legacy substring semantics. */
  readonly regex: RegExp;
  /** `DateField`s captured by the regex, in capture-group order. Empty for pure-literal segments. */
  readonly fields: readonly DateField[];
  /** The original format text for this segment (debugging / error messages). */
  readonly raw: string;
}

/** Compiled `path_datetime_format`. Pure value — no `hass` or runtime state. */
export interface PathFormat {
  readonly segments: readonly PathSegmentSpec[];
  /** Levels the calendar walker descends. `segments.length - 1` when leaf is file, else `segments.length`. */
  readonly directoryDepth: number;
  /** `true` when the last segment matches a filename (Phase B browses leaf dirs to enumerate files). */
  readonly leafIsFile: boolean;
  /** `true` when the format includes a literal extension on the leaf filename (e.g. `.mp4`).
   * When false, the leaf segment matches as a substring of the filename stem (legacy behaviour). */
  readonly leafHasExtension: boolean;
  /** `true` when the single-segment format contains a literal `/` (from `\/` escape).
   * Such formats (UniFi-style titles like `MM\/DD\/YY HH:mm:ss`) match against
   * the full input string rather than the last `/`-separated component. */
  readonly leafSpansSlashes: boolean;
}

/** Build a per-segment regex. Anchored unless `unanchored` is set.
 *
 * For unanchored leaf segments we wrap the body in `(?<!\d)…(?!\d)` so a
 * format like `YYYYMMDDHHmmss` (14 contiguous digits) doesn't accidentally
 * pick up a different 14-digit run when the filename has multiple numeric
 * groups (e.g. `front_99991231235959_20260502050106.mp4` would otherwise
 * yield year 9999 from the leftmost match). The boundary lookarounds force
 * the digit run to be flanked by non-digits or string boundaries — i.e.
 * the natural place a date token would sit. */
function compileSegment(raw: string, unanchored: boolean): PathSegmentSpec | null {
  if (raw.length === 0) return null;
  const built = buildFilenameDateRegex(raw);
  if (built) {
    try {
      const source = unanchored
        ? `(?<!\\d)${built.regex.source}(?!\\d)`
        : `^${built.regex.source}$`;
      return { regex: new RegExp(source, built.regex.flags), fields: built.fields, raw };
    } catch {
      return null;
    }
  }
  // Pure-literal segment (no date tokens). Always anchored — there's nothing to capture.
  try {
    return { regex: new RegExp(`^${escapeRe(raw)}$`), fields: [], raw };
  } catch {
    return null;
  }
}

/** Heuristic: a segment is a filename if it carries time tokens or a literal extension. */
function segmentLooksLikeFile(raw: string): boolean {
  return TIME_TOKEN_RE.test(raw) || FILE_EXT_RE.test(raw);
}

/** Placeholder for escaped slashes during segment splitting. NUL byte is
 * not a realistic user-input character. Replaced back to `/` once split. */
const ESC_SLASH_PLACEHOLDER = "\x00";

/**
 * Parse a `path_datetime_format` string into a compiled `PathFormat`.
 * Returns `null` on malformed input (empty, no segments resolve, regex
 * compile fails). Trims leading/trailing slashes; collapses internal `//`.
 *
 * Supports `\/` as an escape for a literal slash inside a segment — used
 * by title-style formats like `MM\/DD\/YY HH:mm:ss` (UniFi Protect)
 * where the date contains `/` characters that must NOT split the format.
 */
export function parsePathFormat(format: string | null | undefined): PathFormat | null {
  const trimmed = String(format ?? "").trim();
  if (!trimmed) return null;
  // Protect `\/` from the collapse/split logic, then restore after.
  const protectedStr = trimmed.replace(/\\\//g, ESC_SLASH_PLACEHOLDER);
  const cleaned = protectedStr
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!cleaned) return null;
  const rawSegs = cleaned.split("/").map((s) => s.split(ESC_SLASH_PLACEHOLDER).join("/"));
  const lastSegHasLiteralSlash = (rawSegs[rawSegs.length - 1] ?? "").includes("/");
  if (rawSegs.length === 0) return null;
  const lastRaw = rawSegs[rawSegs.length - 1] ?? "";
  const leafIsFile = segmentLooksLikeFile(lastRaw);
  const leafHasExtension = leafIsFile && FILE_EXT_RE.test(lastRaw);
  const segs: PathSegmentSpec[] = [];
  for (let i = 0; i < rawSegs.length; i++) {
    const raw = rawSegs[i] ?? "";
    // Leaf-filename segments without a literal extension match as substring
    // (legacy behaviour: `YYYYMMDDHHmmss` matches inside `RLC_…_20260502050106.mp4`).
    const isLeaf = i === rawSegs.length - 1;
    const unanchored = isLeaf && leafIsFile && !leafHasExtension;
    const compiled = compileSegment(raw, unanchored);
    if (!compiled) return null;
    segs.push(compiled);
  }
  const directoryDepth = leafIsFile ? segs.length - 1 : segs.length;
  const leafSpansSlashes = lastSegHasLiteralSlash;
  return { segments: segs, directoryDepth, leafIsFile, leafHasExtension, leafSpansSlashes };
}

/**
 * Match `name` against a single segment spec. Returns the captured partial
 * fields, or `null` on no match.
 */
function matchSegment(name: string, seg: PathSegmentSpec): PartialDateFields | null {
  const m = name.match(seg.regex);
  if (!m) return null;
  const out: PartialDateFields = {};
  for (let i = 0; i < seg.fields.length; i++) {
    const field = seg.fields[i];
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

/** Merge `b` over `a` (later wins on overlap). Omits absent fields entirely
 * (rather than setting them to `undefined`) so the result conforms to
 * `PartialDateFields` under `exactOptionalPropertyTypes`. */
function merge(a: PartialDateFields, b: PartialDateFields): PartialDateFields {
  const out: PartialDateFields = {};
  const year = b.year ?? a.year;
  const month = b.month ?? a.month;
  const day = b.day ?? a.day;
  const hour = b.hour ?? a.hour;
  const minute = b.minute ?? a.minute;
  const second = b.second ?? a.second;
  if (year !== undefined) out.year = year;
  if (month !== undefined) out.month = month;
  if (day !== undefined) out.day = day;
  if (hour !== undefined) out.hour = hour;
  if (minute !== undefined) out.minute = minute;
  if (second !== undefined) out.second = second;
  return out;
}

/**
 * Take the last `n` non-empty `/`-separated components of a media-source URI
 * (or any path). Strips the `media-source://` prefix. Returns the components
 * in their original order, oldest-first.
 */
export function pathTailSegments(src: string, n: number): string[] {
  const cleaned = String(src ?? "").replace(/^media-source:\/\//, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (n >= parts.length) return parts;
  return parts.slice(parts.length - n);
}

/**
 * Match a path against the format by anchoring at the path's last segment
 * and walking back through `format.segments` from the end. Returns the
 * accumulated partial fields, or `null` if any segment fails to match.
 *
 * When `fmt.leafIsFile` is false, the format describes only directory
 * levels and the path's actual last component is the file (which the
 * format doesn't describe). In that case the path tail is computed
 * *excluding* the filename, so the format anchors at the deepest
 * directory.
 */
export function matchPathTail(path: string, fmt: PathFormat): PartialDateFields | null {
  const cleaned = String(path ?? "").replace(/^media-source:\/\//, "");
  // Title-style single-segment formats (`\/` escapes restore `/` inside
  // the segment): match the regex against the full input rather than
  // splitting on `/`. The whole string is the "leaf".
  if (fmt.segments.length === 1 && fmt.leafSpansSlashes) {
    const seg = fmt.segments[0];
    if (!seg) return null;
    return matchSegment(cleaned, seg);
  }
  const allParts = cleaned.split("/").filter(Boolean);
  // For directory-only formats, drop the file basename so the format
  // anchors against the leaf directory rather than the file.
  const parts = fmt.leafIsFile ? allParts : allParts.slice(0, -1);
  if (parts.length < fmt.segments.length) return null;
  const tail = parts.slice(parts.length - fmt.segments.length);
  let acc: PartialDateFields = {};
  for (let i = 0; i < fmt.segments.length; i++) {
    const seg = fmt.segments[i];
    const part = tail[i];
    if (!seg || part === undefined) return null;
    const matched = matchSegment(part, seg);
    if (!matched) return null;
    acc = merge(acc, matched);
  }
  return acc;
}

/**
 * Match a single directory name against the segment at `depth` (0-indexed
 * from the root). Used by the calendar walker: at each descent step, only
 * directories matching the corresponding format segment are visited.
 *
 * Returns the partial fields contributed by *that* segment (caller
 * accumulates across the descent path).
 */
export function matchPathPrefixDepth(
  folderName: string,
  fmt: PathFormat,
  depth: number
): PartialDateFields | null {
  if (depth < 0 || depth >= fmt.segments.length) return null;
  const seg = fmt.segments[depth];
  if (!seg) return null;
  return matchSegment(folderName, seg);
}

const pad = (n: number, len = 2): string => String(n).padStart(len, "0");

/**
 * Pure helper: given accumulated `{year, month, day}`, return a canonical
 * `"YYYY-MM-DD"` dayKey, or `null` if the fields are incomplete or form an
 * invalid calendar date (e.g. Feb 31). Inlined to keep this module
 * dependency-free of `datetime-parsing` for ms↔key conversions.
 */
export function dayKeyFromFields(fields: PartialDateFields): string | null {
  const { year, month, day } = fields;
  if (year === undefined || month === undefined || day === undefined) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/**
 * Compose `mergeFields` over multiple partials. Helper for callers that
 * accumulate matches across a descent path.
 */
export function mergeFields(...partials: PartialDateFields[]): PartialDateFields {
  return partials.reduce<PartialDateFields>((a, b) => merge(a, b), {});
}
