/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ComputeMeta } from '../models/ComputeMeta';
import type { ModelMeta } from '../models/ModelMeta';
import type { Policy } from '../models/Policy';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class MatchService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Evaluate policy against compute/model meta
     * Evaluate a policy against compute and model metadata, returning a detailed explanation of whether the compute node is allowed and the reasons for the decision. Useful for debugging policy mismatches.
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidMatchExplain(
        requestBody: {
            policy?: Policy;
            compute_meta?: ComputeMeta;
            model_meta?: ModelMeta;
        },
    ): CancelablePromise<{
        success: boolean;
        allowed: boolean;
        reasons: Array<string>;
        policy_hash: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/match/explain',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Match compute for model
     * x402-gated with dynamic pricing when X402_ENABLED=true.
     *
     * @param requestBody
     * @param xPaymentProof Transaction hash proving USDC payment (x402 protocol)
     * @returns any OK
     * @throws ApiError
     */
    public lucidMatch(
        requestBody: {
            model_meta?: ModelMeta;
            policy?: Policy;
            compute_catalog?: Array<ComputeMeta>;
            require_live_healthy?: boolean;
        },
        xPaymentProof?: string,
    ): CancelablePromise<{
        success: boolean;
        match: Record<string, any>;
        explain: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/match',
            headers: {
                'X-Payment-Proof': xPaymentProof,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                402: `Payment Required (x402)`,
                422: `Unprocessable Entity`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Plan a route (match + resolve endpoint)
     * Perform compute matching and resolve an executable inference endpoint in a single call. Returns the matched compute node, model, endpoint URL, runtime, policy hash, and fallback options.
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidRoute(
        requestBody: {
            model_meta?: ModelMeta;
            policy?: Policy;
            compute_catalog?: Array<ComputeMeta>;
            request_id?: string;
            require_live_healthy?: boolean;
        },
    ): CancelablePromise<{
        success: boolean;
        request_id?: string;
        route: {
            compute_passport_id?: string;
            model_passport_id?: string;
            endpoint?: string;
            runtime?: string;
            policy_hash?: string;
            fallbacks?: Array<Record<string, any>>;
        };
        explain: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/route',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Unprocessable Entity`,
                500: `Internal Server Error`,
            },
        });
    }
}
