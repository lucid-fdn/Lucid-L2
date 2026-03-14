# MemoryMap v3 Implementation Plan — Local Truth, Global Projection

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace centralized Postgres dependency with per-agent embedded SQLite store, add async embedding pipeline, memory event bus, outbox-based projection plane, and SDK v3 methods.

**Architecture:** Bottom-up: types + interface → SQLite store modules → embedding provider + worker → events + outbox → projection service → SDK + routes → E2E tests. Each layer tested before the next depends on it.

**Tech Stack:** TypeScript, Jest, better-sqlite3, sqlite-vec, Express, existing Lucid engine patterns.

**Spec:** `docs/superpowers/specs/2026-03-14-memorymap-v3-local-first-design.md`

**Baseline:** 12 memory test suites, 180 tests passing, 0 failures.

**Execution order:** Chunk 1 (types + SQLite) → Chunk 2 (embeddings) → Chunk 3 (events + projection) → Chunk 4 (SDK + routes) → Chunk 5 (E2E tests). Tests must be green at each chunk boundary.

**Hard rule:** Do not mix SQLite store and projection code in the same task. Foundation must be green before projection depends on it.

---

## File Structure

### Files to Create (16)
| File | Responsibility |
|------|---------------|
| `engine/src/memory/store/sqlite/db.ts` | Open DB, WAL pragmas, sqlite-vec extension load |
| `engine/src/memory/store/sqlite/schema.ts` | Schema V3 init + versioned migrations via `PRAGMA user_version` |
| `engine/src/memory/store/sqlite/rowMappers.ts` | SQLite row ↔ MemoryEntry/Session/Provenance/Snapshot conversion |
| `engine/src/memory/store/sqlite/queries.ts` | Dynamic SQL builders (query, vector search, outbox) |
| `engine/src/memory/store/sqlite/store.ts` | `SQLiteMemoryStore implements IMemoryStore` (all 26 methods) |
| `engine/src/memory/embedding/interface.ts` | `IEmbeddingProvider`, `EmbeddingResult` types |
| `engine/src/memory/embedding/openai.ts` | `OpenAIEmbeddingProvider` (text-embedding-3-small) |
| `engine/src/memory/embedding/mock.ts` | `MockEmbeddingProvider` (deterministic, for tests) |
| `engine/src/memory/embedding/worker.ts` | `EmbeddingWorker` (hybrid: event + polling) |
| `engine/src/memory/embedding/index.ts` | Factory `getEmbeddingProvider()` + barrel exports |
| `engine/src/memory/events/memoryEvents.ts` | Event types, singleton bus, `emitMemoryEvent()`, `resetMemoryEventBus()` |
| `engine/src/memory/projection/service.ts` | `MemoryProjectionService` (outbox-driven) |
| `engine/src/memory/projection/policies.ts` | `ProjectionPolicy`, `shouldProject()`, `getDefaultProjectionPolicy()` |
| `engine/src/memory/projection/sinks/interface.ts` | `IProjectionSink`, `ProjectableEntry` types |
| `engine/src/memory/projection/sinks/postgres.ts` | `PostgresSink` (UPSERT into Postgres memory_entries) |
| `engine/src/memory/projection/index.ts` | Barrel exports for projection module |

### Files to Modify (13)
| File | Changes |
|------|---------|
| `engine/src/memory/types.ts` | Add `embedding_status`, `embedding_attempts`, lifecycle timestamps to MemoryEntry; `MemoryStoreHealth`; limit config fields; `OutboxEvent` type |
| `engine/src/memory/store/interface.ts` | Add `MemoryStoreCapabilities`, `capabilities` property, `queryPendingEmbeddings()`, `markEmbeddingFailed()`, outbox methods, `embedding_status` to MemoryQuery |
| `engine/src/memory/store/in-memory.ts` | Implement new methods, declare capabilities, handle `embedding_status` query filter |
| `engine/src/memory/store/postgres.ts` | Implement new methods, declare capabilities, Postgres parity migration patch |
| `engine/src/memory/store/index.ts` | Add SQLite to factory (`MEMORY_STORE=sqlite`), lazy require |
| `engine/src/memory/service.ts` | Emit events on write/archive/delete, write outbox events, set `embedding_status` on write, self-healing limits |
| `engine/src/memory/compactionPipeline.ts` | Emit `memory.compacted` event |
| `engine/src/memory/archivePipeline.ts` | Emit `memory.snapshotted` event |
| `engine/src/memory/index.ts` | Barrel exports for embedding, events, projection, SQLite |
| `sdk/src/lucid.ts` | Add addEntity/addTrustWeighted/addTemporal/compact/exportMemoryFile/health to MemoryNamespace |
| `sdk/src/memory.ts` | Add HTTP methods for new endpoints |
| `sdk/tsup.config.ts` | Add `memory` entry |
| `sdk/package.json` | Add `./memory` export path with types |

### New Test Files (8)
| File | Expected Tests |
|------|---------------|
| `engine/src/memory/__tests__/sqliteStore.test.ts` | ~25 |
| `engine/src/memory/__tests__/embedding.test.ts` | ~10 |
| `engine/src/memory/__tests__/recall-e2e.test.ts` | ~5 |
| `engine/src/memory/__tests__/compaction-e2e.test.ts` | ~4 |
| `engine/src/memory/__tests__/snapshot-e2e.test.ts` | ~3 |
| `engine/src/memory/__tests__/projection.test.ts` | ~9 |
| `engine/src/memory/__tests__/events.test.ts` | ~4 |
| `sdk/src/__tests__/memory.test.ts` | ~6 |

---

## Chunk 1: Foundation — Types, Interface, SQLite Store

### Task 1: Type Definitions + Interface Extensions

**Files:**
- Modify: `offchain/packages/engine/src/memory/types.ts`
- Modify: `offchain/packages/engine/src/memory/store/interface.ts`

- [ ] **Step 1: Add embedding lifecycle fields to MemoryEntry**

In `types.ts`, add after `embedding_model?: string;` (line 24):

```typescript
  embedding_status: 'pending' | 'ready' | 'failed' | 'skipped';
  embedding_attempts: number;
  embedding_requested_at?: number;
  embedding_updated_at?: number;
  embedding_last_error?: string;
```

- [ ] **Step 2: Add OutboxEvent type**

In `types.ts`, add after `LucidMemoryFile` interface (after line 332):

```typescript
// ─── Outbox ──────────────────────────────────────────────────────────
export interface OutboxEvent {
  event_id: string;
  event_type: string;
  memory_id: string | null;
  agent_passport_id: string;
  namespace: string;
  payload_json: string;
  created_at: number;
  processed_at: number | null;
  retry_count: number;
  last_error: string | null;
}
```

- [ ] **Step 3: Add MemoryStoreHealth type**

In `types.ts`, add after `OutboxEvent`:

```typescript
// ─── Store Health ────────────────────────────────────────────────────
export interface MemoryStoreHealth {
  storeType: 'sqlite' | 'postgres' | 'memory';
  dbPath?: string;
  schemaVersion: number;
  walMode?: boolean;
  entryCount: number;
  vectorCount: number;
  pendingEmbeddings: number;
  failedEmbeddings: number;
  sizeMb?: number;
  capabilities: MemoryStoreCapabilities;
}
```

- [ ] **Step 4: Add memory limit config fields**

In `types.ts`, add to `MemoryServiceConfig` (after line 221):

```typescript
  max_memory_entries: number;
  max_memory_db_size_mb: number;
  max_vector_rows: number;
```

Update `getDefaultConfig()` to include defaults:

```typescript
  max_memory_entries: parseInt(process.env.MEMORY_MAX_ENTRIES || '100000', 10),
  max_memory_db_size_mb: parseInt(process.env.MEMORY_MAX_DB_SIZE_MB || '500', 10),
  max_vector_rows: parseInt(process.env.MEMORY_MAX_VECTOR_ROWS || '50000', 10),
```

- [ ] **Step 5: Add MemoryStoreCapabilities to interface.ts**

In `store/interface.ts`, add before `IMemoryStore`:

```typescript
export interface MemoryStoreCapabilities {
  persistent: boolean;
  vectorSearch: boolean;
  crossAgentQuery: boolean;
  transactions: boolean;
  localFirst: boolean;
}
```

- [ ] **Step 6: Add new methods to IMemoryStore**

In `store/interface.ts`, add to `IMemoryStore`:

```typescript
  readonly capabilities: MemoryStoreCapabilities;
  queryPendingEmbeddings(limit: number): Promise<MemoryEntry[]>;
  markEmbeddingFailed(memory_id: string): Promise<void>;
  writeOutboxEvent(event: Omit<OutboxEvent, 'event_id' | 'created_at' | 'processed_at' | 'retry_count' | 'last_error'>): Promise<string>;
  queryOutboxPending(limit: number): Promise<OutboxEvent[]>;
  markOutboxProcessed(event_id: string): Promise<void>;
  markOutboxError(event_id: string, error: string): Promise<void>;
  getHealth(): Promise<MemoryStoreHealth>;
```

Add `embedding_status` to `MemoryQuery`:

```typescript
  embedding_status?: ('pending' | 'ready' | 'failed' | 'skipped')[];
```

- [ ] **Step 7: Run type-check**

Run: `cd offchain && npm run type-check 2>&1 | grep -v 'node_modules/ox'`
Expected: New errors from InMemory/Postgres stores not implementing new methods (expected — fixed in later tasks).

- [ ] **Step 8: Commit**

```bash
git add offchain/packages/engine/src/memory/types.ts offchain/packages/engine/src/memory/store/interface.ts
git commit -m "feat(memory): v3 type foundations — embedding lifecycle, outbox, capabilities, health"
```

---

### Task 2: InMemoryMemoryStore — Implement New Methods

**Files:**
- Modify: `offchain/packages/engine/src/memory/store/in-memory.ts`

- [ ] **Step 1: Add capabilities property**

```typescript
readonly capabilities: MemoryStoreCapabilities = {
  persistent: false,
  vectorSearch: true,
  crossAgentQuery: true,
  transactions: false,
  localFirst: true,
};
```

- [ ] **Step 2: Add embedding_status defaults in write()**

In the `write()` method, add to the entry construction:

```typescript
embedding_status: (e as any).embedding_status || 'pending',
embedding_attempts: (e as any).embedding_attempts || 0,
embedding_requested_at: Date.now(),
```

- [ ] **Step 3: Add embedding_status filter to query()**

In the filter chain within `query()`, add:

```typescript
if (q.embedding_status?.length) {
  results = results.filter(e => q.embedding_status!.includes((e as any).embedding_status));
}
```

- [ ] **Step 4: Implement queryPendingEmbeddings()**

```typescript
async queryPendingEmbeddings(limit: number): Promise<MemoryEntry[]> {
  return Array.from(this.entries.values())
    .filter(e => (e as any).embedding_status === 'pending')
    .sort((a, b) => a.created_at - b.created_at)
    .slice(0, limit);
}
```

- [ ] **Step 5: Implement markEmbeddingFailed()**

```typescript
async markEmbeddingFailed(memory_id: string): Promise<void> {
  const entry = this.entries.get(memory_id);
  if (!entry) return;
  (entry as any).embedding_status = 'failed';
  (entry as any).embedding_attempts = ((entry as any).embedding_attempts || 0) + 1;
  (entry as any).embedding_updated_at = Date.now();
  (entry as any).embedding_last_error = 'Embedding generation failed';
  entry.updated_at = Date.now();
}
```

- [ ] **Step 6: Update updateEmbedding() to set status atomically**

```typescript
async updateEmbedding(memory_id: string, embedding: number[], model: string): Promise<void> {
  const entry = this.entries.get(memory_id);
  if (!entry) return;
  entry.embedding = embedding;
  entry.embedding_model = model;
  (entry as any).embedding_status = 'ready';
  (entry as any).embedding_updated_at = Date.now();
  entry.updated_at = Date.now();
}
```

- [ ] **Step 7: Implement outbox methods (in-memory array)**

```typescript
private outbox: OutboxEvent[] = [];

async writeOutboxEvent(event: Omit<OutboxEvent, 'event_id' | 'created_at' | 'processed_at' | 'retry_count' | 'last_error'>): Promise<string> {
  const id = crypto.randomUUID();
  this.outbox.push({
    ...event, event_id: id, created_at: Date.now(),
    processed_at: null, retry_count: 0, last_error: null,
  });
  return id;
}

async queryOutboxPending(limit: number): Promise<OutboxEvent[]> {
  return this.outbox
    .filter(e => e.processed_at === null)
    .sort((a, b) => a.created_at - b.created_at)
    .slice(0, limit);
}

async markOutboxProcessed(event_id: string): Promise<void> {
  const event = this.outbox.find(e => e.event_id === event_id);
  if (event) event.processed_at = Date.now();
}

async markOutboxError(event_id: string, error: string): Promise<void> {
  const event = this.outbox.find(e => e.event_id === event_id);
  if (event) { event.retry_count++; event.last_error = error; }
}
```

- [ ] **Step 8: Implement getHealth()**

```typescript
async getHealth(): Promise<MemoryStoreHealth> {
  const entries = Array.from(this.entries.values());
  return {
    storeType: 'memory',
    schemaVersion: 0,
    entryCount: entries.length,
    vectorCount: entries.filter(e => e.embedding?.length).length,
    pendingEmbeddings: entries.filter(e => (e as any).embedding_status === 'pending').length,
    failedEmbeddings: entries.filter(e => (e as any).embedding_status === 'failed').length,
    capabilities: this.capabilities,
  };
}
```

- [ ] **Step 9: Run existing tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/ --no-coverage`
Expected: 12 suites, 180 tests passing (existing tests should not break).

- [ ] **Step 10: Commit**

```bash
git add offchain/packages/engine/src/memory/store/in-memory.ts
git commit -m "feat(memory): InMemoryStore v3 — capabilities, embedding lifecycle, outbox, health"
```

---

### Task 3: Install SQLite Dependencies

**Files:**
- Modify: `offchain/package.json`

- [ ] **Step 1: Install packages**

```bash
cd offchain && npm install --save-optional better-sqlite3 sqlite-vec && npm install --save-dev @types/better-sqlite3
```

- [ ] **Step 2: Verify installation**

```bash
node -e "const db = require('better-sqlite3')(':memory:'); console.log('better-sqlite3 OK'); db.close()"
node -e "const sv = require('sqlite-vec'); console.log('sqlite-vec version:', sv.version ? sv.version : 'loaded')"
```

Expected: Both print OK/loaded without errors.

- [ ] **Step 3: Commit**

```bash
git add offchain/package.json offchain/package-lock.json
git commit -m "chore: add better-sqlite3 + sqlite-vec as optional dependencies"
```

---

### Task 4: SQLite DB + Schema Modules

**Files:**
- Create: `offchain/packages/engine/src/memory/store/sqlite/db.ts`
- Create: `offchain/packages/engine/src/memory/store/sqlite/schema.ts`

- [ ] **Step 1: Create db.ts**

Write `engine/src/memory/store/sqlite/db.ts` with `openMemoryDB()` function. Full code per spec Section 1.1 (`db.ts` block). Must set WAL mode, synchronous=NORMAL, foreign_keys=ON, load sqlite-vec.

- [ ] **Step 2: Create schema.ts**

Write `engine/src/memory/store/sqlite/schema.ts` with `initSchema()` and `migrateIfNeeded()`. CURRENT_SCHEMA_VERSION = 3. Full SQL from spec Section 1.3 including all tables: memory_entries, memory_vectors (vec0), memory_sessions, memory_provenance, memory_snapshots, memory_outbox. Include all indexes and CHECK constraints.

The `SCHEMA_V3` function must accept `dimensions` parameter (default 1536) for the vec0 table: `embedding FLOAT[${dimensions}]`.

- [ ] **Step 3: Write unit test for schema creation**

Create `engine/src/memory/__tests__/sqliteSchema.test.ts`:

```typescript
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { initSchema, migrateIfNeeded } from '../store/sqlite/schema';

describe('SQLite Schema', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    sqliteVec.load(db);
  });
  afterEach(() => db.close());

  test('initSchema creates all tables on fresh DB', () => {
    initSchema(db, 1536);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const names = tables.map((t: any) => t.name);
    expect(names).toContain('memory_entries');
    expect(names).toContain('memory_sessions');
    expect(names).toContain('memory_provenance');
    expect(names).toContain('memory_snapshots');
    expect(names).toContain('memory_outbox');
  });

  test('initSchema sets user_version to 3', () => {
    initSchema(db, 1536);
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(3);
  });

  test('migrateIfNeeded is idempotent on current version', () => {
    initSchema(db, 1536);
    migrateIfNeeded(db); // should not throw
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(3);
  });

  test('WAL mode can be set', () => {
    db.pragma('journal_mode = WAL');
    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
  });
});
```

- [ ] **Step 4: Run schema tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/sqliteSchema.test.ts --no-coverage`
Expected: 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/store/sqlite/db.ts offchain/packages/engine/src/memory/store/sqlite/schema.ts offchain/packages/engine/src/memory/__tests__/sqliteSchema.test.ts
git commit -m "feat(memory): SQLite db.ts + schema.ts — WAL mode, V3 schema, migrations"
```

---

### Task 5: SQLite Row Mappers

**Files:**
- Create: `offchain/packages/engine/src/memory/store/sqlite/rowMappers.ts`

- [ ] **Step 1: Create rowMappers.ts**

Implement `rowToEntry(row)` converting SQLite row (INTEGER timestamps, TEXT JSON columns) to TypeScript `MemoryEntry`. Must handle:
- JSON parsing for `metadata`, `structured_content`, `tool_calls`, `source_memory_ids`, `supersedes`, `attributes`, `relationships`
- Type-specific field mapping (episodic: session_id, role, turn_index, tokens; semantic: fact, confidence; procedural: rule, trigger; entity: entity_name, entity_type, entity_id, attributes, relationships; trust_weighted: source_agent_passport_id, trust_score, decay_factor, weighted_relevance; temporal: valid_from, valid_to, recorded_at)
- `embedding_status`, `embedding_attempts`, lifecycle timestamps
- Default `memory_lane` to `'self'` if null

Implement `entryToRow(entry)` for the reverse direction. JSON.stringify for object/array columns.

Implement `rowToSession(row)`, `rowToProvenance(row)`, `rowToSnapshot(row)`, `rowToOutboxEvent(row)`.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/memory/store/sqlite/rowMappers.ts
git commit -m "feat(memory): SQLite rowMappers — row/entry bidirectional conversion"
```

---

### Task 6: SQLite Query Builders

**Files:**
- Create: `offchain/packages/engine/src/memory/store/sqlite/queries.ts`

- [ ] **Step 1: Create queries.ts**

Implement `buildQuerySQL(q: MemoryQuery)` returning `{ sql: string; params: any[] }`. Dynamic SQL builder following the same pattern as Postgres `buildQuerySQL`. Must handle all MemoryQuery filters: agent_passport_id, namespace, types, session_id, status (defaults `['active']`), content_hash, since, before, memory_lane, embedding_status. Order by, direction, limit, offset.

Implement `buildCountSQL(q)` — same filters, returns `SELECT COUNT(*)`.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/memory/store/sqlite/queries.ts
git commit -m "feat(memory): SQLite query builders — dynamic SQL with full filter support"
```

---

### Task 7: SQLiteMemoryStore — Full Implementation

**Files:**
- Create: `offchain/packages/engine/src/memory/store/sqlite/store.ts`

- [ ] **Step 1: Implement SQLiteMemoryStore**

This is the largest single file. Implement all 26+ IMemoryStore methods using better-sqlite3 synchronous API. Use the modules from Tasks 4-6 (db.ts, schema.ts, rowMappers.ts, queries.ts).

Key methods to implement:
- `write()` — INSERT into memory_entries + INSERT into memory_vectors (if embedding provided)
- `writeBatch()` — wrap in transaction
- `read()` — SELECT by memory_id
- `query()` — use buildQuerySQL()
- `count()` — use buildCountSQL()
- `supersede()`, `archive()`, `archiveBatch()`, `softDelete()` — UPDATE status
- `writeProvenance()` — INSERT into memory_provenance
- `getProvenanceChain()`, `getProvenanceForMemory()` — SELECT with filters
- `getLatestHash()` — SELECT content_hash ORDER BY created_at DESC LIMIT 1
- Session CRUD — INSERT/SELECT/UPDATE on memory_sessions
- `updateEmbedding()` — UPDATE entry + INSERT/REPLACE in memory_vectors, set embedding_status='ready' atomically
- `saveSnapshot()`, `getLatestSnapshot()`, `listSnapshots()` — memory_snapshots CRUD
- `getEntriesSince()`, `getStats()` — aggregate queries
- `nearestByEmbedding()` — sqlite-vec KNN query per spec Section 1.4
- `deleteBatch()` — transactional DELETE from memory_vectors + memory_entries
- `updateCompactionWatermark()` — UPDATE memory_sessions SET last_compacted_turn_index = MAX(current, new)
- `queryPendingEmbeddings()` — SELECT WHERE embedding_status='pending' AND embedding_attempts < 3
- `markEmbeddingFailed()` — UPDATE embedding_status='failed', increment attempts
- Outbox methods — INSERT/SELECT/UPDATE on memory_outbox
- `getHealth()` — SELECT counts + pragma queries
- `capabilities` — `{ persistent: true, vectorSearch: true, crossAgentQuery: false, transactions: true, localFirst: true }`

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/memory/store/sqlite/store.ts
git commit -m "feat(memory): SQLiteMemoryStore — full IMemoryStore implementation (26 methods)"
```

---

### Task 8: SQLite Store Tests

**Files:**
- Create: `offchain/packages/engine/src/memory/__tests__/sqliteStore.test.ts`

- [ ] **Step 1: Write full test suite**

Follow the exact same test structure as `inMemoryStore.test.ts` but using `SQLiteMemoryStore` with a temp file. Use factory functions `makeEpisodic()`, `makeSemantic()` with the same override pattern. Must include all 25 tests from spec Section 6.1:

- write + read round-trip
- query with filters (agent, namespace, types, status, lanes, since/before)
- nearestByEmbedding (ranked by similarity)
- nearestByEmbedding threshold filtering
- nearestByEmbedding type/lane filter
- deleteBatch transactional
- updateCompactionWatermark MAX semantics
- sessions CRUD (create, get, updateStats, close, list)
- provenance chain (write, getChain, getForMemory)
- snapshots CRUD (save, get, list)
- updateEmbedding + embedding_status lifecycle
- memory_lane default
- WAL mode verification
- schema versioning
- count method
- supersede, archive, archiveBatch
- softDelete
- writeBatch
- getEntriesSince
- getStats
- embedding_status query filter
- structured_content round-trip
- outbox CRUD
- getHealth

Use `beforeEach` to create a fresh `:memory:` SQLite DB (or temp file + cleanup in `afterEach`).

- [ ] **Step 2: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/sqliteStore.test.ts --no-coverage`
Expected: ~25 tests passing.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/memory/__tests__/sqliteStore.test.ts
git commit -m "test(memory): SQLite store — 25 tests covering full IMemoryStore contract"
```

---

### Task 9: Store Factory Update

**Files:**
- Modify: `offchain/packages/engine/src/memory/store/index.ts`

- [ ] **Step 1: Add SQLite to factory**

Update `getMemoryStore()` to support `MEMORY_STORE=sqlite`:

```typescript
export function getMemoryStore(): IMemoryStore {
  if (storeInstance) return storeInstance;
  const provider = process.env.MEMORY_STORE || 'memory';
  switch (provider) {
    case 'sqlite': {
      try {
        const { SQLiteMemoryStore } = require('./sqlite/store');
        const dbPath = process.env.MEMORY_DB_PATH || './data/agents/default/memory.db';
        // Ensure directory exists
        const { mkdirSync } = require('fs');
        const { dirname } = require('path');
        mkdirSync(dirname(dbPath), { recursive: true });
        storeInstance = new SQLiteMemoryStore(dbPath);
      } catch (err: any) {
        if (err.code === 'MODULE_NOT_FOUND') {
          throw new Error('SQLite store requires better-sqlite3 and sqlite-vec packages. Install with: npm install better-sqlite3 sqlite-vec');
        }
        throw err;
      }
      break;
    }
    case 'postgres': {
      const { PostgresMemoryStore } = require('./postgres');
      storeInstance = new PostgresMemoryStore();
      break;
    }
    case 'memory':
    default:
      storeInstance = new InMemoryMemoryStore();
      break;
  }
  return storeInstance;
}
```

- [ ] **Step 2: Export SQLiteMemoryStore from barrel**

Update `engine/src/memory/index.ts`:

```typescript
export { SQLiteMemoryStore } from './store/sqlite/store';
```

- [ ] **Step 3: Run all memory tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/ --no-coverage`
Expected: All suites pass including new SQLite tests. Existing 180 tests unchanged.

- [ ] **Step 4: Commit**

```bash
git add offchain/packages/engine/src/memory/store/index.ts offchain/packages/engine/src/memory/index.ts
git commit -m "feat(memory): store factory — MEMORY_STORE=sqlite support with lazy require"
```

---

## Chunk 2: Embedding Pipeline

### Task 10: IEmbeddingProvider Interface + Mock

**Files:**
- Create: `offchain/packages/engine/src/memory/embedding/interface.ts`
- Create: `offchain/packages/engine/src/memory/embedding/mock.ts`

- [ ] **Step 1: Create interface.ts**

Per spec Section 2.1. `EmbeddingResult`, `IEmbeddingProvider` with `embed()`, `embedBatch()`, `dimensions`, `modelName`.

- [ ] **Step 2: Create mock.ts**

Per spec Section 2.3. Deterministic SHA-256 based vectors, normalized to unit vector, 1536 dimensions.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/memory/embedding/interface.ts offchain/packages/engine/src/memory/embedding/mock.ts
git commit -m "feat(memory): IEmbeddingProvider interface + MockEmbeddingProvider"
```

---

### Task 11: OpenAI Embedding Provider

**Files:**
- Create: `offchain/packages/engine/src/memory/embedding/openai.ts`

- [ ] **Step 1: Create openai.ts**

Per spec Section 2.2. Uses `fetch()` to call `https://api.openai.com/v1/embeddings` with `text-embedding-3-small`. Requires `OPENAI_API_KEY`.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/memory/embedding/openai.ts
git commit -m "feat(memory): OpenAIEmbeddingProvider — text-embedding-3-small"
```

---

### Task 12: EmbeddingWorker + Factory

**Files:**
- Create: `offchain/packages/engine/src/memory/embedding/worker.ts`
- Create: `offchain/packages/engine/src/memory/embedding/index.ts`

- [ ] **Step 1: Create worker.ts**

Per spec Section 2.5. Hybrid trigger: subscribes to `memory.created` events for immediate enqueue + polling backstop via `setInterval`. Uses `queryPendingEmbeddings()` and `updateEmbedding()` (which atomically sets ready). On failure, calls `markEmbeddingFailed()`.

- [ ] **Step 2: Create index.ts (factory + barrel)**

Per spec Section 2.4. `getEmbeddingProvider()` factory: `openai` | `mock` | `none`.

```typescript
export { IEmbeddingProvider, EmbeddingResult } from './interface';
export { MockEmbeddingProvider } from './mock';
export { OpenAIEmbeddingProvider } from './openai';
export { EmbeddingWorker } from './worker';
export { getEmbeddingProvider } from './index'; // factory
```

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/memory/embedding/worker.ts offchain/packages/engine/src/memory/embedding/index.ts
git commit -m "feat(memory): EmbeddingWorker (hybrid event+polling) + provider factory"
```

---

### Task 13: Embedding Tests

**Files:**
- Create: `offchain/packages/engine/src/memory/__tests__/embedding.test.ts`

- [ ] **Step 1: Write embedding test suite**

10 tests per spec Section 6.2:

- MockEmbeddingProvider deterministic (same input = same vector)
- MockEmbeddingProvider unit vector (normalized)
- MockEmbeddingProvider embedBatch
- EmbeddingWorker processes pending (write entry with pending status, run tick(), verify ready)
- EmbeddingWorker handles failure (mock provider that throws, verify failed status)
- EmbeddingWorker batch processing
- Factory openai requires key (no OPENAI_API_KEY → throws)
- Factory mock returns provider
- Factory none returns null
- Worker skips when no pending

Use `InMemoryMemoryStore` as the store for worker tests (fast, no SQLite dependency).

- [ ] **Step 2: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/embedding.test.ts --no-coverage`
Expected: 10 tests passing.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/memory/__tests__/embedding.test.ts
git commit -m "test(memory): embedding pipeline — 10 tests covering provider + worker lifecycle"
```

---

## Chunk 3: Events + Outbox + Projection

### Task 14: Memory Event Bus

**Files:**
- Create: `offchain/packages/engine/src/memory/events/memoryEvents.ts`

- [ ] **Step 1: Create memoryEvents.ts**

Per spec Section 3.1. All 9 event types, `emitMemoryEvent()`, `getMemoryEventBus()`, `resetMemoryEventBus()` (for test isolation). Singleton EventEmitter with maxListeners=50.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/memory/events/memoryEvents.ts
git commit -m "feat(memory): event bus — 9 event types with reset for test isolation"
```

---

### Task 15: Event Bus Tests

**Files:**
- Create: `offchain/packages/engine/src/memory/__tests__/events.test.ts`

- [ ] **Step 1: Write event bus tests**

4 tests per spec Section 6.7:

- Typed listeners receive correct events
- Wildcard '*' receives all events
- No listener = no error
- resetMemoryEventBus clears old listeners

- [ ] **Step 2: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/events.test.ts --no-coverage`
Expected: 4 tests passing.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/memory/__tests__/events.test.ts
git commit -m "test(memory): event bus — 4 tests including reset isolation"
```

---

### Task 16: Projection Policies + Sink Interface

**Files:**
- Create: `offchain/packages/engine/src/memory/projection/policies.ts`
- Create: `offchain/packages/engine/src/memory/projection/sinks/interface.ts`
- Create: `offchain/packages/engine/src/memory/projection/sinks/postgres.ts`
- Create: `offchain/packages/engine/src/memory/projection/index.ts`

- [ ] **Step 1: Create policies.ts**

Per spec Section 4.4. `ProjectionPolicy` interface with `project_embeddings: boolean` (default false). `shouldProject()` filter. `getDefaultProjectionPolicy()`.

- [ ] **Step 2: Create sinks/interface.ts**

Per spec Section 4.2. `ProjectableEntry` with `idempotency_key`. `IProjectionSink` with `project()`, `projectBatch()`, `remove()`, `healthCheck()`.

- [ ] **Step 3: Create sinks/postgres.ts**

Per spec Section 4.3. `PostgresSink` using UPSERT. Import from existing `../../db/pool`.

- [ ] **Step 4: Create index.ts barrel**

Export all projection types and classes.

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/projection/
git commit -m "feat(memory): projection module — policies, sink interface, PostgresSink"
```

---

### Task 17: MemoryProjectionService

**Files:**
- Create: `offchain/packages/engine/src/memory/projection/service.ts`

- [ ] **Step 1: Create service.ts**

Per spec Section 4.6. Outbox-driven projection: reads unprocessed outbox events, applies policy filter, publishes to sinks, marks processed. Has `start()` (registers event bus listeners + polling interval) and `stop()` (removes listeners + clears interval). Supports `project_embeddings` policy flag. Adds `idempotency_key` to projectable entries.

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/engine/src/memory/projection/service.ts
git commit -m "feat(memory): MemoryProjectionService — outbox-driven with stop() cleanup"
```

---

### Task 18: Projection Tests

**Files:**
- Create: `offchain/packages/engine/src/memory/__tests__/projection.test.ts`

- [ ] **Step 1: Write projection test suite**

9 tests per spec Section 6.6:

- shouldProject default policy (shared/market projected, self/user blocked)
- shouldProject episodic blocked
- shouldProject redact episodic content
- Outbox transactional write (memory + outbox in same operation)
- ProjectionService processes outbox (write, process, verify sink.project called)
- ProjectionService sink failure safe (sink throws, logged not propagated)
- ProjectionService delete propagates
- Outbox idempotency
- Outbox polling recovery

Use `InMemoryMemoryStore` + mock sinks.

- [ ] **Step 2: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/projection.test.ts --no-coverage`
Expected: 9 tests passing.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/memory/__tests__/projection.test.ts
git commit -m "test(memory): projection — 9 tests covering outbox, policies, sink safety"
```

---

### Task 19: Wire Events into MemoryService

**Files:**
- Modify: `offchain/packages/engine/src/memory/service.ts`

- [ ] **Step 1: Import and emit events**

Add imports:

```typescript
import { emitMemoryEvent } from './events/memoryEvents';
```

After each successful `store.write()` in all add* methods, emit:

```typescript
emitMemoryEvent({
  type: 'memory.created',
  timestamp: Date.now(),
  agent_passport_id: callerPassportId,
  namespace: input.namespace,
  entry: result as any, // the written entry
});
```

Set `embedding_status` based on config:

```typescript
const embeddingStatus = this.config.embedding_enabled ? 'pending' : 'skipped';
```

Add this to all entry construction before `store.write()`.

- [ ] **Step 2: Wire outbox event in write path**

After `store.write()` and before provenance, write outbox event:

```typescript
await this.store.writeOutboxEvent({
  event_type: 'memory.created',
  memory_id: result.memory_id,
  agent_passport_id: callerPassportId,
  namespace: input.namespace,
  payload_json: JSON.stringify({ ...fullEntry, memory_id: result.memory_id }),
});
```

- [ ] **Step 3: Run existing tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/service.test.ts --no-coverage`
Expected: All existing service tests pass. New outbox/event calls are non-breaking.

- [ ] **Step 4: Commit**

```bash
git add offchain/packages/engine/src/memory/service.ts
git commit -m "feat(memory): wire events + outbox into MemoryService write path"
```

---

## Chunk 4: SDK + Routes + Barrel Exports

### Task 20: SDK MemoryNamespace v3

**Files:**
- Modify: `offchain/packages/sdk/src/lucid.ts`
- Modify: `offchain/packages/sdk/src/memory.ts`
- Modify: `offchain/packages/sdk/tsup.config.ts`
- Modify: `offchain/packages/sdk/package.json`

- [ ] **Step 1: Extend MemoryNamespace interface**

Add to the `MemoryNamespace` interface in `lucid.ts`:

```typescript
addEntity(input: {
  content?: string; entity_name: string; entity_type: string;
  entity_id?: string; attributes?: Record<string, unknown>;
  relationships?: any[]; source_memory_ids?: string[];
  namespace?: string; metadata?: Record<string, unknown>;
  memory_lane?: string;
}): Promise<MemoryWriteResult>;

addTrustWeighted(input: {
  content?: string; source_agent_passport_id: string;
  trust_score: number; decay_factor: number; weighted_relevance: number;
  source_memory_ids?: string[]; namespace?: string;
  metadata?: Record<string, unknown>; memory_lane?: string;
}): Promise<MemoryWriteResult>;

addTemporal(input: {
  content: string; valid_from: number; valid_to?: number | null;
  recorded_at?: number; source_memory_ids?: string[];
  namespace?: string; metadata?: Record<string, unknown>;
  memory_lane?: string;
}): Promise<MemoryWriteResult>;

compact(options?: {
  namespace?: string; session_id?: string;
  mode?: 'warm' | 'cold' | 'full';
}): Promise<CompactionResult>;

exportMemoryFile(): Promise<LucidMemoryFile>;

health(): Promise<MemoryStoreHealth>;
```

- [ ] **Step 2: Implement in _buildMemoryNamespace()**

Add method implementations following the existing pattern (lazy getServiceAndStore, this._wrap):

```typescript
addEntity: (input) => this._wrap(async () => {
  const { service: svc } = getServiceAndStore();
  return svc.addEntity(agentId, {
    namespace: input.namespace || `agent:${agentId}`,
    content: input.content || input.entity_name,
    ...input,
  });
}),
// ... similar for addTrustWeighted, addTemporal, compact, exportMemoryFile, health
```

- [ ] **Step 3: Update memory.ts HTTP client**

Add matching HTTP methods:

```typescript
addEntity: async (input) => { const { data } = await httpClient.post('/v1/memory/entity', input); return data; },
addTrustWeighted: async (input) => { const { data } = await httpClient.post('/v1/memory/trust-weighted', input); return data; },
addTemporal: async (input) => { const { data } = await httpClient.post('/v1/memory/temporal', input); return data; },
compact: async (options) => { const { data } = await httpClient.post('/v1/memory/compact', options || {}); return data; },
exportMemoryFile: async () => { const { data } = await httpClient.post('/v1/memory/export', {}); return data; },
health: async () => { const { data } = await httpClient.get('/v1/memory/health'); return data; },
```

- [ ] **Step 4: Add `memory` entry to tsup.config.ts**

```typescript
memory: 'src/memory.ts',
```

- [ ] **Step 5: Add `./memory` export to package.json**

```json
"./memory": {
  "types": "./dist/memory.d.ts",
  "import": "./dist/memory.js",
  "require": "./dist/memory.cjs"
}
```

- [ ] **Step 6: Add type re-exports**

In `sdk/src/lucid.ts` or `sdk/src/types.ts`, add:

```typescript
export type {
  CompactionConfig, CompactionResult,
  MemoryLane, EntityMemory, EntityRelation,
  TrustWeightedMemory, TemporalMemory,
  MemoryStoreHealth, MemoryStoreCapabilities,
  LucidMemoryFile,
} from '@lucid-l2/engine';
```

- [ ] **Step 7: Commit**

```bash
git add offchain/packages/sdk/
git commit -m "feat(memory): SDK v3 — addEntity, addTrustWeighted, addTemporal, compact, health"
```

---

### Task 21: Route — Health Endpoint

**Files:**
- Modify: `offchain/packages/gateway-lite/src/routes/core/memoryRoutes.ts`

- [ ] **Step 1: Add GET /v1/memory/health route**

```typescript
memoryRouter.get('/v1/memory/health', async (_req, res) => {
  try {
    const health = await getMemoryStore().getHealth();
    return res.json({ success: true, data: health });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add offchain/packages/gateway-lite/src/routes/core/memoryRoutes.ts
git commit -m "feat(memory): GET /v1/memory/health route for store diagnostics"
```

---

### Task 22: Barrel Exports Update

**Files:**
- Modify: `offchain/packages/engine/src/memory/index.ts`

- [ ] **Step 1: Add all new exports**

```typescript
// Embedding
export type { IEmbeddingProvider, EmbeddingResult } from './embedding/interface';
export { MockEmbeddingProvider } from './embedding/mock';
export { OpenAIEmbeddingProvider } from './embedding/openai';
export { EmbeddingWorker } from './embedding/worker';
export { getEmbeddingProvider } from './embedding';

// Events
export { emitMemoryEvent, getMemoryEventBus, resetMemoryEventBus } from './events/memoryEvents';
export type { MemoryEventType, MemoryEvent, MemoryCreatedEvent } from './events/memoryEvents';

// Projection
export { MemoryProjectionService } from './projection/service';
export { shouldProject, getDefaultProjectionPolicy } from './projection/policies';
export type { IProjectionSink, ProjectableEntry } from './projection/sinks/interface';
export { PostgresSink } from './projection/sinks/postgres';

// SQLite
export { SQLiteMemoryStore } from './store/sqlite/store';

// Types
export type { MemoryStoreCapabilities, OutboxEvent, MemoryStoreHealth } from './types';
export type { EntityRelation } from './types';
```

- [ ] **Step 2: Run type-check**

Run: `cd offchain && npm run type-check 2>&1 | grep -v 'node_modules/ox'`
Expected: No new errors from memory changes.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/memory/index.ts
git commit -m "feat(memory): barrel exports — embedding, events, projection, SQLite, v3 types"
```

---

## Chunk 5: E2E Tests + Final Verification

### Task 23: Recall E2E with Embeddings

**Files:**
- Create: `offchain/packages/engine/src/memory/__tests__/recall-e2e.test.ts`

- [ ] **Step 1: Write recall E2E tests**

5 tests per spec Section 6.3. Use `InMemoryMemoryStore` + `MockEmbeddingProvider` + `EmbeddingWorker`.

Full pipeline: write semantic entries → run worker tick → recall by query → verify vector-ranked results. Test recall skips pending entries, lanes filter, type boost, overfitting guard.

- [ ] **Step 2: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/recall-e2e.test.ts --no-coverage`
Expected: 5 tests passing.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/memory/__tests__/recall-e2e.test.ts
git commit -m "test(memory): recall E2E — 5 tests with real embedding pipeline"
```

---

### Task 24: Compaction + Snapshot E2E

**Files:**
- Create: `offchain/packages/engine/src/memory/__tests__/compaction-e2e.test.ts`
- Create: `offchain/packages/engine/src/memory/__tests__/snapshot-e2e.test.ts`

- [ ] **Step 1: Write compaction E2E tests**

4 tests per spec Section 6.4. Use `SQLiteMemoryStore` (temp file). Write episodics → compact warm → verify archived → compact cold → verify deleted + provenance.

- [ ] **Step 2: Write snapshot E2E tests**

3 tests per spec Section 6.5. Write to SQLite → snapshot → new SQLite → restore → verify identical. Test identity verification and admin bypass.

- [ ] **Step 3: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/compaction-e2e.test.ts packages/engine/src/memory/__tests__/snapshot-e2e.test.ts --no-coverage`
Expected: 7 tests passing.

- [ ] **Step 4: Commit**

```bash
git add offchain/packages/engine/src/memory/__tests__/compaction-e2e.test.ts offchain/packages/engine/src/memory/__tests__/snapshot-e2e.test.ts
git commit -m "test(memory): compaction + snapshot E2E — 7 tests through SQLite"
```

---

### Task 25: SDK Memory Tests

**Files:**
- Create: `offchain/packages/sdk/src/__tests__/memory.test.ts`

- [ ] **Step 1: Write SDK memory tests**

6 tests per spec Section 6.8:

- addEntity calls service (entity stored)
- addTrustWeighted calls service (trust-weighted stored)
- addTemporal calls service (temporal stored)
- compact returns CompactionResult
- exportMemoryFile returns LMF (structure valid)
- health returns diagnostics (store type, counts, capabilities)

Mock the service/store dependencies.

- [ ] **Step 2: Run tests**

Run: `cd offchain && npx jest packages/sdk/src/__tests__/memory.test.ts --no-coverage`
Expected: 6 tests passing.

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/sdk/src/__tests__/memory.test.ts
git commit -m "test(memory): SDK memory namespace — 6 tests for v3 methods"
```

---

### Task 26: Full Test Verification + Postgres Parity Patch + CLAUDE.md

**Files:**
- Modify: `offchain/packages/engine/src/memory/store/postgres.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Postgres parity for new interface methods**

Add stub implementations to `PostgresMemoryStore` for all new interface methods (capabilities, queryPendingEmbeddings, markEmbeddingFailed, outbox methods, getHealth). These can be minimal but must compile.

- [ ] **Step 2: Run full memory test suite**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/ --no-coverage`
Expected: All suites pass. New test count: ~246 total (180 existing + 66 new).

- [ ] **Step 3: Run type-check**

Run: `cd offchain && npm run type-check 2>&1 | grep -v 'node_modules/ox'`
Expected: No new errors from memory changes.

- [ ] **Step 4: Update CLAUDE.md**

Update the MemoryMap section to reflect v3:
- Three store options: SQLite (default for agents), Postgres (fleet/admin), InMemory (tests)
- Async embedding pipeline
- Memory event bus + outbox-based projection
- Store capabilities model
- New env vars: MEMORY_STORE, MEMORY_DB_PATH, MEMORY_EMBEDDING_PROVIDER, MEMORY_PROJECTION_ENABLED

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/store/postgres.ts CLAUDE.md
git commit -m "feat(memory): MemoryMap v3 complete — Postgres parity stubs + CLAUDE.md update"
```

---

## Verification Checklist

After all 26 tasks:

- [ ] `cd offchain && npx jest packages/engine/src/memory/__tests__/ --no-coverage` — all ~246 tests pass
- [ ] `cd offchain && npm run type-check` — no new errors (only pre-existing ox)
- [ ] `MEMORY_STORE=sqlite node -e "const { getMemoryStore } = require('./packages/engine/src/memory/store'); const s = getMemoryStore(); console.log(s.capabilities)"` — prints SQLite capabilities
- [ ] `MEMORY_EMBEDDING_PROVIDER=mock node -e "const { getEmbeddingProvider } = require('./packages/engine/src/memory/embedding'); const p = getEmbeddingProvider(); p.embed('test').then(r => console.log(r.model, r.embedding.length))"` — prints mock-embedding-v1 1536
