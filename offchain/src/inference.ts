import { createHash } from 'crypto';

export function runMockInference(input: string): Uint8Array {
  const buf = createHash('sha256').update(input).digest();
  return new Uint8Array(buf);
}
