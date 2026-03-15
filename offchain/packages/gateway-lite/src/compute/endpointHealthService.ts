/**
 * Endpoint Health Service
 *
 * Polls RunPod serverless endpoint health and provides availability status
 * for routing and capacity decisions. This replaces per-GPU heartbeats with
 * endpoint-level health monitoring (v0.2 Fluid Compute architecture).
 *
 * @module endpointHealthService
 */

import type { CapacityBucket } from '../../../engine/src/shared/types/fluidCompute';
import { logger } from '../../../engine/src/shared/lib/logger';

/**
 * Configuration for the health service
 */
export interface HealthServiceConfig {
  /** Polling interval in milliseconds (default: 30000) */
  pollIntervalMs?: number;
  /** Health check timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** RunPod API key (required for actual API calls) */
  runpodApiKey?: string;
  /** Whether to use mock mode (default: true for development) */
  mockMode?: boolean;
}

/**
 * Internal health data from RunPod API
 */
export interface InternalHealthData {
  workers_ready: number;
  workers_running: number;
  workers_initializing: number;
  workers_throttled: number;
  jobs_in_queue: number;
  jobs_in_progress: number;
  jobs_completed_24h: number;
  jobs_failed_24h: number;
}

/**
 * Health status for a single endpoint
 */
export interface EndpointStatus {
  endpointId: string;
  capacityBucket: string;
  health: InternalHealthData;
  lastChecked: Date;
  consecutiveFailures: number;
}

/**
 * Aggregated health statistics
 */
export interface HealthStats {
  totalEndpoints: number;
  healthyEndpoints: number;
  degradedEndpoints: number;
  unhealthyEndpoints: number;
  totalAvailableWorkers: number;
  totalRunningWorkers: number;
  totalQueuedJobs: number;
}

/**
 * RunPod health API response shape
 */
interface RunPodHealthResponse {
  jobs?: {
    completed?: number;
    failed?: number;
    inProgress?: number;
    inQueue?: number;
    retried?: number;
  };
  workers?: {
    idle?: number;
    initializing?: number;
    ready?: number;
    running?: number;
    throttled?: number;
  };
}

const RUNPOD_REST_URL = 'https://api.runpod.io/v2';

/**
 * Endpoint Health Service
 *
 * Provides health monitoring for RunPod serverless endpoints.
 * In mock mode, simulates healthy endpoints for development.
 */
export class EndpointHealthService {
  private config: Required<HealthServiceConfig>;
  private endpoints: Map<string, EndpointStatus>;
  private bucketMap: Map<string, CapacityBucket>;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(config: HealthServiceConfig = {}) {
    this.config = {
      pollIntervalMs: config.pollIntervalMs ?? 30000,
      timeoutMs: config.timeoutMs ?? 10000,
      runpodApiKey: config.runpodApiKey ?? '',
      mockMode: config.mockMode ?? true,
    };
    this.endpoints = new Map();
    this.bucketMap = new Map();
  }

  /**
   * Register an endpoint for health monitoring
   */
  registerEndpoint(endpointId: string, bucket: CapacityBucket): void {
    this.bucketMap.set(endpointId, bucket);
    this.endpoints.set(endpointId, {
      endpointId,
      capacityBucket: bucket.name,
      health: this.createInitialHealth(bucket),
      lastChecked: new Date(),
      consecutiveFailures: 0,
    });
    logger.info(`[EndpointHealth] Registered endpoint ${endpointId} (${bucket.name})`);
  }

  /**
   * Unregister an endpoint from health monitoring
   */
  unregisterEndpoint(endpointId: string): void {
    this.endpoints.delete(endpointId);
    this.bucketMap.delete(endpointId);
    logger.info(`[EndpointHealth] Unregistered endpoint ${endpointId}`);
  }

  /**
   * Start periodic health polling
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Initial poll
    this.pollAllEndpoints();

    // Start periodic polling
    this.pollTimer = setInterval(() => {
      this.pollAllEndpoints();
    }, this.config.pollIntervalMs);

    logger.info(`[EndpointHealth] Started polling (interval: ${this.config.pollIntervalMs}ms)`);
  }

  /**
   * Stop periodic health polling
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    logger.info('[EndpointHealth] Stopped polling');
  }

  /**
   * Get health status for a specific endpoint
   */
  getEndpointHealth(endpointId: string): EndpointStatus | undefined {
    return this.endpoints.get(endpointId);
  }

  /**
   * Get health status for a capacity bucket
   */
  getBucketHealth(bucketName: string): EndpointStatus | undefined {
    for (const status of this.endpoints.values()) {
      if (status.capacityBucket === bucketName) {
        return status;
      }
    }
    return undefined;
  }

  /**
   * Get all endpoint statuses
   */
  getAllEndpoints(): EndpointStatus[] {
    return Array.from(this.endpoints.values());
  }

  /**
   * Get aggregated health statistics
   */
  getStats(): HealthStats {
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;
    let totalAvailable = 0;
    let totalRunning = 0;
    let totalQueued = 0;

    for (const status of this.endpoints.values()) {
      const h = status.health;

      // Classify endpoint health
      if (h.workers_running >= 0 && status.consecutiveFailures === 0) {
        if (h.jobs_in_queue > 50) {
          degraded++;
        } else {
          healthy++;
        }
      } else if (status.consecutiveFailures >= 3) {
        unhealthy++;
      } else {
        degraded++;
      }

      totalAvailable += h.workers_ready;
      totalRunning += h.workers_running;
      totalQueued += h.jobs_in_queue;
    }

    return {
      totalEndpoints: this.endpoints.size,
      healthyEndpoints: healthy,
      degradedEndpoints: degraded,
      unhealthyEndpoints: unhealthy,
      totalAvailableWorkers: totalAvailable,
      totalRunningWorkers: totalRunning,
      totalQueuedJobs: totalQueued,
    };
  }

  /**
   * Check if an endpoint is available for routing
   */
  isEndpointAvailable(endpointId: string): boolean {
    const status = this.endpoints.get(endpointId);
    if (!status) return false;

    // Available if:
    // 1. Not too many consecutive failures
    // 2. Has ready workers OR queue isn't too deep
    return (
      status.consecutiveFailures < 3 &&
      (status.health.workers_ready > 0 || status.health.jobs_in_queue < 100)
    );
  }

  /**
   * Get estimated wait time for an endpoint (in milliseconds)
   */
  getEstimatedWaitMs(endpointId: string): number {
    const status = this.endpoints.get(endpointId);
    if (!status) return -1;

    const h = status.health;

    // If workers are ready, minimal wait
    if (h.workers_ready > 0) {
      return 100; // ~100ms for job dispatch
    }

    // If workers initializing, estimate cold start
    if (h.workers_initializing > 0) {
      return 30000; // ~30s cold start
    }

    // Based on queue depth and running workers
    if (h.workers_running > 0) {
      const jobsPerWorker = h.jobs_in_queue / h.workers_running;
      return Math.round(jobsPerWorker * 5000); // ~5s per job estimate
    }

    // Cold start from zero
    return 60000; // ~60s worst case
  }

  /**
   * Poll all registered endpoints
   */
  private async pollAllEndpoints(): Promise<void> {
    const promises = Array.from(this.endpoints.keys()).map((endpointId) =>
      this.pollEndpoint(endpointId)
    );
    await Promise.allSettled(promises);
  }

  /**
   * Poll a single endpoint
   */
  private async pollEndpoint(endpointId: string): Promise<void> {
    const status = this.endpoints.get(endpointId);
    if (!status) return;

    try {
      const health = this.config.mockMode
        ? this.mockHealthResponse(endpointId)
        : await this.fetchRunPodHealth(endpointId);

      this.endpoints.set(endpointId, {
        ...status,
        health,
        lastChecked: new Date(),
        consecutiveFailures: 0,
      });
    } catch (error) {
      logger.warn(`[EndpointHealth] Failed to poll ${endpointId}:`, error);
      this.endpoints.set(endpointId, {
        ...status,
        consecutiveFailures: status.consecutiveFailures + 1,
        lastChecked: new Date(),
      });
    }
  }

  /**
   * Fetch health from RunPod API
   */
  private async fetchRunPodHealth(endpointId: string): Promise<InternalHealthData> {
    if (!this.config.runpodApiKey) {
      throw new Error('RunPod API key not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${RUNPOD_REST_URL}/${endpointId}/health`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.runpodApiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: RunPodHealthResponse = await response.json();
      return this.mapRunPodResponse(data);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Map RunPod API response to our health interface
   */
  private mapRunPodResponse(data: RunPodHealthResponse): InternalHealthData {
    const workers = data.workers || {};
    const jobs = data.jobs || {};

    return {
      workers_ready: workers.ready || 0,
      workers_running: workers.running || 0,
      workers_initializing: workers.initializing || 0,
      workers_throttled: workers.throttled || 0,
      jobs_in_queue: jobs.inQueue || 0,
      jobs_in_progress: jobs.inProgress || 0,
      jobs_completed_24h: jobs.completed || 0,
      jobs_failed_24h: jobs.failed || 0,
    };
  }

  /**
   * Generate mock health response for development
   */
  private mockHealthResponse(endpointId: string): InternalHealthData {
    const bucket = this.bucketMap.get(endpointId);
    const workersMin = bucket?.workers_min ?? 0;
    const workersMax = bucket?.workers_max ?? 10;

    // Simulate realistic health data
    const ready = workersMin + Math.floor(Math.random() * 3);
    const running = Math.floor(Math.random() * Math.min(5, workersMax));
    const initializing = Math.random() > 0.8 ? 1 : 0;

    return {
      workers_ready: ready,
      workers_running: running,
      workers_initializing: initializing,
      workers_throttled: 0,
      jobs_in_queue: Math.floor(Math.random() * 10),
      jobs_in_progress: running,
      jobs_completed_24h: 100 + Math.floor(Math.random() * 500),
      jobs_failed_24h: Math.floor(Math.random() * 10),
    };
  }

  /**
   * Create initial health state for a new endpoint
   */
  private createInitialHealth(bucket: CapacityBucket): InternalHealthData {
    return {
      workers_ready: bucket.workers_min,
      workers_running: 0,
      workers_initializing: 0,
      workers_throttled: 0,
      jobs_in_queue: 0,
      jobs_in_progress: 0,
      jobs_completed_24h: 0,
      jobs_failed_24h: 0,
    };
  }
}

/**
 * Create a singleton instance for the application
 */
let healthServiceInstance: EndpointHealthService | null = null;

export function getEndpointHealthService(config?: HealthServiceConfig): EndpointHealthService {
  if (!healthServiceInstance) {
    healthServiceInstance = new EndpointHealthService(config);
  }
  return healthServiceInstance;
}

export function resetEndpointHealthService(): void {
  if (healthServiceInstance) {
    healthServiceInstance.stop();
    healthServiceInstance = null;
  }
}
