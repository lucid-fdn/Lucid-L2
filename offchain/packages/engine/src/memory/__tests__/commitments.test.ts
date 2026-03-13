import { computeMemoryHash, buildHashPreimage, verifyChainIntegrity } from '../commitments';
import { InMemoryMemoryStore } from '../store/in-memory';
import type { IMemoryStore } from '../store/interface';

describe('Commitments', () => {
  describe('computeMemoryHash', () => {
    it('should compute SHA-256 of canonical JSON preimage for episodic type', () => {
      const hash = computeMemoryHash({
        type: 'episodic',
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        content: 'Hello world',
        session_id: 'sess-1',
        role: 'user',
        turn_index: 0,
        tokens: 5,
      });
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different content', () => {
      const base = {
        type: 'semantic' as const,
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        content: 'Fact A',
        fact: 'Fact A',
        confidence: 0.9,
        source_memory_ids: [],
      };
      const h1 = computeMemoryHash(base);
      const h2 = computeMemoryHash({ ...base, content: 'Fact B', fact: 'Fact B' });
      expect(h1).not.toBe(h2);
    });

    it('should produce deterministic hashes', () => {
      const input = {
        type: 'procedural' as const,
        agent_passport_id: 'a',
        namespace: 'agent:a',
        content: 'Rule',
        rule: 'Always greet',
        trigger: 'start',
        priority: 1,
        source_memory_ids: [],
      };
      expect(computeMemoryHash(input)).toBe(computeMemoryHash(input));
    });
  });

  describe('buildHashPreimage', () => {
    it('should include agent_passport_id, namespace, type + type-specific fields for episodic', () => {
      const preimage = buildHashPreimage({
        type: 'episodic',
        agent_passport_id: 'a',
        namespace: 'ns',
        content: 'Hello',
        session_id: 's1',
        role: 'user',
        turn_index: 0,
        tokens: 5,
        tool_calls: [{ tool_name: 'search', arguments: { q: 'test' } }],
      });
      expect(preimage).toHaveProperty('agent_passport_id', 'a');
      expect(preimage).toHaveProperty('namespace', 'ns');
      expect(preimage).toHaveProperty('type', 'episodic');
      expect(preimage).toHaveProperty('content', 'Hello');
      expect(preimage).toHaveProperty('session_id', 's1');
      expect(preimage).toHaveProperty('role', 'user');
      expect(preimage).toHaveProperty('turn_index', 0);
      expect(preimage).toHaveProperty('tokens', 5);
      expect(preimage).toHaveProperty('tool_calls');
      expect(preimage).not.toHaveProperty('metadata');
      expect(preimage).not.toHaveProperty('status');
    });

    it('should include fact, confidence, source_memory_ids, supersedes for semantic', () => {
      const preimage = buildHashPreimage({
        type: 'semantic',
        agent_passport_id: 'a',
        namespace: 'ns',
        content: 'Fact',
        fact: 'The sky is blue',
        confidence: 0.95,
        source_memory_ids: ['m1', 'm2'],
        supersedes: ['old-1'],
      });
      expect(preimage).toHaveProperty('fact', 'The sky is blue');
      expect(preimage).toHaveProperty('confidence', 0.95);
      expect(preimage).toHaveProperty('source_memory_ids', ['m1', 'm2']);
      expect(preimage).toHaveProperty('supersedes', ['old-1']);
    });
  });

  describe('verifyChainIntegrity', () => {
    let store: IMemoryStore;

    beforeEach(() => {
      store = new InMemoryMemoryStore();
    });

    it('should verify a valid chain of 2 entries', async () => {
      const h1 = computeMemoryHash({
        type: 'semantic', agent_passport_id: 'a', namespace: 'ns',
        content: 'F1', fact: 'F1', confidence: 1, source_memory_ids: [],
      });
      await store.write({
        agent_passport_id: 'a', type: 'semantic', namespace: 'ns',
        memory_lane: 'self', content: 'F1', metadata: {}, fact: 'F1', confidence: 1,
        source_memory_ids: [], content_hash: h1, prev_hash: null,
      });

      const h2 = computeMemoryHash({
        type: 'semantic', agent_passport_id: 'a', namespace: 'ns',
        content: 'F2', fact: 'F2', confidence: 0.9, source_memory_ids: [],
      });
      await store.write({
        agent_passport_id: 'a', type: 'semantic', namespace: 'ns',
        memory_lane: 'self', content: 'F2', metadata: {}, fact: 'F2', confidence: 0.9,
        source_memory_ids: [], content_hash: h2, prev_hash: h1,
      });

      const result = await verifyChainIntegrity(store, 'a', 'ns');
      expect(result.valid).toBe(true);
      expect(result.chain_length).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect tampered content', async () => {
      const h1 = computeMemoryHash({
        type: 'semantic', agent_passport_id: 'a', namespace: 'ns',
        content: 'Original', fact: 'Original', confidence: 1, source_memory_ids: [],
      });
      await store.write({
        agent_passport_id: 'a', type: 'semantic', namespace: 'ns',
        memory_lane: 'self', content: 'Tampered', metadata: {}, fact: 'Tampered', confidence: 1,
        source_memory_ids: [], content_hash: h1, prev_hash: null,
      });

      const result = await verifyChainIntegrity(store, 'a', 'ns');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
