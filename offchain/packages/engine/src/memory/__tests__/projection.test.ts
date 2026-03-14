import { shouldProject, getDefaultProjectionPolicy } from '../projection/policies';
import { MemoryProjectionService } from '../projection/service';
import { InMemoryMemoryStore } from '../store/in-memory';
import { resetMemoryEventBus } from '../events/memoryEvents';
import type { IProjectionSink, ProjectableEntry } from '../projection/sinks/interface';
import type { MemoryEntry } from '../types';

// Mock sink for testing
function createMockSink(): IProjectionSink & { projected: ProjectableEntry[]; removed: string[][] } {
  const sink = {
    name: 'mock',
    projected: [] as ProjectableEntry[],
    removed: [] as string[][],
    async project(entry: ProjectableEntry) { sink.projected.push(entry); },
    async projectBatch(entries: ProjectableEntry[]) { sink.projected.push(...entries); },
    async remove(ids: string[]) { sink.removed.push(ids); },
    async healthCheck() { return true; },
  };
  return sink;
}

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    memory_id: 'm1', agent_passport_id: 'agent-1', type: 'semantic',
    namespace: 'ns', memory_lane: 'shared', content: 'fact',
    status: 'active', created_at: Date.now(), updated_at: Date.now(),
    metadata: {}, content_hash: 'h1', prev_hash: null,
    embedding_status: 'ready', embedding_attempts: 0,
    ...overrides,
  } as MemoryEntry;
}

describe('shouldProject', () => {
  const policy = getDefaultProjectionPolicy();

  test('projects shared/market lanes', () => {
    expect(shouldProject(makeEntry({ memory_lane: 'shared' }), policy)).toBe(true);
    expect(shouldProject(makeEntry({ memory_lane: 'market' }), policy)).toBe(true);
  });

  test('blocks self/user lanes', () => {
    expect(shouldProject(makeEntry({ memory_lane: 'self' }), policy)).toBe(false);
    expect(shouldProject(makeEntry({ memory_lane: 'user' }), policy)).toBe(false);
  });

  test('blocks episodic type', () => {
    expect(shouldProject(makeEntry({ type: 'episodic' }), policy)).toBe(false);
  });
});

describe('MemoryProjectionService', () => {
  let store: InMemoryMemoryStore;
  let sink: ReturnType<typeof createMockSink>;

  beforeEach(() => {
    resetMemoryEventBus();
    store = new InMemoryMemoryStore();
    sink = createMockSink();
  });

  test('processOutbox projects matching entries', async () => {
    await store.writeOutboxEvent({
      event_type: 'memory.created',
      memory_id: 'm1',
      agent_passport_id: 'agent-1',
      namespace: 'ns',
      payload_json: JSON.stringify(makeEntry({ memory_lane: 'shared', type: 'semantic' })),
    });

    const service = new MemoryProjectionService(store, [sink]);
    await service.processOutbox();

    expect(sink.projected.length).toBe(1);
    expect(sink.projected[0].idempotency_key).toBeDefined();
  });

  test('processOutbox skips self-lane entries', async () => {
    await store.writeOutboxEvent({
      event_type: 'memory.created',
      memory_id: 'm2',
      agent_passport_id: 'agent-1',
      namespace: 'ns',
      payload_json: JSON.stringify(makeEntry({ memory_lane: 'self' })),
    });

    const service = new MemoryProjectionService(store, [sink]);
    await service.processOutbox();

    expect(sink.projected.length).toBe(0);
    // Outbox should still be marked processed
    const pending = await store.queryOutboxPending(10);
    expect(pending.length).toBe(0);
  });

  test('sink failure records error, does not crash', async () => {
    const failSink: IProjectionSink = {
      name: 'fail',
      async project() { throw new Error('sink down'); },
      async projectBatch() { throw new Error('sink down'); },
      async remove() {},
      async healthCheck() { return false; },
    };

    await store.writeOutboxEvent({
      event_type: 'memory.created',
      memory_id: 'm3',
      agent_passport_id: 'agent-1',
      namespace: 'ns',
      payload_json: JSON.stringify(makeEntry({ memory_lane: 'shared' })),
    });

    const service = new MemoryProjectionService(store, [failSink]);
    await service.processOutbox();

    // Outbox should have error recorded — event stays pending
    const pending = await store.queryOutboxPending(10);
    expect(pending.length).toBe(1);
    expect(pending[0].last_error).toContain('sink down');
  });

  test('delete event propagates to sink remove', async () => {
    await store.writeOutboxEvent({
      event_type: 'memory.deleted',
      memory_id: 'm4',
      agent_passport_id: 'agent-1',
      namespace: 'ns',
      payload_json: JSON.stringify({ memory_id: 'm4' }),
    });

    const service = new MemoryProjectionService(store, [sink]);
    await service.processOutbox();

    expect(sink.removed.length).toBe(1);
    expect(sink.removed[0]).toContain('m4');
  });

  test('outbox idempotency — reprocessing same event does not duplicate', async () => {
    await store.writeOutboxEvent({
      event_type: 'memory.created',
      memory_id: 'm5',
      agent_passport_id: 'agent-1',
      namespace: 'ns',
      payload_json: JSON.stringify(makeEntry({ memory_id: 'm5', memory_lane: 'shared' })),
    });

    const service = new MemoryProjectionService(store, [sink]);
    await service.processOutbox();
    await service.processOutbox(); // second call

    expect(sink.projected.length).toBe(1); // only once
  });

  test('outbox retry — sink fails, retry succeeds', async () => {
    let callCount = 0;
    const retrySink: IProjectionSink & { projected: ProjectableEntry[] } = {
      name: 'retry',
      projected: [] as ProjectableEntry[],
      async project(entry: ProjectableEntry) {
        callCount++;
        if (callCount === 1) throw new Error('temporary failure');
        this.projected.push(entry);
      },
      async projectBatch(entries) { for (const e of entries) await this.project(e); },
      async remove() {},
      async healthCheck() { return true; },
    };

    await store.writeOutboxEvent({
      event_type: 'memory.created',
      memory_id: 'm6',
      agent_passport_id: 'agent-1',
      namespace: 'ns',
      payload_json: JSON.stringify(makeEntry({ memory_id: 'm6', memory_lane: 'shared' })),
    });

    const service = new MemoryProjectionService(store, [retrySink]);
    await service.processOutbox(); // fails
    await service.processOutbox(); // retries and succeeds

    expect(retrySink.projected.length).toBe(1);
  });

  test('stop removes listeners and clears interval', () => {
    const service = new MemoryProjectionService(store, [sink]);
    service.start();
    service.stop();
    // Should not throw
  });
});
