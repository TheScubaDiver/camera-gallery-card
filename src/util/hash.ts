/**
 * Pure FNV-1a 32-bit string hash, returned as a base-36 string.
 *
 * The card uses this to derive stable localStorage keys from
 * config-shaped IDs and from media URLs (so the cache key salts on the
 * relevant config). Not cryptographic — collisions are theoretically
 * possible but vanishingly rare for the inputs in question (a few
 * hundred entity IDs, at most). Deterministic across runs and engines.
 */
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

/** Compute the FNV-1a 32-bit hash of `input`, returned as base-36. */
export function fnv1aHash(input: string): string {
  let h = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h.toString(36);
}
