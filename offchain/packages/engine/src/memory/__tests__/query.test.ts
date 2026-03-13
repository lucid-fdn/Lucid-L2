import { buildQuery } from '../query/retrieval';
import { rankByRecency, combinedScore } from '../query/ranking';
import { applyContentFilter } from '../query/filters';
import type { MemoryEntry } from '../types';
import type { RecallRequest } from '../types';

describe('Query Module', () => {
  describe('buildQuery', () => {
    it('should convert RecallRequest to MemoryQuery', () => {
      const request: RecallRequest = {
        query: 'test',
        agent_passport_id: 'agent-1',
        namespace: 'agent:agent-1',
        types: ['semantic'],
        limit: 10,
      };
      const q = buildQuery(request);
      expect(q.agent_passport_id).toBe('agent-1');
      expect(q.namespace).toBe('agent:agent-1');
      expect(q.types).toEqual(['semantic']);
      expect(q.limit).toBe(10);
      expect(q.status).toEqual(['active']);
    });

    it('should include archived when requested', () => {
      const q = buildQuery({
        query: 'test', agent_passport_id: 'a',
        include_archived: true,
      });
      expect(q.status).toEqual(['active', 'archived']);
    });
  });

  describe('rankByRecency', () => {
    it('should score newer entries higher', () => {
      const now = Date.now();
      const entries: MemoryEntry[] = [
        { memory_id: 'old', created_at: now - 86400000, updated_at: now, content_hash: 'h1', prev_hash: null } as any,
        { memory_id: 'new', created_at: now, updated_at: now, content_hash: 'h2', prev_hash: 'h1' } as any,
      ];
      const ranked = rankByRecency(entries, now);
      expect(ranked.find(r => r.memory_id === 'new')!.score).toBeGreaterThan(
        ranked.find(r => r.memory_id === 'old')!.score
      );
    });
  });

  describe('applyContentFilter', () => {
    it('should filter entries by substring match', () => {
      const entries: MemoryEntry[] = [
        { memory_id: '1', content: 'The sky is blue', type: 'semantic' } as any,
        { memory_id: '2', content: 'Grass is green', type: 'semantic' } as any,
      ];
      const filtered = applyContentFilter(entries, 'sky');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].memory_id).toBe('1');
    });

    it('should be case insensitive', () => {
      const entries: MemoryEntry[] = [
        { memory_id: '1', content: 'Hello World' } as any,
      ];
      expect(applyContentFilter(entries, 'hello')).toHaveLength(1);
    });
  });

  describe('combinedScore', () => {
    it('should blend recency and relevance', () => {
      const score = combinedScore(0.8, 0.6);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should weight recency and relevance', () => {
      const highRecency = combinedScore(1.0, 0.5);
      const highRelevance = combinedScore(0.5, 1.0);
      // Both should be valid scores
      expect(highRecency).toBeGreaterThan(0);
      expect(highRelevance).toBeGreaterThan(0);
    });
  });
});
