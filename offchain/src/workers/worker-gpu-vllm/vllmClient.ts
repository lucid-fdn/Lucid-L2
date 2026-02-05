/**
 * vLLM Client - OpenAI-compatible client for vLLM inference server
 * 
 * vLLM exposes an OpenAI-compatible API, so we use that interface.
 * This client handles:
 * - Chat completions
 * - Text generation
 * - Model management
 * - Health checks
 * 
 * @module vllmClient
 */

import { parseModelId, validatePinnedRevision } from './runtimeUtils';

/**
 * vLLM Chat Message
 */
export interface VllmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * vLLM Generation Options
 */
export interface VllmGenerateOptions {
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop?: string[];
  seed?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logprobs?: boolean;
  n?: number;
  stream?: boolean;
}

/**
 * vLLM Chat Completion Response
 */
export interface VllmChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: {
    index: number;
    message: VllmChatMessage;
    finish_reason: 'stop' | 'length' | 'tool_calls' | null;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * vLLM Completion Response
 */
export interface VllmCompletionResponse {
  id: string;
  object: 'text_completion';
  created: number;
  model: string;
  choices: {
    index: number;
    text: string;
    finish_reason: 'stop' | 'length' | null;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Inference Result with Metrics
 */
export interface InferenceResult<T> {
  response: T;
  metrics: {
    ttft_ms: number;  // Time to first token
    total_latency_ms: number;
    tokens_in: number;
    tokens_out: number;
    model_load_ms?: number;
    cache_hit?: boolean;
  };
}

/**
 * vLLM Model Info
 */
export interface VllmModelInfo {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  root?: string;
  parent?: string;
}

/**
 * vLLM Client for BYO Runtime Worker
 */
export class VllmClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;
  private enforcePinnedRevision: boolean;

  constructor(options: {
    baseUrl: string;
    apiKey?: string;
    timeout?: number;
    enforcePinnedRevision?: boolean;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 120000; // 2 minute default
    this.enforcePinnedRevision = options.enforcePinnedRevision ?? true;
  }

  /**
   * Make an HTTP request to vLLM server.
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`vLLM request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Check vLLM server health.
   */
  async checkHealth(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return { healthy: response.ok };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Health check failed',
      };
    }
  }

  /**
   * List available models.
   */
  async listModels(): Promise<VllmModelInfo[]> {
    const response = await this.request<{ data: VllmModelInfo[] }>('/v1/models');
    return response.data;
  }

  /**
   * Check if a specific model is loaded.
   */
  async isModelLoaded(modelId: string): Promise<boolean> {
    try {
      const models = await this.listModels();
      const { model: baseModel } = parseModelId(modelId);
      return models.some(m => m.id === baseModel || m.id === modelId);
    } catch {
      return false;
    }
  }

  /**
   * Chat completion - OpenAI-compatible endpoint.
   */
  async chatCompletion(
    modelId: string,
    messages: VllmChatMessage[],
    options: VllmGenerateOptions = {}
  ): Promise<InferenceResult<VllmChatCompletionResponse>> {
    // Validate pinned revision if enforced
    if (this.enforcePinnedRevision) {
      const validation = validatePinnedRevision(modelId);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    const { model } = parseModelId(modelId);
    const startTime = Date.now();
    let ttftMs = 0;

    const body = {
      model,
      messages,
      max_tokens: options.max_tokens,
      temperature: options.temperature,
      top_p: options.top_p,
      stop: options.stop,
      seed: options.seed,
      presence_penalty: options.presence_penalty,
      frequency_penalty: options.frequency_penalty,
      logprobs: options.logprobs,
      n: options.n || 1,
      stream: false,
    };

    // Remove undefined values
    const cleanBody = Object.fromEntries(
      Object.entries(body).filter(([_, v]) => v !== undefined)
    );

    const response = await this.request<VllmChatCompletionResponse>(
      '/v1/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify(cleanBody),
      }
    );

    const totalLatencyMs = Date.now() - startTime;
    ttftMs = Math.min(totalLatencyMs, totalLatencyMs * 0.2); // Estimate TTFT as 20% of total

    return {
      response,
      metrics: {
        ttft_ms: Math.round(ttftMs),
        total_latency_ms: totalLatencyMs,
        tokens_in: response.usage.prompt_tokens,
        tokens_out: response.usage.completion_tokens,
      },
    };
  }

  /**
   * Text completion - OpenAI-compatible endpoint.
   */
  async completion(
    modelId: string,
    prompt: string,
    options: VllmGenerateOptions = {}
  ): Promise<InferenceResult<VllmCompletionResponse>> {
    // Validate pinned revision if enforced
    if (this.enforcePinnedRevision) {
      const validation = validatePinnedRevision(modelId);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    const { model } = parseModelId(modelId);
    const startTime = Date.now();

    const body = {
      model,
      prompt,
      max_tokens: options.max_tokens,
      temperature: options.temperature,
      top_p: options.top_p,
      stop: options.stop,
      seed: options.seed,
      presence_penalty: options.presence_penalty,
      frequency_penalty: options.frequency_penalty,
      logprobs: options.logprobs,
      n: options.n || 1,
      stream: false,
    };

    const cleanBody = Object.fromEntries(
      Object.entries(body).filter(([_, v]) => v !== undefined)
    );

    const response = await this.request<VllmCompletionResponse>(
      '/v1/completions',
      {
        method: 'POST',
        body: JSON.stringify(cleanBody),
      }
    );

    const totalLatencyMs = Date.now() - startTime;
    const ttftMs = Math.min(totalLatencyMs, totalLatencyMs * 0.2);

    return {
      response,
      metrics: {
        ttft_ms: Math.round(ttftMs),
        total_latency_ms: totalLatencyMs,
        tokens_in: response.usage.prompt_tokens,
        tokens_out: response.usage.completion_tokens,
      },
    };
  }

  /**
   * Streaming chat completion.
   * 
   * Note: For receipts, we still need to track total tokens after stream completes.
   */
  async *chatCompletionStream(
    modelId: string,
    messages: VllmChatMessage[],
    options: VllmGenerateOptions = {}
  ): AsyncGenerator<{ delta: string; done: boolean }, void, unknown> {
    if (this.enforcePinnedRevision) {
      const validation = validatePinnedRevision(modelId);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    const { model } = parseModelId(modelId);

    const body = {
      model,
      messages,
      max_tokens: options.max_tokens,
      temperature: options.temperature,
      top_p: options.top_p,
      stop: options.stop,
      seed: options.seed,
      stream: true,
    };

    const cleanBody = Object.fromEntries(
      Object.entries(body).filter(([_, v]) => v !== undefined)
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(cleanBody),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`vLLM streaming request failed: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          yield { delta: '', done: true };
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              yield { delta: '', done: true };
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                yield { delta: content, done: false };
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Ensure a model is loaded (vLLM handles this automatically in most cases).
   * 
   * For vLLM, models are typically loaded at startup via --model flag.
   * This method checks if the model is available.
   */
  async ensureModel(modelId: string): Promise<{
    loaded: boolean;
    model: string;
    revision: string | null;
    error?: string;
  }> {
    const { model, revision } = parseModelId(modelId);
    
    // Check if model is loaded
    const isLoaded = await this.isModelLoaded(model);
    
    if (!isLoaded) {
      return {
        loaded: false,
        model,
        revision,
        error: `Model ${model} not loaded in vLLM. Ensure vLLM was started with --model ${model}`,
      };
    }

    return {
      loaded: true,
      model,
      revision,
    };
  }

  /**
   * Get server metrics (if available).
   */
  async getMetrics(): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/metrics`, {
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        return response.text();
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get the base URL for this client.
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Update timeout setting.
   */
  setTimeout(timeoutMs: number): void {
    this.timeout = timeoutMs;
  }
}

/**
 * Create a vLLM client from environment variables.
 * 
 * Environment variables:
 * - VLLM_BASE_URL: Base URL for vLLM server (default: http://localhost:8000)
 * - VLLM_API_KEY: Optional API key
 * - VLLM_TIMEOUT_MS: Request timeout (default: 120000)
 * - VLLM_ENFORCE_PINNED_REVISION: Whether to enforce pinned model revisions (default: true)
 */
export function createVllmClientFromEnv(): VllmClient {
  const baseUrl = process.env.VLLM_BASE_URL || 'http://localhost:8000';
  const apiKey = process.env.VLLM_API_KEY;
  const timeout = parseInt(process.env.VLLM_TIMEOUT_MS || '120000', 10);
  const enforcePinnedRevision = process.env.VLLM_ENFORCE_PINNED_REVISION !== 'false';

  return new VllmClient({
    baseUrl,
    apiKey,
    timeout,
    enforcePinnedRevision,
  });
}