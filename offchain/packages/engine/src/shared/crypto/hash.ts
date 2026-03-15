import crypto from 'crypto';
import { canonicalJson } from './canonicalJson';

export function sha256Bytes(data: string | Buffer): Buffer {
  return crypto.createHash('sha256').update(data).digest();
}

export function sha256Hex(data: string | Buffer): string {
  return sha256Bytes(data).toString('hex');
}

/** Hash of canonical JSON (RFC 8785). */
export function canonicalSha256Hex(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
