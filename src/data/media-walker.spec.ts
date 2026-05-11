import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CameraGalleryCardConfig } from "../config/normalize";
import { makeFakeHass, type FakeHass, type WsHandler } from "../test/fake-hass";
import { MediaSourceClient, isMediaSourceId, keyFromRoots, type MsItem } from "./media-walker";

const baseConfig = (overrides: Partial<CameraGalleryCardConfig> = {}): CameraGalleryCardConfig =>
  ({
    type: "custom:camera-gallery-card",
    source_mode: "media",
    media_sources: ["media-source://media_source/local/recordings"],
    path_datetime_format: "YYYYMMDD_HHmmss",
    max_media: 50,
    ...overrides,
  }) as unknown as CameraGalleryCardConfig;

class MemoryStorage implements Storage {
  private _data = new Map<string, string>();
  get length(): number {
    return this._data.size;
  }
  clear(): void {
    this._data.clear();
  }
  getItem(key: string): string | null {
    return this._data.get(key) ?? null;
  }
  key(i: number): string | null {
    return Array.from(this._data.keys())[i] ?? null;
  }
  removeItem(key: string): void {
    this._data.delete(key);
  }
  setItem(key: string, value: string): void {
    this._data.set(key, value);
  }
}

let storedLs: Storage | undefined;

beforeEach(() => {
  storedLs = globalThis.localStorage as Storage | undefined;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
  });
});

afterEach(() => {
  if (storedLs !== undefined) {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storedLs,
    });
  }
  vi.useRealTimers();
});

describe("isMediaSourceId", () => {
  it("matches media-source URIs", () => {
    expect(isMediaSourceId("media-source://media_source/local/clip.mp4")).toBe(true);
  });
  it("rejects bare paths", () => {
    expect(isMediaSourceId("/local/clip.mp4")).toBe(false);
    expect(isMediaSourceId(null)).toBe(false);
    expect(isMediaSourceId(undefined)).toBe(false);
  });
});

describe("keyFromRoots", () => {
  it("returns empty string for empty input", () => {
    expect(keyFromRoots([])).toBe("");
    expect(keyFromRoots(null)).toBe("");
    expect(keyFromRoots(undefined)).toBe("");
  });

  it("sorts so YAML reorder doesn't change the key", () => {
    const a = keyFromRoots(["media-source://b", "media-source://a"]);
    const b = keyFromRoots(["media-source://a", "media-source://b"]);
    expect(a).toBe(b);
  });
});

describe("MediaSourceClient — basic state + load lifecycle", () => {
  let hass: FakeHass;
  let client: MediaSourceClient;

  beforeEach(() => {
    hass = makeFakeHass();
    client = new MediaSourceClient();
    client.setHass(hass);
  });

  it("starts empty", () => {
    expect(client.getIds()).toEqual([]);
    expect(client.isLoading()).toBe(false);
    expect(client.getMetaById("anything")).toEqual({ cls: "", mime: "", title: "", thumb: "" });
  });

  it("setList builds list + listIndex + pairedThumbs", () => {
    const a: MsItem = {
      id: "media-source://x/clip.mp4",
      title: "clip.mp4",
      cls: "video",
      mime: "video/mp4",
      thumb: "",
    };
    const b: MsItem = {
      id: "media-source://x/clip.jpg",
      title: "clip.jpg",
      cls: "image",
      mime: "image/jpeg",
      thumb: "",
    };
    client.setList([a, b]);

    // Same-stem jpg paired and removed from the rendered list.
    expect(client.getIds()).toEqual([a.id]);
    expect(client.getPairedThumbs().get(a.id)).toBe(b.id);
    expect(client.getMetaById(a.id).title).toBe("clip.mp4");
  });

  it("getItems returns CardItem[] for the dedupedlist", () => {
    client.setList([
      { id: "media-source://x/a.mp4", title: "a", cls: "video", mime: "video/mp4", thumb: "" },
      { id: "media-source://x/b.mp4", title: "b", cls: "video", mime: "video/mp4", thumb: "" },
    ]);
    const enrich = vi.fn((src: string) => ({ src, dtMs: 42 }));
    const out = client.getItems(enrich);
    expect(out.map((x) => x.src)).toEqual(["media-source://x/a.mp4", "media-source://x/b.mp4"]);
    expect(enrich).toHaveBeenCalledTimes(2);
  });

  it("clearForNewRoots resets every state slot", () => {
    client.setList([
      { id: "media-source://x/clip.mp4", title: "x", cls: "video", mime: "video/mp4", thumb: "" },
    ]);
    client.state.urlCache.set("media-source://x/clip.mp4", "/api/x");
    client.state.loadedAt = Date.now();
    client.state.key = "stale";
    client.frigateSnapshots = [
      { id: "snap", title: "", cls: "image", mime: "image/jpeg", thumb: "" },
    ];

    client.clearForNewRoots();

    expect(client.state.key).toBe("");
    expect(client.state.list).toEqual([]);
    expect(client.state.loadedAt).toBe(0);
    expect(client.state.urlCache.size).toBe(0);
    expect(client.frigateSnapshots).toEqual([]);
    expect(client.snapshotCache.size).toBe(0);
  });
});

describe("MediaSourceClient.resolve", () => {
  let hass: FakeHass;
  let client: MediaSourceClient;
  const id = "media-source://media_source/local/clip.mp4";

  beforeEach(() => {
    hass = makeFakeHass();
    client = new MediaSourceClient();
    client.setHass(hass);
  });

  it("calls media_source/resolve_media and caches the URL", async () => {
    const handler: WsHandler = vi.fn(() => ({ url: "/api/local/clip.mp4" }));
    hass.registerWs("media_source/resolve_media", handler);

    const url = await client.resolve(id);
    expect(url).toBe("/api/local/clip.mp4");
    expect(client.getUrlCache().get(id)).toBe("/api/local/clip.mp4");

    // Second call hits the cache; no extra WS call.
    const url2 = await client.resolve(id);
    expect(url2).toBe("/api/local/clip.mp4");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("latches into resolveFailed when the WS rejects", async () => {
    hass.registerWs("media_source/resolve_media", () => {
      throw new Error("nope");
    });

    const url = await client.resolve(id);
    expect(url).toBe("");
    expect(client.resolveFailed.has(id)).toBe(true);
  });

  it("latches when the WS returns no url", async () => {
    hass.registerWs("media_source/resolve_media", () => ({}));
    const url = await client.resolve(id);
    expect(url).toBe("");
    expect(client.resolveFailed.has(id)).toBe(true);
  });

  it("returns '' without WS when hass is unset", async () => {
    client.setHass(null);
    const url = await client.resolve(id);
    expect(url).toBe("");
    expect(client.resolveFailed.has(id)).toBe(true);
  });
});

describe("MediaSourceClient.queueResolve", () => {
  let hass: FakeHass;
  let client: MediaSourceClient;

  beforeEach(() => {
    hass = makeFakeHass();
    client = new MediaSourceClient();
    client.setHass(hass);
    hass.registerWs("media_source/resolve_media", (p) => ({
      url: `/api/${String(p["media_content_id"])}`,
    }));
  });

  it("drains the queue and resolves every id", async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `media-source://x/${i}.mp4`);
    client.queueResolve(ids);
    // wait until drain completes
    while (client.resolveInFlight) {
      await new Promise((r) => setTimeout(r, 1));
    }
    for (const id of ids) {
      expect(client.getUrlCache().has(id)).toBe(true);
    }
  });

  it("skips already-cached ids", async () => {
    const handler: WsHandler = vi.fn((p) => ({
      url: `/api/${String(p["media_content_id"])}`,
    }));
    hass.registerWs("media_source/resolve_media", handler);

    const cached = "media-source://x/cached.mp4";
    client.state.urlCache.set(cached, "/api/cached");
    client.queueResolve([cached, "media-source://x/fresh.mp4"]);
    while (client.resolveInFlight) {
      await new Promise((r) => setTimeout(r, 1));
    }

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ media_content_id: "media-source://x/fresh.mp4" })
    );
  });

  it("skips ids in resolveFailed", async () => {
    const handler = vi.fn(() => ({ url: "/api/x" }));
    hass.registerWs("media_source/resolve_media", handler);

    client.resolveFailed.set("media-source://x/dead.mp4", Date.now());
    client.queueResolve(["media-source://x/dead.mp4"]);
    await new Promise((r) => setTimeout(r, 5));
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("MediaSourceClient.findMatchingSnapshotMediaId", () => {
  let client: MediaSourceClient;

  beforeEach(() => {
    client = new MediaSourceClient();
    client.frigateSnapshots = [
      {
        id: "media-source://frigate/snapshots/1700000000.123-abc.jpg",
        title: "1700000000.123-abc.jpg",
        cls: "image",
        mime: "image/jpeg",
        thumb: "",
        dtMs: 1700000000_000,
      },
      {
        id: "media-source://frigate/snapshots/1700000005.456-xyz.jpg",
        title: "1700000005.456-xyz.jpg",
        cls: "image",
        mime: "image/jpeg",
        thumb: "",
        dtMs: 1700000005_000,
      },
    ];
  });

  it("returns '' for empty input", () => {
    expect(client.findMatchingSnapshotMediaId("")).toBe("");
  });

  it("returns '' when no snapshots are loaded", () => {
    client.frigateSnapshots = [];
    const out = client.findMatchingSnapshotMediaId("media-source://frigate/clips/1.mp4");
    expect(out).toBe("");
    // cache populated to prevent re-walks
    expect(client.snapshotCache.has("media-source://frigate/clips/1.mp4")).toBe(true);
  });

  it("matches by exact filename stem", () => {
    const out = client.findMatchingSnapshotMediaId(
      "media-source://frigate/clips/1700000000.123-abc.mp4"
    );
    expect(out).toBe("media-source://frigate/snapshots/1700000000.123-abc.jpg");
  });

  it("matches by substring fallback when the snapshot id contains the video stem", () => {
    // Substring direction is `snapshot_id.includes(videoStem)`. That fits
    // when Frigate emits clip names like `unique-key.mp4` and snapshots
    // named `unique-key-extra-suffix.jpg`.
    const local = new MediaSourceClient();
    local.frigateSnapshots = [
      {
        id: "media-source://frigate/snapshots/abc123-decorated.jpg",
        title: "abc123-decorated.jpg",
        cls: "image",
        mime: "image/jpeg",
        thumb: "",
      },
    ];
    const out = local.findMatchingSnapshotMediaId("media-source://frigate/clips/abc123.mp4");
    expect(out).toBe("media-source://frigate/snapshots/abc123-decorated.jpg");
  });

  it("uses fuzzy ms match within ±15s when stem/substring fail", () => {
    const local = new MediaSourceClient({
      resolveItemMs: () => 1700000003_000,
    });
    local.frigateSnapshots = client.frigateSnapshots.slice();
    const out = local.findMatchingSnapshotMediaId(
      "media-source://frigate/clips/some-unrelated-name.mp4"
    );
    // 1700000005.456 is closer (2s) vs 1700000000.123 (3s)
    expect(out).toBe("media-source://frigate/snapshots/1700000005.456-xyz.jpg");
  });

  it("returns '' when fuzzy match exceeds the window", () => {
    const local = new MediaSourceClient({
      resolveItemMs: () => 1700000100_000, // 95s away from nearest snapshot
    });
    local.frigateSnapshots = client.frigateSnapshots.slice();
    const out = local.findMatchingSnapshotMediaId("media-source://frigate/clips/no-stem-match.mp4");
    expect(out).toBe("");
  });

  it("caches the result", () => {
    const src = "media-source://frigate/clips/1700000000.123-abc.mp4";
    client.findMatchingSnapshotMediaId(src);
    expect(client.snapshotCache.get(src)).toBe(
      "media-source://frigate/snapshots/1700000000.123-abc.jpg"
    );
  });
});

describe("MediaSourceClient.ensureLoaded", () => {
  let hass: FakeHass;
  let client: MediaSourceClient;

  beforeEach(() => {
    hass = makeFakeHass();
    client = new MediaSourceClient();
    client.setHass(hass);
  });

  it("no-ops when media_sources is empty", async () => {
    client.load(baseConfig({ media_sources: [] }));
    const browse = vi.fn();
    hass.registerWs("media_source/browse_media", browse);
    await client.ensureLoaded();
    expect(browse).not.toHaveBeenCalled();
  });

  it("walks the configured root and stores items matching the format", async () => {
    const root = "media-source://media_source/local/recordings";
    const child = (id: string, title: string): unknown => ({
      title,
      media_class: "video",
      media_content_type: "video/mp4",
      media_content_id: id,
      can_play: true,
      can_expand: false,
      thumbnail: null,
      children: [],
    });
    hass.registerWs("media_source/browse_media", (p) => {
      if (p["media_content_id"] === root) {
        return {
          title: "recordings",
          media_class: "directory",
          media_content_type: "directory",
          media_content_id: root,
          can_play: false,
          can_expand: true,
          thumbnail: null,
          children: [
            child(`${root}/20260502_120030.mp4`, "20260502_120030.mp4"),
            child(`${root}/20260501_080000.mp4`, "20260501_080000.mp4"),
          ],
        };
      }
      return null;
    });

    client.load(baseConfig({ media_sources: [root] }));
    await client.ensureLoaded();

    const ids = client.getIds().sort();
    expect(ids).toEqual([`${root}/20260501_080000.mp4`, `${root}/20260502_120030.mp4`]);
  });

  it("drops stale results when load(config) bumps the generation mid-flight (B1, R5)", async () => {
    const root = "media-source://media_source/local/recordings";
    const child = (id: string, title: string): unknown => ({
      title,
      media_class: "video",
      media_content_type: "video/mp4",
      media_content_id: id,
      can_play: true,
      can_expand: false,
      thumbnail: null,
      children: [],
    });
    let release: (value: unknown) => void;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    hass.registerWs("media_source/browse_media", async (p) => {
      await gate;
      return {
        title: "stale",
        media_class: "directory",
        media_content_type: "directory",
        media_content_id: p["media_content_id"] as string,
        can_play: false,
        can_expand: true,
        thumbnail: null,
        children: [child(`${root}/stale.mp4`, "stale.mp4")],
      };
    });

    client.load(baseConfig({ media_sources: [root] }));
    const inflight = client.ensureLoaded();

    // Mid-flight, the user reconfigures roots. clearForNewRoots bumps the
    // generation; the in-flight load discards its results on completion.
    client.load(baseConfig({ media_sources: ["media-source://media_source/local/other"] }));
    release!(undefined);
    await inflight;

    expect(client.getIds()).toEqual([]);
    // loading flag must not stay true after a stale-drop (would deadlock the next ensureLoaded)
    expect(client.isLoading()).toBe(false);
  });

  it("clears every cache when media_sources changes (B10)", async () => {
    const a = "media-source://media_source/local/a";
    const b = "media-source://media_source/local/b";
    client.load(baseConfig({ media_sources: [a] }));
    client.setList([{ id: `${a}/x.mp4`, title: "x", cls: "video", mime: "video/mp4", thumb: "" }]);
    client.state.urlCache.set(`${a}/x.mp4`, "/api/x");
    client.state.loadedAt = Date.now();
    client.frigateSnapshots = [
      { id: "snap", title: "", cls: "image", mime: "image/jpeg", thumb: "" },
    ];

    client.load(baseConfig({ media_sources: [b] }));

    expect(client.getIds()).toEqual([]);
    expect(client.state.urlCache.size).toBe(0);
    expect(client.state.loadedAt).toBe(0);
    expect(client.frigateSnapshots).toEqual([]);
    expect(client.snapshotCache.size).toBe(0);
  });

  it("clears caches when frigate_url changes even if media_sources is unchanged (B10)", () => {
    const root = "media-source://frigate/clips";
    client.load(baseConfig({ media_sources: [root], frigate_url: "http://a:5000" }));
    client.setList([
      { id: `${root}/x.mp4`, title: "x", cls: "video", mime: "video/mp4", thumb: "" },
    ]);
    client.state.urlCache.set(`${root}/x.mp4`, "/api/x");

    client.load(baseConfig({ media_sources: [root], frigate_url: "http://b:5000" }));

    expect(client.getIds()).toEqual([]);
    expect(client.state.urlCache.size).toBe(0);
  });

  it("drops empty short-circuit dayCache entries when a fresh discovery finds them in the calendar", async () => {
    // Reproduces the bug where a sensor-only day (or a stale-cached day) had
    // dayCache.set(dayKey, []) — and after a fresh calendar discovery added
    // that day to the calendar, ensureDayLoaded still hit the empty cache
    // and never re-fetched, leaving the gallery blank for that day.
    const root = "media-source://x";
    hass.registerWs("media_source/browse_media", (p) => {
      const id = String(p["media_content_id"]);
      if (id === root) {
        return {
          title: "x",
          media_class: "directory",
          media_content_type: "directory",
          media_content_id: root,
          can_play: false,
          can_expand: true,
          thumbnail: null,
          children: [
            {
              title: "20260502",
              media_class: "directory",
              media_content_type: "directory",
              media_content_id: `${root}/20260502`,
              can_play: false,
              can_expand: true,
              thumbnail: null,
              children: [],
            },
          ],
        };
      }
      if (id === `${root}/20260502`) {
        return {
          title: "20260502",
          media_class: "directory",
          media_content_type: "directory",
          media_content_id: id,
          can_play: false,
          can_expand: true,
          thumbnail: null,
          children: [
            {
              title: "120030.mp4",
              media_class: "video",
              media_content_type: "video/mp4",
              media_content_id: `${root}/20260502/120030.mp4`,
              can_play: true,
              can_expand: false,
              thumbnail: null,
              children: [],
            },
          ],
        };
      }
      return null;
    });

    // Pre-populate a "stale" empty short-circuit entry mimicking a cached
    // calendar that didn't yet know about 2026-05-02.
    client.load(baseConfig({ media_sources: [root], path_datetime_format: "YYYYMMDD/HHmmss.mp4" }));
    client.state.dayCache.set("2026-05-02", []);
    // Plant a stale cached calendar so the empty-entry-drop path runs.
    client.state.calendar = { byDay: new Map(), days: [] };
    // Use localStorage to simulate a cached calendar that survives across
    // ensureLoaded calls.
    const fakeCalKey = "cgc_mscal1_X";
    localStorage.setItem(
      fakeCalKey,
      JSON.stringify({ ts: Date.now() - 10 * 60 * 60 * 1000, byDay: [], days: [] })
    );

    await client.ensureLoaded();
    // The fresh discovery should have written 2026-05-02 to the calendar AND
    // dropped the empty short-circuit dayCache entry. The newest-day auto
    // load should then have populated the day with the actual file.
    expect(client.getDays()).toContain("2026-05-02");
    const items = client.state.dayCache.get("2026-05-02") ?? [];
    expect(items.length).toBe(1);
    expect(items[0]?.id).toBe(`${root}/20260502/120030.mp4`);
  });

  it("clears the calendar + day caches when media_sources changes (review A1)", () => {
    const a = "media-source://media_source/local/a";
    const b = "media-source://media_source/local/b";
    client.load(baseConfig({ media_sources: [a] }));
    client.state.dayCache.set("2026-04-30", [
      { id: `${a}/x.mp4`, title: "x", cls: "video", mime: "video/mp4", thumb: "" },
    ]);
    client.state.calendar = {
      byDay: new Map([
        ["2026-04-30", [{ leafId: `${a}/2026/04/30`, leafName: "30", dayKey: "2026-04-30" }]],
      ]),
      days: ["2026-04-30"],
    };

    client.load(baseConfig({ media_sources: [b] }));

    expect(client.state.dayCache.size).toBe(0);
    expect(client.state.calendar.days).toEqual([]);
    expect(client.getDays()).toEqual([]);
  });

  it("does not clear when load(config) is called with the same roots", () => {
    const root = "media-source://media_source/local/a";
    client.load(baseConfig({ media_sources: [root] }));
    client.setList([
      { id: `${root}/x.mp4`, title: "x", cls: "video", mime: "video/mp4", thumb: "" },
    ]);

    // Same config again — shouldn't bust the cache.
    client.load(baseConfig({ media_sources: [root] }));

    expect(client.getIds()).toEqual([`${root}/x.mp4`]);
  });

  it("expires resolveFailed entries after MS_RESOLVE_FAILURE_TTL_MS (B4)", async () => {
    const id = "media-source://x/dead.mp4";
    client.load(baseConfig({ media_sources: ["media-source://x"] }));

    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    client.resolveFailed.set(id, 0);

    expect(client.isResolveFailed(id)).toBe(true);

    // 30s in — still latched.
    vi.setSystemTime(new Date(30_000));
    expect(client.isResolveFailed(id)).toBe(true);

    // 61s in — expired and pruned.
    vi.setSystemTime(new Date(61_000));
    expect(client.isResolveFailed(id)).toBe(false);
    expect(client.resolveFailed.has(id)).toBe(false);
  });

  it("re-attempts queueResolve for IDs whose failure has expired (B4)", async () => {
    const id = "media-source://x/recoverable.mp4";
    const handler: WsHandler = vi.fn(() => ({ url: "/api/recoverable" }));
    hass.registerWs("media_source/resolve_media", handler);

    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    client.resolveFailed.set(id, 0);

    // Within TTL: skipped.
    client.queueResolve([id]);
    while (client.resolveInFlight) await vi.advanceTimersByTimeAsync(1);
    expect(handler).not.toHaveBeenCalled();

    // After TTL: re-attempted.
    vi.setSystemTime(new Date(61_000));
    client.queueResolve([id]);
    vi.useRealTimers();
    while (client.resolveInFlight) await new Promise((r) => setTimeout(r, 1));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(client.getUrlCache().get(id)).toBe("/api/recoverable");
  });
});
