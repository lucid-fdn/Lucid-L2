import {
  getMemoryEventBus, resetMemoryEventBus, emitMemoryEvent,
  MemoryCreatedEvent, MemoryDeletedEvent,
} from '../events/memoryEvents';

describe('Memory Event Bus', () => {
  beforeEach(() => resetMemoryEventBus());

  test('typed listener receives correct event', (done) => {
    const bus = getMemoryEventBus();
    bus.on('memory.created', (event) => {
      expect(event.type).toBe('memory.created');
      expect(event.agent_passport_id).toBe('agent-1');
      done();
    });
    emitMemoryEvent({
      type: 'memory.created', timestamp: Date.now(),
      agent_passport_id: 'agent-1', namespace: 'ns',
      entry: {} as any,
    } as MemoryCreatedEvent);
  });

  test('wildcard listener receives all events', () => {
    const bus = getMemoryEventBus();
    const received: any[] = [];
    bus.on('*', (e) => received.push(e));
    emitMemoryEvent({
      type: 'memory.created', timestamp: Date.now(),
      agent_passport_id: 'a', namespace: 'n', entry: {} as any,
    } as MemoryCreatedEvent);
    emitMemoryEvent({
      type: 'memory.deleted', timestamp: Date.now(),
      agent_passport_id: 'a', namespace: 'n', memory_ids: [], content_hashes: [],
    } as MemoryDeletedEvent);
    expect(received.length).toBe(2);
  });

  test('emit without listeners does not throw', () => {
    expect(() => {
      emitMemoryEvent({
        type: 'memory.created', timestamp: Date.now(),
        agent_passport_id: 'a', namespace: 'n', entry: {} as any,
      } as MemoryCreatedEvent);
    }).not.toThrow();
  });

  test('resetMemoryEventBus clears old listeners', () => {
    const bus1 = getMemoryEventBus();
    let called = false;
    bus1.on('memory.created', () => { called = true; });
    resetMemoryEventBus();
    emitMemoryEvent({
      type: 'memory.created', timestamp: Date.now(),
      agent_passport_id: 'a', namespace: 'n', entry: {} as any,
    } as MemoryCreatedEvent);
    expect(called).toBe(false);
  });
});
