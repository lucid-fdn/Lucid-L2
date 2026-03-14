// ─── Constants ──────────────────────────────────────────────────────
export const MEMORY_TYPES = [
  'episodic', 'semantic', 'procedural',
  'entity', 'trust_weighted', 'temporal',
] as const;

export const MEMORY_STATUSES = ['active', 'superseded', 'archived', 'expired'] as const;
export const MEMORY_LANES = ['self', 'user', 'shared', 'market'] as const;
export type MemoryLane = (typeof MEMORY_LANES)[number];

// ─── Base ───────────────────────────────────────────────────────────
export type MemoryType = (typeof MEMORY_TYPES)[number];
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export interface MemoryEntry<T extends MemoryType = MemoryType> {
  memory_id: string;
  agent_passport_id: string;
  type: T;
  namespace: string;
  memory_lane: MemoryLane;
  content: string;
  structured_content?: Record<string, unknown>;
  embedding?: number[];
  embedding_model?: string;
  embedding_status: 'pending' | 'ready' | 'failed' | 'skipped';
  embedding_attempts: number;
  embedding_requested_at?: number;
  embedding_updated_at?: number;
  embedding_last_error?: string;
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
  entity_id?: string;
  attributes: Record<string, unknown>;
  relationships: EntityRelation[];
  source_memory_ids?: string[];
}

// ─── Trust-Weighted (STAGED) ────────────────────────────────────────
export interface TrustWeightedMemory extends MemoryEntry<'trust_weighted'> {
  source_agent_passport_id: string;
  trust_score: number;
  decay_factor: number;
  weighted_relevance: number;
  source_memory_ids?: string[];
}

// ─── Temporal (STAGED) ─────────────────────────────────────────────
export interface TemporalMemory extends MemoryEntry<'temporal'> {
  valid_from: number;
  valid_to: number | null;
  recorded_at: number;
  superseded_by?: string;
  source_memory_ids?: string[];
}

// ─── Provenance ─────────────────────────────────────────────────────
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

// ─── Session ────────────────────────────────────────────────────────
export interface MemorySession {
  session_id: string;
  agent_passport_id: string;
  namespace: string;
  status: 'active' | 'closed' | 'archived';
  turn_count: number;
  total_tokens: number;
  last_receipted_turn_index: number;
  last_compacted_turn_index: number;
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
  'embedding' | 'embedding_model' | 'turn_index' |
  'embedding_status' | 'embedding_attempts' |
  'embedding_requested_at' | 'embedding_updated_at' | 'embedding_last_error'
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
  semantic_query_embedding?: number[];
  lanes?: MemoryLane[];
}

export interface RecallResponse {
  memories: (MemoryEntry & { similarity: number; score: number })[];
  query_embedding_model: string | null;
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
  max_memory_entries: number;
  max_memory_db_size_mb: number;
  max_vector_rows: number;
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
    max_memory_entries: parseInt(process.env.MEMORY_MAX_ENTRIES || '100000', 10),
    max_memory_db_size_mb: parseInt(process.env.MEMORY_MAX_DB_SIZE_MB || '500', 10),
    max_vector_rows: parseInt(process.env.MEMORY_MAX_VECTOR_ROWS || '50000', 10),
  };
}

// ─── Compaction ─────────────────────────────────────────────────────
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

export interface CompactionResult {
  sessions_compacted: number;
  episodic_archived: number;
  extraction_triggered: boolean;
  cold_pruned: number;
  snapshot_cid: string | null;
}

// ─── Extraction Output ───────────────────────────────────────────────
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

// ─── Outbox ─────────────────────────────────────────────────────────
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

// ─── Store Capabilities ────────────────────────────────────────────
export interface MemoryStoreCapabilities {
  persistent: boolean;
  vectorSearch: boolean;
  crossAgentQuery: boolean;
  transactions: boolean;
  localFirst: boolean;
}

// ─── Store Health ──────────────────────────────────────────────────
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

export const MAX_CONTENT_SIZE = 100 * 1024;
export const MAX_METADATA_SIZE = 64 * 1024;
