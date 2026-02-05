# Fluid Compute Canonical Hashing Specification

**Version**: 1.0  
**Last Updated**: 2026-02-04  
**Status**: Implemented

---

## Overview

This document specifies the canonical hashing implementation used throughout Fluid Compute v0 for deterministic content-addressable identification of quotes, jobs, receipts, and other objects.

---

## Core Implementation

### Location

```
offchain/src/utils/
├── hash.ts          # Main hashing functions
└── canonicalJson.ts # JSON canonicalization (RFC 8785)
```

### Functions

#### `canonicalJson(value: unknown): string`

Canonicalizes a JavaScript value to a deterministic JSON string following RFC 8785 (JSON Canonicalization Scheme).

```typescript
import { canonicalJson } from './canonicalJson';

// Deterministic ordering, no whitespace
const canonical = canonicalJson({ z: 1, a: 2 });
// Returns: '{"a":2,"z":1}'
```

#### `canonicalSha256Hex(value: unknown): string`

Computes SHA-256 hash of the canonical JSON representation.

```typescript
import { canonicalSha256Hex } from './hash';

const hash = canonicalSha256Hex({ model: 'llama2', tokens: 100 });
// Returns: '3a7bd...' (64-char hex string)
```

#### `sha256Hex(data: string | Buffer): string`

Lower-level SHA-256 hashing for raw data.

```typescript
import { sha256Hex } from './hash';

const hash = sha256Hex('raw data');
```

---

## JSON Canonicalization Scheme (RFC 8785)

The implementation uses the `json-canonicalize` npm package which implements RFC 8785.

### Determinism Guarantees

1. **Stable key ordering**: Object keys sorted lexicographically by Unicode code point
2. **No whitespace**: Minimal representation with no spaces or newlines
3. **Number encoding**: Consistent representation (no trailing zeros, no leading zeros except single 0)
4. **String encoding**: UTF-8 with minimal escaping
5. **No undefined**: Undefined values excluded from output

### Example

```typescript
// Input with random key order
const input = {
  quote_id: 'q-123',
  amount: 100,
  expires_at: 1700000000,
  nested: { z: 1, a: 2 }
};

// Canonical output (keys sorted at all levels)
const canonical = canonicalJson(input);
// '{"amount":100,"expires_at":1700000000,"nested":{"a":2,"z":1},"quote_id":"q-123"}'

// Hash is deterministic
const hash = canonicalSha256Hex(input);
// Always produces the same hash for the same content
```

---

## Usage in Fluid Compute

### Quote Hashing

```typescript
// QuoteService.computeQuoteHash()
const quoteBody = {
  quote_id,
  offer_id,
  model_id,
  policy_hash,
  max_input_tokens,
  max_output_tokens,
  price: { amount, currency },
  expires_at,
  worker_pubkey,
};
const quote_hash = canonicalSha256Hex(quoteBody);
```

### Job Hashing

```typescript
// JobExecutor - job_hash computation
const jobBody = {
  job_id,
  model_id,
  input_hash,
  quote_hash,
  timestamp,
};
const job_hash = canonicalSha256Hex(jobBody);
```

### Receipt Hashing

```typescript
// Receipt hash for MMR inclusion
const receiptBody = {
  receipt_id,
  job_hash,
  quote_hash,
  outputs_hash,
  execution_mode,
  // ... other fields
};
const receipt_hash = canonicalSha256Hex(receiptBody);
```

### Output Hashing

```typescript
// Hash of job outputs for integrity verification
const outputs_hash = canonicalSha256Hex(outputs);
```

---

## Cross-Platform Determinism

### TypeScript/Node.js

```typescript
import { canonicalSha256Hex } from '@/utils/hash';
```

### Workers (BYO Runtime)

Workers import from the same shared utils:

```typescript
// worker-gpu-vllm/quoteService.ts
import { canonicalSha256Hex } from '../../utils/hash';
```

### Python (SDK)

For Python SDK clients that need to verify hashes:

```python
import json
import hashlib
from json_canonicalize import canonicalize  # pip install json-canonicalize

def canonical_sha256(obj: dict) -> str:
    canonical = canonicalize(obj)
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()
```

### Rust (Solana Programs)

For on-chain verification (if needed):

```rust
// Using serde_json_canonicalizer
use serde_json_canonicalizer::to_string;
use sha2::{Sha256, Digest};

fn canonical_sha256(value: &serde_json::Value) -> String {
    let canonical = to_string(value).unwrap();
    let hash = Sha256::digest(canonical.as_bytes());
    hex::encode(hash)
}
```

---

## Verification Examples

### Verifying a Quote Hash

```typescript
// Client-side verification
function verifyQuoteHash(quote: OfferQuote): boolean {
  const computed = canonicalSha256Hex({
    quote_id: quote.quote_id,
    offer_id: quote.offer_id,
    model_id: quote.model_id,
    policy_hash: quote.policy_hash,
    max_input_tokens: quote.max_input_tokens,
    max_output_tokens: quote.max_output_tokens,
    price: quote.price,
    expires_at: quote.expires_at,
    worker_pubkey: quote.worker_pubkey,
    terms_hash: quote.terms_hash, // if present
  });
  return computed === quote.quote_hash;
}
```

### Verifying Receipt Integrity

```typescript
// Verify receipt hash matches content
function verifyReceiptHash(receipt: ExtendedReceipt): boolean {
  const computed = computeReceiptHash(receipt);
  return computed === receipt.receipt_hash;
}
```

---

## Security Considerations

1. **Pre-image Resistance**: SHA-256 provides strong pre-image resistance
2. **Collision Resistance**: ~2^128 security level for collisions
3. **Determinism Attacks**: RFC 8785 prevents JSON variation attacks
4. **Timing Attacks**: Use constant-time comparison for verification

### Hash Binding

Critical fields MUST be included in hash computation:
- `quote_id` - prevents quote substitution
- `expires_at` - prevents time extension attacks
- `worker_pubkey` - prevents worker impersonation
- `price` - prevents price manipulation

---

## Testing Determinism

```typescript
// Test that same input always produces same hash
describe('Canonical Hashing', () => {
  it('produces deterministic hashes', () => {
    const input = { b: 2, a: 1 };
    
    const hash1 = canonicalSha256Hex(input);
    const hash2 = canonicalSha256Hex(input);
    const hash3 = canonicalSha256Hex({ a: 1, b: 2 }); // different key order
    
    expect(hash1).toBe(hash2);
    expect(hash1).toBe(hash3); // key order doesn't matter
  });
  
  it('matches known test vector', () => {
    // RFC 8785 test vector
    const input = { "1": 1, "10": 10, "2": 2 };
    const canonical = canonicalJson(input);
    expect(canonical).toBe('{"1":1,"10":10,"2":2}');
  });
});
```

---

## Migration Notes

### Current Architecture

The canonical hashing implementation lives in `offchain/src/utils/` and is shared by:
- Offchain API services (`receiptService`, `epochService`, etc.)
- Workers (`worker-gpu-vllm`, `worker-sim-hf`)
- SDK generation uses the same hashing for client verification

### Future: Standalone Package

For v1, consider extracting to `packages/canonical/`:
```
packages/canonical/
├── package.json
├── src/
│   ├── index.ts
│   ├── canonicalJson.ts
│   └── hash.ts
└── tsconfig.json
```

This would enable:
- Separate versioning
- NPM publishing for external consumers
- Lighter dependency for SDK clients

---

## Dependencies

```json
{
  "json-canonicalize": "^1.0.6"
}
```

The `json-canonicalize` package is a production-ready RFC 8785 implementation with:
- No dependencies
- TypeScript support
- Well-tested against RFC test vectors

---

## References

- [RFC 8785 - JSON Canonicalization Scheme (JCS)](https://www.rfc-editor.org/rfc/rfc8785)
- [json-canonicalize npm package](https://www.npmjs.com/package/json-canonicalize)
- [SHA-256 (FIPS 180-4)](https://csrc.nist.gov/publications/detail/fips/180/4/final)