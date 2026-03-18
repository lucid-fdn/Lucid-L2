/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Epoch } from '../models/Epoch';
import type { EpochsReadyResponse } from '../models/EpochsReadyResponse';
import type { EpochStatsResponse } from '../models/EpochStatsResponse';
import type { Pagination } from '../models/Pagination';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class EpochsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Get current epoch
     * Retrieve the current open epoch, optionally filtered by project_id. Returns epoch metadata including MMR root, leaf count, status, and timestamps.
     *
     * @param projectId Filter by project identifier
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetCurrentEpoch(
        projectId?: string,
    ): CancelablePromise<{
        success: boolean;
        epoch: Epoch;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/epochs/current',
            query: {
                'project_id': projectId,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * List epochs
     * Retrieve a paginated list of epochs with optional filtering by project_id and status (open, anchoring, anchored, failed). Defaults to page 1, 20 results per page.
     *
     * @param projectId Filter by project identifier
     * @param status Filter by epoch status (open, anchoring, anchored, failed)
     * @param page Page number for pagination (starts at 1)
     * @param perPage Number of results per page (1-100)
     * @returns any OK
     * @throws ApiError
     */
    public lucidListEpochs(
        projectId?: string,
        status?: string,
        page?: number,
        perPage?: number,
    ): CancelablePromise<{
        success: boolean;
        epochs: Array<Epoch>;
        pagination: Pagination;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/epochs',
            query: {
                'project_id': projectId,
                'status': status,
                'page': page,
                'per_page': perPage,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Create epoch
     * Create a new epoch, optionally scoped to a project_id. The epoch starts in 'open' status with an empty MMR root and zero leaf count.
     *
     * @param requestBody
     * @returns any Created
     * @throws ApiError
     */
    public lucidCreateEpoch(
        requestBody?: {
            project_id?: string;
        },
    ): CancelablePromise<{
        success: boolean;
        epoch: Epoch;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/epochs',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get epoch
     * Retrieve a single epoch by its epoch_id, including the MMR root, leaf count, status, and on-chain anchoring details.
     *
     * @param epochId Unique epoch identifier
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetEpoch(
        epochId: string,
    ): CancelablePromise<{
        success: boolean;
        epoch: Epoch;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/epochs/{epoch_id}',
            path: {
                'epoch_id': epochId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Retry failed epoch
     * Retry the on-chain anchoring for an epoch that previously failed. The epoch must be in 'failed' status. Resets the status and re-submits the Solana transaction.
     *
     * @param epochId Epoch identifier to retry anchoring for
     * @returns any OK
     * @throws ApiError
     */
    public lucidRetryEpoch(
        epochId: string,
    ): CancelablePromise<{
        success: boolean;
        epoch: {
            epoch_id: string;
            status: string;
        };
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/epochs/{epoch_id}/retry',
            path: {
                'epoch_id': epochId,
            },
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Verify epoch anchor
     * Verify an epoch's on-chain anchor by comparing the committed MMR root on Solana with the expected off-chain root. Returns the comparison result and transaction signature.
     *
     * @param epochId Epoch identifier to verify on-chain anchor
     * @returns any OK
     * @throws ApiError
     */
    public lucidVerifyEpoch(
        epochId: string,
    ): CancelablePromise<{
        success: boolean;
        valid: boolean;
        on_chain_root?: string | null;
        expected_root?: string | null;
        tx_signature?: string | null;
        error?: string | null;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/epochs/{epoch_id}/verify',
            path: {
                'epoch_id': epochId,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get epoch anchoring transaction
     * Retrieve the Solana transaction details for an epoch's on-chain anchoring, including the transaction signature, slot number, and block time.
     *
     * @param epochId Epoch identifier to get anchoring transaction details
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetEpochTransaction(
        epochId: string,
    ): CancelablePromise<{
        success: boolean;
        tx_signature: string;
        slot?: number;
        block_time?: number;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/epochs/{epoch_id}/transaction',
            path: {
                'epoch_id': epochId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Commit epoch root
     * Finalize the current epoch and commit its MMR root to Solana via the thought_epoch program. Optionally force-commit even if the epoch threshold has not been reached.
     *
     * @param requestBody
     * @returns any Accepted
     * @throws ApiError
     */
    public lucidCommitEpochRoot(
        requestBody?: {
            project_id?: string;
            epoch_id?: string;
            force?: boolean;
        },
    ): CancelablePromise<{
        success: boolean;
        epoch_id: string;
        root: string;
        tx: string;
        leaf_count?: number;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/receipts/commit-root',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
                503: `Service Unavailable`,
            },
        });
    }
    /**
     * Commit multiple epoch roots
     * Commit multiple epoch roots to Solana in a single batch operation. Returns per-epoch success/failure results with transaction signatures. Uses the batch commit instruction for gas efficiency.
     *
     * @param requestBody
     * @returns any Accepted
     * @throws ApiError
     */
    public lucidCommitEpochRootsBatch(
        requestBody: {
            epoch_ids: Array<string>;
        },
    ): CancelablePromise<{
        success: boolean;
        total: number;
        successful_count: number;
        failed_count: number;
        results: Array<{
            success?: boolean;
            epoch_id?: string;
            root?: string;
            signature?: string;
            error?: string;
        }>;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/receipts/commit-roots-batch',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Anchoring service health
     * Check the health of the on-chain anchoring service, including Solana connection status, network type, authority address, and whether mock mode is active.
     *
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetAnchoringHealth(): CancelablePromise<{
        success: boolean;
        connected: boolean;
        network?: string;
        authority?: string;
        mock_mode?: boolean;
        error?: string;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/anchoring/health',
            errors: {
                500: `Internal Server Error`,
                503: `Service Unavailable`,
            },
        });
    }
    /**
     * Get epochs ready for finalization
     * List all epochs that have met the finalization threshold (more than 100 receipts or older than 1 hour) and are ready to be committed on-chain.
     *
     * @returns EpochsReadyResponse OK
     * @throws ApiError
     */
    public lucidListEpochsReady(): CancelablePromise<EpochsReadyResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/epochs/ready',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Epoch statistics
     * Retrieve aggregate epoch statistics including total count, counts by status, average receipts per epoch, and anchoring success rate.
     *
     * @returns EpochStatsResponse OK
     * @throws ApiError
     */
    public lucidGetEpochStats(): CancelablePromise<EpochStatsResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/epochs/stats',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
}
