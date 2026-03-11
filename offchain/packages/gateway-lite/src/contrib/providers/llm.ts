// offchain/src/providers/llm.ts
import * as crypto from 'crypto';

export interface LLMProvider {
  readonly name: string;
  readonly models: string[];
  
  // Generate inference response
  generateResponse(input: string, model?: string): Promise<LLMResponse>;
  
  // Get cost estimation
  estimateCost(input: string, model?: string): Promise<number>;
  
  // Check availability
  isAvailable(): Promise<boolean>;
}

export interface LLMResponse {
  content: string;
  hash: Uint8Array;
  model: string;
  provider: string;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
  qualityScore: number;
  timestamp: number;
}

export interface LLMConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  fallbackProviders?: string[];
}

export enum LLMProviderType {
  OPENAI = 'openai',
  MOCK = 'mock',
  ANTHROPIC = 'anthropic', // Future implementation
  LOCAL = 'local'          // Future implementation
}

export class LLMError extends Error {
  constructor(
    message: string,
    public provider: string,
    public model: string,
    public code?: string
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export function hashResponse(content: string): Uint8Array {
  // Generate deterministic hash from AI response content
  const hash = crypto.createHash('sha256').update(content).digest();
  return new Uint8Array(hash);
}

export function calculateQualityScore(response: string): number {
  // Basic quality scoring based on response characteristics
  let score = 0.5; // Base score
  
  // Length factor (prefer substantial responses)
  if (response.length > 50) score += 0.1;
  if (response.length > 200) score += 0.1;
  
  // Coherence factor (basic checks)
  if (response.includes('.') || response.includes('!') || response.includes('?')) score += 0.1;
  
  // Avoid repetitive responses
  const words = response.split(' ');
  const uniqueWords = new Set(words).size;
  if (uniqueWords / words.length > 0.7) score += 0.1;
  
  // Avoid very short responses
  if (response.length < 10) score -= 0.2;
  
  return Math.max(0, Math.min(1, score));
}
