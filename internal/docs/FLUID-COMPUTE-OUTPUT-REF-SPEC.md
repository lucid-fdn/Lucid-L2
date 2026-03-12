# Fluid Compute v0 — Output Reference (`output_ref`) Specification

**Version**: 1.0  
**Last Updated**: 2026-02-04  
**Status**: Implemented (P0.15)

---

## Overview

The `output_ref` field in job results and receipts provides a durable reference to the actual output data from inference jobs. This enables:

1. **Verifiability**: The `outputs_hash` in the receipt is computed from the actual output data
2. **Auditability**: Full output retrieval for dispute resolution
3. **Decoupling**: Large outputs stored separately from receipts/blockchain

---

## URI Format Specification

### Primary Format: S3 Hot Lane

```
s3://<bucket>/<prefix>/<job_id>/output.json
```

**Example:**
```
s3://lucid-compute-outputs/production/job_abc123def456/output.json
```

**Components:**
| Component | Description | Example |
|-----------|-------------|---------|
| `bucket` | S3 bucket name | `lucid-compute-outputs` |
| `prefix` | Environment/namespace prefix | `production`, `staging`, `dev` |
| `job_id` | Unique job identifier | `job_abc123def456` |
| `filename` | Always `output.json` for consistency | `output.json` |

### Alternative Format: IPFS Export Lane (Future)

```
ipfs://<cid>
```

**Example:**
```
ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG
```

This format is for:
- Public/permissionless outputs
- Long-term archival
- Cross-chain verification

---

## Output Data Structure

The `output.json` file contains:

```json
{
  "schema_version": "1.0",
  "job_id": "job_abc123def456",
  "created_at": 1738700000,
  "content_type": "text/plain",
  "output": {
    "text": "The generated response text...",
    "finish_reason": "stop",
    "tokens_generated": 150
  },
  "metadata": {
    "model_id": "meta-llama/Meta-Llama-3.1-8B-Instruct@sha256:abc123",
    "runtime_hash": "sha256:def456...",
    "gpu_fingerprint": "NVIDIA-A100-80GB"
  }
}
```

### For Chat Completions

```json
{
  "schema_version": "1.0",
  "job_id": "job_abc123def456",
  "created_at": 1738700000,
  "content_type": "application/json",
  "output": {
    "choices": [{
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The response content..."
      },
      "finish_reason": "stop"
    }],
    "usage": {
      "prompt_tokens": 100,
      "completion_tokens": 150,
      "total_tokens": 250
    }
  },
  "metadata": {
    "model_id": "meta-llama/Meta-Llama-3.1-8B-Instruct@sha256:abc123",
    "runtime_hash": "sha256:def456...",
    "gpu_fingerprint": "NVIDIA-A100-80GB"
  }
}
```

---

## Access Model

### Authentication Required

All S3 output references require authentication to access:

1. **Signed URLs**: Pre-signed S3 URLs with time-limited access
2. **API Token**: Bearer token in Authorization header
3. **Session Auth**: Authenticated Lucid session with passport ownership

### Retrieval Endpoint

```http
GET /v1/outputs/:job_id
Authorization: Bearer <token>

Response:
{
  "output_ref": "s3://bucket/prefix/job_id/output.json",
  "signed_url": "https://...",  // Pre-signed URL (valid 15 min)
  "expires_at": 1738701000,
  "content_hash": "abc123...",  // Must match outputs_hash in receipt
  "content": { ... }            // Optional: inline content if small
}
```

### Access Control Rules

| Requestor | Access Level |
|-----------|--------------|
| Job submitter (via quote) | Full access |
| Receipt holder | Full access (proves job ownership) |
| Worker that executed | Full access |
| Admin | Full access |
| Public | No access (unless IPFS export) |

---

## Retention Policy

### Default Retention

| Environment | Hot Lane (S3) | Cold Lane | IPFS Export |
|-------------|---------------|-----------|-------------|
| Production | 30 days | 1 year | Permanent |
| Staging | 7 days | 30 days | N/A |
| Development | 1 day | N/A | N/A |

### Extended Retention

Customers can request extended retention via:
1. **Subscription tier**: Enterprise tiers include longer retention
2. **Per-job flag**: `retain_output: true` in job request (extra cost)
3. **Export to IPFS**: Permanent storage (extra cost)

### Deletion Process

1. After retention period, outputs marked for deletion
2. 24-hour grace period for recovery requests
3. Permanent deletion from hot lane
4. Cold lane backup retained per policy
5. `output_ref` in receipt becomes invalid (returns 404)

**Note**: The `outputs_hash` in the receipt remains valid and can still verify any cached copies of the output.

---

## Hash Verification

### Computing `outputs_hash`

The `outputs_hash` is computed from the full output object:

```typescript
import { canonicalSha256Hex } from '@lucid/canonical';

function computeOutputsHash(output: object): string {
  return canonicalSha256Hex(output);
}
```

### Verification Flow

```
1. Retrieve output from output_ref
2. Compute hash: computed = sha256(JCS(output))
3. Compare: computed === receipt.outputs_hash
4. If match: output is authentic
5. If mismatch: output tampered or wrong version
```

---

## Error Handling

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `OUTPUT_NOT_FOUND` | 404 | Output does not exist or expired |
| `OUTPUT_UNAUTHORIZED` | 403 | Caller not authorized to access |
| `OUTPUT_HASH_MISMATCH` | 409 | Retrieved output doesn't match receipt |
| `OUTPUT_EXPIRED` | 410 | Output past retention period |

---

## Implementation Notes

### S3 Configuration

```env
# Worker environment variables
S3_BUCKET=lucid-compute-outputs
S3_REGION=us-east-1
S3_PREFIX=production
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

### S3 Bucket Policy

- SSE-S3 encryption enabled
- Versioning enabled (for audit trail)
- Lifecycle policy for automatic expiration
- CORS configured for API access

### Worker Upload Code

```typescript
async function uploadOutput(jobId: string, output: object): Promise<string> {
  const key = `${S3_PREFIX}/${jobId}/output.json`;
  const body = JSON.stringify(output, null, 2);
  
  await s3.putObject({
    Bucket: S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: 'application/json',
    ServerSideEncryption: 'AES256',
    Metadata: {
      'job-id': jobId,
      'created-at': Date.now().toString(),
    },
  });
  
  return `s3://${S3_BUCKET}/${key}`;
}
```

---

## References

- [P0.5: S3 hot lane output storage](../FLUID-COMPUTE-V0-ACCEPTANCE-CHECKLIST.md)
- [JobResult schema](../schemas/JobResult.schema.json)
- [RunReceipt schema](../schemas/RunReceipt.schema.json)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)