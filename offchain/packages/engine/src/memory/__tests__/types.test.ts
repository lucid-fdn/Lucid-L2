import {
  MemoryType, MemoryStatus, MemoryEntry, EpisodicMemory, SemanticMemory,
  ProceduralMemory, WritableMemoryEntry, isEpisodicMemory, isSemanticMemory,
  isProceduralMemory, MEMORY_TYPES, MEMORY_STATUSES, MEMORY_LANES, getDefaultCompactionConfig,
} from '../types';

describe('Memory Types', () => {
  const baseEntry: MemoryEntry = {
    memory_id: '550e8400-e29b-41d4-a716-446655440000',
    agent_passport_id: 'agent-1',
    type: 'episodic',
    namespace: 'agent:agent-1',
    memory_lane: 'self',
    content: 'Hello world',
    embedding_status: 'pending',
    embedding_attempts: 0,
    status: 'active',
    created_at: Date.now(),
    updated_at: Date.now(),
    metadata: {},
    content_hash: 'abc123',
    prev_hash: null,
  };

  describe('MEMORY_TYPES constant', () => {
    it('should include all 6 types', () => {
      expect(MEMORY_TYPES).toEqual([
        'episodic', 'semantic', 'procedural',
        'entity', 'trust_weighted', 'temporal',
      ]);
    });
  });

  describe('MEMORY_STATUSES constant', () => {
    it('should include all 4 statuses', () => {
      expect(MEMORY_STATUSES).toEqual(['active', 'superseded', 'archived', 'expired']);
    });
  });

  describe('isEpisodicMemory', () => {
    it('should return true for episodic entries', () => {
      const episodic: EpisodicMemory = {
        ...baseEntry,
        type: 'episodic',
        session_id: 'sess-1',
        role: 'user',
        turn_index: 0,
        tokens: 10,
      };
      expect(isEpisodicMemory(episodic)).toBe(true);
    });

    it('should return false for non-episodic entries', () => {
      expect(isEpisodicMemory({ ...baseEntry, type: 'semantic' })).toBe(false);
    });
  });

  describe('isSemanticMemory', () => {
    it('should return true for semantic entries', () => {
      const semantic: SemanticMemory = {
        ...baseEntry,
        type: 'semantic',
        fact: 'The sky is blue',
        confidence: 0.9,
        source_memory_ids: [],
      };
      expect(isSemanticMemory(semantic)).toBe(true);
    });
  });

  describe('isProceduralMemory', () => {
    it('should return true for procedural entries', () => {
      const procedural: ProceduralMemory = {
        ...baseEntry,
        type: 'procedural',
        rule: 'Always greet first',
        trigger: 'conversation_start',
        priority: 1,
        source_memory_ids: [],
      };
      expect(isProceduralMemory(procedural)).toBe(true);
    });
  });

  describe('MEMORY_LANES constant', () => {
    it('should have exactly 4 entries', () => {
      expect(MEMORY_LANES).toHaveLength(4);
    });

    it('should include all expected lanes', () => {
      expect(MEMORY_LANES).toEqual(['self', 'user', 'shared', 'market']);
    });
  });

  describe('getDefaultCompactionConfig', () => {
    it('should return correct defaults', () => {
      const config = getDefaultCompactionConfig();
      expect(config.compact_on_session_close).toBe(true);
      expect(config.hot_window_turns).toBe(50);
      expect(config.hot_window_ms).toBe(86_400_000);
      expect(config.cold_retention_ms).toBe(2_592_000_000);
      expect(config.cold_requires_snapshot).toBe(true);
      expect(config.lane_overrides).toBeUndefined();
    });
  });
});
