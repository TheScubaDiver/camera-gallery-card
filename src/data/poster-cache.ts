/**
 * Poster pipeline: failure ledger, capture queue, resolver decision tree,
 * IDB-backed mirror, and the auth-protected fetch path.
 *
 * Architecture parallel to {@link SensorSourceClient} / {@link MediaSourceClient}:
 *   - constructor — wire `inputs` (read-only views the resolver needs from
 *     sensor + media clients), `onChange` (card's `requestUpdate` hook),
 *     and the injectable strategies (IDB store, capture, blob URLs, `now`).
 *   - `setHass(hass)` — refreshes the cached auth-token closure.
 *   - `load(config)` — bumps the framePct salt, resets queue + attempts +
 *     stableKeys (mirror persists across config changes).
 *   - `prewarm()` — kicks the IDB read-through that warms the mirror.
 *   - `dispose()` — aborts every in-flight capture, revokes every blob URL
 *     in the mirror. Card calls from `disconnectedCallback`.
 *
 * Why a separate client (vs. living on the card):
 *   - The decision-tree predicates (`isThumbBroken`, `resolveVideoPoster`,
 *     `willNeverLoad`) fan out across 12+ conditional branches; pulling them
 *     into a typed module + spec matrix locks the contract.
 *   - The IO surface (fetch / `<video>` capture / IDB / `URL.createObjectURL`)
 *     is fully injectable, so the spec runs in pure jsdom with fakes — no
 *     real network or media element.
 *   - `AbortController` plumbing for in-flight captures means `reset()` and
 *     `dispose()` actually cancel work; the previous in-card implementation
 *     leaked listeners and blob URLs on card teardown.
 */

import {
  MAX_POSTER_WIDTH_PX,
  POSTER_CAPTURE_TIMEOUT_MS,
  POSTER_FETCH_TIMEOUT_MS,
  POSTER_JPEG_QUALITY,
  POSTER_MAX_ATTEMPTS,
  POSTER_MIRROR_MAX_ENTRIES,
  POSTER_RETRY_DELAY_MS,
  POSTER_RETRY_FIRST_DELAY_MS,
  SENSOR_POSTER_CONCURRENCY,
  SENSOR_POSTER_QUEUE_LIMIT,
  DEFAULT_THUMBNAIL_FRAME_PCT,
} from "../const";
import type { CameraGalleryCardConfig } from "../config/normalize";
import type { CardItem } from "../types/media-item";
import type { HomeAssistant } from "../types/hass";
import { fnv1aHash } from "../util/hash";
import { posterStore as defaultPosterStore, type PosterStore } from "../util/poster-store";
import { isVideo } from "../util/media-type";

// ─── Exported pure helpers ────────────────────────────────────────────

/**
 * Salt the IDB / mirror key with the current frame %, so changing the
 * `thumbnail_frame_pct` slider invalidates frames for that pct only —
 * unrelated cached posters survive.
 */
export function makePosterKey(url: string, framePct: number): string {
  return "cgc_p_" + fnv1aHash(String(url) + "|" + String(framePct));
}

/** Well-known `<video>` `MediaError.code` values. */
export type MediaErrorCode = 1 | 2 | 3 | 4;

/**
 * `true` for `<video>` errors that won't recover on retry:
 *   - 3 = MEDIA_ERR_DECODE
 *   - 4 = MEDIA_ERR_SRC_NOT_SUPPORTED
 *
 * 1 (ABORTED) and 2 (NETWORK) are soft — usually a stalled connection or
 * the user navigating away mid-load. Audit A16.
 */
export function isHardMediaError(code: number | undefined | null): boolean {
  return code === 3 || code === 4;
}

/**
 * Classify a capture / fetch error as hard (broken file) vs soft (transient).
 *
 * Hard:
 *   - HTTP 404 (`{ status: 404 }`)
 *   - `MediaError.code` 3 or 4 (decode / unsupported)
 *   - extraction failures (`"blank frame"`, `"toBlob returned null"`,
 *     `"no video dimensions"`) — file got here but can't make a frame
 *
 * Soft (any other code, AbortError, fetch timeout, non-404 non-ok response):
 *   the connection or environment failed in a recoverable way.
 *
 * Audit A23 — was inline string-match scattered across `_ensurePoster`.
 */
export function classifyCaptureError(err: unknown): { hard: boolean } {
  if (err === null || typeof err !== "object") return { hard: false };
  const e = err as { status?: unknown; mediaErrorCode?: unknown; message?: unknown };
  if (e.status === 404) return { hard: true };
  if (typeof e.mediaErrorCode === "number" && isHardMediaError(e.mediaErrorCode)) {
    return { hard: true };
  }
  const msg = typeof e.message === "string" ? e.message : "";
  if (msg === "blank frame" || msg === "toBlob returned null" || msg === "no video dimensions") {
    return { hard: true };
  }
  return { hard: false };
}

// ─── Injectable strategies (DOM-free for tests) ───────────────────────

/**
 * Frame-capture strategy. Production wires the DOM `<video>`/`<canvas>`
 * implementation; tests inject a fake that returns a synthesized Blob.
 *
 * The strategy owns its own teardown — `signal.onabort` should release
 * any browser-side resources (the production impl tears down the `<video>`
 * element so a `reset()` or `dispose()` mid-capture doesn't leak it).
 */
export interface FrameCaptureStrategy {
  capture(src: string, pct: number, signal: AbortSignal): Promise<Blob>;
}

/**
 * Object-URL factory. Production wraps `URL.createObjectURL` / `revokeObjectURL`;
 * jsdom without a Blob impl + the spec's fake factory lets us assert every
 * `create()` is paired with a `revoke()`.
 */
export interface BlobUrlFactory {
  create(blob: Blob): string | null;
  revoke(url: string): void;
}

/**
 * Read-only view of the surrounding card state the resolver needs.
 *
 * **Why closures instead of client refs:** the poster client never imports
 * `SensorSourceClient` / `MediaSourceClient`. The card builds this once in its
 * constructor over `this._sensorClient` / `this._mediaClient` / `this.config`.
 *
 * **`isRevealed` contract:** the card owns the IntersectionObserver. The
 * observer populates the revealed-thumbs set in `updated()` *before* render
 * enqueues, so by the time the resolver reads `isRevealed(src)` the Set
 * already reflects the current viewport. Don't clear it between resolve and
 * enqueue. Audit A12.
 */
export interface PosterResolverInputs {
  getSensorPairedThumbs(): ReadonlyMap<string, string>;
  getMediaPairedThumbs(): ReadonlyMap<string, string>;
  getMediaUrlCache(): ReadonlyMap<string, string>;
  findMatchingSnapshotMediaId(src: string): string;
  isResolveFailed(id: string): boolean;
  hasFrigate(): boolean;
  captureAllowed(): boolean;
  framePct(): number;
  isRevealed(src: string): boolean;
  getAuthToken(): string | null;
  /** Absolute origin used to prefix `/api/...` paths. Card passes
   * `window.location.origin` at runtime; tests pass a stub. */
  getOrigin(): string;
}

export interface PosterCacheClientOptions {
  inputs: PosterResolverInputs;
  store?: PosterStore;
  capture?: FrameCaptureStrategy;
  blobUrls?: BlobUrlFactory;
  onChange?: () => void;
  /** Injectable clock for retry-cooldown specs. Defaults to `Date.now`. */
  now?: () => number;
  /** Injectable timer factory so fake-timer specs can drive the soft-retry
   * scheduler deterministically. Defaults to `setTimeout`/`clearTimeout`. */
  schedule?: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (h: unknown) => void;
  };
  /** Injectable fetch for protected-asset specs. Defaults to global `fetch`. */
  fetchFn?: typeof fetch;
}

/**
 * Per-render collector for pending poster work. The card constructs a fresh
 * one each `render()` cycle and drains it in `updated()` — moves the
 * stableKey side-effect out of the "read-only" resolver path. Audit A10.
 */
export class PendingPosterCollector {
  /** `(displayUrl, stableKey?)` pairs that need enqueueing. */
  readonly posters: Array<{ url: string; stableKey?: string }> = [];
  /** Media-source IDs that need URL resolution before render can use them. */
  readonly resolveIds: Set<string> = new Set();

  addPoster(url: string, stableKey?: string): void {
    if (!url) return;
    this.posters.push(stableKey === undefined ? { url } : { url, stableKey });
  }

  addResolveId(id: string): void {
    if (!id) return;
    this.resolveIds.add(id);
  }

  get size(): number {
    return this.posters.length + this.resolveIds.size;
  }
}

// ─── Internal types ────────────────────────────────────────────────────

interface AttemptRecord {
  count: number;
  lastAt: number;
  hard: boolean;
}

interface MirrorEntry {
  /** The display URL the entry was cached against (sensor: same as key
   * pre-hash; media-source: the signed/rotating URL). Used to clear the
   * matching `_posterCache` slot on LRU eviction. Audit A19. */
  src: string;
  blob: Blob;
  /** Lazily created on first read via `BlobUrlFactory.create`. */
  url: string | null;
}

// ─── Default strategies (production wiring) ────────────────────────────

/** `URL.createObjectURL` / `revokeObjectURL` wrapper. Returns `null` from
 * `create()` if the runtime stubbed them out (vitest jsdom in some setups). */
export const browserBlobUrlFactory: BlobUrlFactory = {
  create(blob: Blob): string | null {
    try {
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  },
  revoke(url: string): void {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* noop — already revoked or runtime stubbed it out */
    }
  },
};

/**
 * Production capture: spawn a `<video>` element, seek to `pct%`, copy the
 * frame to a `<canvas>`, return a JPEG blob.
 *
 * The blank-frame heuristic runs only when seeking is non-trivial
 * (`pct > 0`) or the capture took unusually long (>200 ms) — full readbacks
 * are costly on mobile and start-frames are almost never corrupt.
 *
 * Aborting via `signal` tears down listeners and the `<video>` element so a
 * `reset()` / `dispose()` mid-capture doesn't leak. Audit A17.
 */
export const domFrameCaptureStrategy: FrameCaptureStrategy = {
  capture(src: string, pct: number, signal: AbortSignal): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      const v = document.createElement("video");
      v.muted = true;
      v.setAttribute("muted", "");
      v.playsInline = true;
      v.preload = "metadata";

      let settled = false;
      let retried = false;
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      const ac = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const cleanup = (): void => {
        if (timeout !== null) clearTimeout(timeout);
        ac.abort();
        try {
          v.pause();
        } catch {
          /* noop */
        }
        try {
          v.removeAttribute("src");
          v.load();
        } catch {
          /* noop */
        }
      };
      const fail = (err: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };
      const ok = (blob: Blob): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(blob);
      };

      signal.addEventListener("abort", () => fail(new Error("aborted")), { once: true });

      // Variance / near-black heuristics tuned empirically against real
      // corrupt-segment frames. Numbers stay inline here — see
      // `MAX_POSTER_WIDTH_PX` / `POSTER_JPEG_QUALITY` in const.ts for the
      // user-visible knobs.
      const isBlankFrame = (
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number
      ): boolean | null => {
        try {
          const data = ctx.getImageData(0, 0, w, h).data;
          let sum = 0;
          let sumSq = 0;
          let nearBlack = 0;
          let n = 0;
          for (let i = 0; i < data.length; i += 16) {
            const r = data[i] ?? 0;
            const g = data[i + 1] ?? 0;
            const b = data[i + 2] ?? 0;
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;
            sum += luma;
            sumSq += luma * luma;
            if (luma < 8) nearBlack++;
            n++;
          }
          if (!n) return false;
          const mean = sum / n;
          const variance = sumSq / n - mean * mean;
          if (variance < 5) return true;
          if (mean < 6 && variance < 30) return true;
          if (nearBlack / n > 0.97) return true;
          return false;
        } catch {
          return null;
        }
      };

      const onSeeked = (): void => {
        if (settled) return;
        try {
          const w = v.videoWidth;
          const h = v.videoHeight;
          if (!w || !h) return fail(new Error("no video dimensions"));
          const scale = Math.min(1, MAX_POSTER_WIDTH_PX / w);
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(w * scale));
          c.height = Math.max(1, Math.round(h * scale));
          const ctx = c.getContext("2d");
          if (!ctx) return fail(new Error("no canvas context"));
          ctx.drawImage(v, 0, 0, c.width, c.height);

          const pctNum = Number(pct) || 0;
          const elapsed =
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
          if (pctNum > 0 || elapsed > 200) {
            const blank = isBlankFrame(ctx, c.width, c.height);
            if (blank === true) {
              if (!retried && pctNum > 0) {
                retried = true;
                v.addEventListener("seeked", onSeeked, { once: true, signal: ac.signal });
                try {
                  v.currentTime = 0.01;
                } catch (err) {
                  return fail(err instanceof Error ? err : new Error("seek failed"));
                }
                return;
              }
              return fail(new Error("blank frame"));
            }
          }

          c.toBlob(
            (blob): void => {
              if (!blob) return fail(new Error("toBlob returned null"));
              ok(blob);
            },
            "image/jpeg",
            POSTER_JPEG_QUALITY
          );
        } catch (err) {
          fail(err instanceof Error ? err : new Error("capture failed"));
        }
      };

      timeout = setTimeout(() => fail(new Error("poster timeout")), POSTER_CAPTURE_TIMEOUT_MS);

      v.addEventListener(
        "error",
        () => {
          const err = new Error("video load error") as Error & { mediaErrorCode?: number };
          const code = v.error?.code;
          if (code !== undefined) err.mediaErrorCode = code;
          fail(err);
        },
        { once: true, signal: ac.signal }
      );
      v.addEventListener(
        "loadedmetadata",
        () => {
          const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
          const p = Math.max(0, Math.min(100, Number(pct) || 0));
          let t = 0.01;
          if (dur && p > 0) t = p === 100 ? Math.max(0.01, dur - 0.05) : dur * (p / 100);
          try {
            v.currentTime = t;
          } catch {
            onSeeked();
          }
        },
        { once: true, signal: ac.signal }
      );
      v.addEventListener("seeked", onSeeked, { once: true, signal: ac.signal });

      v.src = src;
      try {
        v.load();
      } catch {
        /* swallow — error event handler above will fire */
      }
    });
  },
};

// ─── The client ────────────────────────────────────────────────────────

/**
 * Poster cache pipeline. See module header.
 */
export class PosterCacheClient {
  private readonly _inputs: PosterResolverInputs;
  private readonly _store: PosterStore;
  private readonly _capture: FrameCaptureStrategy;
  private readonly _blobUrls: BlobUrlFactory;
  private readonly _now: () => number;
  private readonly _onChange: (() => void) | undefined;
  private readonly _setTimeout: (fn: () => void, ms: number) => unknown;
  private readonly _clearTimeout: (h: unknown) => void;
  private readonly _fetch: typeof fetch;

  private _hass: HomeAssistant | null = null;

  /** `src` → resolved object URL for synchronous render access. */
  private readonly _posterCache: Map<string, string> = new Map();
  /** URLs whose `_ensurePoster` is currently awaiting fetch/capture. */
  private readonly _posterPending: Set<string> = new Set();
  /** URLs currently being drained (between `_posterQueued` and pending). */
  private readonly _posterInFlight: Set<string> = new Set();
  /** Mirror of `_posterQueue` for O(1) membership testing. */
  private readonly _posterQueued: Set<string> = new Set();
  /** FIFO queue of URLs awaiting drain. */
  private _posterQueue: string[] = [];
  /** Per-URL failure ledger. */
  private readonly _posterAttempts: Map<string, AttemptRecord> = new Map();
  /** `url → stableKey` for media-source items whose resolved URL rotates
   * each session (key the IDB blob by mediaId, not the signed URL). */
  private readonly _posterStableKeys: Map<string, string> = new Map();
  /** In-memory mirror of the IDB store. */
  private _posterMirror: Map<string, MirrorEntry> = new Map();
  /** AbortControllers per in-flight `_ensurePoster` call. Audit A17. */
  private readonly _ensureAborts: Map<string, AbortController> = new Map();
  /** Soft-retry rolling timer handle. */
  private _softRetryTimer: unknown = null;
  /** Single shared prewarm promise — both render and `_ensurePoster` await it. */
  private _prewarmReadyPromise: Promise<void> | null = null;
  private _prewarmDone = false;

  private _config: CameraGalleryCardConfig | null = null;

  constructor(opts: PosterCacheClientOptions) {
    this._inputs = opts.inputs;
    this._store = opts.store ?? defaultPosterStore;
    this._capture = opts.capture ?? domFrameCaptureStrategy;
    this._blobUrls = opts.blobUrls ?? browserBlobUrlFactory;
    this._now = opts.now ?? ((): number => Date.now());
    this._onChange = opts.onChange;
    this._setTimeout =
      opts.schedule?.setTimeout ?? ((fn, ms): unknown => setTimeout(fn, ms) as unknown);
    this._clearTimeout =
      opts.schedule?.clearTimeout ??
      ((h): void => clearTimeout(h as ReturnType<typeof setTimeout>));
    this._fetch = opts.fetchFn ?? ((...args): Promise<Response> => fetch(...args));
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  setHass(hass: HomeAssistant | null): void {
    this._hass = hass;
  }

  /**
   * Update the cached config. Resets queue + attempts + stableKeys + cache
   * (a source-mode flip means the prior pipeline is stale). Mirror persists
   * across config changes — same user, same dashboard, cached frames are
   * still valid.
   */
  load(config: CameraGalleryCardConfig | null): void {
    this._config = config;
    this._abortAllInFlight();
    this._posterQueue = [];
    this._posterQueued.clear();
    this._posterInFlight.clear();
    this._posterPending.clear();
    this._posterAttempts.clear();
    this._posterStableKeys.clear();
    if (this._softRetryTimer !== null) {
      this._clearTimeout(this._softRetryTimer);
      this._softRetryTimer = null;
    }
    // Posters captured under the previous source-mode shouldn't render for
    // the new mode (different paired-jpg mappings, different stableKeys);
    // hand the freshly-loaded card a clean in-memory cache. Mirror keeps the
    // disk-backed blobs so re-visits under the prior mode get a fast path.
    this._posterCache.clear();
  }

  /**
   * Idempotent IDB prewarm — populates `_posterMirror` from the on-disk
   * store. Returns a single shared promise so concurrent calls coalesce.
   */
  prewarm(): Promise<void> {
    if (this._prewarmReadyPromise) return this._prewarmReadyPromise;
    this._prewarmReadyPromise = this._store
      .readAll()
      .then((records): void => {
        for (const rec of records) {
          // In-flight captures during prewarm have already populated their
          // entries — preserve those (fresh > disk).
          if (this._posterMirror.has(rec.key)) continue;
          this._posterMirror.set(rec.key, { src: rec.key, blob: rec.blob, url: null });
        }
      })
      .catch((): void => {
        /* IDB unavailable — fall through with an empty mirror */
      })
      .finally((): void => {
        this._prewarmDone = true;
        this._onChange?.();
      });
    // Trim disk store so it never exceeds the cap. Best-effort. Audit A21.
    this._store.evictExcess(POSTER_MIRROR_MAX_ENTRIES).catch((): void => {});
    return this._prewarmReadyPromise;
  }

  /** Abort every in-flight capture/fetch, clear queue + attempts + stableKeys.
   * Preserves the in-memory cache and the IDB mirror (those represent
   * successful past work). */
  reset(): void {
    this._abortAllInFlight();
    this._posterQueue = [];
    this._posterQueued.clear();
    this._posterInFlight.clear();
    this._posterPending.clear();
    this._posterAttempts.clear();
    this._posterStableKeys.clear();
    if (this._softRetryTimer !== null) {
      this._clearTimeout(this._softRetryTimer);
      this._softRetryTimer = null;
    }
  }

  /** Reset + clear the in-memory poster cache. Used by `setConfig` on a
   * source-mode change (the new mode wouldn't recognise the previous
   * mode's URLs anyway). */
  clearPosterCache(): void {
    this.reset();
    this._posterCache.clear();
  }

  /** Tear down everything that holds external resources: abort in-flight,
   * revoke every blob URL in the mirror, clear timers. Card calls from
   * `disconnectedCallback`. */
  dispose(): void {
    this._abortAllInFlight();
    if (this._softRetryTimer !== null) {
      this._clearTimeout(this._softRetryTimer);
      this._softRetryTimer = null;
    }
    for (const entry of this._posterMirror.values()) {
      if (entry.url) this._blobUrls.revoke(entry.url);
      entry.url = null;
    }
  }

  // ─── Read-only accessors ──────────────────────────────────────────────

  isPrewarmDone(): boolean {
    return this._prewarmDone;
  }

  /** Synchronous `<img src>` lookup. */
  getPosterUrl(src: string): string | undefined {
    return this._posterCache.get(src);
  }

  /** True iff any capture/fetch is currently in flight or queued for `src`. */
  isPosterBusy(src: string): boolean {
    return (
      this._posterPending.has(src) || this._posterInFlight.has(src) || this._posterQueued.has(src)
    );
  }

  // ─── Failure ledger ───────────────────────────────────────────────────

  isHardFailed(src: string): boolean {
    const a = this._posterAttempts.get(src);
    if (!a) return false;
    return a.hard || a.count >= POSTER_MAX_ATTEMPTS;
  }

  /**
   * `true` iff a soft-failed URL is still within its retry-cooldown window.
   * First-attempt fails use the shorter `POSTER_RETRY_FIRST_DELAY_MS`
   * (audit A3) — a transient blip no longer blocks rendering for 30 s.
   */
  isCoolingDown(src: string): boolean {
    const a = this._posterAttempts.get(src);
    if (!a || a.hard) return false;
    if (a.count === 0) return false;
    const cooldown = a.count === 1 ? POSTER_RETRY_FIRST_DELAY_MS : POSTER_RETRY_DELAY_MS;
    return this._now() - a.lastAt < cooldown;
  }

  recordFailure(src: string, opts: { hard?: boolean } = {}): void {
    const hard = opts.hard ?? false;
    const prev = this._posterAttempts.get(src);
    const count = (prev?.count ?? 0) + 1;
    const isHardNow = hard || count >= POSTER_MAX_ATTEMPTS;
    this._posterAttempts.set(src, { count, lastAt: this._now(), hard: isHardNow });
    if (!isHardNow) this._scheduleSoftRetryRender();
  }

  clearFailure(src: string): void {
    this._posterAttempts.delete(src);
  }

  /** `<img onerror>` handler. `<img>` won't retry on its own and we've
   * already given the browser the URL once — flip to hard immediately. */
  onThumbImgError(posterUrl: string): void {
    if (!posterUrl) return;
    if (this.isHardFailed(posterUrl)) return;
    this.recordFailure(posterUrl, { hard: true });
    this._onChange?.();
  }

  // ─── Queue ────────────────────────────────────────────────────────────

  /**
   * Enqueue a URL for capture/fetch. `stableKey` records the persistent-cache
   * identifier when it differs from the fetch URL (media-source: stable
   * mediaId vs. ephemeral signed URL). Audit A10 (single registration point
   * for stableKey — no resolver-side side effects).
   */
  enqueue(src: string, stableKey?: string): void {
    const key = String(src ?? "").trim();
    if (!key) return;
    if (stableKey && stableKey !== key) {
      this._posterStableKeys.set(key, stableKey);
    }
    if (this._posterCache.has(key)) return;
    if (this._posterPending.has(key)) return;
    if (this._posterQueued.has(key)) return;
    if (this._posterInFlight.has(key)) return;
    if (this.isHardFailed(key)) return;
    if (this.isCoolingDown(key)) return;

    this._posterQueued.add(key);
    this._posterQueue.push(key);

    // Trim from the head (oldest) — render pushes newest-first by day-sort,
    // so the oldest queued entries are the least likely to still be visible.
    // Audit A5 / A8 (previous `.length = N` dropped the *newest* items, the
    // opposite of intent, *and* left stale Set entries).
    while (this._posterQueue.length > SENSOR_POSTER_QUEUE_LIMIT) {
      const evicted = this._posterQueue.shift();
      if (evicted !== undefined) this._posterQueued.delete(evicted);
    }

    this._drain();
  }

  /** Drain the queue up to `SENSOR_POSTER_CONCURRENCY` in-flight captures. */
  drain(): void {
    this._drain();
  }

  private _drain(): void {
    while (this._posterInFlight.size < SENSOR_POSTER_CONCURRENCY && this._posterQueue.length > 0) {
      const src = this._posterQueue.shift();
      if (src === undefined) break;
      this._posterQueued.delete(src);

      // Race-relevant gates only — the impossible-to-be-true checks the
      // pre-extraction code redundantly repeated here are gone. Audit A6.
      if (this._posterCache.has(src)) continue;
      if (this._posterPending.has(src)) continue;
      if (this.isHardFailed(src)) continue;
      if (this.isCoolingDown(src)) continue;

      this._posterInFlight.add(src);
      void this._ensurePoster(src)
        .catch((): void => {
          /* errors already classified into the attempts ledger */
        })
        .finally((): void => {
          this._posterInFlight.delete(src);
          this._drain();
        });
    }
  }

  private _scheduleSoftRetryRender(): void {
    if (this._softRetryTimer !== null) return;
    let earliest = Infinity;
    const now = this._now();
    for (const a of this._posterAttempts.values()) {
      if (a.hard) continue;
      const cooldown = a.count === 1 ? POSTER_RETRY_FIRST_DELAY_MS : POSTER_RETRY_DELAY_MS;
      const expiry = a.lastAt + cooldown;
      if (expiry < earliest) earliest = expiry;
    }
    if (earliest === Infinity) return;
    const delay = Math.max(100, earliest - now + 100);
    this._softRetryTimer = this._setTimeout(() => {
      this._softRetryTimer = null;
      this._onChange?.();
      // The render above may re-fail items (still slow); reschedule for
      // whatever cooldown is still pending.
      this._scheduleSoftRetryRender();
    }, delay);
  }

  // ─── Resolver decision tree ──────────────────────────────────────────

  /**
   * Returns the URL to use for `<img src>` on a video thumb. Pure read +
   * push to `pending` — side effects (enqueue, stableKey registration)
   * are deferred to `pending` drain. Audit A10.
   *
   * Strategy (per branch comments below):
   *   - sensor mode: paired jpg cached → return it; mirrored → cache and
   *     return; otherwise revealed-and-allowed → enqueue raw video for
   *     capture; otherwise placeholder.
   *   - media-source: Frigate snapshot priority (cheap server image) →
   *     paired jpg → browse_media `thumb` → raw video (only if revealed
   *     and capture allowed).
   */
  resolveVideoPoster(
    it: CardItem,
    isMs: boolean,
    thumbUrl: string,
    tThumb: string,
    pending: PendingPosterCollector
  ): string {
    const captureAllowed = this._inputs.captureAllowed();

    if (!isMs) {
      const pairedJpg = this._inputs.getSensorPairedThumbs().get(it.src);
      if (pairedJpg) return this._posterCache.get(pairedJpg) ?? "";
      const cached = this._posterCache.get(it.src);
      if (cached) return cached;
      const mirrored = this._lsThumbGet(it.src);
      if (mirrored) {
        this._posterCache.set(it.src, mirrored);
        return mirrored;
      }
      if (captureAllowed && this._inputs.isRevealed(it.src)) {
        pending.addPoster(it.src);
      }
      return "";
    }

    if (this._inputs.hasFrigate()) {
      const snapshotId = this._inputs.findMatchingSnapshotMediaId(it.src);
      if (snapshotId) {
        // Audit A11 — symmetry with the paired-jpg branch below: don't
        // re-queue a snapshot whose resolve has already latched failed
        // (the TTL still ticks; once it expires `isResolveFailed` returns
        // false again and we'll re-enqueue naturally).
        if (this._inputs.isResolveFailed(snapshotId)) return "";
        const snapshotUrl = this._inputs.getMediaUrlCache().get(snapshotId) ?? "";
        if (snapshotUrl) return snapshotUrl;
        pending.addResolveId(snapshotId);
      }
    }

    const pairedJpgId = this._inputs.getMediaPairedThumbs().get(it.src);
    if (pairedJpgId && !this._inputs.isResolveFailed(pairedJpgId)) {
      const jpgUrl = this._inputs.getMediaUrlCache().get(pairedJpgId) ?? "";
      if (jpgUrl) {
        const cached = this._posterCache.get(jpgUrl);
        if (cached) return cached;
        const mirrored = this._lsThumbGet(pairedJpgId);
        if (mirrored) {
          this._posterCache.set(jpgUrl, mirrored);
          return mirrored;
        }
        // stableKey = pairedJpgId so the cached blob survives signed-URL
        // rotation across sessions. Audit A10 — registered via the
        // pending collector, not by mutating private state mid-render.
        pending.addPoster(jpgUrl, pairedJpgId);
        return "";
      }
      pending.addResolveId(pairedJpgId);
      return "";
    }

    if (tThumb) {
      const cached = this._posterCache.get(tThumb);
      if (cached) return cached;
      pending.addPoster(tThumb);
      return "";
    }

    if (thumbUrl) {
      const cached = this._posterCache.get(thumbUrl);
      if (cached) return cached;
      const mirrored = this._lsThumbGet(it.src);
      if (mirrored) {
        this._posterCache.set(thumbUrl, mirrored);
        return mirrored;
      }
      if (captureAllowed && this._inputs.isRevealed(it.src)) {
        // stableKey = it.src (mediaId) so the captured frame survives
        // signed-URL rotation.
        pending.addPoster(thumbUrl, it.src);
      }
    }
    return "";
  }

  /**
   * `true` iff every URL we'd attempt to capture for this thumb has been
   * recorded as hard-failed. Render uses this to swap an empty `.tph` for
   * the broken-thumbnail UI.
   */
  isThumbBroken(it: CardItem, isMs: boolean, thumbUrl: string, tThumb: string): boolean {
    if (this.isHardFailed(it.src)) return true;
    if (!isMs) {
      const pairedJpg = this._inputs.getSensorPairedThumbs().get(it.src);
      return !!pairedJpg && this.isHardFailed(pairedJpg);
    }
    if (thumbUrl && this.isHardFailed(thumbUrl)) return true;
    if (tThumb && this.isHardFailed(tThumb)) return true;
    const pairedJpgId = this._inputs.getMediaPairedThumbs().get(it.src);
    if (pairedJpgId) {
      const jpgUrl = this._inputs.getMediaUrlCache().get(pairedJpgId) ?? "";
      if (jpgUrl && this.isHardFailed(jpgUrl)) return true;
    }
    if (this._inputs.hasFrigate()) {
      const snapshotId = this._inputs.findMatchingSnapshotMediaId(it.src);
      if (snapshotId) {
        const snapshotUrl = this._inputs.getMediaUrlCache().get(snapshotId) ?? "";
        if (snapshotUrl && this.isHardFailed(snapshotUrl)) return true;
      }
    }
    return false;
  }

  /** `true` iff a fetch / capture is currently in flight (or queued) for
   * any URL that could produce this item's poster. */
  isPosterLoading(it: CardItem, isMs: boolean, thumbUrl: string, tThumb: string): boolean {
    if (this.isPosterBusy(it.src)) return true;
    if (!isMs) {
      const pairedJpg = this._inputs.getSensorPairedThumbs().get(it.src);
      return !!pairedJpg && this.isPosterBusy(pairedJpg);
    }
    if (thumbUrl && this.isPosterBusy(thumbUrl)) return true;
    if (tThumb && this.isPosterBusy(tThumb)) return true;
    const pairedJpgId = this._inputs.getMediaPairedThumbs().get(it.src);
    if (pairedJpgId) {
      const jpgUrl = this._inputs.getMediaUrlCache().get(pairedJpgId) ?? "";
      if (jpgUrl && this.isPosterBusy(jpgUrl)) return true;
    }
    return false;
  }

  /** `true` iff this video item has no possible poster source under the
   * current config: no server-side thumbnail AND `capture_video_thumbnails`
   * is explicitly off. */
  willNeverLoad(it: CardItem, isMs: boolean, tThumb: string): boolean {
    if (this._inputs.captureAllowed()) return false;
    return !this.hasServerThumbForVideo(it, isMs, tThumb);
  }

  /** `true` iff the gallery has a server-provided thumbnail for this item
   * we can fetch cheaply (small HTTP request) — meaning we don't need to
   * fall back to expensive `<video>` frame capture. */
  hasServerThumbForVideo(it: CardItem, isMs: boolean, tThumb: string): boolean {
    if (!isMs) {
      return !!this._inputs.getSensorPairedThumbs().get(it.src);
    }
    if (tThumb) return true;
    if (this._inputs.hasFrigate()) {
      if (this._inputs.findMatchingSnapshotMediaId(it.src)) return true;
    }
    if (this._inputs.getMediaPairedThumbs().get(it.src)) return true;
    return false;
  }

  // ─── Mirror operations ────────────────────────────────────────────────

  /** Drop a cached thumbnail. Used when the underlying file is confirmed
   * missing (HTTP 404, MediaError) so a deleted file's stale cached thumb
   * stops being rendered. */
  dropCachedThumb(displayUrl: string, stableKey?: string): void {
    const key = this._lsKey(stableKey ?? displayUrl);
    const prev = this._posterMirror.get(key);
    if (prev?.url) this._blobUrls.revoke(prev.url);
    this._posterMirror.delete(key);
    this._posterCache.delete(displayUrl);
    void this._store.delete(key).catch((): void => {});
  }

  private _lsKey(url: string): string {
    const pct = this._config?.thumbnail_frame_pct ?? DEFAULT_THUMBNAIL_FRAME_PCT;
    return makePosterKey(url, pct);
  }

  private _mirrorEnsureUrl(entry: MirrorEntry): string | null {
    if (entry.url) return entry.url;
    entry.url = this._blobUrls.create(entry.blob);
    return entry.url;
  }

  private _lsThumbGet(url: string): string | null {
    const key = this._lsKey(url);
    const entry = this._posterMirror.get(key);
    if (!entry) return null;
    // LRU: move the entry to the end of the Map so eviction (which pops
    // `keys().next().value`) drops the genuinely-coldest entry.
    this._posterMirror.delete(key);
    this._posterMirror.set(key, entry);
    void this._store.touch(key).catch((): void => {});
    return this._mirrorEnsureUrl(entry);
  }

  private _lsThumbSet(stableKey: string, blob: Blob, displayUrl: string): string | null {
    const key = this._lsKey(stableKey);
    const prev = this._posterMirror.get(key);
    if (prev?.url) this._blobUrls.revoke(prev.url);
    this._posterMirror.delete(key);
    // LRU cap. Audit A18.
    while (this._posterMirror.size >= POSTER_MIRROR_MAX_ENTRIES) {
      const firstKey: string | undefined = this._posterMirror.keys().next().value;
      if (firstKey === undefined) break;
      const oldest = this._posterMirror.get(firstKey);
      if (oldest?.url) this._blobUrls.revoke(oldest.url);
      // Sensor-mode: src === displayUrl, the matching cache slot clears.
      // Media-source: src is a rotated signed URL, so this delete may
      // no-op; the new signed URL won't collide and the cache is safe.
      // Audit A19.
      if (oldest?.src) this._posterCache.delete(oldest.src);
      this._posterMirror.delete(firstKey);
    }
    const entry: MirrorEntry = { src: displayUrl, blob, url: null };
    this._posterMirror.set(key, entry);
    void this._store.set(key, blob).catch((): void => {});
    return this._mirrorEnsureUrl(entry);
  }

  // ─── Fetch + ensure ──────────────────────────────────────────────────

  private async _fetchProtectedAsBlob(src: string, signal: AbortSignal): Promise<Blob | null> {
    const token = this._inputs.getAuthToken();
    if (!token) return null;
    // Audit A22 — absolute URLs (Frigate hosts behind a reverse proxy)
    // must not get the origin prefixed; only `/api/...`-style paths do.
    const isAbsolute = src.startsWith("http://") || src.startsWith("https://");
    const targetUrl = isAbsolute ? src : this._inputs.getOrigin() + src;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), POSTER_FETCH_TIMEOUT_MS);
    const onOuterAbort = (): void => ctrl.abort();
    signal.addEventListener("abort", onOuterAbort, { once: true });
    try {
      const res = await this._fetch(targetUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
      if (res.status === 404) {
        const err = new Error("not found") as Error & { status: number };
        err.status = 404;
        throw err;
      }
      if (!res.ok) return null;
      return await res.blob();
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onOuterAbort);
    }
  }

  private async _ensurePoster(src: string): Promise<void> {
    if (!src || this._posterCache.has(src) || this._posterPending.has(src)) return;
    if (this.isHardFailed(src)) return;
    if (this.isCoolingDown(src)) return;

    const stableKey = this._posterStableKeys.get(src) ?? src;
    const ac = new AbortController();
    this._ensureAborts.set(src, ac);

    // Wait for the IDB prewarm to land before checking cache. Cold-load
    // renders schedule captures before `posterStore.readAll()` resolves;
    // without this await we'd race the network and re-download blobs
    // already on disk.
    if (this._prewarmReadyPromise && !this._prewarmDone) {
      await this._prewarmReadyPromise;
      if (ac.signal.aborted) {
        this._ensureAborts.delete(src);
        return;
      }
      // Post-await re-check. Audit A24 — previously missed `_posterPending`,
      // so two racing callers both passed and re-fetched.
      if (this._posterCache.has(src)) {
        this._ensureAborts.delete(src);
        return;
      }
      if (this._posterPending.has(src)) {
        this._ensureAborts.delete(src);
        return;
      }
      if (this.isHardFailed(src)) {
        this._ensureAborts.delete(src);
        return;
      }
      if (this.isCoolingDown(src)) {
        this._ensureAborts.delete(src);
        return;
      }
    }

    const cached = this._lsThumbGet(stableKey);
    if (cached) {
      this._posterCache.set(src, cached);
      this.clearFailure(src);
      this._ensureAborts.delete(src);
      this._onChange?.();
      return;
    }

    this._posterPending.add(src);
    try {
      const pct = this._inputs.framePct();
      const blob =
        src.startsWith("/") && !isVideo(src)
          ? await this._fetchProtectedAsBlob(src, ac.signal)
          : await this._capture.capture(src, pct, ac.signal);
      if (ac.signal.aborted) return;
      if (blob) {
        const objectUrl = this._lsThumbSet(stableKey, blob, src);
        if (objectUrl) {
          this._posterCache.set(src, objectUrl);
          this.clearFailure(src);
        } else {
          this.recordFailure(src);
        }
      } else {
        this.recordFailure(src);
      }
    } catch (err) {
      if (ac.signal.aborted) return;
      const cls = classifyCaptureError(err);
      this.recordFailure(src, { hard: cls.hard });
      const status = (err as { status?: unknown })?.status;
      if (status === 404) this.dropCachedThumb(src, stableKey);
    } finally {
      this._posterPending.delete(src);
      this._posterStableKeys.delete(src);
      this._ensureAborts.delete(src);
      this._onChange?.();
    }
  }

  private _abortAllInFlight(): void {
    for (const ac of this._ensureAborts.values()) {
      ac.abort();
    }
    this._ensureAborts.clear();
  }
}
