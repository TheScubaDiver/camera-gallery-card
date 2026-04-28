import type { HassEntity } from "./hass";

/**
 * Narrowed shape for the FileTrack sensor's `attributes` object.
 *
 * `HassEntity` has `attributes: { [key: string]: any }` — too loose. The
 * fileList-bearing sensor (created by the FileTrack integration, a fork of
 * TarheelGrad1998's `files`) ships an array of media paths under `fileList`.
 *
 * Use {@link FileTrackEntity} at the access site (not as a global widening of
 * `HassEntity` — that would lose type safety on every other entity).
 */
export interface FileTrackAttributes {
  fileList: string[];
}

export type FileTrackEntity = HassEntity & { attributes: FileTrackAttributes };
