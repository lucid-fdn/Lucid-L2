import type {
  MemoryEntry, MemoryType, RecallResponse, MemorySession,
  MemoryStats, MemorySnapshot, ProvenanceRecord,
  MemoryWriteResult, MemoryQuery, ChainVerifyResult, RestoreResult,
} from '@lucid-l2/engine';

export interface MemoryNamespace {
  addEpisodic(input: { session_id: string; role: string; content: string; tokens: number; namespace?: string; metadata?: Record<string, unknown>; tool_calls?: any[] }): Promise<MemoryWriteResult>;
  addSemantic(input: { content: string; fact: string; confidence: number; source_memory_ids: string[]; namespace?: string; supersedes?: string[] }): Promise<MemoryWriteResult>;
  addProcedural(input: { content: string; rule: string; trigger: string; priority?: number; source_memory_ids: string[]; namespace?: string }): Promise<MemoryWriteResult>;

  recall(input: { query: string; types?: MemoryType[]; limit?: number; namespace?: string; min_similarity?: number }): Promise<RecallResponse>;
  get(memoryId: string): Promise<MemoryEntry | null>;
  query(q: Partial<MemoryQuery>): Promise<MemoryEntry[]>;

  startSession(input?: { namespace?: string }): Promise<string>;
  closeSession(sessionId: string, summary?: string): Promise<void>;
  getSessionContext(sessionId: string, limit?: number): Promise<MemoryEntry[]>;
  listSessions(status?: string[]): Promise<MemorySession[]>;

  verify(namespace?: string): Promise<ChainVerifyResult>;
  stats(): Promise<MemoryStats>;

  snapshot(type: 'checkpoint' | 'migration' | 'archive'): Promise<string>;
  restore(cid: string, options: { mode: 'replace' | 'merge' | 'fork'; target_namespace?: string }): Promise<RestoreResult>;
  listSnapshots(): Promise<MemorySnapshot[]>;

  provenance(namespace: string, limit?: number): Promise<ProvenanceRecord[]>;

  addEntity(input: {
    content?: string; entity_name: string; entity_type: string;
    entity_id?: string; attributes?: Record<string, unknown>;
    relationships?: any[]; source_memory_ids?: string[];
    namespace?: string; metadata?: Record<string, unknown>;
    memory_lane?: string;
  }): Promise<MemoryWriteResult>;

  addTrustWeighted(input: {
    content?: string; source_agent_passport_id: string;
    trust_score: number; decay_factor: number; weighted_relevance: number;
    source_memory_ids?: string[]; namespace?: string;
    metadata?: Record<string, unknown>; memory_lane?: string;
  }): Promise<MemoryWriteResult>;

  addTemporal(input: {
    content: string; valid_from: number; valid_to?: number | null;
    recorded_at?: number; source_memory_ids?: string[];
    namespace?: string; metadata?: Record<string, unknown>;
    memory_lane?: string;
  }): Promise<MemoryWriteResult>;

  compact(options?: {
    namespace?: string; session_id?: string;
    mode?: 'warm' | 'cold' | 'full';
  }): Promise<any>;

  exportMemoryFile(): Promise<any>;

  health(): Promise<any>;
}

export function createMemoryNamespace(
  httpClient: { get: Function; post: Function },
  agentPassportId: string,
): MemoryNamespace {
  return {
    async addEpisodic(input) {
      const { data } = await httpClient.post('/v1/memory/episodic', input);
      return data;
    },
    async addSemantic(input) {
      const { data } = await httpClient.post('/v1/memory/semantic', input);
      return data;
    },
    async addProcedural(input) {
      const { data } = await httpClient.post('/v1/memory/procedural', input);
      return data;
    },
    async recall(input) {
      const { data } = await httpClient.post('/v1/memory/recall', {
        ...input,
        agent_passport_id: agentPassportId,
      });
      return data;
    },
    async get(memoryId) {
      const { data } = await httpClient.get(`/v1/memory/entries/${memoryId}`);
      return data;
    },
    async query(q) {
      const params = new URLSearchParams();
      if (q.types) params.set('types', q.types.join(','));
      if (q.limit) params.set('limit', String(q.limit));
      if (q.offset) params.set('offset', String(q.offset));
      if (q.namespace) params.set('namespace', q.namespace);
      const { data } = await httpClient.get(`/v1/memory/entries?${params}`);
      return data;
    },
    async startSession(input) {
      const { data } = await httpClient.post('/v1/memory/sessions', input || {});
      return data.session_id;
    },
    async closeSession(sessionId, summary) {
      await httpClient.post(`/v1/memory/sessions/${sessionId}/close`, { summary });
    },
    async getSessionContext(sessionId, limit) {
      const { data } = await httpClient.get(`/v1/memory/sessions/${sessionId}/context?limit=${limit || 20}`);
      return data;
    },
    async listSessions() {
      const { data } = await httpClient.get('/v1/memory/sessions');
      return data;
    },
    async verify(namespace) {
      const { data } = await httpClient.post('/v1/memory/verify', {
        agent_passport_id: agentPassportId,
        namespace: namespace || `agent:${agentPassportId}`,
      });
      return data;
    },
    async stats() {
      const { data } = await httpClient.get(`/v1/memory/stats/${agentPassportId}`);
      return data;
    },
    async snapshot(type) {
      const { data } = await httpClient.post('/v1/memory/snapshots', {
        agent_passport_id: agentPassportId, snapshot_type: type,
      });
      return data;
    },
    async restore(cid, options) {
      const { data } = await httpClient.post('/v1/memory/snapshots/restore', {
        cid, ...options,
      });
      return data;
    },
    async listSnapshots() {
      const { data } = await httpClient.get('/v1/memory/snapshots');
      return data;
    },
    async provenance(namespace, limit) {
      const { data } = await httpClient.get(`/v1/memory/provenance/${agentPassportId}/${encodeURIComponent(namespace)}?limit=${limit || 100}`);
      return data;
    },
    async addEntity(input) {
      const { data } = await httpClient.post('/v1/memory/entity', input);
      return data;
    },
    async addTrustWeighted(input) {
      const { data } = await httpClient.post('/v1/memory/trust-weighted', input);
      return data;
    },
    async addTemporal(input) {
      const { data } = await httpClient.post('/v1/memory/temporal', input);
      return data;
    },
    async compact(options) {
      const { data } = await httpClient.post('/v1/memory/compact', options || {});
      return data;
    },
    async exportMemoryFile() {
      const { data } = await httpClient.post('/v1/memory/export', {});
      return data;
    },
    async health() {
      const { data } = await httpClient.get('/v1/memory/health');
      return data;
    },
  };
}
