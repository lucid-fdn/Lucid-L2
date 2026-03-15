// offchain/packages/engine/src/anchoring/registry.ts
// IAnchorRegistry interface + InMemory and Postgres implementations

import { randomUUID } from 'crypto';
import type { AnchorRecord, ArtifactType, StorageTier } from './types';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

type CreateInput = Omit<AnchorRecord, 'anchor_id' | 'status' | 'created_at' | 'verified_at'>;

export interface IAnchorRegistry {
  create(record: CreateInput): Promise<AnchorRecord>;
  getById(anchor_id: string): Promise<AnchorRecord | null>;
  getByArtifact(artifact_type: ArtifactType, artifact_id: string): Promise<AnchorRecord[]>;
  getLatestByArtifact(artifact_type: ArtifactType, artifact_id: string): Promise<AnchorRecord | null>;
  getByCID(cid: string): Promise<AnchorRecord | null>;
  getByAgent(agent_passport_id: string, options?: { artifact_type?: ArtifactType; limit?: number }): Promise<AnchorRecord[]>;
  getLineage(anchor_id: string): Promise<AnchorRecord[]>;
  updateStatus(anchor_id: string, status: 'verified' | 'unreachable'): Promise<void>;
  count(filters?: { artifact_type?: ArtifactType; agent_passport_id?: string; status?: string }): Promise<number>;
}

// ---------------------------------------------------------------------------
// InMemoryAnchorRegistry
// ---------------------------------------------------------------------------

export class InMemoryAnchorRegistry implements IAnchorRegistry {
  private records = new Map<string, AnchorRecord>();

  async create(input: CreateInput): Promise<AnchorRecord> {
    // Dedup check: (artifact_type, artifact_id, content_hash)
    for (const existing of this.records.values()) {
      if (
        existing.artifact_type === input.artifact_type &&
        existing.artifact_id === input.artifact_id &&
        existing.content_hash === input.content_hash
      ) {
        return existing;
      }
    }

    const record: AnchorRecord = {
      anchor_id: randomUUID(),
      ...input,
      status: 'uploaded',
      created_at: Date.now(),
      verified_at: null,
    };
    this.records.set(record.anchor_id, record);
    return record;
  }

  async getById(anchor_id: string): Promise<AnchorRecord | null> {
    return this.records.get(anchor_id) ?? null;
  }

  async getByArtifact(artifact_type: ArtifactType, artifact_id: string): Promise<AnchorRecord[]> {
    const results: AnchorRecord[] = [];
    for (const r of this.records.values()) {
      if (r.artifact_type === artifact_type && r.artifact_id === artifact_id) {
        results.push(r);
      }
    }
    return results.sort((a, b) => b.created_at - a.created_at);
  }

  async getLatestByArtifact(artifact_type: ArtifactType, artifact_id: string): Promise<AnchorRecord | null> {
    const all = await this.getByArtifact(artifact_type, artifact_id);
    return all[0] ?? null;
  }

  async getByCID(cid: string): Promise<AnchorRecord | null> {
    for (const r of this.records.values()) {
      if (r.cid === cid) return r;
    }
    return null;
  }

  async getByAgent(
    agent_passport_id: string,
    options?: { artifact_type?: ArtifactType; limit?: number },
  ): Promise<AnchorRecord[]> {
    const results: AnchorRecord[] = [];
    for (const r of this.records.values()) {
      if (r.agent_passport_id !== agent_passport_id) continue;
      if (options?.artifact_type && r.artifact_type !== options.artifact_type) continue;
      results.push(r);
    }
    results.sort((a, b) => b.created_at - a.created_at);
    if (options?.limit) return results.slice(0, options.limit);
    return results;
  }

  async getLineage(anchor_id: string): Promise<AnchorRecord[]> {
    const chain: AnchorRecord[] = [];
    let currentId: string | null = anchor_id;
    const visited = new Set<string>();

    while (currentId) {
      if (visited.has(currentId)) break; // prevent infinite loops
      visited.add(currentId);

      const record = this.records.get(currentId);
      if (!record) break;
      chain.push(record);
      currentId = record.parent_anchor_id;
    }

    return chain;
  }

  async updateStatus(anchor_id: string, status: 'verified' | 'unreachable'): Promise<void> {
    const record = this.records.get(anchor_id);
    if (!record) throw new Error(`Anchor ${anchor_id} not found`);
    record.status = status;
    record.verified_at = status === 'verified' ? Date.now() : record.verified_at;
  }

  async count(filters?: { artifact_type?: ArtifactType; agent_passport_id?: string; status?: string }): Promise<number> {
    if (!filters) return this.records.size;

    let count = 0;
    for (const r of this.records.values()) {
      if (filters.artifact_type && r.artifact_type !== filters.artifact_type) continue;
      if (filters.agent_passport_id && r.agent_passport_id !== filters.agent_passport_id) continue;
      if (filters.status && r.status !== filters.status) continue;
      count++;
    }
    return count;
  }
}

// ---------------------------------------------------------------------------
// PostgresAnchorRegistry
// ---------------------------------------------------------------------------

export class PostgresAnchorRegistry implements IAnchorRegistry {
  private pool: import('pg').Pool;

  constructor() {
    // Lazy-require to avoid side-effects during import
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    this.pool = require('../../db/pool').pool;
  }

  // Map a DB row to AnchorRecord
  private toRecord(row: Record<string, unknown>): AnchorRecord {
    return {
      anchor_id: row.anchor_id as string,
      artifact_type: row.artifact_type as AnchorRecord['artifact_type'],
      artifact_id: row.artifact_id as string,
      agent_passport_id: (row.agent_passport_id as string) ?? null,
      producer: row.producer as string,
      provider: row.provider as string,
      storage_tier: row.storage_tier as StorageTier,
      cid: row.cid as string,
      content_hash: row.content_hash as string,
      url: row.url as string,
      size_bytes: Number(row.size_bytes),
      status: row.status as AnchorRecord['status'],
      parent_anchor_id: (row.parent_anchor_id as string) ?? null,
      chain_tx: (row.chain_tx as Record<string, string>) ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      created_at: new Date(row.created_at as string).getTime(),
      verified_at: row.verified_at ? new Date(row.verified_at as string).getTime() : null,
    };
  }

  async create(input: CreateInput): Promise<AnchorRecord> {
    const id = randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO anchor_records (
        anchor_id, artifact_type, artifact_id, agent_passport_id, producer,
        provider, storage_tier, cid, content_hash, url, size_bytes,
        status, parent_anchor_id, chain_tx, metadata, created_at, verified_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NULL)
      ON CONFLICT (artifact_type, artifact_id, content_hash)
      DO UPDATE SET metadata = EXCLUDED.metadata
      RETURNING *`,
      [
        id,
        input.artifact_type,
        input.artifact_id,
        input.agent_passport_id,
        input.producer,
        input.provider,
        input.storage_tier,
        input.cid,
        input.content_hash,
        input.url,
        input.size_bytes,
        'uploaded',
        input.parent_anchor_id,
        input.chain_tx ? JSON.stringify(input.chain_tx) : null,
        JSON.stringify(input.metadata),
      ],
    );
    return this.toRecord(rows[0]);
  }

  async getById(anchor_id: string): Promise<AnchorRecord | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM anchor_records WHERE anchor_id = $1',
      [anchor_id],
    );
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async getByArtifact(artifact_type: ArtifactType, artifact_id: string): Promise<AnchorRecord[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM anchor_records WHERE artifact_type = $1 AND artifact_id = $2 ORDER BY created_at DESC',
      [artifact_type, artifact_id],
    );
    return rows.map((r: Record<string, unknown>) => this.toRecord(r));
  }

  async getLatestByArtifact(artifact_type: ArtifactType, artifact_id: string): Promise<AnchorRecord | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM anchor_records WHERE artifact_type = $1 AND artifact_id = $2 ORDER BY created_at DESC LIMIT 1',
      [artifact_type, artifact_id],
    );
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async getByCID(cid: string): Promise<AnchorRecord | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM anchor_records WHERE cid = $1',
      [cid],
    );
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async getByAgent(
    agent_passport_id: string,
    options?: { artifact_type?: ArtifactType; limit?: number },
  ): Promise<AnchorRecord[]> {
    const params: unknown[] = [agent_passport_id];
    let sql = 'SELECT * FROM anchor_records WHERE agent_passport_id = $1';

    if (options?.artifact_type) {
      params.push(options.artifact_type);
      sql += ` AND artifact_type = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    if (options?.limit) {
      params.push(options.limit);
      sql += ` LIMIT $${params.length}`;
    }

    const { rows } = await this.pool.query(sql, params);
    return rows.map((r: Record<string, unknown>) => this.toRecord(r));
  }

  async getLineage(anchor_id: string): Promise<AnchorRecord[]> {
    const { rows } = await this.pool.query(
      `WITH RECURSIVE lineage AS (
        SELECT * FROM anchor_records WHERE anchor_id = $1
        UNION ALL
        SELECT a.* FROM anchor_records a
        JOIN lineage l ON a.anchor_id = l.parent_anchor_id
      )
      SELECT * FROM lineage`,
      [anchor_id],
    );
    return rows.map((r: Record<string, unknown>) => this.toRecord(r));
  }

  async updateStatus(anchor_id: string, status: 'verified' | 'unreachable'): Promise<void> {
    const verifiedClause = status === 'verified' ? ', verified_at = NOW()' : '';
    await this.pool.query(
      `UPDATE anchor_records SET status = $1${verifiedClause} WHERE anchor_id = $2`,
      [status, anchor_id],
    );
  }

  async count(filters?: { artifact_type?: ArtifactType; agent_passport_id?: string; status?: string }): Promise<number> {
    const params: unknown[] = [];
    const clauses: string[] = [];

    if (filters?.artifact_type) {
      params.push(filters.artifact_type);
      clauses.push(`artifact_type = $${params.length}`);
    }
    if (filters?.agent_passport_id) {
      params.push(filters.agent_passport_id);
      clauses.push(`agent_passport_id = $${params.length}`);
    }
    if (filters?.status) {
      params.push(filters.status);
      clauses.push(`status = $${params.length}`);
    }

    const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS cnt FROM anchor_records${where}`,
      params,
    );
    return rows[0].cnt;
  }
}
