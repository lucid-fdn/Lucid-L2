import Database from 'better-sqlite3';
import crypto from 'crypto';
import type {
  MemoryEntry, MemoryType, MemoryStatus, WritableMemoryEntry,
  ProvenanceRecord, MemorySession, MemorySnapshot, MemoryLane,
  MemoryStoreCapabilities, MemoryStoreHealth, OutboxEvent,
} from '../../types';
import { MEMORY_TYPES, MEMORY_STATUSES } from '../../types';
import type { IMemoryStore, MemoryQuery, MemoryWriteResult, MemoryStats } from '../interface';
import { openMemoryDB, type SQLiteDBOptions } from './db';
import { initSchema, migrateIfNeeded, CURRENT_SCHEMA_VERSION } from './schema';
import { rowToEntry, entryToRow, rowToSession, rowToProvenance, rowToSnapshot, rowToOutboxEvent } from './rowMappers';
import { buildQuerySQL, buildCountSQL } from './queries';

// ─── Column list for INSERT ────────────────────────────────────────────
// "trigger" is a reserved word in SQL and must always be quoted.

const ENTRY_COLUMNS = [
  'memory_id', 'agent_passport_id', 'type', 'namespace', 'memory_lane',
  'content', 'structured_content',
  'embedding_status', 'embedding_attempts', 'embedding_requested_at',
  'embedding_updated_at', 'embedding_last_error', 'embedding_model',
  'status', 'created_at', 'updated_at',
  'metadata', 'content_hash', 'prev_hash', 'receipt_hash', 'receipt_run_id',
  'session_id', 'role', 'turn_index', 'tokens', 'tool_calls',
  'fact', 'confidence', 'source_memory_ids', 'supersedes',
  'rule', '"trigger"', 'priority',
  'entity_name', 'entity_type', 'entity_id', 'attributes', 'relationships',
  'source_agent_passport_id', 'trust_score', 'decay_factor', 'weighted_relevance',
  'valid_from', 'valid_to', 'recorded_at', 'superseded_by',
] as const;

// Matching param names (without quotes) for extracting values from entryToRow()
const ENTRY_PARAM_KEYS = [
  'memory_id', 'agent_passport_id', 'type', 'namespace', 'memory_lane',
  'content', 'structured_content',
  'embedding_status', 'embedding_attempts', 'embedding_requested_at',
  'embedding_updated_at', 'embedding_last_error', 'embedding_model',
  'status', 'created_at', 'updated_at',
  'metadata', 'content_hash', 'prev_hash', 'receipt_hash', 'receipt_run_id',
  'session_id', 'role', 'turn_index', 'tokens', 'tool_calls',
  'fact', 'confidence', 'source_memory_ids', 'supersedes',
  'rule', 'trigger', 'priority',
  'entity_name', 'entity_type', 'entity_id', 'attributes', 'relationships',
  'source_agent_passport_id', 'trust_score', 'decay_factor', 'weighted_relevance',
  'valid_from', 'valid_to', 'recorded_at', 'superseded_by',
] as const;

const ENTRY_PLACEHOLDERS = ENTRY_COLUMNS.map(() => '?').join(', ');
const ENTRY_COLUMNS_SQL = ENTRY_COLUMNS.join(', ');

// ─── SQLiteMemoryStore ──────────────────────────────────────────────────

export interface SQLiteMemoryStoreOptions extends SQLiteDBOptions {
  maxEntries?: number;
  maxDbSizeMb?: number;
  maxVectorRows?: number;
}

export class SQLiteMemoryStore implements IMemoryStore {
  private db: Database.Database;
  private dbPath: string;
  private options?: SQLiteMemoryStoreOptions;

  readonly capabilities: MemoryStoreCapabilities = {
    persistent: true,
    vectorSearch: true,
    crossAgentQuery: false,
    transactions: true,
    localFirst: true,
  };

  constructor(dbPath: string, options?: SQLiteMemoryStoreOptions) {
    this.dbPath = dbPath;
    this.db = openMemoryDB(dbPath, options);
    initSchema(this.db, options?.dimensions);
    migrateIfNeeded(this.db);
    this.options = options;
  }

  // ─── Write ──────────────────────────────────────────────────────────

  async write(
    entry: WritableMemoryEntry & { content_hash: string; prev_hash: string | null },
  ): Promise<MemoryWriteResult> {
    const memory_id = crypto.randomUUID();
    const now = Date.now();

    const full = {
      ...entry,
      memory_id,
      status: 'active' as const,
      embedding_status: (entry as any).embedding_status || 'pending',
      embedding_attempts: (entry as any).embedding_attempts || 0,
      embedding_requested_at: now,
      created_at: now,
      updated_at: now,
      memory_lane: (entry as any).memory_lane || 'self',
    };

    const row = entryToRow(full);
    const values = ENTRY_PARAM_KEYS.map(k => row[k]);

    this.db.prepare(
      `INSERT INTO memory_entries (${ENTRY_COLUMNS_SQL}) VALUES (${ENTRY_PLACEHOLDERS})`,
    ).run(...values);

    // If entry has an embedding, insert into memory_vectors
    if ((entry as any).embedding && Array.isArray((entry as any).embedding)) {
      const embedding = (entry as any).embedding as number[];
      this.db.prepare(
        'INSERT INTO memory_vectors (memory_id, embedding) VALUES (?, ?)',
      ).run(memory_id, new Float32Array(embedding));
    }

    return {
      memory_id,
      content_hash: entry.content_hash,
      prev_hash: entry.prev_hash,
    };
  }

  async writeBatch(
    entries: (WritableMemoryEntry & { content_hash: string; prev_hash: string | null })[],
  ): Promise<MemoryWriteResult[]> {
    const results: MemoryWriteResult[] = [];
    const txn = this.db.transaction(() => {
      for (const entry of entries) {
        // Inline write logic to stay within the synchronous transaction
        const memory_id = crypto.randomUUID();
        const now = Date.now();

        const full = {
          ...entry,
          memory_id,
          status: 'active' as const,
          embedding_status: (entry as any).embedding_status || 'pending',
          embedding_attempts: (entry as any).embedding_attempts || 0,
          embedding_requested_at: now,
          created_at: now,
          updated_at: now,
          memory_lane: (entry as any).memory_lane || 'self',
        };

        const row = entryToRow(full);
        const values = ENTRY_PARAM_KEYS.map(k => row[k]);

        this.db.prepare(
          `INSERT INTO memory_entries (${ENTRY_COLUMNS_SQL}) VALUES (${ENTRY_PLACEHOLDERS})`,
        ).run(...values);

        if ((entry as any).embedding && Array.isArray((entry as any).embedding)) {
          const embedding = (entry as any).embedding as number[];
          this.db.prepare(
            'INSERT INTO memory_vectors (memory_id, embedding) VALUES (?, ?)',
          ).run(memory_id, new Float32Array(embedding));
        }

        results.push({
          memory_id,
          content_hash: entry.content_hash,
          prev_hash: entry.prev_hash,
        });
      }
    });
    txn();
    return results;
  }

  // ─── Read ───────────────────────────────────────────────────────────

  async read(memory_id: string): Promise<MemoryEntry | null> {
    const row = this.db.prepare(
      'SELECT * FROM memory_entries WHERE memory_id = ?',
    ).get(memory_id) as any;
    if (!row) return null;
    return rowToEntry(row);
  }

  async query(q: MemoryQuery): Promise<MemoryEntry[]> {
    const { sql, params } = buildQuerySQL(q);
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(rowToEntry);
  }

  async count(q: Omit<MemoryQuery, 'limit' | 'offset'>): Promise<number> {
    const { sql, params } = buildCountSQL(q);
    const row = this.db.prepare(sql).get(...params) as any;
    return row?.cnt ?? 0;
  }

  // ─── Status transitions ─────────────────────────────────────────────

  async supersede(memory_id: string, superseded_by: string): Promise<void> {
    const now = Date.now();
    const result = this.db.prepare(
      `UPDATE memory_entries SET status = 'superseded', superseded_by = ?, updated_at = ? WHERE memory_id = ?`,
    ).run(superseded_by, now, memory_id);
    if (result.changes === 0) throw new Error(`Memory entry not found: ${memory_id}`);
  }

  async archive(memory_id: string): Promise<void> {
    const now = Date.now();
    const result = this.db.prepare(
      `UPDATE memory_entries SET status = 'archived', updated_at = ? WHERE memory_id = ?`,
    ).run(now, memory_id);
    if (result.changes === 0) throw new Error(`Memory entry not found: ${memory_id}`);
  }

  async archiveBatch(memory_ids: string[]): Promise<void> {
    if (memory_ids.length === 0) return;
    const now = Date.now();
    const txn = this.db.transaction(() => {
      const stmt = this.db.prepare(
        `UPDATE memory_entries SET status = 'archived', updated_at = ? WHERE memory_id = ?`,
      );
      for (const id of memory_ids) {
        const result = stmt.run(now, id);
        if (result.changes === 0) throw new Error(`Memory entry not found: ${id}`);
      }
    });
    txn();
  }

  async softDelete(memory_id: string): Promise<void> {
    const now = Date.now();
    const result = this.db.prepare(
      `UPDATE memory_entries SET status = 'archived', updated_at = ? WHERE memory_id = ?`,
    ).run(now, memory_id);
    if (result.changes === 0) throw new Error(`Memory entry not found: ${memory_id}`);
  }

  // ─── Provenance ─────────────────────────────────────────────────────

  async writeProvenance(record: Omit<ProvenanceRecord, 'record_id'>): Promise<string> {
    const record_id = crypto.randomUUID();
    this.db.prepare(
      `INSERT INTO memory_provenance (
        record_id, agent_passport_id, namespace, memory_id, operation,
        content_hash, prev_hash, receipt_hash, receipt_run_id, anchor_epoch_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      record_id,
      record.agent_passport_id,
      record.namespace,
      record.memory_id,
      record.operation,
      record.content_hash,
      record.prev_hash ?? null,
      record.receipt_hash ?? null,
      record.receipt_run_id ?? null,
      record.anchor_epoch_id ?? null,
      record.created_at,
    );
    return record_id;
  }

  async getProvenanceChain(
    agent_passport_id: string,
    namespace: string,
    limit?: number,
  ): Promise<ProvenanceRecord[]> {
    const sql = limit
      ? 'SELECT * FROM memory_provenance WHERE agent_passport_id = ? AND namespace = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM memory_provenance WHERE agent_passport_id = ? AND namespace = ? ORDER BY created_at DESC';
    const params = limit
      ? [agent_passport_id, namespace, limit]
      : [agent_passport_id, namespace];
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(rowToProvenance);
  }

  async getProvenanceForMemory(memory_id: string): Promise<ProvenanceRecord[]> {
    const rows = this.db.prepare(
      'SELECT * FROM memory_provenance WHERE memory_id = ? ORDER BY created_at DESC',
    ).all(memory_id) as any[];
    return rows.map(rowToProvenance);
  }

  // ─── Hash chain ─────────────────────────────────────────────────────

  async getLatestHash(agent_passport_id: string, namespace: string): Promise<string | null> {
    const row = this.db.prepare(
      `SELECT content_hash FROM memory_entries
       WHERE agent_passport_id = ? AND namespace = ?
       ORDER BY created_at DESC, memory_id DESC
       LIMIT 1`,
    ).get(agent_passport_id, namespace) as any;
    return row?.content_hash ?? null;
  }

  // ─── Sessions ───────────────────────────────────────────────────────

  async createSession(
    session: Omit<MemorySession, 'turn_count' | 'total_tokens' | 'created_at' | 'last_activity' | 'last_compacted_turn_index' | 'last_receipted_turn_index'>,
  ): Promise<string> {
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO memory_sessions (
        session_id, agent_passport_id, namespace, status,
        turn_count, total_tokens,
        last_receipted_turn_index, last_compacted_turn_index,
        summary, created_at, last_activity, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      session.session_id,
      session.agent_passport_id,
      session.namespace,
      session.status,
      0, // turn_count
      0, // total_tokens
      -1, // last_receipted_turn_index
      -1, // last_compacted_turn_index
      session.summary ?? null,
      now,
      now,
      null, // closed_at
    );
    return session.session_id;
  }

  async getSession(session_id: string): Promise<MemorySession | null> {
    const row = this.db.prepare(
      'SELECT * FROM memory_sessions WHERE session_id = ?',
    ).get(session_id) as any;
    if (!row) return null;
    return rowToSession(row);
  }

  async updateSessionStats(
    session_id: string,
    turn_delta: number,
    token_delta: number,
  ): Promise<void> {
    const now = Date.now();
    const result = this.db.prepare(
      `UPDATE memory_sessions
       SET turn_count = turn_count + ?,
           total_tokens = total_tokens + ?,
           last_activity = ?
       WHERE session_id = ?`,
    ).run(turn_delta, token_delta, now, session_id);
    if (result.changes === 0) throw new Error(`Session not found: ${session_id}`);
  }

  async closeSession(session_id: string, summary?: string): Promise<void> {
    const now = Date.now();
    let result;
    if (summary !== undefined) {
      result = this.db.prepare(
        `UPDATE memory_sessions
         SET status = 'closed', closed_at = ?, summary = ?
         WHERE session_id = ?`,
      ).run(now, summary, session_id);
    } else {
      result = this.db.prepare(
        `UPDATE memory_sessions
         SET status = 'closed', closed_at = ?
         WHERE session_id = ?`,
      ).run(now, session_id);
    }
    if (result.changes === 0) throw new Error(`Session not found: ${session_id}`);
  }

  async listSessions(
    agent_passport_id: string,
    status?: MemorySession['status'][],
  ): Promise<MemorySession[]> {
    if (status && status.length > 0) {
      const placeholders = status.map(() => '?').join(', ');
      const rows = this.db.prepare(
        `SELECT * FROM memory_sessions
         WHERE agent_passport_id = ? AND status IN (${placeholders})
         ORDER BY created_at DESC`,
      ).all(agent_passport_id, ...status) as any[];
      return rows.map(rowToSession);
    }

    const rows = this.db.prepare(
      `SELECT * FROM memory_sessions
       WHERE agent_passport_id = ?
       ORDER BY created_at DESC`,
    ).all(agent_passport_id) as any[];
    return rows.map(rowToSession);
  }

  // ─── Embeddings ─────────────────────────────────────────────────────

  async updateEmbedding(memory_id: string, embedding: number[], model: string): Promise<void> {
    const now = Date.now();
    this.db.prepare(
      `UPDATE memory_entries
       SET embedding_model = ?,
           embedding_status = 'ready',
           embedding_updated_at = ?,
           updated_at = ?
       WHERE memory_id = ?`,
    ).run(model, now, now, memory_id);

    // INSERT OR REPLACE into memory_vectors
    this.db.prepare(
      'INSERT OR REPLACE INTO memory_vectors (memory_id, embedding) VALUES (?, ?)',
    ).run(memory_id, new Float32Array(embedding));
  }

  async queryPendingEmbeddings(limit: number): Promise<MemoryEntry[]> {
    const rows = this.db.prepare(
      `SELECT * FROM memory_entries
       WHERE embedding_status = 'pending'
       ORDER BY created_at ASC
       LIMIT ?`,
    ).all(limit) as any[];
    return rows.map(rowToEntry);
  }

  async recordEmbeddingFailure(memory_id: string, error: string): Promise<void> {
    const now = Date.now();
    this.db.prepare(
      `UPDATE memory_entries
       SET embedding_attempts = embedding_attempts + 1,
           embedding_last_error = ?,
           embedding_updated_at = ?,
           updated_at = ?
       WHERE memory_id = ?`,
    ).run(error, now, now, memory_id);
  }

  // ─── Snapshots ──────────────────────────────────────────────────────

  async saveSnapshot(snapshot: Omit<MemorySnapshot, 'snapshot_id'>): Promise<string> {
    const snapshot_id = crypto.randomUUID();
    this.db.prepare(
      `INSERT INTO memory_snapshots (
        snapshot_id, agent_passport_id, depin_cid,
        entry_count, chain_head_hash, snapshot_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      snapshot_id,
      snapshot.agent_passport_id,
      snapshot.depin_cid,
      snapshot.entry_count,
      snapshot.chain_head_hash,
      snapshot.snapshot_type,
      snapshot.created_at,
    );
    return snapshot_id;
  }

  async getLatestSnapshot(agent_passport_id: string): Promise<MemorySnapshot | null> {
    const row = this.db.prepare(
      'SELECT * FROM memory_snapshots WHERE agent_passport_id = ? ORDER BY created_at DESC LIMIT 1',
    ).get(agent_passport_id) as any;
    if (!row) return null;
    return rowToSnapshot(row);
  }

  async listSnapshots(agent_passport_id: string): Promise<MemorySnapshot[]> {
    const rows = this.db.prepare(
      'SELECT * FROM memory_snapshots WHERE agent_passport_id = ? ORDER BY created_at DESC',
    ).all(agent_passport_id) as any[];
    return rows.map(rowToSnapshot);
  }

  // ─── Utilities ──────────────────────────────────────────────────────

  async getEntriesSince(agent_passport_id: string, since: number): Promise<MemoryEntry[]> {
    const rows = this.db.prepare(
      `SELECT * FROM memory_entries
       WHERE agent_passport_id = ? AND created_at >= ?
       ORDER BY created_at ASC, memory_id ASC`,
    ).all(agent_passport_id, since) as any[];
    return rows.map(rowToEntry);
  }

  async getStats(agent_passport_id: string): Promise<MemoryStats> {
    // Aggregate by type and status in a single query
    const groupRows = this.db.prepare(
      `SELECT type, status, COUNT(*) AS cnt,
              MIN(created_at) AS oldest, MAX(created_at) AS newest
       FROM memory_entries
       WHERE agent_passport_id = ?
       GROUP BY type, status`,
    ).all(agent_passport_id) as any[];

    const by_type = {} as Record<MemoryType, number>;
    for (const t of MEMORY_TYPES) by_type[t] = 0;

    const by_status = {} as Record<MemoryStatus, number>;
    for (const s of MEMORY_STATUSES) by_status[s] = 0;

    let total = 0;
    let oldest = Infinity;
    let newest = 0;

    for (const row of groupRows) {
      by_type[row.type as MemoryType] = (by_type[row.type as MemoryType] || 0) + row.cnt;
      by_status[row.status as MemoryStatus] = (by_status[row.status as MemoryStatus] || 0) + row.cnt;
      total += row.cnt;
      if (row.oldest < oldest) oldest = row.oldest;
      if (row.newest > newest) newest = row.newest;
    }

    // Get the latest hash across all namespaces
    const hashRow = this.db.prepare(
      `SELECT content_hash FROM memory_entries
       WHERE agent_passport_id = ?
       ORDER BY created_at DESC, memory_id DESC
       LIMIT 1`,
    ).get(agent_passport_id) as any;

    return {
      total_entries: total,
      by_type,
      by_status,
      oldest_entry: total > 0 ? oldest : 0,
      newest_entry: total > 0 ? newest : 0,
      chain_length: total,
      latest_hash: hashRow?.content_hash ?? null,
    };
  }

  // ─── Vector search ──────────────────────────────────────────────────

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

    // Over-fetch from vector table (limit * 3) to allow for post-filtering
    const overFetchLimit = maxResults * 3;

    // sqlite-vec KNN query — returns memory_id + distance
    const vecRows = this.db.prepare(
      `SELECT memory_id, distance
       FROM memory_vectors
       WHERE embedding MATCH ?
       ORDER BY distance
       LIMIT ?`,
    ).all(new Float32Array(embedding), overFetchLimit) as { memory_id: string; distance: number }[];

    if (vecRows.length === 0) return [];

    // Fetch the full entries for the candidate memory_ids
    const candidateIds = vecRows.map(r => r.memory_id);
    const placeholders = candidateIds.map(() => '?').join(', ');
    const entryRows = this.db.prepare(
      `SELECT * FROM memory_entries
       WHERE memory_id IN (${placeholders})`,
    ).all(...candidateIds) as any[];

    // Build a map of memory_id -> entry for fast lookup
    const entryMap = new Map<string, MemoryEntry>();
    for (const row of entryRows) {
      entryMap.set(row.memory_id, rowToEntry(row));
    }

    // Build a map of memory_id -> distance
    const distanceMap = new Map<string, number>();
    for (const vr of vecRows) {
      distanceMap.set(vr.memory_id, vr.distance);
    }

    // Post-filter and compute similarity
    const results: (MemoryEntry & { similarity: number })[] = [];

    for (const candidateId of candidateIds) {
      const entry = entryMap.get(candidateId);
      if (!entry) continue;

      // Filter: must be active
      if (entry.status !== 'active') continue;
      // Filter: agent_passport_id
      if (entry.agent_passport_id !== agent_passport_id) continue;
      // Filter: namespace
      if (namespace && entry.namespace !== namespace) continue;
      // Filter: types
      if (types && !types.includes(entry.type)) continue;
      // Filter: lanes
      if (lanes && !lanes.includes(entry.memory_lane || 'self')) continue;

      const distance = distanceMap.get(candidateId) ?? Infinity;
      // sqlite-vec distance is L2 by default; for cosine distance vec0,
      // similarity = 1 - distance
      const similarity = 1 - distance;

      // Filter: threshold
      if (similarity <= threshold) continue;

      results.push({ ...entry, similarity });
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, maxResults);
  }

  // ─── Hard delete ────────────────────────────────────────────────────

  async deleteBatch(memory_ids: string[]): Promise<void> {
    if (memory_ids.length === 0) return;

    const txn = this.db.transaction(() => {
      // Preserve content_hash in provenance before deleting
      const updateStmt = this.db.prepare(
        `UPDATE memory_provenance
         SET deleted_memory_hash = (
           SELECT content_hash FROM memory_entries WHERE memory_entries.memory_id = memory_provenance.memory_id
         )
         WHERE memory_id = ? AND deleted_memory_hash IS NULL`,
      );
      for (const id of memory_ids) {
        updateStmt.run(id);
      }

      // Delete from memory_vectors first (no FK constraint, but clean up)
      const deleteVecStmt = this.db.prepare(
        'DELETE FROM memory_vectors WHERE memory_id = ?',
      );
      for (const id of memory_ids) {
        deleteVecStmt.run(id);
      }

      // Delete from memory_entries
      const deleteEntryStmt = this.db.prepare(
        'DELETE FROM memory_entries WHERE memory_id = ?',
      );
      for (const id of memory_ids) {
        deleteEntryStmt.run(id);
      }
    });
    txn();
  }

  // ─── Compaction watermark ───────────────────────────────────────────

  async updateCompactionWatermark(session_id: string, turn_index: number): Promise<void> {
    const result = this.db.prepare(
      `UPDATE memory_sessions
       SET last_compacted_turn_index = MAX(last_compacted_turn_index, ?)
       WHERE session_id = ?`,
    ).run(turn_index, session_id);
    if (result.changes === 0) throw new Error(`Session not found: ${session_id}`);
  }

  // ─── Outbox ─────────────────────────────────────────────────────────

  async writeOutboxEvent(
    event: Omit<OutboxEvent, 'event_id' | 'created_at' | 'processed_at' | 'retry_count' | 'last_error'>,
  ): Promise<string> {
    const event_id = crypto.randomUUID();
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO memory_outbox (
        event_id, event_type, memory_id, agent_passport_id,
        namespace, payload_json, created_at, processed_at, retry_count, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      event_id,
      event.event_type,
      event.memory_id ?? null,
      event.agent_passport_id,
      event.namespace,
      event.payload_json,
      now,
      null, // processed_at
      0, // retry_count
      null, // last_error
    );
    return event_id;
  }

  async queryOutboxPending(limit: number): Promise<OutboxEvent[]> {
    const rows = this.db.prepare(
      `SELECT * FROM memory_outbox
       WHERE processed_at IS NULL
       ORDER BY created_at ASC
       LIMIT ?`,
    ).all(limit) as any[];
    return rows.map(rowToOutboxEvent);
  }

  async markOutboxProcessed(event_id: string): Promise<void> {
    const now = Date.now();
    this.db.prepare(
      'UPDATE memory_outbox SET processed_at = ? WHERE event_id = ?',
    ).run(now, event_id);
  }

  async markOutboxError(event_id: string, error: string): Promise<void> {
    this.db.prepare(
      'UPDATE memory_outbox SET retry_count = retry_count + 1, last_error = ? WHERE event_id = ?',
    ).run(error, event_id);
  }

  // ─── Health ─────────────────────────────────────────────────────────

  async getHealth(): Promise<MemoryStoreHealth> {
    const entryCount = (this.db.prepare(
      'SELECT COUNT(*) AS cnt FROM memory_entries',
    ).get() as any)?.cnt ?? 0;

    const vectorCount = (this.db.prepare(
      'SELECT COUNT(*) AS cnt FROM memory_vectors',
    ).get() as any)?.cnt ?? 0;

    const pendingEmbeddings = (this.db.prepare(
      `SELECT COUNT(*) AS cnt FROM memory_entries WHERE embedding_status = 'pending'`,
    ).get() as any)?.cnt ?? 0;

    const failedEmbeddings = (this.db.prepare(
      `SELECT COUNT(*) AS cnt FROM memory_entries WHERE embedding_status = 'failed'`,
    ).get() as any)?.cnt ?? 0;

    const schemaVersion = this.db.pragma('user_version', { simple: true }) as number;
    const journalMode = this.db.pragma('journal_mode', { simple: true }) as string;

    // Get DB file size — use page_count * page_size
    const pageCount = this.db.pragma('page_count', { simple: true }) as number;
    const pageSize = this.db.pragma('page_size', { simple: true }) as number;
    const sizeMb = (pageCount * pageSize) / (1024 * 1024);

    return {
      storeType: 'sqlite',
      dbPath: this.dbPath,
      schemaVersion,
      walMode: journalMode === 'wal',
      entryCount,
      vectorCount,
      pendingEmbeddings,
      failedEmbeddings,
      sizeMb: Math.round(sizeMb * 100) / 100,
      capabilities: this.capabilities,
    };
  }

  // ─── Cleanup ────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
