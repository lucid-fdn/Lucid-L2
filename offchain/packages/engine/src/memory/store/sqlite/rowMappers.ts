import type {
  MemoryEntry, ProvenanceRecord, MemorySession,
  MemorySnapshot, OutboxEvent, MemoryLane,
} from '../../types';

// ─── Helpers ────────────────────────────────────────────────────────

function parseJSON<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try { return JSON.parse(val) as T; } catch { return fallback; }
  }
  return val as T;
}

function toJSONOrNull(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return JSON.stringify(val);
}

// ─── Memory Entry ───────────────────────────────────────────────────

/**
 * Convert a raw SQLite row into a typed MemoryEntry (including
 * type-specific sub-interface fields like session_id, fact, rule, etc.).
 */
export function rowToEntry(row: any): MemoryEntry {
  const base: MemoryEntry = {
    memory_id: row.memory_id,
    agent_passport_id: row.agent_passport_id,
    type: row.type,
    namespace: row.namespace,
    memory_lane: (row.memory_lane || 'self') as MemoryLane,
    content: row.content,
    structured_content: parseJSON<Record<string, unknown> | undefined>(row.structured_content, undefined),
    embedding_status: row.embedding_status || 'pending',
    embedding_attempts: row.embedding_attempts ?? 0,
    embedding_requested_at: row.embedding_requested_at ?? undefined,
    embedding_updated_at: row.embedding_updated_at ?? undefined,
    embedding_last_error: row.embedding_last_error ?? undefined,
    embedding_model: row.embedding_model ?? undefined,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata: parseJSON<Record<string, unknown>>(row.metadata, {}),
    content_hash: row.content_hash,
    prev_hash: row.prev_hash ?? null,
    receipt_hash: row.receipt_hash ?? undefined,
    receipt_run_id: row.receipt_run_id ?? undefined,
  };

  // Type-specific fields
  switch (row.type) {
    case 'episodic':
      Object.assign(base, {
        session_id: row.session_id,
        role: row.role,
        turn_index: row.turn_index,
        tokens: row.tokens ?? 0,
        tool_calls: parseJSON<any[] | undefined>(row.tool_calls, undefined),
      });
      break;

    case 'semantic':
      Object.assign(base, {
        fact: row.fact,
        confidence: row.confidence ?? 0,
        source_memory_ids: parseJSON<string[]>(row.source_memory_ids, []),
        supersedes: parseJSON<string[] | undefined>(row.supersedes, undefined),
      });
      break;

    case 'procedural':
      Object.assign(base, {
        rule: row.rule,
        trigger: row.trigger,
        priority: row.priority ?? 0,
        source_memory_ids: parseJSON<string[]>(row.source_memory_ids, []),
      });
      break;

    case 'entity':
      Object.assign(base, {
        entity_name: row.entity_name,
        entity_type: row.entity_type,
        entity_id: row.entity_id ?? undefined,
        attributes: parseJSON<Record<string, unknown>>(row.attributes, {}),
        relationships: parseJSON<any[]>(row.relationships, []),
        source_memory_ids: parseJSON<string[] | undefined>(row.source_memory_ids, undefined),
      });
      break;

    case 'trust_weighted':
      Object.assign(base, {
        source_agent_passport_id: row.source_agent_passport_id,
        trust_score: row.trust_score ?? 0,
        decay_factor: row.decay_factor ?? 1,
        weighted_relevance: row.weighted_relevance ?? 0,
        source_memory_ids: parseJSON<string[] | undefined>(row.source_memory_ids, undefined),
      });
      break;

    case 'temporal':
      Object.assign(base, {
        valid_from: row.valid_from,
        valid_to: row.valid_to ?? null,
        recorded_at: row.recorded_at,
        superseded_by: row.superseded_by ?? undefined,
        source_memory_ids: parseJSON<string[] | undefined>(row.source_memory_ids, undefined),
      });
      break;
  }

  return base;
}

/**
 * Convert a MemoryEntry (or writable input) into a flat row object
 * suitable for SQLite INSERT. JSON-encodes object/array columns.
 */
export function entryToRow(entry: any): Record<string, any> {
  const row: Record<string, any> = {
    memory_id: entry.memory_id,
    agent_passport_id: entry.agent_passport_id,
    type: entry.type,
    namespace: entry.namespace,
    memory_lane: entry.memory_lane || 'self',
    content: entry.content,
    structured_content: toJSONOrNull(entry.structured_content),
    embedding_status: entry.embedding_status || 'pending',
    embedding_attempts: entry.embedding_attempts ?? 0,
    embedding_requested_at: entry.embedding_requested_at ?? null,
    embedding_updated_at: entry.embedding_updated_at ?? null,
    embedding_last_error: entry.embedding_last_error ?? null,
    embedding_model: entry.embedding_model ?? null,
    status: entry.status || 'active',
    created_at: entry.created_at,
    updated_at: entry.updated_at,
    metadata: JSON.stringify(entry.metadata ?? {}),
    content_hash: entry.content_hash,
    prev_hash: entry.prev_hash ?? null,
    receipt_hash: entry.receipt_hash ?? null,
    receipt_run_id: entry.receipt_run_id ?? null,

    // Episodic
    session_id: entry.session_id ?? null,
    role: entry.role ?? null,
    turn_index: entry.turn_index ?? null,
    tokens: entry.tokens ?? null,
    tool_calls: toJSONOrNull(entry.tool_calls),

    // Semantic
    fact: entry.fact ?? null,
    confidence: entry.confidence ?? null,
    source_memory_ids: toJSONOrNull(entry.source_memory_ids),
    supersedes: toJSONOrNull(entry.supersedes),

    // Procedural — "trigger" is a reserved word in SQL
    rule: entry.rule ?? null,
    trigger: entry.trigger ?? null,
    priority: entry.priority ?? null,

    // Entity
    entity_name: entry.entity_name ?? null,
    entity_type: entry.entity_type ?? null,
    entity_id: entry.entity_id ?? null,
    attributes: toJSONOrNull(entry.attributes),
    relationships: toJSONOrNull(entry.relationships),

    // Trust-weighted
    source_agent_passport_id: entry.source_agent_passport_id ?? null,
    trust_score: entry.trust_score ?? null,
    decay_factor: entry.decay_factor ?? null,
    weighted_relevance: entry.weighted_relevance ?? null,

    // Temporal
    valid_from: entry.valid_from ?? null,
    valid_to: entry.valid_to ?? null,
    recorded_at: entry.recorded_at ?? null,
    superseded_by: entry.superseded_by ?? null,
  };

  return row;
}

// ─── Session ────────────────────────────────────────────────────────

export function rowToSession(row: any): MemorySession {
  return {
    session_id: row.session_id,
    agent_passport_id: row.agent_passport_id,
    namespace: row.namespace,
    status: row.status,
    turn_count: row.turn_count ?? 0,
    total_tokens: row.total_tokens ?? 0,
    last_receipted_turn_index: row.last_receipted_turn_index ?? -1,
    last_compacted_turn_index: row.last_compacted_turn_index ?? -1,
    summary: row.summary ?? undefined,
    created_at: row.created_at,
    last_activity: row.last_activity,
    closed_at: row.closed_at ?? undefined,
  };
}

// ─── Provenance ─────────────────────────────────────────────────────

export function rowToProvenance(row: any): ProvenanceRecord {
  return {
    record_id: row.record_id,
    agent_passport_id: row.agent_passport_id,
    namespace: row.namespace,
    memory_id: row.memory_id,
    operation: row.operation,
    content_hash: row.content_hash,
    prev_hash: row.prev_hash ?? null,
    receipt_hash: row.receipt_hash ?? undefined,
    receipt_run_id: row.receipt_run_id ?? undefined,
    anchor_epoch_id: row.anchor_epoch_id ?? undefined,
    created_at: row.created_at,
  };
}

// ─── Snapshot ───────────────────────────────────────────────────────

export function rowToSnapshot(row: any): MemorySnapshot {
  return {
    snapshot_id: row.snapshot_id,
    agent_passport_id: row.agent_passport_id,
    depin_cid: row.depin_cid,
    entry_count: row.entry_count,
    chain_head_hash: row.chain_head_hash,
    snapshot_type: row.snapshot_type,
    created_at: row.created_at,
  };
}

// ─── Outbox ─────────────────────────────────────────────────────────

export function rowToOutboxEvent(row: any): OutboxEvent {
  return {
    event_id: row.event_id,
    event_type: row.event_type,
    memory_id: row.memory_id ?? null,
    agent_passport_id: row.agent_passport_id,
    namespace: row.namespace,
    payload_json: row.payload_json,
    created_at: row.created_at,
    processed_at: row.processed_at ?? null,
    retry_count: row.retry_count ?? 0,
    last_error: row.last_error ?? null,
  };
}
