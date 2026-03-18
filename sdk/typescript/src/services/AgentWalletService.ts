/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AgentWalletLimitsRequest } from '../models/AgentWalletLimitsRequest';
import type { AgentWalletSendRequest } from '../models/AgentWalletSendRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class AgentWalletService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Get agent wallet balance
     * Retrieve the wallet balance for a deployed agent's PDA wallet, including SOL and token balances on the configured chain.
     *
     * @param agentId Agent passport identifier for wallet balance
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetAgentWalletBalance(
        agentId: string,
    ): CancelablePromise<{
        success: boolean;
        balance: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/agents/{agentId}/wallet/balance',
            path: {
                'agentId': agentId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Send from agent wallet
     * Admin-only. Execute a policy-gated transaction from the agent's PDA wallet.
     *
     * @param agentId Agent passport identifier for wallet send
     * @param requestBody
     * @returns any Transaction executed
     * @throws ApiError
     */
    public lucidAgentWalletSend(
        agentId: string,
        requestBody: AgentWalletSendRequest,
    ): CancelablePromise<{
        success: boolean;
        transaction: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/agents/{agentId}/wallet/send',
            path: {
                'agentId': agentId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Set agent wallet spending limits
     * Admin-only. Set per-transaction and daily spending limits.
     * @param agentId Agent passport identifier for wallet limits
     * @param requestBody
     * @returns any Limits updated
     * @throws ApiError
     */
    public lucidSetAgentWalletLimits(
        agentId: string,
        requestBody: AgentWalletLimitsRequest,
    ): CancelablePromise<{
        success: boolean;
        message: string;
    }> {
        return this.httpRequest.request({
            method: 'PUT',
            url: '/v1/agents/{agentId}/wallet/limits',
            path: {
                'agentId': agentId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get agent wallet policy
     * Retrieve the wallet policy and configuration for an agent, including the wallet address, chain, provider type, and any spending constraints.
     *
     * @param agentId Agent passport identifier for wallet policy
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetAgentWalletPolicy(
        agentId: string,
    ): CancelablePromise<{
        success: boolean;
        wallet: {
            address?: string;
            chain?: string;
            provider?: string;
            agent_passport_id?: string;
        };
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/agents/{agentId}/wallet/policy',
            path: {
                'agentId': agentId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
}
