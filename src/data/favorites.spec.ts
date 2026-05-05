import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FavoritesStore, favoritesKey } from "./favorites";

class MemoryStorage {
  store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

class QuotaExceededStorage extends MemoryStorage {
  override setItem(_key: string, _value: string): void {
    const e = new Error("quota");
    e.name = "QuotaExceededError";
    throw e;
  }
}

class ThrowingReadStorage extends MemoryStorage {
  override getItem(_key: string): string | null {
    throw new Error("read denied");
  }
}

describe("favoritesKey", () => {
  it("is deterministic for a given config (sorted)", () => {
    const a = favoritesKey({ entities: ["sensor.b", "sensor.a"], media_sources: [] });
    const b = favoritesKey({ entities: ["sensor.a", "sensor.b"], media_sources: [] });
    expect(a).toBe(b);
  });

  it("treats undefined and empty arrays equivalently", () => {
    expect(favoritesKey({})).toBe(favoritesKey({ entities: [], media_sources: [] }));
  });

  it("starts with the legacy `cgc_favs_cgc_p_` prefix (existing-user compat)", () => {
    const k = favoritesKey({ entities: ["sensor.x"] });
    expect(k.startsWith("cgc_favs_cgc_p_")).toBe(true);
  });

  it("differs when the entity set differs", () => {
    expect(favoritesKey({ entities: ["sensor.a"] })).not.toBe(
      favoritesKey({ entities: ["sensor.b"] })
    );
  });

  it("locks legacy hash output for empty config", () => {
    // Locked-in regression: existing users running an empty-entities
    // config (no sensors yet, just default config) should keep their
    // favorites across this refactor. The legacy key for empty input is
    // `cgc_favs_cgc_p_ztntfp` (FNV-1a basis on "" → "ztntfp" base36).
    expect(favoritesKey({})).toBe("cgc_favs_cgc_p_ztntfp");
  });
});

describe("FavoritesStore", () => {
  let storage: MemoryStorage;
  let onChange: ReturnType<typeof vi.fn<() => void>>;
  const config = { entities: ["sensor.cam"], media_sources: [] };

  beforeEach(() => {
    storage = new MemoryStorage();
    onChange = vi.fn<() => void>();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts empty before load()", () => {
    const store = new FavoritesStore({ storage, onChange });
    expect(store.size).toBe(0);
    expect(store.has("anything")).toBe(false);
  });

  it("loads the persisted set from storage", () => {
    const key = favoritesKey(config);
    storage.setItem(key, JSON.stringify(["/a.mp4", "/b.mp4"]));
    const store = new FavoritesStore({ storage, onChange });
    store.load(config);
    expect(store.size).toBe(2);
    expect(store.has("/a.mp4")).toBe(true);
    expect(store.has("/b.mp4")).toBe(true);
  });

  it("toggle() adds and persists the entry", () => {
    const store = new FavoritesStore({ storage, onChange });
    store.load(config);
    store.toggle("/a.mp4");
    expect(store.has("/a.mp4")).toBe(true);
    expect(JSON.parse(storage.getItem(favoritesKey(config)) as string)).toEqual(["/a.mp4"]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("toggle() removes and persists when entry already exists", () => {
    const store = new FavoritesStore({ storage, onChange });
    store.load(config);
    store.toggle("/a.mp4");
    store.toggle("/a.mp4");
    expect(store.has("/a.mp4")).toBe(false);
    expect(JSON.parse(storage.getItem(favoritesKey(config)) as string)).toEqual([]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("load() recomputes the key when the config changes", () => {
    const store = new FavoritesStore({ storage, onChange });
    store.load({ entities: ["sensor.a"] });
    store.toggle("/x.mp4");
    expect(store.has("/x.mp4")).toBe(true);

    store.load({ entities: ["sensor.b"] });
    expect(store.has("/x.mp4")).toBe(false);
  });

  it("load() reverts to the original key when config swaps back", () => {
    const store = new FavoritesStore({ storage, onChange });
    store.load({ entities: ["sensor.a"] });
    store.toggle("/x.mp4");

    store.load({ entities: ["sensor.b"] });
    expect(store.has("/x.mp4")).toBe(false);

    store.load({ entities: ["sensor.a"] });
    expect(store.has("/x.mp4")).toBe(true);
  });

  it("values() exposes a read-only iterator", () => {
    const store = new FavoritesStore({ storage, onChange });
    store.load(config);
    store.toggle("/a.mp4");
    store.toggle("/b.mp4");
    expect([...store.values()].sort()).toEqual(["/a.mp4", "/b.mp4"]);
  });

  it("ignores corrupted JSON in storage and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const key = favoritesKey(config);
    storage.setItem(key, "{not valid json");
    const store = new FavoritesStore({ storage, onChange });
    store.load(config);
    expect(store.size).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("ignores non-array JSON shapes (defends against object→Set widening)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const key = favoritesKey(config);
    storage.setItem(key, JSON.stringify({ accidentally: "an object" }));
    const store = new FavoritesStore({ storage, onChange });
    store.load(config);
    expect(store.size).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("filters non-string elements out of the persisted array", () => {
    const key = favoritesKey(config);
    storage.setItem(key, JSON.stringify(["/a.mp4", 42, null, "/b.mp4"]));
    const store = new FavoritesStore({ storage, onChange });
    store.load(config);
    expect(store.size).toBe(2);
    expect(store.has("/a.mp4")).toBe(true);
    expect(store.has("/b.mp4")).toBe(true);
  });

  it("survives a storage backend that throws on read", () => {
    const throwing = new ThrowingReadStorage();
    const store = new FavoritesStore({ storage: throwing, onChange });
    store.load(config);
    expect(store.size).toBe(0);
  });

  it("survives a storage backend that throws QuotaExceeded on write", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const quotaStorage = new QuotaExceededStorage();
    const store = new FavoritesStore({ storage: quotaStorage, onChange });
    store.load(config);
    store.toggle("/a.mp4");
    // The Set was mutated even though the persist failed — the UX
    // contract is "favorite is on for this session".
    expect(store.has("/a.mp4")).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledOnce();
    // A second toggle that also fails should not log again — the warn-
    // once latch keeps the console from spamming.
    store.toggle("/b.mp4");
    expect(warn).toHaveBeenCalledOnce();
  });

  it("works without a storage backend (in-memory only)", () => {
    const store = new FavoritesStore({ storage: null, onChange });
    store.load(config);
    store.toggle("/a.mp4");
    expect(store.has("/a.mp4")).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
