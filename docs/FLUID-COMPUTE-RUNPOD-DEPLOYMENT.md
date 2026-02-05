# Fluid Compute v0 — Runpod Deployment Guide

**Version**: 1.1  
**Last Updated**: 2026-02-05  
**Status**: P0.6 Implementation

---

## Overview

This guide covers deploying the `worker-gpu-vllm` BYO Runtime worker on Runpod GPU infrastructure. This is "Pass A" (Lucid Cloud) for Fluid Compute v0.

**Important**: Pass A is the always-on Lucid Cloud baseline. It must not be "best effort" or cold-start.

---

## Prerequisites

- Runpod account with GPU access
- Docker Hub / Container Registry access
- AWS S3 bucket configured for output storage (with SSE enabled)
- Solana wallet for worker identity
- Redis instance for job state persistence (P0.8)

---

## 1. Build and Push Docker Image

### 1.1 Entrypoint Script

Create `entrypoint.sh` - this starts vLLM first, waits for it to be healthy, then starts the Node.js worker:

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${VLLM_MODEL_ID:?VLLM_MODEL_ID is required (pinned revision)}"
: "${VLLM_PORT:=8000}"
: "${WORKER_PORT:=8080}"

mkdir -p "${VLLM_MODEL_DIR:-/models}"

echo "[entrypoint] starting vLLM on :${VLLM_PORT} for ${VLLM_MODEL_ID}"
python3 -m vllm.entrypoints.openai.api_server \
  --host 0.0.0.0 \
  --port "${VLLM_PORT}" \
  --model "${VLLM_MODEL_ID}" \
  --download-dir "${VLLM_MODEL_DIR:-/models}" \
  --tensor-parallel-size "${VLLM_TENSOR_PARALLEL_SIZE:-1}" \
  ${VLLM_EXTRA_ARGS:-} \
  > /var/log/vllm.log 2>&1 &

echo "[entrypoint] waiting for vLLM..."
for i in {1..60}; do
  if curl -sf "http://127.0.0.1:${VLLM_PORT}/health" >/dev/null; then
    echo "[entrypoint] vLLM healthy"
    break
  fi
  sleep 2
done

echo "[entrypoint] starting worker on :${WORKER_PORT}"
exec node dist/workers/worker-gpu-vllm/index.js
```

### 1.2 Dockerfile

```dockerfile
# Dockerfile for worker-gpu-vllm
FROM nvidia/cuda:12.1-runtime-ubuntu22.04

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 python3-pip \
    curl wget \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Install vLLM
RUN pip3 install vllm torch transformers

# Create app directory
WORKDIR /app

# Copy package files
COPY offchain/package*.json ./
RUN npm ci --production

# Copy worker code
COPY offchain/dist/ ./dist/
COPY offchain/src/workers/worker-gpu-vllm/ ./src/workers/worker-gpu-vllm/

# Copy entrypoint script
COPY offchain/src/workers/worker-gpu-vllm/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Environment
ENV NODE_ENV=production
ENV WORKER_PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start via entrypoint (starts vLLM + worker)
CMD ["/entrypoint.sh"]
```

### 1.3 Build and Tag

```bash
# Build with specific version tag (NEVER use :latest)
VERSION="1.0.0-$(git rev-parse --short HEAD)"
docker build -t lucidlayer/worker-gpu-vllm:$VERSION .

# Push to registry
docker push lucidlayer/worker-gpu-vllm:$VERSION

# Record the image digest (CRITICAL for RUNTIME_HASH)
IMAGE_DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' lucidlayer/worker-gpu-vllm:$VERSION)
echo "Image digest: $IMAGE_DIGEST"
# Example output: lucidlayer/worker-gpu-vllm@sha256:abc123...

# Extract just the sha256 part for RUNTIME_HASH
RUNTIME_HASH=$(echo $IMAGE_DIGEST | cut -d'@' -f2)
echo "Set RUNTIME_HASH=$RUNTIME_HASH"
```

**IMPORTANT**: Always use a specific tag with git hash. The `runtime_hash` in receipts will be the image digest.

---

## 2. Runpod Configuration

### 2.1 Create Pod (Always-On)

> ⚠️ **Critical**: Use "Pods / Secure Cloud Pod" NOT "Serverless Endpoints"
> 
> Pass A is always-on Lucid Cloud baseline. Serverless endpoints have cold starts and are not suitable.

1. Go to **Runpod Console → Pods / Secure Cloud Pod → Create Pod**
2. Select GPU type:
   - **Recommended**: A100 40GB or A100 80GB for production
   - **Development**: A10G or L4 for testing
3. Configure:
   - **Container Image**: `lucidlayer/worker-gpu-vllm:1.0.0-abc123`
   - **Container Start Command**: (leave empty, uses CMD from Dockerfile)
   - **HTTP Port**: `8080`
   - **GPU Count**: 1 (or as needed)
   - **Min replicas**: 1 (always-on baseline)
4. Mount persistent volume at `/models` for model cache

### 2.2 Environment Variables

Set these in Runpod Pod configuration:

```env
# Worker Identity
WORKER_ID=worker-runpod-a100-us-east-001
PROVIDER_PASSPORT_ID=compute_provider_lucid_cloud

# Execution Mode
EXECUTION_MODE=byo_runtime

# Worker Signing Key (ed25519) - choose one format:
WORKER_SECRET_KEY_JSON=[1,2,3,...64 bytes...]   # JSON array of 64 bytes (recommended)
# OR
WORKER_SECRET_KEY_B64=base64EncodedKey...       # base64 encoded (if supported)

# Worker API Authentication (P0.18)
WORKER_API_KEYS=key1,key2,key3
REQUIRE_AUTH=true

# Redis for Job State Persistence (P0.8)
REDIS_URL=redis://<host>:6379

# S3 Configuration (with SSE encryption)
S3_BUCKET=lucid-compute-outputs
S3_PREFIX=v0/jobs
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=<access-key>
AWS_SECRET_ACCESS_KEY=<secret-key>

# Runtime Hash (set explicitly from build step)
RUNTIME_HASH=sha256:<image-digest-from-build>

# vLLM Configuration - PINNED MODEL REVISION REQUIRED
VLLM_MODEL_ID=meta-llama/Llama-2-7b-chat-hf@<REVISION>
VLLM_HOST=localhost
VLLM_PORT=8000
VLLM_MODEL_DIR=/models
VLLM_TENSOR_PARALLEL_SIZE=1

# Supported Models (comma-separated, with pinned revisions)
SUPPORTED_MODELS=meta-llama/Llama-2-7b-chat-hf@<REVISION>,mistralai/Mistral-7B-Instruct-v0.1@<REVISION>

# Model Allowlist (P0.19 - product safety)
MODEL_ALLOWLIST=meta-llama/Llama-2-7b-chat-hf,mistralai/Mistral-7B-Instruct-v0.1
ENFORCE_MODEL_ALLOWLIST=true

# Compute Offer
OFFER_ID=compute_offer_lucid_a100_us_east
COMPUTE_OFFER_PASSPORT_ID=<solana-pda-address>

# Pricing (lamports per 1k tokens)
PRICE_PER_1K_INPUT=10
PRICE_PER_1K_OUTPUT=30

# Limits
MAX_INPUT_TOKENS=4096
MAX_OUTPUT_TOKENS=2048
MAX_CONCURRENT_JOBS=4
JOB_TIMEOUT_SECONDS=300

# Quote TTL
QUOTE_TTL_SECONDS=300

# Logging
LOG_LEVEL=info
```

### 2.3 Secrets Management

For production, use Runpod Secrets:

1. Go to Secrets → Create Secret
2. Add `WORKER_SECRET_KEY_JSON` as a secret
3. Add `WORKER_API_KEYS` as a secret
4. Reference in endpoint: `${RUNPOD_SECRET_WORKER_SECRET_KEY_JSON}`

---

## 3. GPU Hardware Verification

The worker automatically detects GPU hardware on startup:

```typescript
// From runtimeUtils.ts
const gpuInfo = await getGpuFingerprint();
// Returns: "NVIDIA-A100-40GB" or "NVIDIA-A100-80GB"
```

### Supported GPU Types

| Runpod GPU | Fingerprint | VRAM | Recommended For |
|------------|-------------|------|-----------------|
| A100 40GB | `NVIDIA-A100-40GB` | 40GB | Llama-2 70B (4-bit), Mistral 7B |
| A100 80GB | `NVIDIA-A100-80GB` | 80GB | Llama-2 70B (16-bit) |
| H100 | `NVIDIA-H100-80GB` | 80GB | Large models, high throughput |
| A10G | `NVIDIA-A10G-24GB` | 24GB | Llama-2 7B, Mistral 7B |
| L4 | `NVIDIA-L4-24GB` | 24GB | Development, testing |

---

## 4. Runtime Hash Configuration

The `runtime_hash` ensures receipt integrity and deployment traceability.

**On Runpod, set `RUNTIME_HASH` explicitly to the pinned image digest; `getRuntimeHash()` must return this value.**

```env
# Set during deployment from the build step
RUNTIME_HASH=sha256:abc123def456...
```

### Why Explicit RUNTIME_HASH?

Inside Runpod containers, auto-detecting the Docker image digest is unreliable. By setting it explicitly:
- Receipt `runtime_hash` is deterministic and matches the deployed image
- Auditors can verify the exact code that ran
- No dependency on container runtime introspection

### Verification

```bash
# Verify the worker reports the correct hash
curl -s "$ENDPOINT/identity" | jq '.runtime_hash'
# Should match the RUNTIME_HASH env var
```

---

## 5. Persistent Model Cache

Mount a persistent volume at `/models` so model downloads survive container restarts:

1. In Runpod Pod config, add a **Persistent Volume**
2. Mount path: `/models`
3. Size: 100GB+ (depending on model sizes)

This prevents re-downloading large models on every restart.

---

## 6. Network Configuration

### 6.1 HTTPS Endpoint

Runpod provides HTTPS by default:
```
https://<pod-id>.runpod.net/
```

### 6.2 API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | No | Health check (returns GPU info) |
| `/ready` | GET | No | Readiness check (model loaded) |
| `/identity` | GET | No | Worker identity (WorkerHello) |
| `/metrics` | GET | No | Prometheus metrics (P0.18) |
| `/quote` | POST | **Yes** | Request a signed quote |
| `/jobs` | POST | **Yes** | Submit a job |
| `/jobs/:id` | GET | **Yes** | Get job status/result |
| `/v1/outputs/:job_id` | GET | **Yes** | Get output data/presigned URL |

---

## 7. S3 Output Storage with SSE Encryption

When uploading outputs to S3, enable Server-Side Encryption:

```typescript
// AWS SDK v3 example
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

await s3.send(new PutObjectCommand({
  Bucket: S3_BUCKET,
  Key: `${S3_PREFIX}/${jobId}/output.json`,
  Body: JSON.stringify(output),
  ContentType: "application/json",
  ServerSideEncryption: "AES256",  // Enable SSE
}));
```

---

## 8. Smoke Tests

**Important**: All authenticated endpoints require the `Authorization: Bearer <API_KEY>` header.

Set up test environment:
```bash
ENDPOINT="https://abc123.runpod.net"
WORKER_API_KEY="key1"  # One of the keys in WORKER_API_KEYS
```

### 8.1 Health Check (No Auth)

```bash
curl -s "$ENDPOINT/health" | jq
# Expected:
# {
#   "status": "healthy",
#   "worker_id": "worker-runpod-a100-us-east-001",
#   "execution_mode": "byo_runtime",
#   "gpu_available": true,
#   "queue_depth": 0
# }
```

### 8.2 Identity Check (No Auth)

```bash
curl -s "$ENDPOINT/identity" | jq
# Expected: Full WorkerIdentity object with:
# - runtime_hash (non-null, matches RUNTIME_HASH env)
# - gpu_fingerprint (non-null)
# - operator_pubkey
# - supported_models
```

### 8.3 Metrics Check (No Auth)

```bash
curl -s "$ENDPOINT/metrics"
# Expected: Prometheus-format metrics
# fc_worker_info{worker_id="...",runtime_hash="...",gpu="..."} 1
# fc_jobs_total{status="completed"} 0
# ...
```

### 8.4 Quote Request (Auth Required)

```bash
# Use pinned model revision!
curl -s -X POST "$ENDPOINT/quote" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "offer_id": "compute_offer_lucid_a100_us_east",
    "model_id": "meta-llama/Llama-2-7b-chat-hf@<REVISION>",
    "estimated_input_tokens": 100,
    "estimated_output_tokens": 500
  }' | jq
# Expected: Signed OfferQuote with quote_hash and quote_signature
```

### 8.5 Full Job Test (Auth Required)

```bash
# 1. Get quote (with pinned revision)
QUOTE=$(curl -s -X POST "$ENDPOINT/quote" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "offer_id": "compute_offer_lucid_a100_us_east",
    "model_id": "meta-llama/Llama-2-7b-chat-hf@<REVISION>",
    "estimated_input_tokens": 100,
    "estimated_output_tokens": 100
  }')

echo "Quote: $QUOTE" | jq

# 2. Submit job
# Note: job_hash is computed by the worker from the request (Option A: worker computes)
JOB_RESPONSE=$(curl -s -X POST "$ENDPOINT/jobs" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"job_id\": \"$(uuidgen)\",
    \"model_id\": \"meta-llama/Llama-2-7b-chat-hf@<REVISION>\",
    \"offer_id\": \"compute_offer_lucid_a100_us_east\",
    \"quote\": $QUOTE,
    \"input\": {
      \"messages\": [{\"role\": \"user\", \"content\": \"Hello!\"}]
    }
  }")

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.job_id')
echo "Job submitted: $JOB_ID"

# 3. Poll for result
sleep 5
curl -s "$ENDPOINT/jobs/$JOB_ID" \
  -H "Authorization: Bearer $WORKER_API_KEY" | jq
# Expected: JobResult with receipt containing:
# - runtime_hash (non-null)
# - gpu_fingerprint (non-null)
# - outputs_hash
# - output_ref (S3 URI)
```

### 8.6 Get Output (Auth Required)

```bash
curl -s "$ENDPOINT/v1/outputs/$JOB_ID" \
  -H "Authorization: Bearer $WORKER_API_KEY" | jq
# Expected:
# {
#   "job_id": "...",
#   "output_ref": "s3://bucket/...",
#   "outputs_hash": "sha256:...",
#   "expires_at": 1234567890
# }
```

---

## 9. Monitoring

### 9.1 Runpod Dashboard

Monitor via Runpod Console:
- Request count
- Latency percentiles
- GPU utilization
- Error rates

### 9.2 Prometheus Metrics

Metrics available at `/metrics` (no auth, for Prometheus scraping):
- `fc_worker_info{worker_id,runtime_hash,gpu}` - Worker metadata
- `fc_worker_uptime_seconds` - Uptime counter
- `fc_jobs_total{status}` - Jobs by status (queued, running, completed, failed)
- `fc_jobs_active` - Currently active jobs
- `fc_max_concurrent` - Max concurrent jobs configured

### 9.3 Logging

Logs available via Runpod Console or API:
```bash
curl -s "https://api.runpod.io/v2/<endpoint>/logs" \
  -H "Authorization: Bearer $RUNPOD_API_KEY"
```

---

## 10. Scaling

### 10.1 Auto-scaling

Configure in Runpod:
- **Min Workers**: 1 (always-on baseline - **required for Pass A**)
- **Max Workers**: 10 (peak load)
- **Scale Up Threshold**: Queue depth > 5
- **Scale Down Delay**: 5 minutes

### 10.2 Multiple Regions

Deploy to multiple regions for lower latency:
- `worker-runpod-a100-us-east-001`
- `worker-runpod-a100-us-west-001`
- `worker-runpod-a100-eu-west-001`

---

## 11. Pass A Acceptance Proof

Before declaring Pass A complete, verify all of the following:

### Identity Verification
```bash
curl -s "$ENDPOINT/identity" | jq '{
  execution_mode,
  runtime_hash,
  gpu_fingerprint,
  operator_pubkey
}'
```

**Must show**:
- [x] `execution_mode` = `"byo_runtime"`
- [x] `runtime_hash` != `null` (matches `RUNTIME_HASH` env var)
- [x] `gpu_fingerprint` != `null` (e.g., `"NVIDIA-A100-40GB"`)
- [x] `operator_pubkey` is valid ed25519 public key

### Job E2E Proof
1. Run 1 job → receipt emitted
2. `output_ref` points to S3 object
3. `outputs_hash` matches SHA256 of output bytes
4. Receipt includes `runtime_hash` and `gpu_fingerprint`

### Verification Proof
```bash
# Get receipt_hash from job result
RECEIPT_HASH=$(curl -s "$ENDPOINT/jobs/$JOB_ID" \
  -H "Authorization: Bearer $WORKER_API_KEY" | jq -r '.receipt_id')

# Verify receipt
curl -s "https://api.lucidlayer.com/v1/verify/$RECEIPT_HASH" | jq
```

**Must show**:
- [x] `verified: true`
- [x] `epoch_tx_signature` present (Solana v2 PDA)
- [x] `merkle_proof` present
- [x] `execution_mode` = `"byo_runtime"`

---

## 12. Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `runtime_hash: null` | RUNTIME_HASH env not set | Set RUNTIME_HASH explicitly |
| `gpu_fingerprint: null` | No GPU detected | Check NVIDIA drivers, CUDA |
| `VLLM connection refused` | vLLM not started | Check entrypoint.sh, /var/log/vllm.log |
| `Model not found` | Model not downloaded | Pre-download to /models volume |
| `Quote expired` | TTL too short | Increase `QUOTE_TTL_SECONDS` |
| `Signature verification failed` | Key mismatch | Verify `WORKER_SECRET_KEY_JSON` |
| `401 Unauthorized` | Missing/invalid API key | Add `Authorization: Bearer <key>` header |
| `403 Model not allowed` | Model not in allowlist | Add to MODEL_ALLOWLIST env var |

### Debug Commands

```bash
# Check GPU
nvidia-smi

# Check vLLM status
curl localhost:8000/health
cat /var/log/vllm.log

# Check worker logs
tail -f /var/log/worker.log

# Check Redis connectivity
redis-cli -u $REDIS_URL ping

# Verify runtime hash
echo "Expected: $RUNTIME_HASH"
curl -s localhost:8080/identity | jq '.runtime_hash'
```

---

## 13. Security Checklist

- [x] Worker signing key stored in Runpod Secrets (`WORKER_SECRET_KEY_JSON`)
- [x] API keys stored in Runpod Secrets (`WORKER_API_KEYS`)
- [x] AWS credentials stored in Runpod Secrets
- [x] HTTPS endpoint only (no HTTP)
- [x] API key authentication enabled (P0.18)
- [x] Rate limiting configured
- [x] Model allowlist enforced (P0.19)
- [x] No `:latest` tag used
- [x] Image digest recorded for audit (RUNTIME_HASH)
- [x] S3 SSE encryption enabled
- [x] Redis connection secured

---

## References

- [Runpod Documentation](https://docs.runpod.io)
- [vLLM Documentation](https://docs.vllm.ai)
- [Worker Implementation](../offchain/src/workers/worker-gpu-vllm/README.md)
- [Acceptance Checklist](../FLUID-COMPUTE-V0-ACCEPTANCE-CHECKLIST.md)