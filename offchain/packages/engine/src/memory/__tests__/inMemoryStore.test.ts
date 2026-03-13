import { InMemoryMemoryStore } from '../store/in-memory';
import type { WritableMemoryEntry } from '../types';

function makeEpisodic(overrides: Partial<any> = {}): WritableMemoryEntry & { content_hash: string; prev_hash: string | null } {
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
    content_hash: 'hash-' + Math.random().toString(36).slice(2, 10),
    prev_hash: null,
    ...overrides,
  };
}

function makeSemantic(overrides: Partial<any> = {}): WritableMemoryEntry & { content_hash: string; prev_hash: string | null } {
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
    content_hash: 'hash-' + Math.random().toString(36).slice(2, 10),
    prev_hash: null,
    ...overrides,
  };
}

describe('InMemoryMemoryStore', () => {
  let store: InMemoryMemoryStore;

  beforeEach(() => {
    store = new InMemoryMemoryStore();
  });

  // ─── write ──────────────────────────────────────────────────────

  describe('write()', () => {
    it('should assign memory_id and return write result', async () => {
      const result = await store.write(makeEpisodic({ content_hash: 'abc', prev_hash: null }));
      expect(result.memory_id).toBeDefined();
      expect(result.content_hash).toBe('abc');
      expect(result.prev_hash).toBeNull();
    });

    it('should set status to active and assign timestamps', async () => {
      const before = Date.now();
      const result = await store.write(makeEpisodic());
      const entry = await store.read(result.memory_id);
      expect(entry).not.toBeNull();
      expect(entry!.status).toBe('active');
      expect(entry!.created_at).toBeGreaterThanOrEqual(before);
      expect(entry!.updated_at).toBeGreaterThanOrEqual(before);
    });

    it('should NOT auto-assign turn_index (store does not handle it)', async () => {
      const result = await store.write(makeEpisodic());
      const entry = await store.read(result.memory_id);
      // turn_index is not set by store — it should be whatever was passed in (undefined if omitted from Writable)
      expect(entry).not.toBeNull();
    });
  });

  // ─── writeBatch ─────────────────────────────────────────────────

  describe('writeBatch()', () => {
    it('should write multiple entries and return results', async () => {
      const results = await store.writeBatch([
        makeEpisodic({ content_hash: 'h1' }),
        makeEpisodic({ content_hash: 'h2' }),
        makeEpisodic({ content_hash: 'h3' }),
      ]);
      expect(results).toHaveLength(3);
      expect(results[0].content_hash).toBe('h1');
      expect(results[1].content_hash).toBe('h2');
      expect(results[2].content_hash).toBe('h3');
    });
  });

  // ─── read ───────────────────────────────────────────────────────

  describe('read()', () => {
    it('should return null for non-existent entry', async () => {
      const entry = await store.read('non-existent-id');
      expect(entry).toBeNull();
    });

    it('should return the written entry', async () => {
      const result = await store.write(makeEpisodic({ content: 'test content' }));
      const entry = await store.read(result.memory_id);
      expect(entry).not.toBeNull();
      expect(entry!.content).toBe('test content');
      expect(entry!.type).toBe('episodic');
    });
  });

  // ─── query ──────────────────────────────────────────────────────

  describe('query()', () => {
    it('should default status filter to [active]', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'a1' }));
      await store.write(makeEpisodic({ content_hash: 'a2' }));
      await store.archive(r1.memory_id);

      const results = await store.query({ agent_passport_id: 'agent-1' });
      expect(results).toHaveLength(1);
    });

    it('should filter by type', async () => {
      await store.write(makeEpisodic());
      await store.write(makeSemantic());

      const results = await store.query({
        agent_passport_id: 'agent-1',
        types: ['semantic'],
      });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('semantic');
    });

    it('should filter by namespace', async () => {
      await store.write(makeEpisodic({ namespace: 'ns-1' }));
      await store.write(makeEpisodic({ namespace: 'ns-2' }));

      const results = await store.query({
        agent_passport_id: 'agent-1',
        namespace: 'ns-1',
      });
      expect(results).toHaveLength(1);
    });

    it('should default limit to 50', async () => {
      for (let i = 0; i < 60; i++) {
        await store.write(makeEpisodic({ content_hash: `h-${i}` }));
      }
      const results = await store.query({ agent_passport_id: 'agent-1' });
      expect(results).toHaveLength(50);
    });

    it('should use deterministic ordering (created_at ASC, memory_id ASC)', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'first' }));
      const r2 = await store.write(makeEpisodic({ content_hash: 'second' }));

      const results = await store.query({ agent_passport_id: 'agent-1' });
      expect(results[0].memory_id).toBe(r1.memory_id);
      expect(results[1].memory_id).toBe(r2.memory_id);
    });

    it('should support order_dir=desc', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'first' }));
      const r2 = await store.write(makeEpisodic({ content_hash: 'second' }));

      const results = await store.query({
        agent_passport_id: 'agent-1',
        order_dir: 'desc',
      });
      expect(results[0].memory_id).toBe(r2.memory_id);
      expect(results[1].memory_id).toBe(r1.memory_id);
    });

    it('should filter by session_id', async () => {
      await store.write(makeEpisodic({ session_id: 'sess-A' }));
      await store.write(makeEpisodic({ session_id: 'sess-B' }));

      const results = await store.query({
        agent_passport_id: 'agent-1',
        session_id: 'sess-A',
      });
      expect(results).toHaveLength(1);
    });

    it('should support offset for pagination', async () => {
      await store.write(makeEpisodic({ content_hash: 'h1' }));
      await store.write(makeEpisodic({ content_hash: 'h2' }));
      await store.write(makeEpisodic({ content_hash: 'h3' }));

      const results = await store.query({
        agent_passport_id: 'agent-1',
        offset: 1,
        limit: 1,
      });
      expect(results).toHaveLength(1);
      expect(results[0].content_hash).toBe('h2');
    });

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

  // ─── count ──────────────────────────────────────────────────────

  describe('count()', () => {
    it('should count matching entries', async () => {
      await store.write(makeEpisodic());
      await store.write(makeSemantic());
      await store.write(makeEpisodic({ agent_passport_id: 'agent-2' }));

      const count = await store.count({ agent_passport_id: 'agent-1' });
      expect(count).toBe(2);
    });
  });

  // ─── supersede / archive / softDelete ───────────────────────────

  describe('supersede()', () => {
    it('should set status to superseded', async () => {
      const r = await store.write(makeEpisodic());
      await store.supersede(r.memory_id, 'new-id');
      const entry = await store.read(r.memory_id);
      expect(entry!.status).toBe('superseded');
    });
  });

  describe('archive()', () => {
    it('should set status to archived', async () => {
      const r = await store.write(makeEpisodic());
      await store.archive(r.memory_id);
      const entry = await store.read(r.memory_id);
      expect(entry!.status).toBe('archived');
    });
  });

  describe('archiveBatch()', () => {
    it('should archive multiple entries', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'a1' }));
      const r2 = await store.write(makeEpisodic({ content_hash: 'a2' }));
      await store.archiveBatch([r1.memory_id, r2.memory_id]);
      expect((await store.read(r1.memory_id))!.status).toBe('archived');
      expect((await store.read(r2.memory_id))!.status).toBe('archived');
    });
  });

  describe('softDelete()', () => {
    it('should set status to archived', async () => {
      const r = await store.write(makeEpisodic());
      await store.softDelete(r.memory_id);
      const entry = await store.read(r.memory_id);
      expect(entry!.status).toBe('archived');
    });

    it('should throw for non-existent entry', async () => {
      await expect(store.softDelete('no-such-id')).rejects.toThrow('Memory entry not found');
    });
  });

  // ─── Provenance ─────────────────────────────────────────────────

  describe('provenance', () => {
    it('should write and retrieve provenance records', async () => {
      const now = Date.now();
      const id = await store.writeProvenance({
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        memory_id: 'mem-1',
        operation: 'create',
        content_hash: 'hash-1',
        prev_hash: null,
        created_at: now,
      });
      expect(id).toBeDefined();

      const chain = await store.getProvenanceChain('agent-1', 'agent:agent-1');
      expect(chain).toHaveLength(1);
      expect(chain[0].record_id).toBe(id);
    });

    it('should retrieve provenance for a specific memory', async () => {
      const now = Date.now();
      await store.writeProvenance({
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        memory_id: 'mem-1',
        operation: 'create',
        content_hash: 'hash-1',
        prev_hash: null,
        created_at: now,
      });
      await store.writeProvenance({
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        memory_id: 'mem-2',
        operation: 'create',
        content_hash: 'hash-2',
        prev_hash: 'hash-1',
        created_at: now + 1,
      });

      const records = await store.getProvenanceForMemory('mem-1');
      expect(records).toHaveLength(1);
      expect(records[0].memory_id).toBe('mem-1');
    });
  });

  // ─── getLatestHash ──────────────────────────────────────────────

  describe('getLatestHash()', () => {
    it('should return null when no entries exist', async () => {
      const hash = await store.getLatestHash('agent-1', 'ns');
      expect(hash).toBeNull();
    });

    it('should return content_hash of the latest entry by deterministic order', async () => {
      await store.write(makeEpisodic({ content_hash: 'first', namespace: 'ns' }));
      await store.write(makeEpisodic({ content_hash: 'second', namespace: 'ns' }));
      const hash = await store.getLatestHash('agent-1', 'ns');
      expect(hash).toBe('second');
    });
  });

  // ─── Sessions ───────────────────────────────────────────────────

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

    it('should update session stats', async () => {
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
    });

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

  // ─── Embeddings ─────────────────────────────────────────────────

  describe('updateEmbedding()', () => {
    it('should set embedding and model on entry', async () => {
      const r = await store.write(makeEpisodic());
      const emb = [0.1, 0.2, 0.3];
      await store.updateEmbedding(r.memory_id, emb, 'text-embedding-3-small');
      const entry = await store.read(r.memory_id);
      expect(entry!.embedding).toEqual(emb);
      expect(entry!.embedding_model).toBe('text-embedding-3-small');
    });
  });

  // ─── Snapshots ──────────────────────────────────────────────────

  describe('snapshots', () => {
    it('should save and retrieve snapshots', async () => {
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

  // ─── getEntriesSince ────────────────────────────────────────────

  describe('getEntriesSince()', () => {
    it('should return entries created at or after the given timestamp', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'old' }));
      const entry1 = await store.read(r1.memory_id);
      const threshold = entry1!.created_at + 1;

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 5));
      await store.write(makeEpisodic({ content_hash: 'new' }));

      const entries = await store.getEntriesSince('agent-1', threshold);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries.every((e) => e.created_at >= threshold)).toBe(true);
    });
  });

  // ─── getStats ───────────────────────────────────────────────────

  describe('getStats()', () => {
    it('should return zero stats for unknown agent', async () => {
      const stats = await store.getStats('unknown');
      expect(stats.total_entries).toBe(0);
      expect(stats.latest_hash).toBeNull();
    });

    it('should return correct stats', async () => {
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

  // ─── nearestByEmbedding ─────────────────────────────────────────

  describe('nearestByEmbedding()', () => {
    it('should return entries sorted by cosine similarity', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'e1' }));
      const r2 = await store.write(makeEpisodic({ content_hash: 'e2' }));
      await store.updateEmbedding(r1.memory_id, [1, 0, 0], 'test-model');
      await store.updateEmbedding(r2.memory_id, [0.9, 0.1, 0], 'test-model');
      const results = await store.nearestByEmbedding([1, 0, 0], 'agent-1', undefined, undefined, 10, 0.5);
      expect(results.length).toBe(2);
      expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
    });

    it('should filter by similarity threshold', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'e1' }));
      await store.updateEmbedding(r1.memory_id, [0, 1, 0], 'test-model');
      const results = await store.nearestByEmbedding([1, 0, 0], 'agent-1', undefined, undefined, 10, 0.9);
      expect(results.length).toBe(0);
    });

    it('should filter by namespace and types', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'e1', namespace: 'ns-a' }));
      const r2 = await store.write(makeSemantic({ content_hash: 's1', namespace: 'ns-a' }));
      await store.updateEmbedding(r1.memory_id, [1, 0, 0], 'test-model');
      await store.updateEmbedding(r2.memory_id, [1, 0, 0], 'test-model');
      const results = await store.nearestByEmbedding([1, 0, 0], 'agent-1', 'ns-a', ['semantic'], 10, 0.5);
      expect(results.length).toBe(1);
      expect(results[0].type).toBe('semantic');
    });

    it('should skip entries without embeddings', async () => {
      await store.write(makeEpisodic({ content_hash: 'no-embed' }));
      const results = await store.nearestByEmbedding([1, 0, 0], 'agent-1', undefined, undefined, 10, 0.0);
      expect(results.length).toBe(0);
    });

    it('should filter by lanes', async () => {
      const r1 = await store.write(makeEpisodic({ content_hash: 'self1', memory_lane: 'self' }));
      const r2 = await store.write(makeEpisodic({ content_hash: 'market1', memory_lane: 'market' }));
      await store.updateEmbedding(r1.memory_id, [1, 0, 0], 'test-model');
      await store.updateEmbedding(r2.memory_id, [1, 0, 0], 'test-model');
      const results = await store.nearestByEmbedding([1, 0, 0], 'agent-1', undefined, undefined, 10, 0.5, ['market']);
      expect(results.length).toBe(1);
      expect((results[0] as any).memory_lane).toBe('market');
    });
  });

  // ─── deleteBatch ────────────────────────────────────────────────

  describe('deleteBatch()', () => {
    it('should hard-delete entries', async () => {
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

  // ─── updateCompactionWatermark ──────────────────────────────────

  describe('updateCompactionWatermark()', () => {
    it('should update last_compacted_turn_index on session', async () => {
      await store.createSession({
        session_id: 'sess-c', agent_passport_id: 'agent-1',
        namespace: 'ns', status: 'active',
      });
      await store.updateCompactionWatermark('sess-c', 10);
      const session = await store.getSession('sess-c');
      expect(session!.last_compacted_turn_index).toBe(10);
    });
  });
});
