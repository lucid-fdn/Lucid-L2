import { Router } from 'express';
import {
  executeInferenceRequest,
  executeStreamingInferenceRequest,
  executeChatCompletion,
  ExecutionRequest,
  ChatCompletionRequest,
} from '../../inference/executionGateway';
import { requirePayment } from '../../middleware/x402';

export const inferenceRouter = Router();

/**
 * POST /v1/run/inference
 * Execute inference through the execution gateway
 *
 * Body: {
 *   model_passport_id: string,
 *   prompt?: string,
 *   messages?: Array<{ role: string, content: string }>,
 *   max_tokens?: number,
 *   temperature?: number,
 *   top_p?: number,
 *   top_k?: number,
 *   stop?: string[],
 *   stream?: boolean,
 *   policy?: Policy,
 *   compute_catalog?: any[],
 *   compute_passport_id?: string,
 *   trace_id?: string,
 *   request_id?: string
 * }
 *
 * Response (non-streaming): ExecutionResult
 * Response (streaming): SSE stream of tokens
 */
inferenceRouter.post('/v1/run/inference', async (req, res) => {
  // Deprecation headers — clients should migrate to TrustGate /v1/chat/completions
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', '2026-06-01');
  res.setHeader('Link', '</v1/chat/completions>; rel="successor-version"');

  try {
    const request = req.body as ExecutionRequest;

    // Validate required fields
    if (!request.model_passport_id && !request.model_meta) {
      return res.status(400).json({
        success: false,
        error: 'model_passport_id or model_meta is required',
      });
    }

    if (!request.prompt && !request.messages) {
      return res.status(400).json({
        success: false,
        error: 'prompt or messages is required',
      });
    }

    // Handle streaming response
    if (request.stream) {
      try {
        const streamResult = await executeStreamingInferenceRequest(request);

        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Run-ID', streamResult.run_id);
        res.setHeader('X-Model-Passport-ID', streamResult.model_passport_id);
        res.setHeader('X-Compute-Passport-ID', streamResult.compute_passport_id);
        res.flushHeaders();

        // Stream tokens
        for await (const chunk of streamResult.stream) {
          const data = JSON.stringify({
            run_id: streamResult.run_id,
            text: chunk.text,
            is_first: chunk.is_first,
            is_last: chunk.is_last,
            finish_reason: chunk.finish_reason,
          });
          res.write(`data: ${data}\n\n`);
        }

        // Finalize and get metrics
        const final = await streamResult.finalize();
        const doneData = JSON.stringify({
          run_id: streamResult.run_id,
          done: true,
          tokens_in: final.tokens_in,
          tokens_out: final.tokens_out,
          ttft_ms: final.ttft_ms,
          total_latency_ms: final.total_latency_ms,
          receipt_id: final.receipt_id,
        });
        res.write(`data: ${doneData}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (streamError) {
        const errorMsg = streamError instanceof Error ? streamError.message : 'Stream error';
        if (!res.headersSent) {
          return res.status(503).json({
            success: false,
            error: errorMsg,
            error_code: errorMsg === 'NO_COMPATIBLE_COMPUTE' ? 'NO_COMPATIBLE_COMPUTE' : 'STREAM_ERROR',
          });
        }
        // If headers already sent, send error in stream
        res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
        res.end();
      }
      return;
    }

    // Non-streaming response
    const result = await executeInferenceRequest(request);

    if (!result.success) {
      const statusCode = result.error_code === 'NO_COMPATIBLE_COMPUTE' ? 422 : 503;
      return res.status(statusCode).json({
        success: false,
        run_id: result.run_id,
        error: result.error,
        error_code: result.error_code,
        total_latency_ms: result.total_latency_ms,
      });
    }

    return res.json({
      success: true,
      run_id: result.run_id,
      request_id: result.request_id,
      trace_id: result.trace_id,
      text: result.text,
      finish_reason: result.finish_reason,
      tokens_in: result.tokens_in,
      tokens_out: result.tokens_out,
      ttft_ms: result.ttft_ms,
      total_latency_ms: result.total_latency_ms,
      model_passport_id: result.model_passport_id,
      compute_passport_id: result.compute_passport_id,
      runtime: result.runtime,
      policy_hash: result.policy_hash,
      receipt_id: result.receipt_id,
      used_fallback: result.used_fallback,
      fallback_reason: result.fallback_reason,
    });
  } catch (error) {
    console.error('Error in POST /v1/run/inference:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v1/chat/completions
 * OpenAI-compatible chat completions endpoint
 *
 * Body: OpenAI ChatCompletionRequest format
 * - model: string (use "passport:<passport_id>" for LucidLayer models)
 * - messages: Array<{ role: string, content: string }>
 * - max_tokens?: number
 * - temperature?: number
 * - top_p?: number
 * - stop?: string | string[]
 * - stream?: boolean
 *
 * LucidLayer extensions:
 * - policy?: Policy
 * - trace_id?: string
 *
 * Response: OpenAI ChatCompletionResponse format with LucidLayer extensions
 */
inferenceRouter.post('/v1/chat/completions', requirePayment({ dynamic: true }), async (req, res) => {
  // Deprecation headers — clients should migrate to TrustGate /v1/chat/completions
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', '2026-06-01');
  res.setHeader('Link', '</v1/chat/completions>; rel="successor-version"');

  try {
    const request = req.body as ChatCompletionRequest;

    // Validate required fields
    if (!request.model) {
      return res.status(400).json({
        error: {
          message: 'model is required',
          type: 'invalid_request_error',
          param: 'model',
          code: 'missing_required_parameter',
        },
      });
    }

    if (!request.messages || !Array.isArray(request.messages) || request.messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'messages is required and must be a non-empty array',
          type: 'invalid_request_error',
          param: 'messages',
          code: 'missing_required_parameter',
        },
      });
    }

    // Handle streaming response
    if (request.stream) {
      // Parse model to get passport ID
      let model_passport_id: string | undefined;
      if (request.model.startsWith('passport:')) {
        model_passport_id = request.model.slice(9);
      }

      // Build execution request
      const execRequest: ExecutionRequest = {
        model_passport_id,
        messages: request.messages,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        stop: Array.isArray(request.stop) ? request.stop : request.stop ? [request.stop] : undefined,
        stream: true,
        policy: request.policy,
        trace_id: request.trace_id,
      };

      try {
        const streamResult = await executeStreamingInferenceRequest(execRequest);

        // Set up SSE headers for OpenAI-compatible streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        let chunkIndex = 0;
        for await (const chunk of streamResult.stream) {
          const sseChunk = {
            id: streamResult.run_id,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: request.model,
            choices: [{
              index: 0,
              delta: chunkIndex === 0
                ? { role: 'assistant', content: chunk.text }
                : { content: chunk.text },
              finish_reason: chunk.finish_reason || null,
            }],
          };
          res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
          chunkIndex++;
        }

        res.write('data: [DONE]\n\n');
        res.end();

        // Finalize asynchronously (receipt creation)
        streamResult.finalize().catch(console.error);
      } catch (streamError) {
        const errorMsg = streamError instanceof Error ? streamError.message : 'Stream error';
        if (!res.headersSent) {
          return res.status(503).json({
            error: {
              message: errorMsg,
              type: 'server_error',
              code: errorMsg === 'NO_COMPATIBLE_COMPUTE' ? 'no_compatible_compute' : 'stream_error',
            },
          });
        }
        res.end();
      }
      return;
    }

    // Non-streaming response
    const response = await executeChatCompletion(request);

    return res.json(response);
  } catch (error) {
    console.error('Error in POST /v1/chat/completions:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      error: {
        message: errorMsg,
        type: 'server_error',
        code: 'internal_error',
      },
    });
  }
});
