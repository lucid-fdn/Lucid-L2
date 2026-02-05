/**
 * Job Executor for BYO Runtime Worker (vLLM)
 * 
 * Handles the complete job lifecycle for byo_runtime mode:
 * 1. Validate job request and quote
 * 2. Execute inference via vLLM
 * 3. Upload output to S3
 * 4. Create worker-signed receipt
 * 5. Return result with receipt
 * 
 * Key differences from managed_endpoint:
 * - Worker signs receipts (not orchestrator)
 * - Includes runtime_hash and gpu_fingerprint
 * - Outputs stored in S3 hot lane
 * 
 * @module jobExecutor
 */

import { VllmClient, VllmChatMessage, VllmGenerateOptions } from './vllmClient';
import { QuoteService } from './quoteService';
import { WorkerSigningService } from './signingService';
import { getRuntimeHash, getGpuFingerprint, validatePinnedRevision } from './runtimeUtils';
import { canonicalSha256Hex } from '../../utils/hash';
import { addReceiptToEpoch } from '../../services/epochService';
import type {
  JobRequest,
  JobResult,
  JobStatus,
  JobErrorCode,
  JobSubmitResponse,
  WorkerIdentity,
  ExtendedRunReceiptInput,
  JobOutput,
} from '../../types/fluidCompute';
import { createExtendedReceipt, ExtendedSignedReceipt } from '../../services/receiptService';

/**
 * S3 Storage configuration
 */
export interface S3Config {
  bucket: string;
  region: string;
  prefix?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * Internal job state
 */
interface JobState {
  request: JobRequest;
  status: JobStatus;
  result?: JobResult;
  receipt?: ExtendedSignedReceipt;
  start_ts?: number;
  end_ts?: number;
  error_code?: JobErrorCode;
  error_message?: string;
  output_ref?: string;
}

/**
 * Job completion callback type
 */
type JobCompleteCallback = (result: JobResult) => void;

/**
 * Job Executor for BYO Runtime Worker
 */
export class JobExecutor {
  private vllmClient: VllmClient;
  private workerIdentity: WorkerIdentity;
  private quoteService: QuoteService;
  private signingService: WorkerSigningService;
  private s3Config?: S3Config;
  
  private jobs: Map<string, JobState>;
  private jobQueue: string[];
  private onCompleteCallbacks: JobCompleteCallback[];
  private maxConcurrent: number;
  private activeJobs: number;
  private jobTimeoutMs: number;
  private enforcePinnedRevision: boolean;

  // Cached runtime identifiers
  private runtimeHash: string | null = null;
  private gpuFingerprint: string | null = null;

  constructor(
    vllmClient: VllmClient,
    workerIdentity: WorkerIdentity,
    quoteService: QuoteService,
    signingService: WorkerSigningService,
    options?: {
      maxConcurrent?: number;
      jobTimeoutMs?: number;
      s3Config?: S3Config;
      enforcePinnedRevision?: boolean;
    }
  ) {
    this.vllmClient = vllmClient;
    this.workerIdentity = workerIdentity;
    this.quoteService = quoteService;
    this.signingService = signingService;
    this.s3Config = options?.s3Config;
    
    this.jobs = new Map();
    this.jobQueue = [];
    this.onCompleteCallbacks = [];
    this.maxConcurrent = options?.maxConcurrent || 3;
    this.activeJobs = 0;
    this.jobTimeoutMs = options?.jobTimeoutMs || 300000; // 5 minutes default
    this.enforcePinnedRevision = options?.enforcePinnedRevision ?? true;

    // Cache runtime identifiers
    this.initializeRuntimeIdentifiers();

    // Start job processor
    this.startJobProcessor();
  }

  /**
   * Initialize runtime identifiers (runtime_hash, gpu_fingerprint).
   */
  private initializeRuntimeIdentifiers(): void {
    this.runtimeHash = getRuntimeHash();
    this.gpuFingerprint = getGpuFingerprint();

    if (!this.runtimeHash) {
      console.warn('[JobExecutor] WARNING: Could not determine runtime_hash');
    } else {
      console.log(`[JobExecutor] Runtime hash: ${this.runtimeHash}`);
    }

    if (!this.gpuFingerprint) {
      console.warn('[JobExecutor] WARNING: Could not determine gpu_fingerprint - no GPU detected?');
    } else {
      console.log(`[JobExecutor] GPU fingerprint: ${this.gpuFingerprint}`);
    }
  }

  /**
   * Submit a job for execution.
   */
  async submitJob(request: JobRequest): Promise<JobSubmitResponse> {
    const { job_id, model_id, quote, job_hash } = request;

    // Enforce pinned revision if enabled
    if (this.enforcePinnedRevision) {
      const validation = validatePinnedRevision(model_id);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    // Validate quote with bindings
    const quoteValidation = this.quoteService.validateQuoteBindings(quote, {
      offer_id: request.offer_id,
      model_id: request.model_id,
    });
    
    if (!quoteValidation.valid) {
      throw new Error(`Quote validation failed: ${quoteValidation.error}`);
    }

    // Verify job hash
    if (!this.verifyJobHash(request)) {
      throw new Error('Job hash verification failed');
    }

    // Check model is available in vLLM
    const modelStatus = await this.vllmClient.ensureModel(model_id);
    if (!modelStatus.loaded) {
      throw new Error(`Model not available: ${modelStatus.error}`);
    }

    // Check if job already exists (idempotency)
    if (this.jobs.has(job_id)) {
      const existing = this.jobs.get(job_id)!;
      return {
        job_id,
        status: existing.status,
        queue_position: this.jobQueue.indexOf(job_id) + 1,
      };
    }

    // Create job state
    const jobState: JobState = {
      request,
      status: 'queued',
    };

    // Store job and add to queue
    this.jobs.set(job_id, jobState);
    this.jobQueue.push(job_id);

    // Mark quote as used (replay protection)
    this.quoteService.markQuoteUsed(quote.quote_id, quote.quote_hash);

    console.log(`[JobExecutor] Job ${job_id} queued for model ${model_id}`);

    return {
      job_id,
      status: 'queued',
      queue_position: this.jobQueue.length,
      estimated_wait_ms: this.jobQueue.length * 10000,
    };
  }

  /**
   * Verify job hash matches computed hash.
   */
  private verifyJobHash(request: JobRequest): boolean {
    const inputHash = canonicalSha256Hex(request.input);
    
    const hashBody = {
      job_id: request.job_id,
      model_id: request.model_id,
      offer_id: request.offer_id,
      quote_hash: request.quote.quote_hash,
      input_hash: inputHash,
    };
    
    const computed = canonicalSha256Hex(hashBody);
    return computed === request.job_hash;
  }

  /**
   * Get job result.
   */
  async getJobResult(job_id: string): Promise<JobResult | null> {
    const jobState = this.jobs.get(job_id);
    if (!jobState) return null;

    return {
      job_id,
      status: jobState.status,
      output: jobState.result?.output,
      output_ref: jobState.output_ref,
      outputs_hash: jobState.result?.outputs_hash,
      metrics: jobState.result?.metrics,
      error: jobState.error_code ? {
        code: jobState.error_code,
        message: jobState.error_message || 'Unknown error',
      } : undefined,
      receipt_id: jobState.receipt?.run_id,
      start_ts: jobState.start_ts,
      end_ts: jobState.end_ts,
      worker_id: this.workerIdentity.worker_id,
      execution_mode: 'byo_runtime',
    };
  }

  /**
   * Cancel a job.
   */
  async cancelJob(job_id: string): Promise<boolean> {
    const jobState = this.jobs.get(job_id);
    if (!jobState) return false;

    if (jobState.status !== 'queued') {
      return false;
    }

    const queueIndex = this.jobQueue.indexOf(job_id);
    if (queueIndex >= 0) {
      this.jobQueue.splice(queueIndex, 1);
    }

    jobState.status = 'cancelled';
    jobState.error_code = 'CANCELLED';
    jobState.error_message = 'Job cancelled by user';
    jobState.end_ts = Math.floor(Date.now() / 1000);

    return true;
  }

  /**
   * Get queue depth.
   */
  getQueueDepth(): number {
    return this.jobQueue.length;
  }

  /**
   * Register callback for job completion.
   */
  onJobComplete(callback: JobCompleteCallback): void {
    this.onCompleteCallbacks.push(callback);
  }

  /**
   * Get runtime hash.
   */
  getRuntimeHash(): string | null {
    return this.runtimeHash;
  }

  /**
   * Get GPU fingerprint.
   */
  getGpuFingerprint(): string | null {
    return this.gpuFingerprint;
  }

  /**
   * Start the job processor loop.
   */
  private startJobProcessor(): void {
    setInterval(() => this.processQueue(), 100);
  }

  /**
   * Process jobs from the queue.
   */
  private async processQueue(): Promise<void> {
    while (this.activeJobs < this.maxConcurrent && this.jobQueue.length > 0) {
      const job_id = this.jobQueue.shift();
      if (!job_id) continue;

      const jobState = this.jobs.get(job_id);
      if (!jobState || jobState.status !== 'queued') continue;

      this.activeJobs++;
      this.executeJob(job_id, jobState).finally(() => {
        this.activeJobs--;
      });
    }
  }

  /**
   * Execute a single job.
   */
  private async executeJob(job_id: string, jobState: JobState): Promise<void> {
    const { request } = jobState;
    const start_ts = Math.floor(Date.now() / 1000);
    
    try {
      // Update status
      jobState.status = 'running';
      jobState.start_ts = start_ts;

      console.log(`[JobExecutor] Executing job ${job_id} for model ${request.model_id}`);

      // Prepare generation options
      const options: VllmGenerateOptions = {
        max_tokens: request.options?.max_tokens || request.quote.max_output_tokens,
        temperature: request.options?.temperature || 0.7,
        top_p: request.options?.top_p || 0.95,
        stop: request.options?.stop,
        seed: request.options?.seed,
      };

      // Execute inference based on input type
      let output: JobOutput;
      let tokensIn: number;
      let tokensOut: number;
      let ttftMs: number;
      let totalLatencyMs: number;

      if (request.input.messages) {
        // Chat completion
        const messages: VllmChatMessage[] = request.input.messages.map(m => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        }));

        const result = await this.vllmClient.chatCompletion(
          request.model_id,
          messages,
          options
        );

        output = {
          choices: result.response.choices.map(c => ({
            index: c.index,
            message: c.message,
            finish_reason: c.finish_reason,
          })),
        };
        tokensIn = result.metrics.tokens_in;
        tokensOut = result.metrics.tokens_out;
        ttftMs = result.metrics.ttft_ms;
        totalLatencyMs = result.metrics.total_latency_ms;

      } else if (request.input.prompt) {
        // Text completion - use top-level text field per JobOutput interface
        const result = await this.vllmClient.completion(
          request.model_id,
          request.input.prompt,
          options
        );

        // Combine all choice texts for the top-level text field
        const combinedText = result.response.choices.map(c => c.text).join('');
        
        output = {
          text: combinedText,
          // Also provide choices in message format for compatibility
          choices: result.response.choices.map(c => ({
            index: c.index,
            message: {
              role: 'assistant',
              content: c.text,
            },
            finish_reason: c.finish_reason,
          })),
        };
        tokensIn = result.metrics.tokens_in;
        tokensOut = result.metrics.tokens_out;
        ttftMs = result.metrics.ttft_ms;
        totalLatencyMs = result.metrics.total_latency_ms;

      } else {
        throw new Error('Invalid input: must have either prompt or messages');
      }

      const end_ts = Math.floor(Date.now() / 1000);
      
      // Compute outputs hash
      const outputs_hash = canonicalSha256Hex(output);

      // Upload to S3 if configured
      let output_ref: string | undefined;
      if (this.s3Config) {
        try {
          output_ref = await this.uploadToS3(job_id, output);
          jobState.output_ref = output_ref;
        } catch (s3Error) {
          console.error(`[JobExecutor] S3 upload failed for job ${job_id}:`, s3Error);
          // Continue without S3 - output still in response
        }
      }

      // Update job state
      jobState.status = 'completed';
      jobState.end_ts = end_ts;
      jobState.result = {
        job_id,
        status: 'completed',
        output,
        output_ref,
        outputs_hash,
        metrics: {
          ttft_ms: ttftMs,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          total_latency_ms: totalLatencyMs,
          cache_hit: false,
        },
      };

      // Create worker-signed receipt
      try {
        jobState.receipt = await this.createWorkerReceipt(
          request,
          {
            output,
            output_ref,
            outputs_hash,
            metrics: {
              ttft_ms: ttftMs,
              tokens_in: tokensIn,
              tokens_out: tokensOut,
              total_latency_ms: totalLatencyMs,
            },
            start_ts,
            end_ts,
          }
        );

        jobState.result.receipt_id = jobState.receipt.run_id;

        // Auto-register receipt with epoch for anchoring
        try {
          addReceiptToEpoch(jobState.receipt.run_id);
          console.log(`[JobExecutor] Job ${job_id} completed with receipt ${jobState.receipt.run_id}`);
        } catch (epochError) {
          console.warn(`[JobExecutor] Failed to add receipt to epoch: ${epochError}`);
        }
      } catch (receiptError) {
        console.error(`[JobExecutor] Failed to create receipt for job ${job_id}:`, receiptError);
      }

      // Notify callbacks
      this.notifyComplete(jobState.result);

    } catch (error) {
      const end_ts = Math.floor(Date.now() / 1000);
      jobState.status = 'failed';
      jobState.end_ts = end_ts;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('timeout')) {
        jobState.error_code = 'INFERENCE_TIMEOUT';
      } else if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        jobState.error_code = 'MODEL_NOT_FOUND';
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        jobState.error_code = 'GPU_UNAVAILABLE';
      } else if (errorMessage.includes('pinned revision') || errorMessage.includes('latest')) {
        jobState.error_code = 'INFERENCE_ERROR';
      } else {
        jobState.error_code = 'INFERENCE_ERROR';
      }
      jobState.error_message = errorMessage;

      console.error(`[JobExecutor] Job ${job_id} failed:`, errorMessage);

      // Create error receipt
      try {
        jobState.receipt = await this.createWorkerReceipt(
          request,
          {
            metrics: {
              ttft_ms: 0,
              tokens_in: 0,
              tokens_out: 0,
            },
            error_code: jobState.error_code,
            error_message: jobState.error_message,
            start_ts,
            end_ts,
          }
        );
      } catch {
        // Ignore receipt creation errors for failed jobs
      }

      const failedResult: JobResult = {
        job_id,
        status: 'failed',
        error: {
          code: jobState.error_code,
          message: jobState.error_message,
        },
        start_ts,
        end_ts,
        worker_id: this.workerIdentity.worker_id,
        execution_mode: 'byo_runtime',
      };
      this.notifyComplete(failedResult);
    }
  }

  /**
   * Create a worker-signed receipt.
   */
  private async createWorkerReceipt(
    request: JobRequest,
    result: {
      output?: object;
      output_ref?: string;
      outputs_hash?: string;
      metrics: {
        ttft_ms: number;
        tokens_in: number;
        tokens_out: number;
        total_latency_ms?: number;
      };
      error_code?: string;
      error_message?: string;
      start_ts: number;
      end_ts: number;
    }
  ): Promise<ExtendedSignedReceipt> {
    const receiptInput: ExtendedRunReceiptInput = {
      // Required fields
      model_passport_id: request.model_id,
      compute_passport_id: request.offer_id,
      policy_hash: request.quote.policy_hash,
      runtime: 'vllm',
      tokens_in: result.metrics.tokens_in,
      tokens_out: result.metrics.tokens_out,
      ttft_ms: result.metrics.ttft_ms,
      
      // Use job_id as run_id for traceability
      run_id: request.job_id,
      trace_id: request.trace_id,
      
      // Fluid Compute v0 extended fields
      execution_mode: 'byo_runtime',
      job_hash: request.job_hash,
      quote_hash: request.quote.quote_hash,
      node_id: this.workerIdentity.worker_id,
      runtime_hash: this.runtimeHash,
      gpu_fingerprint: this.gpuFingerprint,
      outputs_hash: result.outputs_hash,
      output_ref: result.output_ref,
      start_ts: result.start_ts,
      end_ts: result.end_ts,
      input_ref: request.input_ref,
      error_code: result.error_code,
      error_message: result.error_message,
      
      // Extended metrics
      total_latency_ms: result.metrics.total_latency_ms,
    };

    // Create receipt with worker signer
    return createExtendedReceipt(receiptInput, 'worker');
  }

  /**
   * Upload output to S3 hot lane.
   */
  private async uploadToS3(job_id: string, output: object): Promise<string> {
    if (!this.s3Config) {
      throw new Error('S3 not configured');
    }

    const { bucket, region, prefix = 'outputs' } = this.s3Config;
    const key = `${prefix}/${job_id}/output.json`;
    const body = JSON.stringify(output);

    // Note: In production, use AWS SDK properly
    // This is a simplified implementation
    const endpoint = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        // Add AWS signature headers here in production
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`S3 upload failed: ${response.status}`);
    }

    return `s3://${bucket}/${key}`;
  }

  /**
   * Notify all callbacks of job completion.
   */
  private notifyComplete(result: JobResult): void {
    for (const callback of this.onCompleteCallbacks) {
      try {
        callback(result);
      } catch (error) {
        console.error('[JobExecutor] Callback error:', error);
      }
    }
  }

  /**
   * Get all jobs (for debugging).
   */
  getAllJobs(): Map<string, JobState> {
    return new Map(this.jobs);
  }

  /**
   * Get statistics.
   */
  getStats(): {
    total_jobs: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    active_jobs: number;
    max_concurrent: number;
  } {
    let queued = 0, running = 0, completed = 0, failed = 0;

    for (const job of this.jobs.values()) {
      switch (job.status) {
        case 'queued': queued++; break;
        case 'running': running++; break;
        case 'completed': completed++; break;
        case 'failed': failed++; break;
      }
    }

    return {
      total_jobs: this.jobs.size,
      queued,
      running,
      completed,
      failed,
      active_jobs: this.activeJobs,
      max_concurrent: this.maxConcurrent,
    };
  }

  /**
   * Clear completed/failed jobs older than specified age.
   */
  cleanup(maxAgeSeconds: number = 3600): number {
    const now = Math.floor(Date.now() / 1000);
    let cleaned = 0;

    for (const [job_id, job] of this.jobs) {
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        if (job.end_ts && (now - job.end_ts) > maxAgeSeconds) {
          this.jobs.delete(job_id);
          cleaned++;
        }
      }
    }

    return cleaned;
  }
}