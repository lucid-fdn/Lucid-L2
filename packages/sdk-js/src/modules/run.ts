// @lucidlayer/sdk - Run Module
// Inference execution operations

import type { LucidClient } from '../client';
import type {
  InferenceRequest,
  InferenceResult,
  StreamChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatMessage,
} from '../types';

/**
 * RunModule - Execute inference on models
 * 
 * @example
 * ```typescript
 * // Simple inference
 * const result = await client.run.inference({
 *   model_passport_id: 'model-id',
 *   prompt: 'What is the capital of France?',
 *   max_tokens: 100
 * });
 * 
 * // Streaming inference
 * for await (const chunk of client.run.inferenceStream({
 *   model_passport_id: 'model-id',
 *   prompt: 'Tell me a story',
 *   stream: true
 * })) {
 *   process.stdout.write(chunk.text || '');
 * }
 * 
 * // OpenAI-compatible chat completion
 * const response = await client.run.chatCompletion({
 *   model: 'passport:model-id',
 *   messages: [
 *     { role: 'user', content: 'Hello!' }
 *   ]
 * });
 * ```
 */
export class RunModule {
  constructor(private client: LucidClient) {}

  /**
   * Execute inference (non-streaming)
   * 
   * @param request Inference request
   * @returns Inference result with text, metrics, and receipt ID
   */
  async inference(request: InferenceRequest): Promise<InferenceResult> {
    // Normalize model field to model_passport_id
    const body = { ...request, stream: false };
    if (body.model && !body.model_passport_id) {
      const modelStr = body.model;
      body.model_passport_id = modelStr.startsWith('passport:') 
        ? modelStr.slice(9) 
        : modelStr;
      delete body.model;
    }

    const response = await this.client.request<InferenceResult>(
      'POST',
      '/v1/run/inference',
      { body }
    );

    return response;
  }

  /**
   * Execute inference with streaming response
   * 
   * @param request Inference request
   * @yields Stream chunks with text and metadata
   */
  async *inferenceStream(
    request: InferenceRequest
  ): AsyncGenerator<StreamChunk, StreamChunk | void, unknown> {
    // Normalize model field to model_passport_id
    const body = { ...request, stream: true };
    if (body.model && !body.model_passport_id) {
      const modelStr = body.model;
      body.model_passport_id = modelStr.startsWith('passport:')
        ? modelStr.slice(9)
        : modelStr;
      delete body.model;
    }

    let finalChunk: StreamChunk | undefined;

    for await (const chunk of this.client.requestStream<StreamChunk>(
      '/v1/run/inference',
      body
    )) {
      if (chunk.done) {
        finalChunk = chunk;
      }
      yield chunk;
    }

    return finalChunk;
  }

  /**
   * OpenAI-compatible chat completion (non-streaming)
   * 
   * @param request Chat completion request
   * @returns OpenAI-compatible response with LucidLayer extensions
   */
  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const body = { ...request, stream: false };

    const response = await this.client.request<ChatCompletionResponse>(
      'POST',
      '/v1/chat/completions',
      { body }
    );

    return response;
  }

  /**
   * OpenAI-compatible chat completion with streaming
   * 
   * @param request Chat completion request
   * @yields OpenAI-compatible stream chunks
   */
  async *chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const body = { ...request, stream: true };

    for await (const chunk of this.client.requestStream<ChatCompletionChunk>(
      '/v1/chat/completions',
      body
    )) {
      yield chunk;
    }
  }

  /**
   * Helper: Simple completion with just prompt and model
   * 
   * @param modelId Model passport ID
   * @param prompt Text prompt
   * @param options Additional options
   * @returns Generated text
   */
  async complete(
    modelId: string,
    prompt: string,
    options?: {
      max_tokens?: number;
      temperature?: number;
      stop?: string[];
    }
  ): Promise<string> {
    const result = await this.inference({
      model_passport_id: modelId,
      prompt,
      ...options,
    });

    return result.text || '';
  }

  /**
   * Helper: Simple chat with messages
   * 
   * @param modelId Model passport ID
   * @param messages Chat messages
   * @param options Additional options
   * @returns Assistant's response
   */
  async chat(
    modelId: string,
    messages: ChatMessage[],
    options?: {
      max_tokens?: number;
      temperature?: number;
      stop?: string[];
    }
  ): Promise<string> {
    const response = await this.chatCompletion({
      model: `passport:${modelId}`,
      messages,
      ...options,
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * Helper: Streaming completion with callback
   * 
   * @param modelId Model passport ID
   * @param prompt Text prompt
   * @param onChunk Callback for each chunk
   * @param options Additional options
   * @returns Final result with metrics
   */
  async streamComplete(
    modelId: string,
    prompt: string,
    onChunk: (text: string) => void,
    options?: {
      max_tokens?: number;
      temperature?: number;
    }
  ): Promise<StreamChunk | void> {
    let finalChunk: StreamChunk | void;

    for await (const chunk of this.inferenceStream({
      model_passport_id: modelId,
      prompt,
      ...options,
    })) {
      if (chunk.text) {
        onChunk(chunk.text);
      }
      if (chunk.done) {
        finalChunk = chunk;
      }
    }

    return finalChunk;
  }
}
