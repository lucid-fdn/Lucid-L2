// offchain/src/providers/openai.ts
import OpenAI from 'openai';
import { LLMProvider, LLMResponse, LLMError, hashResponse, calculateQualityScore } from './llm';

export class OpenAIProvider implements LLMProvider {
  public readonly name = 'openai';
  public readonly models = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  
  private client: OpenAI;
  private defaultModel: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: {
    apiKey: string;
    defaultModel?: string;
    maxTokens?: number;
    temperature?: number;
    baseUrl?: string;
  }) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    
    this.defaultModel = config.defaultModel || 'gpt-3.5-turbo';
    this.maxTokens = config.maxTokens || 150;
    this.temperature = config.temperature || 0.7;
  }

  async generateResponse(input: string, model?: string): Promise<LLMResponse> {
    const selectedModel = model || this.defaultModel;
    
    try {
      const startTime = Date.now();
      
      const completion = await this.client.chat.completions.create({
        model: selectedModel,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant. Provide thoughtful, concise responses.'
          },
          {
            role: 'user',
            content: input
          }
        ],
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      });

      const response = completion.choices[0]?.message?.content || '';
      const hash = hashResponse(response);
      const qualityScore = calculateQualityScore(response);
      
      // Calculate token usage
      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      const totalTokens = completion.usage?.total_tokens || inputTokens + outputTokens;
      
      // Calculate cost based on model pricing (USD)
      const cost = this.calculateCost(selectedModel, inputTokens, outputTokens);
      
      return {
        content: response,
        hash,
        model: selectedModel,
        provider: this.name,
        tokens: {
          input: inputTokens,
          output: outputTokens,
          total: totalTokens
        },
        cost,
        qualityScore,
        timestamp: Date.now()
      };
      
    } catch (error: any) {
      throw new LLMError(
        `OpenAI API error: ${error?.message || 'Unknown error'}`,
        this.name,
        selectedModel,
        error?.code
      );
    }
  }

  async estimateCost(input: string, model?: string): Promise<number> {
    const selectedModel = model || this.defaultModel;
    
    // Rough token estimation (4 chars ≈ 1 token)
    const estimatedInputTokens = Math.ceil(input.length / 4);
    const estimatedOutputTokens = this.maxTokens;
    
    return this.calculateCost(selectedModel, estimatedInputTokens, estimatedOutputTokens);
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Simple availability check
      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    // OpenAI pricing as of 2024 (USD per 1K tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-3.5-turbo': { input: 0.0015, output: 0.002 }
    };
    
    const modelPricing = pricing[model] || pricing['gpt-3.5-turbo'];
    
    const inputCost = (inputTokens / 1000) * modelPricing.input;
    const outputCost = (outputTokens / 1000) * modelPricing.output;
    
    return inputCost + outputCost;
  }
}
