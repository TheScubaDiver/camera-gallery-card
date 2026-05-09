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
}

/** Curated common-NVR layouts. Keep ordered most-specific → most-generic so
 * tie-breaking favours formats that disambiguate more of the path. */
const CANDIDATES: readonly string[] = [
  // Layout C — nested year/month/day with timestamped filenames
  "YYYY/MM/DD/YYYYMMDD_HHmmss.mp4",
  "YYYY/MM/DD/YYYYMMDDHHmmss.mp4",
  "YYYY/MM/DD/HHmmss.mp4",
  "YYYY/MM/DD/HH-mm-ss.mp4",
  "YYYY/MM/DD/HHmmss",
  // Layout C — Reolink-style RLC prefix in filenames
  "YYYY/MM/DD/RLC_YYYYMMDDHHmmss.mp4",
  // Layout B — single date folder + timestamped filename
  "YYYYMMDD/HHmmss.mp4",
  "YYYYMMDD/HHmmss",
  "YYYY-MM-DD/HHmmss.mp4",
  "YYYY-MM-DD/HHmmss",
  "YYYYMMDD/YYYYMMDDHHmmss.mp4",
  // Layout A — flat folder, full timestamp in filename
  "YYYYMMDD_HHmmss.mp4",
  "YYYY-MM-DD_HH-mm-ss.mp4",
  "YYYYMMDDHHmmss.mp4",
  "YYYYMMDD_HHmmss",
  "YYYYMMDDHHmmss",
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
 * Detect the best `path_datetime_format` for the given media-source roots.
 *
 * Probe budget is capped, so this is safe to call from a UI handler. Returns
 * `format: null` when no candidate matched the majority of probed samples.
 */
export async function detectPathFormat(
  roots: readonly string[],
  browse: BrowseFn
): Promise<DetectResult> {
  const samples: string[] = [];
  for (const root of roots) {
    if (samples.length >= PROBE_SAMPLE_LIMIT) break;
    const part = await probeRoot(root, browse);
    samples.push(...part.slice(0, PROBE_SAMPLE_LIMIT - samples.length));
  }

  if (samples.length === 0) {
    return { format: null, matches: 0, sampled: 0, runnersUp: [] };
  }

  const scored: Array<{ format: string; matches: number }> = [];
  for (const cand of CANDIDATES) {
    const fmt = parsePathFormat(cand);
    if (!fmt) continue;
    const matches = scoreCandidate(samples, fmt);
    if (matches > 0) scored.push({ format: cand, matches });
  }

  // Sort: most matches first; tie-break on candidate index (most-specific
  // first per the curated list order).
  scored.sort((a, b) => {
    if (b.matches !== a.matches) return b.matches - a.matches;
    return CANDIDATES.indexOf(a.format) - CANDIDATES.indexOf(b.format);
  });

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
    };
  }

  return {
    format: winner.format,
    matches: winner.matches,
    sampled: samples.length,
    runnersUp: scored.slice(1, 4),
  };
}
