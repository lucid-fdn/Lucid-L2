import type { IMemoryStore } from '../store/interface';
import type { IEmbeddingProvider } from './interface';

export interface EmbeddingWorkerConfig {
  batchSize: number;       // default 20
  pollIntervalMs: number;  // default 2000
  maxRetries: number;      // default 3
}

export class EmbeddingWorker {
  private running = false;
  private interval: NodeJS.Timeout | null = null;
  private tickPending = false;
  private onCreated: (() => void) | null = null;

  constructor(
    private store: IMemoryStore,
    private provider: IEmbeddingProvider,
    private config: EmbeddingWorkerConfig,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    // Immediate trigger via event bus
    try {
      const { getMemoryEventBus } = require('../events/memoryEvents');
      const bus = getMemoryEventBus();
      this.onCreated = () => this.enqueue();
      bus.on('memory.created', this.onCreated);
    } catch {
      // events module may not exist yet — polling-only mode
    }
    // Polling backstop
    this.interval = setInterval(() => this.tick(), this.config.pollIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    if (this.onCreated) {
      try {
        const { getMemoryEventBus } = require('../events/memoryEvents');
        getMemoryEventBus().off('memory.created', this.onCreated);
      } catch {}
      this.onCreated = null;
    }
  }

  private enqueue(): void {
    if (!this.tickPending) {
      this.tickPending = true;
      queueMicrotask(() => { this.tickPending = false; this.tick(); });
    }
  }

  async tick(): Promise<void> {
    if (!this.running) return;
    const pending = await this.store.queryPendingEmbeddings(this.config.batchSize);
    // Filter by maxRetries in worker (not store)
    const retryable = pending.filter(e => (e as any).embedding_attempts < this.config.maxRetries);
    if (retryable.length === 0) return;

    const texts = retryable.map(e => e.content);
    try {
      const results = await this.provider.embedBatch(texts);
      for (let i = 0; i < retryable.length; i++) {
        await this.store.updateEmbedding(
          retryable[i].memory_id,
          results[i].embedding,
          results[i].model,
        );
      }
    } catch (err: any) {
      for (const entry of retryable) {
        await this.store.recordEmbeddingFailure(entry.memory_id, err.message || 'Unknown error');
      }
    }
  }
}
