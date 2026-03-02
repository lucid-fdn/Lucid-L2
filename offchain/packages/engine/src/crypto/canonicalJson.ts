import { canonicalize } from 'json-canonicalize';

/**
 * Canonicalize JSON using RFC 8785 (JCS).
 *
 * Determinism requirements:
 * - stable key ordering
 * - no whitespace differences
 * - consistent number/string encoding
 */
export function canonicalJson(value: unknown): string {
  return canonicalize(value as any);
}
