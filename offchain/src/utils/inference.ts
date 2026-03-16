// offchain/src/utils/inference.ts
import * as crypto from 'crypto';
import { LLMRouter } from '../../packages/contrib/providers/router';
import { LLMResponse } from '../../packages/contrib/providers/llm';
import { LLM_CONFIG, USE_INTERNAL_LLM } from '../../packages/engine/src/shared/config/config';

// Global LLM router instance
let llmRouter: LLMRouter | null = null;

// Initialize LLM router (only used when USE_INTERNAL_LLM === true)
function initializeLLMRouter(): LLMRouter {
  if (!llmRouter) {
    llmRouter = new LLMRouter({
      provider: LLM_CONFIG.provider as any,
      model: LLM_CONFIG.model,
      apiKey: LLM_CONFIG.apiKey,
      baseUrl: LLM_CONFIG.baseUrl,
      maxTokens: LLM_CONFIG.maxTokens,
      temperature: LLM_CONFIG.temperature,
      fallbackProviders: LLM_CONFIG.fallbackProviders
    });
  }
  return llmRouter;
}

// Helper: deterministic SHA-256 over provided text (external capture mode)
function sha256(text: string): Uint8Array {
  const hash = crypto.createHash('sha256').update(text).digest();
  return new Uint8Array(hash);
}

// Helper: lightweight token estimate (kept for compatibility with UI/stats)
function estimateTokensFromText(text: string) {
  const total = Math.ceil(text.length / 4);
  return { input: total, output: 0, total };
}

// Main inference function: returns a 32-byte hash
// If USE_INTERNAL_LLM === false, we DO NOT call any LLM. We simply hash the provided text.
// This matches the product goal: capture external LLM messages and commit their hash on-chain.
export async function runInference(text: string): Promise<Uint8Array> {
  if (!USE_INTERNAL_LLM) {
    return sha256(text);
  }

  const router = initializeLLMRouter();
  const response = await router.generateResponse(text);
  return response.hash;
}

// Enhanced inference function that returns full response details
export async function runInferenceWithDetails(text: string, model?: string, provider?: string): Promise<LLMResponse> {
  if (!USE_INTERNAL_LLM) {
    const hash = sha256(text);
    const tokens = estimateTokensFromText(text);
    const now = Date.now();
    return {
      content: text,
      hash,
      model: model || 'external-capture',
      provider: 'external',
      tokens,
      cost: 0,
      qualityScore: 0, // optional: plug quality validator if needed
      timestamp: now
    };
  }

  const router = initializeLLMRouter();
  return await router.generateResponse(text, model, provider);
}

// Batch inference: returns array of 32-byte hashes
export async function runBatchInference(texts: string[]): Promise<Uint8Array[]> {
  if (!USE_INTERNAL_LLM) {
    return texts.map(t => sha256(t));
  }

  const router = initializeLLMRouter();
  const results = await Promise.all(
    texts.map(async (text) => {
      const response = await router.generateResponse(text);
      return response.hash;
    })
  );
  return results;
}

// Enhanced batch inference with details
export async function runBatchInferenceWithDetails(texts: string[], model?: string, provider?: string): Promise<LLMResponse[]> {
  if (!USE_INTERNAL_LLM) {
    const now = Date.now();
    return texts.map((t) => {
      const hash = sha256(t);
      const tokens = estimateTokensFromText(t);
      return {
        content: t,
        hash,
        model: model || 'external-capture',
        provider: 'external',
        tokens,
        cost: 0,
        qualityScore: 0,
        timestamp: now
      };
    });
  }

  const router = initializeLLMRouter();
  const results = await Promise.all(
    texts.map(async (text) => {
      return await router.generateResponse(text, model, provider);
    })
  );
  return results;
}

// Get available providers (no-op in external-capture mode, kept for API compatibility)
export async function getAvailableProviders(): Promise<string[]> {
  if (!USE_INTERNAL_LLM) return ['external'];
  const router = initializeLLMRouter();
  return await router.getAvailableProviders();
}

// Get provider models (no-op in external-capture mode)
export function getProviderModels(providerName: string): string[] {
  if (!USE_INTERNAL_LLM) return [];
  const router = initializeLLMRouter();
  return router.getProviderModels(providerName);
}

// Get all providers and their models (no-op in external-capture mode)
export function getAllProviders(): { [key: string]: string[] } {
  if (!USE_INTERNAL_LLM) return { external: [] };
  const router = initializeLLMRouter();
  return router.getAllProviders();
}

// Health check (reports external mode as healthy)
export async function healthCheck(): Promise<{ [key: string]: boolean }> {
  if (!USE_INTERNAL_LLM) return { external: true };
  const router = initializeLLMRouter();
  return await router.healthCheck();
}

// Cost estimation (zero in external-capture mode)
export async function estimateCost(text: string, model?: string, provider?: string): Promise<number> {
  if (!USE_INTERNAL_LLM) return 0;
  const router = initializeLLMRouter();
  return await router.estimateCost(text, model, provider);
}

// Update LLM configuration (no effect in external-capture mode unless toggled)
export function updateLLMConfig(config: Partial<typeof LLM_CONFIG>): void {
  if (!USE_INTERNAL_LLM) return;
  const router = initializeLLMRouter();
  router.updateConfig(config);
}

// Get current configuration (returns current LLM config object)
export function getLLMConfig() {
  return { ...LLM_CONFIG };
}

// Legacy compatibility function
export function runMockInference(text: string): Uint8Array {
  console.warn('runMockInference is deprecated. Using external-capture hashing instead.');
  return sha256(text);
}
