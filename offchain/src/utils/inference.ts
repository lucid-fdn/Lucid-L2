// offchain/src/utils/inference.ts
import { LLMRouter } from '../providers/router';
import { LLMResponse, LLMProviderType } from '../providers/llm';
import { LLM_CONFIG } from './config';

// Global LLM router instance
let llmRouter: LLMRouter | null = null;

// Initialize LLM router
function initializeLLMRouter(): LLMRouter {
  if (!llmRouter) {
    // Determine provider based on API key availability
    const provider = process.env.OPENAI_API_KEY ? LLMProviderType.OPENAI : LLMProviderType.MOCK;
    
    llmRouter = new LLMRouter({
      provider,
      model: LLM_CONFIG.model,
      apiKey: LLM_CONFIG.apiKey,
      maxTokens: LLM_CONFIG.maxTokens,
      temperature: LLM_CONFIG.temperature,
      fallbackProviders: LLM_CONFIG.fallbackProviders
    });
  }
  return llmRouter;
}

// Main inference function for backward compatibility
export async function runInference(text: string): Promise<Uint8Array> {
  const router = initializeLLMRouter();
  
  try {
    const response = await router.generateResponse(text);
    return response.hash;
  } catch (error) {
    console.error('Inference error:', error);
    // Fall back to mock provider if primary fails
    throw error;
  }
}

// Enhanced inference function that returns full response
export async function runInferenceWithDetails(text: string, model?: string, provider?: string): Promise<LLMResponse> {
  const router = initializeLLMRouter();
  return await router.generateResponse(text, model, provider);
}

// Batch inference function
export async function runBatchInference(texts: string[]): Promise<Uint8Array[]> {
  const router = initializeLLMRouter();
  
  const results = await Promise.all(
    texts.map(async (text) => {
      try {
        const response = await router.generateResponse(text);
        return response.hash;
      } catch (error) {
        console.error(`Batch inference error for text "${text}":`, error);
        throw error;
      }
    })
  );
  
  return results;
}

// Enhanced batch inference with details
export async function runBatchInferenceWithDetails(texts: string[], model?: string, provider?: string): Promise<LLMResponse[]> {
  const router = initializeLLMRouter();
  
  const results = await Promise.all(
    texts.map(async (text) => {
      return await router.generateResponse(text, model, provider);
    })
  );
  
  return results;
}

// Get available providers
export async function getAvailableProviders(): Promise<string[]> {
  const router = initializeLLMRouter();
  return await router.getAvailableProviders();
}

// Get provider models
export function getProviderModels(providerName: string): string[] {
  const router = initializeLLMRouter();
  return router.getProviderModels(providerName);
}

// Get all providers and their models
export function getAllProviders(): { [key: string]: string[] } {
  const router = initializeLLMRouter();
  return router.getAllProviders();
}

// Health check
export async function healthCheck(): Promise<{ [key: string]: boolean }> {
  const router = initializeLLMRouter();
  return await router.healthCheck();
}

// Cost estimation
export async function estimateCost(text: string, model?: string, provider?: string): Promise<number> {
  const router = initializeLLMRouter();
  return await router.estimateCost(text, model, provider);
}

// Update LLM configuration
export function updateLLMConfig(config: Partial<typeof LLM_CONFIG>): void {
  const router = initializeLLMRouter();
  router.updateConfig(config);
}

// Get current configuration
export function getLLMConfig() {
  const router = initializeLLMRouter();
  return router.getCurrentConfig();
}

// Legacy compatibility function
export function runMockInference(text: string): Uint8Array {
  // This is kept for backward compatibility
  // Use the new runInference function instead
  console.warn('runMockInference is deprecated. Use runInference instead.');
  return runInference(text) as any; // This will be async now
}
