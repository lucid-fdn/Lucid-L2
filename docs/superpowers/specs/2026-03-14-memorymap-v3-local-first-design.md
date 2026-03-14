# MemoryMap v3 — Local Truth, Global Projection

**Date:** 2026-03-14
**Status:** Design
**Author:** Kevin Wayne + Claude
**Depends on:** MemoryMap v2 (merged to master, 16 tasks, 31 files, 180 tests)

## Core Principle

> Every agent owns a canonical local memory store. Platform-level memory systems are derived projections, never the primary source of operational truth.

## Context

MemoryMap v2 shipped semantic recall, tiered compaction, memory lanes, 6 type managers, and extraction hardening. All 180 tests run against `InMemoryMemoryStore`. Two architectural gaps remain:

1. **No embedded store** — agents depend on centralized Postgres (Supabase). This violates decentralization and portability.
2. **No embedding generation** — `nearestByEmbedding()` exists but nothing converts text to vectors. The entire vector recall path is dead code.

v3 introduces a two-plane architecture: **Operational Plane** (local SQLite per agent) and **Knowledge Projection Plane** (derived, optional, for fleet analytics and shared memory).

### What is NOT in scope

- **libSQL/Turso replication** — future work. Interface left open.
- **SQLCipher encryption** — future work. Noted in config.
- **Entity graph traversal** — future work.
- **SearchSink (Typesense/Meilisearch)** — future work. Only PostgresSink in v3.
- **DePINCatalogSink** — future work. Stub only.

---

## Section 1: SQLiteMemoryStore

### Problem

Agents depend on a centralized PostgreSQL instance. This makes them non-portable, adds ops burden (connection strings, migrations, Supabase dependency), and violates the decentralization principle. The `InMemoryMemoryStore` is test-only with no persistence.

### Design

#### 1.1 New store: `SQLiteMemoryStore`

Implements the full `IMemoryStore` interface using `better-sqlite3` + `sqlite-vec` extension.

**File:** `engine/src/memory/store/sqlite.ts`

```typescript
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import type { IMemoryStore, MemoryQuery, MemoryWriteResult, MemoryStats } from './interface';
import type { MemoryEntry, MemoryType, MemoryLane } from '../types';
import { initSchema, migrateIfNeeded } from './sqlite-schema';

export class SQLiteMemoryStore implements IMemoryStore {
  private db: Database.Database;

  constructor(dbPath: string, options?: { walMode?: boolean; maxEntries?: number; maxDbSizeMb?: number }) {
    this.db = new Database(dbPath);

    // Production pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    // Load sqlite-vec extension
    sqliteVec.load(this.db);

    // Init/migrate schema
    initSchema(this.db);
    migrateIfNeeded(this.db);
  }

  // ... implements all IMemoryStore methods
  // Vector search via sqlite-vec virtual table
  // Transactions via db.transaction()
}
```

#### 1.2 Schema versioning

**File:** `engine/src/memory/store/sqlite-schema.ts`

Uses `PRAGMA user_version` for lightweight migration tracking. No external migration files.

```typescript
const CURRENT_SCHEMA_VERSION = 1;

export function initSchema(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version === 0) {
    // First-time setup: create all tables
    db.exec(SCHEMA_V1);
    db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
  }
}

export function migrateIfNeeded(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  // Apply incremental patches
  if (version < 2) { db.exec(PATCH_V2); db.pragma('user_version = 2'); }
  // if (version < 3) { ... }
}
```

#### 1.3 Schema V1 (SQLite)

```sql
-- Memory entries
CREATE TABLE IF NOT EXISTS memory_entries (
  memory_id TEXT PRIMARY KEY,
  agent_passport_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('episodic','semantic','procedural','entity','trust_weighted','temporal')),
  namespace TEXT NOT NULL,
  memory_lane TEXT NOT NULL DEFAULT 'self' CHECK(memory_lane IN ('self','user','shared','market')),
  content TEXT NOT NULL,
  structured_content TEXT,
  embedding_status TEXT NOT NULL DEFAULT 'pending' CHECK(embedding_status IN ('pending','ready','failed','skipped')),
  embedding_attempts INTEGER NOT NULL DEFAULT 0,
  embedding_model TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded','archived','expired')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  content_hash TEXT NOT NULL,
  prev_hash TEXT,
  receipt_hash TEXT,
  receipt_run_id TEXT,

  -- Episodic
  session_id TEXT,
  role TEXT,
  turn_index INTEGER,
  tokens INTEGER,
  tool_calls TEXT,

  -- Semantic
  fact TEXT,
  confidence REAL,
  source_memory_ids TEXT,
  supersedes TEXT,

  -- Procedural
  rule TEXT,
  "trigger" TEXT,                    -- quoted: reserved word in SQL, safe in SQLite when quoted
  priority INTEGER,

  -- Entity
  entity_name TEXT,
  entity_type TEXT,
  entity_id TEXT,
  attributes TEXT,
  relationships TEXT,

  -- Trust-weighted
  source_agent_passport_id TEXT,
  trust_score REAL,
  decay_factor REAL,
  weighted_relevance REAL,

  -- Temporal
  valid_from INTEGER,
  valid_to INTEGER,
  recorded_at INTEGER,
  superseded_by TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entries_agent_ns ON memory_entries(agent_passport_id, namespace);
CREATE INDEX IF NOT EXISTS idx_entries_session ON memory_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_entries_type ON memory_entries(type);
CREATE INDEX IF NOT EXISTS idx_entries_status ON memory_entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_lane ON memory_entries(memory_lane);
CREATE INDEX IF NOT EXISTS idx_entries_created ON memory_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_entries_embedding_status ON memory_entries(embedding_status);
CREATE INDEX IF NOT EXISTS idx_entries_hash ON memory_entries(content_hash);

-- sqlite-vec virtual table for vector search
CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors USING vec0(
  memory_id TEXT PRIMARY KEY,
  embedding FLOAT[1536]
);

-- Sessions
CREATE TABLE IF NOT EXISTS memory_sessions (
  session_id TEXT PRIMARY KEY,
  agent_passport_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed','archived')),
  turn_count INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  last_receipted_turn_index INTEGER NOT NULL DEFAULT -1,
  last_compacted_turn_index INTEGER NOT NULL DEFAULT -1,
  summary TEXT,
  created_at INTEGER NOT NULL,
  last_activity INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sessions_agent ON memory_sessions(agent_passport_id);

-- Provenance
CREATE TABLE IF NOT EXISTS memory_provenance (
  record_id TEXT PRIMARY KEY,
  agent_passport_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  memory_id TEXT,
  operation TEXT NOT NULL CHECK(operation IN ('create','update','supersede','archive','delete')),
  content_hash TEXT NOT NULL,
  prev_hash TEXT,
  receipt_hash TEXT,
  receipt_run_id TEXT,
  anchor_epoch_id TEXT,
  deleted_memory_hash TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (memory_id) REFERENCES memory_entries(memory_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_provenance_agent_ns ON memory_provenance(agent_passport_id, namespace);
CREATE INDEX IF NOT EXISTS idx_provenance_memory ON memory_provenance(memory_id);

-- Snapshots
CREATE TABLE IF NOT EXISTS memory_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  agent_passport_id TEXT NOT NULL,
  depin_cid TEXT NOT NULL,
  entry_count INTEGER NOT NULL,
  chain_head_hash TEXT NOT NULL,
  snapshot_type TEXT NOT NULL CHECK(snapshot_type IN ('checkpoint','migration','archive')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_agent ON memory_snapshots(agent_passport_id);
```

#### 1.4 Vector search via sqlite-vec

```typescript
async nearestByEmbedding(
  embedding: number[],
  agent_passport_id: string,
  namespace?: string,
  types?: MemoryType[],
  limit?: number,
  similarity_threshold?: number,
  lanes?: MemoryLane[],
): Promise<(MemoryEntry & { similarity: number })[]> {
  const k = (limit || 20) * 3; // over-fetch for post-filter

  // sqlite-vec KNN query
  const vecRows = this.db.prepare(`
    SELECT memory_id, distance
    FROM memory_vectors
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `).all(new Float32Array(embedding), k);

  if (vecRows.length === 0) return [];

  const ids = vecRows.map((r: any) => r.memory_id);
  const distanceMap = new Map(vecRows.map((r: any) => [r.memory_id, r.distance]));

  // Fetch full entries and filter
  const placeholders = ids.map(() => '?').join(',');
  let sql = `SELECT * FROM memory_entries WHERE memory_id IN (${placeholders})
    AND agent_passport_id = ? AND status = 'active'`;
  const params: any[] = [...ids, agent_passport_id];

  if (namespace) { sql += ` AND namespace = ?`; params.push(namespace); }
  if (types?.length) {
    sql += ` AND type IN (${types.map(() => '?').join(',')})`;
    params.push(...types);
  }
  if (lanes?.length) {
    sql += ` AND memory_lane IN (${lanes.map(() => '?').join(',')})`;
    params.push(...lanes);
  }

  const rows = this.db.prepare(sql).all(...params);
  const threshold = similarity_threshold ?? 0.65;

  return rows
    .map((row: any) => {
      const distance = distanceMap.get(row.memory_id) || 1;
      const similarity = 1 - distance; // cosine distance to similarity
      return { ...this.rowToEntry(row), similarity };
    })
    .filter(e => e.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit || 20);
}
```

#### 1.5 Transactional deleteBatch

```typescript
async deleteBatch(memory_ids: string[]): Promise<void> {
  if (memory_ids.length === 0) return;

  const txn = this.db.transaction(() => {
    const placeholders = memory_ids.map(() => '?').join(',');
    // Delete from vector table first
    this.db.prepare(
      `DELETE FROM memory_vectors WHERE memory_id IN (${placeholders})`
    ).run(...memory_ids);
    // Delete entries
    this.db.prepare(
      `DELETE FROM memory_entries WHERE memory_id IN (${placeholders})`
    ).run(...memory_ids);
  });

  txn();
}
```

#### 1.6 DB location

```
MEMORY_DB_PATH env -> defaults to ./data/agents/{agent_passport_id}/memory.db
```

Directory structure per agent:
```
data/agents/{passport}/
  memory.db
  memory.db-wal
  memory.db-shm
```

#### 1.7 Memory limits

Added to `MemoryServiceConfig`:

```typescript
max_memory_entries: number;       // default 100_000
max_memory_db_size_mb: number;    // default 500
max_vector_rows: number;          // default 50_000
```

Enforced on write path: if limit exceeded, return error with `MEMORY_LIMIT_EXCEEDED` code. Compaction should run first to free space.

#### 1.8 Store hierarchy update

```typescript
// store/index.ts -- updated factory
export function getMemoryStore(): IMemoryStore {
  const storeType = process.env.MEMORY_STORE || 'sqlite';
  switch (storeType) {
    case 'sqlite':
      return getSQLiteStore();
    case 'postgres':
      return getPostgresStore();
    case 'memory':
      return getInMemoryStore();
    default:
      throw new Error(`Unknown MEMORY_STORE: ${storeType}`);
  }
}
```

Default remains `'memory'` to avoid breaking existing deployments. SQLite requires explicit `MEMORY_STORE=sqlite` opt-in. Default changes to `'sqlite'` in v4 after adoption period.

---

## Section 2: Async Embedding Pipeline

### Problem

`nearestByEmbedding()` exists on all three stores but nothing generates embeddings. The `embedding` column on `MemoryEntry` is always empty. The entire two-stage vector recall path is dead code.

### Design

#### 2.1 IEmbeddingProvider interface

**File:** `engine/src/memory/embedding/interface.ts`

```typescript
export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokens_used: number;
}

export interface IEmbeddingProvider {
  embed(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
  readonly dimensions: number;
  readonly modelName: string;
}
```

#### 2.2 OpenAIEmbeddingProvider

**File:** `engine/src/memory/embedding/openai.ts`

```typescript
export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  readonly dimensions = 1536;
  readonly modelName = 'text-embedding-3-small';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) throw new Error('OPENAI_API_KEY required for embedding provider');
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.modelName, input: texts }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Embedding API error ${response.status}: ${err}`);
    }
    const data = await response.json();
    return data.data.map((d: any) => ({
      embedding: d.embedding,
      model: this.modelName,
      tokens_used: data.usage?.total_tokens || 0,
    }));
  }
}
```

#### 2.3 MockEmbeddingProvider

**File:** `engine/src/memory/embedding/mock.ts`

Deterministic vectors for testing. Same input always produces same output.

```typescript
import { createHash } from 'crypto';

export class MockEmbeddingProvider implements IEmbeddingProvider {
  readonly dimensions = 1536;
  readonly modelName = 'mock-embedding-v1';

  async embed(text: string): Promise<EmbeddingResult> {
    return {
      embedding: this.deterministicVector(text),
      model: this.modelName,
      tokens_used: text.split(/\s+/).length,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  private deterministicVector(text: string): number[] {
    const hash = createHash('sha256').update(text).digest();
    const vec = new Float32Array(this.dimensions);
    for (let i = 0; i < this.dimensions; i++) {
      vec[i] = (hash[i % 32] / 255) * 2 - 1; // normalize to [-1, 1]
    }
    // Normalize to unit vector
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    for (let i = 0; i < this.dimensions; i++) vec[i] /= norm;
    return Array.from(vec);
  }
}
```

#### 2.4 Provider factory

**File:** `engine/src/memory/embedding/index.ts`

```typescript
export function getEmbeddingProvider(): IEmbeddingProvider | null {
  const provider = process.env.MEMORY_EMBEDDING_PROVIDER || 'none';
  switch (provider) {
    case 'openai': return new OpenAIEmbeddingProvider();
    case 'mock': return new MockEmbeddingProvider();
    case 'none': return null;
    default: throw new Error(`Unknown MEMORY_EMBEDDING_PROVIDER: ${provider}`);
  }
}
```

#### 2.5 EmbeddingWorker (async background)

**File:** `engine/src/memory/embedding/worker.ts`

Never blocks the write path. Polls for `embedding_status = 'pending'` entries and processes them in batches.

```typescript
export class EmbeddingWorker {
  private running = false;
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private store: IMemoryStore,
    private provider: IEmbeddingProvider,
    private config: {
      batchSize: number;
      pollIntervalMs: number;
      maxRetries: number;
    },
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.interval = setInterval(() => this.tick(), this.config.pollIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async tick(): Promise<void> {
    // Query pending entries across all agents (dedicated worker method)
    const pending = await this.store.queryPendingEmbeddings(this.config.batchSize);

    if (pending.length === 0) return;

    const texts = pending.map(e => e.content);
    try {
      const results = await this.provider.embedBatch(texts);
      for (let i = 0; i < pending.length; i++) {
        // updateEmbedding atomically sets embedding + embedding_status='ready'
        await this.store.updateEmbedding(
          pending[i].memory_id,
          results[i].embedding,
          results[i].model,
        );
      }
    } catch (err) {
      // Mark all as failed — retry tracked by embedding_attempts column
      for (const entry of pending) {
        await this.store.markEmbeddingFailed(entry.memory_id);
      }
    }
  }
}
```

#### 2.6 Store interface additions

Add to `IMemoryStore`:

```typescript
/** Update embedding + status atomically. Sets embedding_status = 'ready'. */
updateEmbedding(memory_id: string, embedding: number[], model: string): Promise<void>;
// NOTE: existing method signature unchanged, but implementations MUST now also
// set embedding_status = 'ready' atomically in the same update.

/** Query entries with pending embeddings across all agents (worker-scoped). */
queryPendingEmbeddings(limit: number): Promise<MemoryEntry[]>;

/** Mark embedding as failed (after max retries). */
markEmbeddingFailed(memory_id: string): Promise<void>;
```

Add `embedding_status` filter to `MemoryQuery`:

```typescript
export interface MemoryQuery {
  // ... existing fields ...
  embedding_status?: ('pending' | 'ready' | 'failed' | 'skipped')[];
}
```

**Note:** `queryPendingEmbeddings()` replaces the wildcard `agent_passport_id: '*'` pattern. This method queries across all agents and is intended for admin/worker use only.

#### 2.7 Write path change

`MemoryService.addEpisodic()` (and all other write methods) no longer compute embeddings synchronously. Instead:

1. Write entry with `embedding_status: 'pending'`
2. Emit `memory.created` event
3. `EmbeddingWorker` picks it up asynchronously

If `MEMORY_EMBEDDING_PROVIDER=none`, write with `embedding_status: 'skipped'`.

#### 2.7a MemoryEntry type changes

Add to `MemoryEntry` in `types.ts`:

```typescript
export interface MemoryEntry<T extends MemoryType = MemoryType> {
  // ... existing fields ...
  embedding_status: 'pending' | 'ready' | 'failed' | 'skipped';
  embedding_attempts: number; // default 0, incremented on each failure
}
```

The `embedding_attempts` column enables retry logic: `queryPendingEmbeddings` filters by `embedding_attempts < maxRetries`.

#### 2.8 Recall path change

`MemoryService.recall()` updated:

1. If embedding provider exists and no `semantic_query_embedding` provided: embed the query text
2. Pass to `nearestByEmbedding()` with implicit filter: only entries where `embedding_status = 'ready'`
3. Reranker proceeds as before

If no provider: fall back to recency/type-based recall (existing behavior).

#### 2.9 Env config

```
MEMORY_EMBEDDING_PROVIDER=openai|mock|none    # default: none
OPENAI_API_KEY=sk-...                          # required when provider=openai
MEMORY_EMBEDDING_BATCH_SIZE=20                 # default: 20
MEMORY_EMBEDDING_POLL_MS=2000                  # default: 2000
MEMORY_EMBEDDING_MAX_RETRIES=3                 # default: 3
```

---

## Section 3: Memory Event Bus

### Problem

No event system exists for memory operations. The projection plane, analytics, and any future consumers need to react to memory writes/archives/compaction without coupling directly to `MemoryService`.

### Design

#### 3.1 Event types

**File:** `engine/src/memory/events/memoryEvents.ts`

```typescript
import { EventEmitter } from 'events';
import type { MemoryEntry, CompactionResult } from '../types';

export type MemoryEventType =
  | 'memory.created'
  | 'memory.updated'
  | 'memory.archived'
  | 'memory.deleted'
  | 'memory.compacted'
  | 'memory.snapshotted'
  | 'memory.embedding.ready'
  | 'session.created'
  | 'session.closed';

export interface MemoryEvent {
  type: MemoryEventType;
  timestamp: number;
  agent_passport_id: string;
  namespace: string;
}

export interface MemoryCreatedEvent extends MemoryEvent {
  type: 'memory.created';
  entry: MemoryEntry;
}

export interface MemoryArchivedEvent extends MemoryEvent {
  type: 'memory.archived';
  memory_ids: string[];
}

export interface MemoryDeletedEvent extends MemoryEvent {
  type: 'memory.deleted';
  memory_ids: string[];
  content_hashes: string[];
}

export interface MemoryCompactedEvent extends MemoryEvent {
  type: 'memory.compacted';
  result: CompactionResult;
}

export interface MemorySnapshottedEvent extends MemoryEvent {
  type: 'memory.snapshotted';
  snapshot_cid: string;
  entry_count: number;
}

export interface EmbeddingReadyEvent extends MemoryEvent {
  type: 'memory.embedding.ready';
  memory_id: string;
  model: string;
}

export interface SessionCreatedEvent extends MemoryEvent {
  type: 'session.created';
  session_id: string;
}

export interface SessionClosedEvent extends MemoryEvent {
  type: 'session.closed';
  session_id: string;
  summary?: string;
}

// Singleton event bus
const bus = new EventEmitter();
bus.setMaxListeners(50);

export function getMemoryEventBus(): EventEmitter {
  return bus;
}

export function emitMemoryEvent(event: MemoryEvent): void {
  bus.emit(event.type, event);
  bus.emit('*', event); // wildcard for catch-all listeners
}
```

#### 3.2 MemoryService integration

All write/archive/delete/compact operations call `emitMemoryEvent()` after successful store mutation. Example in `addEpisodic()`:

```typescript
const result = await this.store.write(/* ... */);
emitMemoryEvent({
  type: 'memory.created',
  timestamp: Date.now(),
  agent_passport_id: callerPassportId,
  namespace: input.namespace,
  entry: /* the written entry */,
});
return result;
```

Events are fire-and-forget. Listener failures do not affect the write path.

---

## Section 4: Knowledge Projection Plane

### Problem

Local-first memory solves portability and decentralization, but operators need fleet-wide search, analytics, dashboards, and cross-agent shared memory. Without a projection plane, these use cases require direct access to each agent's SQLite file.

### Design

#### 4.1 Architectural rule

The projection plane is:
- **Derived** — never the source of truth
- **Eventually consistent** — lag behind local writes
- **Optional** — agents function fully without it
- **Non-canonical** — projection data can be rebuilt from local stores + DePIN snapshots

#### 4.2 IProjectionSink interface

**File:** `engine/src/memory/projection/sinks/interface.ts`

```typescript
import type { MemoryEntry } from '../../types';

export interface ProjectableEntry {
  memory_id: string;
  agent_passport_id: string;
  type: string;
  namespace: string;
  memory_lane: string;
  content: string;
  content_hash: string;
  created_at: number;
  metadata: Record<string, unknown>;
  embedding?: number[];
  embedding_model?: string;
  [key: string]: unknown;
}

export interface IProjectionSink {
  readonly name: string;
  project(entry: ProjectableEntry): Promise<void>;
  projectBatch(entries: ProjectableEntry[]): Promise<void>;
  remove(memory_ids: string[]): Promise<void>;
  healthCheck(): Promise<boolean>;
}
```

#### 4.3 PostgresSink

**File:** `engine/src/memory/projection/sinks/postgres.ts`

Writes projected entries to the existing Postgres `memory_entries` table (same schema). This makes the existing PostgresMemoryStore double as both a direct store AND a projection sink.

```typescript
export class PostgresSink implements IProjectionSink {
  readonly name = 'postgres';

  async project(entry: ProjectableEntry): Promise<void> {
    await this.projectBatch([entry]);
  }

  async projectBatch(entries: ProjectableEntry[]): Promise<void> {
    // UPSERT into memory_entries
    // ON CONFLICT (memory_id) DO UPDATE
    // Idempotent, handles re-projection safely
  }

  async remove(memory_ids: string[]): Promise<void> {
    // DELETE FROM memory_entries WHERE memory_id IN (...)
  }

  async healthCheck(): Promise<boolean> {
    // SELECT 1 from pool
  }
}
```

#### 4.4 Projection policies

**File:** `engine/src/memory/projection/policies.ts`

```typescript
import type { MemoryEntry, MemoryLane, MemoryType } from '../types';

export interface ProjectionPolicy {
  allowed_lanes: MemoryLane[];
  allowed_types: MemoryType[];
  require_embedding_ready: boolean;
  redact_episodic_content: boolean;
  filter?: (entry: MemoryEntry) => boolean;
}

export function getDefaultProjectionPolicy(): ProjectionPolicy {
  return {
    allowed_lanes: ['shared', 'market'],
    allowed_types: ['semantic', 'procedural', 'entity', 'trust_weighted', 'temporal'],
    require_embedding_ready: false,
    redact_episodic_content: true,
    filter: undefined,
  };
}

export function shouldProject(
  entry: MemoryEntry,
  policy: ProjectionPolicy,
): boolean {
  if (!policy.allowed_lanes.includes(entry.memory_lane)) return false;
  if (!policy.allowed_types.includes(entry.type)) return false;
  if (policy.require_embedding_ready
    && (entry as any).embedding_status !== 'ready') return false;
  if (policy.filter && !policy.filter(entry)) return false;
  return true;
}
```

Default policy: **NEVER project raw episodic, self lane, or user lane.**

#### 4.5 MemoryProjectionService

**File:** `engine/src/memory/projection/service.ts`

Subscribes to the memory event bus. Filters by policy. Publishes to configured sinks.

```typescript
import {
  getMemoryEventBus,
  MemoryCreatedEvent,
  MemoryDeletedEvent,
} from '../events/memoryEvents';
import {
  shouldProject,
  getDefaultProjectionPolicy,
  ProjectionPolicy,
} from './policies';
import type { IProjectionSink, ProjectableEntry } from './sinks/interface';

export class MemoryProjectionService {
  private sinks: IProjectionSink[];
  private policy: ProjectionPolicy;

  constructor(
    sinks: IProjectionSink[],
    policy?: ProjectionPolicy,
  ) {
    this.sinks = sinks;
    this.policy = policy || getDefaultProjectionPolicy();
  }

  start(): void {
    const bus = getMemoryEventBus();
    bus.on('memory.created', (e: MemoryCreatedEvent) => this.onCreated(e));
    bus.on('memory.deleted', (e: MemoryDeletedEvent) => this.onDeleted(e));
    bus.on('memory.embedding.ready', (e) => this.onEmbeddingReady(e));
  }

  private async onCreated(event: MemoryCreatedEvent): Promise<void> {
    if (!shouldProject(event.entry, this.policy)) return;
    const projectable = this.toProjectable(event.entry);
    for (const sink of this.sinks) {
      try { await sink.project(projectable); }
      catch (err) { /* log, do not fail agent */ }
    }
  }

  private async onDeleted(event: MemoryDeletedEvent): Promise<void> {
    for (const sink of this.sinks) {
      try { await sink.remove(event.memory_ids); }
      catch (err) { /* log */ }
    }
  }

  private async onEmbeddingReady(event: any): Promise<void> {
    // Re-project entry now that embedding is available
    // Useful if policy.require_embedding_ready is true
  }

  private toProjectable(entry: any): ProjectableEntry {
    const base = { ...entry };
    if (this.policy.redact_episodic_content && entry.type === 'episodic') {
      base.content = '[redacted]';
    }
    return base;
  }
}
```

#### 4.6 Env config

```
MEMORY_PROJECTION_ENABLED=false
MEMORY_PROJECTION_SINKS=postgres
MEMORY_PROJECTION_POLICY=default
```

---

## Section 5: SDK Update

### Problem

The SDK's `MemoryNamespace` exposes only episodic/semantic/procedural writes. Missing: entity, trust_weighted, temporal, compact, export. Also missing `./memory` export path in package.json.

### Design

#### 5.1 New MemoryNamespace methods

```typescript
export interface MemoryNamespace {
  // Existing (unchanged)
  addEpisodic(input: { ... }): Promise<MemoryWriteResult>;
  addSemantic(input: { ... }): Promise<MemoryWriteResult>;
  addProcedural(input: { ... }): Promise<MemoryWriteResult>;
  recall(input: { ... }): Promise<RecallResponse>;
  get(memoryId: string): Promise<MemoryEntry | null>;
  query(q: Partial<MemoryQuery>): Promise<MemoryEntry[]>;
  startSession(input?: { namespace?: string }): Promise<string>;
  closeSession(sessionId: string, summary?: string): Promise<void>;
  getSessionContext(sessionId: string, limit?: number): Promise<MemoryEntry[]>;
  listSessions(status?: string[]): Promise<MemorySession[]>;
  verify(namespace?: string): Promise<ChainVerifyResult>;
  stats(): Promise<MemoryStats>;
  snapshot(type: 'checkpoint' | 'migration' | 'archive'): Promise<string>;
  restore(cid: string, options: {
    mode: RestoreMode;
    target_namespace?: string;
  }): Promise<RestoreResult>;
  listSnapshots(): Promise<MemorySnapshot[]>;
  provenance(namespace: string, limit?: number): Promise<ProvenanceRecord[]>;

  // NEW -- v3 additions
  addEntity(input: {
    content?: string; entity_name: string; entity_type: string;
    entity_id?: string; attributes?: Record<string, unknown>;
    relationships?: EntityRelation[]; source_memory_ids?: string[];
    namespace?: string; metadata?: Record<string, unknown>;
    memory_lane?: MemoryLane;
  }): Promise<MemoryWriteResult>;

  addTrustWeighted(input: {
    content?: string; source_agent_passport_id: string;
    trust_score: number; decay_factor: number;
    weighted_relevance: number;
    source_memory_ids?: string[]; namespace?: string;
    metadata?: Record<string, unknown>; memory_lane?: MemoryLane;
  }): Promise<MemoryWriteResult>;

  addTemporal(input: {
    content: string; valid_from: number;
    valid_to?: number | null; recorded_at?: number;
    source_memory_ids?: string[]; namespace?: string;
    metadata?: Record<string, unknown>; memory_lane?: MemoryLane;
  }): Promise<MemoryWriteResult>;

  compact(options?: {
    namespace?: string; session_id?: string;
    mode?: 'warm' | 'cold' | 'full';
  }): Promise<CompactionResult>;

  export(): Promise<LucidMemoryFile>;
}
```

#### 5.2 Implementation in lucid.ts `_buildMemoryNamespace()`

Extend the existing builder to add:
- `addEntity()` calls `service.addEntity()`
- `addTrustWeighted()` calls `service.addTrustWeighted()`
- `addTemporal()` calls `service.addTemporal()`
- `compact()` creates `CompactionPipeline`, calls `compact()`
- `export()` calls `archivePipeline.createLMF()` (in-memory, no DePIN upload)

All wrapped in `this._wrap()` for retry/timeout.

#### 5.3 HTTP client (memory.ts) update

Add matching HTTP methods:
```typescript
addEntity: (input) => httpClient.post('/v1/memory/entity', input),
addTrustWeighted: (input) => httpClient.post('/v1/memory/trust-weighted', input),
addTemporal: (input) => httpClient.post('/v1/memory/temporal', input),
compact: (options) => httpClient.post('/v1/memory/compact', options),
```

#### 5.4 Package exports

In `packages/sdk/package.json`, add:
```json
"./memory": {
  "import": "./dist/memory.js",
  "require": "./dist/memory.cjs"
}
```

In `tsup.config.ts`, add entry:
```typescript
memory: 'src/memory.ts',
```

#### 5.5 Type re-exports

Add to SDK type exports:
```typescript
export type {
  CompactionConfig, CompactionResult,
  MemoryLane, EntityMemory, EntityRelation,
  TrustWeightedMemory, TemporalMemory,
  ValidatedExtractionResult, ExtractionOutputSchema,
  LucidMemoryFile,
} from '@lucid-l2/engine';
```

---

## Section 6: E2E Test Plan

### 6.1 SQLite store tests

**File:** `engine/src/memory/__tests__/sqliteStore.test.ts`

Full `IMemoryStore` contract tests (mirrors `inMemoryStore.test.ts`):

| Test | Description |
|------|-------------|
| write + read round-trip | Write entry, read back, verify all fields |
| query with filters | agent_passport_id, namespace, types, status, lanes, since/before |
| nearestByEmbedding | Write entries with vectors, query, verify ranked by similarity |
| nearestByEmbedding threshold | Below-threshold entries excluded |
| nearestByEmbedding type/lane filter | Only matching type/lane returned |
| deleteBatch transactional | Delete multiple, verify gone, provenance preserved |
| updateCompactionWatermark MAX | Lower watermark rejected |
| sessions CRUD | create, get, updateStats, close, list |
| provenance chain | write, getChain, getForMemory |
| snapshots CRUD | save, get, list |
| updateEmbedding + updateEmbeddingStatus | Write pending, update to ready |
| memory_lane default | Entries default to 'self' lane |
| WAL mode active | Verify PRAGMA journal_mode returns 'wal' |
| schema versioning | Fresh DB gets CURRENT_VERSION, old version migrates |
| memory limits max_entries | Write past limit, verify error |
| count method | Verify count matches query results |
| supersede method | Supersede entry, verify status change |
| archive method | Archive entry, verify status |
| archiveBatch method | Archive multiple entries |
| softDelete method | Soft-delete entry |
| writeBatch method | Write multiple entries atomically |
| getEntriesSince | Filter by timestamp |
| getStats | Verify stats aggregation |
| embedding_status query filter | Query by embedding_status |
| structured_content round-trip | JSON stored and retrieved correctly |

Expected: ~25 tests.

### 6.2 Embedding pipeline tests

**File:** `engine/src/memory/__tests__/embedding.test.ts`

| Test | Description |
|------|-------------|
| MockEmbeddingProvider deterministic | Same input same vector |
| MockEmbeddingProvider unit vector | Output is normalized |
| MockEmbeddingProvider embedBatch | Multiple inputs processed |
| EmbeddingWorker processes pending | Write entry, run tick, verify ready |
| EmbeddingWorker handles failure | Provider throws, status=failed |
| EmbeddingWorker batch processing | Multiple pending in one tick |
| Factory openai requires key | No key throws |
| Factory mock returns provider | Returns MockEmbeddingProvider |
| Factory none returns null | Returns null |
| Worker skips when no pending | Tick with empty queue, no errors |

Expected: ~10 tests.

### 6.3 E2E recall with embeddings

**File:** `engine/src/memory/__tests__/recall-e2e.test.ts`

| Test | Description |
|------|-------------|
| Write embed recall ranked | Full pipeline: addSemantic x5, worker, recall, verify vector-ranked |
| Recall skips pending | Write without worker, recall returns recency-based |
| Recall with lanes filter | Only entries in specified lanes returned |
| Recall with type_boost | Intent classifier boosts correct type |
| Recall overfitting guard | High type_bonus capped by similarity |

Expected: ~5 tests.

### 6.4 Compaction E2E through SQLite

**File:** `engine/src/memory/__tests__/compaction-e2e.test.ts`

| Test | Description |
|------|-------------|
| Warm compaction | Write episodics beyond window, compact, verify archived |
| Cold compaction | Archive, age past retention, compact, verify deleted + provenance |
| Snapshot safety gate | Cold without snapshot blocked |
| Full compaction cycle | Write, warm, cold, verify final state |

Expected: ~4 tests.

### 6.5 Snapshot round-trip through SQLite

**File:** `engine/src/memory/__tests__/snapshot-e2e.test.ts`

| Test | Description |
|------|-------------|
| Write snapshot restore | Write to SQLite, snapshot, new SQLite, restore, verify identical |
| Identity verification | Restore rejects cross-agent snapshot |
| Admin bypass | __admin__ can restore any agent snapshot |

Expected: ~3 tests.

### 6.6 Projection tests

**File:** `engine/src/memory/__tests__/projection.test.ts`

| Test | Description |
|------|-------------|
| shouldProject default policy | shared/market projected, self/user blocked |
| shouldProject episodic blocked | Default policy blocks episodic |
| shouldProject redact episodic | Content becomes '[redacted]' |
| ProjectionService event fires sink | Write memory, event, sink.project called |
| ProjectionService sink failure safe | Sink throws, logged not propagated |
| ProjectionService delete propagates | Delete event, sink.remove called |

Expected: ~6 tests.

### 6.7 Memory event bus tests

**File:** `engine/src/memory/__tests__/events.test.ts`

| Test | Description |
|------|-------------|
| Typed listeners | Register, emit, verify received |
| Wildcard listener | '*' receives all events |
| No listener no error | Emit without listeners safe |

Expected: ~3 tests.

### 6.8 SDK tests

**File:** `sdk/src/__tests__/memory.test.ts`

| Test | Description |
|------|-------------|
| addEntity calls service | Entity stored |
| addTrustWeighted calls service | Trust-weighted stored |
| addTemporal calls service | Temporal stored |
| compact returns CompactionResult | Compaction executes |
| export returns LucidMemoryFile | LMF structure valid |

Expected: ~5 tests.

### 6.9 Test totals

| Suite | Tests |
|-------|-------|
| SQLite store | ~25 |
| Embedding pipeline | ~10 |
| Recall E2E | ~5 |
| Compaction E2E | ~4 |
| Snapshot E2E | ~3 |
| Projection | ~6 |
| Event bus | ~3 |
| SDK memory | ~5 |
| **Total new** | **~61** |
| Existing v2 | 180 |
| **Grand total** | **~241** |

---

## Section 7: Env Configuration Summary

```bash
# Store (default: sqlite)
MEMORY_STORE=sqlite|postgres|memory
MEMORY_DB_PATH=./data/agents/{passport}/memory.db

# Limits
MEMORY_MAX_ENTRIES=100000
MEMORY_MAX_DB_SIZE_MB=500
MEMORY_MAX_VECTOR_ROWS=50000

# Embedding (default: none)
MEMORY_EMBEDDING_PROVIDER=openai|mock|none
OPENAI_API_KEY=sk-...
MEMORY_EMBEDDING_BATCH_SIZE=20
MEMORY_EMBEDDING_POLL_MS=2000
MEMORY_EMBEDDING_MAX_RETRIES=3

# Projection (default: disabled)
MEMORY_PROJECTION_ENABLED=false
MEMORY_PROJECTION_SINKS=postgres
MEMORY_PROJECTION_POLICY=default

# Existing (unchanged)
MEMORY_ENABLED=true|false
MEMORY_EXTRACTION_ENABLED=true|false
MEMORY_RECEIPTS_ENABLED=true|false
MEMORY_EMBEDDING_ENABLED=true|false
```

---

## Section 8: File Inventory

### New files (12)

| File | Purpose |
|------|---------|
| `engine/src/memory/store/sqlite.ts` | SQLiteMemoryStore |
| `engine/src/memory/store/sqlite-schema.ts` | Schema V1 + versioned migrations |
| `engine/src/memory/embedding/interface.ts` | IEmbeddingProvider contract |
| `engine/src/memory/embedding/openai.ts` | OpenAI text-embedding-3-small |
| `engine/src/memory/embedding/mock.ts` | Deterministic mock for tests |
| `engine/src/memory/embedding/worker.ts` | Async background embedding processor |
| `engine/src/memory/embedding/index.ts` | Factory + barrel exports |
| `engine/src/memory/events/memoryEvents.ts` | Event types + singleton bus |
| `engine/src/memory/projection/service.ts` | MemoryProjectionService |
| `engine/src/memory/projection/policies.ts` | Projection rules |
| `engine/src/memory/projection/sinks/interface.ts` | IProjectionSink contract |
| `engine/src/memory/projection/sinks/postgres.ts` | PostgresSink |

### Modified files (13)

| File | Changes |
|------|---------|
| `engine/src/memory/store/interface.ts` | Add `updateEmbeddingStatus()`, `embedding_status` to MemoryQuery |
| `engine/src/memory/store/in-memory.ts` | Implement `updateEmbeddingStatus()`, handle query filter |
| `engine/src/memory/store/postgres.ts` | Implement `updateEmbeddingStatus()`, handle query filter |
| `engine/src/memory/store/index.ts` | Update factory: default sqlite, add getSQLiteStore() |
| `engine/src/memory/types.ts` | Add `embedding_status` to MemoryEntry, memory limit config fields |
| `engine/src/memory/service.ts` | Emit events, write with embedding_status |
| `engine/src/memory/compactionPipeline.ts` | Emit `memory.compacted` event |
| `engine/src/memory/archivePipeline.ts` | Emit `memory.snapshotted` event |
| `engine/src/memory/index.ts` | Barrel exports for embedding, events, projection |
| `sdk/src/lucid.ts` | Add new methods to MemoryNamespace + _buildMemoryNamespace() |
| `sdk/src/memory.ts` | Add HTTP methods for new endpoints |
| `sdk/tsup.config.ts` | Add `memory` entry |
| `sdk/package.json` | Add `./memory` export, add better-sqlite3 + sqlite-vec deps |

### New test files (8)

| File | Tests |
|------|-------|
| `__tests__/sqliteStore.test.ts` | ~25 |
| `__tests__/embedding.test.ts` | ~10 |
| `__tests__/recall-e2e.test.ts` | ~5 |
| `__tests__/compaction-e2e.test.ts` | ~4 |
| `__tests__/snapshot-e2e.test.ts` | ~3 |
| `__tests__/projection.test.ts` | ~6 |
| `__tests__/events.test.ts` | ~3 |
| `sdk/__tests__/memory.test.ts` | ~5 |

### Dependencies to add

`better-sqlite3` and `sqlite-vec` are **optional dependencies** — lazy-required only inside `SQLiteMemoryStore`. Users running `MEMORY_STORE=postgres` or `MEMORY_STORE=memory` do not need them installed.

```json
{
  "optionalDependencies": {
    "better-sqlite3": "^11.0.0",
    "sqlite-vec": "^0.1.0"
  }
}
```

Dev deps:
```json
{
  "@types/better-sqlite3": "^7.6.0"
}
```

The store factory uses dynamic `require()` for SQLite — if packages are missing and `MEMORY_STORE=sqlite`, it throws a clear error: `"SQLite store requires better-sqlite3 and sqlite-vec packages"`.

---

## Section 9: Spec Review Fixes

Fixes applied from architecture review (3 critical, 9 important, 10 minor):

### Critical fixes applied above

- **C1**: `trigger_text` → `"trigger"` (quoted) in SQLite schema. Matches TypeScript `ProceduralMemory.trigger` and Postgres column name.
- **C2**: Replaced wildcard `agent_passport_id: '*'` with dedicated `queryPendingEmbeddings(limit)` store method. No wildcard support needed on `MemoryQuery`.
- **C3**: `updateEmbedding()` now atomically sets `embedding_status = 'ready'`. Added `embedding_status` and `embedding_attempts` to `MemoryEntry` type. Single atomic call replaces two-step update.

### Important fixes

**I1-I3: Postgres schema parity**

The v2 migration (`20260313_memory_map_v2.sql`) already adds `memory_lane` and `last_compacted_turn_index`. The `entity_id` column and `'delete'` operation CHECK were also added in v2. However, implementers MUST verify this at migration time. A new Postgres parity patch should be generated if any gaps remain:

```sql
-- Postgres parity patch (apply if columns missing)
ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS embedding_status TEXT DEFAULT 'pending';
ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS embedding_attempts INTEGER DEFAULT 0;
```

**I4: `deleted_memory_hash` in ProvenanceRecord**

Add to TypeScript type: `deleted_memory_hash?: string`. DB-only audit field, present in both SQLite and Postgres schemas.

**I5: Provenance `memory_id` nullability**

SQLite uses `ON DELETE SET NULL` (correct for audit logs — provenance survives entry deletion). TypeScript type updated: `memory_id: string | null`. Postgres migration must also be updated to match.

**I7: Configurable vector dimensions**

`initSchema()` accepts `dimensions` parameter (default 1536). The `vec0` virtual table creation uses this value:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors USING vec0(
  memory_id TEXT PRIMARY KEY,
  embedding FLOAT[${dimensions}]
);
```

Sourced from `IEmbeddingProvider.dimensions` or `MEMORY_EMBEDDING_DIMENSIONS` env var.

**I8: SDK export `types` field**

```json
"./memory": {
  "types": "./dist/memory.d.ts",
  "import": "./dist/memory.js",
  "require": "./dist/memory.cjs"
}
```

Also: align `a2a` and `marketplace` entries in tsup.config.ts alongside `memory`.

**I9: Native deps as optional**

Applied above — `better-sqlite3` and `sqlite-vec` moved to `optionalDependencies` with lazy `require()` in factory.

### Minor fixes

- **M1**: `embedding_attempts` column added. `queryPendingEmbeddings` filters by `embedding_attempts < maxRetries`. `markEmbeddingFailed` increments counter.
- **M2**: sqlite-vec distance metric — implementation must verify sqlite-vec default and configure cosine distance. If L2, use `1 / (1 + distance)` instead of `1 - distance`.
- **M3**: Add `resetMemoryEventBus()` for test isolation (creates fresh EventEmitter).
- **M4**: `MemoryProjectionService` gets `stop()` method that removes all listeners.
- **M6**: Default store stays `'memory'` in v3 to avoid breaking change. SQLite requires explicit `MEMORY_STORE=sqlite` opt-in. Change to sqlite default in v4 after adoption period.
- **M7**: SDK `addEntity` `content` defaults to `entity_name` if not provided (matches route behavior).
- **M8**: Add `EntityRelation` to engine barrel exports in `memory/index.ts`.
- **M10**: Add concurrent read/write test for WAL mode verification.
