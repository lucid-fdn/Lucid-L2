# MemoryMap v2 — Closing the Gaps

**Date:** 2026-03-13
**Status:** Design
**Author:** Kevin Wayne + Claude
**Depends on:** MemoryMap v1 (merged to master, 20 tasks, 41 files)

## Context

MemoryMap v1 shipped a complete three-layer agent memory system: types, stores, hash chain, provenance, receipts, REST routes, MCP tools, SDK namespace. Five gaps remain from v1 that this spec addresses.

### What is NOT in scope

- **Embedding generation** — external `EmbeddingService` responsibility. MemoryMap consumes embeddings; it does not own embedding inference.
- **Entity graph traversal** — future work.
- **Temporal validity reasoning in recall** — future work.
- **Full contradiction detection** — v1 supersession is exact replacement only.

---

## Section 1: Semantic Recall Path

### Problem

`recall()` ignores the query string. Returns entries sorted by recency with a 30-day decay score. The `query` parameter in `RecallRequest` is effectively unused.

### Design

#### 1.1 New store method

Add `nearestByEmbedding()` to `IMemoryStore`:

```typescript
nearestByEmbedding(
  embedding: number[],
  agent_passport_id: string,
  namespace?: string,
  types?: MemoryType[],
  limit?: number,
  similarity_threshold?: number,
): Promise<(MemoryEntry & { similarity: number })[]>
```

**Postgres implementation:**

```sql
-- Dynamic SQL (built in code, not OR-based NULL checks which defeat indexes)
SELECT *, 1 - (embedding <=> $1) AS similarity
FROM memory_entries
WHERE agent_passport_id = $2
  AND status = 'active'
  AND embedding IS NOT NULL
  [AND namespace = $3]              -- appended only when namespace provided
  [AND type = ANY($4)]              -- appended only when types provided
  AND 1 - (embedding <=> $1) > $threshold
ORDER BY embedding <=> $1
LIMIT $N
```

**Implementation note:** Use dynamic SQL construction (same pattern as existing `buildQuerySQL` in `postgres.ts`) — do NOT use `($X IS NULL OR col = $X)` patterns as they prevent index usage with pgvector. Omit unused WHERE clauses entirely for optimal query planning.

**InMemory implementation:** brute-force cosine similarity over all entries with embeddings.

**Default similarity threshold:** 0.65 (configurable via `config.recall_similarity_threshold`).

#### 1.2 RecallRequest extension

```typescript
// New optional field
semantic_query_embedding?: number[]  // provided by external EmbeddingService
```

Named `semantic_query_embedding` (not `query_embedding`) to avoid ambiguity with future graph/entity retrieval paths.

**Deprecation of `min_similarity`:** The existing `RecallRequest.min_similarity` field is deprecated in favor of `config.recall_similarity_threshold`. If both are provided, `min_similarity` takes precedence (per-request override). If only `min_similarity` is set, it is used as the threshold. If neither is set, the config default (0.65) applies.

#### 1.3 Two-stage retrieval

**Stage 1 — Fast candidate retrieval:**
- If `semantic_query_embedding` provided: fetch top K candidates (default K=50, configurable) via `nearestByEmbedding()`
- If not provided: fall back to `store.query()` with recency ordering + `applyContentFilter()` keyword matching (v1 recall does not call `applyContentFilter` — the v2 rewrite must wire it into the fallback path)

**Stage 2 — Metadata-aware reranking:**

All candidates scored with unified model:

```
final_score =
    similarity_weight * similarity
  + recency_weight   * recency_score
  + type_weight       * memory_type_bonus
  + quality_weight    * confidence_or_priority
```

Default weights:

| Signal | Weight | Source |
|--------|--------|--------|
| `similarity` | 0.55 | cosine similarity from stage 1 (0.0 for non-embedded fallback — see note below) |
| `recency` | 0.20 | `max(0, 1 - age_ms / 30d_ms)` |
| `type_bonus` | 0.15 | query intent heuristic (see below) |
| `quality` | 0.10 | `confidence` for semantic, `priority/10` for procedural, 0.5 default |

#### 1.4 Query intent heuristic

Before reranking, classify query intent to set type bonuses:

| Query pattern | Boost | Examples |
|---------------|-------|---------|
| Preference / fact / profile keywords | semantic +0.3 | "what does the user prefer", "ETH balance" |
| Behavior / instruction / policy keywords | procedural +0.3 | "how should I respond", "greeting rules" |
| Recent conversation / session context | episodic +0.3 | "what just happened", "last message" |
| Default (no match) | no bonus | even weighting across types |

Implementation: keyword list matching in v1. Can evolve to classifier later.

**Intent overfitting guard:** Cap type bonus so it cannot outweigh semantic similarity: `effective_type_bonus = min(type_bonus, similarity)`. This prevents high intent scores from promoting low-similarity entries above actual semantic matches.

#### 1.5 Fallback safety

If semantic search returns fewer than `config.recall_min_results` (default 3):
1. Fall back to recency + keyword retrieval
2. Fill remaining slots up to requested `limit`
3. Fallback entries scored with `similarity = 0.0` (recency and type bonuses still apply)

**Design note:** Non-embedded fallback entries are hard-capped at ~0.45 maximum score (since similarity_weight * 0.0 = 0). This is intentional — semantically matched entries should always rank above recency-only fallbacks. If the fallback pool is insufficient, consider triggering embedding computation for unembedded entries as a background task.

#### 1.6 Expired entry filtering

Normal recall excludes `status = 'expired'` by default. Consistent with existing model where default status filter is `['active']`. Callers can opt in to expired entries via `include_archived: true` (which now includes both archived and expired).

---

## Section 2: Snapshot/Restore Route Wiring

### Problem

`ArchivePipeline` is fully implemented (create, restore, serialize, verify). REST routes return 501 stubs. SDK methods call those 501 routes.

### Design

#### 2.1 Lazy-init singleton

Same pattern as `MemoryService` in routes. `getArchivePipeline()` returns singleton, constructed with:

1. **`depinStorage`** — `IDepinStorage` from `engine/src/storage/depin`. Resolved from `DEPIN_STORAGE_PROVIDER` env var.
2. **`getPassportPubkey`** — passport service lookup for signature verification on restore.

If `DEPIN_STORAGE_PROVIDER` is not configured, `getArchivePipeline()` returns `null`.

#### 2.2 Route shapes

**`POST /v1/memory/snapshots`**

Body:
```json
{
  "agent_passport_id": "string",
  "snapshot_type": "checkpoint | migration | archive",
  "namespace": "string (optional)",
  "include_archived": "boolean (optional, default false)"
}
```

Response (200):
```json
{
  "success": true,
  "data": { "cid": "string", "snapshot_id": "string" }
}
```

**`POST /v1/memory/snapshots/restore`**

Body:
```json
{
  "agent_passport_id": "string",
  "cid": "string",
  "mode": "replace | merge | fork",
  "target_namespace": "string (optional, required for fork)"
}
```

Response (200):
```json
{
  "success": true,
  "data": {
    "entries_imported": "number",
    "entries_skipped": "number",
    "chain_head_hash": "string",
    "source_agent_passport_id": "string"
  }
}
```

#### 2.3 Error semantics

| Condition | Status | Message |
|-----------|--------|---------|
| DePIN not configured | 503 | "DePIN storage not configured" |
| Passport pubkey not found | 404 | "Passport not found: {id}" |
| LMF signature verification failed | 422 | "Snapshot verification failed: {reason}" |
| Invalid restore mode / missing fields | 400 | Standard validation error |

#### 2.4 Snapshot duplication behavior

Always create a new snapshot on each request. No dedup. Rationale: snapshots are cheap, and the caller controls when/why to snapshot. The `snapshot_type` field provides semantic intent.

#### 2.5 Graceful degradation

If DePIN storage is not configured:
- Snapshot/restore routes return 503
- All other MemoryMap features work normally
- `GET /v1/memory/snapshots` returns empty array (not 503)

---

## Section 3: Tiered Compaction

### Problem

No compaction exists. `POST /v1/memory/compact` returns 501. Long-running agents accumulate unbounded episodic entries.

### Design

#### 3.1 Three tiers

| Tier | What | Trigger | Action |
|------|-------|---------|--------|
| **Hot** | Recent episodic within window | Always live | No action — active context |
| **Warm** | Older episodic beyond hot window | Session close, idle timeout, manual | Extract → semantic/procedural, then archive raw episodic |
| **Cold** | Archived entries past retention | Retention TTL | Snapshot to DePIN, then hard-prune rows |

#### 3.2 Hot boundary (OR logic)

An episodic entry is **hot** if it satisfies **either** condition:
- Within the last `config.hot_window_turns` turns (default 50) for its session
- Created within the last `config.hot_window_ms` milliseconds (default 24 hours)

OR logic — whichever preserves more context.

#### 3.3 CompactionPipeline

```typescript
class CompactionPipeline {
  constructor(
    private store: IMemoryStore,
    private extractionPipeline: ExtractionPipeline,
    private archivePipeline: ArchivePipeline | null,
    private config: CompactionConfig,
  ) {}

  async compact(
    agent_passport_id: string,
    namespace: string,
    options?: {
      session_id?: string,
      mode?: 'warm' | 'cold' | 'full',  // default: 'full'
    }
  ): Promise<CompactionResult>
}
```

#### 3.4 Compaction algorithm

**Step 1: Find eligible sessions**

Compaction is session-scoped first, namespace-scoped second:
- Find all sessions for `agent_passport_id` + `namespace`
- Filter to: closed sessions, OR active sessions idle longer than `config.hot_window_ms`
- If `options.session_id` provided, scope to that single session

**Step 2: Warm compaction (per session)**

For each eligible session:
1. Query episodic entries ordered by `turn_index ASC`
2. Identify warm candidates: entries beyond hot boundary (OR logic)
3. Check `last_compacted_turn_index` watermark — skip already-compacted ranges
4. Run extraction pipeline on warm range → creates semantic/procedural entries
5. Archive extracted episodic entries (`status → 'archived'`)
6. Update `last_compacted_turn_index` watermark on session

**Step 3: Cold compaction**

If `mode` is `'cold'` or `'full'`:
1. Query all archived entries older than `config.cold_retention_ms` (default 30 days)
2. **Gate:** if `config.cold_requires_snapshot` (default true) and no snapshot exists containing these entries, skip cold pruning
3. If DePIN is configured and no recent snapshot: trigger `archivePipeline.createSnapshot()` first
4. Hard-delete qualifying rows via new `store.deleteBatch(memory_ids)` method (see 3.10)
5. Provenance and snapshot pointer records are retained

**What survives hard prune:**
- `memory_snapshots` row with CID pointer
- Provenance records referencing deleted entries (audit trail — `memory_provenance` FK is not cascaded)
- The `.lmf` file on DePIN contains full entries + provenance

#### 3.5 Idempotency

`last_compacted_turn_index` watermark on `MemorySession` prevents re-extraction of already-compacted windows. Add column to `memory_sessions` table:

```sql
ALTER TABLE memory_sessions ADD COLUMN last_compacted_turn_index INTEGER NOT NULL DEFAULT -1;
```

**Type update:** Add `last_compacted_turn_index: number` to the `MemorySession` interface in `types.ts`. Update `rowToSession()` in `postgres.ts` and `InMemoryMemoryStore.createSession()` to handle the field.

**Watermark semantics:** `last_compacted_turn_index` represents the **maximum** turn_index that has been compacted, not the last processed index. After compaction, set to `MAX(turn_index)` of the compacted range. This prevents regression on partial runs.

The extraction pipeline's existing content-hash idempotency set provides a second layer of dedup protection.

#### 3.6 Triggers

| Trigger | When | Mode |
|---------|------|------|
| `MemoryService.closeSession()` | Session close, if `config.compact_on_session_close` | warm |
| `POST /v1/memory/compact` | Manual API call | specified by caller (default: full) |
| `agentHealthMonitor` cron | Periodic sweep (configurable interval) | full |

#### 3.7 Manual compact route

**`POST /v1/memory/compact`**

Body:
```json
{
  "agent_passport_id": "string",
  "namespace": "string (optional)",
  "session_id": "string (optional)",
  "mode": "warm | cold | full (default: full)"
}
```

Response (200):
```json
{
  "success": true,
  "data": {
    "sessions_compacted": "number",
    "episodic_archived": "number",
    "semantic_created": "number",
    "procedural_created": "number",
    "cold_pruned": "number",
    "snapshot_cid": "string | null"
  }
}
```

#### 3.8 CompactionConfig

```typescript
interface CompactionConfig {
  compact_on_session_close: boolean;     // default: true
  hot_window_turns: number;              // default: 50
  hot_window_ms: number;                 // default: 86_400_000 (24h)
  cold_retention_ms: number;             // default: 2_592_000_000 (30d)
  cold_requires_snapshot: boolean;       // default: true
}
```

#### 3.9 Safety

- Cold pruning gated by `cold_requires_snapshot: true` — will not delete rows unless a qualifying snapshot exists (see gate definition below)
- If DePIN storage is not configured, cold tier does not activate (warm compaction still works)
- Warm compaction is idempotent via watermark + extraction content-hash dedup

**Cold gate definition:** A snapshot "covers" a cold candidate set if the snapshot was taken after all entries in the set were written. To handle clock drift and out-of-order writes, compare against the newest entry's `created_at` in the cold set: `SELECT 1 FROM memory_snapshots WHERE agent_passport_id = $1 AND created_at >= $2 LIMIT 1` where `$2` is `MAX(created_at)` of the cold candidate set. For extra safety, add a small buffer (e.g., 60 seconds) to account for clock skew: `created_at >= $2 + interval '60 seconds'`.

#### 3.10 New IMemoryStore methods required

```typescript
// Hard-delete entries (for cold compaction only)
deleteBatch(memory_ids: string[]): Promise<void>;

// Update compaction watermark on session
updateCompactionWatermark(session_id: string, turn_index: number): Promise<void>;
```

Both Postgres and InMemory implementations must be updated. `deleteBatch` is `DELETE FROM memory_entries WHERE memory_id = ANY($1)`. `updateCompactionWatermark` is `UPDATE memory_sessions SET last_compacted_turn_index = $2 WHERE session_id = $1`.

**Note:** `memory_provenance` FK to `memory_entries` must NOT cascade on delete. Provenance records survive entry deletion as audit trail.

**Pre-delete preservation:** Before `deleteBatch()`, copy each entry's `content_hash` into a new `deleted_memory_hash TEXT` column on the corresponding provenance records. This preserves verifiability after the entry row disappears — verification tools can reconstruct the chain from provenance hashes alone. Add to migration: `ALTER TABLE memory_provenance ADD COLUMN deleted_memory_hash TEXT;`

#### 3.11 Snapshot namespace scope

`ArchivePipeline.createSnapshot()` currently hardcodes namespace to `agent:{id}`. For compaction (which is namespace-scoped), `createSnapshot()` must accept an optional `namespace` parameter. When provided, only entries and provenance for that namespace are included. When omitted, all namespaces for the agent are included (current behavior).

#### 3.12 CompactionConfig location

`CompactionConfig` is a **standalone interface** (not merged into `MemoryServiceConfig`). It is passed directly to `CompactionPipeline` constructor. The existing `MemoryServiceConfig.compaction_idle_timeout_ms` field is deprecated in favor of `CompactionConfig.hot_window_ms`. Routes construct `CompactionConfig` from env vars independently.

---

## Section 4: LLM Extraction Hardening

### Problem

`ExtractionPipeline.callLLM()` does a raw `fetch()` with no output validation, silently returns empty on any error, uses a basic single-string prompt, and has no token budget awareness.

### Design

#### 4.1 Structured output validation

**Extraction output contract:**

```typescript
interface ExtractionOutputSchema {
  schema_version: '1.0';
  facts: Array<{
    fact: string;
    confidence: number;       // [0, 1]
  }>;
  rules: Array<{
    rule: string;
    trigger: string;
    priority: number;         // >= 0
  }>;
}
```

**Validation function:**

```typescript
type ValidatedExtractionResult = {
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
};

function validateExtractionResponse(raw: unknown): ValidatedExtractionResult
```

Behavior:
- **Schema version check:** if `schema_version` is missing, assume `'1.0'` (LLMs sometimes omit fields). If `schema_version` is present but unsupported (not `'1.0'`), reject the entire response with a warning (do not attempt best-effort parsing of unknown schemas)
- Validate entry-by-entry — drop malformed items with a warning, keep valid ones
- Cap output: max 20 facts + 10 rules per extraction (configurable via `config.extraction_max_facts`, `config.extraction_max_rules`)
- Return cleaned payload + warnings array for observability

#### 4.2 Error categorization

Replace silent catch-all:

| Error type | Detection | Action |
|-----------|-----------|--------|
| Network/timeout | fetch throws, ECONNREFUSED, ETIMEDOUT | Log warn, return empty, allow retry on next trigger |
| Rate limit | HTTP 429 | Log warn, apply exponential backoff to `lastRun` map |
| Malformed response | JSON parse failure, schema validation failure | Log error with response body for debugging, return empty |
| Auth failure | HTTP 401/403 | Log error, **disable extraction at provider level** (not session-local). Re-enable requires config change or restart |

#### 4.3 System prompt discipline

Split into structured messages:

**System message:**
- Role: "You are a memory extraction agent for the Lucid AI platform."
- Output schema: JSON with `schema_version`, `facts[]`, `rules[]`
- Constraints: no duplicates of existing facts, confidence reflects certainty, rules must have actionable triggers
- Format: `response_format: { type: 'json_object' }`

**User message:**
- Existing semantic facts (for dedup): listed as bullet points
- Conversation context: episodic entries formatted as `[role]: content`
- Instruction: "Extract new facts and behavioral rules from this conversation."

#### 4.4 Token budget

Token estimation is a **heuristic** (approximately `character_count / 4` — ~1 token per 4 characters). The spec acknowledges this is rough and leaves room for a provider-specific tokenizer later.

Token estimate is used only for truncation safety; final LLM provider context limits remain authoritative. If estimated token count of the episodic window exceeds `config.extraction_max_tokens` (default 8000, which corresponds to ~32,000 characters):
- Truncate oldest turns first (preserve recent context)
- Log a warning with truncation count

#### 4.5 Supersession detection (v1 scope)

**v1 rule:** exact replacement only, not general contradiction reasoning.

When extraction produces a fact where an existing active semantic entry has the **exact same `fact` string** (case-insensitive):
1. Mark old entry as `superseded` via `store.supersede(old_id, new_id)`
2. Write provenance record with `operation: 'supersede'`
3. New fact includes `supersedes: [old_memory_id]`

**Note:** Supersession is a semantic relationship, not a cryptographic one. Two facts that differ only in case will have different content hashes and different chain positions. The case-insensitive match identifies them as "same fact" for supersession purposes, but they remain cryptographically distinct entries in the hash chain. This is correct — the hash chain records history, supersession records intent.

Semantic similarity-based supersession detection is future work (requires embeddings).

#### 4.6 Output dedup before write

Before writing extracted entries to store:
- Hash the normalized fact/rule payload
- Skip if an identical active semantic/procedural entry already exists for this agent + namespace
- This prevents repetitive re-extraction noise across multiple extraction runs

#### 4.7 Extraction metadata

When extraction writes semantic/procedural entries, include in `metadata`:

```json
{
  "extracted_by_model": "gpt-4o-mini",
  "extraction_run_id": "uuid",
  "extraction_version": "1.0"
}
```

Combined with `source_memory_ids` (pointing to source episodic entries), this provides full extraction provenance.

#### 4.8 Metrics

The extraction pipeline emits structured log events for:
- Extraction attempts (total)
- Success / failure count
- Malformed response rate
- Average facts/rules emitted per extraction
- Truncation events
- Supersessions triggered
- Output dedup hits

These are structured log events (not a dashboard) — sufficient for operational observability.

---

## Section 5: Staged Type Managers

### Problem

Entity, trust_weighted, and temporal types are fully defined in `types.ts` with DB columns in the migration, but `getManager()` throws "staged" for all three. No validation, no write path, no service/route/SDK methods.

### Design

#### 5.1 Entity Manager (`managers/entity.ts`)

Validates:
- `entity_name: string` — non-empty
- `entity_type: string` — non-empty (free-form string for v1; future: controlled vocabulary converging toward `person`, `organization`, `tool`, `protocol`, `dataset`, `contract`, `wallet`, `token`)
- `entity_id?: string` — optional stable identifier (future-proofing; when omitted, `memory_id` serves as identifier. Long-term, entity dedup and graph traversal will use this field)
- `attributes: Record<string, unknown>` — required (can be empty `{}`)
- `relationships: EntityRelation[]` — required (can be empty `[]`); each element validated:
  - `target_entity_id: string` — non-empty
  - `relation_type: string` — non-empty
  - `confidence: number` — in [0, 1]
- `source_memory_ids: string[]` — optional, for provenance linkage

#### 5.2 Trust-Weighted Manager (`managers/trust_weighted.ts`)

Validates:
- `source_agent_passport_id: string` — non-empty (the agent whose memory is being weighted)
- `trust_score: number` — in [0, 1]
- `decay_factor: number` — in [0, 1] (rate of trust decay over time)
- `weighted_relevance: number` — in [0, 1] (**treated as cached derived score, not canonical truth**; capped at 1.0 to prevent ranking math overflow)
- `source_memory_ids: string[]` — optional, for provenance linkage

**Exposure:** Implemented in engine/service layer. REST/MCP endpoints marked as **advanced/optional** — available but not prominently documented for external users. Primary consumers are internal systems (reputation sync, agent-to-agent trust).

#### 5.3 Temporal Manager (`managers/temporal.ts`)

Validates:
- `valid_from: number` — Unix ms, required
- `valid_to: number | null` — Unix ms or null (null = "still valid")
- `recorded_at: number` — Unix ms, required
- Constraint: if `valid_to` is set, `valid_to > valid_from`
- Constraint: `recorded_at >= valid_from` (cannot record a fact before its validity period — prevents temporal paradoxes)
- `source_memory_ids: string[]` — optional, for provenance linkage

#### 5.4 Service methods

Add to `MemoryService`:

```typescript
addEntity(callerPassportId: string, input: { ... }): Promise<MemoryWriteResult>
addTrustWeighted(callerPassportId: string, input: { ... }): Promise<MemoryWriteResult>
addTemporal(callerPassportId: string, input: { ... }): Promise<MemoryWriteResult>
```

All three use the existing `writeGeneric()` pipeline: ACL → manager validation → hash → prev_hash → write → provenance → receipt. No bespoke logic needed.

#### 5.5 Route + MCP + SDK extensions

**Routes:**
- `POST /v1/memory/entity` — same pattern as semantic/procedural
- `POST /v1/memory/trust-weighted` — same pattern, but documented as advanced
- `POST /v1/memory/temporal` — same pattern

**MCP:** extend `memory_add` tool's `type` enum to include `entity | trust_weighted | temporal`.

**SDK:** `memory.addEntity()`, `memory.addTrustWeighted()`, `memory.addTemporal()`.

#### 5.6 `source_memory_ids` is optional for staged types

For semantic and procedural types, `source_memory_ids` is **required** (they are always derived from other memories via extraction). For entity, trust_weighted, and temporal, `source_memory_ids` is **optional** because these types can originate from external systems (e.g., entity records from knowledge bases, trust scores from reputation systems, temporal facts from oracles) rather than from other memory entries. When not provided, defaults to `[]`.

**Type interface update required:** Add `source_memory_ids?: string[]` to `EntityMemory`, `TrustWeightedMemory`, and `TemporalMemory` interfaces in `types.ts`. The DB column `source_memory_ids TEXT[]` already exists in the v1 migration for all memory types.

#### 5.7 Recall integration

No special recall logic for v1:
- All three types participate in standard recall (recency + embedding similarity when available)
- Normal recall excludes `status = 'expired'` by default (temporal entries with `valid_to` in the past would need explicit expiry logic — future work)
- Entity graph traversal and temporal validity filtering are explicitly out of scope

---

## Section 6: Memory Lanes

### Problem

All memories for an agent sit in the same flat space, distinguished only by type, namespace, and status. As agents become multi-tenant (serving users), collaborative (sharing context), and market-aware (consuming external data), recall ambiguity increases. An agent's self-learned rules, a specific user's preferences, shared team knowledge, and market facts are structurally indistinguishable.

### Design

#### 6.1 New dimension

Add `memory_lane` to `MemoryEntry`:

```typescript
export type MemoryLane = 'self' | 'user' | 'shared' | 'market';
```

| Lane | What lives here | Examples |
|------|----------------|---------|
| **self** | Agent's own operating memory | Procedural rules, self-improvement notes, internal strategies |
| **user** | Per-user memory | Preferences, history, tone, account-specific facts |
| **shared** | Shared workspace/team context | Org policies, common playbooks, team knowledge |
| **market** | Externally sourced world-state | Prices, protocol state, trust-weighted external facts, temporal observations |

Default: `'self'`. Optional on all write methods — backward compatible with v1 (all v1 entries are implicitly `self`).

#### 6.2 Schema change

```typescript
// Add to MemoryEntry interface
memory_lane: MemoryLane;  // default: 'self'
```

```sql
-- Add to memory_entries
ALTER TABLE memory_entries
  ADD COLUMN memory_lane TEXT NOT NULL DEFAULT 'self'
  CHECK (memory_lane IN ('self', 'user', 'shared', 'market'));

CREATE INDEX idx_memory_lane ON memory_entries(agent_passport_id, memory_lane, status);
```

#### 6.3 Recall integration

Add optional lane filter to `RecallRequest`:

```typescript
lanes?: MemoryLane[]  // optional — when omitted, search all lanes
```

Lane participates in two-stage retrieval:
- **Stage 1:** `nearestByEmbedding()` accepts optional `lanes` filter (appended to dynamic WHERE)
- **Stage 2:** Query intent heuristic boosts lanes alongside types:

| Query intent | Lane boost |
|-------------|-----------|
| User question / preference | user +0.2 |
| Internal planning / self-reflection | self +0.2 |
| Coordination / team task | shared +0.2 |
| Market / price / state query | market +0.2 |

Lane boost follows the same intent overfitting guard: `effective_lane_bonus = min(lane_bonus, similarity)`.

#### 6.4 Compaction per lane

Different lanes can have different lifecycle policies:

| Lane | Hot window | Cold retention | Rationale |
|------|-----------|----------------|-----------|
| self | Long (50 turns / 24h) | Long (30d) | Agent's core identity — retain longer |
| user | Medium (30 turns / 12h) | Medium (14d) | Per-user context — summarize faster |
| shared | Long (50 turns / 24h) | Long (30d) | Team knowledge — important to keep |
| market | Short (10 turns / 4h) | Short (7d) | World-state — expires fast, refresh often |

These are **default** policies. `CompactionConfig` can override per-lane via:

```typescript
lane_overrides?: Partial<Record<MemoryLane, {
  hot_window_turns?: number;
  hot_window_ms?: number;
  cold_retention_ms?: number;
}>>;
```

#### 6.5 ACL reinforcement

Lane provides a natural ACL hint:
- `self` — only the owning agent can read/write
- `user` — owning agent + the specific user (when user auth is implemented)
- `shared` — owning agent + agents with `read` grant on the namespace
- `market` — read-open by default (world-state is public)

v1 implementation: ACL continues to use namespace-based ownership. Lane-based ACL refinement is additive — it narrows access, never broadens it.

#### 6.6 All write methods accept lane

All `addEpisodic()`, `addSemantic()`, `addProcedural()`, `addEntity()`, `addTrustWeighted()`, `addTemporal()` accept optional `memory_lane?: MemoryLane` in their input. Default: `'self'`. Routes, MCP tools, and SDK methods pass through the field.

#### 6.7 Backward compatibility

All existing v1 entries have `memory_lane = 'self'` (DB default). No migration of existing data needed. All queries that don't specify lane filter return entries from all lanes (existing behavior preserved).

---

## New Configuration Summary

All new config fields with defaults:

```typescript
// Added to MemoryServiceConfig
recall_similarity_threshold: number;        // default: 0.65
recall_candidate_pool_size: number;         // default: 50
recall_min_results: number;                 // default: 3
recall_similarity_weight: number;           // default: 0.55
recall_recency_weight: number;              // default: 0.20
recall_type_weight: number;                 // default: 0.15
recall_quality_weight: number;              // default: 0.10
// Invariant: similarity + recency + type + quality weights MUST sum to 1.0. Validated at config load time.

// CompactionConfig (new)
compact_on_session_close: boolean;          // default: true
hot_window_turns: number;                   // default: 50
hot_window_ms: number;                      // default: 86_400_000 (24h)
cold_retention_ms: number;                  // default: 2_592_000_000 (30d)
cold_requires_snapshot: boolean;            // default: true

// Added to MemoryServiceConfig (extraction)
extraction_max_tokens: number;              // default: 8000
extraction_max_facts: number;               // default: 20
extraction_max_rules: number;               // default: 10

// Environment variables
DEPIN_STORAGE_PROVIDER                      // enables snapshot/restore routes
```

---

## Migration Changes

```sql
-- Add compaction watermark to sessions
ALTER TABLE memory_sessions
  ADD COLUMN last_compacted_turn_index INTEGER NOT NULL DEFAULT -1;

-- Change provenance FK to SET NULL on delete (required for cold compaction hard-prune)
-- The v1 migration uses REFERENCES memory_entries(memory_id) with default RESTRICT,
-- which blocks DELETE. Change to SET NULL so provenance records survive entry deletion.
ALTER TABLE memory_provenance
  DROP CONSTRAINT memory_provenance_memory_id_fkey;
ALTER TABLE memory_provenance
  ALTER COLUMN memory_id DROP NOT NULL;
ALTER TABLE memory_provenance
  ADD CONSTRAINT memory_provenance_memory_id_fkey
    FOREIGN KEY (memory_id) REFERENCES memory_entries(memory_id) ON DELETE SET NULL;

-- Preserve content_hash in provenance after hard delete
ALTER TABLE memory_provenance
  ADD COLUMN deleted_memory_hash TEXT;

-- Memory lanes (Section 6)
ALTER TABLE memory_entries
  ADD COLUMN memory_lane TEXT NOT NULL DEFAULT 'self'
  CHECK (memory_lane IN ('self', 'user', 'shared', 'market'));
CREATE INDEX idx_memory_lane ON memory_entries(agent_passport_id, memory_lane, status);
```

No other schema changes — all new types already have columns in the v1 migration.

---

## Recall Telemetry

The recall pipeline emits structured log events per query:
- `recall_query_type`: semantic | fallback | mixed
- `candidate_pool_size`: number of stage-1 candidates
- `fallback_triggered`: boolean
- `average_similarity`: mean similarity of returned results
- `intent_classification`: fact | policy | recent | default

Not required for functionality but critical for tuning weights and detecting degradation.

---

## Security Invariants

**Snapshot restore identity verification:** `ArchivePipeline.restoreSnapshot()` must verify that `lmf.agent_passport_id` matches the request's `agent_passport_id` (or the caller is `__admin__`). Without this check, users could restore another agent's memory into their own namespace. The spec's route ACL check covers write permission, but the identity match must happen at the pipeline level before any entries are written.

---

## Files Changed (Estimated)

| Category | Files | Action |
|----------|-------|--------|
| Store interface + implementations | 3 | Modify (add `nearestByEmbedding`, `deleteBatch`, `updateCompactionWatermark`) |
| Recall / query module | 3 | Modify (two-stage retrieval, reranking, intent heuristic) |
| CompactionPipeline | 1 | Create |
| ExtractionPipeline | 1 | Modify (harden) |
| Managers (entity, trust_weighted, temporal) | 3 | Create |
| Manager index | 1 | Modify (register new managers) |
| MemoryService | 1 | Modify (add 3 methods, compaction trigger) |
| Types | 1 | Modify (config extensions, `last_compacted_turn_index` on MemorySession, `MemoryLane` type + field on MemoryEntry) |
| Routes | 1 | Modify (wire snapshot/restore/compact, add 3 new type routes) |
| MCP tools | 1 | Modify (extend memory_add type enum) |
| SDK | 1 | Modify (add 3 new type methods) |
| Migration | 1 | Create (add `last_compacted_turn_index`) |
| Tests | ~8 | Create/Modify |
| **Total** | **~26** | |
