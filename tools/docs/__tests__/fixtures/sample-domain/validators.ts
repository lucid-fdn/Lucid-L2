/** Validates that a value is a non-empty string */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Validates that a value is a positive integer */
export function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Validates that a value is a valid ISO 8601 date string */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return !isNaN(Date.parse(value));
}

/** Validates that a value is a plain object */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates that a value is a non-null object */
export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/** Validates that an array is non-empty */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0;
}
