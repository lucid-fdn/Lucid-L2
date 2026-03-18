/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AgentPayoutEntry } from '../models/AgentPayoutEntry';
import type { AgentRevenuePool } from '../models/AgentRevenuePool';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class AgentRevenueService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Get agent revenue pool status
     * Retrieve the accumulated revenue pool for an agent, including total earned, pending distribution, and the share token configuration if launched.
     *
     * @param agentId Agent passport identifier for revenue query
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetAgentRevenue(
        agentId: string,
    ): CancelablePromise<{
        success: boolean;
        revenue: AgentRevenuePool;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/agents/{agentId}/revenue',
            path: {
                'agentId': agentId,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Trigger revenue airdrop to share token holders
     * Admin-only. Distributes accumulated agent revenue to share token holders
     * proportionally based on their holdings.
     *
     * @param agentId Agent passport identifier for revenue airdrop
     * @returns any Airdrop executed
     * @throws ApiError
     */
    public lucidTriggerAgentAirdrop(
        agentId: string,
    ): CancelablePromise<{
        success: boolean;
        airdrop: {
            distributed_lamports?: string;
            holder_count?: number;
        };
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/agents/{agentId}/revenue/airdrop',
            path: {
                'agentId': agentId,
            },
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get agent payout history
     * Retrieve the complete payout history for an agent, including airdrop distributions, amounts, recipient counts, and timestamps.
     *
     * @param agentId Agent passport identifier for payout history
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetAgentRevenueHistory(
        agentId: string,
    ): CancelablePromise<{
        success: boolean;
        history: Array<AgentPayoutEntry>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/agents/{agentId}/revenue/history',
            path: {
                'agentId': agentId,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
}
