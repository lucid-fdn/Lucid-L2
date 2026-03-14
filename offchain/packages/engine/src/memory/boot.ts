/**
 * Memory system boot — starts embedding worker and projection service.
 * Call `startMemorySystem()` during server startup after all routes are mounted.
 * Call `stopMemorySystem()` during graceful shutdown.
 */

import type { EmbeddingWorker } from './embedding/worker';
import type { MemoryProjectionService } from './projection/service';

let embeddingWorker: EmbeddingWorker | null = null;
let projectionService: MemoryProjectionService | null = null;

export interface MemoryBootConfig {
  /** Start the embedding worker? Requires MEMORY_EMBEDDING_PROVIDER != 'none'. */
  embeddingEnabled?: boolean;
  /** Start the projection service? Requires MEMORY_PROJECTION_ENABLED=true. */
  projectionEnabled?: boolean;
  /** Embedding worker config */
  embeddingBatchSize?: number;
  embeddingPollMs?: number;
  embeddingMaxRetries?: number;
}

/**
 * Start memory background services.
 * Safe to call even if services are already running (idempotent).
 */
export function startMemorySystem(config?: MemoryBootConfig): void {
  const embeddingEnabled = config?.embeddingEnabled
    ?? (process.env.MEMORY_EMBEDDING_PROVIDER !== undefined && process.env.MEMORY_EMBEDDING_PROVIDER !== 'none');
  const projectionEnabled = config?.projectionEnabled
    ?? (process.env.MEMORY_PROJECTION_ENABLED === 'true');

  // --- Embedding Worker ---
  if (embeddingEnabled && !embeddingWorker) {
    try {
      const { getEmbeddingProvider } = require('./embedding');
      const { EmbeddingWorker: Worker } = require('./embedding/worker');
      const { getMemoryStore } = require('./store');

      const provider = getEmbeddingProvider();
      if (provider) {
        const store = getMemoryStore();
        embeddingWorker = new Worker(store, provider, {
          batchSize: config?.embeddingBatchSize ?? parseInt(process.env.MEMORY_EMBEDDING_BATCH_SIZE || '20', 10),
          pollIntervalMs: config?.embeddingPollMs ?? parseInt(process.env.MEMORY_EMBEDDING_POLL_MS || '2000', 10),
          maxRetries: config?.embeddingMaxRetries ?? parseInt(process.env.MEMORY_EMBEDDING_MAX_RETRIES || '3', 10),
        });
        embeddingWorker.start();
        console.log(`[memory] Embedding worker started (provider=${provider.modelName}, poll=${config?.embeddingPollMs ?? 2000}ms)`);
      }
    } catch (err) {
      console.warn('[memory] Failed to start embedding worker:', err);
    }
  }

  // --- Projection Service ---
  if (projectionEnabled && !projectionService) {
    try {
      const { MemoryProjectionService: ProjService } = require('./projection/service');
      const { getDefaultProjectionPolicy } = require('./projection/policies');
      const { getMemoryStore } = require('./store');
      const store = getMemoryStore();

      // Build sinks from MEMORY_PROJECTION_SINKS env
      const sinkNames = (process.env.MEMORY_PROJECTION_SINKS || '').split(',').filter(Boolean);
      const sinks: any[] = [];
      for (const name of sinkNames) {
        if (name === 'postgres') {
          const { PostgresSink } = require('./projection/sinks/postgres');
          sinks.push(new PostgresSink());
        }
        // Future: search, depin-catalog
      }

      if (sinks.length > 0) {
        projectionService = new ProjService(store, sinks, getDefaultProjectionPolicy());
        projectionService.start();
        console.log(`[memory] Projection service started (sinks=${sinkNames.join(',')})`);
      } else {
        console.warn('[memory] MEMORY_PROJECTION_ENABLED=true but no sinks configured (MEMORY_PROJECTION_SINKS)');
      }
    } catch (err) {
      console.warn('[memory] Failed to start projection service:', err);
    }
  }
}

/**
 * Stop memory background services.
 * Safe to call even if services are not running (idempotent).
 */
export function stopMemorySystem(): void {
  if (embeddingWorker) {
    embeddingWorker.stop();
    embeddingWorker = null;
    console.log('[memory] Embedding worker stopped');
  }
  if (projectionService) {
    projectionService.stop();
    projectionService = null;
    console.log('[memory] Projection service stopped');
  }
}

/** Check if memory system is running */
export function isMemorySystemRunning(): { embedding: boolean; projection: boolean } {
  return {
    embedding: embeddingWorker !== null,
    projection: projectionService !== null,
  };
}
