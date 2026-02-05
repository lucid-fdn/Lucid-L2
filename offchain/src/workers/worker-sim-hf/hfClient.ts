/**
 * HuggingFace Inference API Client
 * 
 * Wraps the HuggingFace Inference API for text generation and chat completion.
 * Used by the managed_endpoint worker to delegate inference.
 * 
 * @module hfClient
 */

export interface HFGenerateOptions {
  max_new_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
  stop_sequences?: string[];
  seed?: number;
  do_sample?: boolean;
  return_full_text?: boolean;
}

export interface HFChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface HFGenerateResponse {
  generated_text: string;
  tokens_in?: number;
  tokens_out?: number;
}

export interface HFChatResponse {
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface HFInferenceMetrics {
  ttft_ms: number;
  total_latency_ms: number;
  tokens_in: number;
  tokens_out: number;
}

/**
 * HuggingFace Inference API Client
 */
export class HuggingFaceClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(apiKey: string, options?: { baseUrl?: string; timeout?: number }) {
    this.apiKey = apiKey;
    this.baseUrl = options?.baseUrl || 'https://api-inference.huggingface.co';
    this.timeout = options?.timeout || 120000; // 2 minutes default
  }

  /**
   * Generate text completion
   */
  async generate(
    model: string,
    prompt: string,
    options: HFGenerateOptions = {}
  ): Promise<{ response: HFGenerateResponse; metrics: HFInferenceMetrics }> {
    const startTime = Date.now();
    let ttft_ms = 0;

    const url = `${this.baseUrl}/models/${model}`;
    
    const payload = {
      inputs: prompt,
      parameters: {
        max_new_tokens: options.max_new_tokens || 256,
        temperature: options.temperature || 0.7,
        top_p: options.top_p || 0.95,
        top_k: options.top_k,
        repetition_penalty: options.repetition_penalty || 1.1,
        stop: options.stop_sequences,
        seed: options.seed,
        do_sample: options.do_sample ?? true,
        return_full_text: options.return_full_text ?? false,
      },
      options: {
        wait_for_model: true,
        use_cache: false,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeout),
      });

      ttft_ms = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HF API error ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      const totalLatency = Date.now() - startTime;

      // Parse response - HF returns array or object depending on model
      let generatedText: string;
      if (Array.isArray(result)) {
        generatedText = result[0]?.generated_text || '';
      } else {
        generatedText = result.generated_text || '';
      }

      // Estimate token counts (rough approximation: ~4 chars per token)
      const tokens_in = Math.ceil(prompt.length / 4);
      const tokens_out = Math.ceil(generatedText.length / 4);

      return {
        response: {
          generated_text: generatedText,
          tokens_in,
          tokens_out,
        },
        metrics: {
          ttft_ms,
          total_latency_ms: totalLatency,
          tokens_in,
          tokens_out,
        },
      };
    } catch (error) {
      const totalLatency = Date.now() - startTime;
      console.error(`[HFClient] Generation failed for ${model}:`, error);
      throw error;
    }
  }

  /**
   * Chat completion (for models that support the chat API)
   */
  async chatCompletion(
    model: string,
    messages: HFChatMessage[],
    options: HFGenerateOptions = {}
  ): Promise<{ response: HFChatResponse; metrics: HFInferenceMetrics }> {
    const startTime = Date.now();
    let ttft_ms = 0;

    // Use the chat completions endpoint for compatible models
    const url = `${this.baseUrl}/models/${model}/v1/chat/completions`;
    
    const payload = {
      model,
      messages,
      max_tokens: options.max_new_tokens || 256,
      temperature: options.temperature || 0.7,
      top_p: options.top_p || 0.95,
      stop: options.stop_sequences,
      seed: options.seed,
      stream: false,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeout),
      });

      ttft_ms = Date.now() - startTime;

      if (!response.ok) {
        // Fall back to text generation API if chat endpoint not supported
        if (response.status === 404 || response.status === 422) {
          return this.chatCompletionViaGenerate(model, messages, options);
        }
        const errorText = await response.text();
        throw new Error(`HF Chat API error ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      const totalLatency = Date.now() - startTime;

      // Extract token counts from usage if available
      const tokens_in = result.usage?.prompt_tokens || this.estimateTokens(messages.map(m => m.content).join(' '));
      const tokens_out = result.usage?.completion_tokens || this.estimateTokens(result.choices?.[0]?.message?.content || '');

      return {
        response: result,
        metrics: {
          ttft_ms,
          total_latency_ms: totalLatency,
          tokens_in,
          tokens_out,
        },
      };
    } catch (error) {
      console.error(`[HFClient] Chat completion failed for ${model}:`, error);
      throw error;
    }
  }

  /**
   * Fallback: Chat completion via text generation API
   */
  private async chatCompletionViaGenerate(
    model: string,
    messages: HFChatMessage[],
    options: HFGenerateOptions = {}
  ): Promise<{ response: HFChatResponse; metrics: HFInferenceMetrics }> {
    // Format messages as a prompt
    const prompt = this.formatChatPrompt(model, messages);
    
    const { response, metrics } = await this.generate(model, prompt, options);

    // Convert to chat response format
    const chatResponse: HFChatResponse = {
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: response.generated_text.trim(),
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: metrics.tokens_in,
        completion_tokens: metrics.tokens_out,
        total_tokens: metrics.tokens_in + metrics.tokens_out,
      },
    };

    return { response: chatResponse, metrics };
  }

  /**
   * Format chat messages as a prompt for text generation
   */
  private formatChatPrompt(model: string, messages: HFChatMessage[]): string {
    // Use Llama 3 chat format by default
    if (model.toLowerCase().includes('llama')) {
      return this.formatLlama3Prompt(messages);
    }
    
    // Use Mistral format for Mistral models
    if (model.toLowerCase().includes('mistral')) {
      return this.formatMistralPrompt(messages);
    }

    // Default format
    return this.formatGenericPrompt(messages);
  }

  private formatLlama3Prompt(messages: HFChatMessage[]): string {
    let prompt = '<|begin_of_text|>';
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        prompt += `<|start_header_id|>system<|end_header_id|>\n\n${msg.content}<|eot_id|>`;
      } else if (msg.role === 'user') {
        prompt += `<|start_header_id|>user<|end_header_id|>\n\n${msg.content}<|eot_id|>`;
      } else if (msg.role === 'assistant') {
        prompt += `<|start_header_id|>assistant<|end_header_id|>\n\n${msg.content}<|eot_id|>`;
      }
    }
    
    prompt += '<|start_header_id|>assistant<|end_header_id|>\n\n';
    return prompt;
  }

  private formatMistralPrompt(messages: HFChatMessage[]): string {
    let prompt = '<s>';
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'system') {
        prompt += `[INST] ${msg.content}\n\n`;
      } else if (msg.role === 'user') {
        prompt += `[INST] ${msg.content} [/INST]`;
      } else if (msg.role === 'assistant') {
        prompt += ` ${msg.content}</s>`;
      }
    }
    
    return prompt;
  }

  private formatGenericPrompt(messages: HFChatMessage[]): string {
    let prompt = '';
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        prompt += `System: ${msg.content}\n\n`;
      } else if (msg.role === 'user') {
        prompt += `User: ${msg.content}\n`;
      } else if (msg.role === 'assistant') {
        prompt += `Assistant: ${msg.content}\n`;
      }
    }
    
    prompt += 'Assistant: ';
    return prompt;
  }

  /**
   * Estimate token count from text
   */
  private estimateTokens(text: string): number {
    // Rough approximation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if a model is available
   */
  async isModelAvailable(model: string): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/models/${model}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get model info
   */
  async getModelInfo(model: string): Promise<Record<string, unknown> | null> {
    try {
      const url = `https://huggingface.co/api/models/${model}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
}
