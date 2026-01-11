// @lucidlayer/sdk - TypeScript Types
// All type definitions for the LucidLayer SDK

// =============================================================================
// PASSPORT TYPES
// =============================================================================

export type PassportType = 'model' | 'compute' | 'tool' | 'dataset' | 'agent';
export type PassportStatus = 'active' | 'deprecated' | 'revoked';

export interface Passport {
  passport_id: string;
  type: PassportType;
  owner: string;
  name?: string;
  description?: string;
  version?: string;
  tags?: string[];
  status: PassportStatus;
  metadata: ModelMeta | ComputeMeta | ToolMeta | DatasetMeta | AgentMeta;
  metadata_hash: string;
  created_at: number;
  updated_at: number;
  on_chain?: {
    pda?: string;
    tx?: string;
    synced_at?: number;
  };
}

export interface CreatePassportRequest {
  type: PassportType;
  owner: string;
  metadata: Record<string, any>;
  name?: string;
  description?: string;
  version?: string;
  tags?: string[];
}

export interface UpdatePassportRequest {
  metadata?: Record<string, any>;
  name?: string;
  description?: string;
  version?: string;
  tags?: string[];
  status?: PassportStatus;
}

export interface PassportFilters {
  type?: PassportType | PassportType[];
  owner?: string;
  status?: PassportStatus | PassportStatus[];
  tags?: string[];
  tag_match?: 'all' | 'any';
  search?: string;
  page?: number;
  per_page?: number;
  sort_by?: 'created_at' | 'updated_at' | 'name';
  sort_order?: 'asc' | 'desc';
}

// =============================================================================
// METADATA TYPES
// =============================================================================

export interface ModelMeta {
  name: string;
  format: string; // e.g., 'safetensors', 'gguf'
  runtime_recommended: string; // e.g., 'vllm', 'tgi', 'tensorrt'
  hf_repo?: string;
  model_type?: string;
  architecture?: string;
  license?: string;
  requirements?: {
    min_vram_gb?: number;
    max_context_length?: number;
    recommended_batch_size?: number;
  };
  quantization?: string;
  tensor_parallel_size?: number;
  [key: string]: any;
}

export interface ComputeMeta {
  name: string;
  provider_type: 'cloud' | 'depin' | 'onprem';
  regions: string[];
  hardware: {
    gpu: string;
    vram_gb: number;
    cpu_cores?: number;
    ram_gb?: number;
  };
  runtimes: RuntimeConfig[];
  endpoints?: {
    inference_url: string;
    health_url?: string;
    metrics_url?: string;
  };
  pricing?: {
    price_per_1k_tokens?: number;
    currency?: string;
  };
  [key: string]: any;
}

export interface RuntimeConfig {
  name: string; // 'vllm', 'tgi', 'tensorrt', 'openai'
  version?: string;
  max_batch_size?: number;
  max_concurrent_requests?: number;
}

export interface ToolMeta {
  name: string;
  tool_type: string;
  description?: string;
  input_schema?: Record<string, any>;
  output_schema?: Record<string, any>;
  [key: string]: any;
}

export interface DatasetMeta {
  name: string;
  format: string;
  size_bytes?: number;
  num_records?: number;
  schema?: Record<string, any>;
  [key: string]: any;
}

export interface AgentMeta {
  name: string;
  agent_type: string;
  capabilities?: string[];
  model_passport_id?: string;
  tools?: string[];
  [key: string]: any;
}

// =============================================================================
// SEARCH TYPES
// =============================================================================

export interface ModelSearchFilters {
  runtime?: string;
  format?: string;
  max_vram?: number;
  owner?: string;
  tags?: string[];
  search?: string;
  page?: number;
  per_page?: number;
}

export interface ComputeSearchFilters {
  regions?: string[];
  runtimes?: string[];
  provider_type?: string;
  min_vram?: number;
  gpu?: string;
  owner?: string;
  tags?: string[];
  search?: string;
  page?: number;
  per_page?: number;
}

// =============================================================================
// MATCHING TYPES
// =============================================================================

export interface Policy {
  version: string;
  constraints?: {
    allowed_regions?: string[];
    denied_regions?: string[];
    allowed_providers?: string[];
    denied_providers?: string[];
    min_vram_gb?: number;
    max_vram_gb?: number;
    allowed_runtimes?: string[];
    allowed_gpus?: string[];
    denied_gpus?: string[];
  };
  preferences?: {
    preferred_regions?: string[];
    preferred_providers?: string[];
    preferred_runtimes?: string[];
    prefer_low_latency?: boolean;
    prefer_low_cost?: boolean;
  };
  fallback?: {
    enabled?: boolean;
    max_attempts?: number;
  };
}

export interface MatchRequest {
  model_id: string;
  policy?: Policy;
  compute_catalog?: any[];
}

export interface MatchResult {
  success: boolean;
  match?: {
    compute_passport_id: string;
    model_passport_id: string;
    selected_runtime: string;
    fallbacks: string[];
  };
  explain?: {
    policy_hash: string;
    shortlisted: any[];
    rejected: any[];
    scores: Record<string, number>;
  };
  error?: string;
}

// =============================================================================
// EXECUTION TYPES
// =============================================================================

export interface InferenceRequest {
  model_passport_id?: string;
  model?: string; // alias for model_passport_id or "passport:<id>"
  prompt?: string;
  messages?: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop?: string[];
  stream?: boolean;
  policy?: Policy;
  compute_passport_id?: string;
  trace_id?: string;
  request_id?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

export interface InferenceResult {
  success: boolean;
  run_id: string;
  request_id?: string;
  trace_id?: string;
  text?: string;
  finish_reason?: 'stop' | 'length' | 'error';
  tokens_in: number;
  tokens_out: number;
  ttft_ms: number;
  total_latency_ms: number;
  model_passport_id: string;
  compute_passport_id: string;
  runtime: string;
  policy_hash?: string;
  receipt_id?: string;
  used_fallback?: boolean;
  fallback_reason?: string;
  error?: string;
  error_code?: string;
}

export interface StreamChunk {
  run_id: string;
  text?: string;
  is_first?: boolean;
  is_last?: boolean;
  finish_reason?: string;
  done?: boolean;
  tokens_in?: number;
  tokens_out?: number;
  ttft_ms?: number;
  total_latency_ms?: number;
  receipt_id?: string;
  error?: string;
}

// OpenAI-compatible types
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
  // LucidLayer extensions
  policy?: Policy;
  trace_id?: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  // LucidLayer extensions
  lucid?: {
    run_id: string;
    model_passport_id: string;
    compute_passport_id: string;
    runtime: string;
    policy_hash?: string;
    receipt_id?: string;
    ttft_ms: number;
    total_latency_ms: number;
    used_fallback?: boolean;
  };
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: 'stop' | 'length' | 'function_call' | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: {
    index: number;
    delta: Partial<ChatMessage>;
    finish_reason: string | null;
  }[];
}

// =============================================================================
// RECEIPT TYPES
// =============================================================================

export interface Receipt {
  run_id: string;
  model_passport_id: string;
  compute_passport_id: string;
  policy_hash: string;
  runtime: string;
  tokens_in: number;
  tokens_out: number;
  ttft_ms: number;
  total_latency_ms?: number;
  timestamp: number;
  receipt_hash: string;
  signature: string;
  merkle_leaf_index?: number;
  anchor?: {
    chain: string;
    tx: string;
    root: string;
    epoch_id: string;
  };
}

export interface ReceiptProof {
  run_id: string;
  receipt_hash: string;
  leaf_index: number;
  proof: string[];
  root: string;
}

export interface ReceiptVerification {
  valid: boolean;
  hash_valid: boolean;
  signature_valid: boolean;
  inclusion_valid: boolean;
  expected_hash?: string;
  computed_hash?: string;
  merkle_root?: string;
}

// =============================================================================
// EPOCH TYPES
// =============================================================================

export interface Epoch {
  epoch_id: string;
  project_id?: string;
  mmr_root: string;
  leaf_count: number;
  created_at: number;
  finalized_at?: number;
  status: 'open' | 'anchoring' | 'anchored' | 'failed';
  chain_tx?: string;
  error?: string;
  start_leaf_index?: number;
  end_leaf_index?: number;
}

export interface EpochFilters {
  project_id?: string;
  status?: Epoch['status'];
  page?: number;
  per_page?: number;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
}

// =============================================================================
// SDK CONFIGURATION
// =============================================================================

export interface LucidClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  headers?: Record<string, string>;
  debug?: boolean;
  retries?: number;
  retryDelay?: number;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export class LucidError extends Error {
  code: string;
  status?: number;
  details?: any;

  constructor(message: string, code: string, status?: number, details?: any) {
    super(message);
    this.name = 'LucidError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends LucidError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends LucidError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class NoCompatibleComputeError extends LucidError {
  constructor(explain?: any) {
    super('No compatible compute found for model', 'NO_COMPATIBLE_COMPUTE', 422, explain);
    this.name = 'NoCompatibleComputeError';
  }
}

export class ComputeUnavailableError extends LucidError {
  constructor(message?: string) {
    super(message || 'Compute endpoint unavailable', 'COMPUTE_UNAVAILABLE', 503);
    this.name = 'ComputeUnavailableError';
  }
}

export class TimeoutError extends LucidError {
  constructor(operation: string) {
    super(`Operation timed out: ${operation}`, 'TIMEOUT', 504);
    this.name = 'TimeoutError';
  }
}
