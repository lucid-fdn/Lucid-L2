# Fluid Compute v0 — Final Acceptance Checklists

**Document Version**: 1.0  
**Created**: 2026-02-04  
**Last Updated**: 2026-02-04  
**Status**: In Progress

---

## Executive Summary

This document defines **line-by-line acceptance criteria** for Fluid Compute v0. No item can be marked "DONE" without proof (test output, screenshot, tx signature, or code reference).

**Key Principle**: BYO runtime worker (`worker-gpu-vllm`) is the product, not optional. Pass A (Lucid Cloud on Runpod) is required for v0 DONE.

---

## Progress Summary

| Priority | Total | Complete | Progress |
|----------|-------|----------|----------|
| P0       | 19    | 17       | 89%      |
| P1       | 4     | 0        | 0%       |
| P2       | 5     | 0        | 0%       |
| **Total**| **28**| **17**   | **61%**  |

---

## P0 — v0 DONE (BYO Runtime Required)

### P0.1: Create `worker-gpu-vllm` with vLLM adapter
**Status**: ✅ Complete

- [x] `offchain/src/workers/worker-gpu-vllm/index.ts` exists
- [x] `POST /quote` returns signed `OfferQuote` with `quote_hash`
- [x] `POST /jobs` accepts `JobRequest`, validates quote, executes
- [x] `GET /jobs/:id` returns `JobResult` with receipt
- [x] `GET /health` returns worker status + GPU info
- [x] `GET /identity` returns `WorkerIdentity` (WorkerHello)
- [x] vLLM runtime adapter implements `ensureModel()`, `runInference()`
- [x] Worker processes real inference (not mock)

**Proof Required**: `curl` commands showing all endpoints work with real model

**Note**: `/metrics` endpoint moved to P0.18 (prod security baseline) as it's required for monitoring.

---

### P0.2: Implement `getRuntimeHash()`
**Status**: ✅ Complete

- [x] Function returns `sha256:<digest>` of running Docker image
- [x] Hash is deterministic (same image = same hash)
- [x] Hash included in `WorkerIdentity.runtime_hash`
- [x] Hash included in all receipts

**Proof Required**: Two runs on same image produce identical hash

---

### P0.3: Implement `getGpuFingerprint()`
**Status**: ✅ Complete

- [x] Function returns `<vendor>-<model>-<vram>` (e.g., `NVIDIA-A100-40GB`)
- [x] Reads from `nvidia-smi` or CUDA runtime
- [x] Fingerprint included in `WorkerIdentity.gpu_fingerprint`
- [x] Fingerprint included in all receipts

**Proof Required**: Output matches actual GPU hardware

---

### P0.4: Worker keypair + signing
**Status**: ✅ Complete

- [x] Worker generates/loads ed25519 keypair on startup
- [x] Private key stored securely (env var or file)
- [x] `operator_pubkey` exposed in `WorkerIdentity`
- [x] All quotes signed by worker key
- [x] All receipts signed by worker key (not orchestrator)

**Proof Required**: Signature verification passes using `operator_pubkey`

---

### P0.5: S3 hot lane output storage
**Status**: ✅ Complete

- [x] Outputs uploaded to S3 after job completion
- [x] `output_ref` in receipt points to S3 location
- [x] Format: `s3://<bucket>/<prefix>/<job_id>/output.json`
- [ ] S3 SSE encryption enabled (needs AWS SDK config)

**Proof Required**: S3 object retrievable via `output_ref`

---

### P0.6: Deploy on Runpod with pinned image
**Status**: 🟡 Documentation Complete (Deployment Pending)

- [x] Deployment documentation created
- [ ] Runpod endpoint created (A10/L4/A100)
- [ ] Docker image tag pinned (no `:latest`)
- [ ] Environment variables configured (WORKER_ID, S3_*, etc.)
- [ ] Worker accessible via HTTPS
- [ ] All smoke tests pass on Runpod

**Proof Required**: Health check URL returns 200 with GPU info

**Implementation**: `docs/FLUID-COMPUTE-RUNPOD-DEPLOYMENT.md` - Complete deployment guide including:
- Dockerfile configuration with vLLM and Node.js
- Runpod endpoint configuration and environment variables
- GPU hardware verification and supported types
- Runtime hash and identity configuration
- Smoke tests for health, identity, quote, and job endpoints
- Monitoring, scaling, and troubleshooting guides

---

### P0.7: Receipt validity gates
**Status**: ✅ Complete

- [x] Receipt rejected if `execution_mode` missing
- [x] Receipt rejected if `job_hash` missing
- [x] Receipt rejected if `quote_hash` missing
- [x] Receipt rejected if `outputs_hash` missing (unless error_code set)
- [x] Receipt rejected if `byo_runtime` but `runtime_hash=null`
- [x] Receipt rejected if `byo_runtime` but `gpu_fingerprint=null`

**Proof Required**: Unit tests for each rejection case

**Implementation**: 
- `validateExtendedReceiptInput()` - Validates all gates, returns errors
- `assertValidExtendedReceiptInput()` - Strict validation, throws on first error
- `ReceiptValidationError` - Custom error class with code and field
- `createExtendedReceipt()` now enforces validation by default (skipValidation param available)

---

### P0.8: Idempotency + durable job state
**Status**: ✅ Complete

- [x] Redis (or Postgres) stores job state
- [x] Job state survives worker restart
- [x] Same `job_hash` submitted twice returns same `job_id` + result (idempotency)
- [x] State machine: `queued → running → succeeded/failed`
- [x] Timeouts enforced (configurable)

**Proof Required**: Kill worker mid-job, restart, job resumes/recovers

**Implementation**: `offchain/src/workers/worker-gpu-vllm/redisJobStore.ts` - Full Redis-backed job store:
- **Durable Storage**: Jobs persisted to Redis with configurable TTLs
- **Idempotency**: `createJob()` uses SETNX for atomic idempotent creation based on `job_hash`
- **State Machine**: Enforced valid transitions (queued→running→completed/failed/cancelled)
- **Timeout Enforcement**: Automatic timeout checker runs every 60s
- **Crash Recovery**: `recoverJobs()` called on startup to requeue interrupted jobs
- **Distributed Locking**: State transitions use Redis locks to prevent race conditions
- **Environment Variables**:
  - `REDIS_URL`: Redis connection string (default: redis://localhost:6379)
  - Job timeout: Configurable via `jobTimeoutSeconds` (default: 600s)
  - TTLs: `jobTtlSeconds` (24h), `completedTtlSeconds` (1h)

---

### P0.9: `/verify/:receipt_hash` endpoint
**Status**: ✅ Complete

- [x] Endpoint exists on offchain API
- [x] Returns inclusion proof from MMR
- [x] Returns epoch tx signature
- [x] Returns `verified: true/false`
- [x] Supports both regular and extended receipts
- [x] Returns Fluid Compute v0 fields (execution_mode, runtime_hash, gpu_fingerprint)

**Proof Required**: `curl /verify/<hash>` returns valid proof

**Implementation**: `offchain/src/routes/lucidLayerRoutes.ts` - GET `/v1/verify/:receipt_hash`

---

### P0.10: E2E proof with real runtime_hash/gpu_fingerprint
**Status**: ⬜ Not Started

- [ ] Full loop: resolve → match → quote → execute → receipt → MMR → Solana
- [ ] Receipt contains non-null `runtime_hash`
- [ ] Receipt contains non-null `gpu_fingerprint`
- [ ] Epoch committed to Solana v2 PDA
- [ ] Proof verifies against on-chain root

**Proof Required**: Test output showing all fields + tx signature

---

### P0.11: Quote store + single-use enforcement
**Status**: ✅ Complete

- [x] Worker stores used `quote_id` (Redis/memory)
- [x] Same `quote_id` submitted twice → reject with error
- [x] Receipt service also rejects duplicate `quote_hash`
- [x] Belt + suspenders: both layers enforce

**Proof Required**: Submit same quote twice, second fails

---

### P0.12: Shared canonical hashing package
**Status**: ✅ Complete

- [x] `offchain/src/utils/` contains `canonicalSha256Hex()` (shared module)
- [x] Used by both offchain and worker (workers import from `../../utils/hash`)
- [x] JCS (JSON Canonicalization Scheme) implementation via `json-canonicalize` (RFC 8785)
- [x] Deterministic across platforms (RFC 8785 standard)

**Proof Required**: Same input produces same hash in offchain + worker

**Implementation**: `docs/FLUID-COMPUTE-CANONICAL-HASH-SPEC.md` - Complete specification including:
- Core implementation in `offchain/src/utils/hash.ts` and `canonicalJson.ts`
- Workers use same code via relative imports
- RFC 8785 compliance via `json-canonicalize` library
- Cross-platform determinism (TypeScript, Python, Rust examples)
- Security considerations and hash binding requirements
- Note: Separate `packages/canonical/` extraction planned for v1

---

### P0.13: GET `/identity` (WorkerHello) endpoint
**Status**: ✅ Complete

- [x] Returns full `WorkerIdentity` object
- [x] Includes `runtime_hash`, `gpu_fingerprint`, `operator_pubkey`
- [x] Includes `supported_models`, `capabilities`, `status`
- [x] Conforms to `WorkerIdentity.schema.json`

**Proof Required**: Response validates against schema

---

### P0.14: Add `compute_offer_passport_id` alongside `offer_id`
**Status**: ✅ Complete

- [x] `OfferQuote` includes `compute_offer_passport_id` field
- [x] `JobRequest` includes `compute_offer_passport_id` field
- [x] Receipt includes `compute_offer_passport_id`
- [x] Links execution to on-chain passport

**Proof Required**: Schema updated, types generated

**Implementation**:
- `schemas/OfferQuote.schema.json` - Added optional `compute_offer_passport_id` field
- `schemas/JobRequest.schema.json` - Added optional `compute_offer_passport_id` field
- `schemas/RunReceipt.schema.json` - Added optional `compute_offer_passport_id` field
- `offchain/src/types/fluidCompute.ts` - Updated `OfferQuote`, `JobRequest`, `ExtendedReceiptBody`, `ExtendedRunReceiptInput` interfaces
- Links execution to Solana PDA for on-chain verifiable matching

---

### P0.15: Define `output_ref` format + access model
**Status**: ✅ Complete

- [x] Format documented: `s3://<bucket>/<prefix>/<job_id>/output.json`
- [x] Alternative: `ipfs://<cid>` for export lane
- [x] Access requires signed URL or auth token
- [x] Retention policy defined (default: 30 days)
- [x] **SDK-consumable access path defined**

**Proof Required**: Documentation exists, retrieval works via SDK

**Implementation**: `docs/FLUID-COMPUTE-OUTPUT-REF-SPEC.md` - Complete specification including:
- S3 URI format with bucket/prefix/job_id structure
- IPFS format for future decentralized export lane
- Access model with presigned URLs (15-minute expiry)
- 30-day retention policy with archive options
- Hash verification flow for integrity

**Required for SDK/MCP consumers**: `output_ref` MUST be one of:
- **(A) HTTPS presigned URL** (recommended for MVP) - directly fetchable, OR
- **(B) `s3://...` URI** AND worker provides `GET /v1/outputs/:job_id` that returns presigned URL

**v0 MVP Choice**: Option (B) - Worker provides `/v1/outputs/:job_id` endpoint that:
1. Validates API key authentication
2. Generates S3 presigned URL (15-minute expiry)
3. Returns `{ url: "https://...", expires_at: timestamp }`

---

### P0.16: Runtime health/readiness gates
**Status**: ✅ Complete

- [x] `/health` checks vLLM/TGI runtime status
- [x] `/ready` checks model loaded + warm
- [x] Worker reports `status: degraded` if runtime unhealthy
- [x] Worker reports `status: offline` (unhealthy) if runtime down

**Proof Required**: Kill vLLM, health check returns unhealthy

**Implementation**:
- `/health` endpoint returns status: 'healthy' | 'degraded' | 'unhealthy'
- `/ready` endpoint checks: runtime health, models loaded, queue depth
- `workerIdentity.status` automatically updated based on runtime health
- Connection errors → 'unhealthy' + 503, other errors → 'degraded' + 503

---

### P0.17: Enforce pinned model revision
**Status**: ✅ Complete

- [x] Worker rejects `model_id` without revision hash
- [x] Worker rejects "latest" as revision
- [x] Model cache key includes revision
- [x] Receipt includes model revision

**Proof Required**: Submit job with "latest", get rejection error

---

### P0.18: Prod security baseline
**Status**: ✅ Complete

- [x] Auth on `/quote` and `/jobs` (API key or JWT)
- [x] Rate limiting per key/tenant
- [x] CORS configured appropriately
- [x] Max limits enforced (tokens, concurrency, runtime)
- [x] No open worker endpoints
- [x] HTTP payload size limits (DoS prevention)
- [x] `GET /metrics` returns Prometheus-format metrics (scrapable)

**Proof Required**: Unauthorized request returns 401, /metrics scrapable by Prometheus

**Implementation**: `offchain/src/workers/worker-gpu-vllm/index.ts` - Full security baseline including:
- **API Key Authentication**: Bearer token validation with constant-time comparison
- **Rate Limiting**: Per-client (key or IP) with 60 req/min default, sliding window
- **CORS**: Configurable origins via `CORS_ORIGINS` env var
- **Request Limits**: Max input tokens (32768), max output tokens (8192), max runtime (10min)
- **Body Size Limit**: 10MB on /quote and /jobs (express.json limit)
- **`GET /metrics`**: Prometheus-format endpoint exposing:
  - `fc_worker_info` - Worker metadata (id, runtime_hash, gpu)
  - `fc_worker_uptime_seconds` - Uptime counter
  - `fc_jobs_total{status}` - Job counts by status (queued, running, completed, failed)
  - `fc_jobs_active` - Current active jobs
  - `fc_max_concurrent` - Max concurrent jobs allowed
- **Environment Variables**:
  - `WORKER_API_KEYS`: Comma-separated list of valid API keys
  - `RATE_LIMIT_PER_MINUTE`: Rate limit threshold (default: 60)
  - `CORS_ORIGINS`: Allowed origins (default: *)
  - `REQUIRE_AUTH`: Set to 'false' for dev mode (default: true)
  - `MAX_INPUT_TOKENS`, `MAX_OUTPUT_TOKENS`, `MAX_RUNTIME_MS`: Limits

### P0.19: Static model allowlist enforced
**Status**: ✅ Complete

- [x] Configurable list of approved model IDs (via env/config)
- [x] Worker rejects unlisted models with clear error
- [x] Allowlist loaded on startup from `MODEL_ALLOWLIST` env var

**Proof Required**: Submit job with non-allowed model, get rejection error

**Rationale**: Product safety requirement - cannot allow arbitrary HF models when charging money.

**Implementation**: `offchain/src/workers/worker-gpu-vllm/index.ts`:
- **`validateModelAllowlist()`**: Checks model against allowlist with prefix matching for revisions
- **Both `/quote` and `/jobs`**: Validate model before processing
- **Returns 403** with clear error and list of allowed models
- **Environment Variables**:
  - `MODEL_ALLOWLIST`: Comma-separated list of allowed model IDs
  - `ENFORCE_MODEL_ALLOWLIST`: Set to 'false' to disable (default: enforce)
- **Prefix Matching**: `model@revision` matches allowlisted `model`

---

## P1 — v0 Polish (After P0 Complete)

### P1.1: TGI runtime adapter
**Status**: ⬜ Not Started

- [ ] Alternative to vLLM for broader compatibility
- [ ] Same interface: `ensureModel()`, `runInference()`
- [ ] Runtime selection via `RUNTIME=tgi` env var

---

### P1.2: Pass B — Aethir DePIN deployment
**Status**: ⬜ Not Started

- [ ] Worker deployed on Aethir GPU node
- [ ] Same codebase, different venue
- [ ] Receipts identical to Pass A
- [ ] Router can route to Aethir workers

---

### P1.3: Multi-worker routing
**Status**: ⬜ Not Started

- [ ] Orchestrator discovers multiple workers
- [ ] Routing based on model availability + capacity
- [ ] Fallback: DePIN first → Pass A fallback

---

### P1.4: Grafana dashboard
**Status**: ⬜ Not Started

- [ ] Dashboard shows job metrics
- [ ] Dashboard shows worker health
- [ ] Dashboard shows epoch commits

---

### P1.5: Dynamic model allowlist management
**Status**: ⬜ Not Started

- [ ] Admin API to add/remove models from allowlist
- [ ] Persist allowlist to Redis/DB
- [ ] Hot-reload without worker restart

---

## P2 — v1 Prep (Optional for v0)

### P2.1: Provider self-registration
**Status**: ⬜ Not Started

- [ ] Provider can register worker via API
- [ ] Creates `ComputeProviderPassport` on-chain
- [ ] Creates `ComputeOfferPassport` on-chain

---

### P2.2: Conformance test suite
**Status**: ⬜ Not Started

- [ ] Tests quote binding
- [ ] Tests receipt schema compliance
- [ ] Tests output hash correctness
- [ ] Tests metrics endpoint

---

### P2.3: Worker Helm chart
**Status**: ⬜ Not Started

- [ ] Helm chart for Kubernetes deployment
- [ ] ConfigMap for env vars
- [ ] Secret for keys
- [ ] HPA for autoscaling

---

### P2.4: Key rotation procedure
**Status**: ⬜ Not Started

- [ ] Document key rotation steps
- [ ] Grace period for old signatures
- [ ] On-chain pubkey update

---

### P2.5: TrustGate OpenAI-compatible layer
**Status**: ⬜ Not Started

- [ ] `/v1/chat/completions` endpoint
- [ ] `/v1/embeddings` endpoint
- [ ] Maps to internal job flow
- [ ] Same receipt/proof layer

---

## Acceptance Gates

### Gate 1: P0 Complete (v0 DONE)
- [ ] All P0 items checked ✓
- [ ] E2E test passes with real GPU
- [ ] Receipt on Solana v2 PDA
- [ ] Proof verifies

### Gate 2: v0 Launch Ready
- [ ] P0 + P1.1-P1.3 complete
- [ ] Two venues working (Runpod + Aethir)
- [ ] Monitoring in place

### Gate 3: v1 Ready
- [ ] P0 + P1 + P2 complete
- [ ] Provider self-registration works
- [ ] Conformance tests pass

---

## Changelog

| Date       | Version | Changes                                      |
|------------|---------|----------------------------------------------|
| 2026-02-04 | 1.0     | Initial checklist created from CTO feedback  |

---

## References

- [FC.md](./FC.md) - Fluid Compute Master Plan & CDC
- [FLUID-COMPUTE-V0-IMPLEMENTATION-STATUS.md](./FLUID-COMPUTE-V0-IMPLEMENTATION-STATUS.md) - Previous status
- [thought-epoch program](./programs/thought-epoch/src/lib.rs) - Solana program
- [worker-sim-hf](./offchain/src/workers/worker-sim-hf/) - Reference harness implementation