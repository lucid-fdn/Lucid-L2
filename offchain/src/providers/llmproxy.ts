// offchain/src/providers/llmproxy.ts
import axios from 'axios';
import { LLMProvider, LLMResponse, LLMError, hashResponse, calculateQualityScore } from './llm';

export class LLMProxyProvider implements LLMProvider {
  public readonly name = 'llmproxy';
  public readonly models: string[] = [];
  
  private baseUrl: string;
  private defaultModel: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: {
    baseUrl: string;
    defaultModel?: string;
    maxTokens?: number;
    temperature?: number;
  }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.defaultModel = config.defaultModel || 'openai-gpt35-turbo';
    this.maxTokens = config.maxTokens || 150;
    this.temperature = config.temperature || 0.7;
    
    // Common models that work via llm-proxy (Eden AI)
    this.models = [
      'openai-gpt35-turbo',
      'openai-gpt4',
      'anthropic-claude-3-sonnet',
      'anthropic-claude-3-opus',
      'google-gemini-pro',
      'cohere-command'
    ];
  }

  async generateResponse(input: string, model?: string): Promise<LLMResponse> {
    const selectedModel = model || this.defaultModel;
    
    try {
      const startTime = Date.now();
      
      console.log(`📡 Calling llm-proxy: POST ${this.baseUrl}/invoke/model/${selectedModel}`);
      
      // Call llm-proxy /invoke/model/{model_id} endpoint
      const response = await axios.post(
        `${this.baseUrl}/invoke/model/${selectedModel}`,
        {
          prompt: input,
          parameters: {
            max_tokens: this.maxTokens,
            temperature: this.temperature
          }
        },
        {
          timeout: 30000, // 30 seconds
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      // Extract output from llm-proxy response
      const content = response.data.output || response.data.result || response.data.generated_text || '';
      
      if (!content || content.length === 0) {
        throw new Error('Empty response from llm-proxy');
      }
      
      const hash = hashResponse(content);
      const qualityScore = calculateQualityScore(content);
      
      // Extract metadata from llm-proxy response
      const metadata = response.data.metadata || {};
      const usage = response.data.usage || metadata.usage || {};
      
      const inputTokens = usage.prompt_tokens || Math.ceil(input.length / 4);
      const outputTokens = usage.completion_tokens || Math.ceil(content.length / 4);
      const totalTokens = usage.total_tokens || inputTokens + outputTokens;
      
      // Cost (llm-proxy may provide this)
      const cost = response.data.cost || metadata.cost || 0;
      
      console.log(`✅ llm-proxy response: ${content.length} chars, ${totalTokens} tokens`);
      
      return {
        content,
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
      // Log detailed error for debugging
      console.error(`❌ llm-proxy error:`, error.response?.data || error.message);
      
      const errorMessage = error?.response?.data?.message 
        || error?.response?.data?.error 
        || error?.message 
        || 'Unknown error';
      
      throw new LLMError(
        `llm-proxy API error: ${errorMessage}`,
        this.name,
        selectedModel,
        error?.response?.status?.toString()
      );
    }
  }

  async estimateCost(input: string, model?: string): Promise<number> {
    const selectedModel = model || this.defaultModel;
    
    // For MVP, return 0 since we don't have Eden AI credits
    // In production, this would call llm-proxy for actual cost estimation
    return 0;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/`, { timeout: 5000 });
      const isOnline = response.status === 200 && response.data?.status === 'online';
      
      if (isOnline) {
        console.log(`✅ llm-proxy available at ${this.baseUrl}`);
      } else {
        console.log(`⚠️ llm-proxy returned unexpected response`);
      }
      
      return isOnline;
    } catch (error: any) {
      console.log(`❌ llm-proxy not available: ${error.message}`);
      return false;
    }
  }
}
