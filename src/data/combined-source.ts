/**
 * Combined-source client. Wraps a {@link SensorSourceClient} and
 * a {@link MediaSourceClient} and exposes a single `getItems()` that
 * merges their outputs into one timeline.
 *
 * Composition over inheritance — the client owns no caches itself; it
 * always reads through the two children. Lifecycle is similarly thin:
 * the card calls `setHass` / `load` on each child individually, and the
 * combined client doesn't need its own copies. (`load` here is therefore
 * a no-op stub kept for shape consistency with the other clients.)
 *
 * Source precedence on rel-path collision: **sensor wins**. Sensor items
 * are the only ones that participate in `_srcEntityMap` (and thus in
 * delete-eligibility), so when both a sensor and a media-source root
 * surface the same file the sensor copy is the one whose authority lets
 * a user delete it. Audit ID: C2 (was undocumented).
 *
 * `isDeleteEligible(src)` consolidates the legacy
 * `mode === "combined" && _srcEntityMap.has(src)` pattern that appeared
 * in 8+ scattered places. Audit ID: C-cluster.
 */

import type { CameraGalleryCardConfig } from "../config/normalize";
import type { CardItem } from "../types/media-item";
import type { Enrich as SensorEnrich, SensorSourceClient } from "./sensor-source";
import type { MediaSourceClient } from "./media-walker";
import { dedupeByRelPath } from "./pairing";

export type Enrich = SensorEnrich;

export class CombinedSourceClient {
  private readonly _sensor: SensorSourceClient;
  private readonly _media: MediaSourceClient;

  constructor(sensor: SensorSourceClient, media: MediaSourceClient) {
    this._sensor = sensor;
    this._media = media;
  }

  /** No-op — children own their hass refs. Kept for API parity. */
  setHass(_hass: unknown): void {
    // Children are wired by the card; nothing to do here.
  }

  /** No-op — children own their config refs. Kept for API parity. */
  load(_config: CameraGalleryCardConfig | null): void {
    // Children are wired by the card; nothing to do here.
  }

  /**
   * Merge sensor items in front of media-source items, dedupe by rel-path
   * with sensor precedence on collision. Side effect: rebuilds the
   * sensor client's srcEntityMap (via the underlying `getItems()` call).
   */
  getItems(enrich: Enrich): CardItem[] {
    const sensorItems = this._sensor.getItems(enrich);
    const mediaItems = this._media.getItems(enrich);
    // dedupeByRelPath keeps the first occurrence — sensor items being
    // first means the sensor copy wins on a rel-path collision.
    return dedupeByRelPath([...sensorItems, ...mediaItems]) as CardItem[];
  }

  /**
   * `true` iff `src` is sensor-backed in the current combined view —
   * i.e. delete-eligibility flows through the sensor's `delete_service`.
   * Media-source items (Frigate clips, generic local roots) never satisfy
   * this; their delete path doesn't exist today.
   */
  isDeleteEligible(src: string): boolean {
    return this._sensor.getSrcEntityMap().has(src);
  }
}
