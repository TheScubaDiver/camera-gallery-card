/**
 * Branded type for Home Assistant entity IDs (`"sensor.foo"`, `"camera.bar"`).
 *
 * `EntityId` is a `string` at runtime but carries a phantom unique-symbol
 * brand at compile time, so functions declaring `entityId: EntityId` reject
 * arbitrary strings. Cross the boundary with {@link asEntityId} (assert) or
 * {@link toEntityId} (validate) — never `as EntityId`.
 *
 * Trade-off: branded types add friction at every boundary. Useful where a
 * function signature should encode "this string has been validated as an
 * entity_id"; overkill for ad-hoc strings inside one module.
 */
declare const _entityIdBrand: unique symbol;
export type EntityId = string & { readonly [_entityIdBrand]: true };

const ENTITY_ID_RE = /^[a-z_]+\.[a-z0-9_]+$/;

/** Returns `true` iff `s` matches the `domain.object_id` shape. */
export function isEntityIdString(s: string): boolean {
  return ENTITY_ID_RE.test(s);
}

/**
 * Unsafe cast: brand `s` as `EntityId` without runtime validation.
 *
 * Use only when the caller already knows `s` is a valid entity_id (e.g. it
 * came from `hass.states` or a typed config field). Prefer {@link toEntityId}
 * for input from untyped sources (YAML, user input, WS responses).
 */
export function asEntityId(s: string): EntityId {
  return s as EntityId;
}

/**
 * Validate-and-brand: returns a typed `EntityId` if `s` is shaped like one,
 * otherwise `null`. Safe for untrusted input.
 */
export function toEntityId(s: string): EntityId | null {
  return isEntityIdString(s) ? (s as EntityId) : null;
}

/** Domain part of an entity_id (`"sensor.foo"` → `"sensor"`). */
export function entityDomain(id: EntityId): string {
  const dot = id.indexOf(".");
  return dot === -1 ? id : id.slice(0, dot);
}

/** Object-id part of an entity_id (`"sensor.foo"` → `"foo"`). */
export function entityObjectId(id: EntityId): string {
  const dot = id.indexOf(".");
  return dot === -1 ? id : id.slice(dot + 1);
}
