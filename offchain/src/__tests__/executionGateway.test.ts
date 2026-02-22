// __tests__/executionGateway.test.ts
// Tests for the Execution Gateway service

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock external dependencies before imports
const mockFetch = jest.fn<typeof fetch>();
(global as any).fetch = mockFetch;

// Mock passportManager
const mockGetPassport = jest.fn<() => Promise<any>>();
const mockListPassports = jest.fn<() => Promise<any>>();
jest.mock('../services/passportManager', () => ({
  getPassportManager: () => ({
    getPassport: mockGetPassport,
    listPassports: mockListPassports,
  }),
}));

// Mock computeRegistry
const mockGetLiveState = jest.fn<(id: string) => any>();
const mockUpsertHeartbeat = jest.fn<() => any>();
jest.mock('../services/computeRegistry', () => ({
  getComputeRegistry: () => ({
    getLiveState: mockGetLiveState,
    upsertHeartbeat: mockUpsertHeartbeat,
    isHealthy: (id: string) => {
      const state = mockGetLiveState(id);
      return state?.status === 'healthy';
    },
  }),
}));

// Mock receiptService
const mockCreateReceipt = jest.fn<() => any>();
jest.mock('../services/receiptService', () => ({
  createReceipt: mockCreateReceipt,
}));

import {
  executeInferenceRequest,
  executeStreamingInferenceRequest,
  executeChatCompletion,
  configureGateway,
  getGatewayConfig,
  ExecutionRequest,
  ChatCompletionRequest,
} from '../services/executionGateway';
import { estimateTokens, estimateChatTokens } from '../utils/tokenCounter';

describe('Execution Gateway', () => {
  // Sample model metadata
  const sampleModelMeta = {
    schema_version: '1.0',
    model_passport_id: 'model_test123',
    name: 'Test Model',
    format: 'safetensors',
    runtime_recommended: 'vllm',
    requirements: {
      min_vram_gb: 16,
    },
  };

  // Sample compute metadata
  const sampleComputeMeta = {
    schema_version: '1.0',
    compute_passport_id: 'compute_test123',
    provider_type: 'onprem',
    hardware: {
      gpu: 'A100',
      vram_gb: 80,
      cpu_cores: 32,
      memory_gb: 256,
    },
    runtimes: [
      { name: 'vllm', version: '0.4.0' },
      { name: 'tgi', version: '1.4.0' },
    ],
    regions: ['us-east'],
    endpoints: {
      inference_url: 'http://localhost:8000/v1/completions',
    },
  };

  // Fallback compute metadata
  const fallbackComputeMeta = {
    schema_version: '1.0',
    compute_passport_id: 'compute_fallback456',
    provider_type: 'cloud',
    hardware: {
      gpu: 'A10G',
      vram_gb: 24,
      cpu_cores: 8,
      memory_gb: 64,
    },
    runtimes: [
      { name: 'vllm', version: '0.3.0' },
    ],
    regions: ['us-east'],
    endpoints: {
      inference_url: 'http://localhost:8001/v1/completions',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    mockGetPassport.mockResolvedValue({
      ok: true,
      data: {
        id: 'model_test123',
        type: 'model',
        metadata: sampleModelMeta,
      },
    });

    mockListPassports.mockResolvedValue({
      items: [
        { id: 'compute_test123', type: 'compute', metadata: sampleComputeMeta },
      ],
    });

    mockGetLiveState.mockImplementation((id: string) => {
      if (id === 'compute_test123' || id === 'compute_fallback456') {
        return { status: 'healthy', queue_depth: 0 };
      }
      return null;
    });

    mockCreateReceipt.mockReturnValue({
      run_id: 'run_test123',
      receipt_hash: 'hash123',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('executeInferenceRequest', () => {
    it('should execute inference successfully with model_meta', async () => {
      // Mock successful inference response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            text: 'Hello, world!',
            finish_reason: 'stop',
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
          },
        }),
      } as Response);

      const request: ExecutionRequest = {
        model_meta: sampleModelMeta,
        prompt: 'Say hello',
        max_tokens: 100,
        compute_catalog: [sampleComputeMeta],
      };

      const result = await executeInferenceRequest(request);

      expect(result.success).toBe(true);
      expect(result.text).toBe('Hello, world!');
      expect(result.finish_reason).toBe('stop');
      expect(result.model_passport_id).toBe('model_test123');
      expect(result.compute_passport_id).toBe('compute_test123');
      expect(result.runtime).toBe('vllm');
      expect(result.run_id).toMatch(/^run_/);
      expect(result.tokens_in).toBeGreaterThan(0);
      expect(result.tokens_out).toBe(5);
    });

    it('should execute inference with model_passport_id lookup', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            text: 'Response from model',
            finish_reason: 'stop',
          }],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 10,
          },
        }),
      } as Response);

      const request: ExecutionRequest = {
        model_passport_id: 'model_test123',
        prompt: 'Test prompt',
        compute_catalog: [sampleComputeMeta],
      };

      const result = await executeInferenceRequest(request);

      expect(result.success).toBe(true);
      expect(mockGetPassport).toHaveBeenCalledWith('model_test123');
    });

    it('should return error when no compatible compute found', async () => {
      // Empty compute catalog - no compatible compute
      const request: ExecutionRequest = {
        model_meta: sampleModelMeta,
        prompt: 'Test',
        compute_catalog: [],
      };

      const result = await executeInferenceRequest(request);

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('NO_COMPATIBLE_COMPUTE');
    });

    it('should return error when model passport not found', async () => {
      mockGetPassport.mockResolvedValueOnce({
        ok: false,
        error: 'Not found',
      });

      const request: ExecutionRequest = {
        model_passport_id: 'nonexistent_model',
        prompt: 'Test',
        compute_catalog: [sampleComputeMeta],
      };

      const result = await executeInferenceRequest(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should use fallback compute on primary failure', async () => {
      // First call fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              text: 'Fallback response',
              finish_reason: 'stop',
            }],
            usage: {
              prompt_tokens: 5,
              completion_tokens: 8,
            },
          }),
        } as Response);

      const request: ExecutionRequest = {
        model_meta: sampleModelMeta,
        prompt: 'Test with fallback',
        compute_catalog: [sampleComputeMeta, fallbackComputeMeta],
      };

      const result = await executeInferenceRequest(request);

      expect(result.success).toBe(true);
      expect(result.text).toBe('Fallback response');
      expect(result.used_fallback).toBe(true);
      expect(result.compute_passport_id).toBe('compute_fallback456');
    });

    it('should fail when all compute endpoints fail', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockRejectedValueOnce(new Error('Fallback failed'));

      const request: ExecutionRequest = {
        model_meta: sampleModelMeta,
        prompt: 'Test all failures',
        compute_catalog: [sampleComputeMeta, fallbackComputeMeta],
      };

      const result = await executeInferenceRequest(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('failed');
    });

    it('should create receipt asynchronously after successful inference', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ text: 'Test', finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
      } as Response);

      const request: ExecutionRequest = {
        model_meta: sampleModelMeta,
        prompt: 'Test receipt',
        compute_catalog: [sampleComputeMeta],
      };

      const result = await executeInferenceRequest(request);
      expect(result.success).toBe(true);

      // Receipt creation is async via setImmediate — flush the queue
      await new Promise(resolve => setImmediate(resolve));

      expect(mockCreateReceipt).toHaveBeenCalled();
    });

    it('should respect policy constraints', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ text: 'Policy test', finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
      } as Response);

      const request: ExecutionRequest = {
        model_meta: sampleModelMeta,
        prompt: 'Test policy',
        policy: {
          policy_version: '1.0',
          allow_regions: ['us-east'],
          cost: {
            max_price_per_1k_tokens_usd: 1.0,
          },
        },
        compute_catalog: [sampleComputeMeta],
      };

      const result = await executeInferenceRequest(request);
      expect(result.success).toBe(true);
      expect(result.policy_hash).toBeDefined();
    });

    it('should include trace_id and request_id in result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ text: 'Trace test', finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        }),
      } as Response);

      const request: ExecutionRequest = {
        model_meta: sampleModelMeta,
        prompt: 'Test tracing',
        trace_id: 'trace_abc123',
        request_id: 'req_xyz789',
        compute_catalog: [sampleComputeMeta],
      };

      const result = await executeInferenceRequest(request);

      expect(result.trace_id).toBe('trace_abc123');
      expect(result.request_id).toBe('req_xyz789');
    });
  });

  describe('executeChatCompletion', () => {
    it('should return OpenAI-compatible response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { role: 'assistant', content: 'I am an AI assistant.' },
            finish_reason: 'stop',
          }],
          usage: {
            prompt_tokens: 20,
            completion_tokens: 10,
          },
        }),
      } as Response);

      const request: ChatCompletionRequest = {
        model: 'passport:model_test123',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Who are you?' },
        ],
      };

      // Need to provide compute catalog via passport manager
      mockListPassports.mockResolvedValueOnce({
        items: [{ id: 'compute_test123', type: 'compute', metadata: sampleComputeMeta }],
      });

      const response = await executeChatCompletion(request);

      expect(response.object).toBe('chat.completion');
      expect(response.choices).toHaveLength(1);
      expect(response.choices[0].message.role).toBe('assistant');
      expect(response.choices[0].message.content).toBe('I am an AI assistant.');
      expect(response.usage.prompt_tokens).toBeGreaterThan(0);
      expect(response.usage.completion_tokens).toBe(10);
      expect(response.lucid).toBeDefined();
      expect(response.lucid?.run_id).toMatch(/^run_/);
    });

    it('should parse passport: prefix from model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ text: 'Test', finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 2 },
        }),
      } as Response);

      mockListPassports.mockResolvedValueOnce({
        items: [{ id: 'compute_test123', type: 'compute', metadata: sampleComputeMeta }],
      });

      const request: ChatCompletionRequest = {
        model: 'passport:model_test123',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const response = await executeChatCompletion(request);

      expect(mockGetPassport).toHaveBeenCalledWith('model_test123');
      expect(response.model).toBe('model_test123');
    });

    it('should throw on inference failure', async () => {
      mockGetPassport.mockResolvedValueOnce({
        ok: false,
        error: 'Model not found',
      });

      const request: ChatCompletionRequest = {
        model: 'passport:nonexistent',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(executeChatCompletion(request)).rejects.toThrow();
    });
  });

  describe('Token Counter Integration', () => {
    it('should estimate tokens for text prompts', () => {
      const result = estimateTokens('Hello, how are you today?');
      expect(result.estimated).toBeGreaterThan(0);
      expect(result.method).toBe('word_heuristic');
    });

    it('should estimate tokens for chat messages', () => {
      const messages = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'What is 2+2?' },
      ];
      const result = estimateChatTokens(messages);
      expect(result.estimated).toBeGreaterThan(0);
      // Token counter returns TokenCount interface
    });

    it('should detect code content and estimate differently', () => {
      const code = `
        function hello() {
          console.log("Hello, world!");
        }
      `;
      const result = estimateTokens(code);
      expect(result.estimated).toBeGreaterThan(0);
      // Code typically has higher token count per character
    });
  });

  describe('Gateway Configuration', () => {
    it('should return default configuration', () => {
      const config = getGatewayConfig();
      expect(config.default_max_tokens).toBeDefined();
      expect(config.default_temperature).toBeDefined();
      expect(config.timeout_ms).toBeDefined();
      expect(config.max_retries).toBeDefined();
    });

    it('should allow configuration updates', () => {
      configureGateway({
        default_max_tokens: 1024,
        timeout_ms: 60000,
      });

      const config = getGatewayConfig();
      expect(config.default_max_tokens).toBe(1024);
      expect(config.timeout_ms).toBe(60000);
    });
  });

  describe('Error Handling', () => {
    it('should handle HTTP errors from compute endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      const request: ExecutionRequest = {
        model_meta: sampleModelMeta,
        prompt: 'Test error',
        compute_catalog: [sampleComputeMeta],
      };

      const result = await executeInferenceRequest(request);

      expect(result.success).toBe(false);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const request: ExecutionRequest = {
        model_meta: sampleModelMeta,
        prompt: 'Test network error',
        compute_catalog: [sampleComputeMeta],
      };

      const result = await executeInferenceRequest(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('error');
    });

    it('should handle malformed response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          // Missing expected fields
          unexpected: 'response',
        }),
      } as Response);

      const request: ExecutionRequest = {
        model_meta: sampleModelMeta,
        prompt: 'Test malformed',
        compute_catalog: [sampleComputeMeta],
      };

      const result = await executeInferenceRequest(request);
      
      // Should handle gracefully even with unexpected format
      expect(result.run_id).toBeDefined();
    });
  });

  describe('Streaming Inference', () => {
    it('should set up streaming result correctly', async () => {
      const request: ExecutionRequest = {
        model_meta: sampleModelMeta,
        prompt: 'Stream test',
        stream: true,
        compute_catalog: [sampleComputeMeta],
      };

      // Mock a simple stream
      const mockBody = {
        getReader: () => ({
          read: jest.fn<() => Promise<any>>()
            .mockResolvedValueOnce({ value: new TextEncoder().encode('data: {"text": "Hello"}\n\n'), done: false })
            .mockResolvedValueOnce({ value: new TextEncoder().encode('data: [DONE]\n\n'), done: false })
            .mockResolvedValueOnce({ done: true }),
        }),
      };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockBody,
      } as unknown as Response);

      const streamResult = await executeStreamingInferenceRequest(request);

      expect(streamResult.run_id).toMatch(/^run_/);
      expect(streamResult.model_passport_id).toBe('model_test123');
      expect(streamResult.compute_passport_id).toBe('compute_test123');
      expect(streamResult.stream).toBeDefined();
      expect(typeof streamResult.finalize).toBe('function');
    });

    it('should throw for streaming when no compatible compute', async () => {
      const request: ExecutionRequest = {
        model_meta: sampleModelMeta,
        prompt: 'Stream test',
        stream: true,
        compute_catalog: [], // No compute available
      };

      await expect(executeStreamingInferenceRequest(request)).rejects.toThrow('NO_COMPATIBLE_COMPUTE');
    });
  });

  describe('Payload Translation', () => {
    it('should translate to vLLM format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ text: 'vLLM response', finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
      } as Response);

      const request: ExecutionRequest = {
        model_meta: sampleModelMeta,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
        temperature: 0.7,
        compute_catalog: [sampleComputeMeta],
      };

      await executeInferenceRequest(request);

      // Check that fetch was called with appropriate payload
      expect(mockFetch).toHaveBeenCalled();
      const fetchCall = mockFetch.mock.calls[0] as unknown[];
      const body = JSON.parse((fetchCall[1] as RequestInit).body as string);

      // vLLM format should include messages or prompt
      expect(body.max_tokens || body.max_new_tokens).toBeDefined();
    });
  });

  describe('Provider Path (TrustGate)', () => {
    const apiModelMeta = {
      schema_version: '1.0',
      model_passport_id: 'model_gpt4o_test',
      format: 'api',
      runtime_recommended: 'trustgate',
      api_model_id: 'gpt-4o',
      base: 'openai',
      context_length: 128000,
      requirements: { min_vram_gb: 0 },
    };

    beforeEach(() => {
      // Reset fetch mock to clear any stale queued responses from earlier tests
      mockFetch.mockReset();
    });

    it('should route format=api models to TrustGate, skipping compute matching', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Hello from GPT-4o!' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      } as Response);

      const request: ExecutionRequest = {
        model_meta: apiModelMeta,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
      };

      const result = await executeInferenceRequest(request);

      expect(result.success).toBe(true);
      expect(result.text).toBe('Hello from GPT-4o!');
      expect(result.compute_passport_id).toBe('trustgate');
      expect(result.runtime).toBe('trustgate');
      expect(result.tokens_in).toBe(10);
      expect(result.tokens_out).toBe(5);
      expect(mockCreateReceipt).not.toHaveBeenCalled();
    });

    it('should use api_model_id as the model field sent to TrustGate', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 2 },
        }),
      } as Response);

      const request: ExecutionRequest = {
        model_meta: apiModelMeta,
        prompt: 'Hello',
      };

      await executeInferenceRequest(request);

      const fetchCall = mockFetch.mock.calls[0] as unknown[];
      const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
      expect(body.model).toBe('gpt-4o');
    });

    it('should return error when TrustGate returns non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      } as Response);

      const request: ExecutionRequest = {
        model_meta: apiModelMeta,
        prompt: 'Hello',
      };

      const result = await executeInferenceRequest(request);

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('RATE_LIMIT');
    });

    it('should succeed with empty compute catalog for format=api models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 2 },
        }),
      } as Response);

      const request: ExecutionRequest = {
        model_meta: apiModelMeta,
        messages: [{ role: 'user', content: 'Hello' }],
        compute_catalog: [],
      };

      const result = await executeInferenceRequest(request);
      expect(result.success).toBe(true);
      expect(result.compute_passport_id).toBe('trustgate');
    });

    it('should still use compute path for non-api format models', async () => {
      const request: ExecutionRequest = {
        model_meta: {
          schema_version: '1.0',
          model_passport_id: 'model_test123',
          name: 'Test Model',
          format: 'safetensors',
          runtime_recommended: 'vllm',
          requirements: { min_vram_gb: 16 },
        },
        prompt: 'Test',
        compute_catalog: [],
      };

      const result = await executeInferenceRequest(request);
      // Non-api models should NOT route to TrustGate
      expect(result.success).toBe(false);
      expect(result.compute_passport_id).not.toBe('trustgate');
      expect(result.runtime).not.toBe('trustgate');
    });

    it('should route via provider path when passport lookup returns format=api', async () => {
      mockGetPassport.mockResolvedValueOnce({
        ok: true,
        data: {
          id: 'model_gpt4o_test',
          type: 'model',
          metadata: apiModelMeta,
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Via passport lookup' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
      } as Response);

      const request: ExecutionRequest = {
        model_passport_id: 'model_gpt4o_test',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const result = await executeInferenceRequest(request);
      expect(result.success).toBe(true);
      expect(result.compute_passport_id).toBe('trustgate');
      expect(mockGetPassport).toHaveBeenCalledWith('model_gpt4o_test');
    });

    it('should use TrustGate as fallback when no compute found for dual-path model', async () => {
      const dualPathMeta = {
        schema_version: '1.0',
        model_passport_id: 'model_llama3_test',
        format: 'safetensors',
        runtime_recommended: 'vllm',
        api_model_id: 'meta-llama/llama-3-70b',
        requirements: { min_vram_gb: 40 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Hello from TrustGate fallback' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
      } as Response);

      const request: ExecutionRequest = {
        model_meta: dualPathMeta,
        messages: [{ role: 'user', content: 'Hello' }],
        compute_catalog: [],
      };

      const result = await executeInferenceRequest(request);

      expect(result.success).toBe(true);
      expect(result.text).toBe('Hello from TrustGate fallback');
      expect(result.compute_passport_id).toBe('trustgate');
      expect(result.used_fallback).toBe(true);
    });

    it('should prefer compute path over TrustGate for dual-path model', async () => {
      const dualPathMeta = {
        schema_version: '1.0',
        model_passport_id: 'model_llama3_test',
        format: 'safetensors',
        runtime_recommended: 'vllm',
        api_model_id: 'meta-llama/llama-3-70b',
        requirements: { min_vram_gb: 16 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ text: 'Hello from compute', finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
      } as Response);

      const request: ExecutionRequest = {
        model_meta: dualPathMeta,
        prompt: 'Hello',
        compute_catalog: [sampleComputeMeta],
      };

      const result = await executeInferenceRequest(request);

      expect(result.success).toBe(true);
      expect(result.compute_passport_id).not.toBe('trustgate');
      expect(result.runtime).not.toBe('trustgate');
    });

    it('should NOT fallback to TrustGate for downloadable models WITHOUT api_model_id', async () => {
      const request: ExecutionRequest = {
        model_meta: sampleModelMeta,
        prompt: 'Hello',
        compute_catalog: [],
      };

      const result = await executeInferenceRequest(request);

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('NO_COMPATIBLE_COMPUTE');
    });
  });
});
