/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ChatCompletionRequest } from '../models/ChatCompletionRequest';
import type { ChatCompletionResponse } from '../models/ChatCompletionResponse';
import type { InferenceRequest } from '../models/InferenceRequest';
import type { InferenceResult } from '../models/InferenceResult';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class RunService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Run inference (optionally streaming via SSE)
     * Execute inference through the LucidLayer execution gateway. Supports both streaming (SSE) and non-streaming responses. A cryptographic receipt is generated for each successful inference.
     *
     * @param requestBody
     * @returns InferenceResult Non-streaming inference result
     * @throws ApiError
     */
    public lucidRunInference(
        requestBody: InferenceRequest,
    ): CancelablePromise<InferenceResult> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/run/inference',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Unprocessable Entity`,
                500: `Internal Server Error`,
                503: `Service Unavailable`,
            },
        });
    }
    /**
     * OpenAI-compatible chat completions
     * x402-gated with dynamic pricing. If `X402_ENABLED=true`, requests without
     * a valid `X-Payment-Proof` header receive HTTP 402 with payment instructions.
     * Pricing is resolved per-model from the asset_pricing table.
     *
     * @param requestBody
     * @param xPaymentProof Transaction hash proving USDC payment (x402 protocol)
     * @returns ChatCompletionResponse Chat completion response
     * @throws ApiError
     */
    public lucidChatCompletions(
        requestBody: ChatCompletionRequest,
        xPaymentProof?: string,
    ): CancelablePromise<ChatCompletionResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/chat/completions',
            headers: {
                'X-Payment-Proof': xPaymentProof,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                402: `Payment Required (x402)`,
                500: `Internal Server Error`,
            },
        });
    }
}
