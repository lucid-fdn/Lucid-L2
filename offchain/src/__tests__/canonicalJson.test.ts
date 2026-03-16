import fs from 'fs';
import path from 'path';
import { canonicalJson } from '../../packages/engine/src/shared/crypto/canonicalJson';
import { canonicalSha256Hex } from '../../packages/engine/src/shared/crypto/hash';
import { validateWithSchema } from '../../packages/engine/src/shared/crypto/schemaValidator';
import { PATHS } from '../../packages/engine/src/shared/config/paths';

function goldenDir(): string {
  return PATHS.GOLDEN_DIR;
}

describe('RFC8785 canonical JSON + schema validation', () => {
  test('Policy canonical hash is stable and schema-valid', () => {
    const policy = JSON.parse(fs.readFileSync(path.join(goldenDir(), 'policy.example.json'), 'utf-8'));
    const v = validateWithSchema('Policy', policy);
    expect(v.ok).toBe(true);

    const canon = canonicalJson(policy);
    const h = canonicalSha256Hex(policy);
    expect(typeof canon).toBe('string');
    expect(h).toMatch(/^[0-9a-f]{64}$/);

    // Golden invariants: repeated hashing yields same result
    expect(canonicalSha256Hex(policy)).toBe(h);
  });

  test('Receipt example is schema-valid after filling computed hashes', () => {
    const receiptPath = path.join(goldenDir(), 'receipt.example.json');
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));

    // compute policy hash from the policy example
    const policy = JSON.parse(fs.readFileSync(path.join(goldenDir(), 'policy.example.json'), 'utf-8'));
    receipt.policy_hash = canonicalSha256Hex(policy);

    // compute receipt hash over receipt without signature material (MVP approach)
    // In implementation we will define a stricter rule (e.g. hash receipt with signature fields empty).
    receipt.receipt_hash = canonicalSha256Hex({ ...receipt, receipt_hash: '', receipt_signature: '', signer_pubkey: '' });
    receipt.receipt_signature = '00'.repeat(64);
    receipt.signer_pubkey = '00'.repeat(32);

    const v = validateWithSchema('RunReceipt', receipt);
    expect(v.ok).toBe(true);

    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
