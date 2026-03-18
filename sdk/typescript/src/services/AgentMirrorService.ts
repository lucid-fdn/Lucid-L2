/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AgentProof } from '../models/AgentProof';
import type { AgentReceipt } from '../models/AgentReceipt';
import type { AgentRunProof } from '../models/AgentRunProof';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class AgentMirrorService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Get agent receipts
     * Paginated receipts filtered by agent passport ID. Admin auth required.
     * @param passportId Agent passport identifier to get receipts for
     * @param page Page number for pagination (starts at 1)
     * @param perPage Number of results per page (1-100)
     * @returns any Paginated receipts
     * @throws ApiError
     */
    public lucidGetAgentReceipts(
        passportId: string,
        page: number = 1,
        perPage: number = 20,
    ): CancelablePromise<{
        receipts: Array<AgentReceipt>;
        total: number;
        page: number;
        per_page: number;
        total_pages: number;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/agents/{passportId}/receipts',
            path: {
                'passportId': passportId,
            },
            query: {
                'page': page,
                'per_page': perPage,
            },
            errors: {
                401: `Unauthorized — missing or invalid admin key`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get agent current epoch
     * Get the current open epoch for an agent. Checks both in-memory state
     * and database for coverage across restarts.
     *
     * @param passportId Agent passport identifier for epoch lookup
     * @returns any Current epoch state
     * @throws ApiError
     */
    public lucidGetAgentEpoch(
        passportId: string,
    ): CancelablePromise<{
        active?: {
            epoch_id?: string;
            status?: string;
            leaf_count?: number;
            mmr_root?: string;
            created_at?: string;
        };
        latest_db?: {
            epoch_id?: string;
            status?: string;
            leaf_count?: number;
            mmr_root?: string;
            created_at?: string;
        } | null;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/agents/{passportId}/epoch',
            path: {
                'passportId': passportId,
            },
            errors: {
                401: `Unauthorized — missing or invalid admin key`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get agent latest proof
     * Get the latest MMR proof for an agent (most recent anchored epoch).
     * @param passportId Agent passport identifier for latest proof
     * @returns AgentProof Latest proof
     * @throws ApiError
     */
    public lucidGetAgentProof(
        passportId: string,
    ): CancelablePromise<AgentProof> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/agents/{passportId}/proof',
            path: {
                'passportId': passportId,
            },
            errors: {
                401: `Unauthorized — missing or invalid admin key`,
                404: `No anchored epoch found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get proof for specific run
     * Get proof details for a specific run_id (leaf-level proof with receipt data).
     * @param passportId Agent passport identifier
     * @param runId Specific inference run identifier for leaf-level proof
     * @returns AgentRunProof Run-level proof
     * @throws ApiError
     */
    public lucidGetAgentRunProof(
        passportId: string,
        runId: string,
    ): CancelablePromise<AgentRunProof> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/agents/{passportId}/proof/{runId}',
            path: {
                'passportId': passportId,
                'runId': runId,
            },
            errors: {
                401: `Unauthorized — missing or invalid admin key`,
                404: `Receipt or epoch not found`,
                500: `Internal Server Error`,
            },
        });
    }
}
