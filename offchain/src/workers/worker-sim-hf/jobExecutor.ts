/**
 * Job Executor - Executes inference jobs via HuggingFace API
 * 
 * Handles the complete job lifecycle:
 * 1. Validate job request and quote
 * 2. Execute inference via HuggingFace
 * 3. Create receipt with execution metrics
 * 4. Store output and return result
 * 
 * @module jobExecutor
 */

import { HuggingFaceClient, HFChatMessage, HFGenerateOptions } from './hfClient';
import { QuoteService } from './quoteService';
import { 
  verifyJobHash, 
  createComputeReceiptFromJob,
  ComputeReceipt,
} from '../../../packages/engine/src/receipt/receiptService';
import { addReceiptToEpoch } from '../../../packages/engine/src/epoch/services/epochService';
import type {
  JobRequest,
  JobResult,
  JobStatus,
  JobErrorCode,
  JobSubmitResponse,
  WorkerIdentity,
} from '../../../packages/engine/src/shared/types/fluidCompute';
import { mapToV0ErrorCode } from '../../../packages/engine/src/shared/types/fluidCompute';

/**
 * Internal job state
 */
interface JobState {
  request: JobRequest;
  status: JobStatus;
  result?: JobResult;
  receipt?: ComputeReceipt;
  start_ts?: number;
  end_ts?: number;
  error_code?: JobErrorCode;
  error_message?: string;
}

/**
 * Job completion callback type
 */
type JobCompleteCallback = (result: JobResult) => void;

/**
 * Job Executor - Handles job execution lifecycle
 */
export class JobExecutor {
  private hfClient: HuggingFaceClient;
  private workerIdentity: WorkerIdentity;
  private quoteService: QuoteService;
  private jobs: Map<string, JobState>;
  private jobQueue: string[];
  private isProcessing: boolean;
  private onCompleteCallbacks: JobCompleteCallback[];
  private maxConcurrent: number;
  private activeJobs: number;

  constructor(
    hfClient: HuggingFaceClient,
    workerIdentity: WorkerIdentity,
    quoteService: QuoteService,
    options?: { maxConcurrent?: number }
  ) {
    this.hfClient = hfClient;
    this.workerIdentity = workerIdentity;
    this.quoteService = quoteService;
    this.jobs = new Map();
    this.jobQueue = [];
    this.isProcessing = false;
    this.onCompleteCallbacks = [];
    this.maxConcurrent = options?.maxConcurrent || 3;
    this.activeJobs = 0;

    // Start job processor
    this.startJobProcessor();
  }

  /**
   * Submit a job for execution
   */
  async submitJob(request: JobRequest): Promise<JobSubmitResponse> {
    const { job_id, model_id, quote, input, job_hash } = request;

    // Validate quote
    const quoteValidation = this.quoteService.validateQuote(quote);
    if (!quoteValidation.valid) {
      throw new Error(`Quote validation failed: ${quoteValidation.error}`);
    }

    // Enforce strict quote binding (offer_id/model_id/policy_hash)
    if (quote.offer_id !== request.offer_id) {
      throw new Error('Quote offer_id does not match job request');
    }

    if (quote.model_id !== request.model_id) {
      throw new Error('Quote model_id does not match job request');
    }

    if (!quote.policy_hash) {
      throw new Error('Quote policy_hash missing');
    }

    // Verify job hash
    if (!verifyJobHash(request)) {
      throw new Error('Job hash verification failed');
    }

    // Check model is supported
    if (!this.workerIdentity.supported_models?.includes(model_id)) {
      throw new Error(`Model not supported: ${model_id}`);
    }

    // Check if job already exists
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
    this.quoteService.markQuoteUsed(quote.quote_id);

    console.log(`[JobExecutor] Job ${job_id} queued for model ${model_id}`);

    return {
      job_id,
      status: 'queued',
      queue_position: this.jobQueue.length,
      estimated_wait_ms: this.jobQueue.length * 5000, // Rough estimate
    };
  }

  /**
   * Get job result
   */
  async getJobResult(job_id: string): Promise<JobResult | null> {
    const jobState = this.jobs.get(job_id);
    if (!jobState) return null;

    return {
      job_id,
      status: jobState.status,
      output: jobState.result?.output,
      output_ref: jobState.result?.output_ref,
      outputs_hash: jobState.result?.outputs_hash,
      metrics: jobState.result?.metrics,
      error: jobState.error_code ? {
        // Map to v0.2 simplified error codes for client response
        code: mapToV0ErrorCode(jobState.error_code),
        message: jobState.error_message || 'Unknown error',
      } : undefined,
      receipt_id: jobState.receipt?.run_id,
      start_ts: jobState.start_ts,
      end_ts: jobState.end_ts,
      worker_id: this.workerIdentity.worker_id,
      execution_mode: 'managed_endpoint',
    };
  }

  /**
   * Cancel a job
   */
  async cancelJob(job_id: string): Promise<boolean> {
    const jobState = this.jobs.get(job_id);
    if (!jobState) return false;

    // Can only cancel queued jobs
    if (jobState.status !== 'queued') {
      return false;
    }

    // Remove from queue
    const queueIndex = this.jobQueue.indexOf(job_id);
    if (queueIndex >= 0) {
      this.jobQueue.splice(queueIndex, 1);
    }

    // Update status
    jobState.status = 'cancelled';
    jobState.error_code = 'CANCELLED';
    jobState.error_message = 'Job cancelled by user';
    jobState.end_ts = Math.floor(Date.now() / 1000);

    return true;
  }

  /**
   * Get queue depth
   */
  getQueueDepth(): number {
    return this.jobQueue.length;
  }

  /**
   * Register callback for job completion
   */
  onJobComplete(callback: JobCompleteCallback): void {
    this.onCompleteCallbacks.push(callback);
  }

  /**
   * Start the job processor loop
   */
  private startJobProcessor(): void {
    setInterval(() => this.processQueue(), 100);
  }

  /**
   * Process jobs from the queue
   */
  private async processQueue(): Promise<void> {
    // Check if we can start more jobs
    while (this.activeJobs < this.maxConcurrent && this.jobQueue.length > 0) {
      const job_id = this.jobQueue.shift();
      if (!job_id) continue;

      const jobState = this.jobs.get(job_id);
      if (!jobState || jobState.status !== 'queued') continue;

      // Execute job asynchronously
      this.activeJobs++;
      this.executeJob(job_id, jobState).finally(() => {
        this.activeJobs--;
      });
    }
  }

  /**
   * Execute a single job
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
      const options: HFGenerateOptions = {
        max_new_tokens: request.options?.max_tokens || request.quote.max_output_tokens,
        temperature: request.options?.temperature || 0.7,
        top_p: request.options?.top_p || 0.95,
        top_k: request.options?.top_k,
        stop_sequences: request.options?.stop,
        seed: request.options?.seed,
      };

      // Execute inference based on input type
      let response;
      let metrics;

      if (request.input.messages) {
        // Chat completion
        const messages: HFChatMessage[] = request.input.messages.map(m => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        }));

        const result = await this.hfClient.chatCompletion(
          request.model_id,
          messages,
          options
        );
        response = result.response;
        metrics = result.metrics;

        // Build output
        jobState.result = {
          job_id,
          status: 'completed',
          output: {
            choices: response.choices,
          },
          metrics: {
            ttft_ms: metrics.ttft_ms,
            tokens_in: metrics.tokens_in,
            tokens_out: metrics.tokens_out,
            total_latency_ms: metrics.total_latency_ms,
            cache_hit: false,
          },
        };
      } else if (request.input.prompt) {
        // Text generation
        const result = await this.hfClient.generate(
          request.model_id,
          request.input.prompt,
          options
        );
        response = result.response;
        metrics = result.metrics;

        // Build output
        jobState.result = {
          job_id,
          status: 'completed',
          output: {
            text: response.generated_text,
          },
          metrics: {
            ttft_ms: metrics.ttft_ms,
            tokens_in: metrics.tokens_in,
            tokens_out: metrics.tokens_out,
            total_latency_ms: metrics.total_latency_ms,
            cache_hit: false,
          },
        };
      } else {
        throw new Error('Invalid input: must have either prompt or messages');
      }

      const end_ts = Math.floor(Date.now() / 1000);
      jobState.status = 'completed';
      jobState.end_ts = end_ts;

      // Create receipt
      try {
        jobState.receipt = createComputeReceiptFromJob(
          request,
          {
            output: jobState.result.output,
            metrics: {
              ttft_ms: metrics.ttft_ms,
              tokens_in: metrics.tokens_in,
              tokens_out: metrics.tokens_out,
              total_latency_ms: metrics.total_latency_ms,
            },
            start_ts,
            end_ts,
          },
          this.workerIdentity.worker_id,
          'managed_endpoint',
          null, // runtime_hash = null for managed_endpoint
          null  // gpu_fingerprint = null for managed_endpoint
        );

        jobState.result.receipt_id = jobState.receipt.run_id;
        
        // Auto-register receipt with epoch for anchoring
        try {
          addReceiptToEpoch(jobState.receipt.run_id);
          console.log(`[JobExecutor] Job ${job_id} completed with receipt ${jobState.receipt.run_id} (added to epoch)`);
        } catch (epochError) {
          console.warn(`[JobExecutor] Failed to add receipt to epoch: ${epochError}`);
        }
      } catch (receiptError) {
        console.error(`[JobExecutor] Failed to create receipt for job ${job_id}:`, receiptError);
        // Job still succeeded, just no receipt
      }

      // Notify callbacks
      this.notifyComplete(jobState.result);

    } catch (error) {
      const end_ts = Math.floor(Date.now() / 1000);
      jobState.status = 'failed';
      jobState.end_ts = end_ts;

      // Determine error code
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('timeout')) {
        jobState.error_code = 'INFERENCE_TIMEOUT';
      } else if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        jobState.error_code = 'MODEL_NOT_FOUND';
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        jobState.error_code = 'GPU_UNAVAILABLE';
      } else {
        jobState.error_code = 'INFERENCE_ERROR';
      }
      jobState.error_message = errorMessage;

      console.error(`[JobExecutor] Job ${job_id} failed:`, errorMessage);

      // Create error receipt
      try {
        jobState.receipt = createComputeReceiptFromJob(
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
          },
          this.workerIdentity.worker_id,
          'managed_endpoint',
          null,
          null
        );
      } catch {
        // Ignore receipt creation errors for failed jobs
      }

      // Notify callbacks
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
        execution_mode: 'managed_endpoint',
      };
      this.notifyComplete(failedResult);
    }
  }

  /**
   * Notify all callbacks of job completion
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
   * Get all jobs (for debugging)
   */
  getAllJobs(): Map<string, JobState> {
    return new Map(this.jobs);
  }

  /**
   * Get stats
   */
  getStats(): {
    total_jobs: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
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
    };
  }

  /**
   * Clear completed/failed jobs older than specified age
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
