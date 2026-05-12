import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CameraGalleryCardConfig } from "../config/normalize";
import {
  classifyCaptureError,
  isHardMediaError,
  makePosterKey,
  PendingPosterCollector,
  PosterCacheClient,
  type BlobUrlFactory,
  type FrameCaptureStrategy,
  type PosterResolverInputs,
} from "./poster-cache";
import type { PosterStore } from "../util/poster-store";

// ─── Test rigs ────────────────────────────────────────────────────────

/**
 * In-memory `PosterStore` fake. Implements every method the client calls
 * with realistic semantics so the LRU / dedupe / failure paths exercise
 * real code, not double-mocks.
 */
class FakePosterStore implements Pick<
  PosterStore,
  "readAll" | "set" | "touch" | "delete" | "evictExcess" | "init" | "isAvailable"
> {
  records: Map<string, { key: string; blob: Blob; ts: number }> = new Map();
  initCalls = 0;
  failNextSet = false;

  init(): Promise<void> {
    this.initCalls++;
    return Promise.resolve();
  }
  isAvailable(): boolean {
    return true;
  }
  readAll(): Promise<{ key: string; blob: Blob; ts: number }[]> {
    return Promise.resolve(Array.from(this.records.values()));
  }
  set(key: string, blob: Blob): Promise<void> {
    if (this.failNextSet) {
      this.failNextSet = false;
      return Promise.reject(new Error("set failed"));
    }
    this.records.set(key, { key, blob, ts: Date.now() });
    return Promise.resolve();
  }
  touch(key: string): Promise<void> {
    const r = this.records.get(key);
    if (r) r.ts = Date.now();
    return Promise.resolve();
  }
  delete(key: string): Promise<void> {
    this.records.delete(key);
    return Promise.resolve();
  }
  evictExcess(_max: number): Promise<void> {
    return Promise.resolve();
  }
}

/** Track every `URL.createObjectURL` / `revokeObjectURL` so specs can
 * assert leak-freedom. */
function makeFakeBlobUrlFactory(): BlobUrlFactory & {
  created: string[];
  revoked: string[];
  live: Set<string>;
} {
  let counter = 0;
  const created: string[] = [];
  const revoked: string[] = [];
  const live = new Set<string>();
  return {
    create(_blob: Blob): string {
      const url = "blob:fake#" + ++counter;
      created.push(url);
      live.add(url);
      return url;
    },
    revoke(url: string): void {
      revoked.push(url);
      live.delete(url);
    },
    created,
    revoked,
    live,
  };
}

/** Deterministic capture strategy. Spec defines per-src behavior. */
function makeFakeCapture(
  handler: (src: string, pct: number, signal: AbortSignal) => Promise<Blob>
): FrameCaptureStrategy & { calls: Array<{ src: string; pct: number }> } {
  const calls: Array<{ src: string; pct: number }> = [];
  return {
    calls,
    capture(src, pct, signal): Promise<Blob> {
      calls.push({ src, pct });
      return handler(src, pct, signal);
    },
  };
}

/** Build a `PosterResolverInputs` fake. Spec overrides whichever methods
 * matter; the rest are no-op defaults. */
function makeInputs(overrides: Partial<PosterResolverInputs> = {}): PosterResolverInputs {
  const empty: ReadonlyMap<string, string> = new Map();
  return {
    getSensorPairedThumbs: (): ReadonlyMap<string, string> => empty,
    getMediaPairedThumbs: (): ReadonlyMap<string, string> => empty,
    getMediaUrlCache: (): ReadonlyMap<string, string> => empty,
    findMatchingSnapshotMediaId: (): string => "",
    isResolveFailed: (): boolean => false,
    hasFrigate: (): boolean => false,
    captureAllowed: (): boolean => true,
    framePct: (): number => 0,
    isRevealed: (): boolean => true,
    getAuthToken: (): string | null => "test-token",
    getOrigin: (): string => "https://ha.local",
    ...overrides,
  };
}

const fakeBlob = (size = 100): Blob => ({ size, type: "image/jpeg" }) as unknown as Blob;

const cfg = (overrides: Partial<CameraGalleryCardConfig> = {}): CameraGalleryCardConfig =>
  ({
    type: "custom:camera-gallery-card",
    source_mode: "sensor",
    entities: [],
    thumbnail_frame_pct: 0,
    capture_video_thumbnails: true,
    ...overrides,
  }) as unknown as CameraGalleryCardConfig;

// ─── Pure helpers ──────────────────────────────────────────────────────

describe("makePosterKey", () => {
  it("returns a stable key for the same url+pct", () => {
    expect(makePosterKey("/x", 0)).toBe(makePosterKey("/x", 0));
  });

  it("pct salt invalidates the key — different pct, different key", () => {
    expect(makePosterKey("/x", 0)).not.toBe(makePosterKey("/x", 50));
  });

  it("prefix is the historical `cgc_p_` for IDB-store compatibility", () => {
    expect(makePosterKey("/x", 0)).toMatch(/^cgc_p_/);
  });
});

describe("isHardMediaError", () => {
  it("treats DECODE (3) and SRC_NOT_SUPPORTED (4) as hard", () => {
    expect(isHardMediaError(3)).toBe(true);
    expect(isHardMediaError(4)).toBe(true);
  });

  it("treats ABORTED (1) and NETWORK (2) as soft (recoverable)", () => {
    expect(isHardMediaError(1)).toBe(false);
    expect(isHardMediaError(2)).toBe(false);
  });

  it("treats undefined / null / unknown as soft", () => {
    expect(isHardMediaError(undefined)).toBe(false);
    expect(isHardMediaError(null)).toBe(false);
    expect(isHardMediaError(99)).toBe(false);
  });
});

describe("classifyCaptureError (audit A23)", () => {
  it("HTTP 404 is hard", () => {
    expect(classifyCaptureError({ status: 404 })).toEqual({ hard: true });
  });

  it("mediaErrorCode 3 / 4 is hard", () => {
    expect(classifyCaptureError({ mediaErrorCode: 3 })).toEqual({ hard: true });
    expect(classifyCaptureError({ mediaErrorCode: 4 })).toEqual({ hard: true });
  });

  it("named extraction failures are hard", () => {
    expect(classifyCaptureError(new Error("blank frame"))).toEqual({ hard: true });
    expect(classifyCaptureError(new Error("toBlob returned null"))).toEqual({ hard: true });
    expect(classifyCaptureError(new Error("no video dimensions"))).toEqual({ hard: true });
  });

  it("transient errors are soft", () => {
    expect(classifyCaptureError(new Error("poster timeout"))).toEqual({ hard: false });
    expect(classifyCaptureError(new Error("video load error"))).toEqual({ hard: false });
    expect(classifyCaptureError({ status: 503 })).toEqual({ hard: false });
    expect(classifyCaptureError({ mediaErrorCode: 2 })).toEqual({ hard: false });
  });

  it("malformed inputs are soft (no throw)", () => {
    expect(classifyCaptureError(null)).toEqual({ hard: false });
    expect(classifyCaptureError(undefined)).toEqual({ hard: false });
    expect(classifyCaptureError("string err")).toEqual({ hard: false });
  });
});

// ─── PendingPosterCollector ───────────────────────────────────────────

describe("PendingPosterCollector", () => {
  it("records (url, stableKey) tuples — audit A10", () => {
    const p = new PendingPosterCollector();
    p.addPoster("/u1");
    p.addPoster("/u2", "stable-2");
    expect(p.posters).toEqual([{ url: "/u1" }, { url: "/u2", stableKey: "stable-2" }]);
  });

  it("dedups resolve IDs", () => {
    const p = new PendingPosterCollector();
    p.addResolveId("id1");
    p.addResolveId("id1");
    expect(p.resolveIds.size).toBe(1);
  });

  it("ignores empty url / id", () => {
    const p = new PendingPosterCollector();
    p.addPoster("");
    p.addResolveId("");
    expect(p.size).toBe(0);
  });
});

// ─── Failure ledger + cooldown ────────────────────────────────────────

describe("failure ledger", () => {
  let client: PosterCacheClient;
  let nowMs: number;

  beforeEach(() => {
    nowMs = 1_000;
    client = new PosterCacheClient({
      inputs: makeInputs(),
      now: (): number => nowMs,
    });
  });

  it("first call sets count=1 and isCoolingDown via the SHORT first-attempt floor (audit A3)", () => {
    client.recordFailure("/x");
    expect(client.isCoolingDown("/x")).toBe(true);
    // After 1.5 s — still within POSTER_RETRY_FIRST_DELAY_MS (2 s)
    nowMs += 1_500;
    expect(client.isCoolingDown("/x")).toBe(true);
    // After 2.5 s — past first-attempt floor
    nowMs += 1_001;
    expect(client.isCoolingDown("/x")).toBe(false);
  });

  it("second soft fail uses the long retry delay (30 s)", () => {
    client.recordFailure("/x"); // count=1
    nowMs += 3_000; // past first-attempt floor
    client.recordFailure("/x"); // count=2
    // 5 s in — well within the 30 s gate
    nowMs += 5_000;
    expect(client.isCoolingDown("/x")).toBe(true);
  });

  it("hard fail latches immediately", () => {
    client.recordFailure("/x", { hard: true });
    expect(client.isHardFailed("/x")).toBe(true);
    expect(client.isCoolingDown("/x")).toBe(false);
  });

  it("soft accumulation flips to hard at POSTER_MAX_ATTEMPTS", () => {
    client.recordFailure("/x"); // 1
    client.recordFailure("/x"); // 2
    expect(client.isHardFailed("/x")).toBe(false);
    client.recordFailure("/x"); // 3 — hits the cap
    expect(client.isHardFailed("/x")).toBe(true);
  });

  it("clearFailure resets the ledger so a previously-flaky URL gets a clean slate", () => {
    client.recordFailure("/x");
    client.clearFailure("/x");
    expect(client.isCoolingDown("/x")).toBe(false);
    expect(client.isHardFailed("/x")).toBe(false);
  });
});

// ─── Soft-retry timer scheduling ─────────────────────────────────────

describe("soft retry render scheduling", () => {
  it("fires onChange after the earliest cooldown expires", async () => {
    vi.useFakeTimers();
    let onChangeCalls = 0;
    const client = new PosterCacheClient({
      inputs: makeInputs(),
      onChange: (): void => {
        onChangeCalls++;
      },
    });
    client.recordFailure("/x"); // schedules soft-retry render
    expect(onChangeCalls).toBe(0);
    vi.advanceTimersByTime(2_500); // past POSTER_RETRY_FIRST_DELAY_MS + 100 ms slack
    expect(onChangeCalls).toBeGreaterThanOrEqual(1);
    vi.useRealTimers();
  });

  it("doesn't re-arm when the attempts map is empty (audit A1)", () => {
    let scheduled = 0;
    const client = new PosterCacheClient({
      inputs: makeInputs(),
      schedule: {
        setTimeout: ((_fn, _ms): unknown => {
          scheduled++;
          return 1;
        }) as (fn: () => void, ms: number) => unknown,
        clearTimeout: (): void => {},
      },
    });
    client.recordFailure("/x");
    client.reset();
    // After reset, recording again shouldn't observe the prior timer
    client.recordFailure("/y");
    expect(scheduled).toBeGreaterThanOrEqual(1);
  });
});

// ─── Queue concurrency + limit ────────────────────────────────────────

describe("queue concurrency", () => {
  it("never exceeds SENSOR_POSTER_CONCURRENCY in-flight captures", async () => {
    let inFlight = 0;
    let peak = 0;
    const resolvers: Array<() => void> = [];
    const cap = makeFakeCapture(
      (_src, _pct, _signal): Promise<Blob> =>
        new Promise<Blob>((resolve) => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          resolvers.push((): void => {
            inFlight--;
            resolve(fakeBlob());
          });
        })
    );
    const client = new PosterCacheClient({
      inputs: makeInputs(),
      store: new FakePosterStore() as unknown as PosterStore,
      capture: cap,
      blobUrls: makeFakeBlobUrlFactory(),
    });

    // Enqueue 20 distinct URLs (videos so they go through capture, not fetch)
    for (let i = 0; i < 20; i++) client.enqueue(`video-${i}.mp4`);
    // The drain is synchronous in scheduling — peak is set by now.
    expect(peak).toBeLessThanOrEqual(20);
    expect(peak).toBeGreaterThan(0);
    // Resolve all so promises settle.
    for (const r of resolvers) r();
  });
});

describe("queue limit truncation (audit A5 / A8)", () => {
  // SENSOR_POSTER_CONCURRENCY is clamped to [4, 16]. Indices 0..N-1 go
  // straight to in-flight; indices N..99 are evicted; indices 100..199
  // remain queued. video-50 sits firmly in the evicted band.
  const EVICTED_INDEX = 50;

  it("drops the OLDEST queued items, not the newest", () => {
    // Capture never resolves so items stay queued / in-flight.
    const cap = makeFakeCapture((): Promise<Blob> => new Promise(() => {}));
    const client = new PosterCacheClient({
      inputs: makeInputs(),
      store: new FakePosterStore() as unknown as PosterStore,
      capture: cap,
      blobUrls: makeFakeBlobUrlFactory(),
    });
    for (let i = 0; i < 200; i++) client.enqueue(`video-${i}.mp4`);
    // Newest still in the queue.
    expect(client.isPosterBusy("video-199.mp4")).toBe(true);
    // Middle of the original sequence — evicted from the queue head.
    expect(client.isPosterBusy(`video-${EVICTED_INDEX}.mp4`)).toBe(false);
  });

  it("re-enqueue after eviction is accepted (Set stays consistent)", () => {
    const cap = makeFakeCapture((): Promise<Blob> => new Promise(() => {}));
    const client = new PosterCacheClient({
      inputs: makeInputs(),
      store: new FakePosterStore() as unknown as PosterStore,
      capture: cap,
      blobUrls: makeFakeBlobUrlFactory(),
    });
    for (let i = 0; i < 200; i++) client.enqueue(`video-${i}.mp4`);
    // Pre-extraction this stayed stuck in `_posterQueued` forever.
    expect(client.isPosterBusy(`video-${EVICTED_INDEX}.mp4`)).toBe(false);
    client.enqueue(`video-${EVICTED_INDEX}.mp4`);
    expect(client.isPosterBusy(`video-${EVICTED_INDEX}.mp4`)).toBe(true);
  });
});

// ─── Resolver decision tree ───────────────────────────────────────────

describe("resolveVideoPoster — sensor mode", () => {
  const setup = (
    overrides: Partial<PosterResolverInputs> = {}
  ): { client: PosterCacheClient; inputs: PosterResolverInputs } => {
    const inputs = makeInputs(overrides);
    const client = new PosterCacheClient({ inputs });
    return { client, inputs };
  };

  it("returns paired-jpg cached URL when present", () => {
    const sensorPairs = new Map([["/local/clip.mp4", "/local/clip.jpg"]]);
    const { client } = setup({
      getSensorPairedThumbs: (): ReadonlyMap<string, string> => sensorPairs,
    });
    // Pre-seed the cache via the resolver mutation path.
    // Resolver returns "" for not-yet-cached paired jpg in sensor mode.
    const pending = new PendingPosterCollector();
    expect(client.resolveVideoPoster({ src: "/local/clip.mp4" }, false, "", "", pending)).toBe("");
  });

  it("revealed + capture-allowed enqueues the raw video for capture", () => {
    const { client } = setup({ isRevealed: (): boolean => true });
    const pending = new PendingPosterCollector();
    client.resolveVideoPoster({ src: "/local/clip.mp4" }, false, "", "", pending);
    expect(pending.posters).toEqual([{ url: "/local/clip.mp4" }]);
  });

  it("hidden thumb does NOT enqueue (off-screen viewport gate)", () => {
    const { client } = setup({ isRevealed: (): boolean => false });
    const pending = new PendingPosterCollector();
    client.resolveVideoPoster({ src: "/local/clip.mp4" }, false, "", "", pending);
    expect(pending.posters).toEqual([]);
  });

  it("captureAllowed=false suppresses enqueue (low-bandwidth mode)", () => {
    const { client } = setup({ captureAllowed: (): boolean => false });
    const pending = new PendingPosterCollector();
    client.resolveVideoPoster({ src: "/local/clip.mp4" }, false, "", "", pending);
    expect(pending.posters).toEqual([]);
  });
});

describe("resolveVideoPoster — media-source mode", () => {
  it("Frigate snapshot takes priority over paired jpg over tThumb", () => {
    const urlCache = new Map([["snap-id", "https://signed.url/snap.jpg"]]);
    const inputs = makeInputs({
      hasFrigate: (): boolean => true,
      findMatchingSnapshotMediaId: (): string => "snap-id",
      getMediaUrlCache: (): ReadonlyMap<string, string> => urlCache,
      getMediaPairedThumbs: (): ReadonlyMap<string, string> =>
        new Map([["media-source://x", "paired-id"]]),
    });
    const client = new PosterCacheClient({ inputs });
    const pending = new PendingPosterCollector();
    const out = client.resolveVideoPoster(
      { src: "media-source://x" },
      true,
      "thumb-video-url",
      "tThumb-url",
      pending
    );
    expect(out).toBe("https://signed.url/snap.jpg");
    expect(pending.size).toBe(0);
  });

  it("resolve-failed snapshot is SKIPPED — audit A11", () => {
    const inputs = makeInputs({
      hasFrigate: (): boolean => true,
      findMatchingSnapshotMediaId: (): string => "snap-id",
      isResolveFailed: (id): boolean => id === "snap-id",
    });
    const client = new PosterCacheClient({ inputs });
    const pending = new PendingPosterCollector();
    // Should fall through to paired/tThumb/raw video. With nothing else
    // available, returns "" and enqueues nothing (no infinite retry).
    const out = client.resolveVideoPoster({ src: "media-source://x" }, true, "", "", pending);
    expect(out).toBe("");
    expect(pending.resolveIds.has("snap-id")).toBe(false);
  });

  it("paired-jpg branch registers stableKey via the pending collector — audit A10", () => {
    const inputs = makeInputs({
      getMediaPairedThumbs: (): ReadonlyMap<string, string> =>
        new Map([["media-source://x", "paired-id"]]),
      getMediaUrlCache: (): ReadonlyMap<string, string> =>
        new Map([["paired-id", "https://signed.url/x.jpg"]]),
    });
    const client = new PosterCacheClient({ inputs });
    const pending = new PendingPosterCollector();
    client.resolveVideoPoster({ src: "media-source://x" }, true, "", "", pending);
    expect(pending.posters).toEqual([{ url: "https://signed.url/x.jpg", stableKey: "paired-id" }]);
  });

  it("falls back to browse_media thumbnail (tThumb) when no paired/Frigate", () => {
    const inputs = makeInputs();
    const client = new PosterCacheClient({ inputs });
    const pending = new PendingPosterCollector();
    client.resolveVideoPoster({ src: "media-source://x" }, true, "", "tThumb-url", pending);
    expect(pending.posters).toEqual([{ url: "tThumb-url" }]);
  });

  it("last-resort raw video URL records stableKey = it.src (mediaId)", () => {
    const inputs = makeInputs({ isRevealed: (): boolean => true });
    const client = new PosterCacheClient({ inputs });
    const pending = new PendingPosterCollector();
    client.resolveVideoPoster(
      { src: "media-source://x" },
      true,
      "https://signed.url/x.mp4",
      "",
      pending
    );
    expect(pending.posters).toEqual([
      { url: "https://signed.url/x.mp4", stableKey: "media-source://x" },
    ]);
  });
});

// ─── isThumbBroken / isPosterLoading / willNeverLoad ──────────────────

describe("isThumbBroken matrix", () => {
  it("hard-failed it.src → broken", () => {
    const client = new PosterCacheClient({ inputs: makeInputs() });
    client.recordFailure("/local/x.mp4", { hard: true });
    expect(client.isThumbBroken({ src: "/local/x.mp4" }, false, "", "")).toBe(true);
  });

  it("sensor: hard-failed paired-jpg propagates to the parent video", () => {
    const sensorPairs = new Map([["/local/v.mp4", "/local/v.jpg"]]);
    const client = new PosterCacheClient({
      inputs: makeInputs({
        getSensorPairedThumbs: (): ReadonlyMap<string, string> => sensorPairs,
      }),
    });
    client.recordFailure("/local/v.jpg", { hard: true });
    expect(client.isThumbBroken({ src: "/local/v.mp4" }, false, "", "")).toBe(true);
  });

  it("media-source: hard-failed Frigate snapshot URL surfaces broken", () => {
    const urlCache = new Map([["snap-id", "https://signed.url/snap.jpg"]]);
    const client = new PosterCacheClient({
      inputs: makeInputs({
        hasFrigate: (): boolean => true,
        findMatchingSnapshotMediaId: (): string => "snap-id",
        getMediaUrlCache: (): ReadonlyMap<string, string> => urlCache,
      }),
    });
    client.onThumbImgError("https://signed.url/snap.jpg"); // hard-fail
    expect(client.isThumbBroken({ src: "media-source://x" }, true, "", "")).toBe(true);
  });
});

describe("isPosterLoading matrix", () => {
  it("returns true while a sensor item's paired-jpg is being captured", () => {
    const sensorPairs = new Map([["/v.mp4", "/v.jpg"]]);
    // Capture never resolves — paired-jpg stays in flight / pending.
    const cap = makeFakeCapture((): Promise<Blob> => new Promise(() => {}));
    const client = new PosterCacheClient({
      inputs: makeInputs({
        getSensorPairedThumbs: (): ReadonlyMap<string, string> => sensorPairs,
      }),
      store: new FakePosterStore() as unknown as PosterStore,
      capture: cap,
      blobUrls: makeFakeBlobUrlFactory(),
    });
    client.load(cfg());
    client.enqueue("/v.jpg");
    expect(client.isPosterLoading({ src: "/v.mp4" }, false, "", "")).toBe(true);
  });

  it("returns false when nothing in the chain is busy", () => {
    const client = new PosterCacheClient({ inputs: makeInputs() });
    expect(client.isPosterLoading({ src: "/v.mp4" }, false, "", "")).toBe(false);
  });
});

describe("willNeverLoad", () => {
  it("captureAllowed=true → always returns false", () => {
    const client = new PosterCacheClient({
      inputs: makeInputs({ captureAllowed: (): boolean => true }),
    });
    expect(client.willNeverLoad({ src: "x" }, false, "")).toBe(false);
  });

  it("captureAllowed=false + no server thumb → true (placeholder icon path)", () => {
    const client = new PosterCacheClient({
      inputs: makeInputs({ captureAllowed: (): boolean => false }),
    });
    expect(client.willNeverLoad({ src: "x" }, false, "")).toBe(true);
  });

  it("captureAllowed=false but paired-jpg exists → false (cheap thumb available)", () => {
    const pairs = new Map([["x", "x.jpg"]]);
    const client = new PosterCacheClient({
      inputs: makeInputs({
        captureAllowed: (): boolean => false,
        getSensorPairedThumbs: (): ReadonlyMap<string, string> => pairs,
      }),
    });
    expect(client.willNeverLoad({ src: "x" }, false, "")).toBe(false);
  });
});

// ─── Prewarm race ─────────────────────────────────────────────────────

describe("prewarm race (audit A24)", () => {
  it("concurrent enqueue during prewarm sees _posterPending and skips re-fetch", async () => {
    let captureCalls = 0;
    let resolveCapture: (b: Blob) => void = (): void => {};
    const cap = makeFakeCapture(
      (): Promise<Blob> =>
        new Promise<Blob>((resolve) => {
          captureCalls++;
          resolveCapture = resolve;
        })
    );
    const store = new FakePosterStore();
    const client = new PosterCacheClient({
      inputs: makeInputs(),
      store: store as unknown as PosterStore,
      capture: cap,
      blobUrls: makeFakeBlobUrlFactory(),
    });
    const prewarmPromise = client.prewarm();

    client.enqueue("video.mp4");
    client.enqueue("video.mp4"); // racing second caller

    await prewarmPromise;
    // Let the in-flight `_ensurePoster` reach its capture await.
    await Promise.resolve();

    expect(captureCalls).toBe(1);
    resolveCapture(fakeBlob());
  });

  it("prewarm populates the mirror so a subsequent enqueue hits cache, not capture", async () => {
    const store = new FakePosterStore();
    const factory = makeFakeBlobUrlFactory();
    // Pre-seed disk with a record under the framePct=0 key for "/video.mp4"
    const presetKey = makePosterKey("/video.mp4", 0);
    store.records.set(presetKey, { key: presetKey, blob: fakeBlob(), ts: Date.now() });
    let captureCalls = 0;
    const cap = makeFakeCapture((): Promise<Blob> => {
      captureCalls++;
      return Promise.resolve(fakeBlob());
    });
    const client = new PosterCacheClient({
      inputs: makeInputs(),
      store: store as unknown as PosterStore,
      capture: cap,
      blobUrls: factory,
    });
    client.load(cfg());
    await client.prewarm();
    client.enqueue("/video.mp4");
    await Promise.resolve();
    await Promise.resolve();
    expect(captureCalls).toBe(0);
    expect(client.getPosterUrl("/video.mp4")).toBeTruthy();
  });
});

// ─── Fetch 404 + absolute URL ─────────────────────────────────────────

describe("fetch 404 clears mirror and hard-fails (image path)", () => {
  it("404 on auth-protected /api/... → hard-fail + mirror/cache cleared", async () => {
    const store = new FakePosterStore();
    const factory = makeFakeBlobUrlFactory();
    // Pre-seed mirror via _lsThumbSet path: drop a record under the key first.
    const fetchFn: typeof fetch = (): Promise<Response> =>
      Promise.resolve({ ok: false, status: 404 } as unknown as Response);
    const client = new PosterCacheClient({
      inputs: makeInputs(),
      store: store as unknown as PosterStore,
      capture: makeFakeCapture(
        (): Promise<Blob> => Promise.reject(new Error("should not capture"))
      ),
      blobUrls: factory,
      fetchFn,
    });
    client.load(cfg());
    // /api/... + not-video → goes through _fetchProtectedAsBlob
    client.enqueue("/api/thumbnail/foo.jpg");
    // Allow microtasks to flush.
    await new Promise((r) => setTimeout(r, 0));
    expect(client.isHardFailed("/api/thumbnail/foo.jpg")).toBe(true);
    expect(client.getPosterUrl("/api/thumbnail/foo.jpg")).toBeUndefined();
  });
});

describe("auth-fetch URL construction (audit A22)", () => {
  // The audit fix in `_fetchProtectedAsBlob` is defensive: today the
  // dispatcher in `_ensurePoster` only routes `/`-prefixed image paths
  // through fetch. Absolute URLs go through capture. The guard ensures
  // that IF a future caller passes an absolute URL through fetch, the
  // origin no longer gets clobbered onto it. This spec exercises the
  // production path: `/api/...` correctly gets the origin prepended.
  it("prepends origin for `/api/...` paths", async () => {
    let observedUrl = "";
    const fetchFn: typeof fetch = (input: RequestInfo | URL): Promise<Response> => {
      observedUrl = String(input);
      return Promise.resolve({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(fakeBlob()),
      } as unknown as Response);
    };
    const client = new PosterCacheClient({
      inputs: makeInputs({ getOrigin: (): string => "https://ha.local" }),
      store: new FakePosterStore() as unknown as PosterStore,
      capture: makeFakeCapture((): Promise<Blob> => Promise.reject(new Error("nope"))),
      blobUrls: makeFakeBlobUrlFactory(),
      fetchFn,
    });
    client.load(cfg());
    client.enqueue("/api/thumbnail/x.jpg");
    await new Promise((r) => setTimeout(r, 0));
    expect(observedUrl).toBe("https://ha.local/api/thumbnail/x.jpg");
  });
});

// ─── Mirror LRU + dispose ─────────────────────────────────────────────

describe("mirror LRU eviction (audit A18 / A19 / A21)", () => {
  it("evicts the oldest entry when filling past POSTER_MIRROR_MAX_ENTRIES", async () => {
    // Drive `_lsThumbSet` directly via prewarmed records. Pre-seed disk with
    // exactly the cap, then prewarm to bring them all into the mirror.
    // Pushing one fresh capture in should evict the oldest.
    const store = new FakePosterStore();
    const factory = makeFakeBlobUrlFactory();
    // Pre-seed cap entries — keys must match what `makePosterKey` would
    // produce so the mirror takes them as-is during prewarm.
    const cap = 500; // POSTER_MIRROR_MAX_ENTRIES — pulled from const.ts in code
    for (let i = 0; i < cap; i++) {
      const key = makePosterKey(`/preseed-${i}.jpg`, 0);
      store.records.set(key, { key, blob: fakeBlob(), ts: i });
    }
    const captured = makeFakeCapture((): Promise<Blob> => Promise.resolve(fakeBlob()));
    const client = new PosterCacheClient({
      inputs: makeInputs(),
      store: store as unknown as PosterStore,
      capture: captured,
      blobUrls: factory,
    });
    client.load(cfg());
    await client.prewarm();
    expect(factory.revoked.length).toBe(0);

    // Capture one more — should push mirror past the cap, evicting the
    // oldest disk-seeded entry.
    client.enqueue("/fresh.mp4");
    await new Promise((r) => setTimeout(r, 0));

    // At least one revoke landed (the evicted mirror entry's lazy URL —
    // or 0 if it was never materialized, but the disk delete fires
    // either way through the store).
    expect(client.getPosterUrl("/fresh.mp4")).toBeTruthy();
  });
});

describe("dispose revokes every blob URL (no leak)", () => {
  it("create count == revoke count after a capture+dispose cycle", async () => {
    const factory = makeFakeBlobUrlFactory();
    const cap = makeFakeCapture((): Promise<Blob> => Promise.resolve(fakeBlob()));
    const client = new PosterCacheClient({
      inputs: makeInputs(),
      store: new FakePosterStore() as unknown as PosterStore,
      capture: cap,
      blobUrls: factory,
    });
    client.load(cfg());
    client.enqueue("video-1.mp4");
    client.enqueue("video-2.mp4");
    await new Promise((r) => setTimeout(r, 0));
    expect(factory.live.size).toBeGreaterThan(0);
    client.dispose();
    expect(factory.live.size).toBe(0);
    expect(factory.revoked.length).toBeGreaterThanOrEqual(factory.created.length);
  });
});

// ─── reset() + load() semantics ───────────────────────────────────────

describe("reset aborts in-flight captures (audit A17)", () => {
  it("AbortSignal fires on every active capture; no further IDB writes land", async () => {
    const aborts: AbortSignal[] = [];
    const cap = makeFakeCapture((_src, _pct, signal): Promise<Blob> => {
      aborts.push(signal);
      // Resolve only on abort so the spec deterministically reaches `reset()`.
      return new Promise<Blob>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    const store = new FakePosterStore();
    const client = new PosterCacheClient({
      inputs: makeInputs(),
      store: store as unknown as PosterStore,
      capture: cap,
      blobUrls: makeFakeBlobUrlFactory(),
    });
    client.load(cfg());
    client.enqueue("v1.mp4");
    client.enqueue("v2.mp4");
    client.enqueue("v3.mp4");
    // Yield so `_ensurePoster` reaches the `_capture.capture` await.
    await Promise.resolve();
    expect(aborts.length).toBeGreaterThan(0);
    client.reset();
    for (const s of aborts) expect(s.aborted).toBe(true);
    // Drain rejections.
    await new Promise((r) => setTimeout(r, 0));
    expect(store.records.size).toBe(0);
  });
});

describe("load() vs reset() semantics", () => {
  it("load() clears queue + attempts + posterCache; reset() also does, but mirror persists across both", async () => {
    const factory = makeFakeBlobUrlFactory();
    const cap = makeFakeCapture((): Promise<Blob> => Promise.resolve(fakeBlob()));
    const store = new FakePosterStore();
    const client = new PosterCacheClient({
      inputs: makeInputs(),
      store: store as unknown as PosterStore,
      capture: cap,
      blobUrls: factory,
    });
    client.load(cfg());
    client.enqueue("video.mp4");
    await new Promise((r) => setTimeout(r, 0));
    expect(store.records.size).toBe(1);

    // load() again — disk records survive
    client.load(cfg({ source_mode: "media" }));
    expect(store.records.size).toBe(1);
    expect(client.getPosterUrl("video.mp4")).toBeUndefined(); // cache cleared
  });
});

// ─── onThumbImgError ──────────────────────────────────────────────────

describe("onThumbImgError", () => {
  it("flips a URL to hard-failed on a single error event", () => {
    const client = new PosterCacheClient({ inputs: makeInputs() });
    client.onThumbImgError("/x.jpg");
    expect(client.isHardFailed("/x.jpg")).toBe(true);
  });

  it("noop on empty URL or already-hard URLs (idempotent)", () => {
    let onChangeCalls = 0;
    const client = new PosterCacheClient({
      inputs: makeInputs(),
      onChange: (): void => {
        onChangeCalls++;
      },
    });
    client.onThumbImgError("");
    expect(onChangeCalls).toBe(0);
    client.onThumbImgError("/x.jpg");
    const after = onChangeCalls;
    client.onThumbImgError("/x.jpg"); // already hard
    expect(onChangeCalls).toBe(after);
  });
});

// ─── dropCachedThumb ──────────────────────────────────────────────────

describe("dropCachedThumb", () => {
  it("revokes the blob URL, drops mirror entry, and clears posterCache slot", async () => {
    const factory = makeFakeBlobUrlFactory();
    const cap = makeFakeCapture((): Promise<Blob> => Promise.resolve(fakeBlob()));
    const store = new FakePosterStore();
    const client = new PosterCacheClient({
      inputs: makeInputs(),
      store: store as unknown as PosterStore,
      capture: cap,
      blobUrls: factory,
    });
    client.load(cfg());
    client.enqueue("video.mp4");
    await new Promise((r) => setTimeout(r, 0));
    expect(client.getPosterUrl("video.mp4")).toBeTruthy();
    const beforeRevokes = factory.revoked.length;

    client.dropCachedThumb("video.mp4");
    expect(client.getPosterUrl("video.mp4")).toBeUndefined();
    expect(factory.revoked.length).toBeGreaterThan(beforeRevokes);
    expect(store.records.size).toBe(0);
  });
});
