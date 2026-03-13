import { classifyQueryIntent, type QueryIntent } from '../recall/intentClassifier';
import { rerankCandidates } from '../recall/reranker';
import type { MemoryEntry } from '../types';

describe('classifyQueryIntent', () => {
  it('should classify fact/preference queries as semantic', () => {
    const intent = classifyQueryIntent('what does the user prefer');
    expect(intent.type_boosts.semantic).toBeGreaterThan(0);
  });

  it('should classify policy/rule queries as procedural', () => {
    const intent = classifyQueryIntent('how should I respond to greetings');
    expect(intent.type_boosts.procedural).toBeGreaterThan(0);
  });

  it('should classify recent/session queries as episodic', () => {
    const intent = classifyQueryIntent('what just happened');
    expect(intent.type_boosts.episodic).toBeGreaterThan(0);
  });

  it('should return zero boosts for generic queries', () => {
    const intent = classifyQueryIntent('xyz random thing');
    expect(intent.type_boosts.episodic).toBe(0);
    expect(intent.type_boosts.semantic).toBe(0);
    expect(intent.type_boosts.procedural).toBe(0);
  });

  it('should classify market queries with market lane boost', () => {
    const intent = classifyQueryIntent('what is the ETH price');
    expect(intent.lane_boosts.market).toBeGreaterThan(0);
  });

  it('should classify user preference with user lane boost', () => {
    const intent = classifyQueryIntent('user preference for dark mode');
    expect(intent.lane_boosts.user).toBeGreaterThan(0);
  });
});

describe('rerankCandidates', () => {
  const now = Date.now();

  function makeCandidate(overrides: Partial<MemoryEntry & { similarity: number }> = {}): MemoryEntry & { similarity: number } {
    return {
      memory_id: 'mem-' + Math.random().toString(36).slice(2, 6),
      agent_passport_id: 'agent-1',
      type: 'semantic',
      namespace: 'ns',
      content: 'test',
      status: 'active',
      created_at: now,
      updated_at: now,
      metadata: {},
      content_hash: 'h',
      prev_hash: null,
      memory_lane: 'self',
      similarity: 0.8,
      ...overrides,
    } as any;
  }

  const defaultWeights = {
    similarity_weight: 0.55,
    recency_weight: 0.20,
    type_weight: 0.15,
    quality_weight: 0.10,
  };

  it('should score higher similarity candidates higher', () => {
    const candidates = [
      makeCandidate({ similarity: 0.5 }),
      makeCandidate({ similarity: 0.9 }),
    ];
    const results = rerankCandidates(candidates, 'generic query', defaultWeights);
    expect(results[0].similarity).toBe(0.9);
  });

  it('should apply intent overfitting guard: type_bonus capped at similarity', () => {
    const candidates = [
      makeCandidate({ similarity: 0.1, type: 'semantic' }),
    ];
    const results = rerankCandidates(candidates, 'what does user prefer', defaultWeights);
    // The type bonus (0.3) should be capped to similarity (0.1)
    expect(results[0].score).toBeLessThan(0.55 * 0.1 + 0.20 * 1 + 0.15 * 0.3 + 0.10 * 0.5);
  });

  it('should apply lane overfitting guard', () => {
    const candidates = [
      makeCandidate({ similarity: 0.1, memory_lane: 'market' } as any),
    ];
    const results = rerankCandidates(candidates, 'what is the ETH price', defaultWeights);
    expect(results[0].score).toBeDefined();
  });

  it('should return entries sorted by final score descending', () => {
    const candidates = [
      makeCandidate({ similarity: 0.5, created_at: now - 86400000 }),
      makeCandidate({ similarity: 0.9, created_at: now }),
    ];
    const results = rerankCandidates(candidates, 'test', defaultWeights);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });
});
