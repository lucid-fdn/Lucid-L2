import { getMemoryEventBus } from '../events/memoryEvents';
import { shouldProject, getDefaultProjectionPolicy, ProjectionPolicy } from './policies';
import type { IProjectionSink, ProjectableEntry } from './sinks/interface';
import type { IMemoryStore } from '../store/interface';
import type { MemoryEntry } from '../types';

export class MemoryProjectionService {
  private sinks: IProjectionSink[];
  private policy: ProjectionPolicy;
  private interval: NodeJS.Timeout | null = null;
  private handlers: Array<(...args: any[]) => void> = [];

  constructor(
    private store: IMemoryStore,
    sinks: IProjectionSink[],
    policy?: ProjectionPolicy,
  ) {
    this.sinks = sinks;
    this.policy = policy || getDefaultProjectionPolicy();
  }

  start(): void {
    const bus = getMemoryEventBus();
    const handler = () => this.processOutbox().catch(() => {});
    bus.on('memory.created', handler);
    bus.on('memory.deleted', handler);
    bus.on('memory.embedding.ready', handler);
    this.handlers = [handler];
    this.interval = setInterval(() => this.processOutbox().catch(() => {}), 5000);
  }

  stop(): void {
    const bus = getMemoryEventBus();
    for (const h of this.handlers) {
      bus.off('memory.created', h);
      bus.off('memory.deleted', h);
      bus.off('memory.embedding.ready', h);
    }
    this.handlers = [];
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  async processOutbox(): Promise<void> {
    const events = await this.store.queryOutboxPending(50);
    for (const event of events) {
      try {
        const entry = JSON.parse(event.payload_json);
        if (event.event_type === 'memory.deleted') {
          for (const sink of this.sinks) {
            await sink.remove([entry.memory_id || event.memory_id]);
          }
        } else if (shouldProject(entry as MemoryEntry, this.policy)) {
          const projectable = this.toProjectable(entry);
          for (const sink of this.sinks) {
            await sink.project(projectable);
          }
        }
        await this.store.markOutboxProcessed(event.event_id);
      } catch (err: any) {
        await this.store.markOutboxError(event.event_id, err.message || String(err));
      }
    }
  }

  private toProjectable(entry: any): ProjectableEntry {
    const base = { ...entry };
    if (this.policy.redact_episodic_content && entry.type === 'episodic') {
      base.content = '[redacted]';
    }
    if (!this.policy.project_embeddings) {
      delete base.embedding;
    }
    base.idempotency_key = `${entry.memory_id}:${entry.content_hash}`;
    return base as ProjectableEntry;
  }
}
