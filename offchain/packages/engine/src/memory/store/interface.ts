import type {
  MemoryEntry, MemoryType, MemoryStatus, WritableMemoryEntry,
  ProvenanceRecord, MemorySession, MemorySnapshot,
} from '../types';

export interface MemoryQuery {
  agent_passport_id: string;
  namespace?: string;
  types?: MemoryType[];
  session_id?: string;
  status?: MemoryStatus[];
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'updated_at' | 'turn_index';
  order_dir?: 'asc' | 'desc';
  content_hash?: string;
  since?: number;
  before?: number;
}

export interface MemoryWriteResult {
  memory_id: string;
  content_hash: string;
  prev_hash: string | null;
}

export interface MemoryStats {
  total_entries: number;
  by_type: Record<MemoryType, number>;
  by_status: Record<MemoryStatus, number>;
  oldest_entry: number;
  newest_entry: number;
  chain_length: number;
  latest_hash: string | null;
}

export interface IMemoryStore {
  write(entry: WritableMemoryEntry & { content_hash: string; prev_hash: string | null }): Promise<MemoryWriteResult>;
  writeBatch(entries: (WritableMemoryEntry & { content_hash: string; prev_hash: string | null })[]): Promise<MemoryWriteResult[]>;
  read(memory_id: string): Promise<MemoryEntry | null>;
  query(q: MemoryQuery): Promise<MemoryEntry[]>;
  count(q: Omit<MemoryQuery, 'limit' | 'offset'>): Promise<number>;
  supersede(memory_id: string, superseded_by: string): Promise<void>;
  archive(memory_id: string): Promise<void>;
  archiveBatch(memory_ids: string[]): Promise<void>;
  softDelete(memory_id: string): Promise<void>;
  writeProvenance(record: Omit<ProvenanceRecord, 'record_id'>): Promise<string>;
  getProvenanceChain(agent_passport_id: string, namespace: string, limit?: number): Promise<ProvenanceRecord[]>;
  getProvenanceForMemory(memory_id: string): Promise<ProvenanceRecord[]>;
  getLatestHash(agent_passport_id: string, namespace: string): Promise<string | null>;
  createSession(session: Omit<MemorySession, 'turn_count' | 'total_tokens' | 'created_at' | 'last_activity'>): Promise<string>;
  getSession(session_id: string): Promise<MemorySession | null>;
  updateSessionStats(session_id: string, turn_delta: number, token_delta: number): Promise<void>;
  closeSession(session_id: string, summary?: string): Promise<void>;
  listSessions(agent_passport_id: string, status?: MemorySession['status'][]): Promise<MemorySession[]>;
  updateEmbedding(memory_id: string, embedding: number[], model: string): Promise<void>;
  saveSnapshot(snapshot: Omit<MemorySnapshot, 'snapshot_id'>): Promise<string>;
  getLatestSnapshot(agent_passport_id: string): Promise<MemorySnapshot | null>;
  listSnapshots(agent_passport_id: string): Promise<MemorySnapshot[]>;
  getEntriesSince(agent_passport_id: string, since: number): Promise<MemoryEntry[]>;
  getStats(agent_passport_id: string): Promise<MemoryStats>;
}
