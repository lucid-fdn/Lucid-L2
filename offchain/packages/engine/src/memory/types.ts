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
  last_receipted_turn_index: number;
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

export const MAX_CONTENT_SIZE = 100 * 1024;
export const MAX_METADATA_SIZE = 64 * 1024;
