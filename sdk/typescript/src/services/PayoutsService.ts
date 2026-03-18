/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Payout } from '../models/Payout';
import type { PayoutCalculateRequest } from '../models/PayoutCalculateRequest';
import type { PayoutFromReceiptRequest } from '../models/PayoutFromReceiptRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class PayoutsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Calculate payout split
     * Calculate a revenue split for a set of recipients using basis-point math. Default split is 70% compute, 20% model, 10% protocol (configurable via request body).
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidCalculatePayout(
        requestBody: PayoutCalculateRequest,
    ): CancelablePromise<{
        success: boolean;
        payout: Payout;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/payouts/calculate',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Create payout from receipt token data
     * Extract token usage data from a receipt and compute the payout split automatically. Uses the receipt's model and compute passport IDs to resolve the split configuration.
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidPayoutFromReceipt(
        requestBody: PayoutFromReceiptRequest,
    ): CancelablePromise<{
        success: boolean;
        payout: Payout;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/payouts/from-receipt',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get payout by run_id
     * Retrieve the computed payout split for a specific inference run by its run_id, including per-recipient amounts and the overall split configuration.
     *
     * @param runId Inference run identifier associated with the payout
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetPayout(
        runId: string,
    ): CancelablePromise<{
        success: boolean;
        payout: Payout;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/payouts/{run_id}',
            path: {
                'run_id': runId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Verify payout split
     * Verify the integrity of a payout split by checking that recipient amounts sum to the total, all recipients are valid addresses, and the payout hash is correct.
     *
     * @param runId Inference run identifier to verify payout integrity
     * @returns any OK
     * @throws ApiError
     */
    public lucidVerifyPayout(
        runId: string,
    ): CancelablePromise<{
        success: boolean;
        valid: boolean;
        total_matches?: boolean;
        recipients_valid?: boolean;
        hash_valid?: boolean;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/payouts/{run_id}/verify',
            path: {
                'run_id': runId,
            },
            errors: {
                404: `Not Found`,
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
