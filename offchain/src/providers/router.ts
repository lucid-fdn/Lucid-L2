// offchain/src/providers/router.ts
import { LLMProvider, LLMResponse, LLMConfig, LLMError, LLMProviderType } from './llm';
import { OpenAIProvider } from './openai';
import { MockProvider } from './mock';

export class LLMRouter {
  private providers: Map<string, LLMProvider> = new Map();
  private config: LLMConfig;
  private fallbackProviders: string[];

  constructor(config: LLMConfig) {
    this.config = config;
    this.fallbackProviders = config.fallbackProviders || [];
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Initialize mock provider (always available)
    this.providers.set(LLMProviderType.MOCK, new MockProvider());

    // Initialize OpenAI provider if API key is provided
    if (this.config.provider === LLMProviderType.OPENAI && this.config.apiKey) {
      this.providers.set(LLMProviderType.OPENAI, new OpenAIProvider({
        apiKey: this.config.apiKey,
        defaultModel: this.config.model,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        baseUrl: this.config.baseUrl
      }));
    }
  }

  async generateResponse(input: string, model?: string, preferredProvider?: string): Promise<LLMResponse> {
    const provider = preferredProvider || this.config.provider;
    const providersToTry = [provider, ...this.fallbackProviders];

    let lastError: LLMError | null = null;

    for (const providerName of providersToTry) {
      const llmProvider = this.providers.get(providerName);
      
      if (!llmProvider) {
        console.warn(`Provider ${providerName} not available, skipping...`);
        continue;
      }

      try {
        // Check if provider is available
        const isAvailable = await llmProvider.isAvailable();
        if (!isAvailable) {
          console.warn(`Provider ${providerName} is not available, trying next...`);
          continue;
        }

        // Generate response
        const response = await llmProvider.generateResponse(input, model);
        
        // Add router metadata
        response.provider = providerName;
        
        console.log(`Successfully generated response using ${providerName}`);
        return response;

      } catch (error: any) {
        lastError = error as LLMError;
        console.warn(`Error with provider ${providerName}:`, error?.message || 'Unknown error');
        
        // If this is the last provider, we'll throw the error
        if (providerName === providersToTry[providersToTry.length - 1]) {
          break;
        }
      }
    }

    // If all providers failed, throw the last error or a generic error
    if (lastError) {
      throw lastError;
    } else {
      throw new LLMError(
        'No available providers found',
        'router',
        model || 'unknown'
      );
    }
  }

  async estimateCost(input: string, model?: string, provider?: string): Promise<number> {
    const providerName = provider || this.config.provider;
    const llmProvider = this.providers.get(providerName);

    if (!llmProvider) {
      throw new LLMError(
        `Provider ${providerName} not found`,
        'router',
        model || 'unknown'
      );
    }

    return await llmProvider.estimateCost(input, model);
  }

  async getAvailableProviders(): Promise<string[]> {
    const available: string[] = [];
    
    for (const [name, provider] of this.providers.entries()) {
      try {
        const isAvailable = await provider.isAvailable();
        if (isAvailable) {
          available.push(name);
        }
      } catch (error) {
        console.warn(`Error checking availability of ${name}:`, error);
      }
    }
    
    return available;
  }

  getProviderModels(providerName: string): string[] {
    const provider = this.providers.get(providerName);
    return provider ? provider.models : [];
  }

  getAllProviders(): { [key: string]: string[] } {
    const result: { [key: string]: string[] } = {};
    
    for (const [name, provider] of this.providers.entries()) {
      result[name] = provider.models;
    }
    
    return result;
  }

  updateConfig(newConfig: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.fallbackProviders = this.config.fallbackProviders || [];
    
    // Re-initialize providers if needed
    if (newConfig.provider || newConfig.apiKey) {
      this.initializeProviders();
    }
  }

  getCurrentConfig(): LLMConfig {
    return { ...this.config };
  }

  async healthCheck(): Promise<{ [key: string]: boolean }> {
    const health: { [key: string]: boolean } = {};
    
    for (const [name, provider] of this.providers.entries()) {
      try {
        health[name] = await provider.isAvailable();
      } catch (error) {
        health[name] = false;
      }
    }
    
    return health;
  }

  // Quality scoring for provider selection
  private async scoreProvider(providerName: string, input: string): Promise<number> {
    const provider = this.providers.get(providerName);
    if (!provider) return 0;

    let score = 0.5; // Base score

    // Provider-specific scoring
    switch (providerName) {
      case LLMProviderType.OPENAI:
        score += 0.3; // Higher quality for real AI
        break;
      case LLMProviderType.MOCK:
        score += 0.1; // Lower quality for mock
        break;
    }

    // Availability bonus
    try {
      const isAvailable = await provider.isAvailable();
      if (isAvailable) score += 0.2;
    } catch (error) {
      score -= 0.3;
    }

    return Math.max(0, Math.min(1, score));
  }

  async selectBestProvider(input: string, excludeProviders: string[] = []): Promise<string> {
    const providers = Array.from(this.providers.keys()).filter(
      name => !excludeProviders.includes(name)
    );

    if (providers.length === 0) {
      throw new LLMError('No available providers', 'router', 'unknown');
    }

    // Score all providers
    const scores = await Promise.all(
      providers.map(async (name) => ({
        name,
        score: await this.scoreProvider(name, input)
      }))
    );

    // Sort by score (descending)
    scores.sort((a, b) => b.score - a.score);

    return scores[0].name;
  }
}
