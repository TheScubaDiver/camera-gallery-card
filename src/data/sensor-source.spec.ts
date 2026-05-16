import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CameraGalleryCardConfig } from "../config/normalize";
import { makeFakeHass, type FakeHass } from "../test/fake-hass";
import { parseServiceParts, SensorSourceClient, toFsPath, toWebPath } from "./sensor-source";

const baseConfig = (overrides: Partial<CameraGalleryCardConfig> = {}): CameraGalleryCardConfig =>
  ({
    type: "custom:camera-gallery-card",
    source_mode: "sensor",
    entities: ["sensor.cam"],
    ...overrides,
  }) as unknown as CameraGalleryCardConfig;

describe("toWebPath", () => {
  it("rewrites /config/www/foo to /local/foo", () => {
    expect(toWebPath("/config/www/clip.mp4")).toBe("/local/clip.mp4");
  });

  it("rewrites bare /config/www to /local", () => {
    expect(toWebPath("/config/www")).toBe("/local");
  });

  it("passes through /local/ paths unchanged", () => {
    expect(toWebPath("/local/recordings/2026/clip.mp4")).toBe("/local/recordings/2026/clip.mp4");
  });

  it("returns empty string on falsy input", () => {
    expect(toWebPath("")).toBe("");
    expect(toWebPath(null)).toBe("");
    expect(toWebPath(undefined)).toBe("");
  });

  it("trims whitespace", () => {
    expect(toWebPath("  /local/x.mp4  ")).toBe("/local/x.mp4");
  });
});

describe("toFsPath", () => {
  it("rewrites /local/ to /config/www/", () => {
    expect(toFsPath("/local/clip.mp4")).toBe("/config/www/clip.mp4");
  });

  it("passes through /config/www/ paths", () => {
    expect(toFsPath("/config/www/clip.mp4")).toBe("/config/www/clip.mp4");
  });

  it("strips query and fragment", () => {
    expect(toFsPath("/local/clip.mp4?t=42#x")).toBe("/config/www/clip.mp4");
  });

  it("extracts pathname from absolute URLs", () => {
    expect(toFsPath("https://homeassistant.local/local/clip.mp4")).toBe("/config/www/clip.mp4");
  });

  it("returns empty string for paths outside the prefix", () => {
    expect(toFsPath("/api/camera_proxy/cam.local.foo")).toBe("");
    expect(toFsPath("")).toBe("");
  });

  it("tolerates malformed URI sequences (audit A2)", () => {
    // Pre-extraction this swallowed the URIError but assigned `clean` only
    // inside the try-block, so the un-decoded value rode through. Now we
    // explicitly preserve the pre-decode value and still produce a usable
    // /config/www/ path so the downstream prefix gate can decide.
    const result = toFsPath("/local/cam%ZZ/clip.mp4");
    expect(result).toBe("/config/www/cam%ZZ/clip.mp4");
  });
});

describe("parseServiceParts", () => {
  it("splits domain.service", () => {
    expect(parseServiceParts("shell_command.delete_clip")).toEqual({
      domain: "shell_command",
      service: "delete_clip",
    });
  });

  it("returns null for missing service", () => {
    expect(parseServiceParts("shell_command")).toBeNull();
    expect(parseServiceParts("shell_command.")).toBeNull();
    expect(parseServiceParts(".delete_clip")).toBeNull();
  });

  it("returns null for non-string input (audit A1, A4)", () => {
    expect(parseServiceParts(undefined)).toBeNull();
    expect(parseServiceParts(null)).toBeNull();
    expect(parseServiceParts(123)).toBeNull();
    expect(parseServiceParts({})).toBeNull();
  });
});

describe("SensorSourceClient.getEntityIds", () => {
  it("returns the configured entities array", () => {
    const client = new SensorSourceClient();
    client.load(baseConfig({ entities: ["sensor.a", "sensor.b"] }));
    expect(client.getEntityIds()).toEqual(["sensor.a", "sensor.b"]);
  });

  it("returns [] when entities is missing", () => {
    const client = new SensorSourceClient();
    client.load(baseConfig({ entities: undefined as never }));
    expect(client.getEntityIds()).toEqual([]);
  });

  it("filters out falsy entries (audit A5)", () => {
    const client = new SensorSourceClient();
    client.load(
      baseConfig({
        entities: ["sensor.a", null as unknown as string, "", "sensor.b"] as string[],
      })
    );
    expect(client.getEntityIds()).toEqual(["sensor.a", "sensor.b"]);
  });
});

describe("SensorSourceClient.getItems", () => {
  let hass: FakeHass;
  let client: SensorSourceClient;

  beforeEach(() => {
    hass = makeFakeHass();
    client = new SensorSourceClient();
    client.setHass(hass);
  });

  it("ingests array fileList attributes", () => {
    hass.setState("sensor.cam", {
      fileList: ["/config/www/clip1.mp4", "/local/clip2.mp4"],
    });
    client.load(baseConfig({ entities: ["sensor.cam"] }));

    const items = client.getItems();
    expect(items.map((x) => x.src)).toEqual(["/local/clip1.mp4", "/local/clip2.mp4"]);
  });

  it("ingests JSON-stringified array fileList attributes", () => {
    hass.setState("sensor.cam", {
      fileList: JSON.stringify(["/local/a.mp4", "/local/b.mp4"]),
    });
    client.load(baseConfig({ entities: ["sensor.cam"] }));

    const items = client.getItems();
    expect(items.map((x) => x.src)).toEqual(["/local/a.mp4", "/local/b.mp4"]);
  });

  it("falls back to single-path on malformed JSON string fileList", () => {
    hass.setState("sensor.cam", { fileList: "/local/single.mp4" });
    client.load(baseConfig({ entities: ["sensor.cam"] }));

    const items = client.getItems();
    expect(items.map((x) => x.src)).toEqual(["/local/single.mp4"]);
  });

  it("skips entities missing from hass.states", () => {
    client.load(baseConfig({ entities: ["sensor.missing"] }));
    expect(client.getItems()).toEqual([]);
  });

  it("populates srcEntityMap with first-wins ownership across entities", () => {
    hass.setState("sensor.a", { fileList: ["/local/shared.mp4", "/local/a.mp4"] });
    hass.setState("sensor.b", { fileList: ["/local/shared.mp4", "/local/b.mp4"] });
    client.load(baseConfig({ entities: ["sensor.a", "sensor.b"] }));

    client.getItems();
    const map = client.getSrcEntityMap();
    expect(map.get("/local/shared.mp4")).toBe("sensor.a");
    expect(map.get("/local/a.mp4")).toBe("sensor.a");
    expect(map.get("/local/b.mp4")).toBe("sensor.b");
  });

  it("pairs sibling jpg/mp4 by stem and surfaces the map", () => {
    hass.setState("sensor.cam", {
      fileList: ["/local/clip.mp4", "/local/clip.jpg", "/local/other.mp4"],
    });
    client.load(baseConfig({ entities: ["sensor.cam"] }));

    const items = client.getItems();
    // The thumbnail is removed from the rendered list; the video stays.
    expect(items.map((x) => x.src).sort()).toEqual(["/local/clip.mp4", "/local/other.mp4"]);
    expect(client.getSensorPairedThumbs().get("/local/clip.mp4")).toBe("/local/clip.jpg");
  });

  it("invokes the enrich callback with each src", () => {
    hass.setState("sensor.cam", { fileList: ["/local/clip.mp4"] });
    client.load(baseConfig({ entities: ["sensor.cam"] }));

    const enrich = vi.fn((src: string) => ({ src, dtMs: 1234 }));
    const items = client.getItems(enrich);
    expect(enrich).toHaveBeenCalledWith("/local/clip.mp4");
    expect(items[0]).toEqual({ src: "/local/clip.mp4", dtMs: 1234 });
  });

  it("rebuilds srcEntityMap on every getItems call (R1, A7)", () => {
    // Idempotent rebuild: two consecutive calls produce the same map even
    // when nothing about the inputs has changed. This is the contract that
    // commit 4 will lean on to fix the source-mode-flip leak.
    hass.setState("sensor.a", { fileList: ["/local/a.mp4"] });
    client.load(baseConfig({ entities: ["sensor.a"] }));

    client.getItems();
    const first = new Map(client.getSrcEntityMap());

    client.getItems();
    const second = client.getSrcEntityMap();

    expect([...second.entries()]).toEqual([...first.entries()]);
  });

  it("drops stale entries when the entity list shrinks (audit A7 setup)", () => {
    hass.setState("sensor.a", { fileList: ["/local/a.mp4"] });
    hass.setState("sensor.b", { fileList: ["/local/b.mp4"] });

    client.load(baseConfig({ entities: ["sensor.a", "sensor.b"] }));
    client.getItems();
    expect(client.getSrcEntityMap().has("/local/b.mp4")).toBe(true);

    client.load(baseConfig({ entities: ["sensor.a"] }));
    client.getItems();
    expect(client.getSrcEntityMap().has("/local/b.mp4")).toBe(false);
    expect(client.getSrcEntityMap().has("/local/a.mp4")).toBe(true);
  });

  it("clears srcEntityMap and sensorPairedThumbs eagerly on load()", () => {
    // Defensive: a media-mode `_items()` call doesn't go through the sensor
    // client, so a media→sensor flip would otherwise leave the previous
    // sensor maps in place until the first sensor.getItems() of the new
    // config. Eager clear in `load()` keeps reads between load() and
    // getItems() from observing stale entries.
    hass.setState("sensor.a", { fileList: ["/local/a.mp4", "/local/a.jpg"] });
    client.load(baseConfig({ entities: ["sensor.a"] }));
    client.getItems();
    expect(client.getSrcEntityMap().size).toBeGreaterThan(0);
    expect(client.getSensorPairedThumbs().size).toBeGreaterThan(0);

    // Re-load (e.g. source_mode flip in editor): both maps drop to empty
    // before any new getItems() runs.
    client.load(baseConfig({ entities: ["sensor.a"] }));
    expect(client.getSrcEntityMap().size).toBe(0);
    expect(client.getSensorPairedThumbs().size).toBe(0);
  });

  it("fires onChange after a successful getItems()", () => {
    const onChange = vi.fn();
    const local = new SensorSourceClient({ onChange });
    local.setHass(hass);
    hass.setState("sensor.cam", { fileList: ["/local/x.mp4"] });
    local.load(baseConfig({ entities: ["sensor.cam"] }));

    local.getItems();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("fires onChange from setHass when a watched fileList ref changes — fixes the stuck 'No media found' bug", () => {
    // Regression: card first-renders before HA has populated the sensor's
    // state; getItems() returns []; sameAsPrev (prev was also []) suppresses
    // onChange; pipeline caches []. Then HA pushes the populated sensor
    // attribute. Without the setHass detection, *nothing* fires onChange,
    // so the pipeline's rev never bumps and the cached [] stays forever.
    // The card renders "No media found." indefinitely.
    const onChange = vi.fn();
    const local = new SensorSourceClient({ onChange });
    local.load(baseConfig({ entities: ["sensor.cam"] }));

    // Initial hass: sensor entity missing.
    const h0 = makeFakeHass();
    local.setHass(h0);
    expect(local.getItems()).toEqual([]);
    expect(onChange).not.toHaveBeenCalled(); // sameAsPrev short-circuit

    // HA pushes the populated state. The setHass detection MUST fire
    // onChange so the pipeline cache invalidates.
    const h1 = makeFakeHass();
    h1.setState("sensor.cam", { fileList: ["/local/x.mp4"] });
    local.setHass(h1);
    expect(onChange).toHaveBeenCalledTimes(1);

    // Subsequent identical pushes (same fileList ref) do not re-fire.
    local.setHass(h1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("setHass does not fire onChange when no watched sensor attribute changed", () => {
    const onChange = vi.fn();
    const local = new SensorSourceClient({ onChange });
    local.load(baseConfig({ entities: ["sensor.cam"] }));

    const h0 = makeFakeHass();
    h0.setState("sensor.cam", { fileList: ["/local/a.mp4"] });
    local.setHass(h0);
    expect(onChange).not.toHaveBeenCalled();

    // Unrelated entity changed in a new hass object — must not invalidate.
    const h1 = makeFakeHass();
    h1.setState("sensor.cam", { fileList: h0.states["sensor.cam"]!.attributes!["fileList"] });
    h1.setState("camera.front", { state: "idle" });
    local.setHass(h1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("setHass skips the detect step on first hass (no oldHass to diff against)", () => {
    const onChange = vi.fn();
    const local = new SensorSourceClient({ onChange });
    local.load(baseConfig({ entities: ["sensor.cam"] }));

    const h = makeFakeHass();
    h.setState("sensor.cam", { fileList: ["/local/a.mp4"] });
    local.setHass(h); // first hass — no diff to compute
    expect(onChange).not.toHaveBeenCalled();
  });
});
