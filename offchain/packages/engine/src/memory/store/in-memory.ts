import crypto from 'crypto';
import type {
  MemoryEntry, MemoryType, MemoryStatus, WritableMemoryEntry,
  ProvenanceRecord, MemorySession, MemorySnapshot,
} from '../types';
import { MEMORY_TYPES, MEMORY_STATUSES } from '../types';
import type { IMemoryStore, MemoryQuery, MemoryWriteResult, MemoryStats } from './interface';

/**
 * Deterministic ordering comparator: (created_at ASC, memory_id ASC)
 */
function deterministicOrder(a: MemoryEntry, b: MemoryEntry): number {
  if (a.created_at !== b.created_at) return a.created_at - b.created_at;
  return a.memory_id < b.memory_id ? -1 : a.memory_id > b.memory_id ? 1 : 0;
}

export class InMemoryMemoryStore implements IMemoryStore {
  private entries = new Map<string, MemoryEntry>();
  private provenance: ProvenanceRecord[] = [];
  private sessions = new Map<string, MemorySession>();
  private snapshots: MemorySnapshot[] = [];
  private lastTimestamp = 0;

  // ─── Write ──────────────────────────────────────────────────────

  async write(
    entry: WritableMemoryEntry & { content_hash: string; prev_hash: string | null },
  ): Promise<MemoryWriteResult> {
    const memory_id = crypto.randomUUID();
    const now = Math.max(Date.now(), this.lastTimestamp + 1);
    this.lastTimestamp = now;

    const full: MemoryEntry = {
      ...entry,
      memory_id,
      status: 'active',
      created_at: now,
      updated_at: now,
    } as MemoryEntry;

    this.entries.set(memory_id, full);

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
    for (const entry of entries) {
      results.push(await this.write(entry));
    }
    return results;
  }

  // ─── Read ───────────────────────────────────────────────────────

  async read(memory_id: string): Promise<MemoryEntry | null> {
    return this.entries.get(memory_id) ?? null;
  }

  async query(q: MemoryQuery): Promise<MemoryEntry[]> {
    const statusFilter = q.status ?? ['active'];
    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;

    let results = Array.from(this.entries.values()).filter((e) => {
      if (e.agent_passport_id !== q.agent_passport_id) return false;
      if (q.namespace && e.namespace !== q.namespace) return false;
      if (q.types && !q.types.includes(e.type)) return false;
      if (!statusFilter.includes(e.status)) return false;
      if (q.session_id && (e as any).session_id !== q.session_id) return false;
      if (q.content_hash && e.content_hash !== q.content_hash) return false;
      if (q.since && e.created_at < q.since) return false;
      if (q.before && e.created_at >= q.before) return false;
      return true;
    });

    // Deterministic ordering: (created_at ASC, memory_id ASC)
    results.sort(deterministicOrder);

    // Apply order_dir if desc
    if (q.order_dir === 'desc') {
      results.reverse();
    }

    return results.slice(offset, offset + limit);
  }

  async count(q: Omit<MemoryQuery, 'limit' | 'offset'>): Promise<number> {
    const statusFilter = q.status ?? ['active'];

    return Array.from(this.entries.values()).filter((e) => {
      if (e.agent_passport_id !== q.agent_passport_id) return false;
      if (q.namespace && e.namespace !== q.namespace) return false;
      if (q.types && !q.types.includes(e.type)) return false;
      if (!statusFilter.includes(e.status)) return false;
      if (q.session_id && (e as any).session_id !== q.session_id) return false;
      if (q.content_hash && e.content_hash !== q.content_hash) return false;
      if (q.since && e.created_at < q.since) return false;
      if (q.before && e.created_at >= q.before) return false;
      return true;
    }).length;
  }

  // ─── Status transitions ─────────────────────────────────────────

  async supersede(memory_id: string, _superseded_by: string): Promise<void> {
    const entry = this.entries.get(memory_id);
    if (!entry) throw new Error(`Memory entry not found: ${memory_id}`);
    entry.status = 'superseded';
    entry.updated_at = Date.now();
  }

  async archive(memory_id: string): Promise<void> {
    const entry = this.entries.get(memory_id);
    if (!entry) throw new Error(`Memory entry not found: ${memory_id}`);
    entry.status = 'archived';
    entry.updated_at = Date.now();
  }

  async archiveBatch(memory_ids: string[]): Promise<void> {
    for (const id of memory_ids) {
      await this.archive(id);
    }
  }

  async softDelete(memory_id: string): Promise<void> {
    const entry = this.entries.get(memory_id);
    if (!entry) throw new Error(`Memory entry not found: ${memory_id}`);
    entry.status = 'archived';
    entry.updated_at = Date.now();
  }

  // ─── Provenance ─────────────────────────────────────────────────

  async writeProvenance(record: Omit<ProvenanceRecord, 'record_id'>): Promise<string> {
    const record_id = crypto.randomUUID();
    this.provenance.push({ ...record, record_id });
    return record_id;
  }

  async getProvenanceChain(
    agent_passport_id: string,
    namespace: string,
    limit?: number,
  ): Promise<ProvenanceRecord[]> {
    const chain = this.provenance
      .filter((r) => r.agent_passport_id === agent_passport_id && r.namespace === namespace)
      .sort((a, b) => b.created_at - a.created_at);
    return limit ? chain.slice(0, limit) : chain;
  }

  async getProvenanceForMemory(memory_id: string): Promise<ProvenanceRecord[]> {
    return this.provenance
      .filter((r) => r.memory_id === memory_id)
      .sort((a, b) => b.created_at - a.created_at);
  }

  // ─── Hash chain ─────────────────────────────────────────────────

  async getLatestHash(agent_passport_id: string, namespace: string): Promise<string | null> {
    const matching = Array.from(this.entries.values())
      .filter((e) => e.agent_passport_id === agent_passport_id && e.namespace === namespace);

    if (matching.length === 0) return null;

    // Deterministic: highest (created_at, memory_id) pair
    matching.sort(deterministicOrder);
    return matching[matching.length - 1].content_hash;
  }

  // ─── Sessions ───────────────────────────────────────────────────

  async createSession(
    session: Omit<MemorySession, 'turn_count' | 'total_tokens' | 'created_at' | 'last_activity'>,
  ): Promise<string> {
    const now = Date.now();
    const full: MemorySession = {
      ...session,
      turn_count: 0,
      total_tokens: 0,
      created_at: now,
      last_activity: now,
    };
    this.sessions.set(session.session_id, full);
    return session.session_id;
  }

  async getSession(session_id: string): Promise<MemorySession | null> {
    return this.sessions.get(session_id) ?? null;
  }

  async updateSessionStats(
    session_id: string,
    turn_delta: number,
    token_delta: number,
  ): Promise<void> {
    const session = this.sessions.get(session_id);
    if (!session) throw new Error(`Session not found: ${session_id}`);
    session.turn_count += turn_delta;
    session.total_tokens += token_delta;
    session.last_activity = Date.now();
  }

  async closeSession(session_id: string, summary?: string): Promise<void> {
    const session = this.sessions.get(session_id);
    if (!session) throw new Error(`Session not found: ${session_id}`);
    session.status = 'closed';
    session.closed_at = Date.now();
    if (summary !== undefined) {
      session.summary = summary;
    }
  }

  async listSessions(
    agent_passport_id: string,
    status?: MemorySession['status'][],
  ): Promise<MemorySession[]> {
    return Array.from(this.sessions.values()).filter((s) => {
      if (s.agent_passport_id !== agent_passport_id) return false;
      if (status && !status.includes(s.status)) return false;
      return true;
    });
  }

  // ─── Embeddings ─────────────────────────────────────────────────

  async updateEmbedding(memory_id: string, embedding: number[], model: string): Promise<void> {
    const entry = this.entries.get(memory_id);
    if (!entry) throw new Error(`Memory entry not found: ${memory_id}`);
    entry.embedding = embedding;
    entry.embedding_model = model;
    entry.updated_at = Date.now();
  }

  // ─── Snapshots ──────────────────────────────────────────────────

  async saveSnapshot(snapshot: Omit<MemorySnapshot, 'snapshot_id'>): Promise<string> {
    const snapshot_id = crypto.randomUUID();
    this.snapshots.push({ ...snapshot, snapshot_id });
    return snapshot_id;
  }

  async getLatestSnapshot(agent_passport_id: string): Promise<MemorySnapshot | null> {
    const matching = this.snapshots
      .filter((s) => s.agent_passport_id === agent_passport_id)
      .sort((a, b) => b.created_at - a.created_at);
    return matching[0] ?? null;
  }

  async listSnapshots(agent_passport_id: string): Promise<MemorySnapshot[]> {
    return this.snapshots
      .filter((s) => s.agent_passport_id === agent_passport_id)
      .sort((a, b) => b.created_at - a.created_at);
  }

  // ─── Utilities ──────────────────────────────────────────────────

  async getEntriesSince(agent_passport_id: string, since: number): Promise<MemoryEntry[]> {
    return Array.from(this.entries.values())
      .filter((e) => e.agent_passport_id === agent_passport_id && e.created_at >= since)
      .sort(deterministicOrder);
  }

  async getStats(agent_passport_id: string): Promise<MemoryStats> {
    const all = Array.from(this.entries.values())
      .filter((e) => e.agent_passport_id === agent_passport_id);

    const by_type = {} as Record<MemoryType, number>;
    for (const t of MEMORY_TYPES) by_type[t] = 0;

    const by_status = {} as Record<MemoryStatus, number>;
    for (const s of MEMORY_STATUSES) by_status[s] = 0;

    let oldest = Infinity;
    let newest = 0;

    for (const e of all) {
      by_type[e.type]++;
      by_status[e.status]++;
      if (e.created_at < oldest) oldest = e.created_at;
      if (e.created_at > newest) newest = e.created_at;
    }

    const latestHash = await this.getLatestHash(agent_passport_id, '');
    // For stats, we get the latest hash across ALL namespaces
    const allSorted = all.sort(deterministicOrder);
    const latest = allSorted.length > 0 ? allSorted[allSorted.length - 1].content_hash : null;

    return {
      total_entries: all.length,
      by_type,
      by_status,
      oldest_entry: all.length > 0 ? oldest : 0,
      newest_entry: all.length > 0 ? newest : 0,
      chain_length: all.length,
      latest_hash: latest,
    };
  }
}
