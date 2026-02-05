/**
 * Worker Sim HF - Managed Endpoint Worker using HuggingFace Inference API
 * 
 * This worker operates in `managed_endpoint` mode:
 * - Proxies inference requests to HuggingFace Inference API
 * - runtime_hash = null (execution not self-controlled)
 * - gpu_fingerprint = null (hardware not self-controlled)
 * - Creates receipts with limited attestation guarantees
 * 
 * Perfect for development, testing, and scenarios where you don't have
 * access to dedicated GPU hardware.
 * 
 * @module worker-sim-hf
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';
import cors from 'cors';
import { HuggingFaceClient } from './hfClient';
import { QuoteService } from './quoteService';
import { JobExecutor } from './jobExecutor';
import { WorkerIdentity, ExecutionMode, HealthCheckResponse } from '../../types/fluidCompute';

// Configuration
const PORT = parseInt(process.env.WORKER_PORT || '3100', 10);
const WORKER_ID = process.env.WORKER_ID || `worker-sim-hf-${uuid().slice(0, 8)}`;
const PROVIDER_PASSPORT_ID = process.env.PROVIDER_PASSPORT_ID || 'psp_hf_default';
const HF_API_KEY = process.env.HF_API_KEY;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3000';

// Execution mode for this worker
const EXECUTION_MODE: ExecutionMode = 'managed_endpoint';

// Initialize services
let hfClient: HuggingFaceClient;
let quoteService: QuoteService;
let jobExecutor: JobExecutor;
let workerIdentity: WorkerIdentity;

// Metrics
const metrics = {
  requests_total: 0,
  quotes_issued: 0,
  jobs_submitted: 0,
  jobs_completed: 0,
  jobs_failed: 0,
  tokens_in_total: 0,
  tokens_out_total: 0,
  start_time: Date.now(),
};

/**
 * Initialize the worker
 */
async function initializeWorker(): Promise<void> {
  if (!HF_API_KEY) {
    throw new Error('HF_API_KEY environment variable is required');
  }

  // Initialize HuggingFace client
  hfClient = new HuggingFaceClient(HF_API_KEY);
  
  // Build worker identity
  workerIdentity = {
    worker_id: WORKER_ID,
    provider_passport_id: PROVIDER_PASSPORT_ID,
    operator_pubkey: '', // Will be set from signing key
    execution_mode: EXECUTION_MODE,
    runtime_type: 'hf-inference-api',
    runtime_hash: null,  // NULL for managed_endpoint
    gpu_fingerprint: null,  // NULL for managed_endpoint
    capabilities: ['text-generation', 'chat-completion', 'embeddings'],
    supported_models: [
      'meta-llama/Meta-Llama-3.1-8B-Instruct',
      'meta-llama/Meta-Llama-3.1-70B-Instruct',
      'mistralai/Mistral-7B-Instruct-v0.3',
      'mistralai/Mixtral-8x7B-Instruct-v0.1',
      'microsoft/Phi-3-mini-4k-instruct',
      'Qwen/Qwen2.5-72B-Instruct',
      'google/gemma-2-9b-it',
    ],
    max_context_length: 8192,
    region: 'hf-inference-api',
    endpoints: {
      quote_url: `http://localhost:${PORT}/quote`,
      jobs_url: `http://localhost:${PORT}/jobs`,
      health_url: `http://localhost:${PORT}/health`,
      metrics_url: `http://localhost:${PORT}/metrics`,
    },
    status: 'online',
    registered_at: Math.floor(Date.now() / 1000),
  };

  // Initialize quote service
  quoteService = new QuoteService(workerIdentity);

  // Initialize job executor
  jobExecutor = new JobExecutor(hfClient, workerIdentity, quoteService);

  console.log(`[${WORKER_ID}] Worker initialized in ${EXECUTION_MODE} mode`);
  console.log(`[${WORKER_ID}] Supported models: ${workerIdentity.supported_models?.join(', ')}`);
}

/**
 * Create Express app
 */
function createApp(): Express {
  const app = express();
  
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Request logging middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    metrics.requests_total++;
    console.log(`[${WORKER_ID}] ${req.method} ${req.path}`);
    next();
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    const response: HealthCheckResponse = {
      status: 'healthy',
      worker_id: WORKER_ID,
      execution_mode: EXECUTION_MODE,
      gpu_available: false, // No local GPU
      queue_depth: jobExecutor?.getQueueDepth() || 0,
      uptime_seconds: Math.floor((Date.now() - metrics.start_time) / 1000),
      version: '0.1.0',
    };
    res.json(response);
  });

  // Prometheus metrics endpoint
  app.get('/metrics', (_req: Request, res: Response) => {
    const uptimeSeconds = Math.floor((Date.now() - metrics.start_time) / 1000);
    const metricsText = `
# HELP worker_requests_total Total number of requests
# TYPE worker_requests_total counter
worker_requests_total{worker_id="${WORKER_ID}"} ${metrics.requests_total}

# HELP worker_quotes_issued_total Total number of quotes issued
# TYPE worker_quotes_issued_total counter
worker_quotes_issued_total{worker_id="${WORKER_ID}"} ${metrics.quotes_issued}

# HELP worker_jobs_submitted_total Total number of jobs submitted
# TYPE worker_jobs_submitted_total counter
worker_jobs_submitted_total{worker_id="${WORKER_ID}"} ${metrics.jobs_submitted}

# HELP worker_jobs_completed_total Total number of jobs completed
# TYPE worker_jobs_completed_total counter
worker_jobs_completed_total{worker_id="${WORKER_ID}"} ${metrics.jobs_completed}

# HELP worker_jobs_failed_total Total number of jobs failed
# TYPE worker_jobs_failed_total counter
worker_jobs_failed_total{worker_id="${WORKER_ID}"} ${metrics.jobs_failed}

# HELP worker_tokens_in_total Total input tokens processed
# TYPE worker_tokens_in_total counter
worker_tokens_in_total{worker_id="${WORKER_ID}"} ${metrics.tokens_in_total}

# HELP worker_tokens_out_total Total output tokens generated
# TYPE worker_tokens_out_total counter
worker_tokens_out_total{worker_id="${WORKER_ID}"} ${metrics.tokens_out_total}

# HELP worker_uptime_seconds Worker uptime in seconds
# TYPE worker_uptime_seconds gauge
worker_uptime_seconds{worker_id="${WORKER_ID}"} ${uptimeSeconds}

# HELP worker_queue_depth Current queue depth
# TYPE worker_queue_depth gauge
worker_queue_depth{worker_id="${WORKER_ID}"} ${jobExecutor?.getQueueDepth() || 0}
`.trim();

    res.set('Content-Type', 'text/plain');
    res.send(metricsText);
  });

  // Get worker identity
  app.get('/identity', (_req: Request, res: Response) => {
    res.json(workerIdentity);
  });

  // Quote endpoint - Get a price quote for execution
  app.post('/quote', async (req: Request, res: Response) => {
    try {
      const { offer_id, model_id, estimated_input_tokens, estimated_output_tokens, policy_hash } = req.body;

      if (!model_id) {
        return res.status(400).json({ error: 'model_id is required' });
      }

      // Check if model is supported
      if (!workerIdentity.supported_models?.includes(model_id)) {
        return res.status(400).json({ 
          error: 'Model not supported',
          supported_models: workerIdentity.supported_models,
        });
      }

      const quote = await quoteService.createQuote({
        offer_id: offer_id || PROVIDER_PASSPORT_ID,
        model_id,
        estimated_input_tokens: estimated_input_tokens || 1000,
        estimated_output_tokens: estimated_output_tokens || 500,
        policy_hash: policy_hash || 'default_policy',
      });

      metrics.quotes_issued++;

      res.json({
        quote,
        valid_until: new Date(quote.expires_at * 1000).toISOString(),
      });
    } catch (error) {
      console.error(`[${WORKER_ID}] Quote error:`, error);
      res.status(500).json({ error: 'Failed to create quote' });
    }
  });

  // Submit job endpoint
  app.post('/jobs', async (req: Request, res: Response) => {
    try {
      const jobRequest = req.body;

      // Validate job request
      if (!jobRequest.job_id || !jobRequest.model_id || !jobRequest.quote || !jobRequest.input) {
        return res.status(400).json({ error: 'Invalid job request: missing required fields' });
      }

      metrics.jobs_submitted++;

      // Submit job for execution
      const submitResponse = await jobExecutor.submitJob(jobRequest);
      
      res.status(202).json(submitResponse);
    } catch (error: unknown) {
      console.error(`[${WORKER_ID}] Job submit error:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit job';
      res.status(400).json({ error: errorMessage });
    }
  });

  // Get job status/result
  app.get('/jobs/:job_id', async (req: Request, res: Response) => {
    try {
      const { job_id } = req.params;
      const result = await jobExecutor.getJobResult(job_id);
      
      if (!result) {
        return res.status(404).json({ error: 'Job not found' });
      }

      res.json(result);
    } catch (error) {
      console.error(`[${WORKER_ID}] Get job error:`, error);
      res.status(500).json({ error: 'Failed to get job' });
    }
  });

  // Cancel job
  app.delete('/jobs/:job_id', async (req: Request, res: Response) => {
    try {
      const { job_id } = req.params;
      const cancelled = await jobExecutor.cancelJob(job_id);
      
      if (!cancelled) {
        return res.status(404).json({ error: 'Job not found or already completed' });
      }

      res.json({ status: 'cancelled', job_id });
    } catch (error) {
      console.error(`[${WORKER_ID}] Cancel job error:`, error);
      res.status(500).json({ error: 'Failed to cancel job' });
    }
  });

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(`[${WORKER_ID}] Unhandled error:`, err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    await initializeWorker();
    
    const app = createApp();
    
    // Set up job completion callbacks for metrics
    jobExecutor.onJobComplete((result) => {
      if (result.status === 'completed') {
        metrics.jobs_completed++;
        metrics.tokens_in_total += result.metrics?.tokens_in || 0;
        metrics.tokens_out_total += result.metrics?.tokens_out || 0;
      } else if (result.status === 'failed') {
        metrics.jobs_failed++;
      }
    });

    app.listen(PORT, () => {
      console.log(`[${WORKER_ID}] Worker listening on port ${PORT}`);
      console.log(`[${WORKER_ID}] Execution mode: ${EXECUTION_MODE}`);
      console.log(`[${WORKER_ID}] Health: http://localhost:${PORT}/health`);
      console.log(`[${WORKER_ID}] Metrics: http://localhost:${PORT}/metrics`);
    });

  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

// Start the worker if this is the main module
main().catch(console.error);

export { createApp, initializeWorker };
