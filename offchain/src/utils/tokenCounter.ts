// offchain/src/utils/tokenCounter.ts
// Token counting utility for inference requests

/**
 * Token estimation using simple heuristics.
 * 
 * For MVP, we use word-based estimation:
 * - Average ~1.3 tokens per word for English text
 * - Adjust for code/technical content (~1.5 tokens per word)
 * 
 * Future: Integrate tiktoken for accurate tokenization
 */

export interface TokenCount {
  estimated: number;
  method: 'word_heuristic' | 'tiktoken' | 'exact';
  confidence: 'low' | 'medium' | 'high';
}

export interface TokenEstimationOptions {
  model_family?: 'llama' | 'gpt' | 'claude' | 'mistral' | 'generic';
  content_type?: 'text' | 'code' | 'mixed';
}

/**
 * Estimate token count for a string using word-based heuristic.
 * 
 * @param text - The text to estimate tokens for
 * @param options - Optional configuration for estimation
 * @returns TokenCount with estimated count and metadata
 */
export function estimateTokens(text: string, options: TokenEstimationOptions = {}): TokenCount {
  if (!text || typeof text !== 'string') {
    return { estimated: 0, method: 'word_heuristic', confidence: 'high' };
  }

  const contentType = options.content_type || detectContentType(text);
  
  // Count words (split on whitespace and filter empty strings)
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  
  // Count special characters that often become separate tokens
  const specialChars = (text.match(/[{}()\[\]<>:;,.'"`@#$%^&*+=|\\\/~]/g) || []).length;
  
  // Apply multiplier based on content type
  let multiplier: number;
  switch (contentType) {
    case 'code':
      // Code has more special characters and shorter tokens
      multiplier = 1.5;
      break;
    case 'mixed':
      multiplier = 1.4;
      break;
    case 'text':
    default:
      multiplier = 1.3;
  }
  
  // Base estimate
  let estimated = Math.ceil(wordCount * multiplier);
  
  // Add special character contribution (roughly 0.3 tokens per special char)
  estimated += Math.ceil(specialChars * 0.3);
  
  // Handle very short inputs (minimum 1 token per non-empty input)
  if (text.trim().length > 0 && estimated === 0) {
    estimated = 1;
  }
  
  // Confidence based on text length
  let confidence: 'low' | 'medium' | 'high';
  if (wordCount < 10) {
    confidence = 'low';
  } else if (wordCount < 100) {
    confidence = 'medium';
  } else {
    confidence = 'high';
  }
  
  return {
    estimated,
    method: 'word_heuristic',
    confidence,
  };
}

/**
 * Detect if content is primarily text, code, or mixed.
 */
function detectContentType(text: string): 'text' | 'code' | 'mixed' {
  // Code indicators
  const codePatterns = [
    /function\s+\w+/,
    /const\s+\w+\s*=/,
    /let\s+\w+\s*=/,
    /var\s+\w+\s*=/,
    /def\s+\w+\(/,
    /class\s+\w+/,
    /import\s+.*from/,
    /require\s*\(/,
    /\{\s*\n/,
    /\}\s*\n/,
    /=>\s*{/,
    /\/\*\*/, // JSDoc
    /#include/,
    /public\s+static/,
  ];
  
  let codeScore = 0;
  for (const pattern of codePatterns) {
    if (pattern.test(text)) {
      codeScore++;
    }
  }
  
  // Check indentation patterns common in code
  const lines = text.split('\n');
  const indentedLines = lines.filter(l => /^\s{2,}/.test(l)).length;
  const indentRatio = lines.length > 0 ? indentedLines / lines.length : 0;
  
  if (indentRatio > 0.3) {
    codeScore += 2;
  }
  
  // Determine type
  if (codeScore >= 3) {
    return 'code';
  } else if (codeScore >= 1) {
    return 'mixed';
  }
  return 'text';
}

/**
 * Estimate tokens for a chat message array (OpenAI format).
 */
export function estimateChatTokens(messages: Array<{ role: string; content: string }>, options: TokenEstimationOptions = {}): TokenCount {
  if (!Array.isArray(messages)) {
    return { estimated: 0, method: 'word_heuristic', confidence: 'high' };
  }
  
  let total = 0;
  let minConfidence: 'low' | 'medium' | 'high' = 'high';
  
  for (const msg of messages) {
    if (msg.content) {
      const estimate = estimateTokens(msg.content, options);
      total += estimate.estimated;
      
      // Track lowest confidence
      if (estimate.confidence === 'low') {
        minConfidence = 'low';
      } else if (estimate.confidence === 'medium' && minConfidence !== 'low') {
        minConfidence = 'medium';
      }
    }
    
    // Add overhead for message structure (role, delimiters)
    // Each message typically adds ~4 tokens for format
    total += 4;
  }
  
  // Add a small overhead for conversation start/end tokens
  total += 3;
  
  return {
    estimated: total,
    method: 'word_heuristic',
    confidence: minConfidence,
  };
}

/**
 * Estimate tokens for a prompt string.
 * Wrapper around estimateTokens for consistency.
 */
export function estimatePromptTokens(prompt: string, options: TokenEstimationOptions = {}): TokenCount {
  return estimateTokens(prompt, options);
}

/**
 * Calculate billing tokens (input + output).
 * Some providers weight output tokens differently.
 */
export function calculateBillingTokens(
  tokensIn: number,
  tokensOut: number,
  outputMultiplier: number = 1.0
): number {
  return tokensIn + Math.ceil(tokensOut * outputMultiplier);
}

/**
 * Estimate cost based on tokens and price per 1k tokens.
 */
export function estimateCost(
  tokensIn: number,
  tokensOut: number,
  pricePerInputK: number,
  pricePerOutputK: number = pricePerInputK
): number {
  const inputCost = (tokensIn / 1000) * pricePerInputK;
  const outputCost = (tokensOut / 1000) * pricePerOutputK;
  return inputCost + outputCost;
}
