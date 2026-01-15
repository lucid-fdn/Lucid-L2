// offchain/src/services/executionGateway.ts
// Execution Gateway - Orchestrates end-to-end inference execution

import { v4 as uuid } from 'uuid';
import { getPassportManager } from './passportManager';
import { matchComputeForModel, MatchResult } from './matchingEngine';
import { createReceipt, RunReceiptInput } from './receiptService';
import { getComputeRegistry } from './computeRegistry';
import {
  executeInference,
  executeStreamingInference,
  RuntimeType,
  InferenceRequest,
  InferenceResponse,
  StreamChunk,
  ComputeClientError,
  ComputeClientConfig,
} from './computeClient';
import { estimateTokens, estimateChatTokens } from '../utils/tokenCounter';
import { Policy } from './policyEngine';

/**
 * Input for inference execution.
 */
export interface ExecutionRequest {
  // Target model (passport ID or metadata)
  model_passport_id?: string;
  model_meta?: any;
  
  // Input
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  
  // Generation parameters
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop?: string[];
  stream?: boolean;
  
  // Policy and compute selection
  policy?: Policy;
  compute_catalog?: any[];
  compute_passport_id?: string; // Force specific compute
  
  // Tracking
  trace_id?: string;
  request_id?: string;
}

/**
 * Result from inference execution.
 */
export interface ExecutionResult {
  success: boolean;
  run_id: string;
  request_id?: string;
  trace_id?: string;
  
  // Response
  text?: string;
  finish_reason?: string;
  
  // Metrics
  tokens_in: number;
  tokens_out: number;
  ttft_ms?: number;
  total_latency_ms: number;
  
  // Execution details
  model_passport_id: string;
  compute_passport_id: string;
  runtime: string;
  policy_hash: string;
  
  // Receipt
  receipt_id?: string;
  
  // Error info
  error?: string;
  error_code?: string;
  
  // Fallback info
  used_fallback?: boolean;
  fallback_reason?: string;
}

/**
 * Streaming execution handler.
 */
export interface StreamingExecutionResult {
  run_id: string;
  request_id?: string;
  trace_id?: string;
  model_passport_id: string;
  compute_passport_id: string;
  runtime: string;
  policy_hash: string;
  stream: AsyncGenerator<StreamChunk, void, unknown>;
  // Called after stream completes to get final metrics and receipt
  finalize: () => Promise<{
    tokens_in: number;
    tokens_out: number;
    ttft_ms: number;
    total_latency_ms: number;
    receipt_id?: string;
    text: string;
  }>;
}

/**
 * OpenAI-compatible chat completion request.
 */
export interface ChatCompletionRequest {
  model: string; // "passport:<id>" or model name
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
  // LucidLayer extensions
  policy?: Policy;
  trace_id?: string;
}

/**
 * OpenAI-compatible chat completion response.
 */
export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  // LucidLayer extensions
  lucid?: {
    run_id: string;
    receipt_id?: string;
    compute_passport_id: string;
    policy_hash: string;
    ttft_ms?: number;
  };
}

/**
 * Default policy for matching.
 */
const DEFAULT_POLICY: Policy = {
  version: '1.0',
  constraints: {},
};

/**
 * Execute inference end-to-end.
 * 
 * Flow:
 * 1. Resolve model passport and metadata
 * 2. Get compute catalog (from registry or provided)
 * 3. Match compute using policy
 * 4. Execute inference against compute endpoint
 * 5. Create receipt asynchronously
 * 6. Return response with metrics
 */
export async function executeInferenceRequest(
  request: ExecutionRequest
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const run_id = `run_${uuid().replace(/-/g, '')}`;
  const request_id = request.request_id || run_id;
  const trace_id = request.trace_id;
  
  try {
    // 1. Resolve model passport and metadata
    const { model_passport_id, model_meta } = await resolveModel(request);
    
    // 2. Get compute catalog
    const compute_catalog = await getComputeCatalog(request);
    
    // 3. Match compute using policy
    const policy = request.policy || DEFAULT_POLICY;
    const { match, explain } = matchComputeForModel({
      model_meta,
      policy,
      compute_catalog,
      require_live_healthy: true,
    });
    
    if (!match) {
      return {
        success: false,
        run_id,
        request_id,
        trace_id,
        tokens_in: 0,
        tokens_out: 0,
        total_latency_ms: Date.now() - startTime,
        model_passport_id,
        compute_passport_id: '',
        runtime: '',
        policy_hash: explain.policy_hash,
        error: 'NO_COMPATIBLE_COMPUTE',
        error_code: 'NO_COMPATIBLE_COMPUTE',
      };
    }
    
    // 4. Execute inference
    const result = await executeWithFallback(
      request,
      match,
      compute_catalog,
      model_meta,
      run_id,
      startTime
    );
    
    // 5. Create receipt asynchronously (don't block response)
    createReceiptAsync({
      model_passport_id,
      compute_passport_id: result.compute_passport_id,
      policy_hash: explain.policy_hash,
      runtime: result.runtime,
      tokens_in: result.tokens_in,
      tokens_out: result.tokens_out,
      ttft_ms: result.ttft_ms || 0,
      trace_id,
      run_id,
    });
    
    return {
      success: true,
      run_id,
      request_id,
      trace_id,
      text: result.text,
      finish_reason: result.finish_reason,
      tokens_in: result.tokens_in,
      tokens_out: result.tokens_out,
      ttft_ms: result.ttft_ms,
      total_latency_ms: Date.now() - startTime,
      model_passport_id,
      compute_passport_id: result.compute_passport_id,
      runtime: result.runtime,
      policy_hash: explain.policy_hash,
      receipt_id: run_id,
      used_fallback: result.used_fallback,
      fallback_reason: result.fallback_reason,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = error instanceof ComputeClientError ? error.code : 'UNKNOWN';
    
    return {
      success: false,
      run_id,
      request_id,
      trace_id,
      tokens_in: 0,
      tokens_out: 0,
      total_latency_ms: Date.now() - startTime,
      model_passport_id: request.model_passport_id || '',
      compute_passport_id: request.compute_passport_id || '',
      runtime: '',
      policy_hash: '',
      error: errorMsg,
      error_code: errorCode,
    };
  }
}

/**
 * Execute streaming inference.
 */
export async function executeStreamingInferenceRequest(
  request: ExecutionRequest
): Promise<StreamingExecutionResult> {
  const startTime = Date.now();
  const run_id = `run_${uuid().replace(/-/g, '')}`;
  const request_id = request.request_id || run_id;
  const trace_id = request.trace_id;
  
  // 1. Resolve model passport and metadata
  const { model_passport_id, model_meta } = await resolveModel(request);
  
  // 2. Get compute catalog
  const compute_catalog = await getComputeCatalog(request);
  
  // 3. Match compute using policy
  const policy = request.policy || DEFAULT_POLICY;
  const { match, explain } = matchComputeForModel({
    model_meta,
    policy,
    compute_catalog,
    require_live_healthy: true,
  });
  
  if (!match) {
    throw new Error('NO_COMPATIBLE_COMPUTE');
  }
  
  // 4. Get compute endpoint
  const computeMeta = compute_catalog.find(
    (c: any) => c.compute_passport_id === match.compute_passport_id
  );
  const endpoint = computeMeta?.endpoints?.inference_url;
  if (!endpoint) {
    throw new Error('COMPUTE_MISSING_ENDPOINT');
  }
  
  // 5. Build inference request
  const inferenceRequest: InferenceRequest = {
    prompt: request.prompt,
    messages: request.messages,
    max_tokens: request.max_tokens,
    temperature: request.temperature,
    top_p: request.top_p,
    top_k: request.top_k,
    stop: request.stop,
    stream: true,
  };
  
  // Estimate input tokens
  const inputEstimate = request.messages
    ? estimateChatTokens(request.messages)
    : estimateTokens(request.prompt || '');
  
  // Track metrics during streaming
  let ttft_ms: number | undefined;
  let tokens_out = 0;
  let fullText = '';
  
  // Create streaming generator wrapper
  const wrappedStream = async function* (): AsyncGenerator<StreamChunk, void, unknown> {
    const stream = executeStreamingInference(
      endpoint,
      match.selected_runtime as RuntimeType,
      inferenceRequest
    );
    
    for await (const chunk of stream) {
      // Track TTFT
      if (chunk.is_first && !ttft_ms) {
        ttft_ms = Date.now() - startTime;
      }
      
      fullText += chunk.text;
      tokens_out = chunk.tokens_out || tokens_out + 1;
      
      yield chunk;
    }
  };
  
  // Finalize function to create receipt and return metrics
  const finalize = async () => {
    const total_latency_ms = Date.now() - startTime;
    
    // Create receipt
    createReceiptAsync({
      model_passport_id,
      compute_passport_id: match.compute_passport_id,
      policy_hash: explain.policy_hash,
      runtime: match.selected_runtime,
      tokens_in: inputEstimate.estimated,
      tokens_out,
      ttft_ms: ttft_ms || 0,
      trace_id,
      run_id,
    });
    
    return {
      tokens_in: inputEstimate.estimated,
      tokens_out,
      ttft_ms: ttft_ms || 0,
      total_latency_ms,
      receipt_id: run_id,
      text: fullText,
    };
  };
  
  return {
    run_id,
    request_id,
    trace_id,
    model_passport_id,
    compute_passport_id: match.compute_passport_id,
    runtime: match.selected_runtime,
    policy_hash: explain.policy_hash,
    stream: wrappedStream(),
    finalize,
  };
}

/**
 * Execute OpenAI-compatible chat completion.
 */
export async function executeChatCompletion(
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  // Parse model - can be "passport:<id>" or just a model name
  let model_passport_id: string | undefined;
  if (request.model.startsWith('passport:')) {
    model_passport_id = request.model.slice(9);
  }
  
  // Build execution request
  const execRequest: ExecutionRequest = {
    model_passport_id,
    messages: request.messages,
    max_tokens: request.max_tokens,
    temperature: request.temperature,
    top_p: request.top_p,
    stop: Array.isArray(request.stop) ? request.stop : request.stop ? [request.stop] : undefined,
    stream: false,
    policy: request.policy,
    trace_id: request.trace_id,
  };
  
  const result = await executeInferenceRequest(execRequest);
  
  if (!result.success) {
    throw new Error(result.error || 'Inference failed');
  }
  
  return {
    id: result.run_id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model_passport_id || request.model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: result.text || '',
      },
      finish_reason: result.finish_reason || 'stop',
    }],
    usage: {
      prompt_tokens: result.tokens_in,
      completion_tokens: result.tokens_out,
      total_tokens: result.tokens_in + result.tokens_out,
    },
    lucid: {
      run_id: result.run_id,
      receipt_id: result.receipt_id,
      compute_passport_id: result.compute_passport_id,
      policy_hash: result.policy_hash,
      ttft_ms: result.ttft_ms,
    },
  };
}

/**
 * Resolve model passport and metadata.
 */
async function resolveModel(request: ExecutionRequest): Promise<{
  model_passport_id: string;
  model_meta: any;
}> {
  // If model_meta provided directly, use it
  if (request.model_meta) {
    return {
      model_passport_id: request.model_meta.model_passport_id || request.model_passport_id || '',
      model_meta: request.model_meta,
    };
  }
  
  // Otherwise, fetch from passport manager
  if (!request.model_passport_id) {
    throw new Error('model_passport_id or model_meta is required');
  }
  
  const manager = getPassportManager();
  const result = await manager.getPassport(request.model_passport_id);
  
  if (!result.ok || !result.data) {
    throw new Error(`Model passport not found: ${request.model_passport_id}`);
  }
  
  if (result.data.type !== 'model') {
    throw new Error(`Passport is not a model: ${request.model_passport_id}`);
  }
  
  return {
    model_passport_id: request.model_passport_id,
    model_meta: result.data.metadata,
  };
}

/**
 * Get compute catalog from request or registry.
 */
async function getComputeCatalog(request: ExecutionRequest): Promise<any[]> {
  // If catalog provided, use it
  if (request.compute_catalog && request.compute_catalog.length > 0) {
    return request.compute_catalog;
  }
  
  // If specific compute requested, get just that one
  if (request.compute_passport_id) {
    const manager = getPassportManager();
    const result = await manager.getPassport(request.compute_passport_id);
    if (result.ok && result.data && result.data.type === 'compute') {
      return [result.data.metadata];
    }
    throw new Error(`Compute passport not found: ${request.compute_passport_id}`);
  }
  
  // Otherwise, get all active compute from passport manager
  const manager = getPassportManager();
  const result = await manager.listPassports({
    type: 'compute',
    status: 'active',
    per_page: 100,
  });
  
  return result.items.map(p => p.metadata);
}

/**
 * Execute inference with fallback logic.
 */
async function executeWithFallback(
  request: ExecutionRequest,
  match: MatchResult,
  compute_catalog: any[],
  model_meta: any,
  run_id: string,
  startTime: number
): Promise<{
  text: string;
  finish_reason: string;
  tokens_in: number;
  tokens_out: number;
  ttft_ms?: number;
  compute_passport_id: string;
  runtime: string;
  used_fallback?: boolean;
  fallback_reason?: string;
}> {
  const computeOrder = [
    { compute_passport_id: match.compute_passport_id, selected_runtime: match.selected_runtime },
    ...match.fallbacks.map(f => ({ compute_passport_id: f.compute_passport_id, selected_runtime: f.selected_runtime })),
  ];
  
  // Estimate input tokens
  const inputEstimate = request.messages
    ? estimateChatTokens(request.messages)
    : estimateTokens(request.prompt || '');
  
  let lastError: Error | null = null;
  let usedFallback = false;
  let fallbackReason: string | undefined;
  
  for (let i = 0; i < computeOrder.length; i++) {
    const { compute_passport_id, selected_runtime } = computeOrder[i];
    const runtime = selected_runtime;
    
    // Get compute metadata
    const computeMeta = compute_catalog.find(
      (c: any) => c.compute_passport_id === compute_passport_id
    );
    
    if (!computeMeta) {
      continue;
    }
    
    const endpoint = computeMeta?.endpoints?.inference_url;
    if (!endpoint) {
      continue;
    }
    
    try {
      // Build inference request
      const inferenceRequest: InferenceRequest = {
        prompt: request.prompt,
        messages: request.messages,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        top_k: request.top_k,
        stop: request.stop,
        stream: false,
      };
      
      const requestStart = Date.now();
      const response = await executeInference(
        endpoint,
        runtime as RuntimeType,
        inferenceRequest
      );
      
      const ttft_ms = Date.now() - requestStart;
      
      return {
        text: response.text,
        finish_reason: response.finish_reason,
        tokens_in: response.tokens_in || inputEstimate.estimated,
        tokens_out: response.tokens_out,
        ttft_ms,
        compute_passport_id,
        runtime,
        used_fallback: usedFallback,
        fallback_reason: fallbackReason,
      };
    } catch (error) {
      lastError = error as Error;
      
      // Mark as fallback for next iteration
      usedFallback = true;
      fallbackReason = `Primary compute (${match.compute_passport_id}) failed: ${lastError.message}`;
      
      console.warn(`Compute ${compute_passport_id} failed, trying fallback...`, lastError.message);
      
      // Update compute registry with failure
      const registry = getComputeRegistry();
      registry.upsertHeartbeat({
        compute_passport_id,
        status: 'degraded',
      });
    }
  }
  
  // All computes failed
  throw lastError || new Error('All compute endpoints failed');
}

/**
 * Create receipt asynchronously (non-blocking).
 */
function createReceiptAsync(input: RunReceiptInput): void {
  // Run in next tick to not block response
  setImmediate(() => {
    try {
      createReceipt(input);
      console.log(`📝 Receipt created for run ${input.run_id}`);
    } catch (error) {
      console.error(`Failed to create receipt for run ${input.run_id}:`, error);
    }
  });
}

/**
 * Gateway configuration.
 */
export interface GatewayConfig {
  default_max_tokens?: number;
  default_temperature?: number;
  timeout_ms?: number;
  max_retries?: number;
}

let gatewayConfig: GatewayConfig = {
  default_max_tokens: 512,
  default_temperature: 0.7,
  timeout_ms: 120000,
  max_retries: 3,
};

/**
 * Configure the gateway.
 */
export function configureGateway(config: Partial<GatewayConfig>): void {
  gatewayConfig = { ...gatewayConfig, ...config };
}

/**
 * Get current gateway configuration.
 */
export function getGatewayConfig(): GatewayConfig {
  return { ...gatewayConfig };
}
