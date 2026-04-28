import type { HassEntity } from "./hass";

/**
 * Narrowed shape for the FileTrack sensor's `attributes` object.
 *
 * `HassEntity` has `attributes: { [key: string]: any }` — too loose. The
 * fileList-bearing sensor (created by the FileTrack integration, a fork of
 * TarheelGrad1998's `files`) ships an array of media paths under `fileList`.
 *
 * Use {@link isFileTrackEntity} at the access site to narrow safely without
 * casts. Don't widen `HassEntity` globally — that would lose type safety on
 * every other entity.
 */
export interface FileTrackAttributes {
  fileList: string[];
}

export type FileTrackEntity = HassEntity & {
  attributes: HassEntity["attributes"] & FileTrackAttributes;
};

/**
 * Type guard: returns `true` iff `entity` exists and its attributes carry a
 * string-array `fileList`. Lets callers branch into FileTrack-specific logic
 * with the entity narrowed to {@link FileTrackEntity}.
 */
export function isFileTrackEntity(entity: HassEntity | undefined): entity is FileTrackEntity {
  if (!entity) return false;
  const fileList = (entity.attributes as { fileList?: unknown }).fileList;
  return Array.isArray(fileList) && fileList.every((item) => typeof item === "string");
}
