# MemoryMap Design Specification

**Date:** 2026-03-13
**Status:** Approved for implementation
**Author:** Kevin Wayne + Claude
**Version:** 1.0

---

## 1. Overview

### What MemoryMap Is

MemoryMap is Lucid's portable, provable agent memory system. It gives AI agents persistent memory that survives restarts, moves between deployments, and produces cryptographic proof of every write.

### Primary Promise (v1)

**Portable semantic + procedural memory with verifiable provenance.**

### Why It Matters

No existing agent memory system combines portability, verifiability, and temporal awareness:

| Capability | Mem0 | Letta | Zep | CrewAI | **Lucid MemoryMap** |
|-----------|------|-------|-----|--------|---------------------|
| Automatic extraction | Yes | Yes | Yes | Yes | **Yes** |
| Temporal awareness | No | No | Yes | No | **Staged** |
| Portability standard | No | .af (partial) | No | No | **Yes (.lmf)** |
| Cryptographic proofs | No | No | No | No | **Yes** |
| On-chain anchoring | No | No | No | No | **Yes** |
| Memory integrity verification | No | No | No | No | **Yes** |
| Receipt-linked writes | No | No | No | No | **Yes** |
| Reputation-weighted recall | No | No | No | No | **Staged** |

### Who Uses It

- **Lucid-deployed agents** — native library access, zero-hop
- **External agents** (CrewAI, LangGraph, Eliza, custom) — REST API + MCP server
- **Developers** — SDK (`lucid.memory.*`)

All access patterns hit the same MemoryService, same provenance, same receipts, same anchoring.

---

## 2. Architecture

### Approach: Memory as a Layer (Approach C)

Memory is a library in `engine/src/memory/` with clean interfaces, designed so it can be extracted to a standalone service later without interface changes.

```
Layer 1    — IMemoryStore + type managers + query engine
Layer 2    — MemoryService orchestrator + extraction + commitments + ACL + archive
Layer 3    — REST routes + MCP server + SDK namespace (thin wrappers)
```

Internal agents call Layer 1-2 directly. External agents hit Layer 3. Same code path, same receipts, same proofs.

### Module Structure

```
engine/src/memory/
├── types.ts                    # All memory types + shared interfaces
├── store/                      # Layer 1 — Storage
│   ├── interface.ts            # IMemoryStore (the contract)
│   ├── postgres.ts             # PostgresMemoryStore (production)
│   ├── in-memory.ts            # InMemoryMemoryStore (tests / dev)
│   └── index.ts                # Factory: getMemoryStore()
├── managers/                   # Layer 1 — Type-specific logic
│   ├── episodic.ts             # v1 CORE
│   ├── semantic.ts             # v1 CORE
│   ├── procedural.ts           # v1 CORE
│   ├── entity.ts               # STAGED (prepared, not productized)
│   ├── trustWeighted.ts        # STAGED (consumes external reputation)
│   ├── temporal.ts             # STAGED (bitemporal tracking)
│   └── index.ts
├── query/                      # Layer 1.5 — Retrieval
│   ├── retrieval.ts            # Fetch by type/agent/session/entity
│   ├── ranking.ts              # Recency + trust + relevance scoring
│   ├── filters.ts              # Validity windows, ACL, type filters
│   └── index.ts
├── service.ts                  # Layer 2 — MemoryService orchestrator
├── extraction.ts               # Layer 2 — LLM extraction pipeline
├── commitments.ts              # Layer 2 — Canonical hash + receipt + chain
├── acl.ts                      # Layer 2 — Namespace/permission enforcement
├── archivePipeline.ts          # Layer 2 — Cold lane lifecycle
├── index.ts                    # Public API barrel
└── __tests__/                  # Tests per module
```

### Dependency Rules

| Direction | Allowed? |
|-----------|----------|
| `memory/` → `crypto/`, `db/`, `storage/depin/`, `receipt/`, `reputation/` | YES |
| `memory/` → `gateway-lite/` | FORBIDDEN |
| `gateway-lite/routes/` → `memory/service.ts` | YES (thin wrapper) |
| `memory/store/` → `memory/service.ts` | FORBIDDEN (store is lower than service) |
| `memory/managers/` → `memory/store/interface.ts` | YES (managers use the store contract) |
| `memory/extraction.ts` → `memory/managers/` | FORBIDDEN (extraction is orchestration-layer) |

Every manager gets `IMemoryStore` injected, never imports a concrete implementation.

---

## 3. Memory Types

### v1 Core Types (Ship-blocking)

| Type | Purpose | Emits Receipt? |
|------|---------|----------------|
| **Episodic** | Raw conversation messages per session | Batched (per-session checkpoint) |
| **Semantic** | Extracted facts/knowledge | Yes (per write) |
| **Procedural** | Learned behaviors/system prompt updates | Yes (per write) |

### Staged Types (Prepared, not productized in v1)

| Type | Purpose | Emits Receipt? |
|------|---------|----------------|
| **Entity** | Structured knowledge about specific entities | Yes |
| **Trust-weighted** | Reputation-scored memories from external sources | Yes |
| **Temporal** | Facts with validity windows (bitemporal) | Yes |

### Provenance

Provenance is NOT a memory type. It is:
- Base hash fields on every `MemoryEntry` (`content_hash`, `prev_hash`, `receipt_hash`)
- A separate append-only audit table (`memory_provenance`)

Provenance records never emit their own receipts.

### Type Definitions

```typescript
// ─── Base ────────────────────────────────────────────────────────────
export type MemoryType =
  | 'episodic' | 'semantic' | 'procedural'    // v1 core
  | 'entity' | 'trust_weighted' | 'temporal';  // staged

export type MemoryStatus = 'active' | 'superseded' | 'archived' | 'expired';

export interface MemoryEntry<T extends MemoryType = MemoryType> {
  memory_id: string;                // UUID
  agent_passport_id: string;        // Owner agent
  type: T;                          // Discriminator
  namespace: string;                // ACL scope (e.g., "agent:abc/user:xyz")
  content: string;                  // The memory content (text)
  structured_content?: Record<string, unknown>;  // Optional structured payload
  embedding?: number[];             // Vector (computed async after write)
  embedding_model?: string;         // Model used for embedding
  status: MemoryStatus;
  created_at: number;               // Unix ms
  updated_at: number;
  metadata: Record<string, unknown>;  // Extensions only. _lucid_* keys reserved.

  // Provenance (always present — every write is hashed)
  content_hash: string;             // SHA-256 of canonical(content + metadata)
  prev_hash: string | null;         // Previous write for same agent_passport_id + namespace
  receipt_hash?: string;            // Link to receipt (set after commit)
  receipt_run_id?: string;          // Receipt run_id for lookup
}

// ─── Episodic ────────────────────────────────────────────────────────
export interface EpisodicMemory extends MemoryEntry<'episodic'> {
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  turn_index: number;
  tokens: number;
  tool_calls?: ToolCallRecord[];
}

// ─── Semantic ────────────────────────────────────────────────────────
export interface SemanticMemory extends MemoryEntry<'semantic'> {
  fact: string;                     // Normalized fact statement
  confidence: number;               // 0-1, from extraction
  source_memory_ids: string[];      // Episodic entries this was extracted from
  supersedes?: string[];            // memory_ids this replaces
}

// ─── Procedural ──────────────────────────────────────────────────────
export interface ProceduralMemory extends MemoryEntry<'procedural'> {
  rule: string;                     // The learned behavior/instruction
  trigger: string;                  // When to apply this rule
  priority: number;                 // Higher = applied first
  source_memory_ids: string[];
}

// ─── Entity (STAGED) ────────────────────────────────────────────────
export interface EntityMemory extends MemoryEntry<'entity'> {
  entity_name: string;
  entity_type: string;              // 'person' | 'org' | 'token' | 'contract' | ...
  attributes: Record<string, unknown>;
  relationships: EntityRelation[];
}

export interface EntityRelation {
  target_entity_id: string;
  relation_type: string;
  confidence: number;
}

// ─── Trust-Weighted (STAGED) ────────────────────────────────────────
export interface TrustWeightedMemory extends MemoryEntry<'trust_weighted'> {
  source_agent_passport_id: string;
  trust_score: number;              // From external reputation provider
  decay_factor: number;
  weighted_relevance: number;       // trust_score * semantic_similarity
}

// ─── Temporal (STAGED) ──────────────────────────────────────────────
export interface TemporalMemory extends MemoryEntry<'temporal'> {
  valid_from: number;               // Event time start (Unix ms)
  valid_to: number | null;          // Event time end (null = still valid)
  recorded_at: number;              // Ingestion time (bitemporal T')
  superseded_by?: string;
}

// ─── Provenance Record (Audit log, NOT a memory type) ───────────────
export interface ProvenanceRecord {
  record_id: string;
  agent_passport_id: string;
  namespace: string;
  memory_id: string;
  operation: 'create' | 'update' | 'supersede' | 'archive' | 'delete';
  content_hash: string;
  prev_hash: string | null;
  receipt_hash?: string;
  receipt_run_id?: string;
  anchor_epoch_id?: string;
  created_at: number;
}

// ─── Write type safety ──────────────────────────────────────────────
type Writable<T> = Omit<T, 'memory_id' | 'content_hash' | 'prev_hash'>;

export type WritableMemoryEntry =
  | Writable<EpisodicMemory>
  | Writable<SemanticMemory>
  | Writable<ProceduralMemory>
  | Writable<EntityMemory>
  | Writable<TrustWeightedMemory>
  | Writable<TemporalMemory>;
```

### Hash Chain Scope

`prev_hash` = the `content_hash` of the previous committed memory write for the **same `agent_passport_id` + `namespace`**.

Not global per agent. Not global per type. Scoped to the namespace.

### Metadata Policy

- Top-level fields are canonical schema fields
- `metadata` is for extensions only
- Keys prefixed `_lucid_` are reserved for internal use and cannot be overridden by callers

---

## 4. Storage

### IMemoryStore Interface

```typescript
export interface MemoryQuery {
  agent_passport_id: string;
  namespace?: string;
  types?: MemoryType[];
  session_id?: string;
  status?: MemoryStatus[];        // Default: ['active']
  limit?: number;                 // Default: 50, max: 500
  offset?: number;
  order_by?: 'created_at' | 'updated_at' | 'turn_index';
  order_dir?: 'asc' | 'desc';
  content_hash?: string;          // Exact lookup by hash
  since?: number;                 // Unix ms
  before?: number;
}

export interface MemoryWriteResult {
  memory_id: string;
  content_hash: string;
  prev_hash: string | null;
}

export interface IMemoryStore {
  // Core CRUD
  write(entry: WritableMemoryEntry): Promise<MemoryWriteResult>;
  writeBatch(entries: WritableMemoryEntry[]): Promise<MemoryWriteResult[]>;
  read(memory_id: string): Promise<MemoryEntry | null>;
  query(q: MemoryQuery): Promise<MemoryEntry[]>;
  count(q: Omit<MemoryQuery, 'limit' | 'offset'>): Promise<number>;

  // Status transitions
  supersede(memory_id: string, superseded_by: string): Promise<void>;
  archive(memory_id: string): Promise<void>;
  archiveBatch(memory_ids: string[]): Promise<void>;

  // Provenance
  writeProvenance(record: Omit<ProvenanceRecord, 'record_id'>): Promise<string>;
  getProvenanceChain(agent_passport_id: string, namespace: string, limit?: number): Promise<ProvenanceRecord[]>;
  getProvenanceForMemory(memory_id: string): Promise<ProvenanceRecord[]>;
  getLatestHash(agent_passport_id: string, namespace: string): Promise<string | null>;

  // Snapshots
  getEntriesSince(agent_passport_id: string, since: number): Promise<MemoryEntry[]>;
  getLatestSnapshot(agent_passport_id: string): Promise<MemorySnapshot | null>;
  getStats(agent_passport_id: string): Promise<MemoryStats>;
}

export interface MemoryStats {
  total_entries: number;
  by_type: Record<MemoryType, number>;
  by_status: Record<MemoryStatus, number>;
  oldest_entry: number;
  newest_entry: number;
  chain_length: number;
  latest_hash: string | null;
}
```

### Database Schema

```sql
-- Migration: 20260313_memory_map.sql

BEGIN;

-- 1. memory_entries — All memory types, discriminated by type column
CREATE TABLE IF NOT EXISTS memory_entries (
  memory_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_passport_id   TEXT        NOT NULL,
  type                TEXT        NOT NULL CHECK (type IN (
    'episodic', 'semantic', 'procedural',
    'entity', 'trust_weighted', 'temporal'
  )),
  namespace           TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'superseded', 'archived', 'expired')
  ),
  content             TEXT        NOT NULL,
  structured_content  JSONB,
  embedding           vector(1536),
  embedding_model     TEXT,
  metadata            JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- Provenance (every entry is hashed)
  content_hash        TEXT        NOT NULL,
  prev_hash           TEXT,
  receipt_hash        TEXT,
  receipt_run_id      TEXT,

  -- Episodic-specific
  session_id          TEXT,
  role                TEXT CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  turn_index          INTEGER,
  tokens              INTEGER,
  tool_calls          JSONB,

  -- Semantic-specific
  fact                TEXT,
  confidence          REAL,
  source_memory_ids   TEXT[],
  supersedes          TEXT[],

  -- Procedural-specific
  rule                TEXT,
  trigger             TEXT,
  priority            INTEGER,

  -- Temporal-specific (STAGED)
  valid_from          TIMESTAMPTZ,
  valid_to            TIMESTAMPTZ,
  recorded_at         TIMESTAMPTZ,
  superseded_by       TEXT,

  -- Entity-specific (STAGED)
  entity_name         TEXT,
  entity_type         TEXT,
  attributes          JSONB,
  relationships       JSONB,

  -- Trust-weighted-specific (STAGED)
  source_agent_passport_id TEXT,
  trust_score         REAL,
  decay_factor        REAL,
  weighted_relevance  REAL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. memory_provenance — Append-only audit log
CREATE TABLE IF NOT EXISTS memory_provenance (
  record_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_passport_id   TEXT        NOT NULL,
  namespace           TEXT        NOT NULL,
  memory_id           UUID        NOT NULL REFERENCES memory_entries(memory_id),
  operation           TEXT        NOT NULL CHECK (
    operation IN ('create', 'update', 'supersede', 'archive', 'delete')
  ),
  content_hash        TEXT        NOT NULL,
  prev_hash           TEXT,
  receipt_hash        TEXT,
  receipt_run_id      TEXT,
  anchor_epoch_id     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. memory_sessions — Session lifecycle
CREATE TABLE IF NOT EXISTS memory_sessions (
  session_id          TEXT        PRIMARY KEY,
  agent_passport_id   TEXT        NOT NULL,
  namespace           TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'closed', 'archived')
  ),
  turn_count          INTEGER     NOT NULL DEFAULT 0,
  total_tokens        INTEGER     NOT NULL DEFAULT 0,
  summary             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at           TIMESTAMPTZ
);

-- 4. memory_snapshots — DePIN checkpoint references
CREATE TABLE IF NOT EXISTS memory_snapshots (
  snapshot_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_passport_id   TEXT        NOT NULL,
  depin_cid           TEXT        NOT NULL,
  entry_count         INTEGER     NOT NULL,
  chain_head_hash     TEXT        NOT NULL,
  snapshot_type       TEXT        NOT NULL CHECK (
    snapshot_type IN ('checkpoint', 'migration', 'archive')
  ),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_memory_agent_ns_type ON memory_entries(agent_passport_id, namespace, type, status);
CREATE INDEX idx_memory_session ON memory_entries(session_id, turn_index) WHERE session_id IS NOT NULL;
CREATE INDEX idx_memory_content_hash ON memory_entries(content_hash);
CREATE INDEX idx_memory_created ON memory_entries(created_at DESC);
CREATE INDEX idx_memory_receipt ON memory_entries(receipt_hash) WHERE receipt_hash IS NOT NULL;
CREATE UNIQUE INDEX idx_memory_agent_ns_hash ON memory_entries(agent_passport_id, namespace, content_hash);
CREATE INDEX idx_provenance_agent_ns ON memory_provenance(agent_passport_id, namespace, created_at DESC);
CREATE INDEX idx_provenance_memory ON memory_provenance(memory_id);
CREATE INDEX idx_sessions_agent ON memory_sessions(agent_passport_id, status);
CREATE INDEX idx_snapshots_agent ON memory_snapshots(agent_passport_id, created_at DESC);

-- Vector similarity (requires pgvector extension)
-- CREATE INDEX idx_memory_embedding ON memory_entries
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
--   WHERE embedding IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_memory_updated_at
  BEFORE UPDATE ON memory_entries
  FOR EACH ROW EXECUTE FUNCTION update_memory_updated_at();

COMMIT;
```

**Rationale:**
- Single table with discriminated union — avoids join complexity, matches Letta/Supabase pattern
- pgvector embedding column is nullable, computed async, with `embedding_model` to avoid model lock-in
- `(agent_passport_id, namespace, content_hash)` uniqueness prevents silent duplicates
- `updated_at` trigger keeps timestamps accurate without application-level code
- Separate append-only provenance table for immutable audit trail
- Vector index commented out (requires pgvector extension, operator enables)

---

## 5. Layer 2 — MemoryService Orchestrator

### Configuration

```typescript
export interface MemoryServiceConfig {
  extraction_enabled: boolean;      // LLM extraction on episodic writes
  extraction_model?: string;        // Model for extraction
  embedding_enabled: boolean;       // Compute embeddings on write
  embedding_model: string;          // e.g., 'text-embedding-3-small'
  provenance_enabled: boolean;      // Hash chain + provenance records (default: true)
  receipts_enabled: boolean;        // Link memory writes to receipt MMR
  auto_archive_after_ms?: number;   // Auto-archive sessions older than this
  max_episodic_window: number;      // Default: 50 turns
  max_semantic_per_agent: number;   // Soft cap before compaction (default: 1000)
}
```

### Write Pipeline

Every write follows this pipeline:

1. **ACL check** — namespace permission for caller
2. **Manager validation** — type-specific rules
3. **Canonical hash computation** — SHA-256 of `canonicalJson(content + type-specific fields)`
4. **Prev_hash chain lookup** — get latest hash for this `agent_passport_id + namespace`
5. **Store write** — persist to DB with hash chain
6. **Provenance record** — append to audit log
7. **Receipt linkage** — create receipt in receiptService (if enabled for this type)
8. **Session stats update** — atomic increment of `turn_count`/`total_tokens` (episodic only)
9. **Embedding computation** — async, queue-backed with retry + dead-letter tracking
10. **Extraction trigger** — async, debounced per-session with lock + idempotency key (episodic only)

### Receipt Policy

| Memory Type | Receipt Emission |
|-------------|-----------------|
| Semantic | Per write |
| Procedural | Per write |
| Episodic | Batched per-session (on close or every N turns) |
| Entity (staged) | Per write |
| Trust-weighted (staged) | Per write |
| Temporal (staged) | Per write |
| Provenance records | Never |

### Extraction Pipeline

Runs AFTER episodic writes. Analyzes recent conversation to extract semantic facts and procedural rules.

**Trigger conditions:**
- Every `trigger_every_n_messages` episodic writes (default: 5)
- On session close (`trigger_on_session_close: true`)

**Safety:**
- Per-session extraction lock (prevents overlapping jobs)
- Debounce window (default: 2 seconds)
- Idempotency key per extraction batch

**Pipeline steps:**
1. Load recent episodic entries for session (up to `max_context_messages`)
2. Load existing semantic facts for this agent + namespace
3. Prompt LLM: extract new/updated facts and rules
4. Dedup against existing semantics (by embedding similarity)
5. Detect supersession (new fact replaces existing → mark old as superseded)
6. Write new semantic + procedural entries via MemoryService (same provenance pipeline)

### Compaction Triggers

Episodic → semantic compaction runs when:
- Session closes
- Episodic turns exceed `max_episodic_window`
- Idle timeout (configurable, default: 30 minutes)
- Before archive snapshot creation
- On explicit `POST /v1/memory/compact` request

### Commitments Module

Handles the cryptographic side:
- `computeMemoryHash(entry)` — `SHA-256(canonicalJson(content + type-specific fields))`
- `linkToReceipt(memory_id, content_hash, agent_passport_id)` — creates a 'memory' receipt in receiptService, hash enters MMR, anchored in next epoch
- `verifyChainIntegrity(agent_passport_id, namespace)` — walk the chain, verify each `content_hash` matches content and `prev_hash` links correctly

### ACL

Namespace format: `"agent:{passport_id}"` or `"agent:{id}/user:{user_id}"`

Rules:
- Agent owns its own namespace (`agent:{self}`)
- External callers need explicit grant
- Admin key bypasses ACL
- Read vs write permissions are separate

```typescript
export type PermissionLevel = 'none' | 'read' | 'write' | 'admin';

export interface MemoryACL {
  assertReadPermission(caller_passport_id: string, namespace: string): void;
  assertWritePermission(caller_passport_id: string, namespace: string): void;
  grantAccess(owner: string, grantee: string, namespace: string, level: PermissionLevel): Promise<void>;
  revokeAccess(owner: string, grantee: string, namespace: string): Promise<void>;
}
```

### Integration with Existing Lucid Systems

```
Memory write
  → commitments.computeMemoryHash()          # Same SHA-256 as receipts
  → store.getLatestHash() for prev_hash      # Hash chain per agent+namespace
  → store.write()                            # Postgres
  → commitments.linkToReceipt()              # Creates receipt in receiptService
  → receiptMMR.addLeaf()                     # Into the MMR (already built)
  → epochService.addReceiptToEpoch()         # Batched into epochs (already built)
  → anchoringService.commitEpochRoot()       # Anchored on-chain (already built)
  → archivePipeline (on epoch finalize)      # Cold lane to DePIN (already built)
```

Every memory write produces a receipt. Every receipt goes into the MMR. Every MMR root gets anchored on-chain. The entire memory history is provably anchored without any new blockchain infrastructure.

---

## 6. Layer 3 — API Surfaces

### REST Routes

```
POST   /v1/memory/episodic                     # Add conversation turn
POST   /v1/memory/semantic                     # Add extracted fact
POST   /v1/memory/procedural                   # Add learned rule
POST   /v1/memory/recall                       # Unified retrieval (semantic search + filters)
GET    /v1/memory/entries/:id                  # Get single entry by ID
GET    /v1/memory/entries                      # Query entries (type, namespace, session, status)

POST   /v1/memory/sessions                     # Start session (accepts { namespace?: string })
POST   /v1/memory/sessions/:id/close           # Close session
GET    /v1/memory/sessions/:id/context         # Get session context (windowed)
GET    /v1/memory/sessions                     # List sessions for agent

GET    /v1/memory/provenance/:agent_id/:ns     # Get provenance chain
GET    /v1/memory/provenance/entry/:id         # Get provenance for specific entry
POST   /v1/memory/verify                       # Verify chain integrity

POST   /v1/memory/snapshots                    # Create DePIN snapshot
POST   /v1/memory/snapshots/restore            # Restore from CID (requires restoreMode)
GET    /v1/memory/snapshots                    # List snapshots for agent

POST   /v1/memory/compact                      # Trigger manual compaction
GET    /v1/memory/stats/:agent_id              # Memory stats
```

**Route semantics:**
- `POST /v1/memory/recall` — for semantic search queries and complex filter bodies
- `GET /v1/memory/entries` — for structured filtering via query params

**Auth:** Agent API key (auto-scoped) or admin API key (any namespace) or passport-based with grants.

### MCP Server

```typescript
tools: [
  { name: "memory_add",            description: "Store a memory entry" },
  { name: "memory_recall",         description: "Retrieve relevant memories" },
  { name: "memory_session_start",  description: "Start a conversation session" },
  { name: "memory_session_context", description: "Get recent conversation context" },
  { name: "memory_verify",         description: "Verify memory chain integrity" },
  { name: "memory_snapshot",       description: "Create portable snapshot on DePIN" },
]
```

### SDK Namespace

```typescript
const lucid = new Lucid({ apiKey: '...' });

// Start session
const sessionId = await lucid.memory.startSession({ namespace: 'agent:abc/user:xyz' });

// Add conversation turns
await lucid.memory.addEpisodic({
  session_id: sessionId,
  role: 'user',
  content: 'What is my ETH balance?',
  tokens: 12,
});

// Recall relevant memories
const memories = await lucid.memory.recall({
  query: 'ETH balance preferences',
  types: ['semantic', 'procedural'],
  limit: 10,
});

// Verify integrity
const result = await lucid.memory.verify();
console.log(result.valid, result.chain_length);

// Snapshot for migration
const cid = await lucid.memory.snapshot('migration');
// On a different deployment:
await lucid.memory.restore(cid, { mode: 'merge' });
```

---

## 7. Archive Pipeline & Portability

### Cold Lane Lifecycle

```
Active memory (hot DB)
  ↓ session close or age threshold
Compaction (summarize episodic → semantic)
  ↓ epoch finalize
Archive bundle → DePIN permanent storage
  ↓ CID stored in memory_snapshots
Hot rows archived (status='archived')
  ↓ configurable retention
Pruned from hot DB (CID is the pointer)
```

### .lmf — Lucid Memory File

The portable memory format. Lucid's answer to Letta's `.af`.

```typescript
export interface LucidMemoryFile {
  version: '1.0';
  agent_passport_id: string;
  created_at: number;
  chain_head_hash: string;

  // Content
  entries: MemoryEntry[];           // Active entries
  provenance: ProvenanceRecord[];   // Chain needed to verify entries
  sessions: MemorySession[];        // Session metadata
  archived_cids?: string[];         // Pointers to archived cold storage

  // Verification
  entry_count: number;
  content_mmr_root: string;         // MMR root over all entry hashes
  signature: string;                // Ed25519 over the bundle hash
  signer_pubkey: string;

  // Anchoring proof (if available)
  anchor?: {
    chain: string;
    epoch_id: string;
    tx_hash: string;
    mmr_root: string;
  };
}
```

**Migration snapshot scope:**
- Active entries
- Provenance chain needed to verify them
- Session metadata
- Archived summary CID pointers
- NOT raw historical episodic rows

### Restore Collision Policy

`restoreMode` is required:
- `'replace'` — drop existing, import snapshot as-is
- `'merge'` — merge entries by content_hash, skip duplicates, extend chain
- `'fork'` — import as new namespace branch, preserve both histories

### Portability Flow

```
Source:
  lucid.memory.snapshot('migration')
  → Serialize active entries + provenance + sessions
  → Compute content MMR root
  → Sign with agent's Ed25519 key
  → Upload to DePIN evolving storage → CID
  → Store CID in passport metadata

Target:
  lucid.memory.restore(cid, { mode: 'merge' })
  → Download .lmf from DePIN
  → Verify signature against passport pubkey
  → Verify content MMR root
  → Verify hash chain integrity
  → Write entries to local hot DB
  → Resume from chain head
```

### What makes .lmf 300% ahead

- Letta's `.af` has no integrity verification
- Mem0 has no export format
- Zep has no portability story
- `.lmf` is cryptographically signed, hash-chained, and optionally anchored on-chain
- An agent can migrate between deployers and *prove* its memory hasn't been tampered with

---

## 8. Implementation Sequence

### P0 — Core (Must ship)

1. **Policy decisions** — receipt rules, extraction triggers, compaction policy (DONE — in this spec)
2. **DB migration** — `memory_entries`, `memory_provenance`, `memory_sessions`, `memory_snapshots`
3. **`IMemoryStore` + `PostgresMemoryStore` + `InMemoryMemoryStore`** — write, query, provenance, snapshots
4. **`commitments.ts`** — canonical hash, prev_hash lookup, receipt linkage, integrity verification
5. **`MemoryService` core write path** — addEpisodic, addSemantic, addProcedural, recall, verifyChainIntegrity
6. **`acl.ts`** — namespace permission enforcement

### P1 — Extraction & Archive

7. **`extraction.ts`** — LLM extraction pipeline with debounce/lock
8. **`archivePipeline.ts`** — snapshot creation, restore, cold lane lifecycle
9. **`query/`** — retrieval, ranking, filters
10. **`.lmf` format** — serialize, sign, verify, upload/download

### P2 — API Surfaces

11. **REST routes** — `memoryRoutes.ts` in gateway-lite
12. **MCP server** — 6 tools wrapping MemoryService
13. **SDK namespace** — `MemoryClient` in `sdk/src/memory.ts`

### P3 — Staged Types

14. **Entity manager** — structured entity records
15. **Trust-weighted manager** — consumes external reputation, scores memories
16. **Temporal manager** — bitemporal validity windows

---

## 9. Environment Variables

```bash
# MemoryMap
MEMORY_ENABLED=true                    # Master switch
MEMORY_EXTRACTION_ENABLED=true         # LLM extraction on episodic writes
MEMORY_EXTRACTION_MODEL=               # Override model for extraction
MEMORY_EMBEDDING_ENABLED=true          # Compute embeddings
MEMORY_EMBEDDING_MODEL=text-embedding-3-small
MEMORY_RECEIPTS_ENABLED=true           # Link writes to receipt MMR
MEMORY_MAX_EPISODIC_WINDOW=50          # Max turns before compaction
MEMORY_MAX_SEMANTIC_PER_AGENT=1000     # Soft cap
MEMORY_AUTO_ARCHIVE_AFTER_MS=86400000  # 24 hours
MEMORY_EXTRACTION_BATCH_SIZE=5         # Extract every N messages
MEMORY_EXTRACTION_DEBOUNCE_MS=2000     # Debounce window
MEMORY_COMPACTION_IDLE_TIMEOUT_MS=1800000  # 30 minutes
```

---

## 10. Testing Strategy

| Layer | Test Type | Count (est.) |
|-------|-----------|-------------|
| `store/in-memory.ts` | Unit — CRUD, query, provenance chain | ~25 |
| `store/postgres.ts` | Integration — real DB | ~20 |
| `commitments.ts` | Unit — hash computation, chain verification | ~15 |
| `managers/*.ts` | Unit — type-specific validation | ~20 |
| `service.ts` | Integration — full write pipeline | ~30 |
| `extraction.ts` | Unit — mock LLM, dedup, supersession | ~15 |
| `acl.ts` | Unit — permission checks | ~10 |
| `archivePipeline.ts` | Integration — snapshot/restore | ~15 |
| `query/*.ts` | Unit — ranking, filtering | ~15 |
| REST routes | Supertest — all endpoints | ~25 |
| SDK | Unit — client methods | ~15 |
| **Total** | | **~205** |
