# BYO Runtime Worker (vLLM)

GPU-backed inference worker using vLLM with full attestation chain for Fluid Compute v0.

## Pass A Compliance: Lucid Cloud Baseline

This worker meets **Pass A** requirements for Fluid Compute v0:

- ✅ **Real `runtime_hash`**: Docker image digest (`sha256:...`)
- ✅ **Real `gpu_fingerprint`**: NVIDIA GPU model + VRAM (`NVIDIA-A100-80GB`)
- ✅ **Worker-signed receipts**: ed25519 signatures
- ✅ **Pinned model revisions**: Enforced for reproducibility
- ✅ **S3 hot lane storage**: Output persistence with `output_ref`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BYO Runtime Worker                       │
├─────────────────────────────────────────────────────────────┤
│  index.ts          - Express server, HTTP API endpoints     │
│  jobExecutor.ts    - Job lifecycle, receipts, S3 storage    │
│  quoteService.ts   - Worker-signed quotes, replay protection│
│  signingService.ts - ed25519 keypair management             │
│  vllmClient.ts     - OpenAI-compatible vLLM client          │
│  runtimeUtils.ts   - runtime_hash, gpu_fingerprint detection│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │   vLLM Server     │
                    │  (localhost:8000) │
                    └───────────────────┘
```

## Quick Start

### 1. Environment Variables

```bash
# Server
export WORKER_PORT=8080
export WORKER_HOST=0.0.0.0

# vLLM
export VLLM_BASE_URL=http://localhost:8000
export VLLM_API_KEY=optional-api-key

# Identity
export WORKER_ID=worker-runpod-a100-1
export PROVIDER_PASSPORT_ID=lucid-cloud-runpod

# Signing (one of these)
export WORKER_PRIVATE_KEY=<64-hex-char-ed25519-seed>
# OR
export WORKER_KEY_PATH=/etc/lucid/worker.key
# OR (development only)
export WORKER_AUTO_GENERATE_KEY=true

# Models (comma-separated)
export SUPPORTED_MODELS=meta-llama/Llama-3.3-70B-Instruct@abc123

# S3 (optional, for output persistence)
export S3_BUCKET=lucid-outputs
export S3_REGION=us-east-1
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...

# Limits
export MAX_CONCURRENT_JOBS=3
export JOB_TIMEOUT_MS=300000

# Pricing (per 1k tokens)
export PRICE_PER_INPUT_TOKEN=10
export PRICE_PER_OUTPUT_TOKEN=30
export PRICE_CURRENCY=lamports
```

### 2. Start vLLM Server

```bash
# Example with Llama 3.3 70B
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-3.3-70B-Instruct \
  --revision abc123 \
  --tensor-parallel-size 4 \
  --port 8000
```

### 3. Start Worker

```bash
cd offchain
npm run build
node dist/workers/worker-gpu-vllm/index.js
```

## API Endpoints

### Health & Status

```bash
# Health check
GET /health
# Response: { status: "healthy", worker_id, execution_mode, gpu_available, queue_depth }

# Worker identity
GET /identity
# Response: WorkerIdentity with runtime_hash, gpu_fingerprint

# Statistics
GET /stats
# Response: { total_jobs, queued, running, completed, failed }
```

### Quote Flow

```bash
# Request a quote
POST /quote
{
  "offer_id": "compute-offer-123",
  "model_id": "meta-llama/Llama-3.3-70B-Instruct@abc123",
  "estimated_input_tokens": 4096,
  "estimated_output_tokens": 1024
}

# Response
{
  "quote": {
    "quote_id": "uuid",
    "offer_id": "...",
    "model_id": "...",
    "policy_hash": "sha256:...",
    "max_input_tokens": 4096,
    "max_output_tokens": 1024,
    "price": { "amount": 50, "currency": "lamports" },
    "expires_at": 1234567890,
    "worker_pubkey": "hex...",
    "quote_hash": "sha256:...",
    "quote_signature": "ed25519-sig"
  },
  "valid_until": "2025-01-01T00:00:00.000Z"
}
```

### Job Execution

```bash
# Submit a job
POST /jobs
{
  "job_id": "job-uuid",
  "model_id": "meta-llama/Llama-3.3-70B-Instruct@abc123",
  "offer_id": "compute-offer-123",
  "quote": { ... },  # From /quote endpoint
  "input": {
    "messages": [
      { "role": "system", "content": "You are helpful." },
      { "role": "user", "content": "Hello!" }
    ]
  },
  "options": {
    "max_tokens": 1024,
    "temperature": 0.7
  },
  "job_hash": "sha256:..."
}

# Response (202 Accepted)
{
  "job_id": "job-uuid",
  "status": "queued",
  "queue_position": 1,
  "estimated_wait_ms": 10000
}

# Poll for result
GET /jobs/:job_id
{
  "job_id": "job-uuid",
  "status": "completed",
  "output": {
    "choices": [{ "index": 0, "message": { "role": "assistant", "content": "..." } }]
  },
  "output_ref": "s3://bucket/outputs/job-uuid/output.json",
  "outputs_hash": "sha256:...",
  "metrics": {
    "ttft_ms": 150,
    "tokens_in": 100,
    "tokens_out": 500,
    "total_latency_ms": 2500
  },
  "receipt_id": "run-uuid",
  "worker_id": "worker-runpod-a100-1",
  "execution_mode": "byo_runtime"
}

# Cancel a queued job
DELETE /jobs/:job_id
```

## Receipt Structure

Receipts include Fluid Compute v0 extended fields:

```typescript
{
  // Core
  run_id: "job-uuid",
  model_passport_id: "meta-llama/Llama-3.3-70B-Instruct@abc123",
  compute_passport_id: "compute-offer-123",
  policy_hash: "sha256:...",
  
  // Fluid Compute v0 extensions
  execution_mode: "byo_runtime",
  job_hash: "sha256:...",
  quote_hash: "sha256:...",
  node_id: "worker-runpod-a100-1",
  runtime_hash: "sha256:<docker-image-digest>",  // REAL
  gpu_fingerprint: "NVIDIA-A100-80GB",           // REAL
  outputs_hash: "sha256:...",
  output_ref: "s3://bucket/outputs/job-uuid/output.json",
  
  // Metrics
  ttft_ms: 150,
  tokens_in: 100,
  tokens_out: 500,
  total_latency_ms: 2500,
  
  // Signature
  receipt_hash: "sha256:...",
  receipt_signature: "ed25519-signature",
  signer_pubkey: "worker-pubkey-hex",
  signer_type: "worker"
}
```

## Pinned Model Revisions

**Mandatory for Pass A compliance.** Models must specify a pinned revision:

```
# Valid
meta-llama/Llama-3.3-70B-Instruct@abc123def456
mistralai/Mistral-7B-Instruct-v0.2@main~2024-01-15

# Invalid (rejected)
meta-llama/Llama-3.3-70B-Instruct
meta-llama/Llama-3.3-70B-Instruct@latest
```

This ensures reproducibility - the same model revision produces deterministic outputs (with seed).

## Security

### Worker Key Management

1. **Production**: Store key securely, set `WORKER_PRIVATE_KEY` or mount at `WORKER_KEY_PATH`
2. **Development**: Use `WORKER_AUTO_GENERATE_KEY=true` (logged warning)

### Quote Replay Protection

- Each quote has a UUID nonce (`quote_id`)
- Quote hashes are tracked in memory
- Used quotes are rejected (belt + suspenders)

### Signature Verification

All quotes and receipts are signed with ed25519 and can be verified:

```typescript
import { WorkerSigningService } from './signingService';

const valid = WorkerSigningService.verifyHash(
  receiptHash,
  receiptSignature,
  workerPubkey
);
```

## Docker Deployment

```dockerfile
FROM nvidia/cuda:12.1-base
# ... vLLM installation ...

COPY dist/workers/worker-gpu-vllm /app/worker

ENV WORKER_PORT=8080
ENV VLLM_BASE_URL=http://localhost:8000

CMD ["node", "/app/worker/index.js"]
```

The `runtime_hash` is automatically extracted from Docker image digest.

## Monitoring

### Prometheus Metrics (via vLLM)

```bash
curl http://localhost:8000/metrics
```

### Worker Stats

```bash
curl http://localhost:8080/stats
```

## Troubleshooting

### No runtime_hash

Worker running outside Docker container. For production, always use Docker.

### No gpu_fingerprint

- Check `nvidia-smi` is available
- Ensure NVIDIA drivers installed
- Check CUDA_VISIBLE_DEVICES

### Quote validation failed

- Check quote hasn't expired
- Verify quote hasn't been used (replay)
- Ensure bindings match (offer_id, model_id)

### Model not loaded

- Verify vLLM started with correct `--model`
- Check model revision matches request
- Ensure sufficient GPU memory

## Files

| File | Description |
|------|-------------|
| `index.ts` | Express server, HTTP API endpoints |
| `jobExecutor.ts` | Job lifecycle, receipt creation, S3 storage |
| `quoteService.ts` | Worker-signed quotes, replay protection |
| `signingService.ts` | ed25519 keypair management |
| `vllmClient.ts` | OpenAI-compatible vLLM client |
| `runtimeUtils.ts` | Runtime hash, GPU fingerprint detection |

## Related

- [Fluid Compute v0 Architecture](../../../docs/FLUID-COMPUTE-ARCHITECTURE-V0.md)
- [CDC Fluid Compute](../../../docs/CDC-Fluid_Compute.md)
- [Acceptance Checklist](../../../FLUID-COMPUTE-V0-ACCEPTANCE-CHECKLIST.md)