/**
 * Fluid Compute v0 - TypeScript Types
 * 
 * Generated from JSON Schemas in /schemas/
 * These types are used throughout the offchain service and workers.
 * 
 * @module fluidCompute
 */

// ============================================================================
// EXECUTION MODES
// ============================================================================

/**
 * Execution modes define how inference is performed
 * and what attestation guarantees are available.
 */
export type ExecutionMode = 'byo_runtime' | 'managed_endpoint';

/**
 * BYO Runtime: Full control over execution environment.
 * - Worker controls container/runtime
 * - runtime_hash = Docker image digest
 * - gpu_fingerprint = actual GPU hardware
 * - Full attestation chain
 */
export const BYO_RUNTIME: ExecutionMode = 'byo_runtime';

/**
 * Managed Endpoint: Execution delegated to external service.
 * - Worker proxies to HF/other inference APIs
 * - runtime_hash = null (unavailable)
 * - gpu_fingerprint = null (unavailable)
 * - Limited attestation (execution not self-controlled)
 */
export const MANAGED_ENDPOINT: ExecutionMode = 'managed_endpoint';

// ============================================================================
// OFFER QUOTE
// ============================================================================

/**
 * Price information for a quote or offer.
 */
export interface Price {
  /** Price amount in the smallest unit of the currency */
  amount: number;
  /** Currency for the price */
  currency: 'lamports' | 'usd_cents' | 'credits';
}

/**
 * Capacity hints for client-side scheduling decisions.
 */
export interface CapacityHint {
  /** Current available execution slots on this worker */
  available_slots?: number;
  /** Estimated wait time in milliseconds before execution starts */
  estimated_wait_ms?: number;
  /** Current number of jobs in queue */
  queue_depth?: number;
}

/**
 * OfferQuote represents a time-limited, bound pricing commitment
 * from a compute provider for executing a specific model.
 */
export interface OfferQuote {
  /** UUID nonce - prevents replay attacks */
  quote_id: string;
  /** Compute offer passport ID */
  offer_id: string;
  /** On-chain ComputeOfferPassport ID (Solana PDA) - links execution to on-chain registry */
  compute_offer_passport_id?: string;
  /** Model passport ID (or HF model ID) */
  model_id: string;
  /** Policy hash - binds quote to specific policy terms */
  policy_hash: string;
  /** Maximum input tokens this quote covers */
  max_input_tokens: number;
  /** Maximum output tokens this quote covers */
  max_output_tokens: number;
  /** Price for this execution */
  price: Price;
  /** Unix timestamp (seconds) - quote expires after this time */
  expires_at: number;
  /** Optional capacity hints */
  capacity_hint?: CapacityHint;
  /** SHA256 hash of additional terms/pricing rules document */
  terms_hash?: string;
  /** ed25519 public key of the worker that issued this quote */
  worker_pubkey?: string;
  /** SHA256 hash of canonical quote body */
  quote_hash: string;
  /** ed25519 signature of quote_hash by worker */
  quote_signature: string;
}

// ============================================================================
// JOB REQUEST
// ============================================================================

/**
 * Chat message for chat completion models.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string;
  name?: string;
}

/**
 * Input payload for model execution.
 */
export interface JobInput {
  /** Text prompt for completion models */
  prompt?: string;
  /** Chat messages for chat completion models */
  messages?: ChatMessage[];
  /** Base64 encoded images or URLs for multimodal models */
  images?: string[];
  /** Base64 encoded audio or URL for audio models */
  audio?: string;
  /** Allow additional fields */
  [key: string]: unknown;
}

/**
 * Generation options for job execution.
 */
export interface JobOptions {
  /** Maximum tokens to generate */
  max_tokens?: number;
  /** Sampling temperature */
  temperature?: number;
  /** Top-p (nucleus) sampling */
  top_p?: number;
  /** Top-k sampling */
  top_k?: number;
  /** Stop sequences */
  stop?: string[];
  /** Random seed for reproducibility */
  seed?: number;
  /** Enable streaming response */
  stream?: boolean;
  /** Publish output to IPFS after S3 storage */
  publish_ipfs?: boolean;
  /** Store input blob for audit trail */
  store_input?: boolean;
}

/**
 * A job submission request that binds a quote to a specific input.
 */
export interface JobRequest {
  /** Unique identifier for this job */
  job_id: string;
  /** Model passport ID or HuggingFace model ID */
  model_id: string;
  /** Compute offer passport ID */
  offer_id: string;
  /** On-chain ComputeOfferPassport ID (Solana PDA) - links execution to on-chain registry */
  compute_offer_passport_id?: string;
  /** The quote that authorizes this execution */
  quote: OfferQuote;
  /** Input payload for the model execution */
  input: JobInput;
  /** Optional URI to encrypted input blob */
  input_ref?: string;
  /** Generation options */
  options?: JobOptions;
  /** Optional trace ID for distributed tracing */
  trace_id?: string;
  /** Optional webhook URL to POST result when job completes */
  callback_url?: string;
  /** SHA256 hash of the job request */
  job_hash: string;
}

// ============================================================================
// JOB RESULT
// ============================================================================

/**
 * Job execution status.
 */
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Structured error codes for job failures.
 */
export type JobErrorCode =
  | 'QUOTE_EXPIRED'
  | 'INVALID_QUOTE_SIGNATURE'
  | 'QUOTE_HASH_MISMATCH'
  | 'MODEL_MISMATCH'
  | 'OFFER_MISMATCH'
  | 'INPUT_EXCEEDS_QUOTE'
  | 'MODEL_LOAD_FAILED'
  | 'MODEL_NOT_FOUND'
  | 'INFERENCE_TIMEOUT'
  | 'INFERENCE_ERROR'
  | 'OUTPUT_STORAGE_FAILED'
  | 'GPU_OOM'
  | 'GPU_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'CANCELLED';

/**
 * Output from model execution.
 */
export interface JobOutput {
  /** Generated text for text generation models */
  text?: string;
  /** OpenAI-compatible choices array */
  choices?: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  /** Vector embeddings for embedding models */
  embeddings?: number[];
  /** Generated images for image generation models */
  images?: string[];
  /** Allow additional fields */
  [key: string]: unknown;
}

/**
 * Performance metrics for job execution.
 */
export interface JobMetrics {
  /** Time to first token in milliseconds */
  ttft_ms?: number;
  /** 95th percentile token generation latency */
  p95_ms?: number;
  /** Number of input tokens processed */
  tokens_in: number;
  /** Number of output tokens generated */
  tokens_out: number;
  /** Total execution time in milliseconds */
  total_latency_ms?: number;
  /** Time spent waiting in queue */
  queue_wait_ms?: number;
  /** Time spent loading model (0 if cache hit) */
  model_load_ms?: number;
  /** Whether the model was already loaded in cache */
  cache_hit?: boolean;
}

/**
 * Error information for failed jobs.
 */
export interface JobError {
  /** Structured error code */
  code: JobErrorCode;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

/**
 * Result of a job execution.
 */
export interface JobResult {
  /** Unique identifier for this job */
  job_id: string;
  /** Current status of the job */
  status: JobStatus;
  /** The actual output from the model execution */
  output?: JobOutput;
  /** URI to stored output (S3 or IPFS) */
  output_ref?: string;
  /** SHA256 hash of the canonical JSON output */
  outputs_hash?: string;
  /** IPFS CID if output was published to IPFS */
  ipfs_cid?: string;
  /** Performance metrics */
  metrics?: JobMetrics;
  /** Error information when status is 'failed' */
  error?: JobError;
  /** ID of the receipt created for this job */
  receipt_id?: string;
  /** Unix timestamp when execution started */
  start_ts?: number;
  /** Unix timestamp when execution completed */
  end_ts?: number;
  /** ID of the worker that executed this job */
  worker_id?: string;
  /** Execution mode used */
  execution_mode?: ExecutionMode;
}

// ============================================================================
// WORKER IDENTITY
// ============================================================================

/**
 * Runtime type for inference.
 */
export type RuntimeType = 'vllm' | 'tgi' | 'hf-inference-api' | 'openai-compatible' | 'custom';

/**
 * Worker operational status.
 */
export type WorkerStatus = 'online' | 'offline' | 'degraded' | 'draining';

/**
 * Inference capability types.
 */
export type InferenceCapability =
  | 'text-generation'
  | 'chat-completion'
  | 'embeddings'
  | 'image-generation'
  | 'image-to-text'
  | 'speech-to-text'
  | 'text-to-speech'
  | 'code-generation';

/**
 * Worker API endpoints.
 */
export interface WorkerEndpoints {
  /** URL for quote requests */
  quote_url?: string;
  /** URL for job submission */
  jobs_url?: string;
  /** URL for health checks */
  health_url?: string;
  /** URL for Prometheus metrics */
  metrics_url?: string;
}

/**
 * Worker identity binds a physical/virtual compute node
 * to a cryptographic identity for receipt signing.
 */
export interface WorkerIdentity {
  /** Unique identifier for this worker instance */
  worker_id: string;
  /** Passport ID for the compute provider */
  provider_passport_id: string;
  /** ed25519 public key (hex) for signing */
  operator_pubkey: string;
  /** Execution mode this worker operates in */
  execution_mode: ExecutionMode;
  /** Runtime type this worker uses */
  runtime_type?: RuntimeType;
  /** Docker image digest of the runtime container (null for managed_endpoint) */
  runtime_hash: string | null;
  /** GPU hardware fingerprint (null for managed_endpoint) */
  gpu_fingerprint: string | null;
  /** Number of GPUs available */
  gpu_count?: number;
  /** Inference capabilities */
  capabilities?: InferenceCapability[];
  /** Maximum batch size */
  max_batch_size?: number;
  /** Maximum context length (tokens) */
  max_context_length?: number;
  /** List of model IDs this worker can serve */
  supported_models?: string[];
  /** Geographic region */
  region?: string;
  /** API endpoints */
  endpoints?: WorkerEndpoints;
  /** Current operational status */
  status?: WorkerStatus;
  /** Unix timestamp of last heartbeat */
  last_heartbeat?: number;
  /** Unix timestamp when registered */
  registered_at?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// EXTENDED RECEIPT
// ============================================================================

/**
 * Signer type for receipts.
 */
export type SignerType = 'orchestrator' | 'compute' | 'worker';

/**
 * Receipt metrics.
 */
export interface ReceiptMetrics {
  /** Time to first token in milliseconds */
  ttft_ms: number;
  /** 95th percentile token generation latency */
  p95_ms?: number;
  /** Number of input tokens processed */
  tokens_in: number;
  /** Number of output tokens generated */
  tokens_out: number;
  /** Total execution time in milliseconds */
  total_latency_ms?: number;
  /** Time spent waiting in queue */
  queue_wait_ms?: number;
  /** Time spent loading model */
  model_load_ms?: number;
  /** Whether the model was already loaded */
  cache_hit?: boolean;
}

/**
 * On-chain anchoring information.
 */
export interface ReceiptAnchor {
  /** Blockchain where this receipt is anchored */
  chain?: 'solana';
  /** Transaction signature/hash */
  tx?: string;
  /** Merkle root that includes this receipt */
  root?: string;
  /** Epoch ID this receipt was anchored in */
  epoch_id?: string;
}

/**
 * Extended receipt body for Fluid Compute v0.
 */
export interface ExtendedReceiptBody {
  // Schema version
  schema_version: '1.0';
  
  // Core identifiers
  run_id: string;
  timestamp: number;
  trace_id?: string;
  
  // Model & Compute binding
  model_passport_id: string;
  compute_passport_id: string;
  /** On-chain ComputeOfferPassport ID (Solana PDA) - links execution to specific compute offer */
  compute_offer_passport_id?: string;
  
  // Policy binding
  policy_hash: string;
  
  // Quote binding (NEW in v0)
  job_hash?: string;
  quote_hash?: string;
  
  // Worker identity (NEW in v0)
  node_id?: string;
  runtime_hash?: string | null;
  gpu_fingerprint?: string | null;
  
  // Output verification (NEW in v0)
  outputs_hash?: string;
  output_ref?: string;
  
  // Execution metadata (NEW in v0)
  execution_mode?: ExecutionMode;
  start_ts?: number;
  end_ts?: number;
  
  // Metrics
  runtime: string;
  metrics: ReceiptMetrics;
  
  // Audit trail (NEW in v0)
  input_ref?: string;
  
  // Structured errors (NEW in v0)
  error_code?: string;
  error_message?: string;
  
  // Legacy optional fields
  image_hash?: string;
  model_hash?: string;
  attestation?: Record<string, unknown>;
}

/**
 * Signed receipt with signature envelope.
 */
export interface SignedReceipt extends ExtendedReceiptBody {
  /** SHA256 hash of the canonical JSON receipt body */
  receipt_hash: string;
  /** ed25519 signature of receipt_hash */
  receipt_signature: string;
  /** ed25519 public key of the signer */
  signer_pubkey: string;
  /** Type of entity that signed this receipt */
  signer_type: SignerType;
  /** On-chain anchoring information */
  anchor?: ReceiptAnchor;
  /** Internal tracking (not in schema) */
  _mmr_leaf_index?: number;
}

// ============================================================================
// COMPUTE OFFER
// ============================================================================

/**
 * GPU types supported.
 */
export type GPUType =
  | 'NVIDIA-A100-40GB'
  | 'NVIDIA-A100-80GB'
  | 'NVIDIA-H100-80GB'
  | 'NVIDIA-A10G'
  | 'NVIDIA-L4'
  | 'NVIDIA-T4'
  | 'NVIDIA-V100'
  | 'NVIDIA-RTX4090'
  | 'NVIDIA-RTX3090'
  | 'AMD-MI250X'
  | 'AMD-MI300X'
  | 'VIRTUAL';

/**
 * SLA tiers.
 */
export type SLATier = 'best-effort' | 'standard' | 'premium' | 'enterprise';

/**
 * Compute offer status.
 */
export type ComputeOfferStatus = 'active' | 'inactive' | 'deprecated' | 'coming_soon';

/**
 * Pricing information for a compute offer.
 */
export interface OfferPricing {
  /** Price per input token */
  per_input_token: number;
  /** Price per output token */
  per_output_token: number;
  /** Price per second of execution */
  per_second?: number;
  /** Minimum charge per job */
  minimum_charge?: number;
  /** Currency for prices */
  currency: 'lamports' | 'usd_cents' | 'credits';
}

/**
 * SLA terms for a compute offer.
 */
export interface OfferSLA {
  /** SLA tier */
  tier?: SLATier;
  /** Target uptime percentage */
  uptime_target?: number;
  /** Maximum queue wait time in milliseconds */
  max_queue_wait_ms?: number;
  /** Maximum time to first token in milliseconds */
  max_ttft_ms?: number;
  /** Support response time in hours */
  support_response_hours?: number;
}

/**
 * Usage limits for a compute offer.
 */
export interface OfferLimits {
  /** Maximum input tokens per request */
  max_input_tokens?: number;
  /** Maximum output tokens per request */
  max_output_tokens?: number;
  /** Rate limit: requests per minute */
  requests_per_minute?: number;
  /** Rate limit: tokens per minute */
  tokens_per_minute?: number;
  /** Maximum concurrent requests */
  concurrent_requests?: number;
}

/**
 * Available capacity for a compute offer.
 */
export interface OfferCapacity {
  /** Currently available execution slots */
  slots?: number;
  /** Current queue depth */
  queue_depth?: number;
  /** Estimated wait time in milliseconds */
  estimated_wait_ms?: number;
  /** Unix timestamp of last capacity update */
  last_updated?: number;
}

/**
 * A compute offer represents available GPU capacity.
 */
export interface ComputeOffer {
  /** Unique identifier for this compute offer */
  offer_id: string;
  /** Passport ID of the compute provider */
  provider_passport_id: string;
  /** Human-readable name */
  display_name?: string;
  /** Description */
  description?: string;
  /** GPU hardware type */
  gpu_type: GPUType;
  /** GPU VRAM in gigabytes */
  vram_gb: number;
  /** Number of GPUs */
  gpu_count?: number;
  /** Geographic region */
  region: string;
  /** Execution mode */
  execution_mode?: ExecutionMode;
  /** Supported runtimes */
  supported_runtimes?: RuntimeType[];
  /** Supported model IDs */
  supported_models?: string[];
  /** Maximum context length (tokens) */
  max_context_length?: number;
  /** Maximum concurrent requests */
  max_batch_size?: number;
  /** Inference capabilities */
  capabilities?: InferenceCapability[];
  /** Pricing information */
  pricing: OfferPricing;
  /** Service Level Agreement */
  sla?: OfferSLA;
  /** Usage limits */
  limits?: OfferLimits;
  /** Policy tags for matching */
  policy_tags?: string[];
  /** API endpoints */
  endpoints?: {
    quote_url?: string;
    jobs_url?: string;
  };
  /** Current status */
  status: ComputeOfferStatus;
  /** Real-time capacity information */
  available_capacity?: OfferCapacity;
  /** ISO timestamp when created */
  created_at?: string;
  /** ISO timestamp when last updated */
  updated_at?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// UTILITY TYPES & FUNCTIONS
// ============================================================================

/**
 * Input for creating a receipt with extended fields.
 */
export interface ExtendedRunReceiptInput {
  // Required
  model_passport_id: string;
  compute_passport_id: string;
  /** On-chain ComputeOfferPassport ID (Solana PDA) - optional, links to specific offer */
  compute_offer_passport_id?: string;
  policy_hash: string;
  runtime: string;
  tokens_in: number;
  tokens_out: number;
  ttft_ms: number;
  
  // Optional base fields
  run_id?: string;
  p95_ms?: number;
  trace_id?: string;
  image_hash?: string;
  model_hash?: string;
  attestation?: Record<string, unknown>;
  
  // Extended fields (NEW in v0)
  execution_mode?: ExecutionMode;
  job_hash?: string;
  quote_hash?: string;
  node_id?: string;
  runtime_hash?: string | null;
  gpu_fingerprint?: string | null;
  outputs_hash?: string;
  output_ref?: string;
  start_ts?: number;
  end_ts?: number;
  input_ref?: string;
  error_code?: string;
  error_message?: string;
  total_latency_ms?: number;
  queue_wait_ms?: number;
  model_load_ms?: number;
  cache_hit?: boolean;
}

/**
 * Quote request input.
 */
export interface QuoteRequest {
  offer_id: string;
  model_id: string;
  estimated_input_tokens?: number;
  estimated_output_tokens?: number;
  policy_hash?: string;
}

/**
 * Quote response.
 */
export interface QuoteResponse {
  quote: OfferQuote;
  valid_until: string;
}

/**
 * Job submission response.
 */
export interface JobSubmitResponse {
  job_id: string;
  status: JobStatus;
  queue_position?: number;
  estimated_wait_ms?: number;
}

/**
 * Health check response.
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  worker_id: string;
  execution_mode: ExecutionMode;
  gpu_available?: boolean;
  gpu_utilization?: number;
  queue_depth?: number;
  uptime_seconds?: number;
  version?: string;
}
