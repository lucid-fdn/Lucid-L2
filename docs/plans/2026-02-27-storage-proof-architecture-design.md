# Lucid Storage & Proof Architecture

**Date:** 2026-02-27
**Status:** Design (pending implementation)

---

## 0. Architectural Philosophy

Lucid operates on a **policy-driven storage engine**.

We do not design around vendors (Arweave, Lighthouse, S3). We design around data policies:

| Dimension | Values |
|-----------|--------|
| **Durability** | ephemeral → short → long → permanent |
| **Mutability** | immutable → versioned → mutable → append-only |
| **Verifiability** | anchored on-chain or not |
| **Latency** | hot (sub-ms) → warm (seconds) → cold (minutes) |

Storage providers are implementation details behind a common interface (`IDepinStorage`).

---

## 1. Two-Product Model

Lucid-L2 is a monorepo with two packages: **Engine** (truth library) and **Gateway Lite** (basic serving). lucid-plateform-core is the proprietary **Gateway Pro/Enterprise**.

This follows industry standard (Grafana, Elastic, Supabase, HashiCorp): **OSS engine + OSS basic gateway + proprietary managed gateway**.

### Lucid Core — Engine (Truth Library)

**Package:** `Lucid-L2/packages/engine`. Pure decentralized infrastructure. No HTTP server — just a library + background workers.

Guarantees:
- Verifiable execution records (PoER)
- Chain-anchored epoch roots
- Portable passport identities
- Neutral long-term availability
- Independent audit capability

Backends:

| Backend | Purpose |
|---------|---------|
| Solana PDA | Passport skeleton, epoch root anchors, payment gates |
| Arweave (via Irys) | Permanent metadata, epoch proof bundles, dispute evidence |
| Lighthouse | Mutable state snapshots (passport state, memory checkpoints) |
| SQLite WAL | Local durability (receipts, MMR peaks, epochs) |

### Lucid Core — Gateway Lite (OSS Basic Serving)

**Package:** `Lucid-L2/packages/gateway-lite`. Thin Express server wrapping Engine. Basic inference routing, compute matching, passport API. No auth, no billing, no multi-tenant, no caching. ~15 files.

This is what indie devs run: `cd Lucid-L2 && npm start` — one process, full end-to-end inference + receipts.

### Lucid Gateway Pro/Enterprise (Proprietary)

**Repo:** lucid-plateform-core. Replaces Gateway Lite in production. Full multi-tenant gateway with enterprise features.

| Tier | What it adds | Backends |
|------|-------------|----------|
| **Pro** | Advanced routing, metering, multi-tenant, auth, rate limiting, streaming | In-memory / SQLite |
| **Enterprise** | Hot caching, horizontal scaling, compliance, SLA, KMS, audit logs | Postgres, Redis, S3/R2, pgvector, CDN |

**Enterprise = Gateway tier, not a separate product.** The `cloud/` directory in lucid-plateform-core holds Stripe billing, Nango OAuth, and all future enterprise features.

### Graceful Degradation

Gateway Pro/Enterprise is **optional**. Core (Engine + Gateway Lite) runs fully on its own:

| Component | Required? | What happens without it |
|-----------|-----------|------------------------|
| **Engine** (SQLite + Solana + Arweave) | **Yes** | Nothing works without it — this IS the system |
| **Gateway Lite** (basic inference + routing) | **Yes** (for end-to-end) | Engine alone = library only, no HTTP API |
| **Gateway Pro/Enterprise** (multi-tenant, caching) | **No** | Indie devs use Gateway Lite instead |

If Redis goes down in Enterprise, requests resolve from Engine (SQLite → Arweave). Slower, but functional. The proprietary Gateway is a **performance overlay**, not a dependency.

This means:
- **Indie / startup**: Engine + Gateway Lite (OSS) — one server, full end-to-end
- **Scale**: Engine + Gateway Pro — adds multi-tenant, auth, metering
- **Enterprise**: Engine + Gateway Enterprise — same guarantees, 10x faster reads, compliance

Gateway Pro never *replaces* Engine. It replaces Gateway Lite and adds a fast lane in front of Engine.

---

## 2. Storage Policy Engine

All objects pass through a `StoragePolicyResolver` that selects backends based on data policy:

```typescript
interface StoragePolicy {
  durability: 'ephemeral' | 'short' | 'long' | 'permanent';
  mutability: 'immutable' | 'versioned' | 'mutable' | 'append-only';
  verifiability: boolean;   // must be chain-anchored?
  latency: 'hot' | 'cold';
}
```

Resolution rules:

| Policy Combination | Backend(s) |
|-------------------|------------|
| permanent + immutable | Arweave |
| versioned + mutable | Lighthouse |
| hot + low latency | SQLite (Core) or Postgres + Redis (Enterprise) |
| append-only + verifiable | WAL → MMR → Epoch Anchor → Arweave |
| ephemeral | In-memory only (heartbeats, routing cache) |

This abstraction makes storage vendors swappable without changing business logic.

---

## 3. Receipts (PoER — Proof of Execution Record)

### What Receipts Prove

- Execution occurred
- Runtime hash matches declared runtime
- Inputs/outputs are hashable and referenced
- Worker signature is valid against passport
- Receipt is included in an epoch root

**Receipts do NOT prove inference correctness.** This is Proof of Execution Record, not zkML.

### Receipt Schema (Hardened)

Extends the existing `SignedReceipt` and `ExtendedReceiptBody` — new fields marked with `// NEW`.

```typescript
interface HardenedReceipt {
  // === Existing fields (DO NOT REMOVE) ===
  schema_version: '1.0';
  run_id: string;                           // primary identifier
  timestamp: number;
  trace_id?: string;
  policy_hash: string;
  model_passport_id: string;
  compute_passport_id: string;              // = executor passport
  runtime: string;
  image_hash?: string;
  model_hash?: string;
  attestation?: object;
  metrics: {
    ttft_ms: number;
    p95_ms?: number;
    tokens_in: number;
    tokens_out: number;
  };

  // Signature envelope (existing)
  receipt_hash: string;
  receipt_signature: string;
  signer_pubkey: string;
  signer_type: 'orchestrator' | 'compute';

  // Anchoring info (existing)
  anchor?: {
    chain?: 'solana';
    tx?: string;
    root?: string;
    epoch_id?: string;
  };
  _mmr_leaf_index?: number;

  // Fluid Compute v0 fields (existing)
  job_hash?: string;
  quote_hash?: string;
  node_id?: string;
  runtime_hash?: string | null;
  gpu_fingerprint?: string | null;
  capacity_bucket?: string;
  endpoint_id?: string;
  billing?: ReceiptBilling;
  outputs_hash?: string;
  output_ref?: string;
  input_ref?: string;
  execution_mode?: ExecutionMode;
  start_ts?: number;
  end_ts?: number;
  error_code?: string;
  error_message?: string;

  // Phase 3 zkML (existing, optional)
  zkml_proof?: {
    proof: string;
    public_inputs: string[];
    model_circuit_hash: string;
    verified_onchain?: boolean;
    verification_tx?: string;
  };

  // === NEW fields for PoER ===
  agent_id?: string;                        // NEW — agent that triggered execution
  commitment_level: 0 | 1 | 2 | 3;         // NEW — L0=WAL, L1=MMR, L2=Solana, L3=Arweave
  challenge_status: 'none' | 'open' | 'challenged' | 'resolved';  // NEW
  memory_snapshot_hash?: string;            // NEW — optional audit linkage for MemoryMap
  arweave_cid?: string;                     // NEW — set when archived to Arweave
}
```

### Commitment Tiers

```
L0: SQLite WAL     — instant local durability (~0ms)
L1: MMR append     — cryptographic inclusion proof (~1ms)
L2: Solana anchor  — on-chain epoch root (~2s)
L3: Arweave        — permanent archival (~30s)
```

Every receipt progresses through all 4 tiers automatically.

### Implementation Interfaces

```typescript
/** WAL-first durability — every receipt durable from creation */
interface ProofWAL {
  append(receipt: SignedReceipt): Promise<number>;            // returns WAL position
  replay(fromPosition: number): AsyncIterable<SignedReceipt>; // crash recovery
  checkpoint(): Promise<void>;                                // flush to main DB
}

/** Append-only MMR — O(log N) append and proof, no full rebuild */
interface StreamingMMR {
  // Peaks are persisted, not recomputed
  appendLeaf(hash: Buffer): { position: number; peaks: Buffer[] };

  // Inclusion proof without scanning all leaves
  getInclusionProof(position: number): {
    leaf: Buffer;
    siblings: Buffer[];
    peakIndex: number;
    root: Buffer;
  };

  // Bag peaks for epoch root — O(log N) not O(N)
  bagPeaks(): Buffer;
}

/** Tiered commitment — each tier runs independently */
interface CommitmentPipeline {
  tiers: [WALTier, MMRTier, SolanaTier, DePINTier];

  // Receipts flow through automatically
  // If L2 is slow (Solana congestion), L0-L1 keep accepting
  // If L3 fails (Arweave down), retry queue with exponential backoff
  getCommitmentLevel(receiptId: string): CommitmentLevel;
}

/** DePIN retry queue — never lose a proof */
interface DePINQueue {
  // Enqueue upload job — persisted to SQLite immediately
  enqueue(job: { type: 'receipt' | 'epoch' | 'passport_state'; payload: Buffer; priority: number }): void;

  // Worker processes queue with exponential backoff
  // Max retries: 10, then dead-letter with alert
  pending(): number;
  failed(): number;
  deadLettered(): UploadJob[];
}
```

### Receipt Lifecycle

**Step 1 — Instant Durability (L0)**
Write receipt to SQLite WAL. Sub-millisecond. No network dependency. Survives process crash.

**Step 2 — MMR Append (L1)**
Append receipt hash to streaming MMR. The current MMR algorithm is already incremental (O(log N) per append with sibling merging) — the issue is that nodes live in an in-memory Map and are lost on crash. Fix: persist peaks and node map to SQLite.

**Step 3 — Epoch Finalization (L2)**
Every 100 receipts OR 1 hour:
- Compute epoch root from MMR peaks
- Anchor on-chain via `commit_epoch_v2(epoch_id, root, leaf_count, timestamp, mmr_size)`
- Update epoch status: open → anchoring → anchored

**Step 4 — Permanent Archival (L3)**
Upload epoch bundle to Arweave:
- All receipts in batch (JSONL)
- MMR inclusion material
- Epoch metadata
- Root hash

Enterprise hot mirror: optional S3 copy for fast retrieval.

### Uses Epoch Batching? **YES**

Receipts are append-only, high-volume events. Epoch batching reduces gas costs and enables scalable anchoring while maintaining verifiability.

### Challenge Reasons

```typescript
enum ChallengeReason {
  INVALID_SIGNATURE,      // wrong key, mismatch to passport
  POLICY_VIOLATION,       // disallowed model, region, runtime
  ARTIFACT_UNAVAILABLE,   // promised output_ref but can't produce
  HASH_MISMATCH,          // receipt hash doesn't match content
  RUNTIME_MISMATCH,       // declared runtime doesn't match actual
  MALFORMED_RECEIPT       // bad canonicalization, nonsense timestamps
}
```

---

## 4. Passport System

Passports represent: Models, Agents, Compute Providers, Tools, Datasets.

### 4.1 Passport Identity (Static)

**Storage policy:** permanent + immutable + verifiable

| Location | Data |
|----------|------|
| **Solana PDA** | owner, asset_type, slug, version, content_cid, content_hash, metadata_cid, license_code, policy_flags, status |
| **Arweave** | Full identity JSON (schema_version, format, runtime, modality, context_length, license, framework, protocol — everything that defines WHAT this asset IS) |

Identity is written once on creation. The `metadata_cid` on the PDA points to the Arweave JSON. Updating identity = new Arweave upload + PDA `metadata_cid` update.

```typescript
interface PassportIdentity {
  passport_id: string;
  type: PassportType;
  schema_version: string;
  format: string;
  created_at: string;
  creator_pubkey: string;
  identity_cid: string;    // Arweave CID — immutable
}
```

### 4.2 Passport State (Dynamic)

**Storage policy:** versioned + mutable + warm latency

| Location | Data |
|----------|------|
| **SQLite / Postgres** | Live source of truth — pricing, endpoints, trust_score, total_inferences, heartbeat status |
| **Lighthouse** | Periodic state snapshots (versioned CIDs) — anyone can fetch latest state |
| **On-chain (optional)** | State hash anchor for auditability |

State changes flow: API write → SQLite/Postgres → periodic Lighthouse snapshot → optional on-chain hash.

```typescript
interface PassportState {
  passport_id: string;
  version: number;         // monotonically increasing
  pricing: PricingConfig;
  endpoints: EndpointConfig;
  trust_score: number;
  total_inferences: number;
  last_heartbeat: string;
  state_cid: string;       // Lighthouse CID — mutable
}

// Solana PDA stores: { identity_cid, state_cid, state_version }
// One Arweave upload (forever) + Lighthouse updates (cheap, fast)
```

### API Response

```
GET /v1/passports/:id

{
  // Identity (from PDA + Arweave)
  "passport_id": "...",
  "type": "model",
  "identity_cid": "ar://...",       // Arweave

  // Live state (from SQLite/Postgres)
  "pricing": { ... },
  "endpoints": { ... },
  "trust_score": 87,

  // Snapshot pointer
  "state_snapshot_cid": "ipfs://...", // Lighthouse
  "state_version": 14
}
```

### Uses Epoch Batching? **NO**

Passports are not append-only event streams. They are mutable identity + state records.

---

## 5. MemoryMap (Portable Agent Memory)

Agent memory must be: fast (inference-time reads), portable (move between providers), encrypted (user data), and optionally auditable.

### 5.1 Hot Memory Lane

**Storage policy:** ephemeral/short + mutable + hot latency

Used during inference. Per-agent, per-session.

| Tier | Core | Enterprise |
|------|------|-----------|
| **Short-term** | In-memory (conversation context) | Redis (shared across instances) |
| **Long-term** | SQLite (key-value per agent) | Postgres + pgvector (semantic search) |
| **Artifacts** | Local filesystem | S3/R2 (hot object store) |

### 5.2 Portable Snapshot Lane

**Storage policy:** versioned + mutable + cold latency

When agent state needs to be portable or backed up:

1. Serialize agent memory state
2. Encrypt with agent-specific key
3. Upload to Lighthouse → get snapshot CID
4. Store CID pointer in passport state

When agent migrates to new provider:
1. Fetch snapshot CID from passport
2. Download from Lighthouse
3. Decrypt and rebuild local index

### 5.3 Audit Checkpoint Lane

**Storage policy:** permanent + immutable + verifiable

Optional. For agents that need auditable memory trails (gaming tournaments, compliance):

1. Hash memory snapshot
2. Include hash in a receipt (`memory_snapshot_hash` field)
3. Receipt flows through normal epoch batching
4. Memory hash is now anchored on-chain via epoch root

### Uses Epoch Batching? **OPTIONAL**

Memory itself is user state, not a proof log. However, memory snapshot hashes CAN be embedded in receipts for audit linkage. When audit is required, the hash flows through epoch batching like any other receipt.

---

## 6. Control Plane

The control plane is the routing brain. It answers: **"Which worker, model, runtime, cost, region, and health status right now?"**

### Responsibilities

| Function | What it does |
|----------|-------------|
| **Worker Registry** | Track active compute nodes, capabilities, regions |
| **Heartbeat** | 30s TTL health monitoring, status: healthy/degraded/down |
| **Routing** | Score and select best endpoint for each request (runtime compat, hardware, cost, latency, region) |
| **Policy Enforcement** | Tenant quotas, plan limits, region allowlists, model access |
| **Capacity** | GPU type inventory per region, queue depth, p95 latency |
| **Usage Metering** | Count requests, tokens, compute-seconds per tenant |
| **Dispute Registry** | Track challenges, outcomes, trust score updates |
| **Storage Policy Resolution** | Select backends based on data policy |

### Data Model

**Core (SQLite):**

```sql
-- Compute endpoints (replaces in-memory ComputeRegistry)
CREATE TABLE compute_endpoints (
  endpoint_id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL,
  provider TEXT,
  region TEXT,
  gpu_type TEXT,
  runtime TEXT,
  url TEXT,
  operator_pubkey TEXT,
  status TEXT DEFAULT 'unknown',
  last_heartbeat INTEGER,
  queue_depth INTEGER DEFAULT 0,
  p95_ms INTEGER,
  error_rate REAL DEFAULT 0
);

-- Challenges (dispute registry)
CREATE TABLE challenges (
  challenge_id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  outcome TEXT,
  challenger TEXT,
  opened_at INTEGER,
  resolved_at INTEGER,
  notes_cid TEXT,
  trust_delta INTEGER DEFAULT 0
);
```

**Core tables (full schema):**

```sql
-- Receipts (replaces in-memory Map — matches HardenedReceipt)
CREATE TABLE receipts (
  run_id TEXT PRIMARY KEY,            -- matches existing run_id identifier
  agent_id TEXT,
  model_passport_id TEXT,
  compute_passport_id TEXT,
  epoch_id TEXT,
  mmr_position INTEGER,
  commitment_level INTEGER DEFAULT 0, -- 0=WAL, 1=MMR, 2=Solana, 3=DePIN
  challenge_status TEXT DEFAULT 'none',
  -- Signature envelope (indexed for /verify queries)
  receipt_hash TEXT NOT NULL,
  receipt_signature TEXT NOT NULL,
  signer_pubkey TEXT NOT NULL,
  signer_type TEXT NOT NULL,
  -- DePIN
  arweave_cid TEXT,
  created_at INTEGER NOT NULL,
  payload BLOB NOT NULL               -- full receipt JSON/CBOR
);

-- Passports (replaces JSON file)
CREATE TABLE passports (
  passport_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  owner TEXT NOT NULL,
  name TEXT,
  identity JSONB NOT NULL,      -- static metadata (format, runtime, modality, etc.)
  state JSONB NOT NULL,         -- dynamic metadata (pricing, endpoints, trust)
  identity_cid TEXT,            -- Arweave CID
  state_cid TEXT,               -- Lighthouse CID
  state_version INTEGER DEFAULT 1,
  nft_mint TEXT,
  share_token_mint TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

-- Epochs (replaces in-memory Map — matches existing Epoch interface)
CREATE TABLE epochs (
  epoch_id TEXT PRIMARY KEY,
  epoch_index INTEGER NOT NULL,
  project_id TEXT,
  status TEXT DEFAULT 'open',   -- open → anchoring → anchored → failed
  leaf_count INTEGER DEFAULT 0,
  mmr_root BLOB,
  start_leaf_index INTEGER NOT NULL,
  end_leaf_index INTEGER,
  receipt_run_ids TEXT,          -- JSON array of run_ids
  solana_tx TEXT,
  arweave_cid TEXT,
  error TEXT,
  opened_at INTEGER,
  finalized_at INTEGER
);

-- MMR peaks (replaces in-memory array)
CREATE TABLE mmr_peaks (
  agent_id TEXT NOT NULL,
  peak_index INTEGER NOT NULL,
  peak_hash BLOB NOT NULL,
  leaf_count INTEGER NOT NULL,
  PRIMARY KEY (agent_id, peak_index)
);

-- Full-text search on receipt metadata
CREATE VIRTUAL TABLE receipts_fts USING fts5(
  agent_id, model_passport_id, compute_passport_id, content='receipts'
);

-- DePIN upload queue (retry with backoff)
CREATE TABLE depin_queue (
  job_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- 'receipt' | 'epoch' | 'passport_state'
  payload BLOB NOT NULL,
  priority INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 10,
  status TEXT DEFAULT 'pending', -- pending → processing → done → dead_letter
  last_error TEXT,
  created_at INTEGER,
  next_retry_at INTEGER
);

-- Agent memory (MemoryMap hot lane)
CREATE TABLE agent_memory (
  agent_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value BLOB NOT NULL,
  encrypted INTEGER DEFAULT 0,
  updated_at INTEGER,
  PRIMARY KEY (agent_id, key)
);

-- Indexes
CREATE INDEX idx_receipts_agent ON receipts(agent_id, created_at);
CREATE INDEX idx_receipts_epoch ON receipts(epoch_id);
CREATE INDEX idx_receipts_commitment ON receipts(commitment_level);
CREATE INDEX idx_receipts_hash ON receipts(receipt_hash);
CREATE INDEX idx_receipts_signer ON receipts(signer_pubkey);
CREATE INDEX idx_passports_type ON passports(type);
CREATE INDEX idx_passports_owner ON passports(owner);
CREATE INDEX idx_epochs_status ON epochs(status);
CREATE INDEX idx_depin_queue_status ON depin_queue(status, next_retry_at);
CREATE INDEX idx_agent_memory_agent ON agent_memory(agent_id);
```

**Enterprise additions:** Postgres replaces SQLite, Redis for cache, dedicated metrics tables.

### Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /v1/compute/nodes/heartbeat` | Worker health check-in |
| `POST /v1/match` | Policy-based compute matching |
| `GET /v1/models?available=true` | Available model catalog |
| `GET /v1/receipts/:id/verify` | Full PoER verification |
| `POST /v1/challenges` | Submit a dispute |
| `GET /v1/challenges/:id` | Check dispute status |

---

## 7. Dispute System (PoER Challenge Model)

Receipts are **optimistic** — accepted by default, challengeable within a window.

### Lifecycle

1. **Receipt issued** → enters MMR → eventually anchored on-chain
2. **Challenge window opens** (configurable per policy: 1-72 hours)
3. **Challenger submits** — receipt_id, reason_code (no bond in v0)
4. **Executor may respond** with evidence bundle
5. **Arbiter resolves** — valid (receipt stands) or invalid (trust score hit)

### Evidence Bundle (what executor produces when challenged)

- Receipt payload (canonical JSON)
- MMR inclusion proof (siblings + peaks + position)
- Anchor proof (epoch root + chain tx + block)
- Artifact references (output CID, optional encrypted input CID)
- Runtime attestation (runtime_hash + image digest)

### `/verify` Endpoint (the product)

```
GET /v1/receipts/:id/verify

Response:
{
  "receipt": { ... },
  "signature_valid": true,
  "signer_pubkey": "...",
  "passport_link": "...",
  "inclusion_proof": {
    "mmr_position": 47,
    "siblings": ["0x...", "0x..."],
    "peaks": ["0x...", "0x..."],
    "computed_root": "0x..."
  },
  "anchor": {
    "epoch_id": "epoch_042",
    "chain_tx": "5vGk...",
    "block": 284751,
    "anchored_root": "0x..."
  },
  "availability": {
    "output_ref_accessible": true,
    "arweave_cid": "ar://..."
  },
  "challenge": {
    "status": "none",
    "window_remaining_seconds": 3420
  }
}
```

This is what chain partners integrate. Not a dashboard. Not an explorer. A single URL that proves execution.

### Configurable Challenge Windows

Attached to execution policy:

| Use Case | Window |
|----------|--------|
| Gaming tournaments | 1-4 hours |
| Agent trading | 6 hours |
| General infrastructure | 24 hours |
| Compliance mode | 72 hours |

### On-Chain Primitives (Minimal)

```
anchorEpoch(epoch_id, root, leaf_count, metadata_cid)
challengeReceipt(receipt_id, reason_code, metadata_cid)
resolveChallenge(challenge_id, outcome, penalty, new_trust_score, notes_cid)
```

Arbiter is centralized in v0 (Lucid + partner multisig). Decentralize later with staking + bonds.

### Relationship to Existing Dispute System

The codebase already has EVM-focused dispute routes (`/v2/disputes/*`) in `disputeRoutes.ts` for escrow-based disputes (open, evidence, resolve, appeal). These are cross-chain payment disputes.

The PoER challenge system (this section) is **separate** — it handles receipt validity disputes (signature, policy, artifacts). The two systems will share:
- Evidence format (MMR proofs, receipt hashes)
- Resolution patterns (arbiter review)
- Trust score impact

Long-term: unify into a single dispute framework.

### On-Chain Payment Gates

The `lucid_passports` Solana program includes payment gating (`set_payment_gate`, `pay_for_access`, `withdraw_revenue`, `revoke_access`). When a receipt is challenged, the dispute system should check:
- Was access paid for? (valid `AccessReceipt` PDA exists)
- Does the payment gate pricing match the receipt's billing data?
- Was revenue withdrawn before dispute resolution? (relevant for penalty enforcement)

---

## 8. Proof Explorer (Deferred — Build After `/verify`)

Ship `/verify` endpoint first. When chain partners request visualization, build the Explorer.

### API (future)

```
// REST — queryable proof history
GET  /v1/proofs?agent=X&model=Y&epoch=47&status=anchored
GET  /v1/proofs/:receipt_id/verify
GET  /v1/epochs/:id/tree              // MMR visualization data

// WebSocket — real-time proof stream
WS   /v1/proofs/stream?agent=X        // subscribe to live proof events
```

### UX Concept

```
┌─────────────────────────────────────────────────────────┐
│  Lucid Proof Explorer                          🔍 Search │
├─────────────────────────────────────────────────────────┤
│  Epoch #47          Root: 0x3a7f...    ⚓ Solana  📦 AR  │
│  ├─ Receipt abc123  Agent: code-agent  Model: gpt-4o    │
│  │   L0 ✅  L1 ✅  L2 ✅  L3 ✅    Proof: [Verify]    │
│  ├─ Receipt def456  Agent: research    Model: claude     │
│  │   L0 ✅  L1 ✅  L2 ✅  L3 ⏳    Proof: [Verify]    │
│  └─ Receipt ghi789  Agent: trading     Model: gpt-4o    │
│      L0 ✅  L1 ✅  L2 ⏳  L3 —     Proof: [Pending]   │
│                                                          │
│  Live Stream ──────────────────────── 47 receipts/min   │
│  ████████████████████░░░░  Epoch 48: 73/100 receipts    │
└─────────────────────────────────────────────────────────┘
```

This is the "Etherscan moment for AI" — when users can SEE proofs progressing through commitment levels in real-time. No competitor offers this. **Build it when a partner asks for it.**

---

## 9. Backend Summary (What Goes Where)

| Object | Hot Storage | Snapshot | Permanent | On-chain | Epoch Batched |
|--------|------------|----------|-----------|----------|---------------|
| **Receipts** | SQLite WAL | — | Arweave | Root only | YES |
| **Passport Identity** | — | — | Arweave | Skeleton PDA | NO |
| **Passport State** | SQLite / Postgres | Lighthouse | Optional | Optional hash | NO |
| **MemoryMap** | SQLite / Vector+S3 | Lighthouse | Optional | Optional hash | OPTIONAL (audit) |
| **Epoch Roots** | SQLite | — | Arweave | PDA anchor | — (IS the batch) |
| **Disputes** | SQLite / Postgres | — | Arweave (evidence) | Outcome + trust | NO |

---

## 10. The Funnel (How Everything Connects)

```
User sends inference request
         │
         ▼
┌─────────────────┐
│  CONTROL PLANE   │  Route: which worker, model, runtime, region?
│  (heartbeat,     │  Policy: allowed by tenant plan?
│   routing,       │
│   policy)        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    PASSPORT      │  Identity: who ran what, under which policy
│  (model + agent  │  State: current pricing, endpoints, trust
│   + compute)     │
└────────┬────────┘
         │ executor signs with passport key
         ▼
┌─────────────────┐
│    RECEIPT       │  Single execution record (PoER)
│  L0: SQLite WAL  │  Durable instantly
│  L1: MMR append  │  Cryptographic inclusion
└────────┬────────┘
         │ optionally includes memory_snapshot_hash
         ▼
┌─────────────────┐
│   MEMORYMAP      │  Agent state persisted
│  Hot: SQLite     │  Snapshot: Lighthouse
│  Audit: receipt  │  Checkpoint: Arweave (optional)
└────────┬────────┘
         │ batched (100 receipts or 1 hour)
         ▼
┌─────────────────┐
│     EPOCH        │  Batch commitment
│  L2: Solana      │  Anchor MMR root on-chain
│  L3: Arweave     │  Full receipt batch permanent
└────────┬────────┘
         │ trust score updated, CIDs stored
         ▼
┌─────────────────┐
│   PASSPORT       │  Loop: trust_score, total_inferences updated
│  (state update)  │  Lighthouse snapshot published
└─────────────────┘
```

---

## 11. Implementation Roadmap

### Phase 1: Durability Foundation (Week 1-2)

Replace in-memory stores with SQLite. Zero behavior change for API consumers.

- [ ] Add `better-sqlite3` dependency
- [ ] SQLite schema: receipts, passports, epochs, mmr_peaks, compute_endpoints, challenges
- [ ] Migrate PassportStore (JSON file → SQLite)
- [ ] Migrate receipt in-memory Map → SQLite
- [ ] Migrate epoch in-memory Map → SQLite
- [ ] Migrate ComputeRegistry in-memory Map → SQLite
- [ ] Litestream config for SQLite backup to R2
- [ ] Create barrel exports: `truth.ts`, `control.ts`, `edge.ts`
- [ ] Implement `StoragePolicyResolver` (policy → backend selection)
- [ ] Implement Universal CID pattern (sha256 before upload, store both hashes)

### Phase 2: Streaming MMR + Receipt Hardening (Week 2-3)

- [ ] Harden SignedReceipt schema (add commitment_level, challenge_status, output_ref, runtime_hash, policy_hash)
- [ ] Implement append-only MMR with persisted peaks (O(log N))
- [ ] O(log N) inclusion proof generation
- [ ] DePIN retry queue (SQLite-backed, exponential backoff)
- [ ] Benchmark: 1M leaves append + proof

### Phase 3: Verify + Dispute (Week 3-4)

- [ ] `GET /v1/receipts/:id/verify` endpoint
- [ ] Challenges table + CRUD API
- [ ] Challenge window configuration per policy
- [ ] Arbiter resolution flow (admin API)
- [ ] Trust score delta on dispute outcome

### Phase 4: MemoryMap MVP (Week 4-5)

- [ ] Hot memory lane: SQLite key-value per agent
- [ ] Memory snapshot serialization + encryption
- [ ] Lighthouse upload for portable snapshots
- [ ] Snapshot CID pointer in passport state
- [ ] Optional: memory_snapshot_hash in receipts for audit
- [ ] PMW (Proof of Memory Write): hash-linked commit chain
- [ ] Signed Delta Chain: base_pack + daily deltas instead of full snapshots
- [ ] Multi-Lane Fetch: parallel read from cache + edge + DePIN, first wins

### Phase 5: Passport Identity/State Split (Week 5-6)

- [ ] Split passport metadata into identity (static) + state (dynamic)
- [ ] Arweave for identity (write-once)
- [ ] Lighthouse for state snapshots (periodic publish job)
- [ ] Update PDA to store both identity_cid and state_cid
- [ ] AgentCard manifest generation from passport + state
- [ ] DePIN observability: `GET /v1/health/depin` endpoint

### Phase 6: Enterprise Acceleration (When Needed)

All enterprise features go in `lucid-plateform-core/cloud/` — Gateway enterprise tier, not a separate product.

- [ ] `cloud/acceleration/postgres.ts` — Postgres read cache for passport state, receipt search, analytics
- [ ] `cloud/acceleration/redis.ts` — Redis cache for routing decisions, heartbeat, rate limits
- [ ] `cloud/acceleration/r2.ts` — S3/R2 hot store for receipt payloads, memory artifacts
- [ ] `cloud/acceleration/vector.ts` — pgvector adapter for memory semantic search
- [ ] Enterprise tenant isolation (Gateway routes enterprise tenants through acceleration backends)
- [ ] Core package split: @lucid/truth-engine, @lucid/control-local, @lucid/shared
- [ ] Passport cache service in Gateway (hot reads without hitting Core)

---

## 12. Feature Flags & Kill-Switches

Every new subsystem ships behind a flag. Default = OFF. System runs on current stable path (in-memory + simple batch + mock storage) until a flag is explicitly enabled.

### 12.1 Flag Registry (Single Source of Truth)

**File:** `offchain/src/config/featureFlags.ts` (Core) + mirrored in Gateway.

```typescript
export const flags = {
  // Phase 1 — Durability
  SQLITE_WAL:               process.env.FEAT_SQLITE_WAL === '1',
  MMR_PERSISTENCE:          process.env.FEAT_MMR_PERSISTENCE === '1',

  // Phase 2 — Pipeline
  COMMITMENT_PIPELINE:      process.env.FEAT_COMMITMENT_PIPELINE === '1',
  DEPIN_RETRY_QUEUE:        process.env.FEAT_DEPIN_RETRY_QUEUE === '1',

  // Phase 3 — Verify + Disputes
  VERIFY_V2:                process.env.FEAT_VERIFY_V2 === '1',
  CHALLENGES:               process.env.FEAT_CHALLENGES === '1',

  // Phase 4 — Memory
  MEMORYMAP:                process.env.FEAT_MEMORYMAP === '1',
  MEMORY_PMW:               process.env.FEAT_MEMORY_PMW === '1',
  MULTI_LANE_FETCH:         process.env.FEAT_MULTI_LANE_FETCH === '1',

  // Phase 5 — Storage providers
  LIGHTHOUSE_SNAPSHOTS:     process.env.FEAT_LIGHTHOUSE_SNAPSHOTS === '1',
  ARWEAVE_ARCHIVE:          process.env.FEAT_ARWEAVE_ARCHIVE === '1',

  // Phase 6 — Gateway enterprise tier
  ENTERPRISE_ACCELERATION:  process.env.FEAT_ENTERPRISE_ACCELERATION === '1',
} as const;
```

### 12.2 Critical Kill-Switches (Infrastructure)

| Flag | If OFF (safe default) | If ON | Fail-open rule |
|------|----------------------|-------|----------------|
| `FEAT_SQLITE_WAL` | Current in-memory receipt store | Write receipts to SQLite first | If SQLite throws, fallback to in-memory + log fatal metric. Never crash inference. |
| `FEAT_MMR_PERSISTENCE` | Current in-memory MMR | Persist peaks + nodes to SQLite | If persistence fails, continue in-memory, mark epoch as "non-persisted" in logs. |
| `FEAT_COMMITMENT_PIPELINE` | Current "epoch batch async" behavior | Run tier workers (L0→L1→L2→L3) | L2/L3 workers can fail without blocking ingestion. |
| `FEAT_DEPIN_RETRY_QUEUE` | Current fire-and-forget upload | Enqueue to SQLite queue, background worker uploads | If queue enqueue fails, drop to fire-and-forget. Never block inference. |

### 12.3 Product-Surface Flags (Safe to Ship Partially)

| Flag | If OFF | If ON | Fail-soft behavior |
|------|--------|-------|-------------------|
| `FEAT_VERIFY_V2` | Return current minimal verify response | Include commitment level, anchor info, availability, challenge status | If extra check fails (e.g., Arweave fetch), return partial verify + `availability: "unknown"`. |
| `FEAT_CHALLENGES` | Endpoints return `501 Not Enabled`, receipts show `challenge_status: "none"` | Enable `POST /challenges`, admin resolution flow | Fully isolated — does not touch hot execution path. |

### 12.4 MemoryMap Flags (Largest Blast Radius — Keep Isolated)

| Flag | If OFF | If ON | Dependency |
|------|--------|-------|-----------|
| `FEAT_MEMORYMAP` | Agents run stateless or with minimal existing memory | Enable write/read/rehydrate APIs | None |
| `FEAT_MEMORY_PMW` | Memory works, no commit-chain / audit hash | Write hash-linked commit chain + optional receipt linkage | Requires `MEMORYMAP` |
| `FEAT_MULTI_LANE_FETCH` | Single-lane fetch (stable) | Parallel fetch + verify hash + backfill caches | None (OFF by default until battle-tested) |

### 12.5 Storage Provider Flags

| Flag | If OFF | If ON |
|------|--------|-------|
| `FEAT_ARWEAVE_ARCHIVE` | Do not upload epoch bundles/receipts to Arweave (keep mock) | Upload and set `arweave_cid` |
| `FEAT_LIGHTHOUSE_SNAPSHOTS` | Passport state + memory snapshots remain local/DB only | Publish snapshot CIDs to Lighthouse |

### 12.6 Gateway Enterprise Flag

| Flag | If OFF | If ON | Fail-open |
|------|--------|-------|-----------|
| `FEAT_ENTERPRISE_ACCELERATION` | Gateway reads from Core directly (slower but correct) | Enable Redis/Postgres/R2/pgvector caches | Any cache miss or error must fallback to Core. |

### 12.7 Circuit Breakers (Runtime Emergency Switches)

Two runtime breakers for production incidents — no redeploy needed:

| Env Var | Effect |
|---------|--------|
| `WORKERS_ENABLED=0` | Stops all background workers instantly: anchoring worker, DePIN uploader, snapshot publisher, epoch finalizer. Ingestion continues, commitment stops. |
| `EXTERNAL_STORAGE_ENABLED=0` | Forces all DePIN operations to no-op. Queue stays populated but uploader doesn't run. Receipts stay at L0/L1 until re-enabled. |

These save you when a provider is flaky. Flip the var, workers stop, fix the issue, flip back.

### 12.8 Flag → Phase Mapping

```
Phase 1:  SQLITE_WAL, MMR_PERSISTENCE
Phase 2:  COMMITMENT_PIPELINE, DEPIN_RETRY_QUEUE
Phase 3:  VERIFY_V2, CHALLENGES
Phase 4:  MEMORYMAP, MEMORY_PMW, MULTI_LANE_FETCH
Phase 5:  LIGHTHOUSE_SNAPSHOTS, ARWEAVE_ARCHIVE
Phase 6:  ENTERPRISE_ACCELERATION
Always:   WORKERS_ENABLED, EXTERNAL_STORAGE_ENABLED (circuit breakers)
```

Each phase enables its flags in staging first, then production. If anything breaks, flip the flag OFF — system reverts to previous stable behavior instantly.

---

## 13. Competitive Advantage

### The Gap Nobody Fills

An integrated pipeline that generates proofs at inference time, streams them to permanent storage, makes them queryable, and presents them via a single verification URL — all while staying decentralized.

### Why This Is Ahead

| Dimension | Competition | Lucid |
|-----------|-------------|-------|
| **Durability** | In-memory or batch-to-chain | WAL-first, every receipt durable in <1ms |
| **Proof speed** | Minutes (zkML) or batched | Streaming, real-time commitment progression |
| **Verification** | Black box | Single `/verify` URL with full proof chain |
| **Storage cost** | All-to-Arweave (expensive) | Tiered: SQLite → Lighthouse → Arweave |
| **Crash safety** | Memory loss | SQLite WAL + Litestream backup |
| **UX** | "Trust us, it's verified" | Commitment level progression: L0→L1→L2→L3 |
| **Scalability** | ~100K ceiling | SQLite handles ~100M, Postgres beyond |
| **Enterprise** | Either web2 or web3 | Hybrid: decentralized core + web2 acceleration |
| **Accountability** | No dispute mechanism | Configurable challenge windows + arbiter resolution |
| **Portability** | Vendor lock-in | Policy-driven storage, vendors swappable |

### Competitor Landscape

| Project | Approach | Lucid Advantage |
|---------|----------|-----------------|
| **Ritual** | Multi-proof (TEE + ZK + optimistic) | Heavy infra, no UX layer. Lucid: simpler PoER + `/verify` URL |
| **Gensyn** | Verde optimistic proofs, Merkle clock | Training-only, no inference proofs. Lucid: inference-native |
| **Modulus** | zkML circuit compilation | Minutes per proof. Lucid: streaming, sub-second |
| **ORA** | opML (optimistic ML on EVM) | EVM-bound, high gas. Lucid: Solana-native, multi-chain ready |
| **Sahara** | Knowledge Capsules + ZK | Data provenance only. Lucid: full execution records |
| **Vana** | DataDAO + proof-of-contribution | Data contribution only. Lucid: compute + routing + proofs |

### What This Unlocks For Chain Partners

- Verifiable AI tournaments (anti-cheat)
- Agent reputation systems (trust scores on-chain)
- Auditable autonomous NPC actions (gaming)
- AI agent leaderboards (competitive)
- Transparent agent economies (DeFi agents)
- Slashable malicious operators (future, with staking)
- Compliance audit trails (enterprise)

---

## 14. Positioning

Lucid provides:

- **Verifiable execution records** (PoER) — not zkML, honest about what we prove
- **Policy-driven storage** — vendors are swappable, policies are permanent
- **Portable identity** — passports work across chains and providers
- **Portable memory** — agents carry their memory when they migrate
- **Neutral compute coordination** — control plane routes without bias
- **Enterprise-grade acceleration** — web2 speed without losing web3 guarantees

**We are:**
- Decentralized by default
- Enterprise-ready by design
- Not vendor-bound
- Not purely web2
- Not purely web3
- **Hybrid by architecture**

---

## 15. Codebase Organization (Three-Layer Architecture)

### Layer Model

```
┌─────────────────────────────────────────────────────────────────┐
│  EDGE / PERFORMANCE   (hot, <50ms, stateless)                   │
│  Gateway Lite: basic inference, matching, routes                │
│  Gateway Pro: TrustGate, MCPGate, CDN, rate limit, auth, SSE   │
├─────────────────────────────────────────────────────────────────┤
│  CONTROL PLANE        (warm, <500ms, stateful coordination)     │
│  Gateway Lite: basic compute registry, policy engine            │
│  Gateway Pro: multi-tenant, metering, billing, advanced routing │
├─────────────────────────────────────────────────────────────────┤
│  TRUTH LAYER          (cold, seconds-minutes, immutable)        │
│  Engine only: receipt signing, MMR, epoch anchoring, DePIN,     │
│  Solana PDAs, Arweave, Lighthouse, SQLite WAL, passport CRUD   │
└─────────────────────────────────────────────────────────────────┘
```

### Layer → Package Mapping

| Layer | Lucid-L2 `packages/engine/` | Lucid-L2 `packages/gateway-lite/` | lucid-plateform-core |
|-------|---------------------------|----------------------------------|---------------------|
| **Truth** | All truth logic lives here | — | — |
| **Control** | — | Basic compute registry, policy, matching | `apps/control-plane/`, `packages/gateway-core/`, `packages/metering/` |
| **Edge** | — | Basic inference, routes, LLM providers | `apps/trustgate-api/`, `apps/mcpgate-api/`, `modules/`, `infra/` |
| **Enterprise** | — | — | `cloud/billing/`, `cloud/acceleration/`, `cloud/mcpgate-cloud/` |

Clean rule: **Engine = truth only. Gateway Lite = basic edge + control. Gateway Pro = full edge + control + enterprise.**

### What Moves Where (from current `offchain/src/`)

**Into `packages/engine/` (truth):**
- `services/receipt/` → `engine/receipt/` (signing, epoch, MMR, anchor)
- `packages/engine/src/storage/depin/` → `engine/storage/` (DePIN providers)
- `packages/engine/src/passport/passportManager.ts`, `passportStore.ts`, `passportSyncService.ts` → `engine/passport/`
- `packages/engine/src/crypto/mmr.ts`, `signing.ts`, `hash.ts`, `canonicalJson.ts`, `schemaValidator.ts` → `engine/crypto/`
- `solana/`, `blockchain/` → `engine/chains/` (thin adapter layer; feature-specific chain code in `identity/`, `passport/`)
- `blockchain/evm/erc6551/` → `engine/identity/tba/` (ERC-6551 TBA client)
- `blockchain/evm/erc8004/` → `engine/identity/registries/` (ERC-8004 Identity/Validation/Reputation)
- `blockchain/solana/SolanaPassportClient` → `engine/passport/nft/` (Token-2022 NFT minting)
- `nft/`, `shares/` → `engine/assets/`
- `services/finance/payoutService.ts`, `paymentGateService.ts` → `engine/finance/`
- `jobs/` → `engine/jobs/`
- `config/featureFlags.ts` → `engine/config/`

**Into `packages/gateway-lite/` (basic edge + control):**
- `services/inference/` → `gateway-lite/inference/`
- `services/compute/` → `gateway-lite/compute/`
- `services/agent/` → `gateway-lite/agent/`
- `routes/` → `gateway-lite/routes/`
- `providers/` → `gateway-lite/providers/`
- `middleware/` → `gateway-lite/middleware/`
- `services/passport/matchingEngine.ts`, `modelCatalog.ts` → `gateway-lite/matching/`

**Deleted from L2:**
- `sdk/` (already in separate repo `raijinlabs/lucid-ai-sdk`)

### Enterprise Scaling (Phase 6)

Within lucid-plateform-core (Gateway Pro), add enterprise acceleration backends:

```
lucid-plateform-core/
  apps/                   — TrustGate, MCPGate, Control-Plane (existing)
  packages/               — gateway-core, metering, passport (existing)
  cloud/                  — billing, OAuth, KMS, SLA, data residency (enterprise tier)
  cloud/acceleration/     — Redis adapter, Postgres adapter, R2 adapter (NEW)
```

Enterprise acceleration lives entirely in `cloud/`. Gateway Pro free tier never touches it.

---

## 16. Advanced Architecture Patterns

### 16.1 Universal CID (Content-Addressable Everything)

Every object gets a provider-agnostic content identifier before upload:

```typescript
interface UniversalCID {
  content_hash: string;           // sha256 of canonical content (computed locally)
  provider_id?: string;           // arweave txid, IPFS CID, etc. (set after upload)
  provider: string;               // 'arweave' | 'lighthouse' | 'local'
  size_bytes: number;
  created_at: number;
}

// Flow:
// 1. content_hash = sha256(canonicalize(object))   ← computed BEFORE upload
// 2. Upload to provider → get provider_id
// 3. Store both: content_hash (universal) + provider_id (vendor-specific)
// 4. Verification: re-hash content, compare to content_hash — works regardless of provider
```

This means switching from Arweave to IPFS (or any future provider) doesn't break any existing references. The `content_hash` is the permanent identifier; `provider_id` is an implementation detail.

All objects (receipts, passport identity, memory snapshots, epoch bundles) use this pattern.

### 16.2 Proof of Memory Write (PMW)

Hash-linked chain of agent memory updates. Each memory write references the previous commit:

```typescript
interface MemoryCommit {
  agent_id: string;
  commit_hash: string;            // sha256 of (prev_hash + delta_content)
  prev_commit_hash: string;       // creates a linked chain
  delta: Buffer;                  // encrypted memory delta
  timestamp: number;
  epoch_anchor?: string;          // when included in an epoch batch
}
```

This creates an auditable, tamper-evident chain of memory mutations. If an agent's memory is contested (e.g., in a gaming tournament), anyone can replay the chain from genesis and verify no mutation was skipped or altered.

PMW commits flow through the same epoch batching pipeline as receipts when audit mode is enabled.

### 16.3 Multi-Lane Fetch Race

Parallel fetch from all available storage tiers, first response wins:

```typescript
async function multiLaneFetch(contentHash: string): Promise<Buffer> {
  const sources = [
    () => localCache.get(contentHash),           // L0: SQLite/memory (~0ms)
    () => edgeCache.get(contentHash),             // Enterprise: Redis/R2 (~5ms)
    () => depinFetch(contentHash),                // L3: Arweave/Lighthouse (~500ms+)
  ].filter(Boolean);

  // Race all lanes — first valid response wins
  const result = await Promise.any(sources.map(fn => fn()));

  // Verify: re-hash and compare to content_hash
  const verified = sha256(result).equals(Buffer.from(contentHash, 'hex'));
  if (!verified) throw new IntegrityError(contentHash);

  // Backfill: populate faster lanes that missed
  backfillCache(contentHash, result);

  return result;
}
```

The key insight: DePIN is the **fallback of last resort**, not the primary read path. Hot reads come from local cache or edge. DePIN guarantees availability when everything else fails.

### 16.4 Signed Delta Chain (Memory Snapshots)

Instead of uploading full memory snapshots to DePIN, use a delta chain:

```
base_pack (full snapshot, Arweave, permanent)
  → delta_1 (daily diff, Lighthouse, versioned)
  → delta_2 (daily diff, Lighthouse, versioned)
  → delta_3 (daily diff, Lighthouse, versioned)
  → base_pack_v2 (weekly compaction, Arweave, permanent)
```

This reduces DePIN storage costs dramatically for agents with large memory states. Weekly compaction creates a new base pack; daily deltas are lightweight. An agent migrating to a new provider fetches base_pack + all deltas since last compaction.

### 16.5 AgentCard Manifest

Portable agent identity + capability declaration:

```json
{
  "agent_card_version": "1.0",
  "agent_passport_id": "agent_abc123",
  "display_name": "Research Agent",
  "capabilities": ["web_search", "code_execution", "memory"],
  "model_passport_id": "model_xyz",
  "memory_cid": "ar://...",
  "memory_commit_hash": "0x...",
  "endpoints": {
    "inference": "https://...",
    "memory": "https://...",
    "health": "https://..."
  },
  "trust_score": 87,
  "total_executions": 14230,
  "signature": "ed25519:...",
  "signed_by": "passport_owner_pubkey"
}
```

AgentCards are discoverable, verifiable, and portable. Any platform can import an AgentCard and route requests to its endpoints. Trust score and execution count are verifiable via the receipt chain.

### 16.6 DePIN Observability

Storage health monitoring alongside compute health:

```typescript
interface DePINHealthMetrics {
  provider: string;                // 'arweave' | 'lighthouse'
  upload_success_rate: number;     // last 100 uploads
  avg_upload_latency_ms: number;
  avg_retrieval_latency_ms: number;
  queue_depth: number;             // pending uploads
  dead_letter_count: number;       // failed after max retries
  last_successful_upload: number;  // timestamp
  last_health_check: number;
  status: 'healthy' | 'degraded' | 'down';
}
```

Exposed via `GET /v1/health/depin` alongside existing compute health endpoints. Control plane uses this to make storage routing decisions (e.g., if Arweave is degraded, increase retry intervals but don't fail receipts).

---

## 17. Product Structure (How Architecture Maps to Products)

### Three Tiers + Two Surfaces

```
┌────────────────────────────────────────────────────────────────┐
│  Lucid Studio          (User-facing surface)                    │
│  Create & deploy agents in 1 click. Monitor receipts, memory.  │
│  Repo: LucidMerged (Next.js 15) — CLOSED                       │
├────────────────────────────────────────────────────────────────┤
│  Lucid Agent SDK       (Developer surface)                     │
│  Portable agents: identity, memory, tools, budget, passports.  │
│  Repo: @lucid-ai/sdk — OSS (MIT)                               │
├────────────────────────────────────────────────────────────────┤
│  Lucid Gateway Pro     (Production gateway — proprietary)      │
│  Multi-tenant, auth, billing, 80+ MCP servers, enterprise.     │
│  Replaces Gateway Lite in production.                          │
│  Repo: lucid-plateform-core — CLOSED                            │
├────────────────────────────────────────────────────────────────┤
│  Lucid Core            (OSS monorepo — engine + gateway lite)  │
│  ┌──────────────────┬───────────────────────────────────────┐  │
│  │  packages/engine  │  packages/gateway-lite               │  │
│  │  Truth library    │  Basic inference + routing + API     │  │
│  │  (receipts, MMR,  │  (thin Express, ~15 files, no auth,  │  │
│  │   DePIN, Solana,  │   no billing, no multi-tenant)       │  │
│  │   passports)      │                                      │  │
│  └──────────────────┴───────────────────────────────────────┘  │
│  + programs/ (Solana) + schemas/ + openapi.yaml                │
│  Repo: Lucid-L2 — OSS (Apache-2.0)                             │
└────────────────────────────────────────────────────────────────┘
```

### Product → Audience

| Product | What it is | Who it's for | Repo | License |
|---------|-----------|--------------|------|---------|
| **Lucid Core (Engine)** | Truth library (receipts, MMR, epochs, DePIN, passports) | Everyone (OSS foundation) | Lucid-L2/packages/engine | Apache-2.0 |
| **Lucid Core (Gateway Lite)** | Basic inference + routing server | Indie devs, self-hosters | Lucid-L2/packages/gateway-lite | Apache-2.0 |
| **Lucid Gateway Pro** | Full multi-tenant gateway + enterprise | Production deployments | lucid-plateform-core | Proprietary |
| **Lucid Agent SDK** | Build portable, sovereign, verifiable agents | Agent builders | @lucid-ai/sdk | MIT |
| **Lucid Studio** | No-code agent creation, deploy, monitor | End users | LucidMerged | Proprietary |

### How It Maps to Repos

```
Lucid-L2 (OSS)                        lucid-plateform-core (Closed)
──────────────                         ──────────────────────────────
packages/engine/     Truth library     apps/trustgate-api/   LLM proxy (:4010)
  receipt/           Signing, MMR      apps/mcpgate-api/     Tool gateway (:4020)
  storage/           DePIN providers   apps/control-plane/   Admin API (:4030)
  passport/          CRUD, schemas     modules/trustgate/    Routing, guardrails
  crypto/            mmr, signing      modules/mcpgate/      80+ MCP servers
  chain/             Solana, EVM       packages/gateway-core/ Auth, rate limit, policy
  assets/            NFT, shares       packages/metering/    Usage tracking
  finance/           Payout, gates     packages/passport/    Shared with Core
  jobs/              Anchoring, airdrop
  config/            Feature flags     cloud/                Enterprise tier
                                         billing/            Stripe
packages/gateway-lite/ Basic serving     mcpgate-cloud/      Nango OAuth
  inference/         LLM execution       acceleration/       Redis, PG, R2 (Phase 6)
  compute/           Registry, policy
  matching/          Compute matching  infra/                Deployment
  routes/            HTTP API            cloudflare-worker/  CDN edge
  providers/         LLM adapters        litellm/            LLM routing
  middleware/        Basic auth           nginx-gateway/      Reverse proxy
  server.ts          Express entry

programs/            Solana on-chain
schemas/             JSON schemas
openapi.yaml         API spec
```

### SDK Design (Single Package, Modular Namespaces)

One package: `@lucid-ai/sdk`. No fragmentation. No `depin-sdk`, `receipt-sdk`, `compute-sdk`.

```typescript
import { lucid } from "@lucid-ai/sdk"

// Gateway
lucid.chat()                        // OpenAI-compatible inference
lucid.embeddings()                  // Embedding generation
lucid.verify(receiptId)             // Receipt verification

// Agent
lucid.agent.create()                // Create agent with passport
lucid.agent.run()                   // Execute agent task
lucid.agent.memory.write()          // Persist memory
lucid.agent.memory.rehydrate()      // Restore from DePIN snapshot

// Receipts
lucid.proofs.get(receiptId)         // Get full proof chain
lucid.proofs.stream(agentId)        // Subscribe to live proofs

// Compute (advanced)
lucid.compute.quote()               // Get execution quote
lucid.compute.execute()             // Direct compute execution
```

Internal infra (MMR, DePIN providers, storage adapters, epoch batching) is **NOT exposed** in the public SDK. Users see `lucid.chat()` and `lucid.verify()`, not `mmr.appendLeaf()`.

### Current Implementation Status

| Product | Repo | Status |
|---------|------|--------|
| Engine | Lucid-L2/packages/engine/ (79 files) | Built + extracted (receipts, MMR, epochs, DePIN, passports, anchoring, finance, identity, assets, chain adapters) |
| Gateway Lite | Lucid-L2/packages/gateway-lite/ (105 files) | Built + extracted (inference, compute, routes, middleware, providers, integrations, protocols) |
| Gateway Pro | lucid-plateform-core | Built (TrustGate :4010, MCPGate :4020, Control-Plane :4030) |
| Gateway Enterprise | lucid-plateform-core/cloud/ | Partial (Stripe billing + Nango OAuth built; acceleration is Phase 6) |
| Agent SDK | raijin-labs-lucid-ai | Partially built (chat + embeddings via Speakeasy; agent.* namespace not yet) |
| Studio | LucidMerged | Built (Next.js 15 UI, model selector, agent creation) |

---

## 18. Open Source / Closed Source Boundary

### The Rule

**Open source = what makes Lucid a standard** (trust + adoption).
**Closed source = what makes Lucid a business** (ops, multi-tenant, billing, enterprise).

### Repos

| Repo | Visibility | License | Contains |
|------|-----------|---------|----------|
| `raijinlabs/Lucid-L2` | **Public** | Apache-2.0 | Engine + Gateway Lite + Solana programs + schemas |
| `raijinlabs/lucid-plateform-core` | **Private** | Proprietary | Gateway Pro/Enterprise (TrustGate, MCPGate, Control-Plane, cloud/) |
| `raijinlabs/lucid-ai-sdk` | **Public** | MIT | SDK (`@lucid-ai/sdk`) |
| `raijinlabs/lucid-skills` | **Public** | MIT | 18 AgentSkills plugins |
| `raijinlabs/lucid-docs` | **Public** | MIT | Mintlify documentation |
| `daishizenSensei/LucidMerged` | **Private** | Proprietary | Studio UI (Next.js 15) |

### What Goes Open (Lucid-L2)

| Component | Package | Why OSS |
|-----------|---------|---------|
| Receipt spec + signing + verification | `packages/engine/receipt/` | Anyone can verify a receipt independently |
| MMR + epoch logic + `/verify` | `packages/engine/receipt/` | Proves the proof system is sound |
| Passport schemas + CRUD | `packages/engine/passport/` | On-chain identity should be auditable |
| Solana programs | `programs/` | On-chain code must be auditable |
| Storage interfaces + reference providers | `packages/engine/storage/` | Community can add new storage backends |
| NFT + share token providers | `packages/engine/assets/` | Chain-agnostic asset layer |
| Basic inference + routing | `packages/gateway-lite/` | Indie devs can run end-to-end |
| JSON schemas | `schemas/` | Standard that others build on |

**What NOT to OSS:** partner keys, infra secrets, `.env` files, any file in `cloud/`.

### What Stays Closed (lucid-plateform-core)

| Component | Why closed |
|-----------|-----------|
| Multi-tenant control plane (plans, quotas, auth, key management) | Business logic |
| Billing + metering pipelines (Stripe, invoicing) | Revenue |
| 80+ builtin MCP servers (some with partner contracts) | Competitive moat |
| Enterprise acceleration (`cloud/` — Redis, Postgres, R2, pgvector) | Premium tier value |
| Compliance features (audit logs, RBAC, data residency, KMS) | Enterprise selling point |
| SLA / routing intelligence (scoring, fallback tuning) | Competitive moat |
| Studio UI (LucidMerged) | Product surface |

### Dependency Rule

```
Gateway Pro imports from Engine (HTTP calls or npm package).
Engine never imports from Gateway Pro.
Dependency flows ONE WAY: Gateway → Engine.

packages/gateway-lite/ imports from packages/engine/ (direct).
packages/engine/ never imports from gateway-lite/.
```

### CI Guards

```yaml
# Lucid-L2/.github/workflows/oss-boundary.yml
# 1. Fails if any file imports from lucid-plateform-core
# 2. Fails if .env, credentials, or secret files are committed
# 3. Fails if packages/engine/ imports from packages/gateway-lite/

# lucid-plateform-core already has:
# scripts/check-oss-boundary.sh — validates cloud/ boundary
```

---

## 19. Code Organization (Full Directory Map)

### Repo A — Lucid-L2 (Core — OSS, Apache-2.0)

Engine (truth library) + Gateway Lite (basic serving). One `npm start` runs both.

```
Lucid-L2/
├── packages/
│   ├── engine/                         # ── TRUTH ENGINE (library, no HTTP) ──
│   │   ├── index.ts                    #   Public API barrel export
│   │   ├── config/
│   │   │   └── featureFlags.ts         #   Kill-switches (Section 12)
│   │   │
│   │   ├── receipt/                    #   RECEIPT PIPELINE
│   │   │   ├── receiptService.ts       #     Creation, signing (Ed25519 + JCS)
│   │   │   ├── epochService.ts         #     Epoch batching, finalization
│   │   │   ├── anchoringService.ts     #     Solana commit_epoch_v2
│   │   │   └── mmrService.ts           #     MMR append, inclusion proofs
│   │   │
│   │   ├── storage/                    #   STORAGE LAYER
│   │   │   ├── depin/                  #     DePIN providers
│   │   │   │   ├── IDepinStorage.ts    #       Interface (swappable)
│   │   │   │   ├── ArweaveStorage.ts   #       Arweave via Irys
│   │   │   │   ├── LighthouseStorage.ts#       Lighthouse (Filecoin+IPFS)
│   │   │   │   ├── MockStorage.ts      #       Dev/test (local SHA-256)
│   │   │   │   └── index.ts           #       Factory: getPermanentStorage/getEvolvingStorage
│   │   │   ├── passportStore.ts        #     Passport persistence (JSON → SQLite)
│   │   │   ├── identityStore.ts        #     Cross-chain identity store
│   │   │   └── searchQueryBuilder.ts   #     Query builder utility
│   │   │
│   │   ├── passport/                   #   PASSPORT CORE (CRUD + sync)
│   │   │   ├── passportManager.ts      #     CRUD, state machine, schema validation
│   │   │   ├── passportService.ts      #     Query helpers
│   │   │   └── passportSyncService.ts  #     DePIN upload + on-chain sync
│   │   │
│   │   ├── crypto/                     #   CRYPTOGRAPHIC UTILITIES
│   │   │   ├── mmr.ts                  #     MMR algorithm (→ SQLite persistence)
│   │   │   ├── signing.ts              #     Ed25519 sign/verify
│   │   │   ├── hash.ts                 #     SHA-256 hashing
│   │   │   ├── canonicalJson.ts        #     RFC 8785 JCS
│   │   │   ├── merkleTree.ts           #     Merkle tree (legacy)
│   │   │   └── schemaValidator.ts      #     AJV schema validation
│   │   │
│   │   ├── chains/                     #   THIN ADAPTER LAYER (feature-first)
│   │   │   ├── adapter-interface.ts    #     IBlockchainAdapter
│   │   │   ├── factory.ts             #     BlockchainAdapterFactory singleton
│   │   │   ├── configs.ts             #     CHAIN_CONFIGS (14 EVM + 2 Solana)
│   │   │   ├── types.ts               #     ChainConfig, ChainType, TxReceipt
│   │   │   ├── evm/adapter.ts         #     EVMAdapter (generic blockchain ops)
│   │   │   └── solana/                #     SolanaAdapter, client, gas, keypair
│   │   │
│   │   ├── assets/                     #   NFT + SHARE TOKEN PROVIDERS
│   │   │   ├── nft/                    #     INFTProvider → Token2022, Metaplex, EVM, Mock
│   │   │   └── shares/                #     ITokenLauncher → DirectMint, Genesis, Mock
│   │   │
│   │   ├── finance/                    #   FINANCIAL SERVICES
│   │   │   ├── payoutService.ts        #     Revenue split (basis points)
│   │   │   ├── paymentGateService.ts   #     On-chain payment gates
│   │   │   ├── escrowService.ts        #     Cross-chain escrow
│   │   │   └── disputeService.ts       #     EVM dispute resolution
│   │   │
│   │   ├── identity/                   #   CROSS-CHAIN IDENTITY (feature-first)
│   │   │   ├── tba/                    #     ERC-6551 TBA client + ABIs
│   │   │   ├── registries/             #     ERC-8004 Identity/Validation/Reputation + ABIs
│   │   │   ├── identityBridgeService.ts
│   │   │   ├── crossChainBridgeService.ts
│   │   │   ├── tbaService.ts           #     Token-Bound Accounts (uses tba/evm-registry-client)
│   │   │   ├── erc7579Service.ts       #     Smart account modules
│   │   │   ├── paymasterService.ts     #     ERC-4337 Paymaster
│   │   │   └── caip10.ts              #     CAIP-10 format helpers
│   │   │
│   │   └── jobs/                       #   BACKGROUND JOBS
│   │       ├── anchoringJob.ts         #     Epoch → Solana anchoring
│   │       ├── receiptConsumer.ts      #     Receipt queue consumer
│   │       └── revenueAirdrop.ts       #     Token holder airdrops
│   │
│   └── gateway-lite/                   # ── GATEWAY LITE (thin Express server) ──
│       ├── index.ts                    #   Express entry point (npm start)
│       ├── server.ts                   #   Server bootstrap + route mounting
│       │
│       ├── inference/                  #   INFERENCE SERVING (hot path)
│       │   ├── executionGateway.ts     #     Request → receipt pipeline
│       │   ├── computeClient.ts        #     Call compute endpoints
│       │   └── contentService.ts       #     Content processing
│       │
│       ├── compute/                    #   COMPUTE COORDINATION
│       │   ├── computeRegistry.ts      #     Worker registry (30s TTL)
│       │   ├── policyEngine.ts         #     Routing policy evaluation
│       │   ├── matchingEngine.ts       #     Policy-based compute matching
│       │   ├── modelCatalog.ts         #     Model listing + availability
│       │   └── endpointHealthService.ts
│       │
│       ├── agent/                      #   AGENT ORCHESTRATION
│       │   ├── agentOrchestrator.ts    #     Multi-step agent execution
│       │   ├── agentPlanner.ts         #     Task planning
│       │   └── executorRouter.ts       #     Route to best executor
│       │
│       ├── reputation/                 #   TRUST SCORING
│       │   ├── IReputationAlgorithm.ts #     Pluggable algorithm interface
│       │   └── ReputationAlgorithmRegistry.ts
│       │
│       ├── routes/                     #   HTTP ROUTES (all public API)
│       │   ├── lucidLayerRoutes.ts     #     Barrel mount
│       │   ├── inferenceRoutes.ts      #     /v1/chat/completions
│       │   ├── receiptRoutes.ts        #     /v1/receipts, /v1/verify
│       │   ├── epochRoutes.ts          #     /v1/epochs
│       │   ├── passportRoutes.ts       #     /v1/passports + PATCH pricing/endpoints
│       │   ├── matchingRoutes.ts       #     /v1/match
│       │   ├── computeNodeRoutes.ts    #     /v1/compute/nodes/heartbeat
│       │   ├── payoutRoutes.ts         #     /v1/payouts
│       │   ├── shareRoutes.ts          #     /v1/passports/:id/token/*
│       │   ├── disputeRoutes.ts        #     /v2/disputes (EVM escrow)
│       │   ├── crossChainRoutes.ts     #     /v2/* cross-chain
│       │   ├── healthRoutes.ts         #     /health
│       │   └── ...                     #     (remaining route files)
│       │
│       ├── providers/                  #   LLM PROVIDERS
│       │   ├── router.ts              #     Provider routing
│       │   ├── openai.ts              #     OpenAI adapter
│       │   └── mock.ts                #     Mock provider
│       │
│       ├── middleware/                 #   EXPRESS MIDDLEWARE
│       │   ├── privyAuth.ts           #     Privy JWT auth
│       │   ├── hmacAuth.ts            #     HMAC signature auth
│       │   ├── adminAuth.ts           #     Admin key auth
│       │   └── x402.ts                #     x402 payment protocol
│       │
│       ├── integrations/              #   EXTERNAL INTEGRATIONS
│       │   ├── hf/                    #     HuggingFace bridge
│       │   ├── n8n/                   #     n8n workflow bridge
│       │   ├── oauth/                 #     Nango OAuth
│       │   ├── mcp/                   #     MCP registry + server
│       │   └── zkml/                  #     ZKML (future)
│       │
│       └── lib/                        #   SHARED LIB
│           ├── auth/                  #     Session management
│           ├── db/                    #     DB connection pool
│           └── observability/         #     Sentry, tracing
│
├── programs/                           # SOLANA ON-CHAIN PROGRAMS
│   ├── thought-epoch/                  #   MMR root commitment
│   ├── lucid-passports/                #   Passport registry + payment gates
│   └── gas-utils/                      #   Token burn/split CPI
│
├── schemas/                            # JSON SCHEMAS
│   ├── ModelMeta.schema.json
│   ├── ComputeMeta.schema.json
│   ├── ToolMeta.schema.json
│   ├── AgentMeta.schema.json
│   └── DatasetMeta.schema.json
│
├── workers/                            # SEPARATE PROCESSES
│   ├── worker-gpu-vllm/                #   GPU compute worker (vLLM)
│   └── worker-sim-hf/                  #   HuggingFace sim worker
│
├── docs/plans/                         # ARCHITECTURE DOCS
├── infrastructure/migrations/          # SUPABASE MIGRATIONS
├── agent-services/                     # CREWAI + LANGGRAPH
├── tests/                              # ANCHOR ON-CHAIN TESTS
├── openapi.yaml                        # API SPEC (Speakeasy source)
└── CLAUDE.md                           # Project instructions
```

### Repo B — lucid-plateform-core (Gateway — Closed, Proprietary)

Edge + Control + Enterprise. The business layer.

```
lucid-plateform-core/
├── apps/                               # DEPLOYABLE SERVICES
│   ├── trustgate-api/                  # TRUSTGATE (:4010) — LLM proxy
│   │   ├── src/server.ts               #   Fastify entry point
│   │   └── src/routes/v1.ts            #   /v1/* routes (chat, embeddings)
│   │
│   ├── mcpgate-api/                    # MCPGATE (:4020) — tool gateway
│   │   ├── src/server.ts               #   Fastify entry point
│   │   └── src/routes/                 #   10 route files
│   │       ├── agents.ts               #     Agent management
│   │       ├── auth.ts                 #     Authentication
│   │       ├── chains.ts               #     Chain execution
│   │       ├── mcp.ts                  #     MCP protocol
│   │       ├── plugins.ts              #     Plugin management
│   │       ├── servers.ts              #     Server config
│   │       ├── sessions.ts             #     Session management
│   │       ├── tools.ts                #     Tool execution
│   │       └── audit.ts                #     Audit logging
│   │
│   ├── control-plane/                  # CONTROL PLANE (:4030) — admin
│   │   ├── src/server.ts               #   Fastify entry point
│   │   └── src/routes/                 #   6 route files
│   │       ├── tenants.ts              #     Tenant CRUD
│   │       ├── api-keys.ts             #     API key management
│   │       ├── plans.ts                #     Plan configuration
│   │       ├── quotas.ts               #     Quota management
│   │       ├── entitlements.ts         #     Feature entitlements
│   │       └── usage.ts                #     Usage analytics
│   │
│   └── video-engine/                   # VIDEO ENGINE — Remotion rendering
│       ├── src/server.ts
│       ├── src/routes/                 #   render, cancel, templates, thumbnail
│       ├── src/engine/                 #   bundler, lambda, local renderer
│       ├── src/storage/r2.ts           #   Cloudflare R2
│       └── compositions/              #   Remotion scene components
│
├── modules/                            # FEATURE MODULES (shared logic)
│   ├── trustgate/                      # TRUSTGATE MODULE
│   │   ├── src/router/model-router.ts  #   Model routing logic
│   │   ├── src/providers/litellm-client.ts
│   │   ├── src/guardrails/request-policy.ts
│   │   ├── src/receipt-events.ts       #   Receipt event emission
│   │   ├── src/metering.ts             #   Usage metering hooks
│   │   └── src/openai-compat/schemas.ts
│   │
│   ├── mcpgate/                        # MCPGATE MODULE
│   │   ├── src/servers/                #   80+ builtin MCP servers
│   │   │   ├── aave.ts, chainlink.ts, compound.ts, lido.ts ...  # DeFi
│   │   │   ├── slack.ts, github.ts, jira.ts, notion.ts ...       # SaaS
│   │   │   ├── stripe.ts, discord.ts, telegram.ts ...            # Services
│   │   │   └── (80+ total integrations)
│   │   ├── src/auth/                   #   Credential adapters
│   │   │   ├── credential-adapter.ts   #     Base interface
│   │   │   ├── env-var-adapter.ts      #     Env var credentials
│   │   │   ├── database-adapter.ts     #     DB credentials
│   │   │   └── composite-adapter.ts    #     Composite (chain adapters)
│   │   ├── src/registry/               #   Server discovery
│   │   │   ├── tool-registry.ts        #     Tool registration
│   │   │   ├── server-health.ts        #     Health monitoring
│   │   │   └── circuit-breaker.ts      #     Circuit breaker
│   │   ├── src/router/                 #   Execution routing
│   │   │   ├── tool-router.ts
│   │   │   ├── chain-executor.ts
│   │   │   └── rate-limiter.ts
│   │   ├── src/session/                #   Session management
│   │   │   ├── session-manager.ts
│   │   │   └── session-budget.ts
│   │   ├── src/audit/                  #   Audit trail
│   │   ├── src/identity/               #   Agent identity
│   │   ├── src/discovery/              #   Semantic search
│   │   └── src/metering/               #   Tool metering
│   │
│   ├── fluid-compute/                  # FLUID COMPUTE MODULE
│   │   └── src/index.ts
│   │
│   ├── agentaas/                       # AGENT-AS-A-SERVICE MODULE
│   │   └── src/index.ts
│   │
│   ├── video/                          # VIDEO MODULE
│   │   └── src/index.ts, db.ts, metering.ts, schemas.ts
│   │
│   └── shared-contracts/               # SHARED TYPES + OPENAPI
│       ├── openapi/trustgate-v1.yaml
│       ├── openapi/control-plane-v1.yaml
│       ├── schemas/chat-completions.request.json
│       └── events/usage-event.schema.json
│
├── packages/                           # SHARED NPM PACKAGES
│   ├── gateway-core/                   # GATEWAY SDK (auth, rate limit, policy)
│   │   ├── src/auth/                   #   API key + tenant management
│   │   ├── src/policy/                 #   Plan config + enforcement
│   │   ├── src/quotas/                 #   Quota service
│   │   ├── src/usage/                  #   Usage tracking
│   │   ├── src/fastify/               #   Auth hooks, health, seeding
│   │   ├── src/events/                 #   Event emitter
│   │   ├── src/db/client.ts            #   Database client
│   │   └── src/feature-flags.ts        #   Feature flag system
│   │
│   ├── passport/                       # PASSPORT PACKAGE (shared with Core)
│   │   ├── src/matching-engine.ts
│   │   ├── src/policy-engine.ts
│   │   ├── src/schema-validator.ts
│   │   ├── src/compute-registry.ts
│   │   ├── src/store.ts
│   │   ├── src/hash.ts
│   │   └── src/canonical-json.ts
│   │
│   ├── metering/                       # METERING CLIENT
│   │   └── src/client.ts, events.ts, outbox.ts
│   │
│   ├── observability/                  # LOGGING + TRACING
│   │   └── src/logger.ts, tracing.ts, sentry.ts, sanitize.ts
│   │
│   ├── openclaw-provider/              # OPENCLAW AI PROVIDER
│   │   └── src/provider.ts
│   │
│   └── config/                         # SHARED CONFIG
│
├── cloud/                              # ── ENTERPRISE TIER (PROPRIETARY) ──
│   ├── LICENSE                         #   Proprietary license
│   ├── billing/                        # STRIPE BILLING
│   │   └── src/stripe-client.ts, checkout.ts, routes.ts, webhook-handler.ts
│   ├── mcpgate-cloud/                  # CLOUD-ONLY EXTENSIONS
│   │   └── adapters/nango-adapter.ts   #   Nango OAuth credential adapter
│   └── acceleration/                   # NEW (Phase 6) — enterprise caches
│       ├── postgres.ts                 #   Postgres read cache
│       ├── redis.ts                    #   Redis hot cache
│       ├── r2.ts                       #   S3/R2 object store
│       └── vector.ts                   #   pgvector semantic search
│
├── infra/                              # DEPLOYMENT CONFIGS
│   ├── cloudflare-worker/worker.js     #   CDN-level edge
│   ├── litellm/                        #   LiteLLM (Docker + Railway)
│   ├── nginx-gateway/                  #   Reverse proxy
│   └── monitoring/                     #   Monitoring setup
│
├── migrations/                         # DATABASE MIGRATIONS (18 files)
│   ├── 001_openmeter_event_ledger.sql
│   ├── ...
│   └── 018_centralized_billing_schema.sql
│
├── scripts/                            # BUILD + OPS SCRIPTS
│   ├── check-oss-boundary.sh           #   CI: validates cloud/ boundary
│   ├── run-migration.js
│   └── generate-mcp-servers/
│
├── generated-mcp-servers/              # AUTO-GENERATED (20+ integrations)
│
├── Dockerfile.trustgate                # Docker images
├── Dockerfile.mcpgate
├── Dockerfile.video-engine
└── CLAUDE.md
```

### Dependency Flow (One-Way)

```
Gateway reads from Core. Core never imports from Gateway.

lucid-plateform-core (Gateway)
  ├── imports from: Lucid-L2 API (HTTP)
  ├── imports from: @raijinlabs/passport (shared package)
  └── NEVER imports: Lucid-L2 internal modules

Lucid-L2 (Core)
  ├── imports from: @raijinlabs/passport (shared package)
  └── NEVER imports: lucid-plateform-core anything

@raijinlabs/passport
  └── Shared by both — passport types, matching, policy, schema validation
```

### Layer → Directory Quick Reference

| Layer | Lucid-L2 (Core) | lucid-plateform-core (Gateway) |
|-------|-----------------|-------------------------------|
| **Truth** | `packages/engine/receipt/`, `packages/engine/storage/`, `packages/engine/chain/`, `packages/engine/assets/`, `packages/engine/crypto/` | — |
| **Control** | `packages/gateway-lite/compute/`, `packages/gateway-lite/agent/`, `packages/gateway-lite/reputation/`, `packages/engine/passport/`, `packages/engine/finance/` | `apps/control-plane/`, `modules/fluid-compute/`, `packages/gateway-core/`, `packages/metering/` |
| **Edge** | `packages/gateway-lite/inference/`, `packages/gateway-lite/routes/`, `packages/gateway-lite/providers/` | `apps/trustgate-api/`, `apps/mcpgate-api/`, `modules/trustgate/`, `modules/mcpgate/`, `infra/cloudflare-worker/` |
| **Enterprise** | — | `cloud/billing/`, `cloud/mcpgate-cloud/`, `cloud/acceleration/` |

---

## 20. Existing Implementation

| Component | Current State | File(s) |
|-----------|--------------|---------|
| DePIN interface | Built (IDepinStorage) | `packages/engine/src/storage/depin/` |
| Arweave provider | Built (via Irys) | `packages/engine/src/storage/depin/ArweaveStorage.ts` |
| Lighthouse provider | Built | `packages/engine/src/storage/depin/LighthouseStorage.ts` |
| Mock provider | Built | `packages/engine/src/storage/depin/MockStorage.ts` |
| NFT providers | Built (Token2022, Metaplex, EVM) | `packages/engine/src/assets/nft/` |
| Share tokens | Built (DirectMint, Genesis) | `packages/engine/src/assets/shares/` |
| Schema validation | Built (Model, Compute, Tool, Agent, Dataset) | `packages/engine/src/crypto/schemaValidator.ts` |
| Passport CRUD | Built | `packages/engine/src/passport/passportManager.ts` |
| Receipt signing | Built (Ed25519 + JCS) | `packages/engine/src/receipt/receiptService.ts` |
| Extended receipts | Built (Fluid Compute v0.2 fields) | `packages/engine/src/receipt/receiptService.ts` |
| MMR | Built (incremental algorithm correct, but in-memory only — needs SQLite persistence) | `packages/engine/src/crypto/mmr.ts` |
| Epoch service | Built (in-memory, needs SQLite migration) | `packages/engine/src/receipt/epochService.ts` |
| Solana anchoring | Built (thought_epoch program) | `programs/thought-epoch/` |
| Solana passports | Built (lucid_passports program) | `programs/lucid-passports/` |
| ComputeRegistry | Built (in-memory, needs SQLite migration) | `packages/gateway-lite/src/compute/computeRegistry.ts` |
| Convenience endpoints | Built (PATCH pricing, PATCH endpoints) | `packages/gateway-lite/src/routes/passportRoutes.ts` |
| DePIN re-upload | Built (forceReupload on metadata change) | `packages/engine/src/passport/passportSyncService.ts` |
| `/verify` endpoint | Partially built (hash + signature + MMR proof). Needs: challenge status, availability checks, commitment level | `packages/gateway-lite/src/routes/receiptRoutes.ts` |
| EVM dispute routes | Built (open, evidence, resolve, appeal — escrow-based) | `packages/gateway-lite/src/routes/disputeRoutes.ts` |
| On-chain payment gates | Built (set_payment_gate, pay_for_access, withdraw_revenue, revoke_access) | `programs/lucid-passports/` |
| MemoryMap | Not built | — |
| PoER dispute system | Not built (extends existing dispute routes with receipt challenge flow) | — |
| SQLite migration | Not built | — |
| MMR SQLite persistence | Not built (algorithm is correct, storage needs migration) | — |
| Commitment pipeline | Not built | — |
| DePIN retry queue | Not built | — |
| Package extraction (engine + gateway-lite) | Built (Phases 0–5 complete, 184 files moved, re-export proxies active) | `packages/engine/`, `packages/gateway-lite/` | — |
| StoragePolicyResolver | Not built | — |
| Universal CID pattern | Not built (content_hash exists in PDA but not used as universal key) | — |
| PMW (Proof of Memory Write) | Not built | — |
| Multi-Lane Fetch | Not built (single-lane fetch today) | — |
| Delta Chain (memory snapshots) | Not built | — |
| AgentCard manifest | Not built (passport is the closest equivalent) | — |
| DePIN observability | Not built (compute health exists, storage health does not) | — |
| Barrel exports (truth/control/edge) | Not built | — |
| Passport cache service | Not built (reads go direct to store) | — |
