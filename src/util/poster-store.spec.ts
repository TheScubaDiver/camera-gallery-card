import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PosterStore } from "./poster-store";

/**
 * Vitest runs in Node, where `indexedDB` is undefined — `init()` flips
 * `_available` to false and every subsequent call no-ops cleanly. That's
 * exactly the behaviour we ship to browsers without IDB support
 * (private-browsing Safari, exotic embeds), so testing it here is the
 * right scope. The IDB happy path lives behind real-browser smoke
 * testing.
 */

describe("PosterStore (no-IDB environment)", () => {
  let store: PosterStore;

  beforeEach(() => {
    store = new PosterStore();
  });

  afterEach(() => {
    // No globals to restore — we never installed any.
  });

  it("init resolves even with no IDB present", async () => {
    await expect(store.init()).resolves.toBeUndefined();
  });

  it("isAvailable returns false when IDB is unavailable", async () => {
    await store.init();
    expect(store.isAvailable()).toBe(false);
  });

  it("readAll returns an empty array when no backing store exists", async () => {
    const records = await store.readAll();
    expect(records).toEqual([]);
  });

  it("set / delete / touch are silent no-ops when unavailable", async () => {
    const fakeBlob = { size: 1 } as unknown as Blob;
    await expect(store.set("k1", fakeBlob)).resolves.toBeUndefined();
    await expect(store.touch("k1")).resolves.toBeUndefined();
    await expect(store.delete("k1")).resolves.toBeUndefined();
    expect(await store.readAll()).toEqual([]);
  });

  it("evictExcess is a silent no-op when unavailable", async () => {
    await expect(store.evictExcess(10)).resolves.toBeUndefined();
  });

  it("init is idempotent — repeated calls return the same promise", async () => {
    const p1 = store.init();
    const p2 = store.init();
    expect(p1).toBe(p2);
    await p1;
  });
});
