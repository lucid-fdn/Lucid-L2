<!-- generated: commit 505ae77, 2026-03-18T19:46:46.351Z -->
# memory — Interface Reference

## Interfaces

### ChainVerifyResult
> `commitments.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `chain_length` | `number` | no |  |
| `errors` | `string[]` | no |  |
| `valid` | `boolean` | no |  |

**Extends:** —

### CompactionConfig
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `cold_requires_snapshot` | `boolean` | no |  |
| `cold_retention_ms` | `number` | no |  |
| `compact_on_session_close` | `boolean` | no |  |
| `hot_window_ms` | `number` | no |  |
| `hot_window_turns` | `number` | no |  |
| `lane_overrides` | `Partial<Record<"self" | "user" | "shared" | "market", { hot_window_turns?: number; hot_window_ms?: number; cold_retention_ms?: number; }>>` | yes |  |

**Extends:** —

### CompactionResult
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `cold_pruned` | `number` | no |  |
| `episodic_archived` | `number` | no |  |
| `extraction_triggered` | `boolean` | no |  |
| `sessions_compacted` | `number` | no |  |
| `snapshot_cid` | `string` | no |  |

**Extends:** —

### EmbeddingResult
> `embedding/interface.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `embedding` | `number[]` | no |  |
| `model` | `string` | no |  |
| `tokens_used` | `number` | no |  |

**Extends:** —

### EntityMemory
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `attributes` | `Record<string, unknown>` | no |  |
| `entity_id` | `string` | yes |  |
| `entity_name` | `string` | no |  |
| `entity_type` | `string` | no |  |
| `relationships` | `EntityRelation[]` | no |  |
| `source_memory_ids` | `string[]` | yes |  |

**Extends:** `MemoryEntry<'entity'>`

### EntityRelation
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `confidence` | `number` | no |  |
| `relation_type` | `string` | no |  |
| `target_entity_id` | `string` | no |  |

**Extends:** —

### EpisodicMemory
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `role` | `"user" | "assistant" | "system" | "tool"` | no |  |
| `session_id` | `string` | no |  |
| `tokens` | `number` | no |  |
| `tool_calls` | `ToolCallRecord[]` | yes |  |
| `turn_index` | `number` | no |  |

**Extends:** `MemoryEntry<'episodic'>`

### ExtractionOutputSchema
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `facts` | `{ fact: string; confidence: number; }[]` | no |  |
| `rules` | `{ rule: string; trigger: string; priority: number; }[]` | no |  |
| `schema_version` | `"1.0"` | no |  |

**Extends:** —

### IEmbeddingProvider
> `embedding/interface.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `dimensions` | `number` | no |  |
| `modelName` | `string` | no |  |

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `embed` | `text`: `string` | `Promise<EmbeddingResult>` |  |
| `embedBatch` | `texts`: `string[]` | `Promise<EmbeddingResult[]>` |  |

**Extends:** —

### IMemoryStore
> `store/interface.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `capabilities` | `MemoryStoreCapabilities` | no |  |

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `archive` | `memory_id`: `string` | `Promise<void>` |  |
| `archiveBatch` | `memory_ids`: `string[]` | `Promise<void>` |  |
| `closeSession` | `session_id`: `string`, `summary`?: `string` | `Promise<void>` |  |
| `count` | `q`: `Omit<MemoryQuery, "limit" | "offset">` | `Promise<number>` |  |
| `createSession` | `session`: `Omit<MemorySession, "created_at" | "turn_count" | "total_tokens" | "last_activity" | "last_compacted_turn_index" | "last_receipted_turn_index">` | `Promise<string>` |  |
| `deleteBatch` | `memory_ids`: `string[]` | `Promise<void>` |  |
| `getEntriesSince` | `agent_passport_id`: `string`, `since`: `number` | `Promise<MemoryEntry<"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal">[]>` |  |
| `getHealth` |  | `Promise<MemoryStoreHealth>` |  |
| `getLatestHash` | `agent_passport_id`: `string`, `namespace`: `string` | `Promise<string>` |  |
| `getLatestSnapshot` | `agent_passport_id`: `string` | `Promise<MemorySnapshot>` |  |
| `getProvenanceChain` | `agent_passport_id`: `string`, `namespace`: `string`, `limit`?: `number` | `Promise<ProvenanceRecord[]>` |  |
| `getProvenanceForMemory` | `memory_id`: `string` | `Promise<ProvenanceRecord[]>` |  |
| `getSession` | `session_id`: `string` | `Promise<MemorySession>` |  |
| `getStats` | `agent_passport_id`: `string` | `Promise<MemoryStats>` |  |
| `listSessions` | `agent_passport_id`: `string`, `status`?: `("active" | "archived" | "closed")[]` | `Promise<MemorySession[]>` |  |
| `listSnapshots` | `agent_passport_id`: `string` | `Promise<MemorySnapshot[]>` |  |
| `markOutboxError` | `event_id`: `string`, `error`: `string` | `Promise<void>` |  |
| `markOutboxProcessed` | `event_id`: `string` | `Promise<void>` |  |
| `nearestByEmbedding` | `embedding`: `number[]`, `agent_passport_id`: `string`, `namespace`?: `string`, `types`?: `("episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal")[]`, `limit`?: `number`, `similarity_threshold`?: `number`, `lanes`?: `("self" | "user" | "shared" | "market")[]` | `Promise<(MemoryEntry<"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal"> & { similarity: number; })[]>` |  |
| `query` | `q`: `MemoryQuery` | `Promise<MemoryEntry<"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal">[]>` |  |
| `queryOutboxPending` | `limit`: `number` | `Promise<OutboxEvent[]>` |  |
| `queryPendingEmbeddings` | `limit`: `number` | `Promise<MemoryEntry<"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal">[]>` |  |
| `read` | `memory_id`: `string` | `Promise<MemoryEntry<"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal">>` |  |
| `recordEmbeddingFailure` | `memory_id`: `string`, `error`: `string` | `Promise<void>` |  |
| `saveSnapshot` | `snapshot`: `Omit<MemorySnapshot, "snapshot_id">` | `Promise<string>` |  |
| `softDelete` | `memory_id`: `string` | `Promise<void>` |  |
| `supersede` | `memory_id`: `string`, `superseded_by`: `string` | `Promise<void>` |  |
| `updateCompactionWatermark` | `session_id`: `string`, `turn_index`: `number` | `Promise<void>` |  |
| `updateEmbedding` | `memory_id`: `string`, `embedding`: `number[]`, `model`: `string` | `Promise<void>` |  |
| `updateSessionStats` | `session_id`: `string`, `turn_delta`: `number`, `token_delta`: `number` | `Promise<void>` |  |
| `write` | `entry`: `WritableMemoryEntry & { content_hash: string; prev_hash: string | null; }` | `Promise<MemoryWriteResult>` |  |
| `writeBatch` | `entries`: `(WritableMemoryEntry & { content_hash: string; prev_hash: string | null; })[]` | `Promise<MemoryWriteResult[]>` |  |
| `writeOutboxEvent` | `event`: `Omit<OutboxEvent, "created_at" | "event_id" | "processed_at" | "retry_count" | "last_error">` | `Promise<string>` |  |
| `writeProvenance` | `record`: `Omit<ProvenanceRecord, "record_id">` | `Promise<string>` |  |

**Extends:** —

### IProjectionSink
> `projection/sinks/interface.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `name` | `string` | no |  |

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `healthCheck` |  | `Promise<boolean>` |  |
| `project` | `entry`: `ProjectableEntry` | `Promise<void>` |  |
| `projectBatch` | `entries`: `ProjectableEntry[]` | `Promise<void>` |  |
| `remove` | `memory_ids`: `string[]` | `Promise<void>` |  |

**Extends:** —

### LucidMemoryFile
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `anchor` | `{ chain: string; epoch_id: string; tx_hash: string; mmr_root: string; }` | yes |  |
| `archived_cids` | `string[]` | yes |  |
| `chain_head_hash` | `string` | no |  |
| `content_mmr_root` | `string` | no |  |
| `created_at` | `number` | no |  |
| `entries` | `MemoryEntry<"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal">[]` | no |  |
| `entry_count` | `number` | no |  |
| `provenance` | `ProvenanceRecord[]` | no |  |
| `sessions` | `MemorySession[]` | no |  |
| `signature` | `string` | no |  |
| `signer_pubkey` | `string` | no |  |
| `version` | `"1.0"` | no |  |

**Extends:** —

### MemoryCreatedEvent
> `events/memoryEvents.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `entry` | `MemoryEntry<"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal">` | no |  |
| `type` | `"memory.created"` | no |  |

**Extends:** `MemoryEvent`

### MemoryEntry
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `content` | `string` | no |  |
| `content_hash` | `string` | no |  |
| `created_at` | `number` | no |  |
| `embedding` | `number[]` | yes |  |
| `embedding_attempts` | `number` | no |  |
| `embedding_last_error` | `string` | yes |  |
| `embedding_model` | `string` | yes |  |
| `embedding_requested_at` | `number` | yes |  |
| `embedding_status` | `"pending" | "ready" | "failed" | "skipped"` | no |  |
| `embedding_updated_at` | `number` | yes |  |
| `memory_id` | `string` | no |  |
| `memory_lane` | `"self" | "user" | "shared" | "market"` | no |  |
| `metadata` | `Record<string, unknown>` | no |  |
| `namespace` | `string` | no |  |
| `prev_hash` | `string` | no |  |
| `receipt_hash` | `string` | yes |  |
| `receipt_run_id` | `string` | yes |  |
| `status` | `"active" | "superseded" | "archived" | "expired"` | no |  |
| `structured_content` | `Record<string, unknown>` | yes |  |
| `type` | `T` | no |  |
| `updated_at` | `number` | no |  |

**Extends:** —

### MemoryEvent
> `events/memoryEvents.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `namespace` | `string` | no |  |
| `timestamp` | `number` | no |  |
| `type` | `MemoryEventType` | no |  |

**Extends:** —

### MemoryQuery
> `store/interface.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `before` | `number` | yes |  |
| `content_hash` | `string` | yes |  |
| `embedding_status` | `("pending" | "ready" | "failed" | "skipped")[]` | yes |  |
| `limit` | `number` | yes |  |
| `memory_lane` | `("self" | "user" | "shared" | "market")[]` | yes |  |
| `namespace` | `string` | yes |  |
| `offset` | `number` | yes |  |
| `order_by` | `"created_at" | "updated_at" | "turn_index"` | yes |  |
| `order_dir` | `"asc" | "desc"` | yes |  |
| `session_id` | `string` | yes |  |
| `since` | `number` | yes |  |
| `status` | `("active" | "superseded" | "archived" | "expired")[]` | yes |  |
| `types` | `("episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal")[]` | yes |  |

**Extends:** —

### MemoryServiceConfig
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `auto_archive_after_ms` | `number` | yes |  |
| `compaction_idle_timeout_ms` | `number` | no |  |
| `embedding_enabled` | `boolean` | no |  |
| `embedding_model` | `string` | no |  |
| `extraction_batch_size` | `number` | no |  |
| `extraction_debounce_ms` | `number` | no |  |
| `extraction_enabled` | `boolean` | no |  |
| `extraction_max_facts` | `number` | no |  |
| `extraction_max_rules` | `number` | no |  |
| `extraction_max_tokens` | `number` | no |  |
| `extraction_model` | `string` | yes |  |
| `max_episodic_window` | `number` | no |  |
| `max_memory_db_size_mb` | `number` | no |  |
| `max_memory_entries` | `number` | no |  |
| `max_semantic_per_agent` | `number` | no |  |
| `max_vector_rows` | `number` | no |  |
| `provenance_enabled` | `boolean` | no |  |
| `recall_candidate_pool_size` | `number` | no |  |
| `recall_min_results` | `number` | no |  |
| `recall_quality_weight` | `number` | no |  |
| `recall_recency_weight` | `number` | no |  |
| `recall_similarity_threshold` | `number` | no |  |
| `recall_similarity_weight` | `number` | no |  |
| `recall_type_weight` | `number` | no |  |
| `receipts_enabled` | `boolean` | no |  |
| `trigger_on_session_close` | `boolean` | no |  |

**Extends:** —

### MemorySession
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `closed_at` | `number` | yes |  |
| `created_at` | `number` | no |  |
| `last_activity` | `number` | no |  |
| `last_compacted_turn_index` | `number` | no |  |
| `last_receipted_turn_index` | `number` | no |  |
| `namespace` | `string` | no |  |
| `session_id` | `string` | no |  |
| `status` | `"active" | "archived" | "closed"` | no |  |
| `summary` | `string` | yes |  |
| `total_tokens` | `number` | no |  |
| `turn_count` | `number` | no |  |

**Extends:** —

### MemorySnapshot
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `chain_head_hash` | `string` | no |  |
| `created_at` | `number` | no |  |
| `depin_cid` | `string` | no |  |
| `entry_count` | `number` | no |  |
| `snapshot_id` | `string` | no |  |
| `snapshot_type` | `"archive" | "checkpoint" | "migration"` | no |  |

**Extends:** —

### MemoryStats
> `store/interface.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `by_status` | `Record<"active" | "superseded" | "archived" | "expired", number>` | no |  |
| `by_type` | `Record<"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal", number>` | no |  |
| `chain_length` | `number` | no |  |
| `latest_hash` | `string` | no |  |
| `newest_entry` | `number` | no |  |
| `oldest_entry` | `number` | no |  |
| `total_entries` | `number` | no |  |

**Extends:** —

### MemoryStoreCapabilities
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `crossAgentQuery` | `boolean` | no |  |
| `localFirst` | `boolean` | no |  |
| `persistent` | `boolean` | no |  |
| `transactions` | `boolean` | no |  |
| `vectorSearch` | `boolean` | no |  |

**Extends:** —

### MemoryStoreHealth
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `capabilities` | `MemoryStoreCapabilities` | no |  |
| `dbPath` | `string` | yes |  |
| `entryCount` | `number` | no |  |
| `failedEmbeddings` | `number` | no |  |
| `pendingEmbeddings` | `number` | no |  |
| `schemaVersion` | `number` | no |  |
| `sizeMb` | `number` | yes |  |
| `storeType` | `"sqlite" | "postgres" | "memory"` | no |  |
| `vectorCount` | `number` | no |  |
| `walMode` | `boolean` | yes |  |

**Extends:** —

### MemoryWriteResult
> `store/interface.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `content_hash` | `string` | no |  |
| `memory_id` | `string` | no |  |
| `prev_hash` | `string` | no |  |

**Extends:** —

### OutboxEvent
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `created_at` | `number` | no |  |
| `event_id` | `string` | no |  |
| `event_type` | `string` | no |  |
| `last_error` | `string` | no |  |
| `memory_id` | `string` | no |  |
| `namespace` | `string` | no |  |
| `payload_json` | `string` | no |  |
| `processed_at` | `number` | no |  |
| `retry_count` | `number` | no |  |

**Extends:** —

### ProceduralMemory
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `priority` | `number` | no |  |
| `rule` | `string` | no |  |
| `source_memory_ids` | `string[]` | no |  |
| `trigger` | `string` | no |  |

**Extends:** `MemoryEntry<'procedural'>`

### ProjectableEntry
> `projection/sinks/interface.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `content` | `string` | no |  |
| `content_hash` | `string` | no |  |
| `created_at` | `number` | no |  |
| `embedding` | `number[]` | yes |  |
| `embedding_model` | `string` | yes |  |
| `idempotency_key` | `string` | no |  |
| `memory_id` | `string` | no |  |
| `memory_lane` | `string` | no |  |
| `metadata` | `Record<string, unknown>` | no |  |
| `namespace` | `string` | no |  |
| `type` | `string` | no |  |

**Extends:** —

### ProjectionPolicy
> `projection/policies.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `allowed_lanes` | `("self" | "user" | "shared" | "market")[]` | no |  |
| `allowed_types` | `("episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal")[]` | no |  |
| `filter` | `(entry: MemoryEntry) => boolean` | yes |  |
| `project_embeddings` | `boolean` | no |  |
| `redact_episodic_content` | `boolean` | no |  |
| `require_embedding_ready` | `boolean` | no |  |

**Extends:** —

### ProvenanceRecord
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `anchor_epoch_id` | `string` | yes |  |
| `content_hash` | `string` | no |  |
| `created_at` | `number` | no |  |
| `memory_id` | `string` | no |  |
| `namespace` | `string` | no |  |
| `operation` | `"create" | "update" | "supersede" | "archive" | "delete"` | no |  |
| `prev_hash` | `string` | no |  |
| `receipt_hash` | `string` | yes |  |
| `receipt_run_id` | `string` | yes |  |
| `record_id` | `string` | no |  |

**Extends:** —

### RecallRequest
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `include_archived` | `boolean` | yes |  |
| `lanes` | `("self" | "user" | "shared" | "market")[]` | yes |  |
| `limit` | `number` | yes |  |
| `min_similarity` | `number` | yes |  |
| `namespace` | `string` | yes |  |
| `query` | `string` | no |  |
| `semantic_query_embedding` | `number[]` | yes |  |
| `session_id` | `string` | yes |  |
| `types` | `("episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal")[]` | yes |  |

**Extends:** —

### RecallResponse
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `memories` | `(MemoryEntry<"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal"> & { similarity: number; score: number; })[]` | no |  |
| `query_embedding_model` | `string` | no |  |
| `total_candidates` | `number` | no |  |

**Extends:** —

### RestoreRequest
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `cid` | `string` | no |  |
| `mode` | `RestoreMode` | no |  |
| `target_namespace` | `string` | yes |  |

**Extends:** —

### RestoreResult
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `chain_head_hash` | `string` | no |  |
| `entries_imported` | `number` | no |  |
| `entries_skipped` | `number` | no |  |
| `source_agent_passport_id` | `string` | no |  |

**Extends:** —

### SemanticMemory
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `confidence` | `number` | no |  |
| `fact` | `string` | no |  |
| `source_memory_ids` | `string[]` | no |  |
| `supersedes` | `string[]` | yes |  |

**Extends:** `MemoryEntry<'semantic'>`

### TemporalMemory
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `recorded_at` | `number` | no |  |
| `source_memory_ids` | `string[]` | yes |  |
| `superseded_by` | `string` | yes |  |
| `valid_from` | `number` | no |  |
| `valid_to` | `number` | no |  |

**Extends:** `MemoryEntry<'temporal'>`

### ToolCallRecord
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `arguments` | `Record<string, unknown>` | no |  |
| `result` | `unknown` | yes |  |
| `tool_name` | `string` | no |  |

**Extends:** —

### TrustWeightedMemory
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `decay_factor` | `number` | no |  |
| `source_agent_passport_id` | `string` | no |  |
| `source_memory_ids` | `string[]` | yes |  |
| `trust_score` | `number` | no |  |
| `weighted_relevance` | `number` | no |  |

**Extends:** `MemoryEntry<'trust_weighted'>`

### ValidatedExtractionResult
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `facts` | `{ fact: string; confidence: number; source_memory_ids?: string[]; supersedes?: string[]; }[]` | no |  |
| `rules` | `{ rule: string; trigger: string; priority: number; source_memory_ids?: string[]; }[]` | no |  |
| `warnings` | `string[]` | no |  |

**Extends:** —

## Functions

### buildHashPreimage
> `commitments.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `entry` | `Record<string, unknown> & { type: MemoryType; agent_passport_id: string; namespace: string; }` | no | — |

**Returns:** `Record<string, unknown>`

**Async:** no

### classifyQueryIntent
> `recall/intentClassifier.ts`

Classification priority (highest wins):

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `query` | `string` | no | — |

**Returns:** `QueryIntent`

**Async:** no

### computeMemoryHash
> `commitments.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `entry` | `Record<string, unknown> & { type: MemoryType; agent_passport_id: string; namespace: string; }` | no | — |

**Returns:** `string`

**Async:** no

### emitMemoryEvent
> `events/memoryEvents.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `event` | `MemoryEvent` | no | — |

**Returns:** `void`

**Async:** no

### getDefaultCompactionConfig
> `types.ts`

**Returns:** `CompactionConfig`

**Async:** no

### getDefaultConfig
> `types.ts`

**Returns:** `MemoryServiceConfig`

**Async:** no

### getDefaultProjectionPolicy
> `projection/policies.ts`

**Returns:** `ProjectionPolicy`

**Async:** no

### getEmbeddingProvider
> `embedding/index.ts`

**Returns:** `IEmbeddingProvider`

**Async:** no

### getManager
> `managers/index.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `type` | `"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal"` | no | — |

**Returns:** `ValidateFn`

**Async:** no

### getMemoryEventBus
> `events/memoryEvents.ts`

**Returns:** `EventEmitter<[never]>`

**Async:** no

### getMemoryStore
> `store/index.ts`

**Returns:** `IMemoryStore`

**Async:** no

### getSQLiteStoreForAgent
> `store/index.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `agentPassportId` | `string` | no | — |

**Returns:** `IMemoryStore`

**Async:** no

### getStoreForAgent
> `store/index.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `agentPassportId` | `string` | no | — |

**Returns:** `IMemoryStore`

**Async:** no

### isEpisodicMemory
> `types.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `entry` | `MemoryEntry<"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal">` | no | — |

**Returns:** `boolean`

**Async:** no

### isMemorySystemRunning
> `boot.ts`

Check if memory system is running

**Returns:** `{ embedding: boolean; projection: boolean; }`

**Async:** no

### isProceduralMemory
> `types.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `entry` | `MemoryEntry<"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal">` | no | — |

**Returns:** `boolean`

**Async:** no

### isSemanticMemory
> `types.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `entry` | `MemoryEntry<"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal">` | no | — |

**Returns:** `boolean`

**Async:** no

### rerankCandidates
> `recall/reranker.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `candidates` | `(MemoryEntry<"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal"> & { similarity: number; })[]` | no | — |
| `query` | `string` | no | — |
| `weights` | `RerankConfig` | no | — |

**Returns:** `(MemoryEntry<"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal"> & { similarity: number; score: number; })[]`

**Async:** no

### resetMemoryEventBus
> `events/memoryEvents.ts`

**Returns:** `void`

**Async:** no

### resetMemoryStore
> `store/index.ts`

**Returns:** `void`

**Async:** no

### shouldProject
> `projection/policies.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `entry` | `MemoryEntry<"episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal">` | no | — |
| `policy` | `ProjectionPolicy` | no | — |

**Returns:** `boolean`

**Async:** no

### startMemorySystem
> `boot.ts`

Start memory background services.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `config` | `MemoryBootConfig` | yes | — |

**Returns:** `void`

**Async:** no

### stopMemorySystem
> `boot.ts`

Stop memory background services.

**Returns:** `void`

**Async:** no

### validateEntity
> `managers/entity.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `entry` | `Record<string, unknown>` | no | — |

**Returns:** `void`

**Async:** no

### validateEpisodic
> `managers/episodic.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `entry` | `Record<string, unknown>` | no | — |

**Returns:** `void`

**Async:** no

### validateExtractionResponse
> `extraction.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `raw` | `unknown` | no | — |
| `maxFacts` | `number` | yes | `20` |
| `maxRules` | `number` | yes | `10` |

**Returns:** `ValidatedExtractionResult`

**Async:** no

### validateProcedural
> `managers/procedural.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `entry` | `Record<string, unknown>` | no | — |

**Returns:** `void`

**Async:** no

### validateSemantic
> `managers/semantic.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `entry` | `Record<string, unknown>` | no | — |

**Returns:** `void`

**Async:** no

### validateTemporal
> `managers/temporal.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `entry` | `Record<string, unknown>` | no | — |

**Returns:** `void`

**Async:** no

### validateTrustWeighted
> `managers/trustWeighted.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `entry` | `Record<string, unknown>` | no | — |

**Returns:** `void`

**Async:** no

### verifyChainIntegrity
> `commitments.ts`

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `store` | `IMemoryStore` | no | — |
| `agent_passport_id` | `string` | no | — |
| `namespace` | `string` | no | — |

**Returns:** `Promise<ChainVerifyResult>`

**Async:** yes

## Types

### MemoryEventType
> `events/memoryEvents.ts`

```ts
type MemoryEventType = "memory.created" | "memory.updated" | "memory.archived" | "memory.deleted" | "memory.compacted" | "memory.snapshotted" | "memory.embedding.ready" | "session.created" | "session.closed"
```

### MemoryLane
> `types.ts`

```ts
type MemoryLane = "self" | "user" | "shared" | "market"
```

### MemoryStatus
> `types.ts`

```ts
type MemoryStatus = "active" | "superseded" | "archived" | "expired"
```

### MemoryType
> `types.ts`

```ts
type MemoryType = "episodic" | "semantic" | "procedural" | "entity" | "trust_weighted" | "temporal"
```

### PermissionLevel
> `types.ts`

```ts
type PermissionLevel = "none" | "read" | "write" | "admin"
```

### RestoreMode
> `types.ts`

```ts
type RestoreMode = "replace" | "merge" | "fork"
```

### WritableEpisodicMemory
> `types.ts`

```ts
type WritableEpisodicMemory = { session_id: string; role: "user" | "assistant" | "system" | "tool"; tokens: number; tool_calls?: ToolCallRecord[]; agent_passport_id: string; type: "episodic"; namespace: string; memory_lane: MemoryLane; content: string; structured_content?: Record<string, unknown>; metadata: Record<string, unknown>; }
```

### WritableMemoryEntry
> `types.ts`

```ts
type WritableMemoryEntry = Writable<EpisodicMemory> | Writable<SemanticMemory> | Writable<ProceduralMemory> | Writable<EntityMemory> | Writable<TrustWeightedMemory> | Writable<TemporalMemory>
```

### WritableProceduralMemory
> `types.ts`

```ts
type WritableProceduralMemory = { agent_passport_id: string; type: "procedural"; namespace: string; memory_lane: MemoryLane; content: string; structured_content?: Record<string, unknown>; metadata: Record<string, unknown>; source_memory_ids: string[]; rule: string; trigger: string; priority: number; }
```

### WritableSemanticMemory
> `types.ts`

```ts
type WritableSemanticMemory = { agent_passport_id: string; type: "semantic"; namespace: string; memory_lane: MemoryLane; content: string; structured_content?: Record<string, unknown>; metadata: Record<string, unknown>; fact: string; confidence: number; source_memory_ids: string[]; supersedes?: string[]; }
```
