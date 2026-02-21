// offchain/src/services/computeClient.ts
// HTTP client for calling inference endpoints (vLLM, TGI, TensorRT-LLM)

/**
 * Compute Client - Handles communication with inference endpoints.
 * 
 * Supports:
 * - vLLM (OpenAI-compatible API)
 * - TGI (Text Generation Inference)
 * - TensorRT-LLM (NVIDIA format)
 * - Generic OpenAI-compatible endpoints
 */

export type RuntimeType = 'vllm' | 'tgi' | 'tensorrt' | 'openai' | 'generic';

export interface InferenceRequest {
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop?: string[];
  stream?: boolean;
  // Runtime-specific options
  frequency_penalty?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  seed?: number;
}

export interface InferenceResponse {
  text: string;
  tokens_in: number;
  tokens_out: number;
  finish_reason: 'stop' | 'length' | 'error' | 'unknown';
  model?: string;
  raw_response?: any;
}

export interface StreamChunk {
  text: string;
  is_first: boolean;
  is_last: boolean;
  finish_reason?: string;
  tokens_out?: number;
}

export interface ComputeClientConfig {
  timeout_ms?: number;
  max_retries?: number;
  retry_delay_ms?: number;
  headers?: Record<string, string>;
}

const DEFAULT_CONFIG: ComputeClientConfig = {
  timeout_ms: 120000, // 2 minutes
  max_retries: 3,
  retry_delay_ms: 1000,
};

/**
 * Error thrown when compute endpoint fails.
 */
export class ComputeClientError extends Error {
  constructor(
    message: string,
    public readonly code: 'TIMEOUT' | 'CONNECTION' | 'RATE_LIMIT' | 'AUTH' | 'INVALID_RESPONSE' | 'UNKNOWN',
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'ComputeClientError';
  }
}

/**
 * Convert inference request to vLLM/OpenAI format.
 */
function toOpenAIFormat(request: InferenceRequest, model: string = 'default'): any {
  if (request.messages && request.messages.length > 0) {
    // Chat completion format
    return {
      model,
      messages: request.messages,
      max_tokens: request.max_tokens || 512,
      temperature: request.temperature ?? 0.7,
      top_p: request.top_p ?? 1.0,
      stop: request.stop,
      stream: request.stream || false,
      frequency_penalty: request.frequency_penalty ?? 0,
      presence_penalty: request.presence_penalty ?? 0,
      seed: request.seed,
    };
  }
  
  // Completion format (legacy)
  return {
    model,
    prompt: request.prompt || '',
    max_tokens: request.max_tokens || 512,
    temperature: request.temperature ?? 0.7,
    top_p: request.top_p ?? 1.0,
    stop: request.stop,
    stream: request.stream || false,
    frequency_penalty: request.frequency_penalty ?? 0,
    presence_penalty: request.presence_penalty ?? 0,
    seed: request.seed,
  };
}

/**
 * Convert inference request to TGI format.
 */
function toTGIFormat(request: InferenceRequest): any {
  // TGI uses a different format
  let prompt = request.prompt || '';
  
  // Convert messages to prompt format for TGI
  if (request.messages && request.messages.length > 0) {
    prompt = request.messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n') + '\nassistant:';
  }
  
  return {
    inputs: prompt,
    parameters: {
      max_new_tokens: request.max_tokens || 512,
      temperature: request.temperature ?? 0.7,
      top_p: request.top_p ?? 1.0,
      top_k: request.top_k,
      stop: request.stop,
      repetition_penalty: request.repetition_penalty ?? 1.0,
      do_sample: (request.temperature ?? 0.7) > 0,
      seed: request.seed,
    },
    stream: request.stream || false,
  };
}

/**
 * Convert inference request to TensorRT-LLM format.
 */
function toTensorRTFormat(request: InferenceRequest): any {
  let prompt = request.prompt || '';
  
  // Convert messages to prompt format
  if (request.messages && request.messages.length > 0) {
    prompt = request.messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n') + '\nassistant:';
  }
  
  return {
    text_input: prompt,
    max_tokens: request.max_tokens || 512,
    temperature: request.temperature ?? 0.7,
    top_p: request.top_p ?? 1.0,
    top_k: request.top_k ?? 50,
    stop_words: request.stop?.join(','),
    stream: request.stream || false,
    random_seed: request.seed,
  };
}

/**
 * Parse OpenAI-format response.
 */
function parseOpenAIResponse(response: any, isChat: boolean): InferenceResponse {
  if (isChat) {
    const choice = response.choices?.[0];
    return {
      text: choice?.message?.content || choice?.delta?.content || '',
      tokens_in: response.usage?.prompt_tokens || 0,
      tokens_out: response.usage?.completion_tokens || 0,
      finish_reason: mapFinishReason(choice?.finish_reason),
      model: response.model,
      raw_response: response,
    };
  }
  
  const choice = response.choices?.[0];
  return {
    text: choice?.text || '',
    tokens_in: response.usage?.prompt_tokens || 0,
    tokens_out: response.usage?.completion_tokens || 0,
    finish_reason: mapFinishReason(choice?.finish_reason),
    model: response.model,
    raw_response: response,
  };
}

/**
 * Parse TGI response.
 */
function parseTGIResponse(response: any): InferenceResponse {
  // TGI returns array of generated_text
  const generated = Array.isArray(response) ? response[0] : response;
  
  return {
    text: generated?.generated_text || '',
    tokens_in: generated?.details?.prefill?.length || 0,
    tokens_out: generated?.details?.generated_tokens || 0,
    finish_reason: mapFinishReason(generated?.details?.finish_reason),
    raw_response: response,
  };
}

/**
 * Parse TensorRT-LLM response.
 */
function parseTensorRTResponse(response: any): InferenceResponse {
  return {
    text: response?.text_output || response?.output || '',
    tokens_in: response?.input_token_count || 0,
    tokens_out: response?.output_token_count || 0,
    finish_reason: mapFinishReason(response?.finish_reason),
    raw_response: response,
  };
}

/**
 * Map various finish reasons to standard format.
 */
function mapFinishReason(reason: string | undefined): 'stop' | 'length' | 'error' | 'unknown' {
  if (!reason) return 'unknown';
  const r = reason.toLowerCase();
  if (r === 'stop' || r === 'end_of_sequence' || r === 'eos') return 'stop';
  if (r === 'length' || r === 'max_tokens' || r === 'max_length') return 'length';
  if (r === 'error') return 'error';
  return 'unknown';
}

/**
 * Sleep helper for retry logic.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make HTTP request with timeout.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Execute inference against a compute endpoint.
 */
export async function executeInference(
  endpoint: string,
  runtime: RuntimeType,
  request: InferenceRequest,
  config: ComputeClientConfig = {}
): Promise<InferenceResponse> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const isChat = Boolean(request.messages && request.messages.length > 0);
  
  // Build request body based on runtime
  let body: any;
  let url = endpoint;
  
  switch (runtime) {
    case 'vllm':
    case 'openai':
    case 'generic':
      body = toOpenAIFormat(request);
      // vLLM uses /v1/completions or /v1/chat/completions
      if (!url.includes('/v1/')) {
        url = isChat ? `${url}/v1/chat/completions` : `${url}/v1/completions`;
      }
      break;
    case 'tgi':
      body = toTGIFormat(request);
      // TGI uses /generate
      if (!url.includes('/generate')) {
        url = `${url}/generate`;
      }
      break;
    case 'tensorrt':
      body = toTensorRTFormat(request);
      // TensorRT uses /v1/generate or custom
      if (!url.includes('/generate') && !url.includes('/inference')) {
        url = `${url}/v1/generate`;
      }
      break;
    default:
      // Generic OpenAI format
      body = toOpenAIFormat(request);
      if (!url.includes('/v1/')) {
        url = isChat ? `${url}/v1/chat/completions` : `${url}/v1/completions`;
      }
  }
  
  // Request options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...cfg.headers,
  };
  
  let lastError: Error | null = null;
  
  // Retry loop
  for (let attempt = 0; attempt < (cfg.max_retries || 1); attempt++) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        },
        cfg.timeout_ms || 120000
      );
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        
        // Check if retryable
        if (response.status === 429 || response.status >= 500) {
          throw new ComputeClientError(
            `Compute endpoint returned ${response.status}: ${errorText}`,
            response.status === 429 ? 'RATE_LIMIT' : 'UNKNOWN',
            response.status,
            true // Retryable
          );
        }
        
        if (response.status === 401 || response.status === 403) {
          throw new ComputeClientError(
            `Authentication failed: ${errorText}`,
            'AUTH',
            response.status,
            false
          );
        }
        
        throw new ComputeClientError(
          `Compute endpoint returned ${response.status}: ${errorText}`,
          'UNKNOWN',
          response.status,
          false
        );
      }
      
      const data = await response.json();
      
      // Parse response based on runtime
      switch (runtime) {
        case 'vllm':
        case 'openai':
        case 'generic':
          return parseOpenAIResponse(data, isChat);
        case 'tgi':
          return parseTGIResponse(data);
        case 'tensorrt':
          return parseTensorRTResponse(data);
        default:
          return parseOpenAIResponse(data, isChat);
      }
    } catch (error: any) {
      lastError = error;
      
      // Check for abort (timeout)
      if (error.name === 'AbortError') {
        throw new ComputeClientError(
          'Request timeout',
          'TIMEOUT',
          undefined,
          true
        );
      }
      
      // Check if retryable
      if (error instanceof ComputeClientError && error.retryable && attempt < (cfg.max_retries || 1) - 1) {
        console.warn(`Compute request failed (attempt ${attempt + 1}), retrying...`, error.message);
        await sleep((cfg.retry_delay_ms || 1000) * (attempt + 1));
        continue;
      }
      
      // Connection errors are retryable
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        if (attempt < (cfg.max_retries || 1) - 1) {
          console.warn(`Connection failed (attempt ${attempt + 1}), retrying...`);
          await sleep((cfg.retry_delay_ms || 1000) * (attempt + 1));
          continue;
        }
        throw new ComputeClientError(
          `Connection failed: ${error.message}`,
          'CONNECTION',
          undefined,
          false
        );
      }
      
      throw error;
    }
  }
  
  // All retries exhausted
  throw lastError || new ComputeClientError('All retries exhausted', 'UNKNOWN');
}

/**
 * Execute streaming inference against a compute endpoint.
 * Returns an async generator that yields chunks.
 */
export async function* executeStreamingInference(
  endpoint: string,
  runtime: RuntimeType,
  request: InferenceRequest,
  config: ComputeClientConfig = {}
): AsyncGenerator<StreamChunk, void, unknown> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const isChat = Boolean(request.messages && request.messages.length > 0);
  
  // Build request body based on runtime
  let body: any;
  let url = endpoint;
  
  switch (runtime) {
    case 'vllm':
    case 'openai':
    case 'generic':
      body = toOpenAIFormat({ ...request, stream: true });
      if (!url.includes('/v1/')) {
        url = isChat ? `${url}/v1/chat/completions` : `${url}/v1/completions`;
      }
      break;
    case 'tgi':
      body = toTGIFormat({ ...request, stream: true });
      if (!url.includes('/generate')) {
        url = `${url}/generate_stream`;
      }
      break;
    case 'tensorrt':
      body = toTensorRTFormat({ ...request, stream: true });
      if (!url.includes('/generate')) {
        url = `${url}/v1/generate_stream`;
      }
      break;
    default:
      body = toOpenAIFormat({ ...request, stream: true });
      if (!url.includes('/v1/')) {
        url = isChat ? `${url}/v1/chat/completions` : `${url}/v1/completions`;
      }
  }
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    ...cfg.headers,
  };
  
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
    cfg.timeout_ms || 120000
  );
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new ComputeClientError(
      `Compute endpoint returned ${response.status}: ${errorText}`,
      response.status === 429 ? 'RATE_LIMIT' : 'UNKNOWN',
      response.status
    );
  }
  
  if (!response.body) {
    throw new ComputeClientError('No response body for streaming', 'INVALID_RESPONSE');
  }
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let isFirst = true;
  let totalTokens = 0;
  
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
          
          // Check for end of stream
          if (data === '[DONE]') {
            yield {
              text: '',
              is_first: false,
              is_last: true,
              finish_reason: 'stop',
              tokens_out: totalTokens,
            };
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            let text = '';
            let finishReason: string | undefined;
            
            // Parse based on runtime format
            if (runtime === 'tgi') {
              text = parsed.token?.text || '';
              finishReason = parsed.details?.finish_reason;
            } else {
              // OpenAI/vLLM format
              const choice = parsed.choices?.[0];
              if (isChat) {
                text = choice?.delta?.content || '';
              } else {
                text = choice?.text || '';
              }
              finishReason = choice?.finish_reason;
            }
            
            if (text) {
              totalTokens++;
              yield {
                text,
                is_first: isFirst,
                is_last: Boolean(finishReason),
                finish_reason: finishReason,
                tokens_out: totalTokens,
              };
              isFirst = false;
            }
            
            if (finishReason) {
              return;
            }
          } catch (parseError) {
            console.warn('Failed to parse SSE chunk:', parseError);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Check if a compute endpoint is healthy.
 */
export async function checkEndpointHealth(
  endpoint: string,
  timeoutMs: number = 5000
): Promise<{ healthy: boolean; latency_ms?: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    // Try /health first (common pattern)
    let healthUrl = endpoint;
    if (!healthUrl.endsWith('/health')) {
      healthUrl = `${endpoint}/health`;
    }
    
    const response = await fetchWithTimeout(
      healthUrl,
      { method: 'GET' },
      timeoutMs
    );
    
    const latency_ms = Date.now() - startTime;
    
    if (response.ok) {
      return { healthy: true, latency_ms };
    }
    
    // Try /v1/models as fallback (OpenAI-compatible)
    const modelsUrl = endpoint.replace(/\/health$/, '') + '/v1/models';
    const modelsResponse = await fetchWithTimeout(
      modelsUrl,
      { method: 'GET' },
      timeoutMs - latency_ms
    );
    
    return {
      healthy: modelsResponse.ok,
      latency_ms: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      healthy: false,
      latency_ms: Date.now() - startTime,
      error: error.message,
    };
  }
}
