import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CameraGalleryCardConfig } from "../config/normalize";
import { makeFakeHass, type FakeHass, type WsHandler } from "../test/fake-hass";
import {
  MediaSourceClient,
  isMediaSourceId,
  isRenderable,
  keyFromRoots,
  walkCacheKey,
  type MsItem,
} from "./media-walker";

const baseConfig = (overrides: Partial<CameraGalleryCardConfig> = {}): CameraGalleryCardConfig =>
  ({
    type: "custom:camera-gallery-card",
    source_mode: "media",
    media_sources: ["media-source://media_source/local/recordings"],
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

describe("isRenderable", () => {
  it("accepts video MIME types", () => {
    expect(isRenderable("video/mp4", "", "")).toBe(true);
  });
  it("accepts image MIME types", () => {
    expect(isRenderable("image/jpeg", "", "")).toBe(true);
  });
  it("accepts file extensions in titles", () => {
    expect(isRenderable("", "", "clip.mp4")).toBe(true);
    expect(isRenderable("", "", "thumb.JPG")).toBe(true);
  });
  it("accepts media classes", () => {
    expect(isRenderable("", "video", "")).toBe(true);
    expect(isRenderable("", "image", "")).toBe(true);
  });
  it("rejects directories and unknown shapes", () => {
    expect(isRenderable("", "directory", "2026-04-28")).toBe(false);
    expect(isRenderable("", "", "")).toBe(false);
  });
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

describe("walkCacheKey", () => {
  it("produces a stable cgc_mswalk3_ prefixed key", () => {
    expect(walkCacheKey("media-source://x")).toMatch(/^cgc_mswalk3_/);
    expect(walkCacheKey("media-source://x")).toBe(walkCacheKey("media-source://x"));
  });
  it("differs for different inputs", () => {
    expect(walkCacheKey("a")).not.toBe(walkCacheKey("b"));
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

    client.resolveFailed.add("media-source://x/dead.mp4");
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

  it("walks the configured root and stores the resulting list", async () => {
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
          children: [child(`${root}/a.mp4`, "a.mp4"), child(`${root}/b.mp4`, "b.mp4")],
        };
      }
      return null;
    });

    client.load(baseConfig({ media_sources: [root] }));
    await client.ensureLoaded();

    const ids = client.getIds().sort();
    expect(ids).toEqual([`${root}/a.mp4`, `${root}/b.mp4`]);
  });

  it("serves from the persistent walk cache when available", async () => {
    const root = "media-source://media_source/local/recordings";
    const cacheKey = walkCacheKey(keyFromRoots([root]));
    const cached: MsItem[] = [
      {
        id: `${root}/cached.mp4`,
        title: "cached.mp4",
        cls: "video",
        mime: "video/mp4",
        thumb: "",
      },
    ];
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), list: cached }));

    const browse = vi.fn();
    hass.registerWs("media_source/browse_media", browse);

    client.load(baseConfig({ media_sources: [root] }));
    await client.ensureLoaded();

    expect(client.getIds()).toEqual([`${root}/cached.mp4`]);
    // Fresh cache → no synchronous walk on the first call.
    expect(browse).not.toHaveBeenCalled();
  });
});
