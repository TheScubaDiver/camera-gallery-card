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
import { normalizeRelPath } from "./pairing";

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
   *
   * Implements the merge in one pass instead of `dedupeByRelPath([...sensor,
   * ...media])`: each child's `getItems()` already runs its own
   * `dedupeByRelPath` so the inputs are individually unique. We only need
   * to resolve cross-source collisions, which means a single normalize
   * pass per item — half the regex work of the legacy concat-and-dedupe.
   * Also skips an intermediate spread allocation and a `Map → Array.from`
   * round trip.
   */
  getItems(enrich: Enrich): CardItem[] {
    const sensorItems = this._sensor.getItems(enrich);
    const mediaItems = this._media.getItems(enrich);
    if (!mediaItems.length) return sensorItems;
    if (!sensorItems.length) return mediaItems;

    const sensorKeys = new Set<string>();
    for (const it of sensorItems) {
      const key = normalizeRelPath(it?.src ?? "");
      if (key) sensorKeys.add(key);
    }
    const out: CardItem[] = sensorItems.slice();
    for (const it of mediaItems) {
      const key = normalizeRelPath(it?.src ?? "");
      if (!key || sensorKeys.has(key)) continue;
      out.push(it);
    }
    return out;
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
