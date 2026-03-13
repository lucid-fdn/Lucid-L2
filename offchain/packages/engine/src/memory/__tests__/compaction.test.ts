import { CompactionPipeline } from '../compactionPipeline';
import { InMemoryMemoryStore } from '../store/in-memory';
import type { CompactionConfig } from '../types';
import { getDefaultCompactionConfig } from '../types';

const mockExtraction = {
  extractOnSessionClose: jest.fn().mockResolvedValue(undefined),
  maybeExtract: jest.fn().mockResolvedValue(undefined),
};

describe('CompactionPipeline', () => {
  let store: InMemoryMemoryStore;
  let pipeline: CompactionPipeline;
  let config: CompactionConfig;

  beforeEach(() => {
    store = new InMemoryMemoryStore();
    config = { ...getDefaultCompactionConfig(), hot_window_turns: 5, hot_window_ms: 0 };
    pipeline = new CompactionPipeline(store, mockExtraction as any, null, config);
    jest.clearAllMocks();
  });

  it('should archive episodic entries beyond hot boundary', async () => {
    const sessionId = 'sess-1';
    await store.createSession({
      session_id: sessionId, agent_passport_id: 'agent-1',
      namespace: 'ns', status: 'closed',
    });

    // Write 10 episodic entries
    for (let i = 0; i < 10; i++) {
      await store.write({
        agent_passport_id: 'agent-1', type: 'episodic', namespace: 'ns',
        content: `Turn ${i}`, metadata: {}, session_id: sessionId,
        role: 'user', tokens: 5, turn_index: i,
        content_hash: `hash-${i}`, prev_hash: i > 0 ? `hash-${i - 1}` : null,
        memory_lane: 'self',
      } as any);
    }

    const result = await pipeline.compact('agent-1', 'ns', { mode: 'warm' });
    expect(result.episodic_archived).toBeGreaterThan(0);
    expect(result.extraction_triggered).toBe(true);
    expect(mockExtraction.extractOnSessionClose).toHaveBeenCalled();
  });

  it('should update compaction watermark after warm compaction', async () => {
    await store.createSession({
      session_id: 'sess-1', agent_passport_id: 'agent-1',
      namespace: 'ns', status: 'closed',
    });

    for (let i = 0; i < 10; i++) {
      await store.write({
        agent_passport_id: 'agent-1', type: 'episodic', namespace: 'ns',
        content: `Turn ${i}`, metadata: {}, session_id: 'sess-1',
        role: 'user', tokens: 5, turn_index: i,
        content_hash: `hash-${i}`, prev_hash: i > 0 ? `hash-${i - 1}` : null,
        memory_lane: 'self',
      } as any);
    }

    await pipeline.compact('agent-1', 'ns', { mode: 'warm' });
    const session = await store.getSession('sess-1');
    expect(session!.last_compacted_turn_index).toBeGreaterThan(-1);
  });

  it('should skip already-compacted ranges (idempotency)', async () => {
    await store.createSession({
      session_id: 'sess-1', agent_passport_id: 'agent-1',
      namespace: 'ns', status: 'closed',
    });
    // Pre-set watermark to simulate prior compaction
    await store.updateCompactionWatermark('sess-1', 4);

    for (let i = 0; i < 10; i++) {
      await store.write({
        agent_passport_id: 'agent-1', type: 'episodic', namespace: 'ns',
        content: `Turn ${i}`, metadata: {}, session_id: 'sess-1',
        role: 'user', tokens: 5, turn_index: i,
        content_hash: `hash-${i}`, prev_hash: null,
        memory_lane: 'self',
      } as any);
    }

    const result = await pipeline.compact('agent-1', 'ns', { mode: 'warm' });
    // Should only compact turns 5-9 that are beyond hot window, not 0-4
    expect(result.episodic_archived).toBeLessThan(10);
  });
});
