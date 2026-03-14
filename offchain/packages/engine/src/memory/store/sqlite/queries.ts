import type { MemoryQuery } from '../interface';

// ─── Shared filter builder ──────────────────────────────────────────

function buildWhereClause(q: Partial<MemoryQuery>): { where: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];

  // agent_passport_id is always required in MemoryQuery
  if (q.agent_passport_id) {
    clauses.push('agent_passport_id = ?');
    params.push(q.agent_passport_id);
  }

  if (q.namespace) {
    clauses.push('namespace = ?');
    params.push(q.namespace);
  }

  if (q.types?.length) {
    clauses.push(`type IN (${q.types.map(() => '?').join(',')})`);
    params.push(...q.types);
  }

  if (q.session_id) {
    clauses.push('session_id = ?');
    params.push(q.session_id);
  }

  // Status defaults to ['active'] when not specified
  const statusFilter = q.status ?? ['active'];
  if (statusFilter.length) {
    clauses.push(`status IN (${statusFilter.map(() => '?').join(',')})`);
    params.push(...statusFilter);
  }

  if (q.content_hash) {
    clauses.push('content_hash = ?');
    params.push(q.content_hash);
  }

  if (q.since !== undefined) {
    clauses.push('created_at >= ?');
    params.push(q.since);
  }

  if (q.before !== undefined) {
    clauses.push('created_at < ?');
    params.push(q.before);
  }

  if (q.memory_lane?.length) {
    clauses.push(`memory_lane IN (${q.memory_lane.map(() => '?').join(',')})`);
    params.push(...q.memory_lane);
  }

  if (q.embedding_status?.length) {
    clauses.push(`embedding_status IN (${q.embedding_status.map(() => '?').join(',')})`);
    params.push(...q.embedding_status);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, params };
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Build a SELECT query for memory_entries with all MemoryQuery filters.
 * Returns parameterized SQL and the corresponding bind values.
 */
export function buildQuerySQL(q: MemoryQuery): { sql: string; params: any[] } {
  const { where, params } = buildWhereClause(q);

  const orderBy = q.order_by || 'created_at';
  const direction = (q.order_dir || 'asc').toUpperCase();
  const limit = q.limit ?? 50;
  const offset = q.offset ?? 0;

  const sql = `SELECT * FROM memory_entries ${where} ORDER BY ${orderBy} ${direction}, memory_id ASC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return { sql, params };
}

/**
 * Build a COUNT query for memory_entries with all MemoryQuery filters
 * (excluding limit/offset which don't apply to counts).
 */
export function buildCountSQL(q: Omit<MemoryQuery, 'limit' | 'offset'>): { sql: string; params: any[] } {
  const { where, params } = buildWhereClause(q);
  const sql = `SELECT COUNT(*) AS cnt FROM memory_entries ${where}`;
  return { sql, params };
}
