// offchain/src/utils/inference.ts
import * as crypto from 'crypto';

export function runMockInference(text: string): Uint8Array {
  // Mock inference: just hash the input text
  const hash = crypto.createHash('sha256').update(text).digest();
  return new Uint8Array(hash);
}
