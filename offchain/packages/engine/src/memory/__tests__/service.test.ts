import { MemoryService } from '../service';
import { InMemoryMemoryStore } from '../store/in-memory';
import { MemoryACLEngine } from '../acl';
import type { MemoryServiceConfig } from '../types';
import type { EpisodicMemory } from '../types';

jest.mock('../../receipt/receiptService', () => ({
  createMemoryReceipt: jest.fn().mockReturnValue({
    receipt_type: 'memory',
    run_id: 'mock-run',
    receipt_hash: 'mock-receipt-hash',
    receipt_signature: 'mock-sig',
    signer_pubkey: 'mock-pub',
    signer_type: 'orchestrator',
    body: {},
    _mmr_leaf_index: 0,
  }),
  createBatchedEpisodicReceipt: jest.fn().mockReturnValue({
    receipt_type: 'memory',
    run_id: 'mock-batch-run',
    receipt_hash: 'mock-batch-hash',
    receipt_signature: 'mock-sig',
    signer_pubkey: 'mock-pub',
    signer_type: 'orchestrator',
    body: {},
    _mmr_leaf_index: 1,
  }),
}));

const testConfig: MemoryServiceConfig = {
  extraction_enabled: false,
  extraction_batch_size: 5,
  extraction_debounce_ms: 2000,
  trigger_on_session_close: false,
  embedding_enabled: false,
  embedding_model: 'text-embedding-3-small',
  provenance_enabled: true,
  receipts_enabled: false,
  max_episodic_window: 50,
  max_semantic_per_agent: 1000,
  compaction_idle_timeout_ms: 1800000,
  recall_similarity_threshold: 0.65,
  recall_candidate_pool_size: 50,
  recall_min_results: 3,
  recall_similarity_weight: 0.55,
  recall_recency_weight: 0.20,
  recall_type_weight: 0.15,
  recall_quality_weight: 0.10,
  extraction_max_tokens: 8000,
  extraction_max_facts: 20,
  extraction_max_rules: 10,
};

describe('MemoryService', () => {
  let service: MemoryService;
  let store: InMemoryMemoryStore;

  beforeEach(() => {
    store = new InMemoryMemoryStore();
    const acl = new MemoryACLEngine();
    service = new MemoryService(store, acl, testConfig);
  });

  describe('constructor', () => {
    it('should throw if recall weights do not sum to 1.0', () => {
      expect(() => new MemoryService(store, new MemoryACLEngine(), {
        ...testConfig,
        recall_similarity_weight: 0.5,
        recall_recency_weight: 0.5,
        recall_type_weight: 0.5,
        recall_quality_weight: 0.5,
      })).toThrow('Recall weights must sum to 1.0');
    });
  });

  describe('addEpisodic', () => {
    it('should write an episodic entry with auto-assigned turn_index', async () => {
      const sessionId = await service.startSession('agent-1', 'agent:agent-1');
      const result = await service.addEpisodic('agent-1', {
        session_id: sessionId,
        namespace: 'agent:agent-1',
        role: 'user',
        content: 'Hello',
        tokens: 5,
      });
      expect(result.memory_id).toBeDefined();
      expect(result.content_hash).toMatch(/^[a-f0-9]{64}$/);
      const entry = await store.read(result.memory_id);
      expect(entry).not.toBeNull();
      expect(entry!.type).toBe('episodic');
    });

    it('should auto-increment turn_index per session', async () => {
      const sessionId = await service.startSession('agent-1', 'agent:agent-1');
      await service.addEpisodic('agent-1', {
        session_id: sessionId, namespace: 'agent:agent-1',
        role: 'user', content: 'Turn 1', tokens: 5,
      });
      await service.addEpisodic('agent-1', {
        session_id: sessionId, namespace: 'agent:agent-1',
        role: 'assistant', content: 'Turn 2', tokens: 10,
      });
      const entries = await store.query({
        agent_passport_id: 'agent-1',
        session_id: sessionId,
        types: ['episodic'],
        order_by: 'created_at',
        order_dir: 'asc',
      });
      expect(entries).toHaveLength(2);
      expect((entries[0] as EpisodicMemory).turn_index).toBe(0);
      expect((entries[1] as EpisodicMemory).turn_index).toBe(1);
    });
  });

  describe('addSemantic', () => {
    it('should write a semantic entry with provenance', async () => {
      const result = await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1',
        content: 'The sky is blue',
        fact: 'The sky is blue',
        confidence: 0.95,
        source_memory_ids: [],
      });
      expect(result.memory_id).toBeDefined();
      const provenance = await store.getProvenanceForMemory(result.memory_id);
      expect(provenance).toHaveLength(1);
      expect(provenance[0].operation).toBe('create');
    });
  });

  describe('addProcedural', () => {
    it('should write a procedural entry', async () => {
      const result = await service.addProcedural('agent-1', {
        namespace: 'agent:agent-1',
        content: 'Always greet first',
        rule: 'Always greet first',
        trigger: 'conversation_start',
        priority: 1,
        source_memory_ids: [],
      });
      expect(result.memory_id).toBeDefined();
    });
  });

  describe('hash chain', () => {
    it('should link entries via prev_hash', async () => {
      const r1 = await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1', content: 'Fact 1',
        fact: 'F1', confidence: 1, source_memory_ids: [],
      });
      const r2 = await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1', content: 'Fact 2',
        fact: 'F2', confidence: 0.9, source_memory_ids: [],
      });
      expect(r1.prev_hash).toBeNull();
      expect(r2.prev_hash).toBe(r1.content_hash);
    });
  });

  describe('verifyChainIntegrity', () => {
    it('should verify a valid chain', async () => {
      await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1', content: 'F1',
        fact: 'F1', confidence: 1, source_memory_ids: [],
      });
      await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1', content: 'F2',
        fact: 'F2', confidence: 0.9, source_memory_ids: [],
      });
      const result = await service.verifyChainIntegrity('agent-1', 'agent:agent-1');
      expect(result.valid).toBe(true);
      expect(result.chain_length).toBe(2);
    });
  });

  describe('ACL enforcement', () => {
    it('should reject writes to another agents namespace', async () => {
      await expect(service.addSemantic('agent-1', {
        namespace: 'agent:agent-2', content: 'Sneaky',
        fact: 'S', confidence: 1, source_memory_ids: [],
      })).rejects.toThrow(/permission/i);
    });
  });

  describe('sessions', () => {
    it('should start and close a session', async () => {
      const sessionId = await service.startSession('agent-1', 'agent:agent-1');
      expect(sessionId).toBeDefined();
      await service.closeSession('agent-1', sessionId, 'Summary');
      const session = await store.getSession(sessionId);
      expect(session!.status).toBe('closed');
      expect(session!.summary).toBe('Summary');
    });
  });

  describe('recall', () => {
    it('should return matching entries ordered by recency', async () => {
      await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1', content: 'ETH balance is 5.0',
        fact: 'ETH balance is 5.0', confidence: 0.9, source_memory_ids: [],
      });
      await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1', content: 'User prefers dark mode',
        fact: 'User prefers dark mode', confidence: 0.8, source_memory_ids: [],
      });
      const response = await service.recall('agent-1', {
        query: 'ETH',
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        types: ['semantic'],
      });
      expect(response.memories.length).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('should return stats for an agent', async () => {
      await service.addSemantic('agent-1', {
        namespace: 'agent:agent-1', content: 'F',
        fact: 'F', confidence: 1, source_memory_ids: [],
      });
      const stats = await service.getStats('agent-1');
      expect(stats.total_entries).toBe(1);
    });
  });

  describe('addEntity', () => {
    it('should write an entity entry', async () => {
      const result = await service.addEntity('agent-1', {
        namespace: 'agent:agent-1', content: 'Vitalik Buterin',
        entity_name: 'Vitalik Buterin', entity_type: 'person',
        attributes: {}, relationships: [],
      });
      expect(result.memory_id).toBeDefined();
      const entry = await store.read(result.memory_id);
      expect(entry!.type).toBe('entity');
    });
  });

  describe('addTrustWeighted', () => {
    it('should write a trust-weighted entry', async () => {
      const result = await service.addTrustWeighted('agent-1', {
        namespace: 'agent:agent-1', content: 'Trust agent-2',
        source_agent_passport_id: 'agent-2',
        trust_score: 0.8, decay_factor: 0.1, weighted_relevance: 0.7,
      });
      expect(result.memory_id).toBeDefined();
    });
  });

  describe('addTemporal', () => {
    it('should write a temporal entry', async () => {
      const now = Date.now();
      const result = await service.addTemporal('agent-1', {
        namespace: 'agent:agent-1', content: 'ETH at $4000',
        valid_from: now - 86400000, valid_to: null, recorded_at: now,
      });
      expect(result.memory_id).toBeDefined();
    });
  });
});
