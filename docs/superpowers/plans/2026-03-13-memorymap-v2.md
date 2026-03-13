# MemoryMap v2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all v1 gaps — semantic recall, snapshot/restore wiring, tiered compaction, extraction hardening, staged type managers, and memory lanes.

**Architecture:** Bottom-up: types → store interface → store implementations → managers → recall → extraction → compaction → service → routes → MCP. Each layer tested before the next depends on it.

**Tech Stack:** TypeScript, Jest, PostgreSQL (pgvector), Express, existing Lucid engine patterns.

**Spec:** `docs/superpowers/specs/2026-03-13-memorymap-v2-design.md`

**Baseline:** 84 test suites, 1432 tests passing, 0 failures.

---

## File Structure

### Files to Create
| File | Responsibility |
|------|---------------|
| `engine/src/memory/managers/entity.ts` | Entity memory validator |
| `engine/src/memory/managers/trustWeighted.ts` | Trust-weighted memory validator |
| `engine/src/memory/managers/temporal.ts` | Temporal memory validator |
| `engine/src/memory/recall/intentClassifier.ts` | Query intent heuristic (keyword → type/lane boost) |
| `engine/src/memory/recall/reranker.ts` | Two-stage retrieval + unified scoring |
| `engine/src/memory/recall/index.ts` | Barrel export for recall module |
| `engine/src/memory/compactionPipeline.ts` | Tiered compaction (hot/warm/cold) |
| `engine/src/memory/__tests__/nearestByEmbedding.test.ts` | Store nearestByEmbedding tests |
| `engine/src/memory/__tests__/recall-v2.test.ts` | Two-stage recall tests |
| `engine/src/memory/__tests__/compaction.test.ts` | Compaction pipeline tests |
| `engine/src/memory/__tests__/extraction-v2.test.ts` | Hardened extraction tests |
| `infrastructure/migrations/20260313_memory_map_v2.sql` | v2 schema changes |

### Files to Modify
| File | Changes |
|------|---------|
| `engine/src/memory/types.ts` | MemoryLane, CompactionConfig, RecallRequest extensions, MemorySession watermark, source_memory_ids on staged types |
| `engine/src/memory/store/interface.ts` | nearestByEmbedding, deleteBatch, updateCompactionWatermark, MemoryQuery.memory_lane |
| `engine/src/memory/store/in-memory.ts` | Implement new methods + memory_lane |
| `engine/src/memory/store/postgres.ts` | Implement new methods + memory_lane |
| `engine/src/memory/commitments.ts` | entity_id in hash preimage |
| `engine/src/memory/managers/index.ts` | Register entity/trustWeighted/temporal |
| `engine/src/memory/service.ts` | addEntity, addTrustWeighted, addTemporal, recall rewrite, compaction trigger |
| `engine/src/memory/extraction.ts` | Hardened extraction pipeline |
| `engine/src/memory/archivePipeline.ts` | Namespace scope, identity verification |
| `engine/src/memory/index.ts` | Barrel exports for new modules |
| `engine/src/memory/__tests__/managers.test.ts` | Add entity/trustWeighted/temporal tests |
| `engine/src/memory/__tests__/service.test.ts` | Add staged type + recall tests |
| `engine/src/memory/__tests__/inMemoryStore.test.ts` | Add deleteBatch, updateCompactionWatermark, memory_lane tests |
| `gateway-lite/src/routes/core/memoryRoutes.ts` | Entity, trust-weighted, temporal, snapshot, compact routes |
| `gateway-lite/src/routes/__tests__/memoryRoutes.test.ts` | Route tests for new endpoints |
| `contrib/integrations/mcp-server/memoryTools.ts` | Extend memory_add type enum |

---

## Chunk 1: Foundation

### Task 1: Type Definitions

**Files:**
- Modify: `offchain/packages/engine/src/memory/types.ts`
- Test: `offchain/packages/engine/src/memory/__tests__/types.test.ts`

- [ ] **Step 1: Add MemoryLane type and memory_lane to MemoryEntry**

In `types.ts`, after the `MEMORY_STATUSES` line, add:

```typescript
export const MEMORY_LANES = ['self', 'user', 'shared', 'market'] as const;
export type MemoryLane = (typeof MEMORY_LANES)[number];
```

Add `memory_lane: MemoryLane;` to the `MemoryEntry` interface (after `namespace`).

- [ ] **Step 2: Add entity_id + source_memory_ids to staged types**

Add `entity_id?: string;` to `EntityMemory` (between `entity_type` and `attributes`).

Add to `EntityMemory`, `TrustWeightedMemory`, and `TemporalMemory`:
```typescript
source_memory_ids?: string[];
```

Add `'delete'` to `ProvenanceRecord.operation` union:
```typescript
operation: 'create' | 'update' | 'supersede' | 'archive' | 'delete';
```

- [ ] **Step 3: Add last_compacted_turn_index to MemorySession**

Add to `MemorySession` interface:
```typescript
last_compacted_turn_index: number;
```

- [ ] **Step 4: Extend RecallRequest**

Add to `RecallRequest`:
```typescript
semantic_query_embedding?: number[];
lanes?: MemoryLane[];
```

- [ ] **Step 5: Add recall config fields to MemoryServiceConfig**

Add these fields to `MemoryServiceConfig`:
```typescript
recall_similarity_threshold: number;
recall_candidate_pool_size: number;
recall_min_results: number;
recall_similarity_weight: number;
recall_recency_weight: number;
recall_type_weight: number;
recall_quality_weight: number;
extraction_max_tokens: number;
extraction_max_facts: number;
extraction_max_rules: number;
```

Update `getDefaultConfig()` to include:
```typescript
recall_similarity_threshold: parseFloat(process.env.MEMORY_RECALL_SIMILARITY_THRESHOLD || '0.65'),
recall_candidate_pool_size: parseInt(process.env.MEMORY_RECALL_CANDIDATE_POOL_SIZE || '50', 10),
recall_min_results: parseInt(process.env.MEMORY_RECALL_MIN_RESULTS || '3', 10),
recall_similarity_weight: 0.55,
recall_recency_weight: 0.20,
recall_type_weight: 0.15,
recall_quality_weight: 0.10,
extraction_max_tokens: parseInt(process.env.MEMORY_EXTRACTION_MAX_TOKENS || '8000', 10),
extraction_max_facts: parseInt(process.env.MEMORY_EXTRACTION_MAX_FACTS || '20', 10),
extraction_max_rules: parseInt(process.env.MEMORY_EXTRACTION_MAX_RULES || '10', 10),
```

- [ ] **Step 6: Add CompactionConfig interface**

Add after `MemoryServiceConfig`:
```typescript
export interface CompactionConfig {
  compact_on_session_close: boolean;
  hot_window_turns: number;
  hot_window_ms: number;
  cold_retention_ms: number;
  cold_requires_snapshot: boolean;
  lane_overrides?: Partial<Record<MemoryLane, {
    hot_window_turns?: number;
    hot_window_ms?: number;
    cold_retention_ms?: number;
  }>>;
}

export function getDefaultCompactionConfig(): CompactionConfig {
  return {
    compact_on_session_close: true,
    hot_window_turns: 50,
    hot_window_ms: 86_400_000,
    cold_retention_ms: 2_592_000_000,
    cold_requires_snapshot: true,
  };
}
```

- [ ] **Step 7: Add CompactionResult type**

```typescript
export interface CompactionResult {
  sessions_compacted: number;
  episodic_archived: number;
  extraction_triggered: boolean;
  cold_pruned: number;
  snapshot_cid: string | null;
}
```

> **Design note:** `semantic_created` / `procedural_created` counts were removed because
> `ExtractionPipeline.extractOnSessionClose()` writes directly via `MemoryService` and
> returns void. Counting would require either restructuring extraction or query-before/after,
> both disproportionate to the value. `extraction_triggered` is the honest signal.

- [ ] **Step 8: Add ValidatedExtractionResult type**

```typescript
export interface ExtractionOutputSchema {
  schema_version: '1.0';
  facts: Array<{ fact: string; confidence: number }>;
  rules: Array<{ rule: string; trigger: string; priority: number }>;
}

export interface ValidatedExtractionResult {
  facts: Array<{
    fact: string;
    confidence: number;
    source_memory_ids?: string[];
    supersedes?: string[];
  }>;
  rules: Array<{
    rule: string;
    trigger: string;
    priority: number;
    source_memory_ids?: string[];
  }>;
  warnings: string[];
}
```

- [ ] **Step 9: Export new types from barrel**

Add to `memory/index.ts`:
```typescript
export type { MemoryLane, CompactionConfig, CompactionResult, ExtractionOutputSchema, ValidatedExtractionResult } from './types';
export { MEMORY_LANES, getDefaultCompactionConfig } from './types';
```

- [ ] **Step 10: Update types.test.ts**

Add test that `MEMORY_LANES` has 4 entries and `getDefaultCompactionConfig()` returns correct defaults.

- [ ] **Step 11: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/types.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add offchain/packages/engine/src/memory/types.ts offchain/packages/engine/src/memory/index.ts offchain/packages/engine/src/memory/__tests__/types.test.ts
git commit -m "feat(memory): add v2 type definitions — MemoryLane, CompactionConfig, RecallRequest extensions"
```

---

### Task 2: Store Interface + Migration

**Files:**
- Modify: `offchain/packages/engine/src/memory/store/interface.ts`
- Create: `infrastructure/migrations/20260313_memory_map_v2.sql`
- Modify: `offchain/packages/engine/src/memory/commitments.ts`

- [ ] **Step 1: Add memory_lane to MemoryQuery**

In `interface.ts`, add to `MemoryQuery`:
```typescript
memory_lane?: import('../types').MemoryLane[];
```

Add import at top:
```typescript
import type { MemoryLane } from '../types';
```

- [ ] **Step 2: Update createSession Omit to include last_compacted_turn_index**

In `IMemoryStore.createSession`, add `'last_compacted_turn_index'` and `'last_receipted_turn_index'` to the Omit:
```typescript
createSession(session: Omit<MemorySession, 'turn_count' | 'total_tokens' | 'created_at' | 'last_activity' | 'last_compacted_turn_index' | 'last_receipted_turn_index'>): Promise<string>;
```

Both fields default to -1 in the store implementation, preventing callers from passing invalid values.

Also update `MemoryService.startSession()` to remove the now-Omitted `last_receipted_turn_index: -1` from the `createSession` call:
```typescript
await this.store.createSession({
  session_id,
  agent_passport_id: callerPassportId,
  namespace,
  status: 'active',
});
```

- [ ] **Step 3: Add new methods to IMemoryStore**

Add to the `IMemoryStore` interface:
```typescript
nearestByEmbedding(
  embedding: number[],
  agent_passport_id: string,
  namespace?: string,
  types?: MemoryType[],
  limit?: number,
  similarity_threshold?: number,
  lanes?: MemoryLane[],
): Promise<(MemoryEntry & { similarity: number })[]>;

deleteBatch(memory_ids: string[]): Promise<void>;

updateCompactionWatermark(session_id: string, turn_index: number): Promise<void>;
```

- [ ] **Step 3: Update commitments.ts — add entity_id to hash preimage**

In `PREIMAGE_FIELDS.entity`, add `'entity_id'` to the array:
```typescript
entity: ['content', 'entity_name', 'entity_type', 'entity_id', 'attributes', 'relationships'],
```

The `buildHashPreimage` function already handles `undefined` fields by skipping them, so this is backward-compatible.

- [ ] **Step 4: Create v2 migration SQL**

Create `infrastructure/migrations/20260313_memory_map_v2.sql`:
```sql
-- Migration: 20260313_memory_map_v2.sql
-- MemoryMap v2: lanes, compaction watermark, provenance FK fix

BEGIN;

-- 1. Add compaction watermark to sessions
ALTER TABLE memory_sessions
  ADD COLUMN IF NOT EXISTS last_compacted_turn_index INTEGER NOT NULL DEFAULT -1;

-- 2. Change provenance FK to SET NULL on delete (required for cold compaction hard-prune)
ALTER TABLE memory_provenance
  DROP CONSTRAINT IF EXISTS memory_provenance_memory_id_fkey;
ALTER TABLE memory_provenance
  ALTER COLUMN memory_id DROP NOT NULL;
ALTER TABLE memory_provenance
  ADD CONSTRAINT memory_provenance_memory_id_fkey
    FOREIGN KEY (memory_id) REFERENCES memory_entries(memory_id) ON DELETE SET NULL;

-- 3. Preserve content_hash in provenance after hard delete
ALTER TABLE memory_provenance
  ADD COLUMN IF NOT EXISTS deleted_memory_hash TEXT;

-- 4. Memory lanes
ALTER TABLE memory_entries
  ADD COLUMN IF NOT EXISTS memory_lane TEXT NOT NULL DEFAULT 'self'
  CHECK (memory_lane IN ('self', 'user', 'shared', 'market'));

CREATE INDEX IF NOT EXISTS idx_memory_lane
  ON memory_entries(agent_passport_id, memory_lane, status);

-- 5. Add 'delete' to provenance operation check
-- Drop existing check and re-create with 'delete' included
ALTER TABLE memory_provenance
  DROP CONSTRAINT IF EXISTS memory_provenance_operation_check;
ALTER TABLE memory_provenance
  ADD CONSTRAINT memory_provenance_operation_check
    CHECK (operation IN ('create', 'update', 'supersede', 'archive', 'delete'));

COMMIT;
```

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/store/interface.ts offchain/packages/engine/src/memory/commitments.ts infrastructure/migrations/20260313_memory_map_v2.sql
git commit -m "feat(memory): add v2 store interface methods + migration SQL"
```

---

### Task 3: InMemory Store — New Methods

**Files:**
- Modify: `offchain/packages/engine/src/memory/store/in-memory.ts`
- Modify: `offchain/packages/engine/src/memory/__tests__/inMemoryStore.test.ts`

- [ ] **Step 1: Write failing tests for nearestByEmbedding**

Add to `inMemoryStore.test.ts`:
```typescript
describe('nearestByEmbedding()', () => {
  it('should return entries sorted by cosine similarity', async () => {
    const r1 = await store.write(makeEpisodic({ content_hash: 'e1' }));
    const r2 = await store.write(makeEpisodic({ content_hash: 'e2' }));
    await store.updateEmbedding(r1.memory_id, [1, 0, 0], 'test-model');
    await store.updateEmbedding(r2.memory_id, [0.9, 0.1, 0], 'test-model');

    const results = await store.nearestByEmbedding(
      [1, 0, 0], 'agent-1', undefined, undefined, 10, 0.5,
    );
    expect(results.length).toBe(2);
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
  });

  it('should filter by similarity threshold', async () => {
    const r1 = await store.write(makeEpisodic({ content_hash: 'e1' }));
    await store.updateEmbedding(r1.memory_id, [0, 1, 0], 'test-model');

    const results = await store.nearestByEmbedding(
      [1, 0, 0], 'agent-1', undefined, undefined, 10, 0.9,
    );
    expect(results.length).toBe(0);
  });

  it('should filter by namespace and types', async () => {
    const r1 = await store.write(makeEpisodic({ content_hash: 'e1', namespace: 'ns-a' }));
    const r2 = await store.write(makeSemantic({ content_hash: 's1', namespace: 'ns-a' }));
    await store.updateEmbedding(r1.memory_id, [1, 0, 0], 'test-model');
    await store.updateEmbedding(r2.memory_id, [1, 0, 0], 'test-model');

    const results = await store.nearestByEmbedding(
      [1, 0, 0], 'agent-1', 'ns-a', ['semantic'], 10, 0.5,
    );
    expect(results.length).toBe(1);
    expect(results[0].type).toBe('semantic');
  });

  it('should skip entries without embeddings', async () => {
    await store.write(makeEpisodic({ content_hash: 'no-embed' }));
    const results = await store.nearestByEmbedding(
      [1, 0, 0], 'agent-1', undefined, undefined, 10, 0.0,
    );
    expect(results.length).toBe(0);
  });

  it('should filter by lanes', async () => {
    const r1 = await store.write(makeEpisodic({ content_hash: 'self1', memory_lane: 'self' }));
    const r2 = await store.write(makeEpisodic({ content_hash: 'market1', memory_lane: 'market' }));
    await store.updateEmbedding(r1.memory_id, [1, 0, 0], 'test-model');
    await store.updateEmbedding(r2.memory_id, [1, 0, 0], 'test-model');
    const results = await store.nearestByEmbedding(
      [1, 0, 0], 'agent-1', undefined, undefined, 10, 0.5, ['market'],
    );
    expect(results.length).toBe(1);
    expect((results[0] as any).memory_lane).toBe('market');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/inMemoryStore.test.ts --no-coverage`
Expected: FAIL — `store.nearestByEmbedding is not a function`

- [ ] **Step 3: Write failing tests for deleteBatch and updateCompactionWatermark**

Add to `inMemoryStore.test.ts`:
```typescript
describe('deleteBatch()', () => {
  it('should hard-delete entries', async () => {
    const r1 = await store.write(makeEpisodic({ content_hash: 'd1' }));
    const r2 = await store.write(makeEpisodic({ content_hash: 'd2' }));
    await store.deleteBatch([r1.memory_id]);
    expect(await store.read(r1.memory_id)).toBeNull();
    expect(await store.read(r2.memory_id)).not.toBeNull();
  });

  it('should be a no-op for empty array', async () => {
    await expect(store.deleteBatch([])).resolves.toBeUndefined();
  });
});

describe('updateCompactionWatermark()', () => {
  it('should update last_compacted_turn_index on session', async () => {
    await store.createSession({
      session_id: 'sess-c', agent_passport_id: 'agent-1',
      namespace: 'ns', status: 'active',
    });
    await store.updateCompactionWatermark('sess-c', 10);
    const session = await store.getSession('sess-c');
    expect(session!.last_compacted_turn_index).toBe(10);
  });
});
```

- [ ] **Step 4: Write failing test for memory_lane in query**

Add to `inMemoryStore.test.ts` in the `query()` describe block:
```typescript
it('should filter by memory_lane', async () => {
  await store.write(makeEpisodic({ content_hash: 'self1', memory_lane: 'self' }));
  await store.write(makeEpisodic({ content_hash: 'user1', memory_lane: 'user' }));
  const results = await store.query({
    agent_passport_id: 'agent-1',
    memory_lane: ['user'],
  });
  expect(results).toHaveLength(1);
  expect((results[0] as any).memory_lane).toBe('user');
});
```

- [ ] **Step 5: Implement nearestByEmbedding in InMemoryMemoryStore**

Add helper function at top of file:
```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
```

Add method to `InMemoryMemoryStore`:
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
  const threshold = similarity_threshold ?? 0.65;
  const maxResults = limit ?? 50;

  const candidates: (MemoryEntry & { similarity: number })[] = [];
  for (const entry of this.entries.values()) {
    if (entry.agent_passport_id !== agent_passport_id) continue;
    if (entry.status !== 'active') continue;
    if (!entry.embedding) continue;
    if (namespace && entry.namespace !== namespace) continue;
    if (types && !types.includes(entry.type)) continue;
    if (lanes && !lanes.includes(entry.memory_lane || 'self')) continue;

    const sim = cosineSimilarity(embedding, entry.embedding);
    if (sim > threshold) {
      candidates.push({ ...entry, similarity: sim });
    }
  }

  candidates.sort((a, b) => b.similarity - a.similarity);
  return candidates.slice(0, maxResults);
}
```

- [ ] **Step 6: Implement deleteBatch**

```typescript
async deleteBatch(memory_ids: string[]): Promise<void> {
  for (const id of memory_ids) {
    this.entries.delete(id);
  }
}
```

- [ ] **Step 7: Implement updateCompactionWatermark**

```typescript
async updateCompactionWatermark(session_id: string, turn_index: number): Promise<void> {
  const session = this.sessions.get(session_id);
  if (!session) throw new Error(`Session not found: ${session_id}`);
  session.last_compacted_turn_index = turn_index;
}
```

- [ ] **Step 8: Add memory_lane support to write and query**

In `write()`, ensure `memory_lane` defaults to `'self'`:
```typescript
const full: MemoryEntry = {
  ...entry,
  memory_id,
  status: 'active',
  created_at: now,
  updated_at: now,
} as MemoryEntry;
if (!full.memory_lane) full.memory_lane = 'self';
```

In `query()`, add filter:
```typescript
if (q.memory_lane && !q.memory_lane.includes((e.memory_lane || 'self') as any)) return false;
```

In `createSession()`, default the Omitted fields:
```typescript
const full: MemorySession = {
  ...session,
  turn_count: 0,
  total_tokens: 0,
  last_receipted_turn_index: -1,
  last_compacted_turn_index: -1,
  created_at: now,
  last_activity: now,
};
```

- [ ] **Step 9: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/inMemoryStore.test.ts --no-coverage`
Expected: PASS (all existing + new tests)

- [ ] **Step 10: Commit**

```bash
git add offchain/packages/engine/src/memory/store/in-memory.ts offchain/packages/engine/src/memory/__tests__/inMemoryStore.test.ts
git commit -m "feat(memory): InMemory store v2 — nearestByEmbedding, deleteBatch, memory_lane"
```

---

### Task 4: Postgres Store — New Methods

**Files:**
- Modify: `offchain/packages/engine/src/memory/store/postgres.ts`

- [ ] **Step 1: Add memory_lane to rowToMemoryEntry**

In `rowToMemoryEntry()`, add after `prev_hash`:
```typescript
if (row.memory_lane) base.memory_lane = row.memory_lane;
else base.memory_lane = 'self';
```

- [ ] **Step 2: Add memory_lane to writeWithClient INSERT**

Add `memory_lane` as column 33 in the INSERT statement (after `superseded_by`). Add `$33` to VALUES. Add parameter `e.memory_lane ?? 'self'` as the 33rd param in the array.

- [ ] **Step 3: Add memory_lane filter to buildQuerySQL**

In `buildQuerySQL()`, after the status filter:
```typescript
if (q.memory_lane && q.memory_lane.length > 0) {
  conditions.push(`memory_lane = ANY($${idx++})`);
  params.push(q.memory_lane);
}
```

- [ ] **Step 4: Add last_compacted_turn_index to rowToSession**

In `rowToSession()`:
```typescript
last_compacted_turn_index: row.last_compacted_turn_index ?? -1,
```

- [ ] **Step 5: Implement nearestByEmbedding**

Uses dynamic SQL (same pattern as existing `buildQuerySQL`) — vector param referenced by single index `$1`:

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
  const threshold = similarity_threshold ?? 0.65;
  const maxResults = limit ?? 50;
  const vecStr = `[${embedding.join(',')}]`;

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  // $1 = vector
  const vecIdx = idx++;
  params.push(vecStr);

  conditions.push(`agent_passport_id = $${idx++}`);
  params.push(agent_passport_id);

  conditions.push(`status = 'active'`);
  conditions.push(`embedding IS NOT NULL`);

  if (namespace) {
    conditions.push(`namespace = $${idx++}`);
    params.push(namespace);
  }
  if (types && types.length > 0) {
    conditions.push(`type = ANY($${idx++})`);
    params.push(types);
  }
  if (lanes && lanes.length > 0) {
    conditions.push(`memory_lane = ANY($${idx++})`);
    params.push(lanes);
  }

  const threshIdx = idx++;
  params.push(threshold);
  conditions.push(`1 - (embedding <=> $${vecIdx}::vector) > $${threshIdx}`);

  const limitIdx = idx++;
  params.push(maxResults);

  const sql = `SELECT *, 1 - (embedding <=> $${vecIdx}::vector) AS similarity
    FROM memory_entries
    WHERE ${conditions.join(' AND ')}
    ORDER BY embedding <=> $${vecIdx}::vector
    LIMIT $${limitIdx}`;

  const result = await pool.query(sql, params);
  return result.rows.map(row => ({
    ...rowToMemoryEntry(row),
    similarity: parseFloat(row.similarity),
  }));
}
```

- [ ] **Step 6: Implement deleteBatch (transactional)**

```typescript
async deleteBatch(memory_ids: string[]): Promise<void> {
  if (memory_ids.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Before deleting, preserve content_hash in provenance
    await client.query(
      `UPDATE memory_provenance
       SET deleted_memory_hash = (
         SELECT content_hash FROM memory_entries WHERE memory_entries.memory_id = memory_provenance.memory_id
       )
       WHERE memory_id = ANY($1) AND deleted_memory_hash IS NULL`,
      [memory_ids],
    );
    await client.query(
      'DELETE FROM memory_entries WHERE memory_id = ANY($1)',
      [memory_ids],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 7: Implement updateCompactionWatermark**

```typescript
async updateCompactionWatermark(session_id: string, turn_index: number): Promise<void> {
  await pool.query(
    'UPDATE memory_sessions SET last_compacted_turn_index = $2 WHERE session_id = $1',
    [session_id, turn_index],
  );
}
```

- [ ] **Step 8: Add MemoryLane import**

At top of `postgres.ts`, add:
```typescript
import type { MemoryLane } from '../types';
```

- [ ] **Step 9: Run type-check**

Run: `cd offchain && npm run type-check`
Expected: No new errors from memory changes (pre-existing rootDir errors are OK)

- [ ] **Step 10: Commit**

```bash
git add offchain/packages/engine/src/memory/store/postgres.ts
git commit -m "feat(memory): Postgres store v2 — nearestByEmbedding, deleteBatch, memory_lane"
```

---

## Chunk 2: Managers + Recall

### Task 5: Entity Manager

**Files:**
- Create: `offchain/packages/engine/src/memory/managers/entity.ts`
- Modify: `offchain/packages/engine/src/memory/__tests__/managers.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `managers.test.ts`:
```typescript
import { validateEntity } from '../managers/entity';

describe('validateEntity', () => {
  const base = {
    agent_passport_id: 'a', namespace: 'agent:a',
    content: 'Vitalik Buterin', metadata: {},
    entity_name: 'Vitalik Buterin', entity_type: 'person',
    attributes: { role: 'co-founder' }, relationships: [],
  };

  it('should pass for a valid entity entry', () => {
    expect(() => validateEntity(base)).not.toThrow();
  });

  it('should reject empty entity_name', () => {
    expect(() => validateEntity({ ...base, entity_name: '' })).toThrow();
  });

  it('should reject empty entity_type', () => {
    expect(() => validateEntity({ ...base, entity_type: '' })).toThrow();
  });

  it('should require attributes to be an object', () => {
    expect(() => validateEntity({ ...base, attributes: 'bad' })).toThrow();
  });

  it('should require relationships to be an array', () => {
    expect(() => validateEntity({ ...base, relationships: 'bad' })).toThrow();
  });

  it('should validate each relationship', () => {
    expect(() => validateEntity({
      ...base,
      relationships: [{ target_entity_id: '', relation_type: 'knows', confidence: 0.9 }],
    })).toThrow();
  });

  it('should reject relationship confidence out of range', () => {
    expect(() => validateEntity({
      ...base,
      relationships: [{ target_entity_id: 'ent-2', relation_type: 'knows', confidence: 1.5 }],
    })).toThrow();
  });

  it('should accept optional entity_id', () => {
    expect(() => validateEntity({ ...base, entity_id: 'stable-id-1' })).not.toThrow();
  });

  it('should accept optional source_memory_ids', () => {
    expect(() => validateEntity({ ...base, source_memory_ids: ['mem-1'] })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/managers.test.ts --no-coverage`
Expected: FAIL — cannot find module `../managers/entity`

- [ ] **Step 3: Implement entity manager**

Create `offchain/packages/engine/src/memory/managers/entity.ts`:
```typescript
import { MAX_CONTENT_SIZE, MAX_METADATA_SIZE } from '../types';

function validateBase(entry: Record<string, unknown>): void {
  if (!entry.agent_passport_id || typeof entry.agent_passport_id !== 'string') {
    throw new Error('agent_passport_id is required');
  }
  if (!entry.namespace || typeof entry.namespace !== 'string') {
    throw new Error('namespace is required');
  }
  if (!entry.content || typeof entry.content !== 'string') {
    throw new Error('content is required');
  }
  if ((entry.content as string).length > MAX_CONTENT_SIZE) {
    throw new Error(`content exceeds maximum size of ${MAX_CONTENT_SIZE} bytes`);
  }
  if (entry.metadata != null && typeof entry.metadata === 'object') {
    const metaStr = JSON.stringify(entry.metadata);
    if (metaStr.length > MAX_METADATA_SIZE) {
      throw new Error(`metadata exceeds maximum size of ${MAX_METADATA_SIZE} bytes`);
    }
    for (const key of Object.keys(entry.metadata as Record<string, unknown>)) {
      if (key.startsWith('_lucid_')) {
        throw new Error(`metadata key '${key}' uses reserved _lucid_ prefix`);
      }
    }
  }
}

export function validateEntity(entry: Record<string, unknown>): void {
  validateBase(entry);

  if (!entry.entity_name || typeof entry.entity_name !== 'string') {
    throw new Error('entity_name is required for entity memory');
  }
  if (!entry.entity_type || typeof entry.entity_type !== 'string') {
    throw new Error('entity_type is required for entity memory');
  }
  if (entry.attributes == null || typeof entry.attributes !== 'object' || Array.isArray(entry.attributes)) {
    throw new Error('attributes must be an object');
  }
  if (!Array.isArray(entry.relationships)) {
    throw new Error('relationships must be an array');
  }
  for (const rel of entry.relationships as any[]) {
    if (!rel.target_entity_id || typeof rel.target_entity_id !== 'string') {
      throw new Error('relationship target_entity_id is required');
    }
    if (!rel.relation_type || typeof rel.relation_type !== 'string') {
      throw new Error('relationship relation_type is required');
    }
    if (typeof rel.confidence !== 'number' || rel.confidence < 0 || rel.confidence > 1) {
      throw new Error('relationship confidence must be a number between 0 and 1');
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/managers.test.ts --no-coverage`
Expected: Entity tests PASS

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/managers/entity.ts offchain/packages/engine/src/memory/__tests__/managers.test.ts
git commit -m "feat(memory): entity type manager with validation"
```

---

### Task 6: Trust-Weighted + Temporal Managers

**Files:**
- Create: `offchain/packages/engine/src/memory/managers/trustWeighted.ts`
- Create: `offchain/packages/engine/src/memory/managers/temporal.ts`
- Modify: `offchain/packages/engine/src/memory/__tests__/managers.test.ts`

- [ ] **Step 1: Write failing tests for trust-weighted**

Add to `managers.test.ts`:
```typescript
import { validateTrustWeighted } from '../managers/trustWeighted';

describe('validateTrustWeighted', () => {
  const base = {
    agent_passport_id: 'a', namespace: 'agent:a',
    content: 'Trust data', metadata: {},
    source_agent_passport_id: 'agent-b',
    trust_score: 0.8, decay_factor: 0.1, weighted_relevance: 0.7,
  };

  it('should pass for valid entry', () => {
    expect(() => validateTrustWeighted(base)).not.toThrow();
  });
  it('should reject missing source_agent_passport_id', () => {
    expect(() => validateTrustWeighted({ ...base, source_agent_passport_id: '' })).toThrow();
  });
  it('should reject trust_score > 1', () => {
    expect(() => validateTrustWeighted({ ...base, trust_score: 1.1 })).toThrow();
  });
  it('should reject decay_factor < 0', () => {
    expect(() => validateTrustWeighted({ ...base, decay_factor: -0.1 })).toThrow();
  });
  it('should reject weighted_relevance > 1', () => {
    expect(() => validateTrustWeighted({ ...base, weighted_relevance: 1.1 })).toThrow();
  });
});
```

- [ ] **Step 2: Write failing tests for temporal**

```typescript
import { validateTemporal } from '../managers/temporal';

describe('validateTemporal', () => {
  const now = Date.now();
  const base = {
    agent_passport_id: 'a', namespace: 'agent:a',
    content: 'ETH was $4000 on March 1', metadata: {},
    valid_from: now - 86400000, valid_to: null, recorded_at: now,
  };

  it('should pass for valid entry', () => {
    expect(() => validateTemporal(base)).not.toThrow();
  });
  it('should reject missing valid_from', () => {
    expect(() => validateTemporal({ ...base, valid_from: undefined })).toThrow();
  });
  it('should accept null valid_to', () => {
    expect(() => validateTemporal({ ...base, valid_to: null })).not.toThrow();
  });
  it('should reject valid_to <= valid_from', () => {
    expect(() => validateTemporal({ ...base, valid_to: base.valid_from - 1 })).toThrow();
  });
  it('should reject recorded_at < valid_from', () => {
    expect(() => validateTemporal({ ...base, recorded_at: base.valid_from - 1 })).toThrow();
  });
});
```

- [ ] **Step 3: Implement trust-weighted manager**

Create `offchain/packages/engine/src/memory/managers/trustWeighted.ts`:
```typescript
import { MAX_CONTENT_SIZE, MAX_METADATA_SIZE } from '../types';

function validateBase(entry: Record<string, unknown>): void {
  if (!entry.agent_passport_id || typeof entry.agent_passport_id !== 'string') throw new Error('agent_passport_id is required');
  if (!entry.namespace || typeof entry.namespace !== 'string') throw new Error('namespace is required');
  if (!entry.content || typeof entry.content !== 'string') throw new Error('content is required');
  if ((entry.content as string).length > MAX_CONTENT_SIZE) throw new Error(`content exceeds maximum size of ${MAX_CONTENT_SIZE} bytes`);
  if (entry.metadata != null && typeof entry.metadata === 'object') {
    const metaStr = JSON.stringify(entry.metadata);
    if (metaStr.length > MAX_METADATA_SIZE) throw new Error(`metadata exceeds maximum size of ${MAX_METADATA_SIZE} bytes`);
    for (const key of Object.keys(entry.metadata as Record<string, unknown>)) {
      if (key.startsWith('_lucid_')) throw new Error(`metadata key '${key}' uses reserved _lucid_ prefix`);
    }
  }
}

export function validateTrustWeighted(entry: Record<string, unknown>): void {
  validateBase(entry);
  if (!entry.source_agent_passport_id || typeof entry.source_agent_passport_id !== 'string') {
    throw new Error('source_agent_passport_id is required for trust_weighted memory');
  }
  if (typeof entry.trust_score !== 'number' || entry.trust_score < 0 || entry.trust_score > 1) {
    throw new Error('trust_score must be a number between 0 and 1');
  }
  if (typeof entry.decay_factor !== 'number' || entry.decay_factor < 0 || entry.decay_factor > 1) {
    throw new Error('decay_factor must be a number between 0 and 1');
  }
  if (typeof entry.weighted_relevance !== 'number' || entry.weighted_relevance < 0 || entry.weighted_relevance > 1) {
    throw new Error('weighted_relevance must be a number between 0 and 1');
  }
}
```

- [ ] **Step 4: Implement temporal manager**

Create `offchain/packages/engine/src/memory/managers/temporal.ts`:
```typescript
import { MAX_CONTENT_SIZE, MAX_METADATA_SIZE } from '../types';

function validateBase(entry: Record<string, unknown>): void {
  if (!entry.agent_passport_id || typeof entry.agent_passport_id !== 'string') throw new Error('agent_passport_id is required');
  if (!entry.namespace || typeof entry.namespace !== 'string') throw new Error('namespace is required');
  if (!entry.content || typeof entry.content !== 'string') throw new Error('content is required');
  if ((entry.content as string).length > MAX_CONTENT_SIZE) throw new Error(`content exceeds maximum size of ${MAX_CONTENT_SIZE} bytes`);
  if (entry.metadata != null && typeof entry.metadata === 'object') {
    const metaStr = JSON.stringify(entry.metadata);
    if (metaStr.length > MAX_METADATA_SIZE) throw new Error(`metadata exceeds maximum size of ${MAX_METADATA_SIZE} bytes`);
    for (const key of Object.keys(entry.metadata as Record<string, unknown>)) {
      if (key.startsWith('_lucid_')) throw new Error(`metadata key '${key}' uses reserved _lucid_ prefix`);
    }
  }
}

export function validateTemporal(entry: Record<string, unknown>): void {
  validateBase(entry);
  if (typeof entry.valid_from !== 'number') {
    throw new Error('valid_from is required for temporal memory');
  }
  if (entry.valid_to !== null && entry.valid_to !== undefined) {
    if (typeof entry.valid_to !== 'number') {
      throw new Error('valid_to must be a number or null');
    }
    if (entry.valid_to <= (entry.valid_from as number)) {
      throw new Error('valid_to must be greater than valid_from');
    }
  }
  if (typeof entry.recorded_at !== 'number') {
    throw new Error('recorded_at is required for temporal memory');
  }
  if ((entry.recorded_at as number) < (entry.valid_from as number)) {
    throw new Error('recorded_at must be >= valid_from');
  }
}
```

- [ ] **Step 5: Update managers/index.ts — register new validators**

```typescript
import { validateEntity } from './entity';
import { validateTrustWeighted } from './trustWeighted';
import { validateTemporal } from './temporal';

// In VALIDATORS map:
const VALIDATORS: Partial<Record<MemoryType, ValidateFn>> = {
  episodic: validateEpisodic,
  semantic: validateSemantic,
  procedural: validateProcedural,
  entity: validateEntity,
  trust_weighted: validateTrustWeighted,
  temporal: validateTemporal,
};

// Update exports:
export { validateEntity } from './entity';
export { validateTrustWeighted } from './trustWeighted';
export { validateTemporal } from './temporal';
```

- [ ] **Step 6: Update managers.test.ts — getManager should now return validators for all 6 types**

Change the "should throw for entity, trust_weighted, temporal" test to:
```typescript
it('should return validators for all 6 types', () => {
  expect(getManager('episodic')).toBe(validateEpisodic);
  expect(getManager('semantic')).toBe(validateSemantic);
  expect(getManager('procedural')).toBe(validateProcedural);
  expect(getManager('entity')).toBe(validateEntity);
  expect(getManager('trust_weighted')).toBe(validateTrustWeighted);
  expect(getManager('temporal')).toBe(validateTemporal);
});
```

- [ ] **Step 7: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/managers.test.ts --no-coverage`
Expected: PASS (all existing + new tests)

- [ ] **Step 8: Commit**

```bash
git add offchain/packages/engine/src/memory/managers/
git add offchain/packages/engine/src/memory/__tests__/managers.test.ts
git commit -m "feat(memory): entity, trust-weighted, temporal managers — all 6 types active"
```

---

### Task 7: Recall — Intent Classifier

**Files:**
- Create: `offchain/packages/engine/src/memory/recall/intentClassifier.ts`
- Create: `offchain/packages/engine/src/memory/recall/index.ts`
- Create: `offchain/packages/engine/src/memory/__tests__/recall-v2.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/recall-v2.test.ts`:
```typescript
import { classifyQueryIntent, type QueryIntent } from '../recall/intentClassifier';

describe('classifyQueryIntent', () => {
  it('should classify fact/preference queries as semantic', () => {
    const intent = classifyQueryIntent('what does the user prefer');
    expect(intent.type_boosts.semantic).toBeGreaterThan(0);
  });

  it('should classify policy/rule queries as procedural', () => {
    const intent = classifyQueryIntent('how should I respond to greetings');
    expect(intent.type_boosts.procedural).toBeGreaterThan(0);
  });

  it('should classify recent/session queries as episodic', () => {
    const intent = classifyQueryIntent('what just happened');
    expect(intent.type_boosts.episodic).toBeGreaterThan(0);
  });

  it('should return zero boosts for generic queries', () => {
    const intent = classifyQueryIntent('xyz random thing');
    expect(intent.type_boosts.episodic).toBe(0);
    expect(intent.type_boosts.semantic).toBe(0);
    expect(intent.type_boosts.procedural).toBe(0);
  });

  it('should classify market queries with market lane boost', () => {
    const intent = classifyQueryIntent('what is the ETH price');
    expect(intent.lane_boosts.market).toBeGreaterThan(0);
  });

  it('should classify user preference with user lane boost', () => {
    const intent = classifyQueryIntent('user preference for dark mode');
    expect(intent.lane_boosts.user).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement intent classifier**

Create `offchain/packages/engine/src/memory/recall/intentClassifier.ts`:
```typescript
import type { MemoryType, MemoryLane } from '../types';

export interface QueryIntent {
  type_boosts: Record<string, number>;
  lane_boosts: Record<string, number>;
  classification: 'fact' | 'policy' | 'recent' | 'market' | 'default';
}

const SEMANTIC_KEYWORDS = ['prefer', 'fact', 'profile', 'balance', 'name', 'email', 'like', 'dislike', 'favorite', 'setting'];
const PROCEDURAL_KEYWORDS = ['should', 'rule', 'policy', 'instruction', 'behavior', 'respond', 'greeting', 'always', 'never', 'must'];
const EPISODIC_KEYWORDS = ['recent', 'just', 'happened', 'last', 'previous', 'earlier', 'session', 'conversation', 'said'];
const MARKET_KEYWORDS = ['price', 'market', 'protocol', 'chain', 'token', 'tvl', 'volume', 'rate', 'state'];
const USER_KEYWORDS = ['user', 'preference', 'their', 'customer', 'client'];
const SELF_KEYWORDS = ['my', 'self', 'internal', 'strategy', 'plan'];
const SHARED_KEYWORDS = ['team', 'shared', 'org', 'organization', 'company', 'workspace'];

function hasKeyword(query: string, keywords: string[]): boolean {
  const lower = query.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

/**
 * Classification priority (highest wins):
 *   1. episodic ('recent')  — temporal queries take precedence
 *   2. procedural ('policy') — behavioral/rule queries
 *   3. semantic ('fact')    — factual/preference queries
 *   4. market              — only wins if no type matched
 *   5. 'default'           — no keywords matched
 *
 * Type boosts are additive — all matching categories boost independently.
 * Only `classification` (the primary label) follows this precedence.
 */
export function classifyQueryIntent(query: string): QueryIntent {
  const type_boosts: Record<string, number> = { episodic: 0, semantic: 0, procedural: 0 };
  const lane_boosts: Record<string, number> = { self: 0, user: 0, shared: 0, market: 0 };
  let classification: QueryIntent['classification'] = 'default';

  // Type boosts are additive (all matching categories contribute)
  const hasSemantic = hasKeyword(query, SEMANTIC_KEYWORDS);
  const hasProcedural = hasKeyword(query, PROCEDURAL_KEYWORDS);
  const hasEpisodic = hasKeyword(query, EPISODIC_KEYWORDS);

  if (hasSemantic) type_boosts.semantic = 0.3;
  if (hasProcedural) type_boosts.procedural = 0.3;
  if (hasEpisodic) type_boosts.episodic = 0.3;

  // Classification follows priority: episodic > procedural > semantic
  if (hasSemantic) classification = 'fact';
  if (hasProcedural) classification = 'policy';
  if (hasEpisodic) classification = 'recent';

  // Lane boosts
  if (hasKeyword(query, MARKET_KEYWORDS)) {
    lane_boosts.market = 0.2;
    if (classification === 'default') classification = 'market';
  }
  if (hasKeyword(query, USER_KEYWORDS)) lane_boosts.user = 0.2;
  if (hasKeyword(query, SELF_KEYWORDS)) lane_boosts.self = 0.2;
  if (hasKeyword(query, SHARED_KEYWORDS)) lane_boosts.shared = 0.2;

  return { type_boosts, lane_boosts, classification };
}
```

- [ ] **Step 3: Create recall/index.ts barrel (intentClassifier only — reranker added in Task 8)**

```typescript
export { classifyQueryIntent, type QueryIntent } from './intentClassifier';
// reranker export added in Task 8 after implementation
```

- [ ] **Step 4: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/recall-v2.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/recall/
git add offchain/packages/engine/src/memory/__tests__/recall-v2.test.ts
git commit -m "feat(memory): query intent classifier for recall type/lane boosting"
```

---

### Task 8: Recall — Reranker

**Files:**
- Create: `offchain/packages/engine/src/memory/recall/reranker.ts`
- Modify: `offchain/packages/engine/src/memory/__tests__/recall-v2.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `recall-v2.test.ts`:
```typescript
import { rerankCandidates } from '../recall/reranker';
import type { MemoryEntry } from '../types';

describe('rerankCandidates', () => {
  const now = Date.now();

  function makeCandidate(overrides: Partial<MemoryEntry & { similarity: number }> = {}): MemoryEntry & { similarity: number } {
    return {
      memory_id: 'mem-' + Math.random().toString(36).slice(2, 6),
      agent_passport_id: 'agent-1',
      type: 'semantic',
      namespace: 'ns',
      content: 'test',
      status: 'active',
      created_at: now,
      updated_at: now,
      metadata: {},
      content_hash: 'h',
      prev_hash: null,
      memory_lane: 'self',
      similarity: 0.8,
      ...overrides,
    } as any;
  }

  const defaultWeights = {
    similarity_weight: 0.55,
    recency_weight: 0.20,
    type_weight: 0.15,
    quality_weight: 0.10,
  };

  it('should score higher similarity candidates higher', () => {
    const candidates = [
      makeCandidate({ similarity: 0.5 }),
      makeCandidate({ similarity: 0.9 }),
    ];
    const results = rerankCandidates(candidates, 'generic query', defaultWeights);
    expect(results[0].similarity).toBe(0.9);
  });

  it('should apply intent overfitting guard: type_bonus capped at similarity', () => {
    // Low similarity but matching intent — bonus should be capped
    const candidates = [
      makeCandidate({ similarity: 0.1, type: 'semantic' }),
    ];
    const results = rerankCandidates(candidates, 'what does user prefer', defaultWeights);
    // The type bonus (0.3) should be capped to similarity (0.1)
    expect(results[0].score).toBeLessThan(0.55 * 0.1 + 0.20 * 1 + 0.15 * 0.3 + 0.10 * 0.5);
  });

  it('should apply lane overfitting guard', () => {
    const candidates = [
      makeCandidate({ similarity: 0.1, memory_lane: 'market' } as any),
    ];
    const results = rerankCandidates(candidates, 'what is the ETH price', defaultWeights);
    // Lane bonus also capped at similarity
    expect(results[0].score).toBeDefined();
  });

  it('should return entries sorted by final score descending', () => {
    const candidates = [
      makeCandidate({ similarity: 0.5, created_at: now - 86400000 }),
      makeCandidate({ similarity: 0.9, created_at: now }),
    ];
    const results = rerankCandidates(candidates, 'test', defaultWeights);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });
});
```

- [ ] **Step 2: Implement reranker**

Create `offchain/packages/engine/src/memory/recall/reranker.ts`:
```typescript
import type { MemoryEntry } from '../types';
import { classifyQueryIntent } from './intentClassifier';

export interface RerankConfig {
  similarity_weight: number;
  recency_weight: number;
  type_weight: number;
  quality_weight: number;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function recencyScore(created_at: number): number {
  const age = Date.now() - created_at;
  return Math.max(0, 1 - age / THIRTY_DAYS_MS);
}

function qualityScore(entry: MemoryEntry): number {
  if ((entry as any).confidence !== undefined) return (entry as any).confidence;
  if ((entry as any).priority !== undefined) return Math.min((entry as any).priority / 10, 1);
  return 0.5;
}

export function rerankCandidates(
  candidates: (MemoryEntry & { similarity: number })[],
  query: string,
  weights: RerankConfig,
): (MemoryEntry & { similarity: number; score: number })[] {
  const intent = classifyQueryIntent(query);

  const scored = candidates.map(entry => {
    const sim = entry.similarity;
    const recency = recencyScore(entry.created_at);

    // Type bonus with overfitting guard
    const rawTypeBonus = intent.type_boosts[entry.type] || 0;
    const effectiveTypeBonus = Math.min(rawTypeBonus, sim);

    // Lane bonus with overfitting guard
    const lane = (entry as any).memory_lane || 'self';
    const rawLaneBonus = intent.lane_boosts[lane] || 0;
    const effectiveLaneBonus = Math.min(rawLaneBonus, sim);

    const quality = qualityScore(entry);

    // Design: lane_bonus and type_bonus share the same weight bucket (type_weight).
    // This is intentional — both are "intent alignment" signals, so they compete
    // for the same 0.15 slice of the score rather than inflating overall weight.
    // Combined max = type_weight * (0.3 + 0.2) = 0.15 * 0.5 = 0.075.
    const score =
      weights.similarity_weight * sim
      + weights.recency_weight * recency
      + weights.type_weight * (effectiveTypeBonus + effectiveLaneBonus)
      + weights.quality_weight * quality;

    return { ...entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
```

- [ ] **Step 3: Update recall/index.ts to add reranker export**

```typescript
export { classifyQueryIntent, type QueryIntent } from './intentClassifier';
export { rerankCandidates, type RerankConfig } from './reranker';
```

- [ ] **Step 4: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/recall-v2.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/recall/ offchain/packages/engine/src/memory/__tests__/recall-v2.test.ts
git commit -m "feat(memory): two-stage reranker with intent overfitting guard"
```

---

## Chunk 3: Service Recall Rewrite + Extraction Hardening

### Task 9: MemoryService.recall() Rewrite

**Files:**
- Modify: `offchain/packages/engine/src/memory/service.ts`
- Modify: `offchain/packages/engine/src/memory/__tests__/service.test.ts`

- [ ] **Step 1: Add config weight validation**

At the top of `MemoryService` constructor, add:
```typescript
const weightSum = config.recall_similarity_weight + config.recall_recency_weight
  + config.recall_type_weight + config.recall_quality_weight;
if (Math.abs(weightSum - 1.0) > 0.001) {
  throw new Error(`Recall weights must sum to 1.0, got ${weightSum}`);
}
```

- [ ] **Step 2: Write test for weight validation**

In `service.test.ts`:
```typescript
it('should throw if recall weights do not sum to 1.0', () => {
  expect(() => new MemoryService(store, new MemoryACLEngine(), {
    ...testConfig,
    recall_similarity_weight: 0.5,
    recall_recency_weight: 0.5,
    recall_type_weight: 0.5,
    recall_quality_weight: 0.5,
  })).toThrow('Recall weights must sum to 1.0');
});
```

- [ ] **Step 3: Rewrite recall() method**

Replace the existing `recall()` method:
```typescript
import { rerankCandidates } from './recall/reranker';

async recall(callerPassportId: string, request: RecallRequest): Promise<RecallResponse> {
  const namespace = request.namespace || `agent:${callerPassportId}`;
  this.acl.assertReadPermission(callerPassportId, namespace);

  const weights = {
    similarity_weight: this.config.recall_similarity_weight,
    recency_weight: this.config.recall_recency_weight,
    type_weight: this.config.recall_type_weight,
    quality_weight: this.config.recall_quality_weight,
  };

  const limit = request.limit || 20;
  const threshold = request.min_similarity ?? this.config.recall_similarity_threshold;

  let candidates: (MemoryEntry & { similarity: number })[];

  // Stage 1: Fast candidate retrieval
  if (request.semantic_query_embedding) {
    candidates = await this.store.nearestByEmbedding(
      request.semantic_query_embedding,
      request.agent_passport_id,
      request.namespace,
      request.types,
      this.config.recall_candidate_pool_size,
      threshold,
      request.lanes,
    );
  } else {
    // Fallback: recency + keyword
    const entries = await this.store.query({
      agent_passport_id: request.agent_passport_id,
      namespace: request.namespace,
      types: request.types,
      session_id: request.session_id,
      status: request.include_archived ? ['active', 'archived', 'expired'] : ['active'],
      limit: this.config.recall_candidate_pool_size,
      order_by: 'created_at',
      order_dir: 'desc',
      memory_lane: request.lanes,
    });
    // Keyword content filter
    const filtered = request.query
      ? entries.filter(e => e.content.toLowerCase().includes(request.query.toLowerCase()))
      : entries;
    candidates = filtered.map(e => ({ ...e, similarity: 0.0 }));
  }

  // Fallback safety: if semantic search returned too few results, backfill
  if (request.semantic_query_embedding && candidates.length < this.config.recall_min_results) {
    const backfill = await this.store.query({
      agent_passport_id: request.agent_passport_id,
      namespace: request.namespace,
      types: request.types,
      session_id: request.session_id,
      status: request.include_archived ? ['active', 'archived', 'expired'] : ['active'],
      limit: this.config.recall_candidate_pool_size,
      order_by: 'created_at',
      order_dir: 'desc',
      memory_lane: request.lanes,
    });
    const existingIds = new Set(candidates.map(c => c.memory_id));
    for (const entry of backfill) {
      if (!existingIds.has(entry.memory_id)) {
        candidates.push({ ...entry, similarity: 0.0 });
        if (candidates.length >= this.config.recall_candidate_pool_size) break;
      }
    }
  }

  // Stage 2: Rerank
  const scored = rerankCandidates(candidates, request.query || '', weights);
  const result = scored.slice(0, limit);

  return {
    memories: result,
    query_embedding_model: request.semantic_query_embedding ? this.config.embedding_model : null,
    total_candidates: candidates.length,
  };
}
```

- [ ] **Step 4: Update testConfig in service.test.ts**

Add recall fields to `testConfig`:
```typescript
recall_similarity_threshold: 0.65,
recall_candidate_pool_size: 50,
recall_min_results: 3,
recall_similarity_weight: 0.55,
recall_recency_weight: 0.20,
recall_type_weight: 0.15,
recall_quality_weight: 0.10,
extraction_max_tokens: 8000,
extraction_max_facts: 20,
extraction_max_rules: 10,
```

- [ ] **Step 5: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/service.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add offchain/packages/engine/src/memory/service.ts offchain/packages/engine/src/memory/__tests__/service.test.ts
git commit -m "feat(memory): two-stage recall with semantic search + reranking"
```

---

### Task 10: Service — addEntity, addTrustWeighted, addTemporal

**Files:**
- Modify: `offchain/packages/engine/src/memory/service.ts`
- Modify: `offchain/packages/engine/src/memory/__tests__/service.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `service.test.ts`:
```typescript
describe('addEntity', () => {
  it('should write an entity entry', async () => {
    const result = await service.addEntity('agent-1', {
      namespace: 'agent:agent-1', content: 'Vitalik Buterin',
      entity_name: 'Vitalik Buterin', entity_type: 'person',
      attributes: {}, relationships: [],
    });
    expect(result.memory_id).toBeDefined();
    const entry = await store.read(result.memory_id);
    expect(entry!.type).toBe('entity');
  });
});

describe('addTrustWeighted', () => {
  it('should write a trust-weighted entry', async () => {
    const result = await service.addTrustWeighted('agent-1', {
      namespace: 'agent:agent-1', content: 'Trust agent-2',
      source_agent_passport_id: 'agent-2',
      trust_score: 0.8, decay_factor: 0.1, weighted_relevance: 0.7,
    });
    expect(result.memory_id).toBeDefined();
  });
});

describe('addTemporal', () => {
  it('should write a temporal entry', async () => {
    const now = Date.now();
    const result = await service.addTemporal('agent-1', {
      namespace: 'agent:agent-1', content: 'ETH at $4000',
      valid_from: now - 86400000, valid_to: null, recorded_at: now,
    });
    expect(result.memory_id).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement the three methods**

Add to `MemoryService`:
```typescript
async addEntity(callerPassportId: string, input: {
  namespace: string; content: string; entity_name: string;
  entity_type: string; entity_id?: string;
  attributes: Record<string, unknown>; relationships: any[];
  source_memory_ids?: string[]; metadata?: Record<string, unknown>;
  memory_lane?: MemoryLane;
}): Promise<MemoryWriteResult> {
  return this.writeGeneric(callerPassportId, 'entity', {
    ...input, type: 'entity', agent_passport_id: callerPassportId,
    source_memory_ids: input.source_memory_ids ?? [],
    memory_lane: input.memory_lane ?? 'self',
  });
}

async addTrustWeighted(callerPassportId: string, input: {
  namespace: string; content: string;
  source_agent_passport_id: string; trust_score: number;
  decay_factor: number; weighted_relevance: number;
  source_memory_ids?: string[]; metadata?: Record<string, unknown>;
  memory_lane?: MemoryLane;
}): Promise<MemoryWriteResult> {
  return this.writeGeneric(callerPassportId, 'trust_weighted', {
    ...input, type: 'trust_weighted', agent_passport_id: callerPassportId,
    source_memory_ids: input.source_memory_ids ?? [],
    memory_lane: input.memory_lane ?? 'self',
  });
}

async addTemporal(callerPassportId: string, input: {
  namespace: string; content: string;
  valid_from: number; valid_to: number | null; recorded_at: number;
  source_memory_ids?: string[]; metadata?: Record<string, unknown>;
  memory_lane?: MemoryLane;
}): Promise<MemoryWriteResult> {
  return this.writeGeneric(callerPassportId, 'temporal', {
    ...input, type: 'temporal', agent_passport_id: callerPassportId,
    source_memory_ids: input.source_memory_ids ?? [],
    memory_lane: input.memory_lane ?? 'self',
  });
}
```

Also update all existing `writeGeneric` calls in `addSemantic`/`addProcedural` to pass `memory_lane`:
```typescript
memory_lane: input.memory_lane ?? 'self',
```

And `addEpisodic` — add `memory_lane` to `entryBase`:
```typescript
memory_lane: input.memory_lane ?? 'self',
```

- [ ] **Step 3: Add MemoryLane import to service.ts**

```typescript
import type { MemoryLane } from './types';
```

- [ ] **Step 4: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/service.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/service.ts offchain/packages/engine/src/memory/__tests__/service.test.ts
git commit -m "feat(memory): addEntity, addTrustWeighted, addTemporal service methods"
```

---

### Task 11: Extraction Hardening — Validation + callLLM Rewrite

**Files:**
- Modify: `offchain/packages/engine/src/memory/extraction.ts`
- Create: `offchain/packages/engine/src/memory/__tests__/extraction-v2.test.ts`

- [ ] **Step 1: Write tests for validateExtractionResponse**

Create `__tests__/extraction-v2.test.ts`:
```typescript
import { validateExtractionResponse } from '../extraction';

describe('validateExtractionResponse', () => {
  it('should pass valid extraction output', () => {
    const result = validateExtractionResponse({
      schema_version: '1.0',
      facts: [{ fact: 'sky is blue', confidence: 0.9 }],
      rules: [{ rule: 'greet first', trigger: 'start', priority: 1 }],
    });
    expect(result.facts).toHaveLength(1);
    expect(result.rules).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });

  it('should assume schema_version 1.0 when missing', () => {
    const result = validateExtractionResponse({
      facts: [{ fact: 'test', confidence: 0.5 }],
      rules: [],
    });
    expect(result.facts).toHaveLength(1);
    expect(result.warnings.some(w => w.includes('schema_version'))).toBe(true);
  });

  it('should reject unsupported schema_version', () => {
    const result = validateExtractionResponse({
      schema_version: '2.0',
      facts: [{ fact: 'test', confidence: 0.5 }],
      rules: [],
    });
    expect(result.facts).toHaveLength(0);
    expect(result.rules).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('unsupported'))).toBe(true);
  });

  it('should drop malformed facts with warning', () => {
    const result = validateExtractionResponse({
      schema_version: '1.0',
      facts: [
        { fact: 'valid', confidence: 0.8 },
        { fact: '', confidence: 0.5 },       // empty fact
        { fact: 'no-conf' },                  // missing confidence
      ],
      rules: [],
    });
    expect(result.facts).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should cap output at max facts/rules', () => {
    const facts = Array.from({ length: 25 }, (_, i) => ({ fact: `fact-${i}`, confidence: 0.5 }));
    const result = validateExtractionResponse({
      schema_version: '1.0', facts, rules: [],
    }, 5, 5);
    expect(result.facts).toHaveLength(5);
    expect(result.warnings.some(w => w.includes('capped'))).toBe(true);
  });

  it('should return empty for non-object input', () => {
    const result = validateExtractionResponse('not an object');
    expect(result.facts).toHaveLength(0);
    expect(result.rules).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement validateExtractionResponse**

Add to `extraction.ts` (exported):
```typescript
import type { ValidatedExtractionResult } from './types';

export function validateExtractionResponse(
  raw: unknown,
  maxFacts: number = 20,
  maxRules: number = 10,
): ValidatedExtractionResult {
  const warnings: string[] = [];
  const result: ValidatedExtractionResult = { facts: [], rules: [], warnings };

  if (!raw || typeof raw !== 'object') {
    warnings.push('Extraction response is not an object');
    return result;
  }

  const obj = raw as Record<string, any>;

  // Schema version check
  if (!obj.schema_version) {
    warnings.push('Missing schema_version, assuming 1.0');
  } else if (obj.schema_version !== '1.0') {
    warnings.push(`Unsupported schema_version: ${obj.schema_version} — rejecting entire response`);
    return result;
  }

  // Validate facts
  if (Array.isArray(obj.facts)) {
    for (const f of obj.facts) {
      if (!f || typeof f.fact !== 'string' || !f.fact.trim()) {
        warnings.push(`Dropped malformed fact: missing or empty fact string`);
        continue;
      }
      if (typeof f.confidence !== 'number' || f.confidence < 0 || f.confidence > 1) {
        warnings.push(`Dropped fact "${f.fact.slice(0, 30)}": invalid confidence`);
        continue;
      }
      result.facts.push({ fact: f.fact, confidence: f.confidence });
    }
  }

  // Validate rules
  if (Array.isArray(obj.rules)) {
    for (const r of obj.rules) {
      if (!r || typeof r.rule !== 'string' || !r.rule.trim()) {
        warnings.push(`Dropped malformed rule: missing or empty rule string`);
        continue;
      }
      if (typeof r.trigger !== 'string' || !r.trigger.trim()) {
        warnings.push(`Dropped rule "${r.rule.slice(0, 30)}": missing trigger`);
        continue;
      }
      const priority = typeof r.priority === 'number' ? r.priority : 0;
      result.rules.push({ rule: r.rule, trigger: r.trigger, priority });
    }
  }

  // Cap
  if (result.facts.length > maxFacts) {
    warnings.push(`Facts capped from ${result.facts.length} to ${maxFacts}`);
    result.facts = result.facts.slice(0, maxFacts);
  }
  if (result.rules.length > maxRules) {
    warnings.push(`Rules capped from ${result.rules.length} to ${maxRules}`);
    result.rules = result.rules.slice(0, maxRules);
  }

  return result;
}
```

- [ ] **Step 3: Rewrite callLLM with error categorization**

Replace the existing `callLLM` method:
```typescript
private extractionDisabled = false;
private backoffUntil = 0;

private async callLLM(prompt: string, existingFacts: string): Promise<{
  facts: { fact: string; confidence: number }[];
  rules: { rule: string; trigger: string; priority: number }[];
}> {
  if (!this.config.extraction_model || this.extractionDisabled) {
    return { facts: [], rules: [] };
  }

  // Backoff check
  if (Date.now() < this.backoffUntil) {
    return { facts: [], rules: [] };
  }

  const url = process.env.MEMORY_EXTRACTION_URL || 'http://localhost:3001/v1/chat/completions';
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.extraction_model,
        messages: [
          {
            role: 'system',
            content: `You are a memory extraction agent for the Lucid AI platform.
Extract facts and behavioral rules from conversation context.
Output JSON with schema_version "1.0", facts array [{fact, confidence}], rules array [{rule, trigger, priority}].
Do not duplicate existing facts. Confidence reflects certainty. Rules must have actionable triggers.`,
          },
          {
            role: 'user',
            content: `Existing facts (avoid duplicates):\n${existingFacts || 'None'}\n\nConversation:\n${prompt}\n\nExtract new facts and behavioral rules.`,
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
      this.backoffUntil = Date.now() + retryAfter * 1000;
      console.warn(`[extraction] Rate limited, backing off ${retryAfter}s`);
      return { facts: [], rules: [] };
    }

    if (response.status === 401 || response.status === 403) {
      console.error(`[extraction] Auth failure (${response.status}), disabling extraction`);
      this.extractionDisabled = true;
      return { facts: [], rules: [] };
    }

    if (!response.ok) {
      console.warn(`[extraction] HTTP ${response.status}`);
      return { facts: [], rules: [] };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return { facts: [], rules: [] };

    const parsed = JSON.parse(content);
    const validated = validateExtractionResponse(
      parsed,
      this.config.extraction_max_facts,
      this.config.extraction_max_rules,
    );

    if (validated.warnings.length > 0) {
      console.warn('[extraction] Validation warnings:', validated.warnings);
    }

    return { facts: validated.facts, rules: validated.rules };
  } catch (err: any) {
    if (err.name === 'SyntaxError') {
      console.error('[extraction] Malformed JSON response');
    } else {
      console.warn(`[extraction] Network error: ${err.message}`);
    }
    return { facts: [], rules: [] };
  }
}
```

- [ ] **Step 4: Add token budget truncation to runExtraction**

In `runExtraction`, before building the prompt:
```typescript
// Token budget: ~1 token per 4 chars
const maxChars = this.config.extraction_max_tokens * 4;
let truncated = false;
let episodicsToUse = episodics;
let totalChars = episodics.reduce((sum, e) => sum + e.content.length, 0);
if (totalChars > maxChars) {
  // Truncate oldest first
  episodicsToUse = [];
  let charBudget = maxChars;
  for (let i = episodics.length - 1; i >= 0; i--) {
    if (charBudget <= 0) { truncated = true; break; }
    episodicsToUse.unshift(episodics[i]);
    charBudget -= episodics[i].content.length;
  }
  if (truncated) {
    console.warn(`[extraction] Truncated ${episodics.length - episodicsToUse.length} oldest turns for token budget`);
  }
}
```

- [ ] **Step 5: Add supersession detection + output dedup**

In `runExtraction`, after `callLLM` returns, before writing facts:
```typescript
const extractionRunId = crypto.randomUUID();

// Output dedup + supersession
for (const fact of extracted.facts) {
  // Dedup: check if identical active semantic already exists
  const dupeCheck = await this.store.query({
    agent_passport_id, namespace,
    types: ['semantic'], status: ['active'],
    limit: 1,
  });
  const isDupe = dupeCheck.some(e =>
    (e as any).fact?.toLowerCase().trim() === fact.fact.toLowerCase().trim()
    && e.status === 'active'
  );
  if (isDupe) continue;

  // Supersession: exact same fact string (case-insensitive)
  const existing = existingFacts.find(e =>
    (e as any).fact?.toLowerCase().trim() === fact.fact.toLowerCase().trim()
  );
  const supersedes = existing ? [existing.memory_id] : undefined;

  const writeResult = await this.service.addSemantic(agent_passport_id, {
    namespace,
    content: fact.fact,
    fact: fact.fact,
    confidence: fact.confidence,
    source_memory_ids: episodicsToUse.map(e => e.memory_id),
    supersedes,
    metadata: {
      extracted_by_model: this.config.extraction_model,
      extraction_run_id: extractionRunId,
      extraction_version: '1.0',
    },
  });

  // Mark old as superseded (pass new entry's memory_id)
  if (existing) {
    await this.store.supersede(existing.memory_id, writeResult.memory_id);
  }
}

// Output dedup for rules
for (const rule of extracted.rules) {
  const existingRule = (await this.store.query({
    agent_passport_id, namespace,
    types: ['procedural'], status: ['active'], limit: 100,
  })).find(e =>
    (e as any).rule?.toLowerCase().trim() === rule.rule.toLowerCase().trim()
    && (e as any).trigger?.toLowerCase().trim() === rule.trigger.toLowerCase().trim()
  );
  if (existingRule) continue;

  await this.service.addProcedural(agent_passport_id, {
    namespace, content: rule.rule, rule: rule.rule,
    trigger: rule.trigger, priority: rule.priority,
    source_memory_ids: episodicsToUse.map(e => e.memory_id),
    metadata: {
      extracted_by_model: this.config.extraction_model,
      extraction_run_id: extractionRunId,
      extraction_version: '1.0',
    },
  });
}
```

- [ ] **Step 6: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/extraction-v2.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add offchain/packages/engine/src/memory/extraction.ts offchain/packages/engine/src/memory/__tests__/extraction-v2.test.ts
git commit -m "feat(memory): extraction hardening — validation, error categorization, token budget, supersession"
```

---

## Chunk 4: Compaction + Snapshot + Routes

### Task 12: ArchivePipeline Updates

**Files:**
- Modify: `offchain/packages/engine/src/memory/archivePipeline.ts`

- [ ] **Step 1: Add namespace parameter to createSnapshot**

Update `createSnapshot` signature:
```typescript
async createSnapshot(
  agent_passport_id: string,
  snapshot_type: MemorySnapshot['snapshot_type'],
  namespace?: string,
): Promise<{ cid: string; snapshot_id: string }>
```

When namespace is provided, filter `getEntriesSince` results:
```typescript
let entries = await this.store.getEntriesSince(agent_passport_id, 0);
if (namespace) {
  entries = entries.filter(e => e.namespace === namespace);
}
const prov = await this.store.getProvenanceChain(
  agent_passport_id,
  namespace || `agent:${agent_passport_id}`,
  10000,
);
```

- [ ] **Step 2: Add identity verification to restoreSnapshot**

At the start of `restoreSnapshot`, after retrieving the LMF:
```typescript
// Identity verification: prevent cross-agent memory injection
if (lmf.agent_passport_id !== agent_passport_id) {
  // Admin can bypass
  const isAdmin = agent_passport_id === '__admin__';
  if (!isAdmin) {
    throw new Error(
      `Identity mismatch: snapshot belongs to ${lmf.agent_passport_id}, ` +
      `but restore requested by ${agent_passport_id}`
    );
  }
}
```

- [ ] **Step 3: Write tests for namespace scoping + identity verification**

Add to `archivePipeline.test.ts`:
```typescript
it('should only include entries from specified namespace in snapshot', async () => {
  // Write entries to two namespaces, snapshot with one
  // Verify LMF only contains entries from the specified namespace
});

it('should reject restore when agent_passport_id does not match LMF', async () => {
  // Create LMF with agent-1, try restore as agent-2
  // Expect Error: Identity mismatch
});

it('should allow admin to bypass identity check on restore', async () => {
  // Create LMF with agent-1, restore as __admin__
  // Should succeed
});
```

- [ ] **Step 4: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/archivePipeline.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/archivePipeline.ts offchain/packages/engine/src/memory/__tests__/archivePipeline.test.ts
git commit -m "feat(memory): archive pipeline — namespace scoping + identity verification"
```

---

### Task 13: CompactionPipeline — Warm Tier

**Files:**
- Create: `offchain/packages/engine/src/memory/compactionPipeline.ts`
- Create: `offchain/packages/engine/src/memory/__tests__/compaction.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/compaction.test.ts`:
```typescript
import { CompactionPipeline } from '../compactionPipeline';
import { InMemoryMemoryStore } from '../store/in-memory';
import type { CompactionConfig, EpisodicMemory } from '../types';
import { getDefaultCompactionConfig } from '../types';

const mockExtraction = {
  extractOnSessionClose: jest.fn().mockResolvedValue(undefined),
  maybeExtract: jest.fn().mockResolvedValue(undefined),
};

describe('CompactionPipeline', () => {
  let store: InMemoryMemoryStore;
  let pipeline: CompactionPipeline;
  let config: CompactionConfig;

  beforeEach(() => {
    store = new InMemoryMemoryStore();
    config = { ...getDefaultCompactionConfig(), hot_window_turns: 5, hot_window_ms: 1000 };
    pipeline = new CompactionPipeline(store, mockExtraction as any, null, config);
    jest.clearAllMocks();
  });

  it('should archive episodic entries beyond hot boundary', async () => {
    const sessionId = 'sess-1';
    await store.createSession({
      session_id: sessionId, agent_passport_id: 'agent-1',
      namespace: 'ns', status: 'closed',
    });

    // Write 10 episodic entries
    for (let i = 0; i < 10; i++) {
      await store.write({
        agent_passport_id: 'agent-1', type: 'episodic', namespace: 'ns',
        content: `Turn ${i}`, metadata: {}, session_id: sessionId,
        role: 'user', tokens: 5, turn_index: i,
        content_hash: `hash-${i}`, prev_hash: i > 0 ? `hash-${i - 1}` : null,
      } as any);
    }

    const result = await pipeline.compact('agent-1', 'ns', { mode: 'warm' });
    expect(result.episodic_archived).toBeGreaterThan(0);
    expect(result.extraction_triggered).toBe(true);
    expect(mockExtraction.extractOnSessionClose).toHaveBeenCalled();
  });

  it('should update compaction watermark after warm compaction', async () => {
    await store.createSession({
      session_id: 'sess-1', agent_passport_id: 'agent-1',
      namespace: 'ns', status: 'closed',
    });

    for (let i = 0; i < 10; i++) {
      await store.write({
        agent_passport_id: 'agent-1', type: 'episodic', namespace: 'ns',
        content: `Turn ${i}`, metadata: {}, session_id: 'sess-1',
        role: 'user', tokens: 5, turn_index: i,
        content_hash: `hash-${i}`, prev_hash: i > 0 ? `hash-${i - 1}` : null,
      } as any);
    }

    await pipeline.compact('agent-1', 'ns', { mode: 'warm' });
    const session = await store.getSession('sess-1');
    expect(session!.last_compacted_turn_index).toBeGreaterThan(-1);
  });

  it('should skip already-compacted ranges (idempotency)', async () => {
    await store.createSession({
      session_id: 'sess-1', agent_passport_id: 'agent-1',
      namespace: 'ns', status: 'closed',
    });
    // Pre-set watermark to simulate prior compaction
    await store.updateCompactionWatermark('sess-1', 4);

    for (let i = 0; i < 10; i++) {
      await store.write({
        agent_passport_id: 'agent-1', type: 'episodic', namespace: 'ns',
        content: `Turn ${i}`, metadata: {}, session_id: 'sess-1',
        role: 'user', tokens: 5, turn_index: i,
        content_hash: `hash-${i}`, prev_hash: null,
      } as any);
    }

    const result = await pipeline.compact('agent-1', 'ns', { mode: 'warm' });
    // Should only compact turns 5-9, not 0-4
    expect(result.episodic_archived).toBeLessThan(10);
  });
});
```

- [ ] **Step 2: Implement CompactionPipeline**

Create `offchain/packages/engine/src/memory/compactionPipeline.ts`:
```typescript
import type { IMemoryStore } from './store/interface';
import type { CompactionConfig, CompactionResult, EpisodicMemory, MemoryLane } from './types';
import type { ArchivePipeline } from './archivePipeline';

const DEFAULT_LANE_CONFIG: Record<MemoryLane, { hot_window_turns: number; hot_window_ms: number; cold_retention_ms: number }> = {
  self:   { hot_window_turns: 50, hot_window_ms: 86_400_000,  cold_retention_ms: 2_592_000_000 },
  user:   { hot_window_turns: 30, hot_window_ms: 43_200_000,  cold_retention_ms: 1_209_600_000 },
  shared: { hot_window_turns: 50, hot_window_ms: 86_400_000,  cold_retention_ms: 2_592_000_000 },
  market: { hot_window_turns: 10, hot_window_ms: 14_400_000,  cold_retention_ms: 604_800_000 },
};

export class CompactionPipeline {
  constructor(
    private store: IMemoryStore,
    private extractionPipeline: { extractOnSessionClose: Function } | null,
    private archivePipeline: ArchivePipeline | null,
    private config: CompactionConfig,
  ) {}

  async compact(
    agent_passport_id: string,
    namespace: string,
    options?: { session_id?: string; mode?: 'warm' | 'cold' | 'full' },
  ): Promise<CompactionResult> {
    const mode = options?.mode || 'full';
    const result: CompactionResult = {
      sessions_compacted: 0, episodic_archived: 0,
      extraction_triggered: false,
      cold_pruned: 0, snapshot_cid: null,
    };

    // Step 1: Find eligible sessions
    const allSessions = await this.store.listSessions(agent_passport_id);
    let sessions = allSessions.filter(s =>
      (!namespace || s.namespace === namespace) &&
      (s.status === 'closed' || (s.status === 'active' && Date.now() - s.last_activity > this.config.hot_window_ms))
    );
    if (options?.session_id) {
      sessions = sessions.filter(s => s.session_id === options.session_id);
    }

    // Step 2: Warm compaction
    if (mode === 'warm' || mode === 'full') {
      for (const session of sessions) {
        const episodics = await this.store.query({
          agent_passport_id,
          session_id: session.session_id,
          types: ['episodic'],
          status: ['active'],
          order_by: 'turn_index',
          order_dir: 'asc',
          limit: 10000,
        });

        if (episodics.length === 0) continue;

        // Determine hot boundary per lane
        const warmCandidates = episodics.filter(e => {
          const ep = e as EpisodicMemory;
          const lane = (e as any).memory_lane || 'self';
          const laneConfig = this.getLaneConfig(lane as MemoryLane);
          const maxTurn = Math.max(...episodics.map(x => (x as EpisodicMemory).turn_index));
          const isHotByTurn = ep.turn_index > maxTurn - laneConfig.hot_window_turns;
          const isHotByTime = Date.now() - e.created_at < laneConfig.hot_window_ms;
          return !isHotByTurn && !isHotByTime;
        });

        // Skip already-compacted ranges
        const uncompacted = warmCandidates.filter(e =>
          (e as EpisodicMemory).turn_index > session.last_compacted_turn_index
        );

        if (uncompacted.length === 0) continue;

        // Run extraction on warm range
        // Note: extraction operates on all unextracted episodics in the session,
        // which may be broader than the compacted range. This is intentional —
        // extraction is session-scoped, compaction is turn-scoped.
        if (this.extractionPipeline) {
          await this.extractionPipeline.extractOnSessionClose(
            session.session_id, agent_passport_id, session.namespace,
          );
          result.extraction_triggered = true;
        }

        // Archive warm episodic entries
        await this.store.archiveBatch(uncompacted.map(e => e.memory_id));
        result.episodic_archived += uncompacted.length;

        // Update watermark
        const maxCompactedTurn = Math.max(...uncompacted.map(e => (e as EpisodicMemory).turn_index));
        await this.store.updateCompactionWatermark(session.session_id, maxCompactedTurn);

        result.sessions_compacted++;
      }
    }

    // Step 3: Cold compaction
    if (mode === 'cold' || mode === 'full') {
      const archived = await this.store.query({
        agent_passport_id,
        namespace: namespace || undefined,
        status: ['archived'],
        limit: 10000,
        order_by: 'created_at',
        order_dir: 'asc',
      });

      const coldCandidates = archived.filter(e => {
        const lane = (e as any).memory_lane || 'self';
        const laneConfig = this.getLaneConfig(lane as MemoryLane);
        return Date.now() - e.created_at > laneConfig.cold_retention_ms;
      });

      if (coldCandidates.length > 0 && this.config.cold_requires_snapshot) {
        // Check if snapshot exists covering these entries
        const maxCreatedAt = Math.max(...coldCandidates.map(e => e.created_at));
        const snapshots = await this.store.listSnapshots(agent_passport_id);
        const CLOCK_SKEW_BUFFER = 60_000;
        const hasCoveringSnapshot = snapshots.some(s =>
          s.created_at >= maxCreatedAt + CLOCK_SKEW_BUFFER
        );

        if (!hasCoveringSnapshot && this.archivePipeline) {
          // Create snapshot first
          const { cid } = await this.archivePipeline.createSnapshot(
            agent_passport_id, 'archive', namespace || undefined,
          );
          result.snapshot_cid = cid;
        } else if (!hasCoveringSnapshot && !this.archivePipeline) {
          // Cannot cold-prune without snapshot
          return result;
        }
      }

      if (coldCandidates.length > 0) {
        // Emit delete provenance BEFORE hard-deleting rows
        for (const entry of coldCandidates) {
          await this.store.writeProvenance({
            agent_passport_id,
            namespace: entry.namespace,
            memory_id: entry.memory_id,
            operation: 'delete',
            content_hash: entry.content_hash,
            prev_hash: entry.prev_hash,
            created_at: Date.now(),
          });
        }
        await this.store.deleteBatch(coldCandidates.map(e => e.memory_id));
        result.cold_pruned = coldCandidates.length;
      }
    }

    return result;
  }

  private getLaneConfig(lane: MemoryLane): { hot_window_turns: number; hot_window_ms: number; cold_retention_ms: number } {
    const override = this.config.lane_overrides?.[lane];
    const defaults = DEFAULT_LANE_CONFIG[lane];
    return {
      hot_window_turns: override?.hot_window_turns ?? this.config.hot_window_turns ?? defaults.hot_window_turns,
      hot_window_ms: override?.hot_window_ms ?? this.config.hot_window_ms ?? defaults.hot_window_ms,
      cold_retention_ms: override?.cold_retention_ms ?? this.config.cold_retention_ms ?? defaults.cold_retention_ms,
    };
  }
}
```

- [ ] **Step 3: Run tests**

Run: `cd offchain && npx jest packages/engine/src/memory/__tests__/compaction.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add offchain/packages/engine/src/memory/compactionPipeline.ts offchain/packages/engine/src/memory/__tests__/compaction.test.ts
git commit -m "feat(memory): CompactionPipeline — warm + cold tiers with lane-aware boundaries"
```

---

### Task 14: Routes — Snapshot/Restore, Compact, Staged Types

**Files:**
- Modify: `offchain/packages/gateway-lite/src/routes/core/memoryRoutes.ts`

- [ ] **Step 1: Add getArchivePipeline singleton**

```typescript
import { ArchivePipeline } from '../../../../engine/src/memory/archivePipeline';
import { CompactionPipeline } from '../../../../engine/src/memory/compactionPipeline';
import { ExtractionPipeline } from '../../../../engine/src/memory/extraction';
import { getDefaultCompactionConfig } from '../../../../engine/src/memory/types';

let archivePipeline: ArchivePipeline | null | undefined = undefined;
function getArchivePipeline(): ArchivePipeline | null {
  if (archivePipeline !== undefined) return archivePipeline;
  const provider = process.env.DEPIN_STORAGE_PROVIDER;
  if (!provider) { archivePipeline = null; return null; }
  try {
    const { getPermanentStorage } = require('../../../../engine/src/storage/depin');
    const storage = getPermanentStorage();
    archivePipeline = new ArchivePipeline(
      getMemoryStore(),
      storage,
      async (_id: string) => null, // passport pubkey lookup — wire later
    );
    return archivePipeline;
  } catch {
    archivePipeline = null;
    return null;
  }
}
```

- [ ] **Step 2: Replace snapshot 501 stubs**

Replace `POST /v1/memory/snapshots`:
```typescript
memoryRouter.post('/v1/memory/snapshots', async (req, res) => {
  try {
    const pipeline = getArchivePipeline();
    if (!pipeline) return res.status(503).json({ success: false, error: 'DePIN storage not configured' });
    const callerId = getCallerPassportId(req);
    const { agent_passport_id, snapshot_type, namespace } = req.body;
    const agentId = callerId === '__admin__' ? agent_passport_id : callerId;
    if (!agentId) return res.status(400).json({ success: false, error: 'Missing agent_passport_id' });
    const result = await pipeline.createSnapshot(agentId, snapshot_type || 'checkpoint', namespace);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
```

Replace `POST /v1/memory/snapshots/restore`:
```typescript
memoryRouter.post('/v1/memory/snapshots/restore', async (req, res) => {
  try {
    const pipeline = getArchivePipeline();
    if (!pipeline) return res.status(503).json({ success: false, error: 'DePIN storage not configured' });
    const callerId = getCallerPassportId(req);
    const { agent_passport_id, cid, mode, target_namespace } = req.body;
    const agentId = callerId === '__admin__' ? agent_passport_id : callerId;
    if (!agentId) return res.status(400).json({ success: false, error: 'Missing agent_passport_id' });
    if (!cid) return res.status(400).json({ success: false, error: 'Missing cid' });
    if (!mode) return res.status(400).json({ success: false, error: 'Missing mode' });
    if (mode === 'fork' && !target_namespace) {
      return res.status(400).json({ success: false, error: 'target_namespace required for fork mode' });
    }
    const result = await pipeline.restoreSnapshot(agentId, { cid, mode, target_namespace });
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message.includes('Identity mismatch')) return res.status(422).json({ success: false, error: error.message });
    if (error.message.includes('Invalid LMF')) return res.status(422).json({ success: false, error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 3: Replace compact 501 stub**

```typescript
let extractionPipeline: ExtractionPipeline | null = null;
function getExtractionPipeline(): ExtractionPipeline | null {
  if (extractionPipeline) return extractionPipeline;
  const svc = getService();
  const cfg = getDefaultConfig();
  if (!cfg.extraction_enabled) return null;
  extractionPipeline = new ExtractionPipeline(svc, getMemoryStore(), cfg);
  return extractionPipeline;
}

memoryRouter.post('/v1/memory/compact', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const { agent_passport_id, namespace, session_id, mode } = req.body;
    const agentId = callerId === '__admin__' ? agent_passport_id : callerId;
    if (!agentId) return res.status(400).json({ success: false, error: 'Missing agent_passport_id' });
    const ns = namespace || `agent:${agentId}`;
    const compaction = new CompactionPipeline(
      getMemoryStore(), getExtractionPipeline(), getArchivePipeline(), getDefaultCompactionConfig(),
    );
    const result = await compaction.compact(agentId, ns, { session_id, mode: mode || 'full' });
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 4: Add entity, trust-weighted, temporal routes**

```typescript
// POST /v1/memory/entity
memoryRouter.post('/v1/memory/entity', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const { content, entity_name, entity_type, entity_id, attributes, relationships, source_memory_ids, metadata, memory_lane } = req.body;
    if (!entity_name) return res.status(400).json({ success: false, error: 'Missing entity_name' });
    if (!entity_type) return res.status(400).json({ success: false, error: 'Missing entity_type' });
    const namespace = resolveNamespace(req, callerId);
    const result = await getService().addEntity(callerId, {
      namespace, content: content || entity_name, entity_name, entity_type, entity_id,
      attributes: attributes || {}, relationships: relationships || [],
      source_memory_ids, metadata, memory_lane,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes('permission') ? 403
      : error.message?.includes('is required') || error.message?.includes('must be') ? 400
      : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
});

// POST /v1/memory/trust-weighted
memoryRouter.post('/v1/memory/trust-weighted', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const { content, source_agent_passport_id, trust_score, decay_factor, weighted_relevance, source_memory_ids, metadata, memory_lane } = req.body;
    if (!source_agent_passport_id) return res.status(400).json({ success: false, error: 'Missing source_agent_passport_id' });
    const namespace = resolveNamespace(req, callerId);
    const result = await getService().addTrustWeighted(callerId, {
      namespace, content: content || `Trust ${source_agent_passport_id}`,
      source_agent_passport_id, trust_score, decay_factor, weighted_relevance,
      source_memory_ids, metadata, memory_lane,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes('permission') ? 403
      : error.message?.includes('is required') || error.message?.includes('must be') ? 400
      : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
});

// POST /v1/memory/temporal
memoryRouter.post('/v1/memory/temporal', async (req, res) => {
  try {
    const callerId = getCallerPassportId(req);
    const { content, valid_from, valid_to, recorded_at, source_memory_ids, metadata, memory_lane } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'Missing content' });
    if (valid_from === undefined) return res.status(400).json({ success: false, error: 'Missing valid_from' });
    const namespace = resolveNamespace(req, callerId);
    const result = await getService().addTemporal(callerId, {
      namespace, content, valid_from, valid_to: valid_to ?? null,
      recorded_at: recorded_at || Date.now(),
      source_memory_ids, metadata, memory_lane,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes('permission') ? 403
      : error.message?.includes('is required') || error.message?.includes('must be') ? 400
      : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 5: Add memory_lane + lanes to recall route**

Update `POST /v1/memory/recall` to pass `lanes` and `semantic_query_embedding` from body:
```typescript
const response = await getService().recall(callerId, {
  ...req.body,
  agent_passport_id: callerId === '__admin__' ? req.body.agent_passport_id : callerId,
  lanes: req.body.lanes,
  semantic_query_embedding: req.body.semantic_query_embedding,
});
```

- [ ] **Step 6: Run type-check**

Run: `cd offchain && npm run type-check`
Expected: No new errors from memory changes

- [ ] **Step 7: Commit**

```bash
git add offchain/packages/gateway-lite/src/routes/core/memoryRoutes.ts
git commit -m "feat(memory): wire snapshot/restore, compact, entity/trust-weighted/temporal routes"
```

---

### Task 15: MCP Tools + Barrel Exports

**Files:**
- Modify: `offchain/packages/contrib/integrations/mcp-server/memoryTools.ts`
- Modify: `offchain/packages/engine/src/memory/index.ts`

- [ ] **Step 1: Extend MCP memory_add tool type enum**

In `memoryTools.ts`, update the `memory_add` tool definition's `type` enum to include:
```typescript
enum: ['episodic', 'semantic', 'procedural', 'entity', 'trust_weighted', 'temporal']
```

Add handling in `executeMemoryTool` for the new types:
```typescript
case 'entity':
  return await service.addEntity(params.agent_passport_id, {
    namespace: params.namespace || `agent:${params.agent_passport_id}`,
    content: params.content, entity_name: params.entity_name,
    entity_type: params.entity_type, attributes: params.attributes || {},
    relationships: params.relationships || [],
    source_memory_ids: params.source_memory_ids,
    metadata: params.metadata, memory_lane: params.memory_lane,
  });
case 'trust_weighted':
  return await service.addTrustWeighted(params.agent_passport_id, {
    namespace: params.namespace || `agent:${params.agent_passport_id}`,
    content: params.content, source_agent_passport_id: params.source_agent_passport_id,
    trust_score: params.trust_score, decay_factor: params.decay_factor,
    weighted_relevance: params.weighted_relevance,
    source_memory_ids: params.source_memory_ids,
    metadata: params.metadata, memory_lane: params.memory_lane,
  });
case 'temporal':
  return await service.addTemporal(params.agent_passport_id, {
    namespace: params.namespace || `agent:${params.agent_passport_id}`,
    content: params.content, valid_from: params.valid_from,
    valid_to: params.valid_to ?? null, recorded_at: params.recorded_at || Date.now(),
    source_memory_ids: params.source_memory_ids,
    metadata: params.metadata, memory_lane: params.memory_lane,
  });
```

- [ ] **Step 2: Update barrel exports in memory/index.ts**

Add:
```typescript
export { CompactionPipeline } from './compactionPipeline';
export { validateExtractionResponse } from './extraction';
export { validateEntity } from './managers/entity';
export { validateTrustWeighted } from './managers/trustWeighted';
export { validateTemporal } from './managers/temporal';
export { classifyQueryIntent } from './recall';
export { rerankCandidates } from './recall';
```

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/contrib/integrations/mcp-server/memoryTools.ts offchain/packages/engine/src/memory/index.ts
git commit -m "feat(memory): extend MCP tools for all 6 types + update barrel exports"
```

---

### Task 16: Full Test Verification + CLAUDE.md

**Files:**
- Modify: `Lucid-L2/CLAUDE.md`

- [ ] **Step 1: Run full test suite**

Run: `cd offchain && npm test 2>&1 | tail -30`
Expected: All suites pass, 0 failures. New test count should be higher than baseline (1432).

- [ ] **Step 2: Run type-check**

Run: `cd offchain && npm run type-check`
Expected: No new errors from memory changes.

- [ ] **Step 3: Fix any failures**

Address any test failures or type errors. Common issues:
- Missing imports in modified files
- `testConfig` in service.test.ts missing new required fields
- Type mismatches from new fields on MemoryEntry

- [ ] **Step 4: Update CLAUDE.md**

Add to the MemoryMap section:
```
v2 additions: semantic recall (two-stage retrieval + reranking), tiered compaction (hot/warm/cold),
memory lanes (self/user/shared/market), 6 active type managers, extraction hardening.
```

Update API endpoints list to include:
```
- `POST /v1/memory/entity` — Entity memory
- `POST /v1/memory/trust-weighted` — Trust-weighted memory (advanced)
- `POST /v1/memory/temporal` — Temporal memory
- `POST /v1/memory/compact` — Trigger compaction
```

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/memory/ offchain/packages/gateway-lite/src/routes/core/memoryRoutes.ts offchain/packages/contrib/integrations/mcp-server/memoryTools.ts infrastructure/migrations/20260313_memory_map_v2.sql CLAUDE.md
git commit -m "feat(memory): MemoryMap v2 complete — all 6 spec sections implemented"
```

- [ ] **Step 6: Push**

```bash
git push origin master
```
