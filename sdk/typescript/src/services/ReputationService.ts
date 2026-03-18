/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AlgorithmScore } from '../models/AlgorithmScore';
import type { CompositeReputationScore } from '../models/CompositeReputationScore';
import type { ReputationAlgorithmInfo } from '../models/ReputationAlgorithmInfo';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ReputationService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * List available scoring algorithms
     * List all registered reputation scoring algorithms with their IDs, names, descriptions, and version information. Used to discover available algorithms before computing scores.
     *
     * @returns any OK
     * @throws ApiError
     */
    public lucidListReputationAlgorithms(): CancelablePromise<{
        success: boolean;
        algorithms: Array<ReputationAlgorithmInfo>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/reputation/algorithms',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Compute reputation score
     * Compute a reputation score for an agent using a specific algorithm.
     * Defaults to `receipt-volume-v1` if no algorithmId is provided.
     *
     * @param agentId Agent identifier for reputation computation
     * @param requestBody
     * @returns any Score computed
     * @throws ApiError
     */
    public lucidComputeReputation(
        agentId: string,
        requestBody?: {
            /**
             * Algorithm to use (default: receipt-volume-v1)
             */
            algorithmId?: string;
            /**
             * Optional context for the computation (chain IDs, time range, etc.)
             */
            context?: Record<string, any>;
        },
    ): CancelablePromise<{
        success: boolean;
        algorithmId: string;
        agentId: string;
        score: AlgorithmScore;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/reputation/{agentId}/compute',
            path: {
                'agentId': agentId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get composite reputation score
     * Computes a composite reputation score from all registered algorithms
     * with equal weighting.
     *
     * @param agentId Agent identifier for composite reputation score
     * @returns any Composite score
     * @throws ApiError
     */
    public lucidGetCompositeReputation(
        agentId: string,
    ): CancelablePromise<{
        success: boolean;
        agentId: string;
        composite: CompositeReputationScore;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/reputation/{agentId}/composite',
            path: {
                'agentId': agentId,
            },
            errors: {
                400: `Bad Request`,
                404: `No algorithms registered`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Unified cross-chain reputation score
     * Aggregate reputation across all chains into a unified score.
     * @param agentId Agent identifier for unified cross-chain reputation
     * @returns any Unified score
     * @throws ApiError
     */
    public lucidGetUnifiedReputation(
        agentId: string,
    ): CancelablePromise<{
        success: boolean;
        agentId: string;
        unifiedScore: number;
        totalFeedbackCount: number;
        chainCount: number;
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/reputation/{agentId}',
            path: {
                'agentId': agentId,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Per-chain reputation breakdown
     * Get per-chain reputation breakdown with feedback records.
     * @param agentId Agent identifier for per-chain reputation breakdown
     * @returns any Breakdown by chain
     * @throws ApiError
     */
    public lucidGetReputationBreakdown(
        agentId: string,
    ): CancelablePromise<{
        success: boolean;
        agentId: string;
        chainCount: number;
        chains: Array<{
            chainId?: string;
            score?: number;
            feedbackCount?: number;
            feedback?: Array<Record<string, any>>;
        }>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/reputation/{agentId}/breakdown',
            path: {
                'agentId': agentId,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Sybil-resistant receipt-based reputation
     * Compute a sybil-resistant reputation score derived from verified receipts.
     * Only counts receipts with valid hashes and signatures.
     *
     * @param agentId Agent identifier for receipt-based reputation
     * @returns any Receipt-based score
     * @throws ApiError
     */
    public lucidGetReceiptBasedReputation(
        agentId: string,
    ): CancelablePromise<{
        success: boolean;
        agentId?: string;
        score?: number;
        receiptCount?: number;
        verifiedCount?: number;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/reputation/{agentId}/receipt-based',
            path: {
                'agentId': agentId,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Submit reputation on-chain
     * Submit receipt-based reputation to the on-chain Reputation Registry.
     * @param agentId Agent identifier for on-chain reputation submission
     * @param requestBody
     * @returns any Submission result
     * @throws ApiError
     */
    public lucidSubmitReputationOnChain(
        agentId: string,
        requestBody: {
            /**
             * Target chain for on-chain submission
             */
            chainId: string;
        },
    ): CancelablePromise<{
        success: boolean;
        txHash?: string;
        score?: number;
        error?: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/reputation/{agentId}/submit',
            path: {
                'agentId': agentId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Reputation indexer status
     * Get the status of the cross-chain reputation indexer across all chains.
     * @returns any Indexer status
     * @throws ApiError
     */
    public lucidGetReputationIndexerStatus(): CancelablePromise<{
        success: boolean;
        chains: Array<{
            chainId?: string;
            connected?: boolean;
            lastIndexedBlock?: number;
            status?: string;
        }>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/reputation/indexer/status',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
}
