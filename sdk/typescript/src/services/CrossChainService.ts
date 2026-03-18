/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ChainInfo } from '../models/ChainInfo';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class CrossChainService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * List supported chains
     * List all supported chains with connection status and ERC-8004 info.
     * @returns any OK
     * @throws ApiError
     */
    public lucidListChains(): CancelablePromise<{
        success: boolean;
        count: number;
        chains: Array<ChainInfo>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/chains',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get chain status
     * Get detailed status for a specific chain including account address.
     * @param chainId Chain identifier (e.g. base, ethereum, solana-devnet)
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetChainStatus(
        chainId: string,
    ): CancelablePromise<{
        success: boolean;
        chain: (ChainInfo & {
            /**
             * Account address on this chain
             */
            account?: string;
        });
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/chains/{chainId}/status',
            path: {
                'chainId': chainId,
            },
            errors: {
                404: `Chain not found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Validate a receipt cross-chain
     * Validate a receipt locally and optionally submit the validation on-chain
     * via the ERC-8004 Validation Registry.
     *
     * @param requestBody
     * @returns any Validation result
     * @throws ApiError
     */
    public lucidCrossChainValidate(
        requestBody: {
            receipt_hash?: string;
            run_id?: string;
            signature?: string;
            /**
             * If provided, submit validation on-chain
             */
            chain_id?: string;
            /**
             * ERC-8004 token ID for on-chain submission
             */
            agent_token_id?: string;
        },
    ): CancelablePromise<{
        success: boolean;
        receipt_hash: string;
        run_id: string;
        local_valid: boolean;
        hash_valid: boolean;
        signature_valid: boolean;
        on_chain?: {
            tx_hash?: string;
            confirmed?: boolean;
        };
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/validate',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Chain-aware compute routing
     * Route with chain_id parameter for chain-aware compute matching.
     * Extends the standard /v1/match with cross-chain context.
     *
     * @param requestBody
     * @returns any Route computed
     * @throws ApiError
     */
    public lucidCrossChainRoute(
        requestBody: {
            model_meta: Record<string, any>;
            policy: Record<string, any>;
            compute_catalog: Array<Record<string, any>>;
            request_id?: string;
            require_live_healthy?: boolean;
            /**
             * Target chain for routing context
             */
            chain_id?: string;
        },
    ): CancelablePromise<{
        success: boolean;
        request_id: string;
        chain_id?: string;
        route: Record<string, any>;
        explain: Record<string, any>;
        chain?: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/route',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Register agent on ERC-8004
     * Register an agent on the ERC-8004 Identity Registry on a specific chain.
     * @param requestBody
     * @returns any Agent registered
     * @throws ApiError
     */
    public lucidRegisterAgentOnChain(
        requestBody: {
            chain_id: string;
            name?: string;
            description?: string;
            metadata_uri: string;
            endpoints?: Array<string>;
            capabilities?: Array<string>;
            wallets?: Array<string>;
        },
    ): CancelablePromise<{
        success: boolean;
        chain_id: string;
        tx_hash: string;
        confirmed: boolean;
        block_number?: number;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/agents/register',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Cross-chain reputation query
     * Query an agent's reputation across all chains or a specific chain.
     * @param agentId Agent identifier for cross-chain reputation query
     * @param chainId Filter to specific chain (omit for all chains)
     * @returns any Reputation data
     * @throws ApiError
     */
    public lucidGetAgentCrossChainReputation(
        agentId: string,
        chainId?: string,
    ): CancelablePromise<{
        success: boolean;
        agent_id: string;
        chains_queried: number;
        results: Array<{
            chain_id?: string;
            score?: number;
            feedback_count?: number;
        }>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/agents/{agentId}/reputation',
            path: {
                'agentId': agentId,
            },
            query: {
                'chain_id': chainId,
            },
            errors: {
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
    /**
     * Execute payout on-chain
     * Execute a payout split on-chain via USDC transfers.
     * @param requestBody
     * @returns any Payout executed
     * @throws ApiError
     */
    public lucidExecutePayoutOnChain(
        requestBody: {
            run_id: string;
            chainId: string;
        },
    ): CancelablePromise<{
        success: boolean;
        execution: {
            run_id?: string;
            chain_id?: string;
            transfers?: Array<{
                recipient?: string;
                amount?: string;
                tx_hash?: string;
            }>;
        };
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/payouts/execute',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get payout execution status
     * Get the execution status and details for a specific payout.
     * @param runId Inference run identifier for payout execution lookup
     * @param chainId Chain on which the payout was executed
     * @returns any Execution status
     * @throws ApiError
     */
    public lucidGetPayoutExecution(
        runId: string,
        chainId: string,
    ): CancelablePromise<{
        success: boolean;
        execution: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/payouts/{runId}/execution',
            path: {
                'runId': runId,
            },
            query: {
                'chainId': chainId,
            },
            errors: {
                400: `Bad Request`,
                404: `Execution not found`,
                500: `Internal Server Error`,
            },
        });
    }
}
