/**
 * Redis-backed Job Store for BYO Runtime Worker
 * 
 * Provides durable job state storage that survives worker restarts.
 * Implements idempotency and state machine transitions.
 * 
 * Job State Machine:
 * queued → running → completed/failed/cancelled
 * 
 * @module redisJobStore
 */

import { Redis, RedisOptions } from 'ioredis';
import type {
  JobRequest,
  JobResult,
  JobStatus,
  JobErrorCode,
} from '../../types/fluidCompute';
import { ExtendedSignedReceipt } from '../../services/receipt/receiptService';

/**
 * Serializable job state for Redis storage
 */
export interface StoredJobState {
  job_id: string;
  request: JobRequest;
  status: JobStatus;
  result?: JobResult;
  receipt_id?: string;
  receipt_json?: string; // Serialized ExtendedSignedReceipt
  start_ts?: number;
  end_ts?: number;
  error_code?: JobErrorCode;
  error_message?: string;
  output_ref?: string;
  created_at: number;
  updated_at: number;
  worker_id: string;
  ttl_seconds: number;
}

/**
 * Redis Job Store configuration
 */
export interface RedisJobStoreConfig {
  // Redis connection
  redisUrl?: string;
  redisOptions?: RedisOptions;
  
  // Key prefixes
  keyPrefix?: string;
  
  // TTL settings
  jobTtlSeconds?: number;        // How long to keep job state (default: 24 hours)
  completedTtlSeconds?: number;  // TTL for completed jobs (default: 1 hour)
  
  // Worker identification
  workerId: string;
  
  // Timeouts
  jobTimeoutSeconds?: number;    // Max time a job can run (default: 10 minutes)
  lockTimeoutSeconds?: number;   // Lock timeout for state transitions (default: 30s)
}

/**
 * Job state transition validation
 */
const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  'queued': ['running', 'cancelled'],
  'running': ['completed', 'failed', 'cancelled'],
  'completed': [], // Terminal state
  'failed': [],    // Terminal state
  'cancelled': [], // Terminal state
};

/**
 * Redis-backed Job Store
 * 
 * Provides durable, distributed job state management with:
 * - State persistence across restarts
 * - Idempotent job submission
 * - Distributed locking for state transitions
 * - Automatic cleanup of old jobs
 * - Job timeout enforcement
 */
export class RedisJobStore {
  private redis: Redis;
  private config: Required<RedisJobStoreConfig>;
  private isConnected: boolean = false;
  private cleanupInterval?: NodeJS.Timeout;
  private timeoutCheckInterval?: NodeJS.Timeout;

  constructor(config: RedisJobStoreConfig) {
    this.config = {
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      redisOptions: config.redisOptions || {},
      keyPrefix: config.keyPrefix || 'fc:job:',
      jobTtlSeconds: config.jobTtlSeconds || 86400, // 24 hours
      completedTtlSeconds: config.completedTtlSeconds || 3600, // 1 hour
      workerId: config.workerId,
      jobTimeoutSeconds: config.jobTimeoutSeconds || 600, // 10 minutes
      lockTimeoutSeconds: config.lockTimeoutSeconds || 30,
    };

    // Initialize Redis client
    this.redis = new Redis(this.config.redisUrl, {
      ...this.config.redisOptions,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    // Set up event handlers
    this.redis.on('connect', () => {
      this.isConnected = true;
      console.log('[RedisJobStore] Connected to Redis');
    });

    this.redis.on('error', (err) => {
      console.error('[RedisJobStore] Redis error:', err.message);
    });

    this.redis.on('close', () => {
      this.isConnected = false;
      console.log('[RedisJobStore] Disconnected from Redis');
    });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;
    
    await this.redis.connect();
    
    // Start background tasks
    this.startCleanupTask();
    this.startTimeoutChecker();
    
    console.log('[RedisJobStore] Initialized');
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.timeoutCheckInterval) {
      clearInterval(this.timeoutCheckInterval);
    }
    
    await this.redis.quit();
    this.isConnected = false;
  }

  /**
   * Check if Redis is connected
   */
  isReady(): boolean {
    return this.isConnected;
  }

  // ============================================================================
  // KEY GENERATION
  // ============================================================================

  private jobKey(jobId: string): string {
    return `${this.config.keyPrefix}${jobId}`;
  }

  private queueKey(): string {
    return `${this.config.keyPrefix}queue`;
  }

  private lockKey(jobId: string): string {
    return `${this.config.keyPrefix}lock:${jobId}`;
  }

  private workerJobsKey(): string {
    return `${this.config.keyPrefix}worker:${this.config.workerId}:jobs`;
  }

  // ============================================================================
  // JOB CRUD OPERATIONS
  // ============================================================================

  /**
   * Create a new job (idempotent)
   * Returns existing job if job_id already exists
   */
  async createJob(request: JobRequest): Promise<{ created: boolean; state: StoredJobState }> {
    const jobId = request.job_id;
    const key = this.jobKey(jobId);

    // Check if job already exists
    const existing = await this.getJob(jobId);
    if (existing) {
      return { created: false, state: existing };
    }

    const now = Math.floor(Date.now() / 1000);
    const state: StoredJobState = {
      job_id: jobId,
      request,
      status: 'queued',
      created_at: now,
      updated_at: now,
      worker_id: this.config.workerId,
      ttl_seconds: this.config.jobTtlSeconds,
    };

    // Use SETNX for atomic creation (idempotent)
    const serialized = JSON.stringify(state);
    const created = await this.redis.setnx(key, serialized);

    if (created === 0) {
      // Job was created by another process, fetch it
      const existingState = await this.getJob(jobId);
      return { created: false, state: existingState! };
    }

    // Set TTL
    await this.redis.expire(key, this.config.jobTtlSeconds);

    // Add to queue and worker's job set
    await Promise.all([
      this.redis.rpush(this.queueKey(), jobId),
      this.redis.sadd(this.workerJobsKey(), jobId),
    ]);

    console.log(`[RedisJobStore] Created job ${jobId}`);
    return { created: true, state };
  }

  /**
   * Get job state
   */
  async getJob(jobId: string): Promise<StoredJobState | null> {
    const key = this.jobKey(jobId);
    const data = await this.redis.get(key);
    
    if (!data) return null;
    
    try {
      return JSON.parse(data) as StoredJobState;
    } catch {
      console.error(`[RedisJobStore] Failed to parse job ${jobId}`);
      return null;
    }
  }

  /**
   * Update job state with locking
   */
  async updateJob(
    jobId: string,
    updates: Partial<StoredJobState>,
    expectedStatus?: JobStatus
  ): Promise<{ success: boolean; state?: StoredJobState; error?: string }> {
    const lockKey = this.lockKey(jobId);
    const jobKey = this.jobKey(jobId);

    // Acquire lock
    const lockAcquired = await this.redis.set(
      lockKey,
      this.config.workerId,
      'EX',
      this.config.lockTimeoutSeconds,
      'NX'
    );

    if (!lockAcquired) {
      return { success: false, error: 'Failed to acquire lock' };
    }

    try {
      // Get current state
      const current = await this.getJob(jobId);
      if (!current) {
        return { success: false, error: 'Job not found' };
      }

      // Validate expected status if provided
      if (expectedStatus && current.status !== expectedStatus) {
        return { 
          success: false, 
          error: `Invalid state: expected ${expectedStatus}, got ${current.status}` 
        };
      }

      // Validate state transition if status is being changed
      if (updates.status && updates.status !== current.status) {
        const validTransitions = VALID_TRANSITIONS[current.status];
        if (!validTransitions.includes(updates.status)) {
          return {
            success: false,
            error: `Invalid state transition: ${current.status} → ${updates.status}`,
          };
        }
      }

      // Apply updates
      const newState: StoredJobState = {
        ...current,
        ...updates,
        updated_at: Math.floor(Date.now() / 1000),
      };

      // Determine TTL based on status
      let ttl = this.config.jobTtlSeconds;
      if (newState.status === 'completed' || newState.status === 'failed' || newState.status === 'cancelled') {
        ttl = this.config.completedTtlSeconds;
      }

      // Save with TTL
      await this.redis.set(jobKey, JSON.stringify(newState), 'EX', ttl);

      return { success: true, state: newState };

    } finally {
      // Release lock
      await this.redis.del(lockKey);
    }
  }

  /**
   * Transition job to running state
   */
  async startJob(jobId: string): Promise<{ success: boolean; state?: StoredJobState; error?: string }> {
    return this.updateJob(
      jobId,
      { 
        status: 'running',
        start_ts: Math.floor(Date.now() / 1000),
      },
      'queued'
    );
  }

  /**
   * Complete a job successfully
   */
  async completeJob(
    jobId: string,
    result: JobResult,
    receipt?: ExtendedSignedReceipt,
    outputRef?: string
  ): Promise<{ success: boolean; state?: StoredJobState; error?: string }> {
    return this.updateJob(
      jobId,
      {
        status: 'completed',
        result,
        receipt_id: receipt?.run_id,
        receipt_json: receipt ? JSON.stringify(receipt) : undefined,
        output_ref: outputRef,
        end_ts: Math.floor(Date.now() / 1000),
      },
      'running'
    );
  }

  /**
   * Fail a job
   */
  async failJob(
    jobId: string,
    errorCode: JobErrorCode,
    errorMessage: string,
    receipt?: ExtendedSignedReceipt
  ): Promise<{ success: boolean; state?: StoredJobState; error?: string }> {
    return this.updateJob(
      jobId,
      {
        status: 'failed',
        error_code: errorCode,
        error_message: errorMessage,
        receipt_id: receipt?.run_id,
        receipt_json: receipt ? JSON.stringify(receipt) : undefined,
        end_ts: Math.floor(Date.now() / 1000),
      },
      'running'
    );
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<{ success: boolean; state?: StoredJobState; error?: string }> {
    const job = await this.getJob(jobId);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    if (job.status !== 'queued') {
      return { success: false, error: `Cannot cancel job in ${job.status} state` };
    }

    // Remove from queue
    await this.redis.lrem(this.queueKey(), 1, jobId);

    return this.updateJob(
      jobId,
      {
        status: 'cancelled',
        error_code: 'CANCELLED',
        error_message: 'Job cancelled by user',
        end_ts: Math.floor(Date.now() / 1000),
      },
      'queued'
    );
  }

  // ============================================================================
  // QUEUE OPERATIONS
  // ============================================================================

  /**
   * Get next job from queue
   */
  async dequeueJob(): Promise<string | null> {
    return this.redis.lpop(this.queueKey());
  }

  /**
   * Get queue length
   */
  async getQueueLength(): Promise<number> {
    return this.redis.llen(this.queueKey());
  }

  /**
   * Get queue contents (without removing)
   */
  async peekQueue(count: number = 10): Promise<string[]> {
    return this.redis.lrange(this.queueKey(), 0, count - 1);
  }

  // ============================================================================
  // RECOVERY & CLEANUP
  // ============================================================================

  /**
   * Recover jobs that were running when worker crashed
   * Should be called on worker startup
   */
  async recoverJobs(): Promise<{ recovered: number; failed: number }> {
    let recovered = 0;
    let failed = 0;

    // Get all jobs for this worker
    const jobIds = await this.redis.smembers(this.workerJobsKey());

    for (const jobId of jobIds) {
      const job = await this.getJob(jobId);
      if (!job) {
        // Job expired, remove from set
        await this.redis.srem(this.workerJobsKey(), jobId);
        continue;
      }

      if (job.status === 'running') {
        // Job was running when worker crashed
        // Check if it's been running too long (timeout)
        const now = Math.floor(Date.now() / 1000);
        const runningTime = job.start_ts ? now - job.start_ts : 0;

        if (runningTime > this.config.jobTimeoutSeconds) {
          // Job timed out, mark as failed
          await this.updateJob(jobId, {
            status: 'failed',
            error_code: 'INFERENCE_TIMEOUT',
            error_message: `Job timed out after ${runningTime}s (recovered from crash)`,
            end_ts: now,
          });
          failed++;
        } else {
          // Re-queue the job
          await this.updateJob(jobId, { status: 'queued' });
          await this.redis.lpush(this.queueKey(), jobId);
          recovered++;
          console.log(`[RedisJobStore] Recovered job ${jobId} to queue`);
        }
      }
    }

    console.log(`[RedisJobStore] Recovery complete: ${recovered} recovered, ${failed} failed`);
    return { recovered, failed };
  }

  /**
   * Start periodic cleanup of expired jobs
   */
  private startCleanupTask(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredJobs();
      } catch (error) {
        console.error('[RedisJobStore] Cleanup error:', error);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up expired jobs from worker's set
   */
  private async cleanupExpiredJobs(): Promise<number> {
    const jobIds = await this.redis.smembers(this.workerJobsKey());
    let cleaned = 0;

    for (const jobId of jobIds) {
      const exists = await this.redis.exists(this.jobKey(jobId));
      if (!exists) {
        await this.redis.srem(this.workerJobsKey(), jobId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[RedisJobStore] Cleaned up ${cleaned} expired jobs`);
    }

    return cleaned;
  }

  /**
   * Start periodic timeout checker
   */
  private startTimeoutChecker(): void {
    // Check for timed out jobs every minute
    this.timeoutCheckInterval = setInterval(async () => {
      try {
        await this.checkTimeouts();
      } catch (error) {
        console.error('[RedisJobStore] Timeout check error:', error);
      }
    }, 60 * 1000);
  }

  /**
   * Check for and handle timed out jobs
   */
  private async checkTimeouts(): Promise<number> {
    const jobIds = await this.redis.smembers(this.workerJobsKey());
    const now = Math.floor(Date.now() / 1000);
    let timedOut = 0;

    for (const jobId of jobIds) {
      const job = await this.getJob(jobId);
      if (!job) continue;

      if (job.status === 'running' && job.start_ts) {
        const runningTime = now - job.start_ts;
        if (runningTime > this.config.jobTimeoutSeconds) {
          await this.updateJob(jobId, {
            status: 'failed',
            error_code: 'INFERENCE_TIMEOUT',
            error_message: `Job timed out after ${runningTime}s`,
            end_ts: now,
          });
          timedOut++;
          console.log(`[RedisJobStore] Job ${jobId} timed out after ${runningTime}s`);
        }
      }
    }

    return timedOut;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get job statistics
   */
  async getStats(): Promise<{
    total_jobs: number;
    queue_length: number;
    by_status: Record<JobStatus, number>;
  }> {
    const jobIds = await this.redis.smembers(this.workerJobsKey());
    const queueLength = await this.getQueueLength();

    const byStatus: Record<JobStatus, number> = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const jobId of jobIds) {
      const job = await this.getJob(jobId);
      if (job) {
        byStatus[job.status]++;
      }
    }

    return {
      total_jobs: jobIds.length,
      queue_length: queueLength,
      by_status: byStatus,
    };
  }
}

/**
 * Create and initialize Redis job store
 */
export async function createRedisJobStore(
  config: RedisJobStoreConfig
): Promise<RedisJobStore> {
  const store = new RedisJobStore(config);
  await store.connect();
  return store;
}