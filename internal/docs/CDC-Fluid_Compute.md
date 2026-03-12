# Cahier des charge - Fluid Compute

# ✅ DePIN GPU API (v0) — Complete TODO

## 0) Deliverables (what “done” means)

- **Lucid Worker** running on GPU machines (Aethir + your own) with vLLM/TGI
- **HTTP API**: `/quote`, `/jobs`, `/jobs/{id}`, `/health`
- **Model pull-by-revision** from HF + **local disk cache**
- **Optional prewarm** list of models
- **Signed OfferQuote** (short-lived) + deterministic `quote_hash`
- **ExecutionReceipt JSON** + `outputs_hash`
- **Receipt Service** builds **MMR** and commits epoch roots to **Solana PDA**
- **LucidScan Indexer** can verify: job → receipt → MMR proof → epoch root tx

---

# 1) Architecture (update for dev clarity)

```
Client/Agent SDK
  |
  |1) Resolvepassports(model + compute offer)
  v
PassportResolver(off-chain: IPFS/HTTPS + optional on-chain anchor)
  |
  |2) Requestquote(signed)
  v
LucidWorker(GPU Node)
  |
  |3) Executejob(vLLM/TGI + HF pull + cache)
  v
OutputStore(S3/IPFS/FS)
  |
  |4) EmitExecutionReceipt(JSON) + outputs_hash
  v
ReceiptService(MMR Builder)
  |
  |5) Append leaf -> MMR (off-chain)
  |6) Commit epoch root -> Solana PDA
  v
Solana(Epoch Root PDA + tx)
  |
  |7) Index & verify
  v
LucidScan / Verifier / Enterprise audit

```

**Key v0 truth:** Quotes are signed by **Lucid Operator key** (because you run the nodes).

**v1 later:** providers run worker + sign their own quotes.

---

# 2) Repo layout (organized & scalable)

Create a mono-repo with clear services:

- `packages/`
    - `schemas/` (JSON schemas + TS types + versioning)
    - `crypto/` (hashing/signing utils)
    - `sdk/` (client lib: quote/job/verify)
- `services/`
    - `worker/` (GPU node service)
    - `router/` (optional v0 minimal routing; can be “pick node” only)
    - `receipt-service/` (MMR + Solana commits)
    - `indexer/` (LucidScan MVP)
- `infra/`
    - `docker/` (images)
    - `helm/` (optional)
    - `terraform/` (optional later)

---

# 3) Specs first (must do before coding)

## 3.1 Define canonical objects + schemas (versioned)

Create JSON schema + TS types for:

### Passports (off-chain manifests)

- `ModelPassport`
    - `model_id`, `hf_repo`, `hf_revision` (pinned), `artifacts` (hashes optional v0)
    - `min_vram_gb`, `runtime` (`vllm|tgi`), `license`, `policy_tags`, `input_limits`
- `ComputeProviderPassport`
    - `provider_id`, `operator_pubkey`, `endpoints`, `regions`, `policies`
- `ComputeOfferPassport`
    - `offer_id`, `gpu_type`, `vram_gb`, `region`, `runtime`, `sla_tier`
    - `quote_endpoint`, `job_endpoint`, `attestation_capabilities` (v0 can be empty)

### OfferQuote (off-chain signed, short-lived)

- `quote_id` (uuid)
- `offer_id`, `model_id`
- `price` (token or USD cents), `expires_at`, `capacity_hint` (optional)
- `terms_hash` (hash of policy + pricing rules)
- `quote_signature` (ed25519)
- `quote_hash` = hash(canonical_json)

### JobRequest

- `job_id` (uuid)
- `model_id`, `offer_id`
- `quote` (embedded)
- `input` OR `input_ref` (S3/IPFS)
- `job_hash` = hash(canonical_json excluding non-deterministic fields)

### JobResult

- `job_id`, `status`
- `output_ref` (S3/IPFS/local)
- `outputs_hash` = hash(bytes or canonical JSON)
- `metrics` (latency_ms, tokens, etc.)

### ExecutionReceipt (off-chain, signed)

- `receipt_id`
- `job_hash`, `quote_hash`
- `model_ref` (model passport CID + revision)
- `offer_ref` (offer passport CID)
- `runtime_hash` (container digest)
- `node_id` (worker identity)
- `outputs_hash`, `output_ref`
- `timestamps` (start/end)
- `receipt_signature`
- `receipt_hash` = hash(canonical_json)

✅ **Rule:** all hashes use **canonical JSON** (stable field ordering) + blake3/sha256 (choose one and never change).

---

# 4) Lucid Worker (GPU Node) — TODO

## 4.1 Worker responsibilities

- Provide API:
    - `POST /quote`
    - `POST /jobs`
    - `GET /jobs/{id}`
    - `GET /health`
    - `GET /metrics` (Prometheus)
- Manage model cache:
    - HF pull by `repo + revision`
    - disk cache directory (`/models`)
- Execute inference:
    - run vLLM/TGI server locally
    - ensure model is available (pull if missing)
- Prewarm (optional):
    - load a small list on boot (or “warm on first request”)
- Sign quotes + receipts:
    - ed25519 key loaded from env/secret
- Emit receipt:
    - push receipt JSON to receipt-service (or write to queue)

## 4.2 Worker API — behavior details

### `POST /quote`

Input:

- `offer_id`, `model_id`, `constraints` (max_cost, max_latency)
    
    Output:
    
- OfferQuote + signature

Checks:

- model fits VRAM
- runtime compatible
- region/policy allowed
- compute availability (simple heuristic v0)

### `POST /jobs`

Input:

- JobRequest (includes quote)
    
    Flow:
    
- verify quote signature + expiry
- compute job_hash
- enqueue job
- return `job_id`

### `GET /jobs/{id}`

Return:

- status + result when done

---

# 5) Model management & caching — TODO

## 5.1 HF pull-by-revision

- Use `huggingface_hub` with:
    - pinned `revision`
    - local cache dir
- Store a local “manifest” file per model:
    - repo, revision, download timestamp
    - resolved file list + sizes
    - optional file hashes later

## 5.2 Cache policy

- LRU eviction by disk size threshold
- Separate:
    - `weights_cache/`
    - `tokenizer_cache/`
    - `compiled_cache/` (if any)

## 5.3 Prewarm

- Config: `PREWARM_MODELS=modelA@rev,modelB@rev`
- Strategy v0:
    - pre-download + optionally keep 1 loaded in vLLM if memory allows

---

# 6) Execution runtime — TODO

Pick v0 runtime:

- **vLLM** for most open models
- **TGI** optional if you need it

Plan:

- Worker runs alongside runtime:
    - either same container (simpler)
    - or two containers (cleaner)

Standardize request shape:

- OpenAI-compatible subset (recommended)
    - makes clients easy
    - avoids custom formats

---

# 7) Receipt Service (MMR + Solana commit) — TODO

## 7.1 Receipt ingestion

- Endpoint: `POST /receipts`
- Validations:
    - verify receipt signature
    - verify referenced quote hash exists + was signed
    - basic sanity checks (timestamps, ids)

## 7.2 MMR append

- Maintain:
    - per-epoch MMR (e.g. 60s or 5 min epochs)
    - store leaves: `receipt_hash`
- Expose:
    - `GET /proof/{receipt_hash}` → inclusion proof + epoch root id

## 7.3 Commit epoch root to Solana

- Every epoch:
    - compute `epoch_root`
    - write Solana tx to `EpochRootPDA`
    - store tx signature

On-chain minimal fields:

- `epoch_id`, `epoch_root`, `leaf_count`, `timestamp`, `mmr_size`

---

# 8) Solana program — TODO (minimal)

## 8.1 Contracts / PDAs

- `PassportAnchorPDA` (optional v0, can be phase 2)
- `EpochRootPDA` (required v0)
    - store latest epoch metadata

## 8.2 Instructions

- `commit_epoch_root(epoch_id, root, leaf_count, metadata_hash)`
    - only callable by authorized signer (Lucid operator key v0)

---

# 9) LucidScan / Indexer — TODO (MVP)

## 9.1 Indexer

- Watch Solana program for `commit_epoch_root`
- Store:
    - epoch roots
    - tx signatures
    - timestamps

## 9.2 Verification endpoint

- `POST /verify`
    
    Input:
    
- `receipt_json`
    
    Output:
    
- verify signature
- verify inclusion proof in epoch root
- return a simple “VERIFIED ✅” bundle

---

# 10) Router (minimal v0) — TODO

Keep it simple:

- route based on:
    - available nodes
    - cost or latency preference
- do not implement RL or validators in v0

API:

- `POST /route`
    
    Input:
    
- model passport + constraints
    
    Output:
    
- chosen offer + worker endpoint

---

# 11) Observability / Reliability — TODO (must-have)

- Structured logs (json)
- Tracing (OpenTelemetry)
- Prometheus metrics:
    - request latency
    - queue depth
    - HF download time
    - cache hit/miss
    - job success rate
- Health checks:
    - GPU visible
    - runtime alive
    - disk space threshold

---

# 12) Security & keys — TODO

- Worker signing key:
    - ed25519
    - loaded from secret
- Rotate keys:
    - support `key_id`
- Prevent replay:
    - quote expiry
    - job_id uniqueness
- Rate limits:
    - per API key
- Output store:
    - signed URLs
    - TTL

---

# 13) Deployment — TODO

## 13.1 Worker deployment

- Docker image for worker+runtime
- Env vars:
    - `REGION`, `GPU_TYPE`, `VRAM_GB`
    - `OPERATOR_KEY`
    - `MODEL_CACHE_PATH`
    - `RUNTIME=vllm`
    - `PREWARM_MODELS=...`
- Provide “one command” bootstrap for Aethir boxes

## 13.2 Receipt service deployment

- Standard cloud (fast) is fine for v0
- Persist MMR state (postgres + object store)

---

# 14) Test plan — TODO (non-negotiable)

## Unit tests

- canonical JSON hashing stability
- signature verification
- quote expiry
- MMR append + inclusion proof

## Integration tests

- spin worker locally with small model
- run quote → job → receipt → mmr → solana commit
- verify end-to-end proof

## Load tests

- cold start model pull
- warm cache latency
- concurrency scaling on single GPU

---

# 15) “Build with AI” workflow (so dev executes fast)

Give your dev these rules:

1. **Start with schemas + hashing first** (prevents rewrites)
2. Generate code with AI **per module**:
    - “implement OfferQuote schema + canonical hashing + tests”
    - “implement worker /quote endpoint”
3. Every AI-generated module must include:
    - tests
    - logging
    - typed errors
4. No feature merges without:
    - e2e test passing
    - deterministic hash snapshots

---

# 16) v0 Scope lock (to avoid overbuilding)

✅ Do in v0:

- one offer
- 5–10 models
- quotes signed by Lucid
- receipts + MMR + Solana root
- caching + optional prewarm

❌ Not in v0:

- slashing
- decentralized validators
- ZK proofs
- dynamic marketplace pricing across many providers
- on-chain passport anchors for everything

---

## V1 Architecture (permissionless providers run the Worker)

### High-level flow

```
Agent / App (Lucid SDK + MCP)
  |
  | 1) resolve passports (agent/model/compute offer) + policies
  v
Passport Resolver (Indexers + deterministic resolution rules)
  |   - reads Solana PassportAnchors (CID/digest, status, owner)
  |   - optional EVM ERC-8004 view for agents
  |   - fetches manifests from IPFS/Filecoin/S3 gateway
  |
  | 2) select venue (compute offer + model) under policy
  v
Cognition Router (deterministic scoring)
  |
  | 3) request quote (short-lived, signed by provider)
  v
Provider Quote Endpoint (Lucid Worker)
  |
  | 4) submit job (job_hash + quote + model_ref + inputs_ref)
  v
Provider Execution Node (Lucid Worker + Runtime Adapter)
  |   - Runtime: vLLM or TGI
  |   - Pull model by pinned revision/digest
  |   - Local disk cache + optional prewarm
  |
  | 5) write outputs (S3/IPFS/Filecoin) + compute outputs_hash
  v
Receipt Service (part of Worker, or sidecar)
  |
  | 6) build receipt (job_hash, model_digests, offer_id, quote_hash, outputs_hash, timings, attestations)
  | 7) append leaf -> MMR (off-chain)
  v
Solana (Epoch Root Commit PDA)
  |
  | 8) Indexer (LucidScan) reads roots + receipts -> serves proofs
  v
Auditors / Enterprises / Validators (recompute routing + verify signature + verify inclusion proof)

```

### What changed vs v0 (the important deltas)

- **Provider runs the Worker** (not Lucid).
- **Provider signs quotes** with their own key in their ComputeProviderPassport.
- **Worker is “runtime-adaptive”**: supports **vLLM + TGI** behind the same API.
- **Storage is pluggable**: outputs & manifests can live on **S3, IPFS, Filecoin-backed IPFS**, etc.
- Lucid becomes: **spec + SDK/MCP + router + indexers + conformance tests + optional fallback fleet**.

---

## V1 Components (what exists, who owns it)

### 1) Provider-side (must exist for permissionless network)

- **Lucid Worker** (Node)
    - `POST /quote`
    - `POST /jobs`
    - `GET /jobs/:id`
    - `GET /health`
- **Runtime Adapter** (vLLM or TGI)
    - normalized “run inference” interface
- **Local Cache**
    - HF artifacts cached on disk (per node)
    - optional prewarm list (top N models)
- **Receipt Builder**
    - deterministic `job_hash`, `quote_hash`
    - `outputs_hash` + output URI
    - signs receipt with provider key

### 2) Network-side (Lucid-maintained, but non-canonical options allowed)

- **Passport Anchors on Solana**
    - minimal PDA state: `{cid_hash, owner, status}`
- **MMR / Epoch Roots**
    - off-chain MMR accumulation + on-chain epoch root commits
- **Resolver + Indexers (LucidScan)**
    - fetch manifests, verify digests, unify IDs, serve proofs
- **Router (optional service)**
    - deterministic selection under policy profiles
    - can be run by anyone (open spec)

---

## V1: Complete TODO for your dev team (Node + AI + Web3)

This is the “build it” checklist in execution order.

### A) Specs first (blockers if missing)

1. **Passport manifest schemas (JSON)**
    - `AgentPassport`
    - `ModelPassport` (HF repo + pinned revision + artifact digests + runtime requirements + license/policy)
    - `ComputeProviderPassport` (signing keys + endpoints + policies)
    - `ComputeOfferPassport` (SKU constraints: gpu/vram/region/runtime/attestation/SLA tier)
2. **Canonical hashing rules**
    - `job_hash = hash(canonical_job_request_json)`
    - `quote_hash = hash(canonical_quote_json)`
    - `outputs_hash = hash(output_bytes OR output_json_canonical)`
3. **Signature rules**
    - quote must be signed by provider key declared in ProviderPassport
    - receipt must be signed by provider execution key
4. **Storage URI conventions**
    - `ipfs://CID`
    - `https://gateway/...` allowed but must map to CID/digest
    - `s3://bucket/key` or pre-signed HTTPS (with hash binding)

### B) Provider Worker (Node) — the core v1 deliverable

1. **Worker API**
    - `POST /quote`
        
        inputs: `offer_id`, `model_ref`, `policy`, `max_tokens`, `constraints`
        
        output: `price`, `expiry`, `terms_hash`, `queue_hint`, `provider_sig`
        
    - `POST /jobs`
        
        inputs: `job_hash`, `quote`, `model_ref`, `inputs_ref`, `params`
        
        output: `job_id`
        
    - `GET /jobs/:id`
        
        output: status + `outputs_ref` + `outputs_hash` + receipt draft
        
2. **Runtime adapter interface**
    - `RuntimeAdapter.loadModel(modelPassport) -> handle`
    - `RuntimeAdapter.generate(handle, prompt, params) -> output`
    - Implement **vLLM adapter** and **TGI adapter**
3. **Model acquisition**
    - pull from HF by **pinned revision**
    - verify digests when provided (or at least store the resolved commit hash)
    - store in **local disk cache**
4. **Caching + prewarm**
    - configurable cache directory
    - optional prewarm list (load models at boot or keep hot)
5. **Output storage module**
    - output writer to:
        - S3 (default, fast)
        - IPFS (pin) / Filecoin-backed pinning provider (optional)
    - always return: `{outputs_ref, outputs_hash}`
6. **Receipt builder + signer**
    - include:
        - `job_hash`, `quote_hash`
        - `agent_passport`, `model_passport`, `compute_offer_passport`
        - `runtime` (vLLM/TGI), resolved model revision
        - timing metrics: `start_ts`, `end_ts`, `ttft`, `tokens/sec`, `p95`
        - `outputs_hash`, `outputs_ref`
    - sign receipt with provider key
7. **Operational hardening**
    - rate limiting, auth (optional), request size limits
    - idempotency on `job_hash`
    - structured logs + tracing

### C) Solana programs (minimal)

1. **PassportAnchor PDA**
    - create/update/revoke
    - store `{cid_hash, owner, status, updated_at}`
2. **EpochRoot PDA**
    - commit epoch root of receipts MMR
    - include `epoch_id`, `root_hash`, `count`
3. **(Optional) ExecutionReceipt PDA in v1**
    - only if you want per-run on-chain receipts (most teams don’t; MMR root is enough for MVP)

### D) Indexer + Resolver (LucidScan-grade)

1. **Manifest fetch + verify**
    - fetch manifest from IPFS/Filecoin/S3 gateway
    - verify digest matches PassportAnchor
2. **Identity merge rules**
    - same CID/digest = same passport identity across chains
3. **Receipt verification**
    - verify provider signature
    - verify inclusion proof against epoch root
4. **Serve “resolve()” API**
    - `resolve(passport_id)` => endpoints + status + latest offers + keys
5. **Serve proofs**
    - `getReceiptProof(receipt_id)` => receipt + MMR proof + epoch root tx

### E) Router (v1 version)

1. **Deterministic scoring**
    - policy profiles: cost/latency/trust weights
    - candidate filtering: region/runtime/license/attestation
2. **Quote fanout**
    - request quotes from top K offers
    - choose best valid quote deterministically
3. **Audit package**
    - store `policy_hash`, candidate set hash, winning score inputs
    - makes recomputation possible

### F) DevEx (this is what makes v1 scale)

1. **Docker images**
    - `lucid-worker` (Node)
    - `runtime-vllm` and `runtime-tgi` (or integrated)
2. **Helm chart / Compose**
    - one-command deploy for providers
3. **Conformance tests**
    - “quote signature valid”
    - “job_hash canonicalization matches”
    - “receipt includes mandatory fields”
    - “runtime adapters behave the same”
4. **Provider onboarding kit**
    - env vars: GPU info, region, pricing rules, storage backend, signing keys
    - quickstart + troubleshooting

---

## V1 “one-liner” you can tell the dev partner (clarity)

**“In v1, Lucid is a standard + router + proof/indexing layer. Providers run the same Node Worker (vLLM/TGI) on their GPUs, sign quotes and receipts, store outputs on S3/IPFS/Filecoin, and we anchor receipt roots on Solana for auditability.”**