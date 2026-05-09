import { describe, expect, it, vi } from "vitest";

import type { CameraGalleryCardConfig } from "../config/normalize";
import { makeFakeHass } from "../test/fake-hass";
import { canDeleteItem, deleteItem } from "./delete-service";

type Config = Pick<
  CameraGalleryCardConfig,
  "source_mode" | "allow_delete" | "delete_service" | "delete_confirm" | "debug_enabled"
>;

const cfg = (overrides: Partial<Config> = {}): Config =>
  ({
    source_mode: "sensor",
    allow_delete: true,
    delete_service: "shell_command.delete_clip",
    delete_confirm: false,
    debug_enabled: false,
    ...overrides,
  }) as Config;

describe("canDeleteItem — matrix gate", () => {
  it("returns false when src is missing", () => {
    expect(canDeleteItem({ src: undefined, config: cfg(), srcEntityMap: new Map() })).toBe(false);
  });

  it("returns true in sensor mode with all gates open", () => {
    expect(canDeleteItem({ src: "/local/a.mp4", config: cfg(), srcEntityMap: new Map() })).toBe(
      true
    );
  });

  it("returns false in media mode (not deletable today)", () => {
    expect(
      canDeleteItem({
        src: "media-source://x/a.mp4",
        config: cfg({ source_mode: "media" }),
        srcEntityMap: new Map(),
      })
    ).toBe(false);
  });

  it("returns false in combined mode when src isn't sensor-backed", () => {
    expect(
      canDeleteItem({
        src: "media-source://x/a.mp4",
        config: cfg({ source_mode: "combined" }),
        srcEntityMap: new Map(),
      })
    ).toBe(false);
  });

  it("returns true in combined mode when src is sensor-backed", () => {
    expect(
      canDeleteItem({
        src: "/local/a.mp4",
        config: cfg({ source_mode: "combined" }),
        srcEntityMap: new Map([["/local/a.mp4", "sensor.cam"]]),
      })
    ).toBe(true);
  });

  it("returns false when allow_delete is false", () => {
    expect(
      canDeleteItem({
        src: "/local/a.mp4",
        config: cfg({ allow_delete: false }),
        srcEntityMap: new Map(),
      })
    ).toBe(false);
  });

  it("returns false when delete_service is malformed", () => {
    expect(
      canDeleteItem({
        src: "/local/a.mp4",
        config: cfg({ delete_service: "shell_command" }),
        srcEntityMap: new Map(),
      })
    ).toBe(false);
  });

  it("returns false when config is null", () => {
    expect(canDeleteItem({ src: "/local/a.mp4", config: null, srcEntityMap: new Map() })).toBe(
      false
    );
  });
});

describe("deleteItem", () => {
  const src = "/local/clip.mp4";

  it("calls hass.callService with the parsed service parts and the fs path", async () => {
    const hass = makeFakeHass();
    const ok = await deleteItem({
      hass,
      src,
      config: cfg(),
      srcEntityMap: new Map(),
      confirm: () => true,
    });
    expect(ok).toBe(true);
    expect(hass.serviceCalls).toEqual([
      { domain: "shell_command", service: "delete_clip", data: { path: "/config/www/clip.mp4" } },
    ]);
  });

  it("returns false when the gate fails (mode = media)", async () => {
    const hass = makeFakeHass();
    const ok = await deleteItem({
      hass,
      src,
      config: cfg({ source_mode: "media" }),
      srcEntityMap: new Map(),
    });
    expect(ok).toBe(false);
    expect(hass.serviceCalls).toEqual([]);
  });

  it("rejects fsPath outside the configured prefix", async () => {
    const hass = makeFakeHass();
    const ok = await deleteItem({
      hass,
      src: "/api/camera_proxy/foo.jpg", // not under /local/ or /config/www/
      config: cfg(),
      srcEntityMap: new Map(),
    });
    expect(ok).toBe(false);
    expect(hass.serviceCalls).toEqual([]);
  });

  it("respects the confirm callback when delete_confirm is true", async () => {
    const hass = makeFakeHass();
    const confirm = vi.fn(() => false);
    const ok = await deleteItem({
      hass,
      src,
      config: cfg({ delete_confirm: true }),
      srcEntityMap: new Map(),
      confirm,
    });
    expect(ok).toBe(false);
    expect(confirm).toHaveBeenCalled();
    expect(hass.serviceCalls).toEqual([]);
  });

  it("skips confirm when delete_confirm is false", async () => {
    const hass = makeFakeHass();
    const confirm = vi.fn();
    const ok = await deleteItem({
      hass,
      src,
      config: cfg({ delete_confirm: false }),
      srcEntityMap: new Map(),
      confirm,
    });
    expect(ok).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(hass.serviceCalls).toHaveLength(1);
  });

  it("returns false when hass is null", async () => {
    const ok = await deleteItem({
      hass: null,
      src,
      config: cfg(),
      srcEntityMap: new Map(),
    });
    expect(ok).toBe(false);
  });
});
