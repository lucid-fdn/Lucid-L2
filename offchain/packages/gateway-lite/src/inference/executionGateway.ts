// offchain/src/services/executionGateway.ts
// Execution Gateway - Orchestrates end-to-end inference execution

import { v4 as uuid } from 'uuid';
import { getPassportManager } from '../../../engine/src/identity/passport/passportManager';
import { matchComputeForModel, MatchResult } from '../compute/matchingEngine';
import { createInferenceReceipt, InferenceReceiptInput } from '../../../engine/src/receipt/receiptService';
import { addReceiptToEpoch } from '../../../engine/src/epoch/services/epochService';
import { getComputeRegistry } from '../compute/computeRegistry';
import {
  executeInference,
  executeStreamingInference,
  RuntimeType,
  InferenceRequest,
  StreamChunk,
  ComputeClientError,
} from './computeClient';
import { estimateTokens, estimateChatTokens } from '../../../../src/utils/tokenCounter';
import { evaluatePolicy, Policy } from '../compute/policyEngine';
import { logger } from '../../../engine/src/shared/lib/logger';

// ============================================================================
// TRUSTGATE PROVIDER CONFIGURATION
// ============================================================================

const TRUSTGATE_URL = process.env.TRUSTGATE_URL || 'https://trustgate-api-production.up.railway.app';
const TRUSTGATE_API_KEY = process.env.TRUSTGATE_API_KEY || '';

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
  // Fallback info
  used_fallback?: boolean;
  fallback_reason?: string;
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
  policy_version: '1.0',
};

// ============================================================================
// SHARED HELPERS
// ============================================================================

/**
 * Check if a model has an API path (TrustGate).
 */
function modelHasApiPath(model_meta: any): boolean {
  return Boolean(model_meta.api_model_id || model_meta.provider_model_id || model_meta.format === 'api');
}

/**
 * Check if a model has a compute path (downloadable).
 */
function modelHasComputePath(model_meta: any): boolean {
  return model_meta.format === 'safetensors' || model_meta.format === 'gguf';
}

/**
 * Resolve the model ID to send to TrustGate.
 */
function resolveApiModelId(model_meta: any): string {
  return model_meta.api_model_id
    || model_meta.provider_model_id  // backward compat during migration
    || (model_meta.name ? model_meta.name.toLowerCase().replace(/\s+/g, '-') : 'unknown');
}

/**
 * Execute inference via TrustGate provider path (for API-based models).
 * Skips compute matching — TrustGate handles provider routing.
 * TrustGate writes receipt_events; L2's receiptConsumer handles on-chain anchoring.
 */
async function executeProviderRequest(
  request: ExecutionRequest,
  model_passport_id: string,
  model_meta: any,
  run_id: string,
  startTime: number
): Promise<ExecutionResult> {
  const request_id = request.request_id || run_id;
  const trace_id = request.trace_id;

  const apiModelId = resolveApiModelId(model_meta);

  const body: any = {
    model: apiModelId,
    max_tokens: request.max_tokens || 512,
    temperature: request.temperature ?? 0.7,
    stream: false,
  };

  if (request.messages && request.messages.length > 0) {
    body.messages = request.messages;
  } else if (request.prompt) {
    body.messages = [{ role: 'user', content: request.prompt }];
  }

  if (request.top_p !== undefined) body.top_p = request.top_p;
  if (request.stop) body.stop = request.stop;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Lucid-Model-Passport': model_passport_id,
  };
  if (TRUSTGATE_API_KEY) {
    headers['Authorization'] = `Bearer ${TRUSTGATE_API_KEY}`;
  }
  if (trace_id) {
    headers['X-Trace-ID'] = trace_id;
  }

  const policy = request.policy || DEFAULT_POLICY;
  const policyResult = evaluatePolicy({ policy });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    const response = await fetch(`${TRUSTGATE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        run_id,
        request_id,
        trace_id,
        tokens_in: 0,
        tokens_out: 0,
        total_latency_ms: Date.now() - startTime,
        model_passport_id,
        compute_passport_id: 'trustgate',
        runtime: 'trustgate',
        policy_hash: policyResult.policy_hash,
        error: `TrustGate error (${response.status}): ${errorText}`,
        error_code: response.status === 429 ? 'RATE_LIMIT' : 'PROVIDER_ERROR',
      };
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const text = choice?.message?.content || choice?.text || '';
    const finish_reason = choice?.finish_reason || 'stop';
    const tokens_in = data.usage?.prompt_tokens || 0;
    const tokens_out = data.usage?.completion_tokens || 0;

    return {
      success: true,
      run_id,
      request_id,
      trace_id,
      text,
      finish_reason,
      tokens_in,
      tokens_out,
      ttft_ms: Date.now() - startTime,
      total_latency_ms: Date.now() - startTime,
      model_passport_id,
      compute_passport_id: 'trustgate',
      runtime: 'trustgate',
      policy_hash: policyResult.policy_hash,
      receipt_id: run_id,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = error instanceof Error && error.name === 'AbortError';

    return {
      success: false,
      run_id,
      request_id,
      trace_id,
      tokens_in: 0,
      tokens_out: 0,
      total_latency_ms: Date.now() - startTime,
      model_passport_id,
      compute_passport_id: 'trustgate',
      runtime: 'trustgate',
      policy_hash: policyResult.policy_hash,
      error: isTimeout ? 'TrustGate request timeout' : errorMsg,
      error_code: isTimeout ? 'TIMEOUT' : 'PROVIDER_ERROR',
    };
  }
}

/**
 * Execute streaming inference via TrustGate provider path.
 */
async function executeProviderStreamingRequest(
  request: ExecutionRequest,
  model_passport_id: string,
  model_meta: any,
  run_id: string,
  startTime: number
): Promise<StreamingExecutionResult> {
  const request_id = request.request_id || run_id;
  const trace_id = request.trace_id;

  const apiModelId = resolveApiModelId(model_meta);

  const body: any = {
    model: apiModelId,
    max_tokens: request.max_tokens || 512,
    temperature: request.temperature ?? 0.7,
    stream: true,
  };

  if (request.messages && request.messages.length > 0) {
    body.messages = request.messages;
  } else if (request.prompt) {
    body.messages = [{ role: 'user', content: request.prompt }];
  }

  if (request.top_p !== undefined) body.top_p = request.top_p;
  if (request.stop) body.stop = request.stop;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'X-Lucid-Model-Passport': model_passport_id,
  };
  if (TRUSTGATE_API_KEY) {
    headers['Authorization'] = `Bearer ${TRUSTGATE_API_KEY}`;
  }

  const response = await fetch(`${TRUSTGATE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`TrustGate error (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    throw new Error('No response body for streaming from TrustGate');
  }

  const policy = request.policy || DEFAULT_POLICY;
  const policyResult = evaluatePolicy({ policy });

  let ttft_ms: number | undefined;
  let tokens_out = 0;
  let fullText = '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  const wrappedStream = async function* (): AsyncGenerator<StreamChunk, void, unknown> {
    let buffer = '';
    let isFirst = true;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) continue;

          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              yield { text: '', is_first: false, is_last: true, finish_reason: 'stop', tokens_out };
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];
              const chunkText = choice?.delta?.content || '';

              if (chunkText) {
                if (isFirst && !ttft_ms) {
                  ttft_ms = Date.now() - startTime;
                }
                tokens_out++;
                fullText += chunkText;

                yield { text: chunkText, is_first: isFirst, is_last: false, tokens_out };
                isFirst = false;
              }

              if (choice?.finish_reason) {
                yield { text: '', is_first: false, is_last: true, finish_reason: choice.finish_reason, tokens_out };
                return;
              }
            } catch { /* skip unparseable chunks */ }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  };

  const finalize = async () => ({
    tokens_in: estimateChatTokens(request.messages || [{ role: 'user', content: request.prompt || '' }]).estimated,
    tokens_out,
    ttft_ms: ttft_ms || 0,
    total_latency_ms: Date.now() - startTime,
    receipt_id: run_id,
    text: fullText,
  });

  return {
    run_id,
    request_id,
    trace_id,
    model_passport_id,
    compute_passport_id: 'trustgate',
    runtime: 'trustgate',
    policy_hash: policyResult.policy_hash,
    stream: wrappedStream(),
    finalize,
  };
}

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

    // Determine available paths
    const hasApiPath = modelHasApiPath(model_meta);
    const hasComputePath = modelHasComputePath(model_meta);

    // API-only models: TrustGate directly
    if (hasApiPath && !hasComputePath) {
      return executeProviderRequest(request, model_passport_id, model_meta, run_id, startTime);
    }

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
      // Dual-path: if TrustGate path is available, fall back to it
      if (hasApiPath) {
        const providerResult = await executeProviderRequest(request, model_passport_id, model_meta, run_id, startTime);
        return { ...providerResult, used_fallback: true, fallback_reason: 'No compatible compute found, routed to TrustGate' };
      }
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
    let result;
    try {
      result = await executeWithFallback(
        request,
        match,
        compute_catalog,
        model_meta,
        run_id,
        startTime
      );
    } catch (computeError) {
      if (hasApiPath) {
        const providerResult = await executeProviderRequest(request, model_passport_id, model_meta, run_id, startTime);
        return { ...providerResult, used_fallback: true, fallback_reason: 'All compute endpoints failed, routed to TrustGate' };
      }
      throw computeError;
    }
    
    // 5. Create receipt before returning response (crash-safe)
    createReceiptSync({
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

  // Determine available paths
  const hasApiPath = modelHasApiPath(model_meta);
  const hasComputePath = modelHasComputePath(model_meta);

  // API-only models: streaming via TrustGate
  if (hasApiPath && !hasComputePath) {
    return executeProviderStreamingRequest(request, model_passport_id, model_meta, run_id, startTime);
  }

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
    // Dual-path: if TrustGate path is available, fall back to streaming via TrustGate
    if (hasApiPath) {
      const fallbackResult = await executeProviderStreamingRequest(request, model_passport_id, model_meta, run_id, startTime);
      return {
        ...fallbackResult,
        used_fallback: true,
        fallback_reason: 'No compatible compute found, routed to TrustGate',
      };
    }
    throw new Error('NO_COMPATIBLE_COMPUTE');
  }
  
  // 4. Get compute endpoint
  try {
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

      // Create receipt (crash-safe)
      createReceiptSync({
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
  } catch (computeError) {
    // Dual-path: if TrustGate path is available, fall back to streaming via TrustGate
    if (hasApiPath) {
      const fallbackResult = await executeProviderStreamingRequest(request, model_passport_id, model_meta, run_id, startTime);
      return {
        ...fallbackResult,
        used_fallback: true,
        fallback_reason: 'All compute endpoints failed, routed to TrustGate',
      };
    }
    throw computeError;
  }
}

/**
 * Execute OpenAI-compatible chat completion.
 */
export async function executeChatCompletion(
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  // Parse model - can be "passport:<id>" or just a model name/passport ID directly
  let model_passport_id: string;
  if (request.model.startsWith('passport:')) {
    model_passport_id = request.model.slice(9);
  } else {
    // Treat the model string directly as a passport ID
    model_passport_id = request.model;
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
 *
 * Resolution order:
 * 1. If model_meta provided directly, use it
 * 2. Otherwise, look up passport by model_passport_id
 */
async function resolveModel(request: ExecutionRequest): Promise<{
  model_passport_id: string;
  model_meta: any;
}> {
  if (request.model_meta) {
    return {
      model_passport_id: request.model_meta.model_passport_id || request.model_passport_id || '',
      model_meta: request.model_meta,
    };
  }

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
  if (request.compute_catalog) {
    return request.compute_catalog;
  }

  if (request.compute_passport_id) {
    const manager = getPassportManager();
    const result = await manager.getPassport(request.compute_passport_id);
    if (result.ok && result.data && result.data.type === 'compute') {
      return [result.data.metadata];
    }
    throw new Error(`Compute passport not found: ${request.compute_passport_id}`);
  }

  const manager = getPassportManager();
  const result = await manager.listPassports({
    type: 'compute',
    status: 'active',
    per_page: 100,
  });

  return result.items.map((p: any) => p.metadata);
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
      
      logger.warn(`Compute ${compute_passport_id} failed, trying fallback...`, lastError.message);
      
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
 * Create receipt synchronously before returning the response.
 * Receipt is persisted to DB and wired into the current epoch for anchoring.
 * This ensures no receipts are lost on process crash.
 */
function createReceiptSync(input: InferenceReceiptInput): void {
  try {
    createInferenceReceipt(input);
    // Wire receipt into current epoch for anchoring
    addReceiptToEpoch(input.run_id!);
    logger.info(`📝 Receipt created for run ${input.run_id}`);
  } catch (error) {
    logger.error(`Failed to create receipt for run ${input.run_id}:`, error);
  }
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
