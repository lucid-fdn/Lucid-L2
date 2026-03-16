/**
 * BYO Runtime Worker (vLLM) - Main Entry Point
 * 
 * This worker provides GPU-backed inference using vLLM with full
 * attestation chain including runtime_hash and gpu_fingerprint.
 * 
 * Pass A Compliance: Lucid Cloud baseline on Runpod
 * - Real runtime_hash (Docker image digest)
 * - Real gpu_fingerprint (NVIDIA GPU model + VRAM)
 * - Worker-signed receipts
 * - Pinned model revisions enforced
 * 
 * @module worker-gpu-vllm
 */

import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { VllmClient } from './vllmClient';
import { QuoteService } from './quoteService';
import { WorkerSigningService, initializeWorkerSigningService } from './signingService';
import { JobExecutor, S3Config } from './jobExecutor';
import { getRuntimeHash, getGpuFingerprint } from './runtimeUtils';
import type {
  WorkerIdentity,
  QuoteRequest,
  QuoteResponse,
  JobRequest,
  JobSubmitResponse,
  JobResult,
  HealthCheckResponse,
  OfferQuote,
} from '../../../packages/engine/src/shared/types/fluidCompute';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface WorkerConfig {
  // Server
  port: number;
  host: string;
  
  // vLLM
  vllmBaseUrl: string;
  vllmApiKey?: string;
  
  // Identity
  workerId: string;
  providerPassportId: string;
  
  // Signing
  signerKeyPath?: string;
  signerKeyEnv?: string;
  
  // Supported models
  supportedModels: string[];
  
  // S3 (optional)
  s3Config?: S3Config;
  
  // Limits
  maxConcurrentJobs: number;
  jobTimeoutMs: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxRuntimeMs: number;
  
  // Quote settings
  quoteValiditySeconds: number;
  
  // Pricing (per 1M tokens)
  pricePerInputToken: number;
  pricePerOutputToken: number;
  priceCurrency: 'lamports' | 'usd_cents' | 'credits';
  
  // Security
  apiKeys: string[];
  rateLimitPerMinute: number;
  corsOrigins: string[];
  requireAuth: boolean;
  
  // Model allowlist (P0.19)
  modelAllowlist: string[];
  enforceAllowlist: boolean;
}

function loadConfig(): WorkerConfig {
  return {
    // Server
    port: parseInt(process.env.WORKER_PORT || '8080', 10),
    host: process.env.WORKER_HOST || '0.0.0.0',
    
    // vLLM
    vllmBaseUrl: process.env.VLLM_BASE_URL || 'http://localhost:8000',
    vllmApiKey: process.env.VLLM_API_KEY,
    
    // Identity
    workerId: process.env.WORKER_ID || `worker-${Date.now()}`,
    providerPassportId: process.env.PROVIDER_PASSPORT_ID || 'lucid-cloud-runpod',
    
    // Signing
    signerKeyPath: process.env.WORKER_SIGNER_KEY_PATH,
    signerKeyEnv: process.env.WORKER_SIGNER_KEY,
    
    // Supported models
    supportedModels: (process.env.SUPPORTED_MODELS || '').split(',').filter(Boolean),
    
    // S3
    s3Config: process.env.S3_BUCKET ? {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION || 'us-east-1',
      prefix: process.env.S3_PREFIX || 'outputs',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    } : undefined,
    
    // Limits
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '3', 10),
    jobTimeoutMs: parseInt(process.env.JOB_TIMEOUT_MS || '300000', 10),
    maxInputTokens: parseInt(process.env.MAX_INPUT_TOKENS || '32768', 10),
    maxOutputTokens: parseInt(process.env.MAX_OUTPUT_TOKENS || '8192', 10),
    maxRuntimeMs: parseInt(process.env.MAX_RUNTIME_MS || '600000', 10), // 10 minutes
    
    // Quote settings
    quoteValiditySeconds: parseInt(process.env.QUOTE_VALIDITY_SECONDS || '300', 10),
    
    // Pricing (defaults for A100-80GB)
    pricePerInputToken: parseInt(process.env.PRICE_PER_INPUT_TOKEN || '100', 10),
    pricePerOutputToken: parseInt(process.env.PRICE_PER_OUTPUT_TOKEN || '300', 10),
    priceCurrency: (process.env.PRICE_CURRENCY || 'lamports') as 'lamports' | 'usd_cents' | 'credits',
    
    // Security
    apiKeys: (process.env.WORKER_API_KEYS || '').split(',').filter(Boolean),
    rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '60', 10),
    corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').filter(Boolean),
    requireAuth: process.env.REQUIRE_AUTH !== 'false', // Default: require auth in production
    
    // Model allowlist (P0.19)
    modelAllowlist: (process.env.MODEL_ALLOWLIST || '').split(',').filter(Boolean),
    enforceAllowlist: process.env.ENFORCE_MODEL_ALLOWLIST !== 'false', // Default: enforce
  };
}

// ============================================================================
// WORKER STATE
// ============================================================================

let config: WorkerConfig;
let vllmClient: VllmClient;
let signingService: WorkerSigningService;
let quoteService: QuoteService;
let jobExecutor: JobExecutor;
let workerIdentity: WorkerIdentity;
let startTime: number;

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initialize(): Promise<void> {
  console.log('[Worker] Initializing BYO Runtime Worker (vLLM)...');
  
  config = loadConfig();
  startTime = Date.now();
  
  // Initialize signing service
  signingService = await initializeWorkerSigningService();
  console.log(`[Worker] Signing service initialized: ${signingService.getPublicKey()}`);
  
  // Initialize vLLM client
  vllmClient = new VllmClient({
    baseUrl: config.vllmBaseUrl,
    apiKey: config.vllmApiKey,
    timeout: config.jobTimeoutMs,
    enforcePinnedRevision: true,
  });
  console.log(`[Worker] vLLM client initialized: ${config.vllmBaseUrl}`);
  
  // Get runtime identifiers
  const runtimeHash = getRuntimeHash();
  const gpuFingerprint = getGpuFingerprint();
  
  console.log(`[Worker] Runtime hash: ${runtimeHash || 'NOT AVAILABLE'}`);
  console.log(`[Worker] GPU fingerprint: ${gpuFingerprint || 'NOT AVAILABLE'}`);
  
  if (!runtimeHash) {
    console.warn('[Worker] WARNING: No runtime_hash - receipts will have limited attestation');
  }
  if (!gpuFingerprint) {
    console.warn('[Worker] WARNING: No gpu_fingerprint - running without GPU?');
  }
  
  // Create worker identity
  workerIdentity = {
    worker_id: config.workerId,
    provider_passport_id: config.providerPassportId,
    operator_pubkey: signingService.getPublicKey(),
    execution_mode: 'byo_runtime',
    runtime_type: 'vllm',
    runtime_hash: runtimeHash,
    gpu_fingerprint: gpuFingerprint,
    supported_models: config.supportedModels,
    max_batch_size: config.maxConcurrentJobs,
    capabilities: ['text-generation', 'chat-completion'],
    status: 'online',
    registered_at: Math.floor(Date.now() / 1000),
  };
  
  // Initialize quote service
  quoteService = new QuoteService(signingService, workerIdentity, {
    quoteTtlSeconds: config.quoteValiditySeconds,
    pricing: {
      base_cost_per_1k_input: config.pricePerInputToken,
      base_cost_per_1k_output: config.pricePerOutputToken,
      currency: config.priceCurrency,
    },
  });
  console.log('[Worker] Quote service initialized');
  
  // Initialize job executor
  jobExecutor = new JobExecutor(
    vllmClient,
    workerIdentity,
    quoteService,
    signingService,
    {
      maxConcurrent: config.maxConcurrentJobs,
      jobTimeoutMs: config.jobTimeoutMs,
      s3Config: config.s3Config,
      enforcePinnedRevision: true,
    }
  );
  console.log('[Worker] Job executor initialized');
  
  // Register completion callback for logging
  jobExecutor.onJobComplete((result) => {
    if (result.status === 'completed') {
      console.log(`[Worker] Job ${result.job_id} completed - receipt: ${result.receipt_id}`);
    } else {
      console.log(`[Worker] Job ${result.job_id} failed: ${result.error?.message}`);
    }
  });
  
  console.log('[Worker] Initialization complete');
}

// ============================================================================
// EXPRESS APP
// ============================================================================

const app = express();
app.use(express.json({ limit: '10mb' }));

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

/**
 * Rate limiting state (in-memory for single instance)
 * For production with multiple instances, use Redis
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Get client identifier for rate limiting
 */
function getClientId(req: Request): string {
  // Use API key if present, otherwise IP
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return `key:${authHeader.substring(7, 15)}`; // Use first 8 chars of key
  }
  
  // Fall back to IP
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return `ip:${ips.split(',')[0].trim()}`;
  }
  return `ip:${req.socket.remoteAddress || 'unknown'}`;
}

/**
 * Rate limiting middleware
 */
function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientId = getClientId(req);
  const now = Date.now();
  const windowMs = 60000; // 1 minute window
  
  let entry = rateLimitStore.get(clientId);
  
  if (!entry || now - entry.windowStart > windowMs) {
    // New window
    entry = { count: 1, windowStart: now };
    rateLimitStore.set(clientId, entry);
  } else {
    entry.count++;
  }
  
  // Check limit
  if (entry.count > config.rateLimitPerMinute) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    res.setHeader('Retry-After', retryAfter.toString());
    res.setHeader('X-RateLimit-Limit', config.rateLimitPerMinute.toString());
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', Math.ceil((entry.windowStart + windowMs) / 1000).toString());
    
    res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
      retry_after: retryAfter,
    });
    return;
  }
  
  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', config.rateLimitPerMinute.toString());
  res.setHeader('X-RateLimit-Remaining', (config.rateLimitPerMinute - entry.count).toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil((entry.windowStart + windowMs) / 1000).toString());
  
  next();
}

/**
 * API Key authentication middleware
 * Validates Bearer token against configured API keys
 */
interface AuthenticatedRequest extends Request {
  apiKeyId?: string;
  isAuthenticated?: boolean;
}

function apiKeyAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  // Skip auth if not required (development mode)
  if (!config.requireAuth) {
    req.isAuthenticated = true;
    req.apiKeyId = 'dev-mode';
    return next();
  }
  
  // Check for API keys configured
  if (config.apiKeys.length === 0) {
    console.error('[Security] No API keys configured but auth is required');
    res.status(500).json({
      error: 'Server Configuration Error',
      message: 'Worker API authentication not properly configured',
    });
    return;
  }
  
  // Get authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'API key required. Provide via Authorization header: "Bearer <api-key>"',
    });
    return;
  }
  
  const apiKey = authHeader.substring(7);
  
  // Validate API key using constant-time comparison
  let isValid = false;
  for (const validKey of config.apiKeys) {
    if (apiKey.length === validKey.length) {
      const providedBuffer = Buffer.from(apiKey);
      const expectedBuffer = Buffer.from(validKey);
      if (crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
        isValid = true;
        break;
      }
    }
  }
  
  if (!isValid) {
    console.warn(`[Security] Invalid API key attempt from ${getClientId(req)}`);
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
    return;
  }
  
  // Authentication successful
  req.isAuthenticated = true;
  req.apiKeyId = apiKey.substring(0, 8); // Store truncated key for logging
  next();
}

/**
 * CORS middleware with configurable origins
 */
function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  
  // Check if origin is allowed
  if (config.corsOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  
  // Common CORS headers
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  
  next();
}

/**
 * Request limits validation middleware
 * Enforces max token limits on job requests
 */
function validateRequestLimits(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const body = req.body as JobRequest | undefined;
  
  if (!body) {
    return next();
  }
  
  // Check input token limit (estimated from input length)
  if (body.input?.messages) {
    const estimatedInputTokens = JSON.stringify(body.input.messages).length / 4; // Rough estimate
    if (estimatedInputTokens > config.maxInputTokens) {
      res.status(400).json({
        error: 'Request Too Large',
        message: `Estimated input tokens (${Math.ceil(estimatedInputTokens)}) exceeds max (${config.maxInputTokens})`,
        max_input_tokens: config.maxInputTokens,
      });
      return;
    }
  }
  
  // Check output token limit from parameters
  const params = body.input?.parameters as Record<string, unknown> | undefined;
  const maxTokens = (params?.max_tokens || params?.max_new_tokens) as number | undefined;
  if (maxTokens && maxTokens > config.maxOutputTokens) {
    res.status(400).json({
      error: 'Invalid Parameter',
      message: `Requested max_tokens (${maxTokens}) exceeds limit (${config.maxOutputTokens})`,
      max_output_tokens: config.maxOutputTokens,
    });
    return;
  }
  
  next();
}

// Apply global middleware
app.use(corsMiddleware);
app.use(rateLimitMiddleware);

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// HEALTH & STATUS ENDPOINTS
// ============================================================================

/**
 * GET /health
 * Health check endpoint for load balancers and monitoring.
 * Returns status: healthy | degraded | offline
 * 
 * - healthy: vLLM runtime is responding normally
 * - degraded: vLLM is having issues but worker is running
 * - offline: Cannot reach vLLM at all
 */
app.get('/health', async (_req: Request, res: Response) => {
  try {
    // Check vLLM connectivity
    const healthResult = await vllmClient.checkHealth().catch(() => ({ healthy: false, error: 'Connection failed' }));
    const vllmHealth = healthResult.healthy;
    
    const stats = jobExecutor.getStats();
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    
    // Determine status based on runtime health
    // HealthCheckResponse allows: 'healthy' | 'degraded' | 'unhealthy'
    let status: 'healthy' | 'degraded' | 'unhealthy';
    let httpStatus: number;
    let runtimeError: string | undefined;
    
    if (vllmHealth) {
      status = 'healthy';
      httpStatus = 200;
      // Update worker identity status
      workerIdentity.status = 'online';
    } else {
      // Try to determine if it's degraded or unhealthy (offline)
      const isConnectionError = healthResult.error?.includes('Connection') || 
                                 healthResult.error?.includes('ECONNREFUSED') ||
                                 healthResult.error?.includes('timeout');
      if (isConnectionError) {
        status = 'unhealthy';
        httpStatus = 503;
        workerIdentity.status = 'offline';
        runtimeError = healthResult.error || 'Runtime connection failed';
      } else {
        status = 'degraded';
        httpStatus = 503;
        workerIdentity.status = 'degraded';
        runtimeError = healthResult.error;
      }
    }
    
    const response: HealthCheckResponse & { runtime_error?: string } = {
      status,
      worker_id: workerIdentity.worker_id,
      execution_mode: 'byo_runtime',
      gpu_available: !!workerIdentity.gpu_fingerprint,
      queue_depth: stats.queued,
      uptime_seconds: uptimeSeconds,
      version: '1.0.0',
    };
    
    // Add error details if not healthy
    if (runtimeError) {
      response.runtime_error = runtimeError;
    }
    
    res.status(httpStatus).json(response);
  } catch (error) {
    workerIdentity.status = 'offline';
    res.status(500).json({
      status: 'unhealthy',
      worker_id: workerIdentity?.worker_id || 'unknown',
      execution_mode: 'byo_runtime',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /ready
 * Readiness check - verifies model is loaded and ready to serve.
 * Use this for Kubernetes readiness probes or before routing traffic.
 * 
 * Returns 200 only when:
 * - vLLM runtime is healthy
 * - At least one model is loaded
 * - Worker is not overloaded
 */
app.get('/ready', async (_req: Request, res: Response) => {
  try {
    // Check vLLM health
    const healthResult = await vllmClient.checkHealth().catch(() => ({ healthy: false }));
    
    if (!healthResult.healthy) {
      return res.status(503).json({
        ready: false,
        reason: 'runtime_unhealthy',
        message: 'vLLM runtime is not responding',
      });
    }
    
    // Check if model is loaded by querying vLLM models endpoint
    const models = await vllmClient.listModels().catch(() => null);
    
    if (!models || models.length === 0) {
      return res.status(503).json({
        ready: false,
        reason: 'no_models_loaded',
        message: 'No models are loaded in vLLM',
      });
    }
    
    // Check queue depth - if too deep, not ready for more
    const stats = jobExecutor.getStats();
    const maxQueue = config.maxConcurrentJobs * 2; // Allow 2x buffer
    
    if (stats.queued >= maxQueue) {
      return res.status(503).json({
        ready: false,
        reason: 'queue_full',
        message: `Queue depth ${stats.queued} exceeds threshold ${maxQueue}`,
        queue_depth: stats.queued,
        max_queue: maxQueue,
      });
    }
    
    // All checks passed - ready!
    res.status(200).json({
      ready: true,
      models_loaded: models.length,
      queue_depth: stats.queued,
      max_concurrent: config.maxConcurrentJobs,
      gpu_fingerprint: workerIdentity.gpu_fingerprint,
      runtime_hash: workerIdentity.runtime_hash,
    });
  } catch (error) {
    res.status(503).json({
      ready: false,
      reason: 'check_failed',
      error: error instanceof Error ? error.message : 'Readiness check failed',
    });
  }
});

/**
 * GET /identity
 * Returns worker identity information.
 */
app.get('/identity', (_req: Request, res: Response) => {
  res.json({
    ...workerIdentity,
    last_heartbeat: Math.floor(Date.now() / 1000),
  });
});

/**
 * GET /stats
 * Returns worker statistics.
 */
app.get('/stats', (_req: Request, res: Response) => {
  const stats = jobExecutor.getStats();
  res.json({
    ...stats,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    runtime_hash: workerIdentity.runtime_hash,
    gpu_fingerprint: workerIdentity.gpu_fingerprint,
  });
});

/**
 * GET /metrics
 * Returns Prometheus-format metrics for monitoring (P0.18).
 * No authentication required (for Prometheus scraping).
 */
app.get('/metrics', async (_req: Request, res: Response) => {
  const stats = jobExecutor.getStats();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  
  const lines: string[] = [
    '# HELP fc_worker_info Worker information',
    '# TYPE fc_worker_info gauge',
    `fc_worker_info{worker_id="${workerIdentity.worker_id}",runtime_hash="${workerIdentity.runtime_hash || 'none'}",gpu="${workerIdentity.gpu_fingerprint || 'none'}"} 1`,
    '',
    '# HELP fc_worker_uptime_seconds Worker uptime in seconds',
    '# TYPE fc_worker_uptime_seconds counter',
    `fc_worker_uptime_seconds ${uptimeSeconds}`,
    '',
    '# HELP fc_jobs_total Total number of jobs by status',
    '# TYPE fc_jobs_total gauge',
    `fc_jobs_total{status="queued"} ${stats.queued}`,
    `fc_jobs_total{status="running"} ${stats.running}`,
    `fc_jobs_total{status="completed"} ${stats.completed}`,
    `fc_jobs_total{status="failed"} ${stats.failed}`,
    '',
    '# HELP fc_jobs_active Current active jobs',
    '# TYPE fc_jobs_active gauge',
    `fc_jobs_active ${stats.active_jobs}`,
    '',
    '# HELP fc_max_concurrent Maximum concurrent jobs',
    '# TYPE fc_max_concurrent gauge',
    `fc_max_concurrent ${stats.max_concurrent}`,
  ];
  
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(lines.join('\n') + '\n');
});

// ============================================================================
// QUOTE ENDPOINTS
// ============================================================================

/**
 * Validate model against allowlist (P0.19)
 */
function validateModelAllowlist(modelId: string): { allowed: boolean; error?: string } {
  // If allowlist is empty or enforcement is disabled, allow all
  if (!config.enforceAllowlist || config.modelAllowlist.length === 0) {
    return { allowed: true };
  }
  
  // Check if model is in allowlist (exact match or prefix match for revisions)
  const baseModel = modelId.split('@')[0]; // Handle model@revision format
  const isAllowed = config.modelAllowlist.some(allowed => {
    return modelId === allowed || 
           baseModel === allowed || 
           modelId.startsWith(allowed + '@');
  });
  
  if (!isAllowed) {
    return {
      allowed: false,
      error: `Model not in allowlist: ${modelId}. Allowed: ${config.modelAllowlist.join(', ')}`,
    };
  }
  
  return { allowed: true };
}

/**
 * POST /quote
 * Request a signed quote for job execution.
 * Requires API key authentication.
 */
app.post('/quote', apiKeyAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quoteReq: QuoteRequest = req.body;
    
    // Validate required fields
    if (!quoteReq.offer_id || !quoteReq.model_id) {
      return res.status(400).json({
        error: 'Missing required fields: offer_id, model_id',
      });
    }
    
    // Check model allowlist (P0.19)
    const allowlistCheck = validateModelAllowlist(quoteReq.model_id);
    if (!allowlistCheck.allowed) {
      return res.status(403).json({
        error: 'Model not allowed',
        message: allowlistCheck.error,
        allowed_models: config.modelAllowlist,
      });
    }
    
    // Check model is supported by vLLM
    if (config.supportedModels.length > 0 && 
        !config.supportedModels.includes(quoteReq.model_id)) {
      return res.status(400).json({
        error: `Model not supported: ${quoteReq.model_id}`,
        supported_models: config.supportedModels,
      });
    }
    
    // Generate quote
    const quote: OfferQuote = quoteService.createQuote({
      offer_id: quoteReq.offer_id,
      model_id: quoteReq.model_id,
      policy_hash: quoteReq.policy_hash,
      estimated_input_tokens: quoteReq.estimated_input_tokens || 4096,
      estimated_output_tokens: quoteReq.estimated_output_tokens || 1024,
    });
    
    const response: QuoteResponse = {
      quote,
      valid_until: new Date(quote.expires_at * 1000).toISOString(),
    };
    
    console.log(`[Worker] Quote generated: ${quote.quote_id} for model ${quoteReq.model_id}`);
    
    res.json(response);
  } catch (error) {
    console.error('[Worker] Quote error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Quote generation failed',
    });
  }
});

// ============================================================================
// JOB ENDPOINTS
// ============================================================================

/**
 * POST /jobs
 * Submit a job for execution.
 * Requires API key authentication + validates request limits.
 */
app.post('/jobs', apiKeyAuthMiddleware, validateRequestLimits, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const jobReq: JobRequest = req.body;
    
    // Validate required fields
    if (!jobReq.job_id || !jobReq.model_id || !jobReq.offer_id || !jobReq.quote || !jobReq.input) {
      return res.status(400).json({
        error: 'Missing required fields: job_id, model_id, offer_id, quote, input',
      });
    }
    
    // Check model allowlist (P0.19)
    const allowlistCheck = validateModelAllowlist(jobReq.model_id);
    if (!allowlistCheck.allowed) {
      return res.status(403).json({
        error: 'Model not allowed',
        message: allowlistCheck.error,
        allowed_models: config.modelAllowlist,
      });
    }
    
    // Submit job
    const response: JobSubmitResponse = await jobExecutor.submitJob(jobReq);
    
    console.log(`[Worker] Job submitted: ${jobReq.job_id} - status: ${response.status}`);
    
    res.status(202).json(response);
  } catch (error) {
    console.error('[Worker] Job submission error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Job submission failed';
    
    // Map error types to status codes
    let statusCode = 500;
    if (errorMessage.includes('Quote') || errorMessage.includes('quote')) {
      statusCode = 400;
    } else if (errorMessage.includes('pinned revision')) {
      statusCode = 400;
    } else if (errorMessage.includes('Model not available')) {
      statusCode = 503;
    }
    
    res.status(statusCode).json({
      error: errorMessage,
    });
  }
});

/**
 * GET /jobs/:job_id
 * Get job status and result.
 * Requires API key authentication.
 */
app.get('/jobs/:job_id', apiKeyAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { job_id } = req.params;
    
    const result: JobResult | null = await jobExecutor.getJobResult(job_id);
    
    if (!result) {
      return res.status(404).json({
        error: `Job not found: ${job_id}`,
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error('[Worker] Get job error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get job',
    });
  }
});

/**
 * GET /v1/outputs/:job_id
 * Returns output data or presigned URL for SDK access (P0.15).
 * Requires API key authentication.
 */
app.get('/v1/outputs/:job_id', apiKeyAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { job_id } = req.params;
    
    const result = await jobExecutor.getJobResult(job_id);
    
    if (!result) {
      return res.status(404).json({ error: `Job not found: ${job_id}` });
    }
    
    if (result.status !== 'completed') {
      return res.status(400).json({
        error: `Job not completed`,
        status: result.status,
      });
    }
    
    // If no S3 ref, return output inline
    if (!result.output_ref) {
      return res.json({
        job_id,
        output: result.output,
        outputs_hash: result.outputs_hash,
        inline: true,
      });
    }
    
    // For S3, provide URL info (presigned URL in production)
    const expiresAt = Math.floor(Date.now() / 1000) + 900;
    res.json({
      job_id,
      output_ref: result.output_ref,
      outputs_hash: result.outputs_hash,
      expires_at: expiresAt,
      note: 'Use AWS SDK to generate presigned URL from output_ref',
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get output',
    });
  }
});

/**
 * DELETE /jobs/:job_id
 * Cancel a queued job.
 * Requires API key authentication.
 */
app.delete('/jobs/:job_id', apiKeyAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { job_id } = req.params;
    
    const cancelled = await jobExecutor.cancelJob(job_id);
    
    if (!cancelled) {
      return res.status(400).json({
        error: `Cannot cancel job: ${job_id} (not found or not in queue)`,
      });
    }
    
    res.json({
      job_id,
      status: 'cancelled',
    });
  } catch (error) {
    console.error('[Worker] Cancel job error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to cancel job',
    });
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Worker] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  try {
    await initialize();
    
    const config = loadConfig();
    
    app.listen(config.port, config.host, () => {
      console.log(`[Worker] BYO Runtime Worker listening on ${config.host}:${config.port}`);
      console.log(`[Worker] Worker ID: ${workerIdentity.worker_id}`);
      console.log(`[Worker] Runtime hash: ${workerIdentity.runtime_hash || 'N/A'}`);
      console.log(`[Worker] GPU fingerprint: ${workerIdentity.gpu_fingerprint || 'N/A'}`);
      console.log(`[Worker] Supported models: ${config.supportedModels.join(', ') || 'All'}`);
      console.log(`[Worker] Security: Auth ${config.requireAuth ? 'REQUIRED' : 'DISABLED'}, ` +
                  `Rate limit: ${config.rateLimitPerMinute}/min, ` +
                  `CORS: ${config.corsOrigins.join(', ')}`);
      console.log(`[Worker] Limits: Input ${config.maxInputTokens} tokens, ` +
                  `Output ${config.maxOutputTokens} tokens, ` +
                  `Runtime ${config.maxRuntimeMs}ms`);
    });
    
  } catch (error) {
    console.error('[Worker] Failed to start:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  console.log('[Worker] Received SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Worker] Received SIGINT, shutting down...');
  process.exit(0);
});

// Start worker
main();

// Export for testing
export { app, initialize, workerIdentity };