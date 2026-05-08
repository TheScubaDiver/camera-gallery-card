import { beforeEach, describe, expect, it } from "vitest";

import type { CameraGalleryCardConfig } from "../config/normalize";
import { makeFakeHass, type FakeHass } from "../test/fake-hass";
import { CombinedSourceClient } from "./combined-source";
import { MediaSourceClient } from "./media-walker";
import { SensorSourceClient } from "./sensor-source";

const baseConfig = (overrides: Partial<CameraGalleryCardConfig> = {}): CameraGalleryCardConfig =>
  ({
    type: "custom:camera-gallery-card",
    source_mode: "combined",
    entities: [] as string[],
    media_sources: [] as string[],
    ...overrides,
  }) as unknown as CameraGalleryCardConfig;

describe("CombinedSourceClient.getItems — four-cell matrix", () => {
  let hass: FakeHass;
  let sensor: SensorSourceClient;
  let media: MediaSourceClient;
  let combined: CombinedSourceClient;

  beforeEach(() => {
    hass = makeFakeHass();
    sensor = new SensorSourceClient();
    media = new MediaSourceClient();
    combined = new CombinedSourceClient(sensor, media);
    sensor.setHass(hass);
    media.setHass(hass);
  });

  it("returns [] when both sources are empty", () => {
    sensor.load(baseConfig({ entities: [], media_sources: [] }));
    media.load(baseConfig({ entities: [], media_sources: [] }));
    expect(combined.getItems((src) => ({ src }))).toEqual([]);
  });

  it("returns sensor items only when media is empty", () => {
    hass.setState("sensor.cam", { fileList: ["/local/a.mp4", "/local/b.mp4"] });
    sensor.load(baseConfig({ entities: ["sensor.cam"], media_sources: [] }));
    media.load(baseConfig({ entities: ["sensor.cam"], media_sources: [] }));

    const items = combined.getItems((src) => ({ src })).map((x) => x.src);
    expect(items).toEqual(["/local/a.mp4", "/local/b.mp4"]);
  });

  it("returns media items only when sensor is empty", () => {
    sensor.load(baseConfig({ entities: [] }));
    media.load(baseConfig({ entities: [] }));
    media.setList([
      {
        id: "media-source://x/m1.mp4",
        title: "m1",
        cls: "video",
        mime: "video/mp4",
        thumb: "",
      },
    ]);

    const items = combined.getItems((src) => ({ src })).map((x) => x.src);
    expect(items).toEqual(["media-source://x/m1.mp4"]);
  });

  it("merges both sources with sensor first on the timeline", () => {
    hass.setState("sensor.cam", { fileList: ["/local/sensor.mp4"] });
    sensor.load(baseConfig({ entities: ["sensor.cam"] }));
    media.load(baseConfig({ entities: ["sensor.cam"] }));
    media.setList([
      {
        id: "media-source://x/media.mp4",
        title: "media",
        cls: "video",
        mime: "video/mp4",
        thumb: "",
      },
    ]);

    const items = combined.getItems((src) => ({ src })).map((x) => x.src);
    expect(items).toEqual(["/local/sensor.mp4", "media-source://x/media.mp4"]);
  });
});

describe("CombinedSourceClient.getItems — rel-path dedupe (audit C2)", () => {
  let hass: FakeHass;
  let sensor: SensorSourceClient;
  let media: MediaSourceClient;
  let combined: CombinedSourceClient;

  beforeEach(() => {
    hass = makeFakeHass();
    sensor = new SensorSourceClient();
    media = new MediaSourceClient();
    combined = new CombinedSourceClient(sensor, media);
    sensor.setHass(hass);
  });

  it("sensor wins when a media root surfaces the same rel-path", () => {
    // Both refer to the same `clip.mp4` rel-path under `local/recordings`.
    hass.setState("sensor.cam", { fileList: ["/local/recordings/clip.mp4"] });
    sensor.load(baseConfig({ entities: ["sensor.cam"] }));
    media.load(baseConfig());
    media.setList([
      {
        id: "media-source://media_source/local/recordings/clip.mp4",
        title: "clip.mp4",
        cls: "video",
        mime: "video/mp4",
        thumb: "",
      },
    ]);

    const items = combined.getItems((src) => ({ src })).map((x) => x.src);
    // Sensor entry is the surviving entry (won the rel-path collision).
    expect(items).toEqual(["/local/recordings/clip.mp4"]);
  });
});

describe("CombinedSourceClient.isDeleteEligible (audit C-cluster)", () => {
  let hass: FakeHass;
  let sensor: SensorSourceClient;
  let media: MediaSourceClient;
  let combined: CombinedSourceClient;

  beforeEach(() => {
    hass = makeFakeHass();
    sensor = new SensorSourceClient();
    media = new MediaSourceClient();
    combined = new CombinedSourceClient(sensor, media);
    sensor.setHass(hass);
  });

  it("returns true for sensor-backed items", () => {
    hass.setState("sensor.cam", { fileList: ["/local/a.mp4"] });
    sensor.load(baseConfig({ entities: ["sensor.cam"] }));
    media.load(baseConfig());
    combined.getItems((src) => ({ src }));
    expect(combined.isDeleteEligible("/local/a.mp4")).toBe(true);
  });

  it("returns false for media-only items", () => {
    sensor.load(baseConfig({ entities: [] }));
    media.load(baseConfig());
    media.setList([
      { id: "media-source://x/m.mp4", title: "m", cls: "video", mime: "video/mp4", thumb: "" },
    ]);
    combined.getItems((src) => ({ src }));
    expect(combined.isDeleteEligible("media-source://x/m.mp4")).toBe(false);
  });

  it("returns false for unknown items", () => {
    expect(combined.isDeleteEligible("/local/nonexistent.mp4")).toBe(false);
  });

  it("eligibility tracks state across config flips (audit C1 / A7)", () => {
    // Combined → sensor → combined: srcEntityMap rebuild on every call
    // means stale entries from prior configs can't leak through.
    hass.setState("sensor.a", { fileList: ["/local/a.mp4"] });
    hass.setState("sensor.b", { fileList: ["/local/b.mp4"] });

    sensor.load(baseConfig({ entities: ["sensor.a", "sensor.b"] }));
    media.load(baseConfig());
    combined.getItems((src) => ({ src }));
    expect(combined.isDeleteEligible("/local/a.mp4")).toBe(true);
    expect(combined.isDeleteEligible("/local/b.mp4")).toBe(true);

    // Drop sensor.b from the config and re-enter combined mode.
    sensor.load(baseConfig({ entities: ["sensor.a"] }));
    combined.getItems((src) => ({ src }));
    expect(combined.isDeleteEligible("/local/a.mp4")).toBe(true);
    expect(combined.isDeleteEligible("/local/b.mp4")).toBe(false);
  });
});
