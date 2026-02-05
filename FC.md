# Fluid Compute — Updated Master Plan & TODO

**v0 Harness → v0 Real GPU Worker → Pass A / Pass B → Receipts → Epochs → TrustGate → v1**

---

## 0) North Star (non-negotiables)

Fluid Compute exists to make **compute execution**:

1. **routable** (policy-driven),
2. **verifiable** (receipts + anchoring),
3. **payable** (quote → run → receipt),
4. **portable** (passport references),
5. **scalable** (providers can run the worker in v1).

**Critical rule:**

- **Hot path is off-chain** (sub-100ms UX).
- **Chain is for truth anchors** (commit roots, identities, minimal receipts pointers).

## 0.1) Cloudflare of AI — explicit positioning

> **Fluid Compute is a Cloudflare-style edge layer for AI execution** — routing requests to the best available compute, caching models at the edge, and falling back to Lucid Cloud when decentralized capacity is unavailable.
> 

| Cloudflare concept | Fluid Compute equivalent |
| --- | --- |
| Anycast edge | Multiple worker pools (Runpod / Aethir / DePIN / BYO) |
| CDN cache | Local model cache on GPU workers |
| Smart routing | Policy engine + quote system |
| Origin fallback | **Pass A: Lucid Cloud baseline** |
| TLS certs | Worker identity + signatures |
| Request logs | Execution receipts |
| Audit logs | MMR + Solana epoch anchoring |
| One URL | TrustGate (OpenAI-compatible front door) |

**Important clarification**

“Anycast edge” is a **metaphor** for *multi-venue routing + deterministic policy*, **not literal BGP anycast** in v0.

---

## 1) Current Status (truthful)

### What’s already solid (keep)

### What’s already solid (KEEP)

- **Off-chain**
    - MMR + Merkle proofs
    - Receipt hashing + signing
    - Anchoring service
    - Matching / policy engine
    - Execution gateway flow (resolve → match → execute → receipt)
- **On-chain**
    - Lucid Passports program
    - Thought-Epoch program deployed (v1, legacy)
- **Harness**
    - `managed_endpoint` worker (HF proxy)
    - Explicitly labeled **simulation harness**, not product

### What’s missing (must build)

- Real GPU worker: `worker-gpu-vllm` (vLLM/TGI compatible)
- OfferQuote system (schema + signing + replay protection)
- Full receipt schema (job_hash, outputs_hash, quote_hash, identity)
- Thought-Epoch **v2** program
- Golden-path E2E verification test
- TrustGate compatibility layer (OpenAI-style)

---

## 2) Architecture (canonical)

```
Agent / SDK
   |
   | 1) resolve model passport
   v
ModelPassport Resolver (off-chain index + on-chain anchor)
   |
   | 2) match compute offer
   v
ComputeOffer Resolver
   |
   | 3) signed quote (OfferQuote)
   v
Lucid Worker
(managed_endpoint OR worker-gpu-vllm)
   |
   | 4) execute (hot path)
   v
Compute Venue
(HF / Runpod / Aethir / DePIN / BYO GPU)
   |
   | 5) emit ExecutionReceipt
   v
Receipt Service
   |
   | 6) append leaf → MMR
   | 7) commit epoch root → Solana
   v
Thought-Epoch Program (v2)
   |
   | 8) LucidScan index + verify
   v
Verifier / Enterprise Audit
```

---

## 3) Execution Modes

Every execution MUST declare:

```
execution_mode:
  -"byo_runtime"// real worker + vLLM/TGI
  -"managed_endpoint"// HF proxy / harness

```

Rules:

- `runtime_hash` and `gpu_fingerprint`
    - **REQUIRED** for `byo_runtime`
    - **MUST be null** for `managed_endpoint`
- Receipts without `execution_mode` are **INVALID**

## 4) V0 Workstreams (parallel)

### Workstream A — Schemas (BLOCKER)

### A1) New schemas

Create in `schemas/`:

- `OfferQuote.schema.json`
- `JobRequest.schema.json`
- `JobResult.schema.json`
- `WorkerIdentity.schema.json`

**OfferQuote MUST include**

- `schema_version`
- `quote_id` (UUID)
- `offer_id`
- `model_id`
- `policy_hash`
- `price { amount, unit }`
- `issued_at`, `expires_at`
- `terms_hash` (optional)
- `signer_pubkey`, `signature`
- `quote_hash` (canonical hash)

**Rules**

- Quotes are **single-use**
- Replay protection enforced by:
    - worker
    - receipt service

---

### A2) Extend existing schemas (backward-compatible)

**RunReceipt.schema.json — add**

- `execution_mode`
- `job_hash`
- `quote_hash`
- `outputs_hash`
- `output_ref`
- `worker_id`
- `worker_pubkey`
- `runtime_hash`
- `gpu_fingerprint`
- `start_ts`, `end_ts`
- `error_code`, `error_message` (optional)

**ComputeMeta.schema.json — add**

- `operator_pubkey`
- `runtime_hash`
- `gpu_fingerprint`
- `region`
- `attestation_capabilities`

---

### A3) Type generation

- Auto-generate TS types
- Canonical JSON hashing rules documented

**Acceptance (A)**

Schemas compile, hash deterministically, used everywhere.

---

### Workstream B — Receipt Service (CRITICAL)

### B1) Canonical hashing

```
receipt_hash = hash(canonical(receipt_body))

```

Signer rules:

- `signer_type = orchestrator` → harness only
- `signer_type = worker` → real GPU worker

---

### B2) Quote binding (STRICT)

Worker MUST reject if:

- quote expired
- quote replayed
- offer_id / model_id / policy_hash mismatch
- signature invalid

Receipt MUST include:

- `quote_hash`
- `job_hash`

---

### B3) Job + output binding

```
job_hash = hash(canonical(JobRequestWithoutSecrets))
outputs_hash = hash(output_bytes)

```

---

### Workstream C — Thought-Epoch Program (Solana)

### C1) Versioning strategy (LOCKED)

**Do NOT mutate legacy PDA.**

Create:

- `EpochRecordV2`
- PDA seeds: `["epoch_v2", authority]`
- Instruction: `commit_epoch_v2`

---

### C2) EpochRecordV2 fields

- `epoch_id: u64`
- `leaf_count: u32`
- `mmr_size: u64`
- `timestamp: i64`
- `merkle_root: [u8;32]`
- `authority: Pubkey`

---

### C3) Off-chain anchoring

- Increment epoch_id
- Commit root + metadata
- LucidScan indexes v1 + v2

---

### Workstream D — Workers (THE PRODUCT)

---

### D0) Managed Endpoint Harness (HF proxy)

Purpose:

- Dev speed
- Demos
- API ergonomics

Rules:

- ALWAYS labeled **Simulation Harness**
- `execution_mode = managed_endpoint`
- No fake runtime_hash
- Still emits full receipts + epochs

---

### D1) Real GPU Worker (Phase 4B — REQUIRED)

**This is Fluid Compute v0.**

### Minimal ≠ weak

Must have:

- vLLM **or** TGI adapter
- Model pull by **pinned revision**
- Local disk cache
- `/quote` + `/jobs`
- S3 hot-lane outputs
- Worker-signed receipts
- `runtime_hash` + `gpu_fingerprint`

---

### Worker API

- `POST /quote`
- `POST /jobs`
- `GET /jobs/:id`
- `GET /health`
- `GET /metrics`

---

### Runtime adapters

Both implement:

- `ensureModel(modelPassport)`
- `runInference(job)`
- `getRuntimeHash()`
- `getGpuFingerprint()`

---

### Model cache rules

- Per-worker cache dir
- Per-model download lock
- Revision-pinned paths
- Optional prewarm list

---

### Storage lanes

- **Hot lane:** S3 (required)
- **Export lane:** IPFS/Filecoin (optional)

---

### Signing identity

- ed25519 worker key
- Quotes + receipts signed by worker
- Passport binds provider → pubkey

---

# 5) Pass A / Pass B Execution Checklists (line-by-line)

## Pass A — **Lucid Cloud Core (not a temporary step)**

**Definition:** Pass A is **our always-on, controlled baseline** (“Lucid Cloud”) used for:

- **Fallback reliability** when DePIN is unstable/unavailable
- **Warm cache / low-latency** for the top models
- **SLO guarantees** (TrustGate depends on it)
- **Demo + production safety net** even after DePIN is live

**Rule (non-negotiable):**

- Pass B (DePIN) is **additive capacity**, not a replacement.
- The Router must always support: **DePIN-first → Pass A fallback**.

**Acceptance criteria update:**

- “Pass A DONE” is required for “v0-Core DONE”.
- “Pass B DONE” is optional in v0 and can land later without invalidating Pass A.

Also rename titles to remove “ship fast” vibes:

- Replace **“Pass A — Ship fast”** → **“Pass A — Lucid Cloud Baseline (Required)”**
- Replace **“Pass B — DePIN narrative”** → **“Pass B — DePIN Capacity (Optional in v0)”**

That’s what will prevent the dev from treating Pass A as disposable.

This matches:

- Cloudflare origin fallback
- Enterprise reliability expectations
- Investor expectations
- Your own narrative integrity

1. **Create Runpod endpoint**
    - Pick GPU: A10/L4/A100 depending budget
    - Expose ports for worker + vLLM/TGI
2. **Provision base image**
    - CUDA + drivers
    - vLLM or TGI installed
    - your `worker-gpu-vllm` container
3. **Set env**
    - `WORKER_ID`
    - `WORKER_PRIVATE_KEY`
    - `RUNTIME=vllm|tgi`
    - `MODEL_CACHE_DIR=/models`
    - `S3_BUCKET/KEY/SECRET/REGION`
    - `OFFCHAIN_API_URL` + auth
4. **Boot**
    - start model server
    - start worker API
5. **Smoke tests**
    - `POST /health`
    - `POST /quote`
    - `POST /jobs`
    - `GET /jobs/:id`
6. **Receipt verify**
    - receipt hash matches canonical
    - quote_hash present
    - job_hash present
    - outputs_hash present
7. **MMR + Epoch commit**
    - leaf appended
    - epoch root committed on Solana v2 PDA
8. **LucidScan proof**
    - can retrieve proof path
    - can verify inclusion

✅ This is “real compute” without needing DePIN onboarding friction.

---

## Pass B — “DePIN narrative” on Aethir (or other DePIN GPU supply)

1. **Obtain Aethir compute access**
2. **Get a raw GPU box (SSH)**
3. **Install stack**
    - Docker
    - CUDA sanity check
    - vLLM/TGI
    - worker container
4. **Disk caching**
    - mount persistent disk if possible
5. **Run the same smoke tests as Pass A**
6. **Receipts + anchoring identical**

✅ Same worker. Different venue.

---

## Lucid Cloud Fallback

Yes: Pass A can be your “Lucid Cloud fallback”.

Rule:

- “DePIN first” (when available)
- fallback to Runpod (or similar) for reliability/SLO.

## 6) **OpenAI-Compatible Interface (TrustGate readiness)**

Even if TrustGate ships later, make the worker/offchain compatible now:

- Define **canonical request shape** that can map from OpenAI:
    - `messages[]` / `prompt`
    - `temperature`, `top_p`, `max_tokens`
    - streaming flag
- Return a **standard response envelope** (even if not OpenAI exact yet).
- Add **streaming support** as a TODO (SSE/WebSocket), because “assistant UX” will demand it.

Provides:

- `/v1/chat/completions`
- `/v1/embeddings`
- auth, rate limits, tenants
- policy profiles
- retries, hedging, circuit breakers
- fallback to **Pass A**

**Important**

- TrustGate never changes receipts.
- Same truth layer underneath.

---

# 6) Observability (must-have)

Implement on both offchain + worker:

### Metrics

- `lucid_jobs_total{status,model_id,offer_id}`
- `lucid_job_latency_ms{p50,p95}`
- `lucid_queue_depth`
- `lucid_cache_hits_total`, `lucid_cache_misses_total`
- `lucid_model_download_seconds`
- `lucid_epoch_commits_total`
- `lucid_receipts_emitted_total`
- `lucid_receipt_verify_fail_total`

### Logging

- structured JSON logs
- correlation ids: `job_id`, `quote_id`, `receipt_hash`

**Acceptance (Obs):**

- Prometheus scrape works
- basic Grafana dashboard or at least a metrics page.

**Reliability & Idempotency (must-have)**

- **Idempotency key** on `/jobs`:
    - same job_hash submitted twice → return same job_id/result
- **Job state machine**:
    - queued → running → succeeded/failed
    - persisted in Redis (or Postgres) so restarts don’t lose jobs
- **Timeouts + retries**:
    - runtime call timeout
    - S3 upload retry
    - offchain receipt emit retry (with backoff)

---

# 7) Golden-path E2E Test (non-negotiable)

Create an automated test that runs the full loop:

1. resolve model passport
2. match compute offer
3. quote
4. execute job
5. store output to S3
6. emit receipt
7. append MMR leaf
8. commit epoch root to Solana
9. fetch proof and verify inclusion

**Acceptance (E2E):**

- single command test produces a verifiable receipt proof and prints:
    - job_hash
    - outputs_hash
    - receipt_hash
    - epoch tx signature
    - proof verified = true

---

# 9) V1 Plan (providers run the worker)

Once v0 works end-to-end, v1 is mostly packaging + trust boundaries.

## V1 Requirements

- Provider publishes:
    - `ComputeProviderPassport`
    - `ComputeOfferPassport` (SKU constraints)
- Providers run worker
- BYOK keys
- Deterministic runtime identity
- Conformance test suite
- Helm charts
- Reputation hooks
- Router can route to any provider offering matching constraints.

## V1 Deliverables

- `worker` docker image + helm chart
- conformance test suite:
    - quote binding
    - receipt schema compliance
    - output hash correctness
    - metrics endpoint required
- key rotation procedure
- allowlist/denylist + reputation input hooks (later)

---

## 10) CTO “Done Means X”

**v0 is DONE only if:**

- Real GPU worker executed a job
- Receipt emitted + signed
- Included in MMR
- Epoch committed on Solana v2
- Proof verifies

---

## 11) Final Product Truth

- HF Inference ≠ ModelPassport
- Managed endpoints ≠ product
- **BYO runtime worker is the product**
- TrustGate is the SaaS front door
- Pass A is permanent
- DePIN scales capacity

---

## 📌 ADDENDUM — Explicit Invariants

### A. Worker invariants (non-negotiable)

> **Worker Invariants (v0)**
> 
> - Only Lucid Worker processes are allowed to emit ExecutionReceipts.
> - Every receipt MUST include a `job_hash` and `outputs_hash`.
> - `runtime_hash` and `gpu_fingerprint` are:
>     - REQUIRED for `execution_mode = byo_runtime`
>     - MUST be `null` for `execution_mode = managed_endpoint`
> - A receipt without `quote_hash` is INVALID.
> - A receipt without `execution_mode` is INVALID.

This protects you from future “shortcut” implementations.

---

### B. Quote validity invariant

**OfferQuote Validity Rules**

- Quotes are single-use.
- Quotes are invalid if:
    - expired
    - replayed
    - any bound field mismatches the job request
- Quote validation happens **inside the worker**, not the orchestrator.

---

### C. Demo truth rule (very important)

- Any demo using `worker-sim-hf` MUST visibly label:
    
    “Managed Execution (Simulation Harness)”
    
- Any demo claiming “DePIN / edge runtime / cache” MUST use:
    
    `worker-gpu-vllm` with real GPU.
    

---

### D. Phase 4B definition lock

Add one sentence:

> **Phase 4B is not optional.**
> 
> 
> The product is not considered “Fluid Compute v0” until at least one BYO-runtime worker (vLLM or TGI) is live and producing receipts.
> 

This avoids “we shipped v0” debates later.

### **Security & Abuse Controls (must-have)**

**Worker**

- **Auth** on `/quote` and `/jobs` (API key or JWT). No open worker.
- **Rate limiting** per key/tenant (basic token bucket).
- **Max limits** enforced:
    - max_input_tokens
    - max_output_tokens
    - max_concurrency per worker
    - max_job_runtime_seconds (timeout)
- **Quote replay protection**:
    - worker stores `quote_id` used → rejects reuse
    - receipt service also rejects duplicate `quote_hash` (belt + suspenders)

**Offchain**

- Verify worker signatures on **quotes + receipts** (not just receipts).
- Reject receipts missing required bindings.

### **Storage & Data Handling (product reality)**

You already have “S3 hot lane / IPFS export lane”, but add:

- **Retention policy**:
    - outputs retained X days by default
    - enterprise option: BYO bucket
- **Encryption**:
    - S3 SSE enabled (or client-side encryption if needed later)
- **PII note**:
    - inputs/outputs may contain sensitive data → log redaction rules

### **Model Execution Constraints (must-have)**

For `worker-gpu-vllm/tgi`:

- Enforce **ModelPassport pinned revision** (no “latest”).
- Enforce **compatibility checks** before running:
    - VRAM >= min_vram
    - runtime supports format
- Add **model allowlist** for v0 (prevent arbitrary HF repos).

### **Deployment / Ops “Production Definition”**

Add a tiny “prod definition” so your CTO can say “this is live”:

- Docker images are **digest-pinned**
- Secrets via **vault or env** (no plaintext in repo)
- Health checks:
    - liveness + readiness
- Rollback procedure documented
- Minimal SLO targets (even internal):
    - p95 latency budget (per model tier)
    - error rate ceiling

### **LucidScan indexing contract**

Right now it says “LucidScan indexes proofs”, but add:

- Indexer must store:
    - receipt_hash
    - quote_hash
    - job_hash
    - output_ref
    - worker_id
    - epoch_tx
- Provide a **verify endpoint**:
    - `GET /verify/:receipt_hash` → returns inclusion proof + “verified true/false”