# LucidLayer MVP — Gap Analysis & Roadmap (SDK + MCP + Passports + Execution + Receipts)

**Audience**: core engineering team (Solana + backend + AI)

**Goal of this document**
1) Compare the **LucidLayer Cahier des charges (CdC)** vs the **current codebase**.
2) List **gaps/incoherences** with *root cause* and *minimal MVP fix*.
3) Propose an MVP architecture that is **clear, scalable, and low-latency**.
4) Provide an **actionable roadmap** (what to change where) without overloading the repo.

---

## 0) Executive summary (what you already have)

Your repo already contains strong primitives that match the CdC philosophy “chain ≠ hot path”:

### ✅ On-chain
- `programs/lucid-passports`: generic **Passport PDA registry** (owner/type/slug/version + content_cid/hash + metadata_cid + license/policy flags + attestations)
- `programs/thought-epoch`: on-chain commitment of **32-byte roots**
- `programs/gas-utils`: on-chain **collect_and_split** primitive for revenue distribution (CPI-ready)

### ✅ Off-chain (TS API)
- `/passports/*`: passport register/get/search endpoints
- HuggingFace sync: `HFBridgeService` pulls models/datasets from **llm-proxy** and registers passports
- MMR system: per-agent MMR + append + proof generation + root commitment on chain (good foundation for receipt batching)
- Agent orchestration (FlowSpec + n8n + planner/executor router) exists; not part of LucidLayer CdC but useful.

### ✅ Off-chain (Python)
- `llm-proxy`: already provides **unified discovery/search + invocation** across providers.

### ⚠️ MCP
- Current “MCP” is a **placeholder tool catalog + registry** (nginx `/info.json` + simulated execution). It is not a real MCP server exposing Lucid capabilities.

---

## 1) CdC requirement-by-requirement mapping

Legend:
- ✅ implemented
- 🟡 partial / adjacent primitive exists
- ❌ missing

| CdC capability | Status | Current code reference | Notes |
|---|---:|---|---|
| Mint Passport (Model/Dataset/Tool/Agent) | ✅ | `programs/lucid-passports`, `offchain/src/services/passportService.ts`, `/passports/register` | Works for generic passports; rich schemas are off-chain only (metadata_cid).
| Mint Passport (Compute) | ❌ | `AssetType` enum lacks Compute | Minimal on-chain change needed.
| Registry + Search | 🟡 | `/passports/search` (memcmp scans) + `llm-proxy /search` | On-chain search won’t scale; use off-chain indexer.
| Matching Model↔Compute | ❌ | none | Needs deterministic match service.
| Unified execution (OpenAI-ish) | 🟡 | `llm-proxy` invocation + Lucid-L2 multi-LLM | Not passport-aware today.
| Run receipt JSON | ❌ | none | MMR exists but for “vector epochs”, not run receipts.
| Proof anchoring | 🟡 | `thought-epoch` + MMR commit | Good base for anchoring receipt roots.
| Automatic payments | 🟡 | `gas-utils` exists | Needs wiring to “run” and recipients derived from passports.
| MCP server exposing Lucid tools | ❌ | placeholders only | Needs real MCP server (Node).

---

## 2) Gaps / incoherences (with reasons + minimal fix)

### Gap A — Passport schema mismatch (CdC vs on-chain)

**CdC expectation**: PassportMeta + ModelMeta/ComputeMeta include runtime/format/hardware/policy/economics/pointers/proofs.

**Code today**: `lucid-passports` stores only:
- `owner`, `asset_type`, `slug`, `version`
- `content_cid`, `content_hash`, `metadata_cid`
- `license_code`, `policy_flags`, `status`, timestamps

**Why it matters**
- Deterministic matching requires structured data (runtime/format/VRAM/regions). Without it, matching cannot be reliable.
- Putting all metadata on-chain would bloat accounts and break “chain not hot path”.

**Minimal MVP fix (recommended)**
- Keep chain as **identity/pointers/proofs/payout rails**.
- Treat `metadata_cid` as **URI** to canonical JSON that follows versioned schemas (ModelPassport/ComputePassport/etc.).
- (Optional but strongly recommended) Add **`metadata_hash: [u8;32]`** to Passport account to make metadata tamper-evident.
  - alternative: reuse `content_hash` for metadata; but semantically it’s “content manifest hash”, not “metadata hash”.

**Result**: rich metadata is off-chain portable + verifiable; chain remains light.

---

### Gap B — Compute passports missing (hard blocker for matching)

**CdC**: Compute Passport is required (provider type, regions/residency, runtimes, hw, endpoint).

**Code**: `AssetType` has `Model/Dataset/Tool/Agent/Voice/Other` but not `Compute`.

**Minimal MVP fix**
1) Add `Compute` to on-chain `AssetType`.
2) Add `Compute = <new index>` to TS enum in `passportService.ts`.
3) Create `computeMeta` JSON schema stored at `metadata_cid`.

---

### Gap C — Search strategy incoherence (on-chain scans won’t scale)

**Current**: `/passports/search` uses Anchor `account.all` + memcmp.

**Problem**
- On-chain scanning is expensive, slow, and will not scale to “asset discovery”.

**Minimal MVP fix**
- Keep on-chain as registry of “ground truth ownership/pointers”.
- Add an off-chain **Passport Indexer/Search** (can start as:
  - “read chain + cache in Postgres”, or
  - “lazy fetch by id + in-memory list”, or
  - “use llm-proxy search for HF assets and only map to passports”).

---

### Gap D — Matching service absent

**CdC**: deterministic matching Model↔Compute with policy constraints + explain.

**Minimal MVP fix**
- Add `matchService` (off-chain) implementing:
  - hard filters (runtime/format, vram/context, policy region/residency/attestation)
  - scoring (cost under p95 budget, tie-break latency)
- Add endpoints:
  - `POST /v1/match`
  - `POST /v1/match/explain`

---

### Gap E — “Receipt” in CdC ≠ current MMR usage

**Current**: MMR proves inclusion of “vector hash in epoch root”.

**CdC**: RunReceipt JSON includes:
- model_passport_id, compute_passport_id, policy_hash
- metrics (ttft, tokens, p95)
- attestation / image hash / model hash
- anchor info

**Minimal MVP fix** (reuse your MMR)
- Define `RunReceipt` canonical JSON.
- Leaf = `sha256(canonical_json(receipt))`.
- Append leaf to an MMR (per project or per compute node; pick one deterministic partition).
- Commit MMR root via existing `thought-epoch` (or a dedicated receipts program later).
- Store receipt JSON off-chain (S3/IPFS/Arweave) and keep pointer in API.

---

### Gap F — Payments not wired to passports

**Current**: you have `gas-utils` program as a distribution primitive, but not wired to “run inference”.

**Minimal MVP fix**
- During `run` orchestration:
  - derive recipients from `passport.owner` (model + compute)
  - optionally add platform fee PDA
  - call gas-utils `collect_and_split`
- Keep pricing simple initially (price_per_call or price_per_1k tokens stored in metadata JSON).

---

### Gap G — MCP server for Lucid (missing)

**Current**: placeholders in `agent-services/mcp-tools` + `MCPToolRegistry` (simulated execution).

**Minimal MVP fix**
- Build an actual **Lucid MCP server** that exposes the CdC tools:
  - `lucid_search_models`, `lucid_search_compute`
  - `lucid_get_passport`, `lucid_create_passport`
  - `lucid_match`, `lucid_run_inference`
  - `lucid_get_receipt`, `lucid_verify_receipt`
- The MCP server should call **Lucid-L2 offchain API** (not chain directly).

---

## 3) Recommended MVP architecture (aligned with your repo)

### Principle
**Chain is a cold layer**: identity/pointers/anchoring/payments.
**Off-chain is intelligence**: matching, routing, policy, receipts, execution, UX.

### Proposed split (minimal refactor)

1) `llm-proxy/` stays the **execution + discovery** gateway for Web2 providers.
2) `Lucid-L2/offchain` becomes the **LucidLayer Control Plane**:
   - passports orchestration
   - matching service
   - run/router endpoint (calls llm-proxy or compute endpoints)
   - receipts service (MMR + anchor)
   - payout orchestration via gas-utils
3) Add a new package for MCP server (either inside Lucid-L2 or separate top-level):
   - `packages/mcp-server-lucid` (recommended) or `Lucid-L2/mcp-server`

---

## 4) Minimal on-chain changes (MVP)

### 4.1 lucid-passports
1) Add `Compute` to `AssetType`.
2) Optional but recommended:
   - add `metadata_hash: [u8;32]` to `Passport` account
   - update register/update instructions accordingly

### 4.2 receipts anchoring
For MVP, you can reuse `thought-epoch` root commit for receipt roots.

Later (v2): create a dedicated `receipts` program that stores `(project_id, epoch_id, root, count, policy_hash)`.

---

## 5) Minimal off-chain changes (MVP)

### 5.1 Schemas (source of truth)
Create versioned JSON schemas:
- `PassportMeta` (common)
- `ModelPassport`
- `ComputePassport`
- `RunReceipt`
- `Policy`

Use canonical JSON for hashing.

### 5.2 Matching service
Add module `matchService`:
- Input: `model_passport_id`, `policy`
- Fetch model metadata from `metadata_cid` (or future S3)
- List compute passports (cached)
- Deterministic filters + scoring
- Output: `MatchResult` + `explain`

### 5.3 Run/router endpoint
Add `/v1/route` (or `/v1/run/inference`):
- Parse `model: passport:<id>`
- match compute
- call execution gateway (llm-proxy or compute inference_url)
- stream results
- create run_id + trace_id
- async enqueue receipt build

### 5.4 Receipt service
Implement:
- `POST /v1/receipts` (store receipt JSON)
- `GET /v1/receipts/:run_id`
- `GET /v1/receipts/:run_id/proof` (inclusion proof)
- `POST /v1/receipts/commit-root` (batch anchor)

Reuse MMR primitives already in repo.

---

## 6) MCP server (Lucid)

The Lucid MCP server should be a thin adapter:
- Accept tool calls
- Validate inputs
- Call Lucid-L2 offchain endpoints
- Return strict JSON outputs

Do **not** implement chain logic inside MCP server.

---

## 7) Repo structure recommendation (minimal disruption)

You already have a mono-repo. The lowest-friction approach:

```
Lucid/
  Lucid-L2/
    offchain/                 # Control plane API (TS)
    programs/                 # Solana programs
    docs/
      LUCIDLAYER_MVP_GAP_ANALYSIS_AND_ROADMAP.md
  llm-proxy/                  # Execution + discovery (Python)
  packages/
    lucid-sdk-js/             # new (thin client)
    lucid-sdk-py/             # new
    lucid-mcp-server/         # new
    lucid-schemas/            # new (json schemas + validators)
```

This matches your CdC without fighting the existing code.

---

## 8) Roadmap (phased, MVP-first)

### Phase 0 — Decide the canonical data model (1 day)
- Confirm: **metadata lives off-chain**, chain stores pointer + hash.
- Decide: “Compute passports are on-chain identities” (owner + pointer).

### Phase 1 — Passports foundation (1–2 days)
- Add `Compute` asset type to program + TS.
- Add JSON schemas + canonicalization util.
- Ensure HF bridge stores metadata that can evolve towards ModelPassport.

### Phase 2 — Matching (2–3 days)
- Implement `matchService` + endpoints `/v1/match`, `/v1/match/explain`.
- Create sample compute passports (static JSON) to validate matching matrix.

### Phase 3 — Unified run (2–4 days)
- Implement `/v1/route` OpenAI-ish facade.
- Integrate llm-proxy as execution backend.
- Collect metrics (ttft/tokens) and return trace_id.

### Phase 4 — Receipts (2–4 days)
- Implement RunReceipt canonical JSON
- Implement receipt store + hash + MMR leaf
- Batch commit root to chain async
- Provide `/v1/receipts/:run_id/proof`

### Phase 5 — Payments wiring (2–4 days)
- Use gas-utils on run completion (or prepay)
- Split based on passport.owner(s)

### Phase 6 — MCP server (1–2 days)
- Implement Lucid MCP server tools
- Provide “hello world” examples

---

## 9) Test matrix (MVP)

1) Passports
- schema validation
- canonical JSON hash stable across languages
- register/get/search

2) Matching
- runtime/format matrix
- vram/context
- region/residency

3) Run
- streaming on/off
- trace_id present
- timeout handling

4) Receipts
- receipt signature verify
- inclusion proof verify
- anchored root lookup

5) MCP
- tool calls return strict JSON
- error cases deterministic

---

## 10) Key decisions to confirm (for engineering alignment)

1) **Metadata location**: do we accept that ModelMeta/ComputeMeta live off-chain via `metadata_cid` (recommended)?
2) **Execution backend**: llm-proxy is the MVP “TrustGate/Fluid” (recommended) vs duplicating a router in Lucid-L2?
3) **Receipts anchoring**: reuse thought-epoch for MVP roots vs create receipts program now?

---

## 11) Concrete MVP deliverables (what we will actually ship)

### 11.1 LucidLayer Control Plane API (inside `Lucid-L2/offchain`)

#### Passports
- `POST /v1/passports` (wrapper around Solana register + content service)
- `GET /v1/passports/{passport_id}`
- `PATCH /v1/passports/{passport_id}`
- `GET /v1/passports?type=model&tag=...` (off-chain indexer-backed)

#### Matching
- `POST /v1/match`
- `POST /v1/match/explain`

#### Run (OpenAI-ish facade)
- `POST /v1/route` (or `POST /v1/responses.create` style)
  - accepts `model: "passport:<id>"`
  - supports `stream: true|false`
  - returns `run_id`, `trace_id`, and streaming output

#### Receipts
- `POST /v1/receipts` (store JSON + hash)
- `GET /v1/receipts/{run_id}`
- `GET /v1/receipts/{run_id}/proof`

### 11.2 SDKs
- **JS/TS SDK**: `packages/lucid-sdk-js`
  - modules: `passport`, `search`, `match`, `run`, `receipt`
- **Python SDK**: `packages/lucid-sdk-py`
  - same surface

### 11.3 MCP server (real)
- `packages/lucid-mcp-server`
  - tools:
    - `lucid_search_models`
    - `lucid_search_compute`
    - `lucid_get_passport`
    - `lucid_create_passport`
    - `lucid_match`
    - `lucid_run_inference`
    - `lucid_get_receipt`
    - `lucid_verify_receipt`

### 11.4 Schemas
- `packages/lucid-schemas`
  - JSON schemas + validators
  - canonical JSON rules (JS + Python)

---

## 12) Competition / market sanity-check (to avoid traps)

This is not a “magic compatibility layer”. The strong positioning is:
- **Standards-first passports** (small set of runtimes/formats)
- **Deterministic matching** (auditable)
- **Receipts and payouts off hot-path**

Common failure modes in competing stacks:
1) They shove metadata + logic on-chain → slow + expensive.
2) They promise universal model portability → breaks in practice.
3) They ship a marketplace before routing/observability/receipts.

Your current approach is compatible with the winning pattern, but you need to ship:
- Compute passports
- Match
- Run receipts
- Real MCP server


---

## Appendix A — What NOT to do in MVP (avoid overload)

- On-chain full registry with searchable metadata (expensive + slow).
- Promise universal runtime compatibility.
- Build a marketplace/pricing engine.
- ZK proofs.
- Build 500 connectors.
