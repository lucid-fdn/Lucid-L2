# Fluid Compute v0 — CTO Acceptance Checklist

**Purpose:** A phase-by-phase “Done means X” checklist for executive review.

---

## ✅ Phase 0 — Architecture & Truth Labels

**Done means:**
- [ ] Architecture document exists with two execution modes (`managed_endpoint`, `byo_runtime`).
- [ ] `managed_endpoint` explicitly labeled as **simulation/harness** (not product promise).
- [ ] Receipts in managed mode **must** show `runtime_hash=null` and `gpu_fingerprint=null`.

**Evidence:**
- `docs/FLUID-COMPUTE-ARCHITECTURE-V0.md`
- `FLUID-COMPUTE-V0-IMPLEMENTATION-STATUS.md`

---

## ✅ Phase 1 — Schema & Type Spine

**Done means:**
- [ ] All v0 schemas are created/extended (OfferQuote, JobRequest, JobResult, WorkerIdentity, ComputeOffer, RunReceipt, ComputeMeta).
- [ ] TypeScript interfaces exist and match schema fields.
- [ ] Extended receipt fields include job/quote binding, outputs hash, input/output refs, error fields, timing, and metrics.

**Evidence:**
- `schemas/*.schema.json`
- `offchain/src/types/fluidCompute.ts`

---

## ✅ Phase 2 — Receipts, Hashing, Replay Protection

**Done means:**
- [ ] `computeQuoteHash()` includes **all bound quote fields** (offer_id, model_id, policy_hash, token caps, price, expires_at, nonce).
- [ ] `computeJobHash()` binds job_id + model_id + offer_id + quote_hash + input_hash.
- [ ] Receipt includes execution_mode, job_hash, quote_hash, runtime_hash, gpu_fingerprint, outputs_hash.
- [ ] Quote replay protection enforced (nonce + expiration + signature validation).

**Evidence:**
- `offchain/src/services/receiptService.ts`

---

## ✅ Phase 4A — Managed Endpoint Worker (Simulation Harness)

**Done means:**
- [ ] HuggingFace proxy worker runs end-to-end.
- [ ] `/quote` endpoint issues signed quotes (TTL 5 min).
- [ ] `/jobs` executes inference and returns receipt.
- [ ] Receipts explicitly show managed_endpoint mode (null runtime_hash/gpu_fingerprint).
- [ ] Prometheus metrics endpoint is live.

**Evidence:**
- `offchain/src/workers/worker-sim-hf/`

---

## ⏳ Phase 3 — Solana thought-epoch Upgrade (Required for Verifiable Pipeline)

**Done means:**
- [ ] New `EpochRecordV2` account schema exists.
- [ ] `commit_epoch_v2` instruction writes (epoch_id, leaf_count, timestamp, mmr_size).
- [ ] Offchain receipts can be anchored to Solana via epoch root.

**Evidence:**
- `programs/thought-epoch/src/lib.rs`
- On-chain tests

---

## ⏳ Phase 4B — BYO Runtime Worker (Product Promise)

**Done means:**
- [ ] Worker runs vLLM or TGI with model pinned by revision.
- [ ] GPU fingerprint recorded (vendor, model, vRAM).
- [ ] runtime_hash = Docker image digest.
- [ ] Worker cache directory with size limit + eviction policy.
- [ ] Receipts created with execution_mode=`byo_runtime`.

**Evidence:**
- `offchain/src/workers/worker-gpu-vllm/` (or equivalent)

---

## ⏳ Phase 5 — Observability

**Done means:**
- [ ] Prometheus metrics wired for all workers.
- [ ] Grafana dashboard provided.
- [ ] Alerts for job failures, latency, and queue depth.
- [ ] (Optional) OpenTelemetry tracing.

---

## ⏳ Phase 6 — E2E Verifiability Test

**Done means:**
- [ ] Golden-path test: quote → job → receipt → MMR leaf → epoch root → verification.
- [ ] Verification can be performed by a third party with no trust in orchestrator.

---

## Storage Policy (v0)

**Done means:**
- [ ] **Hot lane**: S3 (fast reads / UX).
- [ ] **Cold/export lane**: IPFS/Filecoin optional publish.
- [ ] Receipts reference both lanes when enabled.

---

## Demo Readiness (Minimum Credible Demo)

**Done means:**
- [ ] At least **one real GPU node** runs `byo_runtime` worker.
- [ ] End-to-end demo uses **real runtime hash + GPU fingerprint**.
- [ ] Managed endpoint worker used only for backup/demo harness.

---

## v1 Migration Tickets (Non-Blocking but Required)

**Required tickets:**
- [ ] Versioned PDA seeds or explicit V2 header account for epoch data.
- [ ] Provider/worker-signed quotes (remove orchestrator trust assumption).
- [ ] Full on-chain attestation verification.
