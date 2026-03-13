import crypto from 'crypto';
import { pool, getClient } from '../../db/pool';
import type { PoolClient } from 'pg';
import type {
  MemoryEntry, MemoryType, MemoryStatus, WritableMemoryEntry,
  ProvenanceRecord, MemorySession, MemorySnapshot, MemoryLane,
} from '../types';
import { MEMORY_TYPES, MEMORY_STATUSES } from '../types';
import type { IMemoryStore, MemoryQuery, MemoryWriteResult, MemoryStats } from './interface';
import { logger } from '../../lib/logger';

// ─── Helpers ──────────────────────────────────────────────────────────

/** Convert PostgreSQL timestamptz to Unix ms. */
function tsToMs(ts: Date | string | null): number {
  if (!ts) return 0;
  return new Date(ts).getTime();
}

/** Convert Unix ms to ISO string for Postgres. */
function msToTs(ms: number): string {
  return new Date(ms).toISOString();
}

const MAX_SERIALIZATION_RETRIES = 3;

// ─── Row → Domain mappers ─────────────────────────────────────────────

function rowToMemoryEntry(row: any): MemoryEntry {
  const base: any = {
    memory_id: row.memory_id,
    agent_passport_id: row.agent_passport_id,
    type: row.type,
    namespace: row.namespace,
    content: row.content,
    status: row.status,
    created_at: tsToMs(row.created_at),
    updated_at: tsToMs(row.updated_at),
    metadata: row.metadata ?? {},
    content_hash: row.content_hash,
    prev_hash: row.prev_hash ?? null,
  };

  if (row.memory_lane) base.memory_lane = row.memory_lane;
  else base.memory_lane = 'self';

  if (row.structured_content) base.structured_content = row.structured_content;
  if (row.embedding) base.embedding = row.embedding;
  if (row.embedding_model) base.embedding_model = row.embedding_model;
  if (row.receipt_hash) base.receipt_hash = row.receipt_hash;
  if (row.receipt_run_id) base.receipt_run_id = row.receipt_run_id;

  // Type-specific fields
  switch (row.type as MemoryType) {
    case 'episodic':
      base.session_id = row.session_id;
      base.role = row.role;
      base.turn_index = row.turn_index;
      base.tokens = row.tokens;
      if (row.tool_calls) base.tool_calls = row.tool_calls;
      break;
    case 'semantic':
      base.fact = row.fact;
      base.confidence = row.confidence;
      base.source_memory_ids = row.source_memory_ids ?? [];
      if (row.supersedes) base.supersedes = row.supersedes;
      break;
    case 'procedural':
      base.rule = row.rule;
      base.trigger = row.trigger;
      base.priority = row.priority ?? 0;
      base.source_memory_ids = row.source_memory_ids ?? [];
      break;
    case 'entity':
      base.entity_name = row.entity_name;
      base.entity_type = row.entity_type;
      base.attributes = row.attributes ?? {};
      base.relationships = row.relationships ?? [];
      break;
    case 'trust_weighted':
      base.source_agent_passport_id = row.source_agent_passport_id;
      base.trust_score = row.trust_score;
      base.decay_factor = row.decay_factor;
      base.weighted_relevance = row.weighted_relevance;
      break;
    case 'temporal':
      base.valid_from = tsToMs(row.valid_from);
      base.valid_to = row.valid_to ? tsToMs(row.valid_to) : null;
      base.recorded_at = tsToMs(row.recorded_at);
      if (row.superseded_by) base.superseded_by = row.superseded_by;
      break;
  }

  return base as MemoryEntry;
}

function rowToProvenance(row: any): ProvenanceRecord {
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
    created_at: tsToMs(row.created_at),
  };
}

function rowToSession(row: any): MemorySession {
  return {
    session_id: row.session_id,
    agent_passport_id: row.agent_passport_id,
    namespace: row.namespace,
    status: row.status,
    turn_count: row.turn_count,
    total_tokens: row.total_tokens,
    last_receipted_turn_index: row.last_receipted_turn_index ?? -1,
    last_compacted_turn_index: row.last_compacted_turn_index ?? -1,
    summary: row.summary ?? undefined,
    created_at: tsToMs(row.created_at),
    last_activity: tsToMs(row.last_activity),
    closed_at: row.closed_at ? tsToMs(row.closed_at) : undefined,
  };
}

function rowToSnapshot(row: any): MemorySnapshot {
  return {
    snapshot_id: row.snapshot_id,
    agent_passport_id: row.agent_passport_id,
    depin_cid: row.depin_cid,
    entry_count: row.entry_count,
    chain_head_hash: row.chain_head_hash,
    snapshot_type: row.snapshot_type,
    created_at: tsToMs(row.created_at),
  };
}

// ─── PostgresMemoryStore ──────────────────────────────────────────────

export class PostgresMemoryStore implements IMemoryStore {

  // ─── Write ──────────────────────────────────────────────────────

  async write(
    entry: WritableMemoryEntry & { content_hash: string; prev_hash: string | null },
  ): Promise<MemoryWriteResult> {
    return this.withSerializableTransaction(async (client) => {
      return this.writeWithClient(client, entry);
    });
  }

  private async writeWithClient(
    client: PoolClient,
    entry: WritableMemoryEntry & { content_hash: string; prev_hash: string | null },
  ): Promise<MemoryWriteResult> {
    const e = entry as any;
    const result = await client.query(
      `INSERT INTO memory_entries (
        agent_passport_id, type, namespace, content, structured_content,
        metadata, content_hash, prev_hash,
        session_id, role, turn_index, tokens, tool_calls,
        source_memory_ids, fact, confidence, supersedes,
        rule, trigger, priority,
        entity_name, entity_type, attributes, relationships,
        source_agent_passport_id, trust_score, decay_factor, weighted_relevance,
        valid_from, valid_to, recorded_at, superseded_by,
        memory_lane
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20,
        $21, $22, $23, $24,
        $25, $26, $27, $28,
        $29, $30, $31, $32,
        $33
      ) RETURNING memory_id`,
      [
        e.agent_passport_id, e.type, e.namespace, e.content,
        e.structured_content ? JSON.stringify(e.structured_content) : null,
        JSON.stringify(e.metadata ?? {}), e.content_hash, e.prev_hash,
        // Episodic
        e.session_id ?? null, e.role ?? null, e.turn_index ?? null,
        e.tokens ?? null, e.tool_calls ? JSON.stringify(e.tool_calls) : null,
        // Shared
        e.source_memory_ids ?? null,
        // Semantic
        e.fact ?? null, e.confidence ?? null, e.supersedes ?? null,
        // Procedural
        e.rule ?? null, e.trigger ?? null, e.priority ?? null,
        // Entity
        e.entity_name ?? null, e.entity_type ?? null,
        e.attributes ? JSON.stringify(e.attributes) : null,
        e.relationships ? JSON.stringify(e.relationships) : null,
        // Trust-weighted
        e.source_agent_passport_id ?? null, e.trust_score ?? null,
        e.decay_factor ?? null, e.weighted_relevance ?? null,
        // Temporal
        e.valid_from ? msToTs(e.valid_from) : null,
        e.valid_to ? msToTs(e.valid_to) : null,
        e.recorded_at ? msToTs(e.recorded_at) : null,
        e.superseded_by ?? null,
        // Memory lane
        e.memory_lane ?? 'self',
      ],
    );

    return {
      memory_id: result.rows[0].memory_id,
      content_hash: e.content_hash,
      prev_hash: e.prev_hash,
    };
  }

  async writeBatch(
    entries: (WritableMemoryEntry & { content_hash: string; prev_hash: string | null })[],
  ): Promise<MemoryWriteResult[]> {
    return this.withSerializableTransaction(async (client) => {
      const results: MemoryWriteResult[] = [];
      for (const entry of entries) {
        results.push(await this.writeWithClient(client, entry));
      }
      return results;
    });
  }

  // ─── Read ───────────────────────────────────────────────────────

  async read(memory_id: string): Promise<MemoryEntry | null> {
    const result = await pool.query(
      'SELECT * FROM memory_entries WHERE memory_id = $1',
      [memory_id],
    );
    if (result.rows.length === 0) return null;
    return rowToMemoryEntry(result.rows[0]);
  }

  async query(q: MemoryQuery): Promise<MemoryEntry[]> {
    const { sql, params } = this.buildQuerySQL(q);
    const result = await pool.query(sql, params);
    return result.rows.map(rowToMemoryEntry);
  }

  async count(q: Omit<MemoryQuery, 'limit' | 'offset'>): Promise<number> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    conditions.push(`agent_passport_id = $${idx++}`);
    params.push(q.agent_passport_id);

    if (q.namespace) {
      conditions.push(`namespace = $${idx++}`);
      params.push(q.namespace);
    }
    if (q.types && q.types.length > 0) {
      conditions.push(`type = ANY($${idx++})`);
      params.push(q.types);
    }
    const statusFilter = q.status ?? ['active'];
    conditions.push(`status = ANY($${idx++})`);
    params.push(statusFilter);

    if (q.session_id) {
      conditions.push(`session_id = $${idx++}`);
      params.push(q.session_id);
    }
    if (q.content_hash) {
      conditions.push(`content_hash = $${idx++}`);
      params.push(q.content_hash);
    }
    if (q.since) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(msToTs(q.since));
    }
    if (q.before) {
      conditions.push(`created_at < $${idx++}`);
      params.push(msToTs(q.before));
    }

    const sql = `SELECT COUNT(*)::int AS cnt FROM memory_entries WHERE ${conditions.join(' AND ')}`;
    const result = await pool.query(sql, params);
    return result.rows[0].cnt;
  }

  // ─── Status transitions ─────────────────────────────────────────

  async supersede(memory_id: string, _superseded_by: string): Promise<void> {
    await pool.query(
      "UPDATE memory_entries SET status = 'superseded' WHERE memory_id = $1",
      [memory_id],
    );
  }

  async archive(memory_id: string): Promise<void> {
    await pool.query(
      "UPDATE memory_entries SET status = 'archived' WHERE memory_id = $1",
      [memory_id],
    );
  }

  async archiveBatch(memory_ids: string[]): Promise<void> {
    if (memory_ids.length === 0) return;
    await pool.query(
      "UPDATE memory_entries SET status = 'archived' WHERE memory_id = ANY($1)",
      [memory_ids],
    );
  }

  async softDelete(memory_id: string): Promise<void> {
    await pool.query(
      "UPDATE memory_entries SET status = 'archived' WHERE memory_id = $1",
      [memory_id],
    );
  }

  // ─── Provenance ─────────────────────────────────────────────────

  async writeProvenance(record: Omit<ProvenanceRecord, 'record_id'>): Promise<string> {
    const result = await pool.query(
      `INSERT INTO memory_provenance (
        agent_passport_id, namespace, memory_id, operation,
        content_hash, prev_hash, receipt_hash, receipt_run_id, anchor_epoch_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING record_id`,
      [
        record.agent_passport_id, record.namespace, record.memory_id,
        record.operation, record.content_hash, record.prev_hash ?? null,
        record.receipt_hash ?? null, record.receipt_run_id ?? null,
        record.anchor_epoch_id ?? null,
      ],
    );
    return result.rows[0].record_id;
  }

  async getProvenanceChain(
    agent_passport_id: string,
    namespace: string,
    limit?: number,
  ): Promise<ProvenanceRecord[]> {
    const sql = limit
      ? 'SELECT * FROM memory_provenance WHERE agent_passport_id = $1 AND namespace = $2 ORDER BY created_at DESC LIMIT $3'
      : 'SELECT * FROM memory_provenance WHERE agent_passport_id = $1 AND namespace = $2 ORDER BY created_at DESC';
    const params = limit
      ? [agent_passport_id, namespace, limit]
      : [agent_passport_id, namespace];
    const result = await pool.query(sql, params);
    return result.rows.map(rowToProvenance);
  }

  async getProvenanceForMemory(memory_id: string): Promise<ProvenanceRecord[]> {
    const result = await pool.query(
      'SELECT * FROM memory_provenance WHERE memory_id = $1 ORDER BY created_at DESC',
      [memory_id],
    );
    return result.rows.map(rowToProvenance);
  }

  // ─── Hash chain ─────────────────────────────────────────────────

  async getLatestHash(agent_passport_id: string, namespace: string): Promise<string | null> {
    const result = await pool.query(
      `SELECT content_hash FROM memory_entries
       WHERE agent_passport_id = $1 AND namespace = $2
       ORDER BY created_at DESC, memory_id DESC
       LIMIT 1`,
      [agent_passport_id, namespace],
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].content_hash;
  }

  // ─── Sessions ───────────────────────────────────────────────────

  async createSession(
    session: Omit<MemorySession, 'turn_count' | 'total_tokens' | 'created_at' | 'last_activity' | 'last_compacted_turn_index' | 'last_receipted_turn_index'>,
  ): Promise<string> {
    await pool.query(
      `INSERT INTO memory_sessions (
        session_id, agent_passport_id, namespace, status,
        last_receipted_turn_index, last_compacted_turn_index
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [session.session_id, session.agent_passport_id, session.namespace, session.status, -1, -1],
    );
    return session.session_id;
  }

  async getSession(session_id: string): Promise<MemorySession | null> {
    const result = await pool.query(
      'SELECT * FROM memory_sessions WHERE session_id = $1',
      [session_id],
    );
    if (result.rows.length === 0) return null;
    return rowToSession(result.rows[0]);
  }

  async updateSessionStats(
    session_id: string,
    turn_delta: number,
    token_delta: number,
  ): Promise<void> {
    await pool.query(
      `UPDATE memory_sessions
       SET turn_count = turn_count + $2,
           total_tokens = total_tokens + $3,
           last_activity = now()
       WHERE session_id = $1`,
      [session_id, turn_delta, token_delta],
    );
  }

  async closeSession(session_id: string, summary?: string): Promise<void> {
    if (summary !== undefined) {
      await pool.query(
        `UPDATE memory_sessions
         SET status = 'closed', closed_at = now(), summary = $2
         WHERE session_id = $1`,
        [session_id, summary],
      );
    } else {
      await pool.query(
        "UPDATE memory_sessions SET status = 'closed', closed_at = now() WHERE session_id = $1",
        [session_id],
      );
    }
  }

  async listSessions(
    agent_passport_id: string,
    status?: MemorySession['status'][],
  ): Promise<MemorySession[]> {
    let sql = 'SELECT * FROM memory_sessions WHERE agent_passport_id = $1';
    const params: any[] = [agent_passport_id];

    if (status && status.length > 0) {
      sql += ' AND status = ANY($2)';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';
    const result = await pool.query(sql, params);
    return result.rows.map(rowToSession);
  }

  // ─── Embeddings ─────────────────────────────────────────────────

  async updateEmbedding(memory_id: string, embedding: number[], model: string): Promise<void> {
    // pgvector expects array format: '[0.1, 0.2, ...]'
    const vecStr = `[${embedding.join(',')}]`;
    await pool.query(
      'UPDATE memory_entries SET embedding = $2, embedding_model = $3 WHERE memory_id = $1',
      [memory_id, vecStr, model],
    );
  }

  // ─── Snapshots ──────────────────────────────────────────────────

  async saveSnapshot(snapshot: Omit<MemorySnapshot, 'snapshot_id'>): Promise<string> {
    const result = await pool.query(
      `INSERT INTO memory_snapshots (
        agent_passport_id, depin_cid, entry_count, chain_head_hash, snapshot_type
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING snapshot_id`,
      [
        snapshot.agent_passport_id, snapshot.depin_cid,
        snapshot.entry_count, snapshot.chain_head_hash, snapshot.snapshot_type,
      ],
    );
    return result.rows[0].snapshot_id;
  }

  async getLatestSnapshot(agent_passport_id: string): Promise<MemorySnapshot | null> {
    const result = await pool.query(
      'SELECT * FROM memory_snapshots WHERE agent_passport_id = $1 ORDER BY created_at DESC LIMIT 1',
      [agent_passport_id],
    );
    if (result.rows.length === 0) return null;
    return rowToSnapshot(result.rows[0]);
  }

  async listSnapshots(agent_passport_id: string): Promise<MemorySnapshot[]> {
    const result = await pool.query(
      'SELECT * FROM memory_snapshots WHERE agent_passport_id = $1 ORDER BY created_at DESC',
      [agent_passport_id],
    );
    return result.rows.map(rowToSnapshot);
  }

  // ─── Utilities ──────────────────────────────────────────────────

  async getEntriesSince(agent_passport_id: string, since: number): Promise<MemoryEntry[]> {
    const result = await pool.query(
      `SELECT * FROM memory_entries
       WHERE agent_passport_id = $1 AND created_at >= $2
       ORDER BY created_at ASC, memory_id ASC`,
      [agent_passport_id, msToTs(since)],
    );
    return result.rows.map(rowToMemoryEntry);
  }

  async getStats(agent_passport_id: string): Promise<MemoryStats> {
    const countResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         type,
         status,
         MIN(created_at) AS oldest,
         MAX(created_at) AS newest
       FROM memory_entries
       WHERE agent_passport_id = $1
       GROUP BY type, status`,
      [agent_passport_id],
    );

    const by_type = {} as Record<MemoryType, number>;
    for (const t of MEMORY_TYPES) by_type[t] = 0;

    const by_status = {} as Record<MemoryStatus, number>;
    for (const s of MEMORY_STATUSES) by_status[s] = 0;

    let total = 0;
    let oldest = Infinity;
    let newest = 0;

    for (const row of countResult.rows) {
      by_type[row.type as MemoryType] = (by_type[row.type as MemoryType] || 0) + row.total;
      by_status[row.status as MemoryStatus] = (by_status[row.status as MemoryStatus] || 0) + row.total;
      total += row.total;

      const rowOldest = tsToMs(row.oldest);
      const rowNewest = tsToMs(row.newest);
      if (rowOldest < oldest) oldest = rowOldest;
      if (rowNewest > newest) newest = rowNewest;
    }

    // Get the latest hash — most recent entry across all namespaces
    const hashResult = await pool.query(
      `SELECT content_hash FROM memory_entries
       WHERE agent_passport_id = $1
       ORDER BY created_at DESC, memory_id DESC
       LIMIT 1`,
      [agent_passport_id],
    );

    return {
      total_entries: total,
      by_type,
      by_status,
      oldest_entry: total > 0 ? oldest : 0,
      newest_entry: total > 0 ? newest : 0,
      chain_length: total,
      latest_hash: hashResult.rows.length > 0 ? hashResult.rows[0].content_hash : null,
    };
  }

  // ─── Nearest by embedding ───────────────────────────────────────

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

  // ─── Delete batch ────────────────────────────────────────────────

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

  // ─── Compaction watermark ────────────────────────────────────────

  async updateCompactionWatermark(session_id: string, turn_index: number): Promise<void> {
    await pool.query(
      'UPDATE memory_sessions SET last_compacted_turn_index = $2 WHERE session_id = $1',
      [session_id, turn_index],
    );
  }

  // ─── Private helpers ────────────────────────────────────────────

  private buildQuerySQL(q: MemoryQuery): { sql: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    conditions.push(`agent_passport_id = $${idx++}`);
    params.push(q.agent_passport_id);

    if (q.namespace) {
      conditions.push(`namespace = $${idx++}`);
      params.push(q.namespace);
    }
    if (q.types && q.types.length > 0) {
      conditions.push(`type = ANY($${idx++})`);
      params.push(q.types);
    }

    const statusFilter = q.status ?? ['active'];
    conditions.push(`status = ANY($${idx++})`);
    params.push(statusFilter);

    if (q.memory_lane && q.memory_lane.length > 0) {
      conditions.push(`memory_lane = ANY($${idx++})`);
      params.push(q.memory_lane);
    }

    if (q.session_id) {
      conditions.push(`session_id = $${idx++}`);
      params.push(q.session_id);
    }
    if (q.content_hash) {
      conditions.push(`content_hash = $${idx++}`);
      params.push(q.content_hash);
    }
    if (q.since) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(msToTs(q.since));
    }
    if (q.before) {
      conditions.push(`created_at < $${idx++}`);
      params.push(msToTs(q.before));
    }

    // Order
    let orderCol = 'created_at';
    if (q.order_by === 'updated_at') orderCol = 'updated_at';
    else if (q.order_by === 'turn_index') orderCol = 'turn_index';
    const orderDir = q.order_dir === 'desc' ? 'DESC' : 'ASC';

    // Secondary sort for deterministic ordering
    const secondarySort = orderCol === 'turn_index' ? '' : `, memory_id ${orderDir}`;

    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;

    const sql = `SELECT * FROM memory_entries
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderCol} ${orderDir}${secondarySort}
      LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    return { sql, params };
  }

  /**
   * Wraps operations in a SERIALIZABLE transaction with retry on serialization failure.
   * This ensures hash chain integrity under concurrent writes.
   */
  private async withSerializableTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
      const client = await getClient();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        // PostgreSQL serialization failure code: 40001
        if (err.code === '40001' && attempt < MAX_SERIALIZATION_RETRIES) {
          logger.warn(`Serialization failure on attempt ${attempt}/${MAX_SERIALIZATION_RETRIES}, retrying...`);
          continue;
        }
        throw err;
      } finally {
        client.release();
      }
    }
    throw new Error('Exhausted serialization retries');
  }
}
