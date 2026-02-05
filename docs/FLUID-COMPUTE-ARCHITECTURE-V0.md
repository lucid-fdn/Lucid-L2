# 🏗️ Fluid Compute Architecture v0

**Date:** 29 Janvier 2026  
**Version:** 0.1.0  
**Status:** Implementation Ready

---

## 1. Executive Summary

Fluid Compute v0 implements a **dual-track worker architecture** to support both development/testing workflows and production GPU deployments:

| Track | Worker | Execution Mode | Runtime Control | GPU Required |
|-------|--------|----------------|-----------------|--------------|
| **Dev/Test** | `worker-sim-hf` | `managed_endpoint` | None (HF controls) | ❌ No |
| **Production** | `worker-gpu-vllm` | `byo_runtime` | Full control | ✅ Yes |

This architecture maintains honest attestation while enabling rapid development iteration.

---

## 2. Core Types & Interfaces

### 2.1 Execution Modes

```typescript
/**
 * Execution modes define how inference is performed
 * and what attestation guarantees are available.
 */
enum ExecutionMode {
  /**
   * BYO Runtime: Full control over execution environment.
   * - Worker controls container/runtime
   * - runtime_hash = Docker image digest
   * - gpu_fingerprint = actual GPU hardware
   * - Full attestation chain
   */
  BYO_RUNTIME = "byo_runtime",
  
  /**
   * Managed Endpoint: Execution delegated to external service.
   * - Worker proxies to HF/other inference APIs
   * - runtime_hash = null (unavailable)
   * - gpu_fingerprint = null (unavailable)
   * - Limited attestation (execution not self-controlled)
   */
  MANAGED_ENDPOINT = "managed_endpoint"
}
```

### 2.2 Worker Identity

```typescript
/**
 * Worker identity binds a physical/virtual compute node
 * to a cryptographic identity for receipt signing.
 */
interface WorkerIdentity {
  /** Unique identifier for this worker instance */
  worker_id: string;
  
  /** Passport ID for the compute provider */
  provider_passport_id: string;
  
  /** ed25519 public key for signing */
  operator_pubkey: string;
  
  /** Execution mode this worker operates in */
  execution_mode: ExecutionMode;
  
  /**
   * Runtime hash (Docker image digest).
   * MUST be null for managed_endpoint mode.
   */
  runtime_hash: string | null;
  
  /**
   * GPU hardware fingerprint.
   * MUST be null for managed_endpoint mode.
   */
  gpu_fingerprint: string | null;
}
```

### 2.3 OfferQuote (Replay-Protected Pricing)

```typescript
/**
 * OfferQuote represents a time-limited, bound pricing commitment
 * from a compute provider for executing a specific model.
 */
interface OfferQuote {
  /** UUID nonce - prevents replay attacks */
  quote_id: string;
  
  /** Compute offer passport ID */
  offer_id: string;
  
  /** Model passport ID (or HF model ID) */
  model_id: string;
  
  /** Policy hash - binds quote to specific policy terms */
  policy_hash: string;
  
  /** Maximum input tokens for this quote */
  max_input_tokens: number;
  
  /** Maximum output tokens for this quote */
  max_output_tokens: number;
  
  /** Price for this execution */
  price: {
    amount: number;
    currency: 'lamports' | 'usd_cents' | 'credits';
  };
  
  /** Unix timestamp - quote expires after this time */
  expires_at: number;
  
  /** SHA256 hash of canonical quote body */
  quote_hash: string;
  
  /** ed25519 signature of quote_hash by worker */
  quote_signature: string;
}
```

### 2.4 Extended Receipt Body

```typescript
/**
 * Extended receipt body for Fluid Compute v0.
 * All fields from CDC + additional audit/error fields.
 */
interface ExtendedReceiptBody {
  // === Schema version ===
  schema_version: '1.0';
  
  // === Core identifiers ===
  run_id: string;
  timestamp: number;
  trace_id?: string;
  
  // === Model & Compute binding ===
  model_passport_id: string;
  compute_passport_id: string;
  
  // === Policy binding ===
  policy_hash: string;
  
  // === Quote binding (NEW) ===
  job_hash: string;
  quote_hash: string;
  
  // === Worker identity (NEW) ===
  node_id: string;
  
  /**
   * Runtime hash (Docker image digest).
   * MUST be null for managed_endpoint mode.
   */
  runtime_hash: string | null;
  
  /**
   * GPU fingerprint (hardware identifier).
   * MUST be null for managed_endpoint mode.
   */
  gpu_fingerprint: string | null;
  
  // === Output verification (NEW) ===
  outputs_hash: string;
  output_ref: string;  // S3 or IPFS URI
  
  // === Execution metadata (NEW) ===
  execution_mode: ExecutionMode;
  start_ts: number;
  end_ts: number;
  
  // === Metrics ===
  runtime: string;  // "vllm" | "tgi" | "hf-inference-api"
  metrics: {
    ttft_ms: number;
    p95_ms?: number;
    tokens_in: number;
    tokens_out: number;
  };
  
  // === Audit trail (NEW) ===
  input_ref?: string;  // Encrypted input blob URI for enterprise
  
  // === Structured errors (NEW) ===
  error_code?: string;
  error_message?: string;
  
  // === Legacy optional fields ===
  image_hash?: string;
  model_hash?: string;
  attestation?: object;
}
```

---

## 3. Storage Strategy

### 3.1 Dual-Lane Architecture

```
┌─────────────┐         ┌─────────────┐
│   Outputs   │         │   Outputs   │
│   (Hot)     │────────▶│   (Cold)    │
│    S3       │ publish │    IPFS     │
└─────────────┘         └─────────────┘
      │                       │
      ▼                       ▼
  output_ref              metadata.ipfs_cid
 s3://bucket/..          ipfs://Qm...
```

### 3.2 Storage Decision Matrix

| Use Case | Primary Storage | Secondary |
|----------|-----------------|-----------|
| API response | S3 (fast retrieval) | - |
| Enterprise audit | S3 (hot) | IPFS (publish) |
| Proof anchoring | S3 (hash only) | - |
| Public verification | - | IPFS (permanent) |

### 3.3 Output Reference Format

```typescript
// S3 (default)
output_ref = "s3://lucid-outputs/jobs/{job_id}/output.json"

// IPFS (on explicit publish)
metadata.ipfs_cid = "Qm..."
metadata.ipfs_url = "ipfs://Qm..."
```

---

## 4. Worker Architectures

### 4.1 Worker Simulator (managed_endpoint)

```
┌─────────────────────────────────────────────────────┐
│                 worker-sim-hf                        │
├─────────────────────────────────────────────────────┤
│                                                      │
│  POST /quote ──▶ Generate fake quote (no real GPU)  │
│                                                      │
│  POST /jobs  ──▶ Proxy to HF Inference API ────────▶│──▶ HuggingFace
│                         │                           │    Inference
│                         ▼                           │    API
│              Create receipt with:                   │
│              - execution_mode: "managed_endpoint"   │
│              - runtime_hash: null                   │
│              - gpu_fingerprint: null                │
│                         │                           │
│                         ▼                           │
│              Emit to offchain service               │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Limitations:**
- No control over actual execution runtime
- No GPU fingerprint verification
- Quote pricing is simulated (not backed by real resource reservation)
- Suitable for: development, E2E testing, demo

### 4.2 Real GPU Worker (byo_runtime)

```
┌────────────────────────────────────────────────────────────────┐
│                    worker-gpu-vllm                              │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  POST /quote ──▶ Real quote based on GPU capacity/pricing      │
│                                                                 │
│  POST /jobs  ──▶ Validate quote (signature, expiration, bind)  │
│                         │                                      │
│                         ▼                                      │
│              Load model (cache hit or pull from HF)            │
│                         │                                      │
│                         ▼                                      │
│              Execute via vLLM/TGI                              │
│              ┌──────────────────────┐                          │
│              │  vLLM OpenAI API     │                          │
│              │  localhost:8000      │                          │
│              │  GPU: A100 40GB      │                          │
│              └──────────────────────┘                          │
│                         │                                      │
│                         ▼                                      │
│              Store output → S3 → output_ref                    │
│              Compute outputs_hash                              │
│                         │                                      │
│                         ▼                                      │
│              Create receipt with:                              │
│              - execution_mode: "byo_runtime"                   │
│              - runtime_hash: sha256:<docker_digest>            │
│              - gpu_fingerprint: "NVIDIA-A100-40GB"             │
│                         │                                      │
│                         ▼                                      │
│              Sign receipt with worker ed25519 key              │
│              Emit to offchain service                          │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Guarantees:**
- Full control over execution runtime
- Verifiable runtime_hash (Docker image digest)
- Real GPU fingerprint
- Accurate quota/pricing based on actual resources
- Complete attestation chain

---

## 5. Quote Validation Flow

```typescript
/**
 * Quote validation on job submission.
 * All bound fields MUST match the job request.
 */
function validateQuoteForJob(quote: OfferQuote, job: JobRequest): boolean {
  // 1. Verify quote signature
  if (!verifySignature(quote.quote_hash, quote.quote_signature, worker_pubkey)) {
    throw new Error('INVALID_QUOTE_SIGNATURE');
  }
  
  // 2. Verify quote not expired
  if (Date.now() > quote.expires_at * 1000) {
    throw new Error('QUOTE_EXPIRED');
  }
  
  // 3. Verify quote_hash matches canonical body
  const expectedHash = computeQuoteHash(quote);
  if (expectedHash !== quote.quote_hash) {
    throw new Error('QUOTE_HASH_MISMATCH');
  }
  
  // 4. Verify binding fields match job
  if (quote.model_id !== job.model_id) {
    throw new Error('MODEL_MISMATCH');
  }
  if (quote.offer_id !== job.offer_id) {
    throw new Error('OFFER_MISMATCH');
  }
  
  // 5. Verify token limits
  const estimatedTokens = estimateInputTokens(job.input);
  if (estimatedTokens > quote.max_input_tokens) {
    throw new Error('INPUT_EXCEEDS_QUOTE');
  }
  
  return true;
}
```

---

## 6. Hash Computation Standards

### 6.1 Canonical JSON (JCS)

All hashes are computed using JSON Canonicalization Scheme (RFC 8785):

```typescript
import { canonicalize } from 'json-canonicalize';
import { createHash } from 'crypto';

function canonicalSha256Hex(obj: object): string {
  const canonical = canonicalize(obj);
  return createHash('sha256').update(canonical).digest('hex');
}
```

### 6.2 Quote Hash Preimage

```typescript
function computeQuoteHash(quote: OfferQuote): string {
  const preimage = {
    quote_id: quote.quote_id,
    offer_id: quote.offer_id,
    model_id: quote.model_id,
    policy_hash: quote.policy_hash,
    max_input_tokens: quote.max_input_tokens,
    max_output_tokens: quote.max_output_tokens,
    price: quote.price,
    expires_at: quote.expires_at,
  };
  return canonicalSha256Hex(preimage);
}
```

### 6.3 Job Hash Preimage

```typescript
function computeJobHash(job: JobRequest): string {
  const preimage = {
    job_id: job.job_id,
    model_id: job.model_id,
    quote_hash: job.quote.quote_hash,
    input_hash: canonicalSha256Hex(job.input),
  };
  return canonicalSha256Hex(preimage);
}
```

### 6.4 Outputs Hash Preimage

```typescript
function computeOutputsHash(output: any): string {
  return canonicalSha256Hex(output);
}
```

---

## 7. Error Handling

### 7.1 Structured Error Codes

| Code | Description | Receipted? |
|------|-------------|------------|
| `QUOTE_EXPIRED` | Quote TTL exceeded | ❌ No |
| `INVALID_QUOTE_SIGNATURE` | Quote signature verification failed | ❌ No |
| `MODEL_LOAD_FAILED` | Failed to load model from cache/HF | ✅ Yes |
| `INFERENCE_TIMEOUT` | Execution timed out | ✅ Yes |
| `INFERENCE_ERROR` | Runtime error during inference | ✅ Yes |
| `OUTPUT_STORAGE_FAILED` | Failed to store output | ✅ Yes |
| `GPU_OOM` | GPU out of memory | ✅ Yes |

### 7.2 Error Receipts

Failed executions still produce receipts for audit trail:

```typescript
{
  execution_mode: "byo_runtime",
  error_code: "GPU_OOM",
  error_message: "CUDA out of memory. Tried to allocate 4.00 GiB...",
  outputs_hash: "",  // Empty - no output
  output_ref: "",    // Empty - no output
  // ... other fields populated
}
```

---

## 8. V1 Migration Planning

### 8.1 EpochRecordV2 PDA Migration

**Current (v0):**
```rust
#[account]
pub struct EpochRecord {
    pub merkle_root: [u8; 32],
    pub authority: Pubkey,
    pub epoch_id: u64,
    pub leaf_count: u32,
    pub timestamp: i64,
    pub mmr_size: u64,
}
// Seeds: [b"epoch", authority.key()]
```

**Future (v1):**
```rust
#[account]
pub struct EpochRecordV2 {
    pub merkle_root: [u8; 32],
    pub authority: Pubkey,
    pub epoch_id: u64,
    pub leaf_count: u32,
    pub timestamp: i64,
    pub mmr_size: u64,
    pub schema_version: u8,
    pub metadata_hash: [u8; 32],  // Optional extensions
}
// Seeds: [b"epoch_v2", authority.key(), &epoch_id.to_le_bytes()]
```

**Migration Ticket:** `LUCID-V1-001: EpochRecordV2 PDA Migration`

### 8.2 Quote Binding Evolution

Future versions may add:
- ZK proof of execution
- Multi-worker attestation
- Cross-chain verification

---

## 9. Configuration Reference

### 9.1 Worker Simulator (worker-sim-hf)

```env
# Identity
WORKER_ID=worker-sim-hf-001
EXECUTION_MODE=managed_endpoint
PROVIDER_PASSPORT_ID=compute_passport_hf_sim

# HuggingFace
HF_API_KEY=hf_xxxxx

# Offchain
OFFCHAIN_API_URL=http://localhost:3001
OFFCHAIN_API_KEY=xxxxx

# Signing
WORKER_PRIVATE_KEY=ed25519_hex_private_key
```

### 9.2 Real GPU Worker (worker-gpu-vllm)

```env
# Identity
WORKER_ID=worker-gpu-lucid-001
EXECUTION_MODE=byo_runtime
PROVIDER_PASSPORT_ID=compute_passport_lucid_a100

# Runtime
RUNTIME_TYPE=vllm
RUNTIME_HASH=sha256:abc123...
VLLM_API_URL=http://localhost:8000

# GPU
GPU_FINGERPRINT=NVIDIA-A100-40GB

# HuggingFace (for model downloads)
HF_API_KEY=hf_xxxxx

# Storage - S3 (hot)
S3_BUCKET=lucid-outputs
S3_REGION=us-east-1
S3_ACCESS_KEY=xxxxx
S3_SECRET_KEY=xxxxx

# Storage - IPFS (cold/publish)
IPFS_API_URL=https://ipfs.infura.io:5001
IPFS_PROJECT_ID=xxxxx
IPFS_PROJECT_SECRET=xxxxx

# Cache
MODEL_CACHE_DIR=/data/models
MODEL_CACHE_MAX_SIZE_GB=500

# Prewarm models (comma-separated)
PREWARM_MODELS=meta-llama/Llama-2-7b-chat-hf,mistralai/Mistral-7B-v0.1

# Offchain
OFFCHAIN_API_URL=http://localhost:3001
OFFCHAIN_API_KEY=xxxxx

# Signing
WORKER_PRIVATE_KEY=ed25519_hex_private_key
```

---

## 10. API Reference

### 10.1 Worker API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/quote` | POST | Request a quote for model execution |
| `/jobs` | POST | Submit a job for execution |
| `/jobs/:id` | GET | Get job status and result |
| `/health` | GET | Health check (GPU status) |
| `/metrics` | GET | Prometheus metrics |

### 10.2 Quote Request/Response

```typescript
// POST /quote
interface QuoteRequest {
  offer_id: string;
  model_id: string;
  estimated_input_tokens?: number;
  estimated_output_tokens?: number;
  policy_hash?: string;
}

interface QuoteResponse {
  quote: OfferQuote;
  valid_until: string;  // ISO timestamp
}
```

### 10.3 Job Request/Response

```typescript
// POST /jobs
interface JobRequest {
  job_id: string;
  model_id: string;
  offer_id: string;
  quote: OfferQuote;
  input: {
    prompt?: string;
    messages?: Array<{ role: string; content: string }>;
  };
  options?: {
    max_tokens?: number;
    temperature?: number;
    publish_ipfs?: boolean;
  };
}

interface JobResponse {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  queue_position?: number;
  estimated_wait_ms?: number;
}

// GET /jobs/:id
interface JobStatusResponse {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: {
    output: any;
    output_ref: string;
    outputs_hash: string;
    metrics: {
      ttft_ms: number;
      tokens_in: number;
      tokens_out: number;
      total_latency_ms: number;
    };
    ipfs_cid?: string;  // If publish_ipfs was requested
  };
  error?: {
    code: string;
    message: string;
  };
  receipt_id?: string;
}
```

---

## 11. Appendix: Schema Files

Created in Phase 1:
- `schemas/OfferQuote.schema.json`
- `schemas/JobRequest.schema.json`
- `schemas/JobResult.schema.json`
- `schemas/WorkerIdentity.schema.json`
- `schemas/ComputeOffer.schema.json`

Extended in Phase 1:
- `schemas/RunReceipt.schema.json` (13 new fields)
- `schemas/ComputeMeta.schema.json`

---

*Document generated: 29 January 2026*  
*Architecture Version: 0.1.0*
