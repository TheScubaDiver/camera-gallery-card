import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FRIGATE_URI_PREFIX,
  fetchFrigateEvents,
  frigateEventIdMs,
  hasFrigateConfig,
  isFrigateRoot,
  mapFrigateEventToItem,
} from "./frigate";

// Real-world example pulled from Frigate's API docs / issue tracker.
const EVENT_ID_EPOCH_SEC = 1741975616.16659;
const EVENT_ID = `${EVENT_ID_EPOCH_SEC}-zgolc3`;

describe("frigateEventIdMs", () => {
  it("extracts epoch ms from a Frigate REST clip URL", () => {
    const url = `http://frigate.local:5000/api/events/${EVENT_ID}/clip.mp4`;
    expect(frigateEventIdMs(url)).toBe(EVENT_ID_EPOCH_SEC * 1000);
  });

  it("extracts epoch ms from a Frigate REST snapshot URL", () => {
    const url = `http://frigate.local:5000/api/events/${EVENT_ID}/thumbnail.jpg`;
    expect(frigateEventIdMs(url)).toBe(EVENT_ID_EPOCH_SEC * 1000);
  });

  it("extracts epoch ms from a Frigate media-source URI", () => {
    const uri = `${FRIGATE_URI_PREFIX}/frigate/event/clips/driveway/${EVENT_ID}`;
    expect(frigateEventIdMs(uri)).toBe(EVENT_ID_EPOCH_SEC * 1000);
  });

  it("handles event ids with shorter random suffixes (single char)", () => {
    const epoch = 1751565549.853251;
    expect(frigateEventIdMs(`/api/events/${epoch}-b/clip.mp4`)).toBe(epoch * 1000);
  });

  it("returns null on a URL with a 10-digit run that is NOT followed by a dash-suffix", () => {
    expect(frigateEventIdMs("http://example.com/api/sensors/1741975616/data.json")).toBeNull();
  });

  it("returns null on a non-Frigate URL", () => {
    expect(frigateEventIdMs("https://example.com/some/random/path.mp4")).toBeNull();
  });

  it("returns null on out-of-range epoch (below 2000-01-01)", () => {
    // 800000000 = 1995, below MIN_REASONABLE_EPOCH_SEC
    expect(frigateEventIdMs("/api/events/800000000-abc/clip.mp4")).toBeNull();
  });

  it("returns null on out-of-range epoch (after 2100-01-01)", () => {
    // 5000000000 ≈ year 2128
    expect(frigateEventIdMs("/api/events/5000000000-abc/clip.mp4")).toBeNull();
  });

  it("returns null on too-many-digit numeric runs (12+)", () => {
    expect(frigateEventIdMs("/api/events/123456789012-abc/clip.mp4")).toBeNull();
  });

  it("returns null on empty / nullish input", () => {
    expect(frigateEventIdMs("")).toBeNull();
    expect(frigateEventIdMs(undefined as unknown as string)).toBeNull();
    expect(frigateEventIdMs(null as unknown as string)).toBeNull();
  });
});

describe("isFrigateRoot", () => {
  it("matches the canonical Frigate prefix exactly", () => {
    expect(isFrigateRoot(FRIGATE_URI_PREFIX)).toBe(true);
  });

  it("matches paths under the Frigate prefix", () => {
    expect(isFrigateRoot(`${FRIGATE_URI_PREFIX}/frigate/event-search/clips`)).toBe(true);
  });

  it("rejects look-alikes (substring 'frigate' elsewhere in the URI)", () => {
    expect(isFrigateRoot("media-source://media_source/local/my-frigate-backup/")).toBe(false);
    expect(isFrigateRoot("frigate")).toBe(false);
    expect(isFrigateRoot("https://example.com/frigate")).toBe(false);
  });

  it("returns false for empty / nullish input", () => {
    expect(isFrigateRoot("")).toBe(false);
    expect(isFrigateRoot(null)).toBe(false);
    expect(isFrigateRoot(undefined)).toBe(false);
  });
});

describe("hasFrigateConfig", () => {
  it("is true when frigate_url is set", () => {
    expect(hasFrigateConfig({ frigate_url: "http://frigate.local:5000" })).toBe(true);
  });

  it("is true when the sole media_sources entry is a Frigate root", () => {
    expect(hasFrigateConfig({ media_sources: [FRIGATE_URI_PREFIX] })).toBe(true);
  });

  it("is true when any media_sources entry is a Frigate root", () => {
    expect(
      hasFrigateConfig({
        media_sources: [
          "media-source://media_source/local/cameras",
          `${FRIGATE_URI_PREFIX}/frigate/event-search/clips`,
        ],
      })
    ).toBe(true);
  });

  it("is false for non-Frigate media sources only", () => {
    expect(
      hasFrigateConfig({
        media_sources: ["media-source://media_source/local/cameras"],
      })
    ).toBe(false);
  });

  it("is false when nothing Frigate-related is configured", () => {
    expect(hasFrigateConfig({})).toBe(false);
  });

  it("treats whitespace-only frigate_url as not set", () => {
    expect(hasFrigateConfig({ frigate_url: "   " })).toBe(false);
  });

  it("does NOT match the loose 'frigate' substring elsewhere", () => {
    expect(
      hasFrigateConfig({
        media_sources: ["media-source://media_source/local/my-frigate-backup/"],
      })
    ).toBe(false);
  });
});

describe("mapFrigateEventToItem", () => {
  it("maps an event to a card item with dtMs from start_time", () => {
    const out = mapFrigateEventToItem(
      { id: EVENT_ID, start_time: EVENT_ID_EPOCH_SEC, camera: "driveway", label: "person" },
      "http://frigate.local:5000"
    );
    expect(out).not.toBeNull();
    expect(out?.item.id).toBe(EVENT_ID);
    expect(out?.item.cls).toBe("video");
    expect(out?.item.mime).toBe("video/mp4");
    expect(out?.item.dtMs).toBe(Math.round(EVENT_ID_EPOCH_SEC * 1000));
    expect(out?.item.title).toContain("driveway");
    expect(out?.item.title).toContain("person");
    expect(out?.clipUrl).toBe(`http://frigate.local:5000/api/events/${EVENT_ID}/clip.mp4`);
    expect(out?.item.thumb).toBe(`http://frigate.local:5000/api/events/${EVENT_ID}/thumbnail.jpg`);
  });

  it("trims trailing slashes on base", () => {
    const out = mapFrigateEventToItem(
      { id: EVENT_ID, start_time: EVENT_ID_EPOCH_SEC },
      "http://frigate.local:5000///"
    );
    expect(out?.clipUrl).toBe(`http://frigate.local:5000/api/events/${EVENT_ID}/clip.mp4`);
  });

  it("omits dtMs when start_time is missing or zero", () => {
    const out = mapFrigateEventToItem({ id: EVENT_ID }, "http://frigate.local:5000");
    expect(out?.item.dtMs).toBeUndefined();
  });

  it("returns null when the event has no id", () => {
    expect(mapFrigateEventToItem({ id: "" }, "http://frigate.local:5000")).toBeNull();
    expect(mapFrigateEventToItem({}, "http://frigate.local:5000")).toBeNull();
  });
});

describe("fetchFrigateEvents", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("returns null on empty base", async () => {
    expect(await fetchFrigateEvents("", 100)).toBeNull();
    expect(await fetchFrigateEvents("   ", 100)).toBeNull();
  });

  it("returns null on non-2xx response", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as never;
    expect(await fetchFrigateEvents("http://frigate.local:5000", 100)).toBeNull();
  });

  it("returns null on non-array body", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: "x" }), { status: 200 })
    ) as never;
    expect(await fetchFrigateEvents("http://frigate.local:5000", 100)).toBeNull();
  });

  it("returns the parsed event array on success", async () => {
    const events = [{ id: EVENT_ID, start_time: EVENT_ID_EPOCH_SEC }];
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify(events), { status: 200 })
    ) as never;
    const out = await fetchFrigateEvents("http://frigate.local:5000", 100);
    expect(out).toEqual(events);
  });
});
