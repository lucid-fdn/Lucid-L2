import { ExtractionPipeline } from '../extraction';
import { MemoryService } from '../service';
import { InMemoryMemoryStore } from '../store/in-memory';
import { MemoryACLEngine } from '../acl';
import type { MemoryServiceConfig } from '../types';

const testConfig: MemoryServiceConfig = {
  extraction_enabled: true,
  extraction_batch_size: 3,
  extraction_debounce_ms: 100,
  trigger_on_session_close: true,
  embedding_enabled: false,
  embedding_model: 'text-embedding-3-small',
  provenance_enabled: false,
  receipts_enabled: false,
  max_episodic_window: 50,
  max_semantic_per_agent: 1000,
  compaction_idle_timeout_ms: 1800000,
};

describe('ExtractionPipeline', () => {
  let pipeline: ExtractionPipeline;
  let service: MemoryService;
  let store: InMemoryMemoryStore;

  beforeEach(() => {
    store = new InMemoryMemoryStore();
    const acl = new MemoryACLEngine();
    service = new MemoryService(store, acl, testConfig);
    pipeline = new ExtractionPipeline(service, store, testConfig);
  });

  describe('per-session lock', () => {
    it('should prevent overlapping extractions for same session', async () => {
      // The lock should be acquired before extraction and released after
      const sessionId = await service.startSession('agent-1', 'agent:agent-1');

      // Write enough episodics to trigger extraction
      for (let i = 0; i < 3; i++) {
        await service.addEpisodic('agent-1', {
          session_id: sessionId, namespace: 'agent:agent-1',
          role: 'user', content: `Turn ${i}`, tokens: 5,
        });
      }

      // Mock the LLM call to return empty results
      jest.spyOn(pipeline as any, 'callLLM').mockResolvedValue({ facts: [], rules: [] });

      // Trigger two extractions concurrently
      const p1 = pipeline.maybeExtract(sessionId, 'agent-1', 'agent:agent-1');
      const p2 = pipeline.maybeExtract(sessionId, 'agent-1', 'agent:agent-1');

      await Promise.all([p1, p2]);

      // Only one should have called LLM
      expect((pipeline as any).callLLM).toHaveBeenCalledTimes(1);
    });
  });

  describe('debounce', () => {
    it('should skip extraction if called within debounce window', async () => {
      const sessionId = await service.startSession('agent-1', 'agent:agent-1');
      for (let i = 0; i < 3; i++) {
        await service.addEpisodic('agent-1', {
          session_id: sessionId, namespace: 'agent:agent-1',
          role: 'user', content: `Turn ${i}`, tokens: 5,
        });
      }

      jest.spyOn(pipeline as any, 'callLLM').mockResolvedValue({ facts: [], rules: [] });

      await pipeline.maybeExtract(sessionId, 'agent-1', 'agent:agent-1');
      await pipeline.maybeExtract(sessionId, 'agent-1', 'agent:agent-1');

      expect((pipeline as any).callLLM).toHaveBeenCalledTimes(1);
    });
  });

  describe('batch size threshold', () => {
    it('should only extract when batch size threshold is met', async () => {
      const sessionId = await service.startSession('agent-1', 'agent:agent-1');

      jest.spyOn(pipeline as any, 'callLLM').mockResolvedValue({ facts: [], rules: [] });

      // Only 2 entries (threshold is 3)
      for (let i = 0; i < 2; i++) {
        await service.addEpisodic('agent-1', {
          session_id: sessionId, namespace: 'agent:agent-1',
          role: 'user', content: `Turn ${i}`, tokens: 5,
        });
      }

      await pipeline.maybeExtract(sessionId, 'agent-1', 'agent:agent-1');
      expect((pipeline as any).callLLM).not.toHaveBeenCalled();
    });
  });

  describe('extractOnSessionClose', () => {
    it('should extract on session close regardless of batch size', async () => {
      const sessionId = await service.startSession('agent-1', 'agent:agent-1');
      await service.addEpisodic('agent-1', {
        session_id: sessionId, namespace: 'agent:agent-1',
        role: 'user', content: 'Hello', tokens: 5,
      });

      jest.spyOn(pipeline as any, 'callLLM').mockResolvedValue({
        facts: [{ fact: 'User said hello', confidence: 0.9 }],
        rules: [],
      });

      await pipeline.extractOnSessionClose(sessionId, 'agent-1', 'agent:agent-1');

      expect((pipeline as any).callLLM).toHaveBeenCalledTimes(1);
    });
  });

  describe('fact extraction', () => {
    it('should create semantic entries from extracted facts', async () => {
      const sessionId = await service.startSession('agent-1', 'agent:agent-1');
      for (let i = 0; i < 3; i++) {
        await service.addEpisodic('agent-1', {
          session_id: sessionId, namespace: 'agent:agent-1',
          role: 'user', content: `Important fact ${i}`, tokens: 5,
        });
      }

      jest.spyOn(pipeline as any, 'callLLM').mockResolvedValue({
        facts: [{ fact: 'User discussed important facts', confidence: 0.85 }],
        rules: [{ rule: 'Always discuss facts', trigger: 'topic_change', priority: 1 }],
      });

      await pipeline.maybeExtract(sessionId, 'agent-1', 'agent:agent-1');

      // Check that semantic and procedural entries were created
      const semantics = await store.query({
        agent_passport_id: 'agent-1', types: ['semantic'],
      });
      expect(semantics.length).toBeGreaterThanOrEqual(1);

      const procedurals = await store.query({
        agent_passport_id: 'agent-1', types: ['procedural'],
      });
      expect(procedurals.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('idempotency', () => {
    it('should not re-process the same entries', async () => {
      const sessionId = await service.startSession('agent-1', 'agent:agent-1');
      for (let i = 0; i < 3; i++) {
        await service.addEpisodic('agent-1', {
          session_id: sessionId, namespace: 'agent:agent-1',
          role: 'user', content: `Turn ${i}`, tokens: 5,
        });
      }

      const mockLLM = jest.spyOn(pipeline as any, 'callLLM').mockResolvedValue({ facts: [], rules: [] });

      await pipeline.maybeExtract(sessionId, 'agent-1', 'agent:agent-1');

      // Reset debounce by waiting
      (pipeline as any).lastRun.delete(sessionId);

      await pipeline.maybeExtract(sessionId, 'agent-1', 'agent:agent-1');

      // Should only call once because entries haven't changed
      expect(mockLLM).toHaveBeenCalledTimes(1);
    });
  });
});
