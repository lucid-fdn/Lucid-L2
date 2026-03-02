// offchain/src/providers/mock.ts
import { LLMProvider, LLMResponse, hashResponse, calculateQualityScore } from './llm';

export class MockProvider implements LLMProvider {
  public readonly name = 'mock';
  public readonly models = ['sha256-mock'];
  
  private defaultModel: string;

  constructor(config: { defaultModel?: string } = {}) {
    this.defaultModel = config.defaultModel || 'sha256-mock';
  }

  async generateResponse(input: string, model?: string): Promise<LLMResponse> {
    const selectedModel = model || this.defaultModel;
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    // Generate mock response with some variation
    const responses = [
      `Processing "${input}" through mock inference system.`,
      `Mock AI analysis of: "${input}" - System operational.`,
      `Generated response for input: "${input}" via mock provider.`,
      `Mock inference result: Processing "${input}" successfully.`,
      `AI simulation response to: "${input}" - Mock system active.`
    ];
    
    const responseIndex = Math.abs(input.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % responses.length;
    const response = responses[responseIndex];
    
    const hash = hashResponse(response);
    const qualityScore = calculateQualityScore(response);
    
    // Mock token usage
    const inputTokens = Math.ceil(input.length / 4);
    const outputTokens = Math.ceil(response.length / 4);
    const totalTokens = inputTokens + outputTokens;
    
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
      cost: 0, // Mock provider is free
      qualityScore,
      timestamp: Date.now()
    };
  }

  async estimateCost(input: string, model?: string): Promise<number> {
    return 0; // Mock provider is free
  }

  async isAvailable(): Promise<boolean> {
    return true; // Mock provider is always available
  }
}
