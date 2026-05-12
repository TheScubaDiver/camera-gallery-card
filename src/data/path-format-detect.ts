/**
 * `path_datetime_format` auto-detector.
 *
 * Strategy: walk a small probe (one root, a handful of leaf files) and
 * score a curated list of candidate formats by how many probe paths each
 * one matches. The best-scoring, most-specific candidate wins.
 *
 * The detector is framework-free — it takes a `browse(id)` function (so
 * tests can pass a fake) and returns the best format string and a small
 * report. The editor wires the actual HA-backed browse and renders the
 * suggestion.
 */

import { matchPathTail, parsePathFormat, type PathFormat } from "./path-format";
import type { MediaSourceItem } from "../types/media-source";

/** Maximum directory levels to descend during the probe. Tunable. */
const PROBE_DEPTH = 4;
/** Maximum browse calls to issue during the probe. Bounds the API cost. */
const PROBE_BROWSE_BUDGET = 20;
/** Maximum sample file paths the detector inspects. */
const PROBE_SAMPLE_LIMIT = 12;

export type BrowseFn = (mediaId: string) => Promise<MediaSourceItem | null>;

export interface DetectResult {
  /** The best-scoring format, or `null` when nothing matched. */
  readonly format: string | null;
  /** Match count of the winning format (0 when `format === null`). */
  readonly matches: number;
  /** Total number of file paths probed. */
  readonly sampled: number;
  /** Other candidates that also matched, sorted descending. Useful for UI hints. */
  readonly runnersUp: ReadonlyArray<{ format: string; matches: number }>;
  /** Every candidate the detector tested, with its match count.
   * Sorted descending by matches (zero-match entries last). The editor's
   * expandable "tested formats" view renders this. */
  readonly allScores: ReadonlyArray<{ format: string; matches: number }>;
}

/** Curated NVR / camera layouts. Ordered most-specific → most-generic so
 * tie-breaking favours formats that disambiguate more of the path.
 *
 * Extensions intentionally omitted: the parser treats a leaf segment
 * containing time tokens as "filename, match as substring" (see
 * `path-format.ts`'s `unanchored` branch). Without `.mp4` baked into the
 * suggestion, the same format string matches video AND image files —
 * users with mixed clip + snapshot exports get one suggestion that
 * covers both. Existing user configs with `.mp4` still parse fine; this
 * is just about what we *suggest*.
 *
 * Coverage:
 *   - Layout C: nested `YYYY/MM/DD[/HH]/leaf` and dashed `YYYY-MM-DD`
 *     variants. Reolink / Frigate recordings / Hikvision / generic.
 *   - Layout B: single dated folder + leaf. Synology, FileTrack.
 *   - Layout A: flat folder, full timestamp in filename. Blue Iris,
 *     direct exports. */
const CANDIDATES: readonly string[] = [
  // ─── Layout C — nested year/month/day. Most-specific (literal prefix
  // / full timestamp) first so a tied scorer with the more generic
  // pattern doesn't win a tie-break. ───
  "YYYY/MM/DD/RLC_YYYYMMDDHHmmss",
  "YYYY/MM/DD/YYYY-MM-DD_HH-mm-ss",
  "YYYY/MM/DD/YYYYMMDD_HHmmss",
  "YYYY/MM/DD/YYYYMMDDHHmmss",
  "YYYY/MM/DD/HH-mm-ss",
  "YYYY/MM/DD/HH_mm_ss",
  "YYYY/MM/DD/HH.mm.ss",
  "YYYY/MM/DD/HHmmss",
  // ─── Layout C — nested year-month-day (dashes) ───
  "YYYY-MM-DD/YYYY-MM-DD_HH-mm-ss",
  "YYYY-MM-DD/YYYYMMDD_HHmmss",
  "YYYY-MM-DD/HH-mm-ss",
  "YYYY-MM-DD/HH_mm_ss",
  "YYYY-MM-DD/HH.mm.ss",
  "YYYY-MM-DD/HHmmss",
  // ─── Layout C+ — nested with hour subfolder (Frigate / Hikvision) ───
  "YYYY-MM-DD/HH/MM.ss",
  "YYYY-MM-DD/HH/MM-ss",
  "YYYY-MM-DD/HH/HHmmss",
  "YYYY/MM/DD/HH/MM.ss",
  "YYYY/MM/DD/HH/HHmmss",
  // ─── Layout B — single date folder ───
  "YYYYMMDD/RLC_YYYYMMDDHHmmss",
  "YYYYMMDD/YYYYMMDD_HHmmss",
  "YYYYMMDD/YYYYMMDDHHmmss",
  "YYYYMMDD/HH-mm-ss",
  "YYYYMMDD/HHmmss",
  // ─── Layout A — flat folder, full timestamp in filename ───
  "RLC_YYYYMMDDHHmmss",
  "RLC_YYYYMMDD_HHmmss",
  "YYYY-MM-DDTHH-mm-ss",
  "YYYY-MM-DD-HH-mm-ss",
  "YYYY-MM-DD_HH-mm-ss",
  "YYYYMMDD_HHmmss",
  "YYYYMMDD-HHmmss",
  "YYYYMMDDHHmmss",
  // ─── Title-style — single segment with literal `/` (UniFi Protect,
  // any other integration that exposes the timestamp only in the
  // human-readable title). `\/` escapes the slash so the parser keeps
  // these as one segment instead of splitting them. ───
  "MM\\/DD\\/YYYY HH:mm:ss",
  "MM\\/DD\\/YY HH:mm:ss",
  "DD\\/MM\\/YYYY HH:mm:ss",
  "DD\\/MM\\/YY HH:mm:ss",
  "YYYY-MM-DD HH:mm:ss",
];

/**
 * Probe a single root: browse + walk a small set of branches, collect file
 * paths up to `PROBE_SAMPLE_LIMIT`. Bounded by `PROBE_BROWSE_BUDGET`.
 */
async function probeRoot(rootId: string, browse: BrowseFn): Promise<string[]> {
  const samples: string[] = [];
  let budget = PROBE_BROWSE_BUDGET;
  // Always-first-child descent: at each level, browse the FIRST few directory
  // children rather than fanning out — the goal is sample diversity within a
  // single date branch, not exhaustive coverage. Keeps the probe cheap.
  interface QueueEntry {
    id: string;
    depth: number;
  }
  const queue: QueueEntry[] = [{ id: rootId, depth: 0 }];
  while (queue.length && budget > 0 && samples.length < PROBE_SAMPLE_LIMIT) {
    const entry = queue.shift()!;
    if (entry.depth > PROBE_DEPTH) continue;
    budget--;
    let node: MediaSourceItem | null;
    try {
      node = await browse(entry.id);
    } catch {
      continue;
    }
    if (!node) continue;
    const children = Array.isArray(node.children) ? node.children : [];
    // Split children: directories candidate for descent, files as samples.
    // Directories are sorted to prefer date-shaped names (digits) over
    // dotted/underscored noise like `_thumbs/`, `.metadata/` — those would
    // otherwise grab the limited descent slots and starve a real `2026/`
    // sibling.
    const dirs = [];
    for (const ch of children) {
      if (!ch?.media_content_id) continue;
      const id = String(ch.media_content_id);
      if (ch.can_expand && entry.depth < PROBE_DEPTH) {
        dirs.push({ id, name: String(ch.title ?? "").trim() });
      } else if (samples.length < PROBE_SAMPLE_LIMIT) {
        samples.push(id);
        // Some integrations (UniFi Protect, etc.) carry the timestamp
        // only in the human-readable title — the URI is opaque. Add the
        // title as a separate sample only when it isn't just the file
        // basename echoed in the id (which would double-count for
        // traditional path formats). The substring check is cheap.
        const title = String(ch.title ?? "").trim();
        if (title && !id.includes(title) && samples.length < PROBE_SAMPLE_LIMIT) {
          samples.push(title);
        }
      }
    }
    dirs.sort((a, b) => {
      const aNoise = a.name.startsWith(".") || a.name.startsWith("_");
      const bNoise = b.name.startsWith(".") || b.name.startsWith("_");
      if (aNoise !== bNoise) return aNoise ? 1 : -1;
      const aDigit = /^\d/.test(a.name);
      const bDigit = /^\d/.test(b.name);
      if (aDigit !== bDigit) return aDigit ? -1 : 1;
      // Both equally likely — prefer alphabetically-LATER (year-folder names
      // are numeric-monotonic, so 2026 > 2025; this picks the newer year).
      return a.name < b.name ? 1 : a.name > b.name ? -1 : 0;
    });
    for (let i = 0; i < dirs.length && i < 2; i++) {
      const dir = dirs[i];
      if (dir) queue.push({ id: dir.id, depth: entry.depth + 1 });
    }
  }
  return samples;
}

/** Score a candidate format against a list of sample paths. Returns the
 * count of paths that successfully extract a year+month+day from the format. */
function scoreCandidate(samples: readonly string[], fmt: PathFormat): number {
  let hits = 0;
  for (const path of samples) {
    const fields = matchPathTail(path, fmt);
    if (
      fields &&
      fields.year !== undefined &&
      fields.month !== undefined &&
      fields.day !== undefined
    ) {
      hits++;
    }
  }
  return hits;
}

/**
 * Browse-probe one or more media-source roots and return up to `limit`
 * sample file paths. Bounded by `PROBE_BROWSE_BUDGET` per root.
 *
 * Stays format-agnostic: the caller decides which roots to hand in (e.g.
 * filter out Frigate event-id roots first, since their URIs encode time
 * directly and have nothing for this detector to match).
 */
export async function collectMediaSamples(
  roots: readonly string[],
  browse: BrowseFn,
  limit: number = PROBE_SAMPLE_LIMIT
): Promise<string[]> {
  const samples: string[] = [];
  for (const root of roots) {
    if (samples.length >= limit) break;
    const part = await probeRoot(root, browse);
    samples.push(...part.slice(0, limit - samples.length));
  }
  return samples;
}

/** Lazy-populated parse cache for the candidate list. `parsePathFormat`
 * compiles a fresh regex per segment, and `scoreSamples` is called once
 * per detect run (potentially many times per session via the editor's
 * scoreboard). Without this cache, every run pays 32 regex compilations.
 * Map-of-string-to-PathFormat-or-null so we can also memoize parse
 * failures alongside successes. */
const PARSED_CANDIDATES: Map<string, PathFormat | null> = new Map();
function parsedCandidate(cand: string): PathFormat | null {
  const cached = PARSED_CANDIDATES.get(cand);
  if (cached !== undefined) return cached;
  const fmt = parsePathFormat(cand);
  PARSED_CANDIDATES.set(cand, fmt);
  return fmt;
}

/**
 * Score `samples` against the curated candidate formats and pick the best.
 * Pure — caller controls how samples were collected (media-source browse,
 * sensor `fileList`, or both merged).
 */
export function scoreSamples(samples: readonly string[]): DetectResult {
  if (samples.length === 0) {
    return { format: null, matches: 0, sampled: 0, runnersUp: [], allScores: [] };
  }

  // Score every candidate, including zero-match ones — the editor's
  // expandable "tested formats" view shows the full list so users can
  // see which patterns *almost* worked.
  const allScored: Array<{ format: string; matches: number }> = [];
  for (const cand of CANDIDATES) {
    const fmt = parsedCandidate(cand);
    if (!fmt) {
      allScored.push({ format: cand, matches: 0 });
      continue;
    }
    allScored.push({ format: cand, matches: scoreCandidate(samples, fmt) });
  }

  // Sort: most matches first; tie-break on candidate index (most-specific
  // first per the curated list order).
  allScored.sort((a, b) => {
    if (b.matches !== a.matches) return b.matches - a.matches;
    return CANDIDATES.indexOf(a.format) - CANDIDATES.indexOf(b.format);
  });

  const scored = allScored.filter((x) => x.matches > 0);

  // Require at least half the samples to match before returning a winner —
  // avoids suggesting a format that only happened to match 1 random file.
  // For tiny sample sets (1-3 files) the floor is 1 so a perfect match still
  // surfaces; for larger sets we want a real majority.
  const winner = scored[0];
  const minRequired = samples.length < 4 ? 1 : Math.ceil(samples.length / 2);
  if (!winner || winner.matches < minRequired) {
    return {
      format: null,
      matches: winner?.matches ?? 0,
      sampled: samples.length,
      runnersUp: scored.slice(0, 3),
      allScores: allScored,
    };
  }

  return {
    format: winner.format,
    matches: winner.matches,
    sampled: samples.length,
    runnersUp: scored.slice(1, 4),
    allScores: allScored,
  };
}

/**
 * Detect the best `path_datetime_format` for the given media-source roots.
 *
 * Probe budget is capped, so this is safe to call from a UI handler. Returns
 * `format: null` when no candidate matched the majority of probed samples.
 */
export async function detectPathFormat(
  roots: readonly string[],
  browse: BrowseFn
): Promise<DetectResult> {
  const samples = await collectMediaSamples(roots, browse);
  return scoreSamples(samples);
}
