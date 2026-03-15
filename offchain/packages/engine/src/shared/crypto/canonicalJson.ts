import { canonicalize } from 'json-canonicalize';

/**
 * Lucid canonical JSON: normalize → JCS (RFC 8785)
 *
 * Normalization rules (Lucid-specific, matches gateway-core):
 * - BigInt → quoted string
 * - NaN/Infinity → null
 * - Date → ISO 8601 string
 * - undefined → stripped (omitted from objects)
 * - Circular references → throw
 *
 * Then RFC 8785 (JCS) for deterministic key ordering + JSON formatting.
 *
 * This MUST produce identical output to gateway-core's canonicalJson for all
 * inputs that don't contain circular references.
 */
export function canonicalJson(value: unknown): string {
  const normalized = normalize(value, new WeakSet());
  return canonicalize(normalized) ?? 'null';
}

function normalize(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!isFinite(value)) return null; // NaN, Infinity, -Infinity → null
    return value;
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    if (seen.has(value)) throw new Error('Circular reference detected in canonical JSON input');
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map(item => normalize(item, seen));
    }

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) {
        result[key] = normalize(v, seen);
      }
    }
    return result;
  }

  return null; // unknown types → null
}
