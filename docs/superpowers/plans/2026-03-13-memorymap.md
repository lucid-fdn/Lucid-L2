# MemoryMap Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Lucid's portable, provable agent memory system — persistent memory with hash-chain provenance, receipt-linked writes, and .lmf portable snapshots.

**Architecture:** Three-layer library in `engine/src/memory/`: Layer 1 (IMemoryStore + type managers + query), Layer 2 (MemoryService orchestrator + extraction + commitments + ACL + archive), Layer 3 (REST routes + MCP tools + SDK namespace). All writes produce SHA-256 hash chains and link to the existing receipt/MMR/epoch pipeline.

**Tech Stack:** TypeScript, PostgreSQL (pgvector for embeddings), Jest, Express, Ed25519 (tweetnacl), SHA-256 (crypto), RFC 8785 canonical JSON.

**Spec:** `docs/superpowers/specs/2026-03-13-memorymap-design.md`

---

## File Structure

### New Files (engine/src/memory/)

| File | Responsibility |
|------|---------------|
| `types.ts` | All memory TypeScript types — MemoryEntry, EpisodicMemory, SemanticMemory, ProceduralMemory, EntityMemory, TrustWeightedMemory, TemporalMemory, ProvenanceRecord, MemorySession, MemorySnapshot, ToolCallRecord, WritableMemoryEntry, RestoreMode, RecallRequest, RecallResponse, MemoryServiceConfig, PermissionLevel, LucidMemoryFile. Note: `MemoryReceiptBody` and `MemoryReceipt` live in `receiptService.ts` (single source of truth for all receipt types). |
| `store/interface.ts` | IMemoryStore contract + MemoryQuery + MemoryWriteResult + MemoryStats |
| `store/in-memory.ts` | InMemoryMemoryStore (tests + dev) |
| `store/postgres.ts` | PostgresMemoryStore (production — uses `pool` from `db/pool.ts`) |
| `store/index.ts` | Factory: `getMemoryStore()` — env-driven singleton |
| `commitments.ts` | `computeMemoryHash()`, `linkToReceipt()`, `verifyChainIntegrity()` |
| `managers/episodic.ts` | Validate episodic writes, auto-assign turn_index |
| `managers/semantic.ts` | Validate semantic writes, supersession detection |
| `managers/procedural.ts` | Validate procedural writes |
| `managers/index.ts` | `getManager(type)` dispatcher |
| `acl.ts` | Namespace permission enforcement |
| `query/retrieval.ts` | Fetch by type/agent/session/entity |
| `query/ranking.ts` | Recency + relevance scoring |
| `query/filters.ts` | Status, namespace, time window filters |
| `query/index.ts` | Barrel |
| `service.ts` | MemoryService orchestrator — full write pipeline |
| `extraction.ts` | LLM extraction pipeline (episodic → semantic + procedural) |
| `archivePipeline.ts` | Snapshot create/restore, cold lane, .lmf serialize/verify |
| `index.ts` | Public barrel export |

### New Files (gateway-lite)

| File | Responsibility |
|------|---------------|
| `routes/core/memoryRoutes.ts` | REST API — all `/v1/memory/*` endpoints |

### New Files (contrib/integrations)

| File | Responsibility |
|------|---------------|
| `mcp-server/memoryTools.ts` | 6 MCP tools wrapping MemoryService |

### New Files (SDK)

| File | Responsibility |
|------|---------------|
| `packages/sdk/src/memory.ts` | MemoryNamespace on Lucid class |

### New Files (migrations)

| File | Responsibility |
|------|---------------|
| `infrastructure/migrations/20260313_memory_map.sql` | 4 tables + indexes + trigger |

### New Test Files

| File | Tests |
|------|-------|
| `engine/src/memory/__tests__/types.test.ts` | Type guards, Writable<T> validation |
| `engine/src/memory/__tests__/inMemoryStore.test.ts` | Full IMemoryStore contract (~25 tests) |
| `engine/src/memory/__tests__/commitments.test.ts` | Hash computation, chain verification (~15 tests) |
| `engine/src/memory/__tests__/managers.test.ts` | Validation per type (~20 tests) |
| `engine/src/memory/__tests__/acl.test.ts` | Permission checks (~10 tests) |
| `engine/src/memory/__tests__/service.test.ts` | Full write pipeline (~30 tests) |
| `engine/src/memory/__tests__/query.test.ts` | Retrieval, ranking, filters (~15 tests) |
| `engine/src/memory/__tests__/extraction.test.ts` | Mock LLM extraction (~15 tests) |
| `engine/src/memory/__tests__/archivePipeline.test.ts` | Snapshot/restore (~15 tests) |
| `gateway-lite/src/routes/__tests__/memoryRoutes.test.ts` | Supertest REST endpoints (~25 tests) |

### Modified Files

| File | Change |
|------|--------|
| `engine/src/receipt/receiptService.ts` | Add `'memory'` to ReceiptType union, add `MemoryReceiptBody`, `MemoryReceipt`, `BatchedEpisodicReceiptBody`, `createMemoryReceipt()` via `createReceiptGeneric`, `createBatchedEpisodicReceipt()`, add `memory` to `bodyExtractors`, add `MemoryReceipt` to `Receipt` union, add `'memory'` case to `createReceipt()` |
| `engine/src/receipt/index.ts` | Export new memory receipt functions and types |
| `engine/src/index.ts` | Add `export * from './memory'` |
| `gateway-lite/src/routes/index.ts` | Add `memoryRouter` export |
| `gateway-lite/src/routes/core/lucidLayerRoutes.ts` | Mount `memoryRouter` (memory routes are `/v1/*`, same as receipts/passports) |
| `packages/sdk/src/lucid.ts` | Add `MemoryNamespace` to Lucid class |
| `contrib/integrations/mcp-server/mcpServer.ts` | Import and register memory tools |

---

## Pre-flight: Locked Decisions

These rules are canonical. If any other section of this plan contradicts them, these win.

### Memory Types (exactly 6)

| Type | V1 Status | Emits Receipt? |
|------|-----------|----------------|
| `episodic` | CORE | Batched per-session (see watermark policy below) |
| `semantic` | CORE | Per write |
| `procedural` | CORE | Per write |
| `entity` | STAGED | Per write |
| `trust_weighted` | STAGED | Per write |
| `temporal` | STAGED | Per write |

**Provenance is NOT a memory type.** It is an append-only audit log (`memory_provenance` table). Provenance records never emit receipts.

### Episodic Hash Ordering Rule

`turn_index` is part of the episodic hash preimage. Therefore it must be assigned **before** hashing. The episodic write sequence is:

1. **Assign `turn_index`** — query `MAX(turn_index)` for the session, increment by 1 (or 0 if first)
2. **Build full entry** — merge `turn_index` into the write payload
3. **Compute `content_hash`** — `SHA-256(canonicalJson(preimage))` including `turn_index`
4. **Lookup `prev_hash`** — `store.getLatestHash(agent_passport_id, namespace)`
5. **Persist** — `store.write({ ...entry, content_hash, prev_hash })`
6. **Write provenance** — append to audit log

Steps 1, 4, 5, 6 run inside a single `SERIALIZABLE` transaction (Postgres) or sequential calls (in-memory).

### Batched Episodic Receipt Watermark Policy

Each session tracks a **watermark** — the `turn_index` of the last episodic entry included in a receipt.

**Fields on `MemorySession`:**
- `last_receipted_turn_index: number` (default: -1, meaning no receipt yet)

**Emission triggers (both active — no double-accounting due to watermark):**
- **Every N turns:** when `current_turn_index - last_receipted_turn_index >= config.extraction_batch_size`
- **On session close:** emit a final batch for any unreceipted entries

**Batch scope:**
- Include episodic entries where `turn_index > last_receipted_turn_index` for this session
- After receipt creation, advance `last_receipted_turn_index` to the highest included turn

**Receipt preimage:**
```typescript
{
  schema_version: '1.0',
  run_id: string,
  timestamp: number,              // Unix seconds (matches all receipt types)
  agent_passport_id: string,
  session_id: string,
  entry_hashes: string[],         // content_hash of each episodic entry in batch
  entry_count: number,
  first_turn_index: number,       // inclusive
  last_turn_index: number,        // inclusive
  namespace: string,
}
```

### Deterministic Chain Ordering

The hash chain is ordered by `(created_at ASC, memory_id ASC)` — using `memory_id` as tie-breaker for entries with identical timestamps. Both `InMemoryMemoryStore` and `PostgresMemoryStore` must use this same ordering for:
- `getLatestHash()` — returns `content_hash` of the last entry by this ordering
- `verifyChainIntegrity()` — walks entries in this order
- `query()` with `order_by: 'created_at'` — uses `memory_id` as secondary sort

### Constructor Signature (locked)

```typescript
new MemoryService(store: IMemoryStore, acl: MemoryACLEngine, config: MemoryServiceConfig)
```

This order is used everywhere: tests, MCP tools, route initialization. No variation.

### Receipt Field Naming

All receipt types use `receipt_signature` (not `signature`). Test mocks must match:
```typescript
{ receipt_type: 'memory', run_id: '...', receipt_hash: '...', receipt_signature: '...', signer_pubkey: '...', ... }
```

### MMR Terminology

- `.lmf` files use `content_mmr_root` (not "merkle root")
- Archive pipeline uses `content_mmr_root`
- All comments and variable names use "MMR" not "Merkle"

### Auth Model (v1)

v1 ships with two auth paths only:
- **Agent API key** — auto-scoped to `agent:{passport_id}` namespace
- **Admin API key** — bypasses ACL, any namespace

Passport-based grants (`grantAccess`/`revokeAccess`) are designed and implemented in the ACL module but **not exposed via REST in v1**. They remain internal-only until the core system is stable.

---

## Chunk 1: Types + Store Interface + InMemory Store

### Task 1: Memory Types

**Files:**
- Create: `offchain/packages/engine/src/memory/types.ts`
- Test: `offchain/packages/engine/src/memory/__tests__/types.test.ts`

- [ ] **Step 1: Write failing test for type guards**

```typescript
// offchain/packages/engine/src/memory/__tests__/types.test.ts
import {
  MemoryType, MemoryStatus, MemoryEntry, EpisodicMemory, SemanticMemory,
  ProceduralMemory, WritableMemoryEntry, isEpisodicMemory, isSemanticMemory,
  isProceduralMemory, MEMORY_TYPES, MEMORY_STATUSES,
} from '../types';

describe('Memory Types', () => {
  const baseEntry: MemoryEntry = {
    memory_id: '550e8400-e29b-41d4-a716-446655440000',
    agent_passport_id: 'agent-1',
    type: 'episodic',
    namespace: 'agent:agent-1',
    content: 'Hello world',
    status: 'active',
    created_at: Date.now(),
    updated_at: Date.now(),
    metadata: {},
    content_hash: 'abc123',
    prev_hash: null,
  };

  describe('MEMORY_TYPES constant', () => {
    it('should include all 6 types', () => {
      expect(MEMORY_TYPES).toEqual([
        'episodic', 'semantic', 'procedural',
        'entity', 'trust_weighted', 'temporal',
      ]);
    });
  });

  describe('MEMORY_STATUSES constant', () => {
    it('should include all 4 statuses', () => {
      expect(MEMORY_STATUSES).toEqual(['active', 'superseded', 'archived', 'expired']);
    });
  });

  describe('isEpisodicMemory', () => {
    it('should return true for episodic entries', () => {
      const episodic: EpisodicMemory = {
        ...baseEntry,
        type: 'episodic',
        session_id: 'sess-1',
        role: 'user',
        turn_index: 0,
        tokens: 10,
      };
      expect(isEpisodicMemory(episodic)).toBe(true);
    });

    it('should return false for non-episodic entries', () => {
      expect(isEpisodicMemory({ ...baseEntry, type: 'semantic' })).toBe(false);
    });
  });

  describe('isSemanticMemory', () => {
    it('should return true for semantic entries', () => {
      const semantic: SemanticMemory = {
        ...baseEntry,
        type: 'semantic',
        fact: 'The sky is blue',
        confidence: 0.9,
        source_memory_ids: [],
      };
      expect(isSemanticMemory(semantic)).toBe(true);
    });
  });

  describe('isProceduralMemory', () => {
    it('should return true for procedural entries', () => {
      const procedural: ProceduralMemory = {
        ...baseEntry,
        type: 'procedural',
        rule: 'Always greet first',
        trigger: 'conversation_start',
        priority: 1,
        source_memory_ids: [],
      };
      expect(isProceduralMemory(procedural)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src/memory/__tests__/types.test.ts --no-coverage 2>&1 | tail -20`
Expected: FAIL — cannot find module `../types`

- [ ] **Step 3: Write types.ts with all type definitions and guards**

```typescript
// offchain/packages/engine/src/memory/types.ts

// ─── Constants ──────────────────────────────────────────────────────
export const MEMORY_TYPES = [
  'episodic', 'semantic', 'procedural',
  'entity', 'trust_weighted', 'temporal',
] as const;

export const MEMORY_STATUSES = ['active', 'superseded', 'archived', 'expired'] as const;

// ─── Base ───────────────────────────────────────────────────────────
export type MemoryType = (typeof MEMORY_TYPES)[number];
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export interface MemoryEntry<T extends MemoryType = MemoryType> {
  memory_id: string;
  agent_passport_id: string;
  type: T;
  namespace: string;
  content: string;
  structured_content?: Record<string, unknown>;
  embedding?: number[];
  embedding_model?: string;
  status: MemoryStatus;
  created_at: number;
  updated_at: number;
  metadata: Record<string, unknown>;
  content_hash: string;
  prev_hash: string | null;
  receipt_hash?: string;
  receipt_run_id?: string;
}

// ─── Episodic ───────────────────────────────────────────────────────
export interface ToolCallRecord {
  tool_name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

export interface EpisodicMemory extends MemoryEntry<'episodic'> {
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  turn_index: number;
  tokens: number;
  tool_calls?: ToolCallRecord[];
}

// ─── Semantic ───────────────────────────────────────────────────────
export interface SemanticMemory extends MemoryEntry<'semantic'> {
  fact: string;
  confidence: number;
  source_memory_ids: string[];
  supersedes?: string[];
}

// ─── Procedural ─────────────────────────────────────────────────────
export interface ProceduralMemory extends MemoryEntry<'procedural'> {
  rule: string;
  trigger: string;
  priority: number;
  source_memory_ids: string[];
}

// ─── Entity (STAGED) ───────────────────────────────────────────────
export interface EntityRelation {
  target_entity_id: string;
  relation_type: string;
  confidence: number;
}

export interface EntityMemory extends MemoryEntry<'entity'> {
  entity_name: string;
  entity_type: string;
  attributes: Record<string, unknown>;
  relationships: EntityRelation[];
}

// ─── Trust-Weighted (STAGED) ────────────────────────────────────────
export interface TrustWeightedMemory extends MemoryEntry<'trust_weighted'> {
  source_agent_passport_id: string;
  trust_score: number;
  decay_factor: number;
  weighted_relevance: number;
}

// ─── Temporal (STAGED) ─────────────────────────────────────────────
export interface TemporalMemory extends MemoryEntry<'temporal'> {
  valid_from: number;
  valid_to: number | null;
  recorded_at: number;
  superseded_by?: string;
}

// ─── Provenance ─────────────────────────────────────────────────────
export interface ProvenanceRecord {
  record_id: string;
  agent_passport_id: string;
  namespace: string;
  memory_id: string;
  operation: 'create' | 'update' | 'supersede' | 'archive';
  content_hash: string;
  prev_hash: string | null;
  receipt_hash?: string;
  receipt_run_id?: string;
  anchor_epoch_id?: string;
  created_at: number;
}

// ─── Session ────────────────────────────────────────────────────────
export interface MemorySession {
  session_id: string;
  agent_passport_id: string;
  namespace: string;
  status: 'active' | 'closed' | 'archived';
  turn_count: number;
  total_tokens: number;
  last_receipted_turn_index: number;  // Watermark: last turn included in a batched episodic receipt (-1 = none)
  summary?: string;
  created_at: number;
  last_activity: number;
  closed_at?: number;
}

// ─── Snapshot ───────────────────────────────────────────────────────
export interface MemorySnapshot {
  snapshot_id: string;
  agent_passport_id: string;
  depin_cid: string;
  entry_count: number;
  chain_head_hash: string;
  snapshot_type: 'checkpoint' | 'migration' | 'archive';
  created_at: number;
}

// ─── Write type safety ─────────────────────────────────────────────
type Writable<T> = Omit<T,
  'memory_id' | 'content_hash' | 'prev_hash' |
  'receipt_hash' | 'receipt_run_id' |
  'status' | 'created_at' | 'updated_at' |
  'embedding' | 'embedding_model' | 'turn_index'
>;

export type WritableMemoryEntry =
  | Writable<EpisodicMemory>
  | Writable<SemanticMemory>
  | Writable<ProceduralMemory>
  | Writable<EntityMemory>
  | Writable<TrustWeightedMemory>
  | Writable<TemporalMemory>;

export type WritableEpisodicMemory = Writable<EpisodicMemory>;
export type WritableSemanticMemory = Writable<SemanticMemory>;
export type WritableProceduralMemory = Writable<ProceduralMemory>;

// ─── Restore ────────────────────────────────────────────────────────
export type RestoreMode = 'replace' | 'merge' | 'fork';

export interface RestoreRequest {
  cid: string;
  mode: RestoreMode;
  target_namespace?: string;
}

export interface RestoreResult {
  entries_imported: number;
  entries_skipped: number;
  chain_head_hash: string;
  source_agent_passport_id: string;
}

// NOTE: MemoryReceiptBody, MemoryReceipt, and BatchedEpisodicReceiptBody
// are defined in receiptService.ts (single source of truth for all receipt types).
// Import them from '@lucid-l2/engine' receipt exports when needed.

// ─── Recall ─────────────────────────────────────────────────────────
export interface RecallRequest {
  query: string;
  agent_passport_id: string;
  namespace?: string;
  types?: MemoryType[];
  limit?: number;
  min_similarity?: number;
  include_archived?: boolean;
  session_id?: string;
}

export interface RecallResponse {
  memories: (MemoryEntry & { score: number })[];
  query_embedding_model: string;
  total_candidates: number;
}

// ─── Config ─────────────────────────────────────────────────────────
export interface MemoryServiceConfig {
  extraction_enabled: boolean;
  extraction_model?: string;
  extraction_batch_size: number;
  extraction_debounce_ms: number;
  trigger_on_session_close: boolean;
  embedding_enabled: boolean;
  embedding_model: string;
  provenance_enabled: boolean;
  receipts_enabled: boolean;
  auto_archive_after_ms?: number;
  max_episodic_window: number;
  max_semantic_per_agent: number;
  compaction_idle_timeout_ms: number;
}

export function getDefaultConfig(): MemoryServiceConfig {
  return {
    extraction_enabled: process.env.MEMORY_EXTRACTION_ENABLED !== 'false',
    extraction_model: process.env.MEMORY_EXTRACTION_MODEL || undefined,
    extraction_batch_size: parseInt(process.env.MEMORY_EXTRACTION_BATCH_SIZE || '5', 10),
    extraction_debounce_ms: parseInt(process.env.MEMORY_EXTRACTION_DEBOUNCE_MS || '2000', 10),
    trigger_on_session_close: true,
    embedding_enabled: process.env.MEMORY_EMBEDDING_ENABLED !== 'false',
    embedding_model: process.env.MEMORY_EMBEDDING_MODEL || 'text-embedding-3-small',
    provenance_enabled: true,
    receipts_enabled: process.env.MEMORY_RECEIPTS_ENABLED !== 'false',
    auto_archive_after_ms: process.env.MEMORY_AUTO_ARCHIVE_AFTER_MS
      ? parseInt(process.env.MEMORY_AUTO_ARCHIVE_AFTER_MS, 10) : undefined,
    max_episodic_window: parseInt(process.env.MEMORY_MAX_EPISODIC_WINDOW || '50', 10),
    max_semantic_per_agent: parseInt(process.env.MEMORY_MAX_SEMANTIC_PER_AGENT || '1000', 10),
    compaction_idle_timeout_ms: parseInt(process.env.MEMORY_COMPACTION_IDLE_TIMEOUT_MS || '1800000', 10),
  };
}

// ─── ACL ────────────────────────────────────────────────────────────
export type PermissionLevel = 'none' | 'read' | 'write' | 'admin';

// ─── LMF (Lucid Memory File) ───────────────────────────────────────
export interface LucidMemoryFile {
  version: '1.0';
  agent_passport_id: string;
  created_at: number;
  chain_head_hash: string;
  entries: MemoryEntry[];
  provenance: ProvenanceRecord[];
  sessions: MemorySession[];
  archived_cids?: string[];
  entry_count: number;
  content_mmr_root: string;
  signature: string;
  signer_pubkey: string;
  anchor?: {
    chain: string;
    epoch_id: string;
    tx_hash: string;
    mmr_root: string;
  };
}

// ─── Type guards ────────────────────────────────────────────────────
export function isEpisodicMemory(entry: MemoryEntry): entry is EpisodicMemory {
  return entry.type === 'episodic';
}

export function isSemanticMemory(entry: MemoryEntry): entry is SemanticMemory {
  return entry.type === 'semantic';
}

export function isProceduralMemory(entry: MemoryEntry): entry is ProceduralMemory {
  return entry.type === 'procedural';
}

export function isEntityMemory(entry: MemoryEntry): entry is EntityMemory {
  return entry.type === 'entity';
}

export function isTrustWeightedMemory(entry: MemoryEntry): entry is TrustWeightedMemory {
  return entry.type === 'trust_weighted';
}

export function isTemporalMemory(entry: MemoryEntry): entry is TemporalMemory {
  return entry.type === 'temporal';
}

/** Max content size: 100KB */
export const MAX_CONTENT_SIZE = 100 * 1024;
/** Max metadata size: 64KB */
export const MAX_METADATA_SIZE = 64 * 1024;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src/memory/__tests__/types.test.ts --no-coverage 2>&1 | tail -20`
Expected: PASS — all type guard tests green

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/types.ts offchain/packages/engine/src/memory/__tests__/types.test.ts
git commit -m "feat(memory): add MemoryMap type definitions and type guards"
```

---

### Task 2: Database Migration

**Files:**
- Create: `infrastructure/migrations/20260313_memory_map.sql`

- [ ] **Step 1: Write the migration SQL**

Copy the SQL from spec Section 4 (Database Schema) verbatim — it defines:
- `memory_entries` (single-table discriminated union, all 6 types)
- `memory_provenance` (append-only audit log)
- `memory_sessions` (session lifecycle)
- `memory_snapshots` (DePIN checkpoint references)
- 12 indexes including partial unique indexes
- `updated_at` trigger

The full SQL is in `docs/superpowers/specs/2026-03-13-memorymap-design.md` lines 425-576. Copy it exactly.

**Important:** The `embedding vector(1536)` column requires the `pgvector` extension. Add `CREATE EXTENSION IF NOT EXISTS vector;` at the top of the migration, inside the transaction.

- [ ] **Step 2: Verify migration syntax**

Run: `cat infrastructure/migrations/20260313_memory_map.sql | head -5`
Expected: `BEGIN;` with `CREATE EXTENSION` and `CREATE TABLE`

- [ ] **Step 3: Commit**

```bash
git add infrastructure/migrations/20260313_memory_map.sql
git commit -m "feat(memory): add DB migration for memory_entries, provenance, sessions, snapshots"
```

---

### Task 3: IMemoryStore Interface

**Files:**
- Create: `offchain/packages/engine/src/memory/store/interface.ts`

- [ ] **Step 1: Write the store interface**

```typescript
// offchain/packages/engine/src/memory/store/interface.ts
import type {
  MemoryEntry, MemoryType, MemoryStatus, WritableMemoryEntry,
  ProvenanceRecord, MemorySession, MemorySnapshot,
} from '../types';

export interface MemoryQuery {
  agent_passport_id: string;
  namespace?: string;
  types?: MemoryType[];
  session_id?: string;
  status?: MemoryStatus[];
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'updated_at' | 'turn_index';
  order_dir?: 'asc' | 'desc';
  content_hash?: string;
  since?: number;
  before?: number;
}

export interface MemoryWriteResult {
  memory_id: string;
  content_hash: string;
  prev_hash: string | null;
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

export interface IMemoryStore {
  // Core CRUD
  write(entry: WritableMemoryEntry & { content_hash: string; prev_hash: string | null }): Promise<MemoryWriteResult>;
  writeBatch(entries: (WritableMemoryEntry & { content_hash: string; prev_hash: string | null })[]): Promise<MemoryWriteResult[]>;
  read(memory_id: string): Promise<MemoryEntry | null>;
  query(q: MemoryQuery): Promise<MemoryEntry[]>;
  count(q: Omit<MemoryQuery, 'limit' | 'offset'>): Promise<number>;

  // Status transitions
  supersede(memory_id: string, superseded_by: string): Promise<void>;
  archive(memory_id: string): Promise<void>;
  archiveBatch(memory_ids: string[]): Promise<void>;
  softDelete(memory_id: string): Promise<void>;

  // Provenance
  writeProvenance(record: Omit<ProvenanceRecord, 'record_id'>): Promise<string>;
  getProvenanceChain(agent_passport_id: string, namespace: string, limit?: number): Promise<ProvenanceRecord[]>;
  getProvenanceForMemory(memory_id: string): Promise<ProvenanceRecord[]>;
  getLatestHash(agent_passport_id: string, namespace: string): Promise<string | null>;

  // Sessions
  createSession(session: Omit<MemorySession, 'turn_count' | 'total_tokens' | 'created_at' | 'last_activity'>): Promise<string>;
  getSession(session_id: string): Promise<MemorySession | null>;
  updateSessionStats(session_id: string, turn_delta: number, token_delta: number): Promise<void>;
  closeSession(session_id: string, summary?: string): Promise<void>;
  listSessions(agent_passport_id: string, status?: MemorySession['status'][]): Promise<MemorySession[]>;

  // Embeddings
  updateEmbedding(memory_id: string, embedding: number[], model: string): Promise<void>;

  // Snapshots
  saveSnapshot(snapshot: Omit<MemorySnapshot, 'snapshot_id'>): Promise<string>;
  getLatestSnapshot(agent_passport_id: string): Promise<MemorySnapshot | null>;
  listSnapshots(agent_passport_id: string): Promise<MemorySnapshot[]>;
  getEntriesSince(agent_passport_id: string, since: number): Promise<MemoryEntry[]>;
  getStats(agent_passport_id: string): Promise<MemoryStats>;
}
```

**Design decision (deviation from spec):** The `write()` signature takes `content_hash` and `prev_hash` as required fields because the commitments module computes them before calling the store. The store is a dumb persistence layer — it does not compute hashes. The spec's IMemoryStore uses `WritableMemoryEntry` without these fields; update the spec to match this enriched signature.

**Note on PostgresMemoryStore:** Spec P0 item 3 includes PostgresMemoryStore. It is deferred to Chunk 6 (Task 18) because all earlier tasks use InMemoryMemoryStore for testing. The factory defaults to `'memory'` until Task 18 lands.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/memory/store/interface.ts
git commit -m "feat(memory): add IMemoryStore interface contract"
```

---

### Task 4: InMemoryMemoryStore

**Files:**
- Create: `offchain/packages/engine/src/memory/store/in-memory.ts`
- Test: `offchain/packages/engine/src/memory/__tests__/inMemoryStore.test.ts`

- [ ] **Step 1: Write failing tests for InMemoryMemoryStore**

```typescript
// offchain/packages/engine/src/memory/__tests__/inMemoryStore.test.ts
import { InMemoryMemoryStore } from '../store/in-memory';
import type { IMemoryStore, MemoryWriteResult } from '../store/interface';
import type { EpisodicMemory, SemanticMemory } from '../types';

describe('InMemoryMemoryStore', () => {
  let store: IMemoryStore;

  beforeEach(() => {
    store = new InMemoryMemoryStore();
  });

  describe('write + read', () => {
    it('should write and read back a memory entry', async () => {
      const result = await store.write({
        agent_passport_id: 'agent-1',
        type: 'episodic',
        namespace: 'agent:agent-1',
        content: 'Hello',
        metadata: {},
        session_id: 'sess-1',
        role: 'user',
        tokens: 5,
        content_hash: 'hash-1',
        prev_hash: null,
      });

      expect(result.memory_id).toBeDefined();
      expect(result.content_hash).toBe('hash-1');
      expect(result.prev_hash).toBeNull();

      const entry = await store.read(result.memory_id);
      expect(entry).not.toBeNull();
      expect(entry!.content).toBe('Hello');
      expect(entry!.type).toBe('episodic');
      expect(entry!.status).toBe('active');
      expect((entry as EpisodicMemory).session_id).toBe('sess-1');
    });

    it('should return null for non-existent memory_id', async () => {
      const entry = await store.read('non-existent');
      expect(entry).toBeNull();
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await store.write({
        agent_passport_id: 'agent-1', type: 'episodic', namespace: 'agent:agent-1',
        content: 'Turn 1', metadata: {}, session_id: 'sess-1', role: 'user', tokens: 5,
        content_hash: 'h1', prev_hash: null,
      });
      await store.write({
        agent_passport_id: 'agent-1', type: 'semantic', namespace: 'agent:agent-1',
        content: 'Fact 1', metadata: {}, fact: 'The sky is blue', confidence: 0.9,
        source_memory_ids: [], content_hash: 'h2', prev_hash: 'h1',
      });
      await store.write({
        agent_passport_id: 'agent-2', type: 'episodic', namespace: 'agent:agent-2',
        content: 'Other agent', metadata: {}, session_id: 'sess-2', role: 'user', tokens: 3,
        content_hash: 'h3', prev_hash: null,
      });
    });

    it('should filter by agent_passport_id', async () => {
      const results = await store.query({ agent_passport_id: 'agent-1' });
      expect(results).toHaveLength(2);
    });

    it('should filter by type', async () => {
      const results = await store.query({ agent_passport_id: 'agent-1', types: ['semantic'] });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('semantic');
    });

    it('should filter by session_id', async () => {
      const results = await store.query({ agent_passport_id: 'agent-1', session_id: 'sess-1' });
      expect(results).toHaveLength(1);
    });

    it('should respect limit', async () => {
      const results = await store.query({ agent_passport_id: 'agent-1', limit: 1 });
      expect(results).toHaveLength(1);
    });

    it('should default status to active', async () => {
      await store.archive((await store.query({ agent_passport_id: 'agent-1', types: ['semantic'] }))[0].memory_id);
      const results = await store.query({ agent_passport_id: 'agent-1' });
      expect(results).toHaveLength(1); // Only episodic remains active
    });
  });

  describe('count', () => {
    it('should count entries matching query', async () => {
      await store.write({
        agent_passport_id: 'agent-1', type: 'episodic', namespace: 'agent:agent-1',
        content: 'Hello', metadata: {}, session_id: 's1', role: 'user', tokens: 5,
        content_hash: 'h1', prev_hash: null,
      });
      const count = await store.count({ agent_passport_id: 'agent-1' });
      expect(count).toBe(1);
    });
  });

  describe('supersede', () => {
    it('should set status to superseded', async () => {
      const { memory_id } = await store.write({
        agent_passport_id: 'agent-1', type: 'semantic', namespace: 'agent:agent-1',
        content: 'Old fact', metadata: {}, fact: 'Old', confidence: 0.8,
        source_memory_ids: [], content_hash: 'h1', prev_hash: null,
      });
      await store.supersede(memory_id, 'new-id');
      const entry = await store.read(memory_id);
      expect(entry!.status).toBe('superseded');
    });
  });

  describe('archive + archiveBatch', () => {
    it('should set status to archived', async () => {
      const { memory_id } = await store.write({
        agent_passport_id: 'agent-1', type: 'episodic', namespace: 'agent:agent-1',
        content: 'Hello', metadata: {}, session_id: 's1', role: 'user', tokens: 5,
        content_hash: 'h1', prev_hash: null,
      });
      await store.archive(memory_id);
      const entry = await store.read(memory_id);
      expect(entry!.status).toBe('archived');
    });

    it('should batch archive multiple entries', async () => {
      const r1 = await store.write({
        agent_passport_id: 'a', type: 'episodic', namespace: 'agent:a',
        content: 'A', metadata: {}, session_id: 's', role: 'user', tokens: 1,
        content_hash: 'h1', prev_hash: null,
      });
      const r2 = await store.write({
        agent_passport_id: 'a', type: 'episodic', namespace: 'agent:a',
        content: 'B', metadata: {}, session_id: 's', role: 'assistant', tokens: 2,
        content_hash: 'h2', prev_hash: 'h1',
      });
      await store.archiveBatch([r1.memory_id, r2.memory_id]);
      const e1 = await store.read(r1.memory_id);
      const e2 = await store.read(r2.memory_id);
      expect(e1!.status).toBe('archived');
      expect(e2!.status).toBe('archived');
    });
  });

  describe('provenance', () => {
    it('should write and retrieve provenance records', async () => {
      const recordId = await store.writeProvenance({
        agent_passport_id: 'agent-1', namespace: 'agent:agent-1',
        memory_id: 'mem-1', operation: 'create',
        content_hash: 'h1', prev_hash: null, created_at: Date.now(),
      });
      expect(recordId).toBeDefined();

      const chain = await store.getProvenanceChain('agent-1', 'agent:agent-1');
      expect(chain).toHaveLength(1);
      expect(chain[0].operation).toBe('create');
    });

    it('should get provenance for a specific memory', async () => {
      await store.writeProvenance({
        agent_passport_id: 'agent-1', namespace: 'agent:agent-1',
        memory_id: 'mem-1', operation: 'create',
        content_hash: 'h1', prev_hash: null, created_at: Date.now(),
      });
      const records = await store.getProvenanceForMemory('mem-1');
      expect(records).toHaveLength(1);
    });

    it('should get latest hash for agent+namespace', async () => {
      const { memory_id } = await store.write({
        agent_passport_id: 'agent-1', type: 'semantic', namespace: 'agent:agent-1',
        content: 'Fact', metadata: {}, fact: 'F', confidence: 1.0,
        source_memory_ids: [], content_hash: 'latest-hash', prev_hash: null,
      });
      const hash = await store.getLatestHash('agent-1', 'agent:agent-1');
      expect(hash).toBe('latest-hash');
    });

    it('should return null for empty namespace', async () => {
      const hash = await store.getLatestHash('agent-1', 'empty-ns');
      expect(hash).toBeNull();
    });
  });

  describe('sessions', () => {
    it('should create and get a session', async () => {
      const sessionId = await store.createSession({
        session_id: 'sess-1', agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1', status: 'active',
      });
      expect(sessionId).toBe('sess-1');

      const session = await store.getSession('sess-1');
      expect(session).not.toBeNull();
      expect(session!.turn_count).toBe(0);
      expect(session!.total_tokens).toBe(0);
    });

    it('should update session stats atomically', async () => {
      await store.createSession({
        session_id: 'sess-1', agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1', status: 'active',
      });
      await store.updateSessionStats('sess-1', 1, 50);
      await store.updateSessionStats('sess-1', 1, 30);
      const session = await store.getSession('sess-1');
      expect(session!.turn_count).toBe(2);
      expect(session!.total_tokens).toBe(80);
    });

    it('should close a session', async () => {
      await store.createSession({
        session_id: 'sess-1', agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1', status: 'active',
      });
      await store.closeSession('sess-1', 'Session summary');
      const session = await store.getSession('sess-1');
      expect(session!.status).toBe('closed');
      expect(session!.summary).toBe('Session summary');
    });

    it('should list sessions by agent and status', async () => {
      await store.createSession({ session_id: 's1', agent_passport_id: 'agent-1', namespace: 'agent:agent-1', status: 'active' });
      await store.createSession({ session_id: 's2', agent_passport_id: 'agent-1', namespace: 'agent:agent-1', status: 'active' });
      await store.closeSession('s2');
      const active = await store.listSessions('agent-1', ['active']);
      expect(active).toHaveLength(1);
      const all = await store.listSessions('agent-1');
      expect(all).toHaveLength(2);
    });
  });

  describe('snapshots', () => {
    it('should save and retrieve a snapshot', async () => {
      const id = await store.saveSnapshot({
        agent_passport_id: 'agent-1', depin_cid: 'bafyabc',
        entry_count: 10, chain_head_hash: 'head-hash',
        snapshot_type: 'checkpoint', created_at: Date.now(),
      });
      expect(id).toBeDefined();

      const latest = await store.getLatestSnapshot('agent-1');
      expect(latest).not.toBeNull();
      expect(latest!.depin_cid).toBe('bafyabc');
    });

    it('should list snapshots for an agent', async () => {
      await store.saveSnapshot({
        agent_passport_id: 'agent-1', depin_cid: 'cid1',
        entry_count: 5, chain_head_hash: 'h1',
        snapshot_type: 'checkpoint', created_at: Date.now(),
      });
      await store.saveSnapshot({
        agent_passport_id: 'agent-1', depin_cid: 'cid2',
        entry_count: 10, chain_head_hash: 'h2',
        snapshot_type: 'migration', created_at: Date.now(),
      });
      const snapshots = await store.listSnapshots('agent-1');
      expect(snapshots).toHaveLength(2);
    });
  });

  describe('stats', () => {
    it('should return memory stats for an agent', async () => {
      await store.write({
        agent_passport_id: 'agent-1', type: 'episodic', namespace: 'agent:agent-1',
        content: 'Hello', metadata: {}, session_id: 's1', role: 'user', tokens: 5,
        content_hash: 'h1', prev_hash: null,
      });
      await store.write({
        agent_passport_id: 'agent-1', type: 'semantic', namespace: 'agent:agent-1',
        content: 'Fact', metadata: {}, fact: 'F', confidence: 1.0,
        source_memory_ids: [], content_hash: 'h2', prev_hash: 'h1',
      });
      const stats = await store.getStats('agent-1');
      expect(stats.total_entries).toBe(2);
      expect(stats.by_type.episodic).toBe(1);
      expect(stats.by_type.semantic).toBe(1);
      expect(stats.by_status.active).toBe(2);
      expect(stats.latest_hash).toBe('h2');
    });
  });

  describe('getEntriesSince', () => {
    it('should return entries created after the given timestamp', async () => {
      const before = Date.now();
      await store.write({
        agent_passport_id: 'agent-1', type: 'semantic', namespace: 'agent:agent-1',
        content: 'Old fact', metadata: {}, fact: 'Old', confidence: 1,
        source_memory_ids: [], content_hash: 'h-old', prev_hash: null,
      });
      const after = Date.now() + 1;
      await store.write({
        agent_passport_id: 'agent-1', type: 'semantic', namespace: 'agent:agent-1',
        content: 'New fact', metadata: {}, fact: 'New', confidence: 1,
        source_memory_ids: [], content_hash: 'h-new', prev_hash: 'h-old',
      });
      const entries = await store.getEntriesSince('agent-1', after);
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('updateEmbedding', () => {
    it('should update embedding on an existing entry', async () => {
      const { memory_id } = await store.write({
        agent_passport_id: 'agent-1', type: 'semantic', namespace: 'agent:agent-1',
        content: 'Fact', metadata: {}, fact: 'F', confidence: 1.0,
        source_memory_ids: [], content_hash: 'h1', prev_hash: null,
      });
      await store.updateEmbedding(memory_id, [0.1, 0.2, 0.3], 'text-embedding-3-small');
      const entry = await store.read(memory_id);
      expect(entry!.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(entry!.embedding_model).toBe('text-embedding-3-small');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src/memory/__tests__/inMemoryStore.test.ts --no-coverage 2>&1 | tail -20`
Expected: FAIL — cannot find module `../store/in-memory`

- [ ] **Step 3: Implement InMemoryMemoryStore**

Create `offchain/packages/engine/src/memory/store/in-memory.ts`. This is a pure in-memory implementation using Maps. Key behaviors:
- `entries: Map<string, MemoryEntry>` — keyed by memory_id (generated UUID via `crypto.randomUUID()`)
- `provenance: ProvenanceRecord[]` — append-only array
- `sessions: Map<string, MemorySession>` — keyed by session_id
- `snapshots: MemorySnapshot[]` — append-only array
- `write()` assigns `memory_id`, `status: 'active'`, `created_at`, `updated_at`, auto-assigns `turn_index` for episodic
- `query()` filters by agent_passport_id, namespace, types, session_id, status (default `['active']`), limit (default 50), offset
- `getLatestHash()` finds the most recent entry for agent+namespace and returns its content_hash
- `getStats()` aggregates counts by type and status
- `getEntriesSince()` filters by created_at >= since

The implementation follows the patterns from the spec. Each method is straightforward Map/Array operations.

**Deterministic ordering:** All ordering uses `(created_at ASC, memory_id ASC)` as defined in Pre-flight. `getLatestHash()` finds the entry with the highest `(created_at, memory_id)` pair for the agent+namespace — NOT just the most recent by timestamp alone. This matches the Postgres `ORDER BY created_at DESC, memory_id DESC LIMIT 1` behavior.

**turn_index assignment:** The store does NOT auto-assign turn_index. Instead, `MemoryService.addEpisodic()` queries existing entries for the session, computes `MAX(turn_index) + 1`, and passes the assigned value to the store. The store just persists what it receives (see Pre-flight: Episodic Hash Ordering Rule).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src/memory/__tests__/inMemoryStore.test.ts --no-coverage 2>&1 | tail -20`
Expected: PASS — all ~25 tests green

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/store/in-memory.ts offchain/packages/engine/src/memory/__tests__/inMemoryStore.test.ts
git commit -m "feat(memory): add InMemoryMemoryStore with full IMemoryStore contract tests"
```

---

### Task 5: Store Factory + Barrel

**Files:**
- Create: `offchain/packages/engine/src/memory/store/index.ts`

- [ ] **Step 1: Write store factory**

```typescript
// offchain/packages/engine/src/memory/store/index.ts
import type { IMemoryStore } from './interface';
import { InMemoryMemoryStore } from './in-memory';

export type { IMemoryStore, MemoryQuery, MemoryWriteResult, MemoryStats } from './interface';
export { InMemoryMemoryStore } from './in-memory';

let storeInstance: IMemoryStore | null = null;

/**
 * Get the singleton memory store instance.
 * Uses MEMORY_STORE env var: 'postgres' (default) or 'memory'.
 * Falls back to in-memory if postgres module is not yet available.
 */
export function getMemoryStore(): IMemoryStore {
  if (storeInstance) return storeInstance;

  const provider = process.env.MEMORY_STORE || 'memory'; // default to memory until postgres impl lands

  if (provider === 'postgres') {
    // Lazy import to avoid requiring pg when using in-memory
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PostgresMemoryStore } = require('./postgres');
    storeInstance = new PostgresMemoryStore();
  } else {
    storeInstance = new InMemoryMemoryStore();
  }

  return storeInstance;
}

/** Reset singleton (for tests). */
export function resetMemoryStore(): void {
  storeInstance = null;
}
```

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/memory/store/index.ts
git commit -m "feat(memory): add store factory with env-driven provider selection"
```

---

## Chunk 2: Commitments + Managers

### Task 6: Commitments Module

**Files:**
- Create: `offchain/packages/engine/src/memory/commitments.ts`
- Test: `offchain/packages/engine/src/memory/__tests__/commitments.test.ts`

- [ ] **Step 1: Write failing tests for hash computation and chain verification**

```typescript
// offchain/packages/engine/src/memory/__tests__/commitments.test.ts
import { computeMemoryHash, buildHashPreimage, verifyChainIntegrity } from '../commitments';
import { InMemoryMemoryStore } from '../store/in-memory';
import { canonicalSha256Hex } from '../../crypto/hash';
import type { IMemoryStore } from '../store/interface';

describe('Commitments', () => {
  describe('computeMemoryHash', () => {
    it('should compute SHA-256 of canonical JSON preimage for episodic type', () => {
      const hash = computeMemoryHash({
        type: 'episodic',
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        content: 'Hello world',
        session_id: 'sess-1',
        role: 'user',
        turn_index: 0,
        tokens: 5,
      });
      expect(hash).toMatch(/^[a-f0-9]{64}$/); // 64 hex chars = SHA-256
    });

    it('should produce different hashes for different content', () => {
      const base = {
        type: 'semantic' as const,
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        content: 'Fact A',
        fact: 'Fact A',
        confidence: 0.9,
        source_memory_ids: [],
      };
      const h1 = computeMemoryHash(base);
      const h2 = computeMemoryHash({ ...base, content: 'Fact B', fact: 'Fact B' });
      expect(h1).not.toBe(h2);
    });

    it('should produce deterministic hashes', () => {
      const input = {
        type: 'procedural' as const,
        agent_passport_id: 'a',
        namespace: 'agent:a',
        content: 'Rule',
        rule: 'Always greet',
        trigger: 'start',
        priority: 1,
        source_memory_ids: [],
      };
      expect(computeMemoryHash(input)).toBe(computeMemoryHash(input));
    });
  });

  describe('buildHashPreimage', () => {
    it('should include agent_passport_id, namespace, type + type-specific fields for episodic', () => {
      const preimage = buildHashPreimage({
        type: 'episodic',
        agent_passport_id: 'a',
        namespace: 'ns',
        content: 'Hello',
        session_id: 's1',
        role: 'user',
        turn_index: 0,
        tokens: 5,
        tool_calls: [{ tool_name: 'search', arguments: { q: 'test' } }],
      });
      expect(preimage).toHaveProperty('agent_passport_id', 'a');
      expect(preimage).toHaveProperty('namespace', 'ns');
      expect(preimage).toHaveProperty('type', 'episodic');
      expect(preimage).toHaveProperty('content', 'Hello');
      expect(preimage).toHaveProperty('session_id', 's1');
      expect(preimage).toHaveProperty('role', 'user');
      expect(preimage).toHaveProperty('turn_index', 0);
      expect(preimage).toHaveProperty('tokens', 5);
      expect(preimage).toHaveProperty('tool_calls');
      // Should NOT have metadata, status, embedding, etc.
      expect(preimage).not.toHaveProperty('metadata');
      expect(preimage).not.toHaveProperty('status');
    });

    it('should include fact, confidence, source_memory_ids, supersedes for semantic', () => {
      const preimage = buildHashPreimage({
        type: 'semantic',
        agent_passport_id: 'a',
        namespace: 'ns',
        content: 'Fact',
        fact: 'The sky is blue',
        confidence: 0.95,
        source_memory_ids: ['m1', 'm2'],
        supersedes: ['old-1'],
      });
      expect(preimage).toHaveProperty('fact', 'The sky is blue');
      expect(preimage).toHaveProperty('confidence', 0.95);
      expect(preimage).toHaveProperty('source_memory_ids', ['m1', 'm2']);
      expect(preimage).toHaveProperty('supersedes', ['old-1']);
    });
  });

  describe('verifyChainIntegrity', () => {
    let store: IMemoryStore;

    beforeEach(() => {
      store = new InMemoryMemoryStore();
    });

    it('should verify a valid chain of 3 entries', async () => {
      const h1 = computeMemoryHash({
        type: 'semantic', agent_passport_id: 'a', namespace: 'ns',
        content: 'F1', fact: 'F1', confidence: 1, source_memory_ids: [],
      });
      await store.write({
        agent_passport_id: 'a', type: 'semantic', namespace: 'ns',
        content: 'F1', metadata: {}, fact: 'F1', confidence: 1,
        source_memory_ids: [], content_hash: h1, prev_hash: null,
      });

      const h2 = computeMemoryHash({
        type: 'semantic', agent_passport_id: 'a', namespace: 'ns',
        content: 'F2', fact: 'F2', confidence: 0.9, source_memory_ids: [],
      });
      await store.write({
        agent_passport_id: 'a', type: 'semantic', namespace: 'ns',
        content: 'F2', metadata: {}, fact: 'F2', confidence: 0.9,
        source_memory_ids: [], content_hash: h2, prev_hash: h1,
      });

      const result = await verifyChainIntegrity(store, 'a', 'ns');
      expect(result.valid).toBe(true);
      expect(result.chain_length).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect tampered content', async () => {
      const h1 = computeMemoryHash({
        type: 'semantic', agent_passport_id: 'a', namespace: 'ns',
        content: 'Original', fact: 'Original', confidence: 1, source_memory_ids: [],
      });
      // Write with correct hash but wrong content (simulates tampering)
      await store.write({
        agent_passport_id: 'a', type: 'semantic', namespace: 'ns',
        content: 'Tampered', metadata: {}, fact: 'Tampered', confidence: 1,
        source_memory_ids: [], content_hash: h1, prev_hash: null,
      });

      const result = await verifyChainIntegrity(store, 'a', 'ns');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src/memory/__tests__/commitments.test.ts --no-coverage 2>&1 | tail -20`
Expected: FAIL — cannot find module `../commitments`

- [ ] **Step 3: Implement commitments.ts**

```typescript
// offchain/packages/engine/src/memory/commitments.ts
import { canonicalSha256Hex } from '../crypto/hash';
import { canonicalJson } from '../crypto/canonicalJson';
import type { IMemoryStore } from './store/interface';
import type { MemoryEntry, MemoryType, WritableMemoryEntry } from './types';

/**
 * Hash preimage fields per memory type.
 * All preimages include agent_passport_id, namespace, type.
 * See spec Section 5 "Hash preimage per memory type" table.
 */
const PREIMAGE_FIELDS: Record<MemoryType, string[]> = {
  episodic: ['content', 'session_id', 'role', 'turn_index', 'tokens', 'tool_calls'],
  semantic: ['content', 'fact', 'confidence', 'source_memory_ids', 'supersedes'],
  procedural: ['content', 'rule', 'trigger', 'priority', 'source_memory_ids'],
  entity: ['content', 'entity_name', 'entity_type', 'attributes', 'relationships'],
  trust_weighted: ['content', 'source_agent_passport_id', 'trust_score', 'decay_factor'],
  temporal: ['content', 'valid_from', 'valid_to', 'recorded_at'],
};

/**
 * Build the hash preimage object for a memory entry.
 * Only includes fields relevant to the memory type + base identity fields.
 */
export function buildHashPreimage(entry: Record<string, unknown> & { type: MemoryType; agent_passport_id: string; namespace: string }): Record<string, unknown> {
  const fields = PREIMAGE_FIELDS[entry.type];
  const preimage: Record<string, unknown> = {
    agent_passport_id: entry.agent_passport_id,
    namespace: entry.namespace,
    type: entry.type,
  };
  for (const field of fields) {
    if (entry[field] !== undefined) {
      preimage[field] = entry[field];
    }
  }
  return preimage;
}

/**
 * Compute the canonical SHA-256 hash of a memory entry.
 * Uses RFC 8785 canonical JSON — same canonicalJson() as receipt hashing.
 */
export function computeMemoryHash(entry: Record<string, unknown> & { type: MemoryType; agent_passport_id: string; namespace: string }): string {
  const preimage = buildHashPreimage(entry);
  return canonicalSha256Hex(preimage);
}

export interface ChainVerifyResult {
  valid: boolean;
  chain_length: number;
  errors: string[];
}

/**
 * Walk the hash chain for an agent+namespace, verifying each entry's
 * content_hash matches its content and prev_hash links correctly.
 */
export async function verifyChainIntegrity(
  store: IMemoryStore,
  agent_passport_id: string,
  namespace: string,
): Promise<ChainVerifyResult> {
  // Paginate through all entries for this chain, ordered by creation time
  const entries: MemoryEntry[] = [];
  let offset = 0;
  const PAGE_SIZE = 500;
  while (true) {
    const page = await store.query({
      agent_passport_id,
      namespace,
      status: ['active', 'superseded', 'archived', 'expired'],
      order_by: 'created_at',
      order_dir: 'asc',
      limit: PAGE_SIZE,
      offset,
    });
    entries.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const errors: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Verify content_hash matches actual content
    const recomputed = computeMemoryHash(entry as unknown as Record<string, unknown> & { type: MemoryType; agent_passport_id: string; namespace: string });
    if (recomputed !== entry.content_hash) {
      errors.push(`Entry ${entry.memory_id}: content_hash mismatch (stored=${entry.content_hash}, computed=${recomputed})`);
    }

    // Verify prev_hash chain
    if (i === 0) {
      if (entry.prev_hash !== null) {
        errors.push(`Entry ${entry.memory_id}: first entry should have null prev_hash, got ${entry.prev_hash}`);
      }
    } else {
      const expectedPrev = entries[i - 1].content_hash;
      if (entry.prev_hash !== expectedPrev) {
        errors.push(`Entry ${entry.memory_id}: prev_hash mismatch (stored=${entry.prev_hash}, expected=${expectedPrev})`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    chain_length: entries.length,
    errors,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src/memory/__tests__/commitments.test.ts --no-coverage 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/commitments.ts offchain/packages/engine/src/memory/__tests__/commitments.test.ts
git commit -m "feat(memory): add commitments module — hash computation and chain verification"
```

---

### Task 7: Managers (Episodic, Semantic, Procedural)

**Files:**
- Create: `offchain/packages/engine/src/memory/managers/episodic.ts`
- Create: `offchain/packages/engine/src/memory/managers/semantic.ts`
- Create: `offchain/packages/engine/src/memory/managers/procedural.ts`
- Create: `offchain/packages/engine/src/memory/managers/index.ts`
- Test: `offchain/packages/engine/src/memory/__tests__/managers.test.ts`

- [ ] **Step 1: Write failing tests for manager validation**

```typescript
// offchain/packages/engine/src/memory/__tests__/managers.test.ts
import { validateEpisodic } from '../managers/episodic';
import { validateSemantic } from '../managers/semantic';
import { validateProcedural } from '../managers/procedural';
import { getManager } from '../managers';

describe('Memory Managers', () => {
  describe('EpisodicManager', () => {
    it('should validate a valid episodic entry', () => {
      expect(() => validateEpisodic({
        type: 'episodic', agent_passport_id: 'a', namespace: 'ns',
        content: 'Hello', metadata: {}, session_id: 's1', role: 'user', tokens: 5,
      })).not.toThrow();
    });

    it('should reject missing session_id', () => {
      expect(() => validateEpisodic({
        type: 'episodic', agent_passport_id: 'a', namespace: 'ns',
        content: 'Hello', metadata: {}, role: 'user', tokens: 5,
      } as any)).toThrow(/session_id/);
    });

    it('should reject missing role', () => {
      expect(() => validateEpisodic({
        type: 'episodic', agent_passport_id: 'a', namespace: 'ns',
        content: 'Hello', metadata: {}, session_id: 's1', tokens: 5,
      } as any)).toThrow(/role/);
    });

    it('should reject invalid role', () => {
      expect(() => validateEpisodic({
        type: 'episodic', agent_passport_id: 'a', namespace: 'ns',
        content: 'Hello', metadata: {}, session_id: 's1', role: 'invalid', tokens: 5,
      } as any)).toThrow(/role/);
    });

    it('should reject content exceeding 100KB', () => {
      expect(() => validateEpisodic({
        type: 'episodic', agent_passport_id: 'a', namespace: 'ns',
        content: 'x'.repeat(100 * 1024 + 1), metadata: {},
        session_id: 's1', role: 'user', tokens: 5,
      })).toThrow(/content/i);
    });
  });

  describe('SemanticManager', () => {
    it('should validate a valid semantic entry', () => {
      expect(() => validateSemantic({
        type: 'semantic', agent_passport_id: 'a', namespace: 'ns',
        content: 'Fact', metadata: {}, fact: 'The sky is blue',
        confidence: 0.9, source_memory_ids: [],
      })).not.toThrow();
    });

    it('should reject confidence < 0', () => {
      expect(() => validateSemantic({
        type: 'semantic', agent_passport_id: 'a', namespace: 'ns',
        content: 'F', metadata: {}, fact: 'F', confidence: -0.1, source_memory_ids: [],
      })).toThrow(/confidence/);
    });

    it('should reject confidence > 1', () => {
      expect(() => validateSemantic({
        type: 'semantic', agent_passport_id: 'a', namespace: 'ns',
        content: 'F', metadata: {}, fact: 'F', confidence: 1.1, source_memory_ids: [],
      })).toThrow(/confidence/);
    });

    it('should reject missing fact', () => {
      expect(() => validateSemantic({
        type: 'semantic', agent_passport_id: 'a', namespace: 'ns',
        content: 'F', metadata: {}, confidence: 0.9, source_memory_ids: [],
      } as any)).toThrow(/fact/);
    });
  });

  describe('ProceduralManager', () => {
    it('should validate a valid procedural entry', () => {
      expect(() => validateProcedural({
        type: 'procedural', agent_passport_id: 'a', namespace: 'ns',
        content: 'Rule', metadata: {}, rule: 'Greet first',
        trigger: 'conversation_start', priority: 1, source_memory_ids: [],
      })).not.toThrow();
    });

    it('should reject negative priority', () => {
      expect(() => validateProcedural({
        type: 'procedural', agent_passport_id: 'a', namespace: 'ns',
        content: 'R', metadata: {}, rule: 'R', trigger: 't', priority: -1, source_memory_ids: [],
      })).toThrow(/priority/);
    });

    it('should reject missing rule', () => {
      expect(() => validateProcedural({
        type: 'procedural', agent_passport_id: 'a', namespace: 'ns',
        content: 'R', metadata: {}, trigger: 't', priority: 0, source_memory_ids: [],
      } as any)).toThrow(/rule/);
    });
  });

  describe('getManager', () => {
    it('should return the correct validator for each v1 type', () => {
      expect(getManager('episodic')).toBeDefined();
      expect(getManager('semantic')).toBeDefined();
      expect(getManager('procedural')).toBeDefined();
    });

    it('should throw for staged types (not yet implemented)', () => {
      expect(() => getManager('entity')).toThrow(/not yet/i);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src/memory/__tests__/managers.test.ts --no-coverage 2>&1 | tail -20`
Expected: FAIL

- [ ] **Step 3: Implement the three managers + index**

Each manager exports a `validate*()` function that:
1. Checks base fields: `agent_passport_id`, `namespace`, `content` (required, max 100KB)
2. Checks `metadata` max size (64KB JSON stringified)
3. Checks `_lucid_*` keys in metadata (reject)
4. Checks type-specific required fields per the validation rules table in the spec

`managers/episodic.ts`:
- Required: `session_id`, `role` (one of 4 values), `tokens` (>= 0)
- `turn_index` NOT required (auto-assigned by store)

`managers/semantic.ts`:
- Required: `fact`, `confidence` (in [0, 1]), `source_memory_ids` (array)

`managers/procedural.ts`:
- Required: `rule`, `trigger`, `source_memory_ids` (array)
- `priority` defaults to 0 if missing, must be >= 0

`managers/index.ts`:
```typescript
import { validateEpisodic } from './episodic';
import { validateSemantic } from './semantic';
import { validateProcedural } from './procedural';
import type { MemoryType } from '../types';

type ValidateFn = (entry: Record<string, unknown>) => void;

const VALIDATORS: Partial<Record<MemoryType, ValidateFn>> = {
  episodic: validateEpisodic,
  semantic: validateSemantic,
  procedural: validateProcedural,
};

export function getManager(type: MemoryType): ValidateFn {
  const validator = VALIDATORS[type];
  if (!validator) throw new Error(`Manager for type '${type}' is not yet implemented (staged)`);
  return validator;
}

export { validateEpisodic } from './episodic';
export { validateSemantic } from './semantic';
export { validateProcedural } from './procedural';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src/memory/__tests__/managers.test.ts --no-coverage 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/managers/
git add offchain/packages/engine/src/memory/__tests__/managers.test.ts
git commit -m "feat(memory): add episodic, semantic, procedural managers with validation"
```

---

### Task 8: ACL Module

**Files:**
- Create: `offchain/packages/engine/src/memory/acl.ts`
- Test: `offchain/packages/engine/src/memory/__tests__/acl.test.ts`

- [ ] **Step 1: Write failing tests for ACL**

```typescript
// offchain/packages/engine/src/memory/__tests__/acl.test.ts
import { MemoryACLEngine } from '../acl';

describe('MemoryACLEngine', () => {
  let acl: MemoryACLEngine;

  beforeEach(() => {
    acl = new MemoryACLEngine();
  });

  describe('assertReadPermission', () => {
    it('should allow agent to read its own namespace', () => {
      expect(() => acl.assertReadPermission('agent-1', 'agent:agent-1')).not.toThrow();
    });

    it('should allow agent to read its own scoped namespace', () => {
      expect(() => acl.assertReadPermission('agent-1', 'agent:agent-1/user:u1')).not.toThrow();
    });

    it('should reject agent reading another agents namespace', () => {
      expect(() => acl.assertReadPermission('agent-1', 'agent:agent-2')).toThrow(/permission/i);
    });

    it('should allow admin to read any namespace', () => {
      expect(() => acl.assertReadPermission('__admin__', 'agent:agent-2')).not.toThrow();
    });
  });

  describe('assertWritePermission', () => {
    it('should allow agent to write its own namespace', () => {
      expect(() => acl.assertWritePermission('agent-1', 'agent:agent-1')).not.toThrow();
    });

    it('should reject agent writing another agents namespace', () => {
      expect(() => acl.assertWritePermission('agent-1', 'agent:agent-2')).toThrow(/permission/i);
    });
  });

  describe('grantAccess + revokeAccess', () => {
    it('should grant read access to another agent', async () => {
      await acl.grantAccess('agent-1', 'agent-2', 'agent:agent-1', 'read');
      expect(() => acl.assertReadPermission('agent-2', 'agent:agent-1')).not.toThrow();
      expect(() => acl.assertWritePermission('agent-2', 'agent:agent-1')).toThrow();
    });

    it('should grant write access (implies read)', async () => {
      await acl.grantAccess('agent-1', 'agent-2', 'agent:agent-1', 'write');
      expect(() => acl.assertReadPermission('agent-2', 'agent:agent-1')).not.toThrow();
      expect(() => acl.assertWritePermission('agent-2', 'agent:agent-1')).not.toThrow();
    });

    it('should revoke access', async () => {
      await acl.grantAccess('agent-1', 'agent-2', 'agent:agent-1', 'read');
      await acl.revokeAccess('agent-1', 'agent-2', 'agent:agent-1');
      expect(() => acl.assertReadPermission('agent-2', 'agent:agent-1')).toThrow();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src/memory/__tests__/acl.test.ts --no-coverage 2>&1 | tail -20`
Expected: FAIL

- [ ] **Step 3: Implement acl.ts**

The ACL engine:
- `__admin__` passport ID bypasses all checks
- Agent owns any namespace starting with `agent:{self}` (prefix match)
- `grantAccess` validates the `owner` actually owns the target namespace before granting
- Grants stored in an in-memory `Map<string, PermissionLevel>` keyed by `${grantee}::${namespace}`
- `write` permission implies `read`
- Throws `Error('Insufficient permission: ...')` on denial

**Note:** `IMemoryStore.softDelete()` sets `status='archived'` and writes a provenance record with `operation='archive'` (not `'delete'` — there is no delete operation in the provenance schema).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src/memory/__tests__/acl.test.ts --no-coverage 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/acl.ts offchain/packages/engine/src/memory/__tests__/acl.test.ts
git commit -m "feat(memory): add ACL module with namespace permission enforcement"
```

---

## Chunk 3: MemoryService + Receipt Integration

### Task 9: Extend ReceiptType with 'memory'

**Files:**
- Modify: `offchain/packages/engine/src/receipt/receiptService.ts`
- Modify: `offchain/packages/engine/src/receipt/index.ts`

**IMPORTANT:** Follow the existing receipt creation pattern exactly. All receipt types use `createReceiptGeneric<TBody, TReceipt>()`. Field names: `receipt_signature` (not `signature`). Timestamps: `Math.floor(Date.now() / 1000)` (Unix seconds, matching all existing receipts).

- [ ] **Step 1: Add 'memory' to ReceiptType union**

In `receiptService.ts`, find the `ReceiptType` union and add `'memory'`:

```typescript
export type ReceiptType = 'inference' | 'compute' | 'tool' | 'agent' | 'dataset' | 'memory';
```

- [ ] **Step 2: Add MemoryReceiptBody, BatchedEpisodicReceiptBody, and MemoryReceipt types**

In `receiptService.ts`, add near the other receipt body types (after `DatasetReceiptBody`):

```typescript
export interface MemoryReceiptBody {
  schema_version: '1.0';
  run_id: string;
  timestamp: number;           // Unix seconds (matches all other receipt types)
  agent_passport_id: string;
  memory_id: string;
  memory_type: string;         // 'episodic' | 'semantic' | 'procedural' | ...
  content_hash: string;
  prev_hash: string | null;
  namespace: string;
}

export interface BatchedEpisodicReceiptBody {
  schema_version: '1.0';
  run_id: string;
  timestamp: number;           // Unix seconds
  agent_passport_id: string;
  session_id: string;
  entry_hashes: string[];      // content_hash of each episodic entry in batch
  entry_count: number;
  namespace: string;
}

export interface MemoryReceipt {
  receipt_type: 'memory';
  run_id: string;
  receipt_hash: string;
  receipt_signature: string;   // matches existing field name convention
  signer_pubkey: string;
  signer_type: SignerType;
  body: MemoryReceiptBody | BatchedEpisodicReceiptBody;
  _mmr_leaf_index?: number;
}
```

- [ ] **Step 3: Add MemoryReceipt to Receipt union and bodyExtractors**

Find the `Receipt` type union and add `MemoryReceipt`:
```typescript
export type Receipt = InferenceReceipt | ComputeReceipt | ToolReceipt | AgentReceipt | DatasetReceipt | MemoryReceipt;
```

Add `memory` to `bodyExtractors`:
```typescript
function extractMemoryReceiptBody(input: any): MemoryReceiptBody {
  return {
    schema_version: '1.0',
    run_id: input.run_id,
    timestamp: input.timestamp || Math.floor(Date.now() / 1000),
    agent_passport_id: input.agent_passport_id,
    memory_id: input.memory_id,
    memory_type: input.memory_type,
    content_hash: input.content_hash,
    prev_hash: input.prev_hash ?? null,
    namespace: input.namespace,
  };
}

// Add to bodyExtractors map:
memory: extractMemoryReceiptBody,
```

Add `'memory'` case to `createReceipt()` switch:
```typescript
case 'memory':
  return createMemoryReceipt(body as any);
```

- [ ] **Step 4: Implement createMemoryReceipt and createBatchedEpisodicReceipt**

```typescript
export function createMemoryReceipt(input: {
  agent_passport_id: string;
  memory_id: string;
  memory_type: string;
  content_hash: string;
  prev_hash: string | null;
  namespace: string;
  run_id?: string;
}): MemoryReceipt {
  const run_id = input.run_id || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const body: MemoryReceiptBody = {
    schema_version: '1.0',
    run_id,
    timestamp: Math.floor(Date.now() / 1000),  // Unix seconds — matches all other receipt types
    agent_passport_id: input.agent_passport_id,
    memory_id: input.memory_id,
    memory_type: input.memory_type,
    content_hash: input.content_hash,
    prev_hash: input.prev_hash,
    namespace: input.namespace,
  };
  return createReceiptGeneric<MemoryReceiptBody, MemoryReceipt>('memory', body);
}

export function createBatchedEpisodicReceipt(input: {
  agent_passport_id: string;
  session_id: string;
  entry_hashes: string[];
  namespace: string;
  run_id?: string;
}): MemoryReceipt {
  const run_id = input.run_id || `mem_batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const body: BatchedEpisodicReceiptBody = {
    schema_version: '1.0',
    run_id,
    timestamp: Math.floor(Date.now() / 1000),
    agent_passport_id: input.agent_passport_id,
    session_id: input.session_id,
    entry_hashes: input.entry_hashes,
    entry_count: input.entry_hashes.length,
    namespace: input.namespace,
  };
  return createReceiptGeneric<BatchedEpisodicReceiptBody, MemoryReceipt>('memory', body as any);
}
```

This uses `createReceiptGeneric` which handles: hash computation, Ed25519 signing, MMR append, in-memory store, and non-blocking DB persist — all in one call, matching tool/agent/dataset receipt patterns exactly.

- [ ] **Step 5: Export from receipt barrel**

In `offchain/packages/engine/src/receipt/index.ts`, add:

```typescript
export { createMemoryReceipt, createBatchedEpisodicReceipt } from './receiptService';
export type { MemoryReceiptBody, BatchedEpisodicReceiptBody, MemoryReceipt } from './receiptService';
```

- [ ] **Step 6: Run existing receipt tests to ensure no regression**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src --testPathPattern='receipt' --no-coverage 2>&1 | tail -20`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add offchain/packages/engine/src/receipt/receiptService.ts offchain/packages/engine/src/receipt/index.ts
git commit -m "feat(receipt): add 'memory' receipt type with per-write and batched episodic receipts"
```

---

### Task 10: MemoryService Orchestrator

**Files:**
- Create: `offchain/packages/engine/src/memory/service.ts`
- Test: `offchain/packages/engine/src/memory/__tests__/service.test.ts`

- [ ] **Step 1: Write failing tests for MemoryService write pipeline**

```typescript
// offchain/packages/engine/src/memory/__tests__/service.test.ts
import { MemoryService } from '../service';
import { InMemoryMemoryStore } from '../store/in-memory';
import { MemoryACLEngine } from '../acl';
import type { MemoryServiceConfig } from '../types';

// Mock receipt creation
jest.mock('../../receipt/receiptService', () => ({
  createMemoryReceipt: jest.fn().mockReturnValue({
    receipt_type: 'memory',
    run_id: 'mock-run',
    receipt_hash: 'mock-receipt-hash',
    receipt_signature: 'mock-sig',
    signer_pubkey: 'mock-pub',
    signer_type: 'orchestrator',
    body: {},
    _mmr_leaf_index: 0,
  }),
  createBatchedEpisodicReceipt: jest.fn().mockReturnValue({
    receipt_type: 'memory',
    run_id: 'mock-batch-run',
    receipt_hash: 'mock-batch-hash',
    receipt_signature: 'mock-sig',
    signer_pubkey: 'mock-pub',
    signer_type: 'orchestrator',
    body: {},
    _mmr_leaf_index: 1,
  }),
}));

const testConfig: MemoryServiceConfig = {
  extraction_enabled: false,
  extraction_batch_size: 5,
  extraction_debounce_ms: 2000,
  trigger_on_session_close: false,
  embedding_enabled: false,
  embedding_model: 'text-embedding-3-small',
  provenance_enabled: true,
  receipts_enabled: false, // Disable receipts for unit tests
  max_episodic_window: 50,
  max_semantic_per_agent: 1000,
  compaction_idle_timeout_ms: 1800000,
};

describe('MemoryService', () => {
  let service: MemoryService;
  let store: InMemoryMemoryStore;

  beforeEach(() => {
    store = new InMemoryMemoryStore();
    const acl = new MemoryACLEngine();
    service = new MemoryService(store, acl, testConfig);
  });

  describe('addEpisodic', () => {
    it('should write an episodic entry with auto-assigned turn_index', async () => {
      const sessionId = await service.startSession('agent-1', 'agent:agent-1');
      const result = await service.addEpisodic('agent-1', {
        session_id: sessionId,
        namespace: 'agent:agent-1',
        role: 'user',
        content: 'Hello',
        tokens: 5,
      });
      expect(result.memory_id).toBeDefined();
      expect(result.content_hash).toMatch(/^[a-f0-9]{64}$/);

      const entry = await store.read(result.memory_id);
      expect(entry).not.toBeNull();
      expect(entry!.type).toBe('episodic');
    });

    it('should auto-increment turn_index per session', async () => {
      const sessionId = await service.startSession('agent-1', 'agent:agent-1');
      await service.addEpisodic('agent-1', {
        session_id: sessionId, namespace: 'agent:agent-1',
        role: 'user', content: 'Turn 1', tokens: 5,
      });
      await service.addEpisodic('agent-1', {
        session_id: sessionId, namespace: 'agent:agent-1',
        role: 'assistant', content: 'Turn 2', tokens: 10,
      });

      const entries = await store.query({
        agent_passport_id: 'agent-1',
        session_id: sessionId,
        types: ['episodic'],
        order_by: 'turn_index',
        order_dir: 'asc',
      });
      expect(entries).toHaveLength(2);
      expect((entries[0] as any).turn_index).toBe(0);
      expect((entries[1] as any).turn_index).toBe(1);
    });
  });

  describe('addSemantic', () => {
    it('should write a semantic entry with provenance', async () => {
      const result = await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1',
        content: 'The sky is blue',
        fact: 'The sky is blue',
        confidence: 0.95,
        source_memory_ids: [],
      });
      expect(result.memory_id).toBeDefined();

      // Verify provenance was written
      const provenance = await store.getProvenanceForMemory(result.memory_id);
      expect(provenance).toHaveLength(1);
      expect(provenance[0].operation).toBe('create');
    });
  });

  describe('addProcedural', () => {
    it('should write a procedural entry', async () => {
      const result = await service.addProcedural('agent-1', {
        namespace: 'agent:agent-1',
        content: 'Always greet first',
        rule: 'Always greet first',
        trigger: 'conversation_start',
        priority: 1,
        source_memory_ids: [],
      });
      expect(result.memory_id).toBeDefined();
    });
  });

  describe('hash chain', () => {
    it('should link entries via prev_hash', async () => {
      const r1 = await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1', content: 'Fact 1',
        fact: 'F1', confidence: 1, source_memory_ids: [],
      });
      const r2 = await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1', content: 'Fact 2',
        fact: 'F2', confidence: 0.9, source_memory_ids: [],
      });

      expect(r1.prev_hash).toBeNull();
      expect(r2.prev_hash).toBe(r1.content_hash);
    });
  });

  describe('verifyChainIntegrity', () => {
    it('should verify a valid chain', async () => {
      await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1', content: 'F1',
        fact: 'F1', confidence: 1, source_memory_ids: [],
      });
      await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1', content: 'F2',
        fact: 'F2', confidence: 0.9, source_memory_ids: [],
      });
      const result = await service.verifyChainIntegrity('agent-1', 'agent:agent-1');
      expect(result.valid).toBe(true);
      expect(result.chain_length).toBe(2);
    });
  });

  describe('ACL enforcement', () => {
    it('should reject writes to another agents namespace', async () => {
      await expect(service.addSemantic('agent-1', {
        namespace: 'agent:agent-2', content: 'Sneaky',
        fact: 'S', confidence: 1, source_memory_ids: [],
      })).rejects.toThrow(/permission/i);
    });
  });

  describe('sessions', () => {
    it('should start and close a session', async () => {
      const sessionId = await service.startSession('agent-1', 'agent:agent-1');
      expect(sessionId).toBeDefined();

      await service.closeSession('agent-1', sessionId, 'Summary');
      const session = await store.getSession(sessionId);
      expect(session!.status).toBe('closed');
      expect(session!.summary).toBe('Summary');
    });
  });

  describe('recall', () => {
    it('should return matching entries ordered by recency', async () => {
      await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1', content: 'ETH balance is 5.0',
        fact: 'ETH balance is 5.0', confidence: 0.9, source_memory_ids: [],
      });
      await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1', content: 'User prefers dark mode',
        fact: 'User prefers dark mode', confidence: 0.8, source_memory_ids: [],
      });

      // Without embedding search (embedding_enabled=false), recall falls back to query
      const response = await service.recall('agent-1', {
        query: 'ETH',
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        types: ['semantic'],
      });
      expect(response.memories.length).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('should return stats for an agent', async () => {
      await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1', content: 'F',
        fact: 'F', confidence: 1, source_memory_ids: [],
      });
      const stats = await service.getStats('agent-1');
      expect(stats.total_entries).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src/memory/__tests__/service.test.ts --no-coverage 2>&1 | tail -20`
Expected: FAIL — cannot find module `../service`

- [ ] **Step 3: Implement MemoryService**

Create `offchain/packages/engine/src/memory/service.ts`:

The `MemoryService` class implements the 10-step write pipeline from spec Section 5:

```typescript
class MemoryService {
  constructor(
    private store: IMemoryStore,
    private acl: MemoryACLEngine,
    private config: MemoryServiceConfig,
  ) {}

  async addEpisodic(callerPassportId: string, input: { session_id, namespace, role, content, tokens, metadata?, tool_calls? }): Promise<MemoryWriteResult>
  async addSemantic(callerPassportId: string, input: { namespace, content, fact, confidence, source_memory_ids, supersedes?, metadata? }): Promise<MemoryWriteResult>
  async addProcedural(callerPassportId: string, input: { namespace, content, rule, trigger, priority?, source_memory_ids, metadata? }): Promise<MemoryWriteResult>
  async startSession(callerPassportId: string, namespace: string): Promise<string>
  async closeSession(callerPassportId: string, sessionId: string, summary?: string): Promise<void>
  async recall(callerPassportId: string, request: RecallRequest): Promise<RecallResponse>
  async verifyChainIntegrity(agentPassportId: string, namespace: string): Promise<ChainVerifyResult>
  async getStats(agentPassportId: string): Promise<MemoryStats>
}
```

**Generic write pipeline** (`addSemantic`, `addProcedural`):
1. ACL check — `this.acl.assertWritePermission(callerPassportId, namespace)`
2. Manager validation — `getManager(type)(entry)`
3. Hash computation — `computeMemoryHash(entry)`
4. Prev_hash lookup — `this.store.getLatestHash(agent_passport_id, namespace)`
5. Store write — `this.store.write({ ...entry, content_hash, prev_hash })`
6. Provenance — `this.store.writeProvenance({ operation: 'create', ... })`
7. Receipt — `createMemoryReceipt(...)` (if `config.receipts_enabled`)

**Episodic write pipeline** (`addEpisodic` — turn_index assigned before hash, see Pre-flight):
1. ACL check
2. Manager validation (session_id, role, tokens — NOT turn_index)
3. **Assign turn_index** — query `MAX(turn_index)` for session, +1 (or 0)
4. **Build full payload** — merge turn_index into entry
5. Hash computation — `computeMemoryHash(entry)` (includes turn_index in preimage)
6. Prev_hash lookup — `this.store.getLatestHash(agent_passport_id, namespace)`
7. Store write — `this.store.write({ ...entry, content_hash, prev_hash })`
8. Provenance — `this.store.writeProvenance({ operation: 'create', ... })`
9. Session stats — `this.store.updateSessionStats(session_id, 1, tokens)`
10. **Batched receipt check** — if `turn_index - session.last_receipted_turn_index >= config.extraction_batch_size`, emit batched episodic receipt and advance watermark

Steps 3-8 run inside a single transaction (SERIALIZABLE in Postgres, sequential in-memory).

`recall()` without embeddings falls back to `store.query()` with all entries scored 1.0. When `embedding_enabled`, it would compute query embedding and do cosine similarity — this is a stub for now.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src/memory/__tests__/service.test.ts --no-coverage 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/service.ts offchain/packages/engine/src/memory/__tests__/service.test.ts
git commit -m "feat(memory): add MemoryService orchestrator with full write pipeline"
```

---

### Task 11: Query Module

**Files:**
- Create: `offchain/packages/engine/src/memory/query/retrieval.ts`
- Create: `offchain/packages/engine/src/memory/query/ranking.ts`
- Create: `offchain/packages/engine/src/memory/query/filters.ts`
- Create: `offchain/packages/engine/src/memory/query/index.ts`
- Test: `offchain/packages/engine/src/memory/__tests__/query.test.ts`

- [ ] **Step 1: Write failing tests**

Test that:
- `buildQuery()` converts RecallRequest into MemoryQuery
- `rankByRecency()` scores entries with newer = higher score
- `applyContentFilter()` does basic text match when embeddings unavailable
- `combinedScore()` blends recency and relevance

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src/memory/__tests__/query.test.ts --no-coverage 2>&1 | tail -20`
Expected: FAIL

- [ ] **Step 3: Implement query modules**

`retrieval.ts` — converts RecallRequest to MemoryQuery, dispatches to store
`ranking.ts` — `rankByRecency(entries, now)` returns scored entries, `combinedScore(recency, relevance, trust?)` blends
`filters.ts` — `applyContentFilter(entries, query)` does case-insensitive substring match as fallback when no embeddings
`index.ts` — barrel re-exports

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src/memory/__tests__/query.test.ts --no-coverage 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/query/
git add offchain/packages/engine/src/memory/__tests__/query.test.ts
git commit -m "feat(memory): add query module — retrieval, ranking, content filtering"
```

---

## Chunk 4: Extraction + Archive Pipeline

### Task 12: Extraction Pipeline

**Files:**
- Create: `offchain/packages/engine/src/memory/extraction.ts`
- Test: `offchain/packages/engine/src/memory/__tests__/extraction.test.ts`

- [ ] **Step 1: Write failing tests**

Test that:
- `extractFromEpisodic()` calls LLM with conversation context and returns semantic + procedural entries
- Per-session lock prevents overlapping extractions
- Debounce prevents rapid re-extraction
- Idempotency key prevents duplicate processing
- Supersession detection: if extraction finds a fact that conflicts with an existing semantic, it marks the old one as superseded

Mock the LLM call — the test should verify the extraction prompt includes recent episodic entries and existing semantic facts.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement extraction.ts**

```typescript
export class ExtractionPipeline {
  private locks = new Map<string, boolean>();
  private lastRun = new Map<string, number>();
  private processedKeys = new Set<string>(); // idempotency

  constructor(
    private service: MemoryService,  // injected (not imported — avoids circular)
    private store: IMemoryStore,
    private config: MemoryServiceConfig,
  ) {}

  /** Called after episodic writes. Checks batch size threshold + debounce. */
  async maybeExtract(session_id: string, agent_passport_id: string, namespace: string): Promise<void>

  /** Called from MemoryService.closeSession() when config.trigger_on_session_close is true. */
  async extractOnSessionClose(session_id: string, agent_passport_id: string, namespace: string): Promise<void>

  private async runExtraction(session_id: string, agent_passport_id: string, namespace: string): Promise<void> {
    // 1. Load recent episodic entries (up to config.max_episodic_window, default 50)
    // 2. Load existing semantic facts for this agent + namespace
    // 3. Prompt LLM for new/updated facts and rules
    // 4. Dedup: content-hash match first; embedding similarity when available
    // 5. Detect supersession (new fact → mark old as superseded)
    // 6. Write new semantic + procedural entries via service (same provenance pipeline)
  }

  private async callLLM(prompt: string): Promise<{
    facts: { fact: string; confidence: number }[];
    rules: { rule: string; trigger: string; priority: number }[];
  }>
}
```

The LLM call uses `config.extraction_model` with `fetch()` to the chat completions endpoint. For v1, a simple JSON extraction prompt. Initial dedup falls back to content-hash matching when embeddings are not yet available (embeddings are computed async after write).

**Integration with MemoryService:** The service calls `extractionPipeline.maybeExtract()` at step 10 of the write pipeline (episodic only), and `extractionPipeline.extractOnSessionClose()` from `closeSession()` when `config.trigger_on_session_close` is true.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/extraction.ts offchain/packages/engine/src/memory/__tests__/extraction.test.ts
git commit -m "feat(memory): add LLM extraction pipeline with debounce, lock, idempotency"
```

---

### Task 13: Archive Pipeline + .lmf

**Files:**
- Create: `offchain/packages/engine/src/memory/archivePipeline.ts`
- Test: `offchain/packages/engine/src/memory/__tests__/archivePipeline.test.ts`

- [ ] **Step 1: Write failing tests**

Test that:
- `createSnapshot()` serializes active entries + provenance + sessions into LucidMemoryFile, computes MMR root over entry hashes, signs with Ed25519, uploads to DePIN, returns CID
- `restoreSnapshot()` downloads .lmf, verifies signature, verifies MMR root, verifies chain integrity, writes to store with specified RestoreMode
- `replace` mode drops existing entries before import
- `merge` mode skips entries with matching content_hash
- `fork` mode imports with a different namespace prefix

Mock DePIN upload/download.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement archivePipeline.ts**

```typescript
export class ArchivePipeline {
  constructor(
    private store: IMemoryStore,
    private depinStorage: IDepinStorage,  // from engine/src/storage/depin
    private getPassportPubkey: (passportId: string) => Promise<string | null>,  // for .lmf signature verification
  ) {}

  async createSnapshot(
    agent_passport_id: string,
    snapshot_type: 'checkpoint' | 'migration' | 'archive',
  ): Promise<{ cid: string; snapshot_id: string }>

  async restoreSnapshot(
    agent_passport_id: string,
    request: RestoreRequest,
  ): Promise<RestoreResult>

  static serializeLMF(
    entries: MemoryEntry[],
    provenance: ProvenanceRecord[],
    sessions: MemorySession[],
    agent_passport_id: string,
  ): Omit<LucidMemoryFile, 'signature' | 'signer_pubkey'>

  static verifyLMF(lmf: LucidMemoryFile): { valid: boolean; errors: string[] }
}
```

Uses `signMessage()` from `crypto/signing.ts` and `MMR` from `crypto/mmr.ts` for content MMR root computation (separate MMR instance, not the receipt MMR).

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/archivePipeline.ts offchain/packages/engine/src/memory/__tests__/archivePipeline.test.ts
git commit -m "feat(memory): add archive pipeline with .lmf serialize, sign, verify, restore"
```

---

### Task 14: Memory Barrel + Engine Barrel Export

**Files:**
- Create: `offchain/packages/engine/src/memory/index.ts`
- Modify: `offchain/packages/engine/src/index.ts`

- [ ] **Step 1: Create memory barrel**

```typescript
// offchain/packages/engine/src/memory/index.ts
export type {
  MemoryType, MemoryStatus, MemoryEntry, EpisodicMemory, SemanticMemory,
  ProceduralMemory, EntityMemory, TrustWeightedMemory, TemporalMemory,
  ProvenanceRecord, MemorySession, MemorySnapshot, ToolCallRecord,
  WritableMemoryEntry, WritableEpisodicMemory, WritableSemanticMemory, WritableProceduralMemory,
  RestoreMode, RestoreRequest, RestoreResult,
  RecallRequest, RecallResponse, MemoryServiceConfig,
  PermissionLevel, LucidMemoryFile,
} from './types';
// Note: MemoryReceiptBody, BatchedEpisodicReceiptBody, MemoryReceipt are exported
// from receipt/index.ts (single source of truth for all receipt types).
export { MEMORY_TYPES, MEMORY_STATUSES, MAX_CONTENT_SIZE, MAX_METADATA_SIZE, getDefaultConfig } from './types';
export { isEpisodicMemory, isSemanticMemory, isProceduralMemory } from './types';

export type { IMemoryStore, MemoryQuery, MemoryWriteResult, MemoryStats } from './store';
export { getMemoryStore, resetMemoryStore, InMemoryMemoryStore } from './store';

export { computeMemoryHash, buildHashPreimage, verifyChainIntegrity } from './commitments';
export type { ChainVerifyResult } from './commitments';

export { MemoryService } from './service';
export { MemoryACLEngine } from './acl';
export { ArchivePipeline } from './archivePipeline';
export { ExtractionPipeline } from './extraction';
export { getManager, validateEpisodic, validateSemantic, validateProcedural } from './managers';
```

- [ ] **Step 2: Add to engine barrel**

In `offchain/packages/engine/src/index.ts`, add near the end:

```typescript
// Memory
export * from './memory';
```

- [ ] **Step 3: Run type check**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx tsc --noEmit --project packages/engine/tsconfig.json 2>&1 | tail -20`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add offchain/packages/engine/src/memory/index.ts offchain/packages/engine/src/index.ts
git commit -m "feat(memory): add barrel exports and wire into engine package"
```

---

## Chunk 5: REST Routes + MCP + SDK

### Task 15: REST Memory Routes

**Files:**
- Create: `offchain/packages/gateway-lite/src/routes/core/memoryRoutes.ts`
- Modify: `offchain/packages/gateway-lite/src/routes/index.ts`
- Test: `offchain/packages/gateway-lite/src/routes/__tests__/memoryRoutes.test.ts`

- [ ] **Step 1: Write failing tests for key REST endpoints**

Test using supertest pattern matching receiptRoutes.test.ts:
- `POST /v1/memory/episodic` — 201 on valid input, 400 on missing session_id
- `POST /v1/memory/semantic` — 201 on valid input, 400 on confidence > 1
- `POST /v1/memory/recall` — 200 with memories array
- `GET /v1/memory/entries/:id` — 200 or 404
- `POST /v1/memory/sessions` — 201 with session_id
- `POST /v1/memory/sessions/:id/close` — 200
- `GET /v1/memory/stats/:agent_id` — 200 with stats
- `POST /v1/memory/verify` — 200 with chain integrity result

Mock `MemoryService` methods.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement memoryRoutes.ts**

Follow the Express router pattern from `receiptRoutes.ts`:
- `export const memoryRouter = Router()`
- Each endpoint: try/catch, validate required fields, call MemoryService, return `{ success, data }`
- The caller's `agent_passport_id` comes from `req.headers['x-agent-passport-id']` or admin key
- For admin requests, accept any namespace. For agent requests, auto-scope to agent's namespace.

All 18 routes from spec Section 6:
```
POST   /v1/memory/episodic
POST   /v1/memory/semantic
POST   /v1/memory/procedural
POST   /v1/memory/recall
GET    /v1/memory/entries/:id
GET    /v1/memory/entries
POST   /v1/memory/sessions
POST   /v1/memory/sessions/:id/close
GET    /v1/memory/sessions/:id/context
GET    /v1/memory/sessions
GET    /v1/memory/provenance/:agent_id/:ns
GET    /v1/memory/provenance/entry/:id
POST   /v1/memory/verify
POST   /v1/memory/snapshots
POST   /v1/memory/snapshots/restore
GET    /v1/memory/snapshots
GET    /v1/memory/stats/:agent_id
POST   /v1/memory/compact
```

- [ ] **Step 4: Export from routes barrel and mount in lucidLayerRoutes.ts**

In `routes/index.ts` add: `export { memoryRouter } from './core/memoryRoutes';`

In `routes/core/lucidLayerRoutes.ts`, import and mount (memory routes are `/v1/*`, same as receipts and passports — NOT `/api/*`):
```typescript
import { memoryRouter } from './memoryRoutes';
lucidLayerRouter.use('/', memoryRouter);
```

- [ ] **Step 5: Run test to verify it passes**

- [ ] **Step 6: Commit**

```bash
git add offchain/packages/gateway-lite/src/routes/core/memoryRoutes.ts
git add offchain/packages/gateway-lite/src/routes/index.ts
git add offchain/packages/gateway-lite/src/routes/__tests__/memoryRoutes.test.ts
git commit -m "feat(memory): add REST routes for /v1/memory/* endpoints"
```

---

### Task 16: MCP Memory Tools

**Files:**
- Create: `offchain/packages/contrib/integrations/mcp-server/memoryTools.ts`
- Modify: `offchain/packages/contrib/integrations/mcp-server/mcpServer.ts`

- [ ] **Step 1: Implement memory MCP tools**

```typescript
// offchain/packages/contrib/integrations/mcp-server/memoryTools.ts
import { MemoryService } from '../../../engine/src/memory/service';
import { getMemoryStore } from '../../../engine/src/memory/store';
import { MemoryACLEngine } from '../../../engine/src/memory/acl';
import { getDefaultConfig } from '../../../engine/src/memory/types';

export const MEMORY_TOOLS = [
  {
    name: 'memory_add',
    description: 'Store a memory entry (episodic, semantic, or procedural)',
    parameters: {
      type: 'string (episodic|semantic|procedural)',
      agent_passport_id: 'string',
      namespace: 'string',
      content: 'string',
      // Type-specific fields passed in body
    },
  },
  {
    name: 'memory_recall',
    description: 'Retrieve relevant memories via semantic search + filters',
    parameters: {
      query: 'string',
      agent_passport_id: 'string',
      types: 'string[] (optional)',
      limit: 'number (optional, default 10)',
    },
  },
  {
    name: 'memory_session_start',
    description: 'Start a new conversation session',
    parameters: {
      agent_passport_id: 'string',
      namespace: 'string (optional)',
    },
  },
  {
    name: 'memory_session_context',
    description: 'Get recent conversation context for a session',
    parameters: {
      session_id: 'string',
      agent_passport_id: 'string',
      limit: 'number (optional, default 20)',
    },
  },
  {
    name: 'memory_verify',
    description: 'Verify memory chain integrity for an agent',
    parameters: {
      agent_passport_id: 'string',
      namespace: 'string',
    },
  },
  {
    name: 'memory_snapshot',
    description: 'Create a portable memory snapshot on DePIN storage',
    parameters: {
      agent_passport_id: 'string',
      snapshot_type: 'string (checkpoint|migration|archive)',
    },
  },
];

let cachedService: MemoryService | null = null;
function getOrCreateService(): MemoryService {
  if (!cachedService) {
    cachedService = new MemoryService(getMemoryStore(), new MemoryACLEngine(), getDefaultConfig());
  }
  return cachedService;
}

export async function executeMemoryTool(toolName: string, params: Record<string, any>): Promise<any> {
  const service = getOrCreateService();

  switch (toolName) {
    case 'memory_add': { /* dispatch to addEpisodic/addSemantic/addProcedural based on params.type */ }
    case 'memory_recall': { /* call service.recall() */ }
    case 'memory_session_start': { /* call service.startSession() */ }
    case 'memory_session_context': { /* call store.query() with session_id filter */ }
    case 'memory_verify': { /* call service.verifyChainIntegrity() */ }
    case 'memory_snapshot': { /* call archivePipeline.createSnapshot() */ }
    default: throw new Error(`Unknown memory tool: ${toolName}`);
  }
}
```

- [ ] **Step 2: Register in mcpServer.ts**

In `mcpServer.ts`, import `MEMORY_TOOLS` and add them to the `TOOLS` array. Add a handler case in the tool execution switch for memory tools that calls `executeMemoryTool()`.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/contrib/integrations/mcp-server/memoryTools.ts
git add offchain/packages/contrib/integrations/mcp-server/mcpServer.ts
git commit -m "feat(memory): add MCP memory tools (add, recall, session, verify, snapshot)"
```

---

### Task 17: SDK MemoryNamespace

**Files:**
- Create: `offchain/packages/sdk/src/memory.ts`
- Modify: `offchain/packages/sdk/src/lucid.ts`

- [ ] **Step 1: Implement MemoryNamespace**

```typescript
// offchain/packages/sdk/src/memory.ts
// Import from the published engine package (matching existing SDK pattern in lucid.ts)
import type {
  MemoryEntry, MemoryType, RecallResponse, MemorySession,
  MemoryStats, MemorySnapshot, ProvenanceRecord,
  MemoryWriteResult, MemoryQuery, ChainVerifyResult, RestoreResult,
} from '@lucid-l2/engine';

export interface MemoryNamespace {
  addEpisodic(input: { session_id: string; role: string; content: string; tokens: number; namespace?: string; metadata?: Record<string, unknown>; tool_calls?: any[] }): Promise<MemoryWriteResult>;
  addSemantic(input: { content: string; fact: string; confidence: number; source_memory_ids: string[]; namespace?: string; supersedes?: string[] }): Promise<MemoryWriteResult>;
  addProcedural(input: { content: string; rule: string; trigger: string; priority?: number; source_memory_ids: string[]; namespace?: string }): Promise<MemoryWriteResult>;

  recall(input: { query: string; types?: MemoryType[]; limit?: number; namespace?: string; min_similarity?: number }): Promise<RecallResponse>;
  get(memoryId: string): Promise<MemoryEntry | null>;
  query(q: Partial<MemoryQuery>): Promise<MemoryEntry[]>;

  startSession(input?: { namespace?: string }): Promise<string>;
  closeSession(sessionId: string, summary?: string): Promise<void>;
  getSessionContext(sessionId: string, limit?: number): Promise<MemoryEntry[]>;
  listSessions(status?: string[]): Promise<MemorySession[]>;

  verify(namespace?: string): Promise<ChainVerifyResult>;
  stats(): Promise<MemoryStats>;

  snapshot(type: 'checkpoint' | 'migration' | 'archive'): Promise<string>;  // returns CID
  restore(cid: string, options: { mode: 'replace' | 'merge' | 'fork'; target_namespace?: string }): Promise<RestoreResult>;
  listSnapshots(): Promise<MemorySnapshot[]>;

  provenance(namespace: string, limit?: number): Promise<ProvenanceRecord[]>;
}
```

Each method wraps the corresponding REST call to `/v1/memory/*` using the SDK's internal HTTP client with retry/timeout.

- [ ] **Step 2: Wire into Lucid class**

In `lucid.ts`, add:
```typescript
readonly memory: MemoryNamespace;
```
And in the constructor, build it using `_buildMemoryNamespace()`.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/sdk/src/memory.ts offchain/packages/sdk/src/lucid.ts
git commit -m "feat(memory): add SDK MemoryNamespace for lucid.memory.* methods"
```

---

## Chunk 6: PostgresMemoryStore + Integration

### Task 18: PostgresMemoryStore

**Files:**
- Create: `offchain/packages/engine/src/memory/store/postgres.ts`

- [ ] **Step 1: Implement PostgresMemoryStore**

Uses `pool` from `../../db/pool.ts`. Implements all `IMemoryStore` methods with parameterized SQL queries.

Key patterns:
- `write()` — `INSERT INTO memory_entries (...) VALUES ($1, ...)` with auto-UUID via `gen_random_uuid()`, timestamp conversion `to_timestamp($N / 1000.0)`, auto-assign turn_index via subquery `(SELECT COALESCE(MAX(turn_index), -1) + 1 FROM memory_entries WHERE session_id = $X AND type = 'episodic')`
- `query()` — dynamic WHERE clause builder, default `status = ANY($N)` with `['active']`
- `getLatestHash()` — `SELECT content_hash FROM memory_entries WHERE agent_passport_id = $1 AND namespace = $2 ORDER BY created_at DESC LIMIT 1 FOR UPDATE` (the `FOR UPDATE` implements the hash chain concurrency control from spec)
- `writeProvenance()` — `INSERT INTO memory_provenance (...) RETURNING record_id`
- `updateEmbedding()` — `UPDATE memory_entries SET embedding = $2, embedding_model = $3 WHERE memory_id = $1`
- Session methods — CRUD on `memory_sessions` table
- `getStats()` — aggregate query with `GROUP BY type, status`
- Timestamps: on read, `EXTRACT(EPOCH FROM created_at) * 1000` to get Unix ms

The store wraps steps 4-6 (getLatestHash + write + writeProvenance) in a `SERIALIZABLE` transaction with retry on serialization failure, as specified in the "Hash Chain Concurrency Control" section.

- [ ] **Step 2: Run type check**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx tsc --noEmit --project packages/engine/tsconfig.json 2>&1 | tail -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/memory/store/postgres.ts
git commit -m "feat(memory): add PostgresMemoryStore with SERIALIZABLE hash chain writes"
```

---

### Task 19: Update CLAUDE.md

**Files:**
- Modify: `Lucid-L2/CLAUDE.md`

- [ ] **Step 1: Add MemoryMap section to CLAUDE.md**

Add under "### Offchain (Two-Package Monorepo)":

```markdown
### MemoryMap (Agent Memory System)
Portable, provable agent memory in `engine/src/memory/`. Three layers:
- **Layer 1**: `IMemoryStore` (Postgres/in-memory) + type managers (episodic, semantic, procedural) + query engine
- **Layer 2**: `MemoryService` orchestrator + LLM extraction + SHA-256 hash chain + receipt linkage + ACL + archive pipeline
- **Layer 3**: REST `/v1/memory/*` routes + MCP tools + SDK `lucid.memory.*`

Memory types: episodic (conversation turns), semantic (extracted facts), procedural (learned rules). Staged: entity, trust_weighted, temporal.
Every write is hash-chained per `agent_passport_id + namespace`, linked to receipt MMR, and anchored on-chain.
Portable via `.lmf` (Lucid Memory File) — signed, hash-chained snapshots on DePIN storage.

Env: `MEMORY_ENABLED`, `MEMORY_STORE` (postgres|memory), `MEMORY_EXTRACTION_ENABLED`, `MEMORY_EMBEDDING_ENABLED`, `MEMORY_RECEIPTS_ENABLED`
```

- [ ] **Step 2: Commit**

```bash
git add Lucid-L2/CLAUDE.md
git commit -m "docs: add MemoryMap system to CLAUDE.md"
```

---

### Task 20: Run Full Test Suite

- [ ] **Step 1: Run all memory tests**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest packages/engine/src/memory/ --no-coverage 2>&1 | tail -30`
Expected: All tests pass (~150+ tests across 9 test files)

- [ ] **Step 2: Run existing test suite to verify no regressions**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npm test 2>&1 | tail -30`
Expected: All existing tests still pass (1290+ existing + ~150 new memory tests)

- [ ] **Step 3: Type check entire project**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npm run type-check 2>&1 | tail -20`
Expected: No type errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(memory): MemoryMap v1 complete — all tests passing"
```

---

## Summary

| Chunk | Tasks | Files Created | Tests Added (est.) |
|-------|-------|---------------|-------------------|
| 1: Types + Store | 1-5 | 5 | ~30 |
| 2: Commitments + Managers | 6-8 | 6 | ~45 |
| 3: Service + Receipts | 9-11 | 4 | ~45 |
| 4: Extraction + Archive | 12-14 | 4 | ~30 |
| 5: Routes + MCP + SDK | 15-17 | 4 | ~25 |
| 6: Postgres + Integration | 18-20 | 2 | ~0 (integration) |
| **Total** | **20** | **~25** | **~175** |

Each task follows TDD: failing test → verify fail → implement → verify pass → commit.
