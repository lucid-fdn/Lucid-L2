import type { IProjectionSink, ProjectableEntry } from './interface';

export class PostgresSink implements IProjectionSink {
  readonly name = 'postgres';

  async project(entry: ProjectableEntry): Promise<void> {
    await this.projectBatch([entry]);
  }

  async projectBatch(entries: ProjectableEntry[]): Promise<void> {
    // Lazy-load pool to avoid import errors when Postgres not configured
    try {
      const { pool } = require('../../../db/pool');
      for (const entry of entries) {
        await pool.query(
          `INSERT INTO memory_entries (memory_id, agent_passport_id, type, namespace, memory_lane, content, content_hash, created_at, updated_at, metadata, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8::double precision / 1000), to_timestamp($8::double precision / 1000), $9, 'active')
           ON CONFLICT (memory_id) DO UPDATE SET
             content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
             updated_at = EXCLUDED.updated_at, metadata = EXCLUDED.metadata`,
          [entry.memory_id, entry.agent_passport_id, entry.type, entry.namespace,
           entry.memory_lane, entry.content, entry.content_hash, entry.created_at,
           entry.metadata ? JSON.stringify(entry.metadata) : '{}'],
        );
      }
    } catch (err) {
      // If pool not available, skip silently (projection is optional)
      throw err; // But if pool is available and query fails, propagate
    }
  }

  async remove(memory_ids: string[]): Promise<void> {
    if (memory_ids.length === 0) return;
    try {
      const { pool } = require('../../../db/pool');
      const placeholders = memory_ids.map((_, i) => `$${i + 1}`).join(',');
      await pool.query(`DELETE FROM memory_entries WHERE memory_id IN (${placeholders})`, memory_ids);
    } catch (err) {
      throw err;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const { pool } = require('../../../db/pool');
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
