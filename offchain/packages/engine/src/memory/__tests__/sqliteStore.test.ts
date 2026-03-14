import { SQLiteMemoryStore } from '../store/sqlite/store';
import type { WritableMemoryEntry } from '../types';

// ─── Factory helpers ─────────────────────────────────────────────────

function makeEpisodic(overrides: Partial<any> = {}) {
  return {
    agent_passport_id: 'agent-1',
    type: 'episodic' as const,
    namespace: 'agent:agent-1',
    memory_lane: 'self' as const,
    content: 'Hello world',
    metadata: {},
    session_id: 'sess-1',
    role: 'user' as const,
    tokens: 10,
    embedding_status: 'pending' as const,
    embedding_attempts: 0,
    content_hash: 'hash-' + Math.random().toString(36).slice(2, 10),
    prev_hash: null,
    ...overrides,
  } as WritableMemoryEntry & { content_hash: string; prev_hash: string | null };
}

function makeSemantic(overrides: Partial<any> = {}) {
  return {
    agent_passport_id: 'agent-1',
    type: 'semantic' as const,
    namespace: 'agent:agent-1',
    memory_lane: 'self' as const,
    content: 'The sky is blue',
    metadata: {},
    fact: 'The sky is blue',
    confidence: 0.9,
    source_memory_ids: [],
    embedding_status: 'pending' as const,
    embedding_attempts: 0,
    content_hash: 'hash-' + Math.random().toString(36).slice(2, 10),
    prev_hash: null,
    ...overrides,
  } as WritableMemoryEntry & { content_hash: string; prev_hash: string | null };
}

/**
 * Create a 1536-dimensional embedding vector with a known direction.
 * By placing values in the first few dimensions and zeroing the rest,
 * we get predictable cosine similarities.
 */
function makeEmbedding(values: number[]): number[] {
  const emb = new Array(1536).fill(0);
  for (let i = 0; i < values.length; i++) emb[i] = values[i];
  return emb;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('SQLiteMemoryStore', () => {
  let store: SQLiteMemoryStore;

  beforeEach(() => {
    store = new SQLiteMemoryStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  // ─── 1. write + read round-trip ────────────────────────────────────

  describe('write + read round-trip', () => {
    it('should preserve all fields through write and read', async () => {
      const input = makeEpisodic({ content: 'round-trip test', content_hash: 'rt-hash', prev_hash: 'prev-1' });
      const result = await store.write(input);
      expect(result.memory_id).toBeDefined();
      expect(result.content_hash).toBe('rt-hash');
      expect(result.prev_hash).toBe('prev-1');

      const entry = await store.read(result.memory_id);
      expect(entry).not.toBeNull();
      expect(entry!.content).toBe('round-trip test');
      expect(entry!.type).toBe('episodic');
      expect(entry!.agent_passport_id).toBe('agent-1');
      expect(entry!.namespace).toBe('agent:agent-1');
      expect(entry!.memory_lane).toBe('self');
      expect(entry!.status).toBe('active');
      expect(entry!.content_hash).toBe('rt-hash');
      expect(entry!.prev_hash).toBe('prev-1');
      expect(entry!.embedding_status).toBe('pending');
      expect(entry!.embedding_attempts).toBe(0);
      expect(entry!.created_at).toBeGreaterThan(0);
      expect(entry!.updated_at).toBeGreaterThan(0);
    });

    it('should return null for non-existent entry', async () => {
      const entry = await store.read('non-existent-id');
      expect(entry).toBeNull();
    });
  });

  // ─── 2. query with agent_passport_id filter ────────────────────────

  describe('query with agent_passport_id filter', () => {
    it('should return only entries for the specified agent', async () => {
      await store.write(makeEpisodic({ agent_passport_id: 'agent-1', content_hash: 'a1' }));
      await store.write(makeEpisodic({ agent_passport_id: 'agent-2', content_hash: 'a2' }));

      const results = await store.query({ agent_passport_id: 'agent-1' });
      expect(results).toHaveLength(1);
      expect(results[0].agent_passport_id).toBe('agent-1');
    });
  });

  // ─── 3. query with namespace filter ────────────────────────────────

  describe('query with namespace filter', () => {
    it('should filter by namespace', async () => {
      await store.write(makeEpisodic({ namespace: 'ns-1', content_hash: 'n1' }));
      await store.write(makeEpisodic({ namespace: 'ns-2', content_hash: 'n2' }));

      const results = await store.query({ agent_passport_id: 'agent-1', namespace: 'ns-1' });
      expect(results).toHaveLength(1);
      expect(results[0].namespace).toBe('ns-1');
    });
  });

  // ─── 4. query with type filter ─────────────────────────────────────

  describe('query with type filter', () => {
    it('should filter by type', async () => {
      await store.write(makeEpisodic());
      await store.write(makeSemantic());

      const results = await store.query({ agent_passport_id: 'agent-1', types: ['semantic'] });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('semantic');
    });
  });

  // ─── 5. query with status filter (default ['active']) ──────────────

  describe('query with status filter', () => {
    it('should default status filter to [active]', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'a1' }));
      await store.write(makeEpisodic({ content_hash: 'a2' }));
      await store.archive(r1.memory_id);

      const results = await store.query({ agent_passport_id: 'agent-1' });
      expect(results).toHaveLength(1);
    });

    it('should return archived entries when status includes archived', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'a1' }));
      await store.write(makeEpisodic({ content_hash: 'a2' }));
      await store.archive(r1.memory_id);

      const results = await store.query({
        agent_passport_id: 'agent-1',
        status: ['active', 'archived'],
      });
      expect(results).toHaveLength(2);
    });
  });

  // ─── 6. query with memory_lane filter ──────────────────────────────

  describe('query with memory_lane filter', () => {
    it('should filter by memory_lane', async () => {
      await store.write(makeEpisodic({ content_hash: 'self1', memory_lane: 'self' }));
      await store.write(makeEpisodic({ content_hash: 'user1', memory_lane: 'user' }));

      const results = await store.query({
        agent_passport_id: 'agent-1',
        memory_lane: ['user'],
      });
      expect(results).toHaveLength(1);
      expect((results[0] as any).memory_lane).toBe('user');
    });
  });

  // ─── 7. query with since/before timestamp filters ──────────────────

  describe('query with since/before timestamp filters', () => {
    it('should filter by since and before', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'old' }));
      const entry1 = await store.read(r1.memory_id);
      const threshold = entry1!.created_at + 1;

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 5));
      await store.write(makeEpisodic({ content_hash: 'new' }));

      const sinceResults = await store.query({
        agent_passport_id: 'agent-1',
        since: threshold,
      });
      expect(sinceResults.length).toBeGreaterThanOrEqual(1);
      expect(sinceResults.every((e) => e.created_at >= threshold)).toBe(true);

      const beforeResults = await store.query({
        agent_passport_id: 'agent-1',
        before: threshold,
      });
      expect(beforeResults.length).toBeGreaterThanOrEqual(1);
      expect(beforeResults.every((e) => e.created_at < threshold)).toBe(true);
    });
  });

  // ─── 8. nearestByEmbedding — ranked by similarity ──────────────────

  describe('nearestByEmbedding()', () => {
    it('should return entries sorted by cosine similarity', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'e1' }));
      const r2 = await store.write(makeEpisodic({ content_hash: 'e2' }));

      // r1: exact match to query vector
      await store.updateEmbedding(r1.memory_id, makeEmbedding([1, 0, 0]), 'test-model');
      // r2: close but not exact
      await store.updateEmbedding(r2.memory_id, makeEmbedding([0.9, 0.1, 0]), 'test-model');

      const results = await store.nearestByEmbedding(
        makeEmbedding([1, 0, 0]), 'agent-1', undefined, undefined, 10, 0.0,
      );
      expect(results.length).toBe(2);
      expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
    });

    // ─── 9. nearestByEmbedding — threshold filtering ─────────────────

    it('should filter by similarity threshold', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'e1' }));
      // Orthogonal vector — very low similarity
      await store.updateEmbedding(r1.memory_id, makeEmbedding([0, 1, 0]), 'test-model');

      const results = await store.nearestByEmbedding(
        makeEmbedding([1, 0, 0]), 'agent-1', undefined, undefined, 10, 0.9,
      );
      expect(results.length).toBe(0);
    });

    // ─── 10. nearestByEmbedding — type/lane filter ───────────────────

    it('should filter by type and lane', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'e1', namespace: 'ns-a' }));
      const r2 = await store.write(makeSemantic({ content_hash: 's1', namespace: 'ns-a' }));
      await store.updateEmbedding(r1.memory_id, makeEmbedding([1, 0, 0]), 'test-model');
      await store.updateEmbedding(r2.memory_id, makeEmbedding([1, 0, 0]), 'test-model');

      const results = await store.nearestByEmbedding(
        makeEmbedding([1, 0, 0]), 'agent-1', 'ns-a', ['semantic'], 10, 0.0,
      );
      expect(results.length).toBe(1);
      expect(results[0].type).toBe('semantic');
    });

    it('should filter by lanes', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'self1', memory_lane: 'self' }));
      const r2 = await store.write(makeEpisodic({ content_hash: 'market1', memory_lane: 'market' }));
      await store.updateEmbedding(r1.memory_id, makeEmbedding([1, 0, 0]), 'test-model');
      await store.updateEmbedding(r2.memory_id, makeEmbedding([1, 0, 0]), 'test-model');

      const results = await store.nearestByEmbedding(
        makeEmbedding([1, 0, 0]), 'agent-1', undefined, undefined, 10, 0.0, ['market'],
      );
      expect(results.length).toBe(1);
      expect((results[0] as any).memory_lane).toBe('market');
    });

    it('should skip entries without embeddings', async () => {
      await store.write(makeEpisodic({ content_hash: 'no-embed' }));
      const results = await store.nearestByEmbedding(
        makeEmbedding([1, 0, 0]), 'agent-1', undefined, undefined, 10, 0.0,
      );
      expect(results.length).toBe(0);
    });
  });

  // ─── 11. deleteBatch — transactional ───────────────────────────────

  describe('deleteBatch()', () => {
    it('should hard-delete entries transactionally', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'd1' }));
      const r2 = await store.write(makeEpisodic({ content_hash: 'd2' }));
      await store.deleteBatch([r1.memory_id]);
      expect(await store.read(r1.memory_id)).toBeNull();
      expect(await store.read(r2.memory_id)).not.toBeNull();
    });

    it('should be a no-op for empty array', async () => {
      await expect(store.deleteBatch([])).resolves.toBeUndefined();
    });
  });

  // ─── 12. updateCompactionWatermark — MAX semantics ─────────────────

  describe('updateCompactionWatermark()', () => {
    it('should update last_compacted_turn_index', async () => {
      await store.createSession({
        session_id: 'sess-c',
        agent_passport_id: 'agent-1',
        namespace: 'ns',
        status: 'active',
      });
      await store.updateCompactionWatermark('sess-c', 10);
      const session = await store.getSession('sess-c');
      expect(session!.last_compacted_turn_index).toBe(10);
    });

    it('should reject lower values (MAX semantics)', async () => {
      await store.createSession({
        session_id: 'sess-c',
        agent_passport_id: 'agent-1',
        namespace: 'ns',
        status: 'active',
      });
      await store.updateCompactionWatermark('sess-c', 10);
      await store.updateCompactionWatermark('sess-c', 5);
      const session = await store.getSession('sess-c');
      expect(session!.last_compacted_turn_index).toBe(10);
    });
  });

  // ─── 13. session create + get ──────────────────────────────────────

  describe('sessions', () => {
    it('should create a session with defaults', async () => {
      const before = Date.now();
      const id = await store.createSession({
        session_id: 'sess-1',
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        status: 'active',
      });
      expect(id).toBe('sess-1');

      const session = await store.getSession('sess-1');
      expect(session).not.toBeNull();
      expect(session!.turn_count).toBe(0);
      expect(session!.total_tokens).toBe(0);
      expect(session!.created_at).toBeGreaterThanOrEqual(before);
      expect(session!.last_activity).toBeGreaterThanOrEqual(before);
    });

    it('should return null for non-existent session', async () => {
      expect(await store.getSession('no-such')).toBeNull();
    });

    // ─── 14. session updateStats ─────────────────────────────────────

    it('should increment session stats', async () => {
      await store.createSession({
        session_id: 'sess-1',
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        status: 'active',
      });
      await store.updateSessionStats('sess-1', 2, 100);
      const session = await store.getSession('sess-1');
      expect(session!.turn_count).toBe(2);
      expect(session!.total_tokens).toBe(100);

      // Increment again to verify additive behavior
      await store.updateSessionStats('sess-1', 3, 50);
      const session2 = await store.getSession('sess-1');
      expect(session2!.turn_count).toBe(5);
      expect(session2!.total_tokens).toBe(150);
    });

    // ─── 15. session close + list ────────────────────────────────────

    it('should close a session with optional summary', async () => {
      await store.createSession({
        session_id: 'sess-1',
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        status: 'active',
      });
      await store.closeSession('sess-1', 'Session summary text');
      const session = await store.getSession('sess-1');
      expect(session!.status).toBe('closed');
      expect(session!.closed_at).toBeDefined();
      expect(session!.summary).toBe('Session summary text');
    });

    it('should list sessions by agent and optional status filter', async () => {
      await store.createSession({
        session_id: 'sess-1', agent_passport_id: 'agent-1',
        namespace: 'ns', status: 'active',
      });
      await store.createSession({
        session_id: 'sess-2', agent_passport_id: 'agent-1',
        namespace: 'ns', status: 'active',
      });
      await store.closeSession('sess-2');

      const active = await store.listSessions('agent-1', ['active']);
      expect(active).toHaveLength(1);

      const all = await store.listSessions('agent-1');
      expect(all).toHaveLength(2);
    });
  });

  // ─── 16. provenance write + getChain ───────────────────────────────

  describe('provenance', () => {
    it('should write and retrieve provenance chain', async () => {
      // Must use real memory_ids because of FK constraint on memory_entries
      const r1 = await store.write(makeEpisodic({ content_hash: 'prov-1' }));
      const now = Date.now();
      const id = await store.writeProvenance({
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        memory_id: r1.memory_id,
        operation: 'create',
        content_hash: 'hash-1',
        prev_hash: null,
        created_at: now,
      });
      expect(id).toBeDefined();

      const chain = await store.getProvenanceChain('agent-1', 'agent:agent-1');
      expect(chain).toHaveLength(1);
      expect(chain[0].record_id).toBe(id);
      expect(chain[0].operation).toBe('create');
    });

    // ─── 17. provenance getForMemory ─────────────────────────────────

    it('should retrieve provenance for a specific memory', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'prov-m1' }));
      const r2 = await store.write(makeEpisodic({ content_hash: 'prov-m2' }));
      const now = Date.now();

      await store.writeProvenance({
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        memory_id: r1.memory_id,
        operation: 'create',
        content_hash: 'hash-1',
        prev_hash: null,
        created_at: now,
      });
      await store.writeProvenance({
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        memory_id: r2.memory_id,
        operation: 'create',
        content_hash: 'hash-2',
        prev_hash: 'hash-1',
        created_at: now + 1,
      });

      const records = await store.getProvenanceForMemory(r1.memory_id);
      expect(records).toHaveLength(1);
      expect(records[0].memory_id).toBe(r1.memory_id);
    });
  });

  // ─── 18. snapshot save + get + list ────────────────────────────────

  describe('snapshots', () => {
    it('should save and retrieve latest snapshot', async () => {
      const id = await store.saveSnapshot({
        agent_passport_id: 'agent-1',
        depin_cid: 'bafy123',
        entry_count: 42,
        chain_head_hash: 'head-hash',
        snapshot_type: 'checkpoint',
        created_at: Date.now(),
      });
      expect(id).toBeDefined();

      const latest = await store.getLatestSnapshot('agent-1');
      expect(latest).not.toBeNull();
      expect(latest!.depin_cid).toBe('bafy123');
    });

    it('should list snapshots in descending created_at order', async () => {
      await store.saveSnapshot({
        agent_passport_id: 'agent-1', depin_cid: 'cid-1',
        entry_count: 10, chain_head_hash: 'h1',
        snapshot_type: 'checkpoint', created_at: 1000,
      });
      await store.saveSnapshot({
        agent_passport_id: 'agent-1', depin_cid: 'cid-2',
        entry_count: 20, chain_head_hash: 'h2',
        snapshot_type: 'checkpoint', created_at: 2000,
      });

      const list = await store.listSnapshots('agent-1');
      expect(list).toHaveLength(2);
      expect(list[0].depin_cid).toBe('cid-2');
      expect(list[1].depin_cid).toBe('cid-1');
    });
  });

  // ─── 19. updateEmbedding + verify embedding_status = 'ready' ──────

  describe('updateEmbedding()', () => {
    it('should set embedding_status to ready and store the model', async () => {
      const r = await store.write(makeEpisodic());
      const emb = makeEmbedding([0.1, 0.2, 0.3]);
      await store.updateEmbedding(r.memory_id, emb, 'text-embedding-3-small');

      const entry = await store.read(r.memory_id);
      expect(entry!.embedding_status).toBe('ready');
      expect(entry!.embedding_model).toBe('text-embedding-3-small');
    });
  });

  // ─── 20. embedding_status query filter ─────────────────────────────

  describe('embedding_status query filter', () => {
    it('should filter by embedding_status', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'p1' }));
      const r2 = await store.write(makeEpisodic({ content_hash: 'p2' }));
      await store.updateEmbedding(r1.memory_id, makeEmbedding([1, 0, 0]), 'test-model');

      const pendingResults = await store.query({
        agent_passport_id: 'agent-1',
        embedding_status: ['pending'],
      });
      expect(pendingResults).toHaveLength(1);
      expect(pendingResults[0].embedding_status).toBe('pending');

      const readyResults = await store.query({
        agent_passport_id: 'agent-1',
        embedding_status: ['ready'],
      });
      expect(readyResults).toHaveLength(1);
      expect(readyResults[0].embedding_status).toBe('ready');
    });
  });

  // ─── 21. memory_lane defaults to 'self' ────────────────────────────

  describe('memory_lane defaults', () => {
    it('should default memory_lane to self when not specified', async () => {
      const input = makeEpisodic();
      delete (input as any).memory_lane;
      const result = await store.write(input);
      const entry = await store.read(result.memory_id);
      expect(entry!.memory_lane).toBe('self');
    });
  });

  // ─── 22. WAL mode verification ─────────────────────────────────────

  describe('WAL mode', () => {
    it('should request WAL mode (in-memory DBs use memory journal mode)', async () => {
      // In-memory databases cannot use WAL mode — SQLite silently falls back to 'memory'.
      // Verify getHealth() reports accurately based on actual journal_mode.
      const health = await store.getHealth();
      // :memory: databases report journal_mode=memory, so walMode should be false
      expect(health.walMode).toBe(false);
    });

    it('should enable WAL mode for file-based databases', async () => {
      // Create a file-based DB in /tmp to verify WAL mode works
      const fs = require('fs');
      const tmpPath = `/tmp/lucid-test-wal-${Date.now()}.db`;
      try {
        const fileStore = new SQLiteMemoryStore(tmpPath);
        const health = await fileStore.getHealth();
        expect(health.walMode).toBe(true);
        fileStore.close();
      } finally {
        // Cleanup
        try { fs.unlinkSync(tmpPath); } catch {}
        try { fs.unlinkSync(tmpPath + '-wal'); } catch {}
        try { fs.unlinkSync(tmpPath + '-shm'); } catch {}
      }
    });
  });

  // ─── 23. count method ──────────────────────────────────────────────

  describe('count()', () => {
    it('should count matching entries', async () => {
      await store.write(makeEpisodic());
      await store.write(makeSemantic());
      await store.write(makeEpisodic({ agent_passport_id: 'agent-2' }));

      const count = await store.count({ agent_passport_id: 'agent-1' });
      expect(count).toBe(2);
    });
  });

  // ─── 24. getStats aggregation ──────────────────────────────────────

  describe('getStats()', () => {
    it('should return zero stats for unknown agent', async () => {
      const stats = await store.getStats('unknown');
      expect(stats.total_entries).toBe(0);
      expect(stats.latest_hash).toBeNull();
    });

    it('should return correct aggregated stats', async () => {
      await store.write(makeEpisodic({ content_hash: 'e1' }));
      await store.write(makeSemantic({ content_hash: 's1' }));

      const stats = await store.getStats('agent-1');
      expect(stats.total_entries).toBe(2);
      expect(stats.by_type.episodic).toBe(1);
      expect(stats.by_type.semantic).toBe(1);
      expect(stats.by_status.active).toBe(2);
      expect(stats.latest_hash).toBeDefined();
      expect(stats.chain_length).toBe(2);
    });
  });

  // ─── 25. outbox write + queryPending + markProcessed ───────────────

  describe('outbox', () => {
    it('should write, query pending, and mark processed', async () => {
      const eventId = await store.writeOutboxEvent({
        event_type: 'memory.created',
        memory_id: 'mem-1',
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        payload_json: JSON.stringify({ test: true }),
      });
      expect(eventId).toBeDefined();

      const pending = await store.queryOutboxPending(10);
      expect(pending).toHaveLength(1);
      expect(pending[0].event_id).toBe(eventId);
      expect(pending[0].event_type).toBe('memory.created');
      expect(pending[0].processed_at).toBeNull();
      expect(pending[0].retry_count).toBe(0);

      await store.markOutboxProcessed(eventId);

      const pendingAfter = await store.queryOutboxPending(10);
      expect(pendingAfter).toHaveLength(0);
    });

    it('should track errors with markOutboxError', async () => {
      const eventId = await store.writeOutboxEvent({
        event_type: 'memory.created',
        memory_id: null,
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        payload_json: '{}',
      });

      await store.markOutboxError(eventId, 'Connection refused');
      await store.markOutboxError(eventId, 'Timeout');

      const pending = await store.queryOutboxPending(10);
      expect(pending).toHaveLength(1);
      expect(pending[0].retry_count).toBe(2);
      expect(pending[0].last_error).toBe('Timeout');
    });
  });

  // ─── 26. getHealth returns correct counts ──────────────────────────

  describe('getHealth()', () => {
    it('should return correct health metrics', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'h1' }));
      const r2 = await store.write(makeEpisodic({ content_hash: 'h2' }));
      await store.updateEmbedding(r1.memory_id, makeEmbedding([1, 0, 0]), 'test-model');

      const health = await store.getHealth();
      expect(health.storeType).toBe('sqlite');
      expect(health.dbPath).toBe(':memory:');
      expect(health.entryCount).toBe(2);
      expect(health.vectorCount).toBe(1);
      expect(health.pendingEmbeddings).toBe(1);
      expect(health.failedEmbeddings).toBe(0);
      expect(health.schemaVersion).toBeGreaterThan(0);
      // :memory: DBs use 'memory' journal mode, not WAL
      expect(typeof health.walMode).toBe('boolean');
      expect(health.capabilities.persistent).toBe(true);
      expect(health.capabilities.vectorSearch).toBe(true);
      expect(health.capabilities.transactions).toBe(true);
    });
  });

  // ─── 27. writeBatch atomicity ──────────────────────────────────────

  describe('writeBatch()', () => {
    it('should write multiple entries atomically and return results', async () => {
      const results = await store.writeBatch([
        makeEpisodic({ content_hash: 'b1' }),
        makeEpisodic({ content_hash: 'b2' }),
        makeEpisodic({ content_hash: 'b3' }),
      ]);
      expect(results).toHaveLength(3);
      expect(results[0].content_hash).toBe('b1');
      expect(results[1].content_hash).toBe('b2');
      expect(results[2].content_hash).toBe('b3');

      // Verify all entries are readable
      for (const r of results) {
        const entry = await store.read(r.memory_id);
        expect(entry).not.toBeNull();
        expect(entry!.status).toBe('active');
      }
    });
  });

  // ─── Additional coverage ───────────────────────────────────────────

  describe('supersede / archive / softDelete', () => {
    it('should set status to superseded', async () => {
      const r = await store.write(makeEpisodic());
      await store.supersede(r.memory_id, 'new-id');
      const entry = await store.read(r.memory_id);
      expect(entry!.status).toBe('superseded');
    });

    it('should set status to archived', async () => {
      const r = await store.write(makeEpisodic());
      await store.archive(r.memory_id);
      const entry = await store.read(r.memory_id);
      expect(entry!.status).toBe('archived');
    });

    it('softDelete should archive and throw for non-existent', async () => {
      const r = await store.write(makeEpisodic());
      await store.softDelete(r.memory_id);
      const entry = await store.read(r.memory_id);
      expect(entry!.status).toBe('archived');

      await expect(store.softDelete('no-such-id')).rejects.toThrow('Memory entry not found');
    });
  });

  describe('getLatestHash()', () => {
    it('should return null when no entries exist', async () => {
      const hash = await store.getLatestHash('agent-1', 'ns');
      expect(hash).toBeNull();
    });

    it('should return content_hash of latest entry', async () => {
      await store.write(makeEpisodic({ content_hash: 'first', namespace: 'ns' }));
      // Small delay to ensure different created_at timestamps
      await new Promise((r) => setTimeout(r, 5));
      await store.write(makeEpisodic({ content_hash: 'second', namespace: 'ns' }));
      const hash = await store.getLatestHash('agent-1', 'ns');
      expect(hash).toBe('second');
    });
  });

  describe('close()', () => {
    it('should close without error', () => {
      // The afterEach will call close() again, so create a fresh store for this test
      const tempStore = new SQLiteMemoryStore(':memory:');
      expect(() => tempStore.close()).not.toThrow();
    });
  });

  describe('queryPendingEmbeddings()', () => {
    it('should return entries with pending embedding status', async () => {
      await store.write(makeEpisodic({ content_hash: 'p1' }));
      await store.write(makeEpisodic({ content_hash: 'p2' }));
      const r3 = await store.write(makeEpisodic({ content_hash: 'p3' }));
      await store.updateEmbedding(r3.memory_id, makeEmbedding([1, 0, 0]), 'test-model');

      const pending = await store.queryPendingEmbeddings(10);
      expect(pending).toHaveLength(2);
      expect(pending.every(e => e.embedding_status === 'pending')).toBe(true);
    });
  });

  describe('recordEmbeddingFailure()', () => {
    it('should increment attempts and store error', async () => {
      const r = await store.write(makeEpisodic());
      await store.recordEmbeddingFailure(r.memory_id, 'API timeout');
      const entry = await store.read(r.memory_id);
      expect(entry!.embedding_attempts).toBe(1);
      expect(entry!.embedding_last_error).toBe('API timeout');
    });
  });
});
