import { MockEmbeddingProvider } from '../embedding/mock';
import { EmbeddingWorker } from '../embedding/worker';
import { InMemoryMemoryStore } from '../store/in-memory';
import type { WritableMemoryEntry } from '../types';

function makeSemantic(
  overrides: Partial<any> = {},
): WritableMemoryEntry & { content_hash: string; prev_hash: string | null } {
  return {
    agent_passport_id: 'agent-1',
    type: 'semantic' as const,
    namespace: 'ns',
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

/**
 * Helper: create an EmbeddingWorker and set running=true so tick() executes
 * without starting the interval/event-bus wiring that start() would create.
 */
function createTestWorker(
  store: InMemoryMemoryStore,
  provider: any,
  config = { batchSize: 20, pollIntervalMs: 60_000, maxRetries: 3 },
): EmbeddingWorker {
  const worker = new EmbeddingWorker(store, provider, config);
  // Bypass start() to avoid timers/event-bus in tests, but enable tick().
  (worker as any).running = true;
  return worker;
}

// ─── MockEmbeddingProvider ──────────────────────────────────────────

describe('MockEmbeddingProvider', () => {
  const provider = new MockEmbeddingProvider();

  test('deterministic — same input produces same vector', async () => {
    const r1 = await provider.embed('hello world');
    const r2 = await provider.embed('hello world');
    expect(r1.embedding).toEqual(r2.embedding);
  });

  test('different input produces different vector', async () => {
    const r1 = await provider.embed('hello');
    const r2 = await provider.embed('goodbye');
    expect(r1.embedding).not.toEqual(r2.embedding);
  });

  test('output is unit vector (normalized)', async () => {
    const r = await provider.embed('test');
    const norm = Math.sqrt(r.embedding.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 5);
  });

  test('dimensions = 1536', async () => {
    const r = await provider.embed('test');
    expect(r.embedding.length).toBe(1536);
  });

  test('embedBatch processes multiple inputs', async () => {
    const results = await provider.embedBatch(['a', 'b', 'c']);
    expect(results).toHaveLength(3);
    expect(results[0].model).toBe('mock-embedding-v1');
  });
});

// ─── EmbeddingWorker ────────────────────────────────────────────────

describe('EmbeddingWorker', () => {
  let store: InMemoryMemoryStore;
  let provider: MockEmbeddingProvider;

  beforeEach(() => {
    store = new InMemoryMemoryStore();
    provider = new MockEmbeddingProvider();
  });

  test('processes pending entries on tick', async () => {
    const result = await store.write(makeSemantic({ content: 'The sky is blue' }));

    const worker = createTestWorker(store, provider);
    await worker.tick();

    const entry = await store.read(result.memory_id);
    expect((entry as any).embedding_status).toBe('ready');
    expect(entry!.embedding).toBeDefined();
    expect(entry!.embedding!.length).toBe(1536);
  });

  test('handles provider failure — records error, stays pending', async () => {
    const failProvider = {
      dimensions: 1536,
      modelName: 'fail',
      embed: async () => { throw new Error('API down'); },
      embedBatch: async () => { throw new Error('API down'); },
    };

    await store.write(makeSemantic({ content: 'test', content_hash: 'h2' }));

    const worker = createTestWorker(store, failProvider);
    await worker.tick();

    const pending = await store.queryPendingEmbeddings(10);
    expect(pending.length).toBe(1);
    expect((pending[0] as any).embedding_attempts).toBe(1);
  });

  test('skips when no pending entries', async () => {
    const worker = createTestWorker(store, provider);
    await worker.tick(); // should not throw
  });

  test('batch processing — multiple entries in one tick', async () => {
    for (let i = 0; i < 3; i++) {
      await store.write(makeSemantic({
        content: `fact ${i}`,
        content_hash: `batch-h${i}`,
      }));
    }

    const worker = createTestWorker(store, provider);
    await worker.tick();

    const pending = await store.queryPendingEmbeddings(10);
    expect(pending.length).toBe(0); // all processed
  });

  test('respects maxRetries — stops retrying after limit', async () => {
    const failProvider = {
      dimensions: 1536,
      modelName: 'fail',
      embed: async () => { throw new Error('API down'); },
      embedBatch: async () => { throw new Error('API down'); },
    };

    await store.write(makeSemantic({ content: 'retry-me', content_hash: 'h-retry' }));

    const worker = createTestWorker(store, failProvider, {
      batchSize: 20, pollIntervalMs: 60_000, maxRetries: 2,
    });

    // Tick twice to reach maxRetries
    await worker.tick();
    await worker.tick();

    // Third tick: entry has embedding_attempts=2 which equals maxRetries,
    // so the worker's filter (< maxRetries) should skip it.
    await worker.tick();

    const pending = await store.queryPendingEmbeddings(10);
    expect(pending.length).toBe(1); // still pending (not "ready")
    expect((pending[0] as any).embedding_attempts).toBe(2); // stopped at 2, not 3
  });
});

// ─── getEmbeddingProvider factory ───────────────────────────────────

describe('getEmbeddingProvider factory', () => {
  const originalEnv = process.env.MEMORY_EMBEDDING_PROVIDER;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.MEMORY_EMBEDDING_PROVIDER = originalEnv;
    } else {
      delete process.env.MEMORY_EMBEDDING_PROVIDER;
    }
    jest.resetModules();
  });

  test('none returns null', () => {
    process.env.MEMORY_EMBEDDING_PROVIDER = 'none';
    jest.isolateModules(() => {
      const { getEmbeddingProvider } = require('../embedding');
      expect(getEmbeddingProvider()).toBeNull();
    });
  });

  test('mock returns MockEmbeddingProvider', () => {
    process.env.MEMORY_EMBEDDING_PROVIDER = 'mock';
    jest.isolateModules(() => {
      const { getEmbeddingProvider } = require('../embedding');
      const p = getEmbeddingProvider();
      expect(p).toBeDefined();
      expect(p!.modelName).toBe('mock-embedding-v1');
    });
  });
});
