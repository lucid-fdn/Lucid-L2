/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AgentAccomplishRequest } from '../models/AgentAccomplishRequest';
import type { AgentBatchEpochsRequest } from '../models/AgentBatchEpochsRequest';
import type { AgentEpochRequest } from '../models/AgentEpochRequest';
import type { AgentHistoryEntry } from '../models/AgentHistoryEntry';
import type { AgentInitRequest } from '../models/AgentInitRequest';
import type { AgentPlanRequest } from '../models/AgentPlanRequest';
import type { AgentProofRequest } from '../models/AgentProofRequest';
import type { AgentStats } from '../models/AgentStats';
import type { GasCost } from '../models/GasCost';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class AgentsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @deprecated
     * Initialize an AI agent
     * DEPRECATED. Initialize or load a legacy agent for MMR-based proof-of-contribution tracking. Use /v1/agents/deploy instead for new agent deployments.
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidInitAgent(
        requestBody: AgentInitRequest,
    ): CancelablePromise<{
        success: boolean;
        agentId: string;
        initialized: boolean;
        stats?: AgentStats;
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/agents/init',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * @deprecated
     * Process an epoch for an agent
     * DEPRECATED. Process an epoch of vectors for a legacy agent, computing the MMR root and optionally anchoring on-chain. Use /v1/agents* endpoints instead.
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidProcessAgentEpoch(
        requestBody: AgentEpochRequest,
    ): CancelablePromise<{
        success: boolean;
        agentId: string;
        epochNumber: number;
        vectorCount: number;
        mmrRoot: string;
        depinCid?: string;
        transactionSignature?: string;
        gasCost?: GasCost;
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/agents/epoch',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * @deprecated
     * Process multiple epochs in batch
     * DEPRECATED. Process multiple epochs in batch for one or more legacy agents. Returns per-epoch results with MMR roots and transaction signatures. Use /v1/agents* endpoints instead.
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidProcessAgentBatchEpochs(
        requestBody: AgentBatchEpochsRequest,
    ): CancelablePromise<{
        success: boolean;
        processedEpochs: number;
        results: Array<{
            agentId?: string;
            epochNumber?: number;
            mmrRoot?: string;
            depinCid?: string;
            transactionSignature?: string;
            gasCost?: GasCost;
        }>;
        totalGasCost: GasCost;
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/agents/batch-epochs',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * @deprecated
     * Generate proof of contribution
     * DEPRECATED. Generate a cryptographic MMR proof of contribution for a specific vector submitted by a legacy agent. Use /v1/agents/{passportId}/proof instead.
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidGenerateAgentProof(
        requestBody: AgentProofRequest,
    ): CancelablePromise<{
        success: boolean;
        agentId: string;
        vectorText: string;
        epochNumber: number;
        proof: Record<string, any>;
        verified: boolean;
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/agents/proof',
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
     * @deprecated
     * Get agent statistics
     * DEPRECATED. Retrieve statistics and current status for a legacy agent including epoch count, total vectors, and current MMR root. Use /v1/agents/{passportId}/receipts instead.
     *
     * @param agentId Legacy agent identifier
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetAgentStats(
        agentId: string,
    ): CancelablePromise<{
        success: boolean;
        stats: AgentStats;
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/agents/{agentId}/stats',
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
     * @deprecated
     * Get agent MMR root history
     * DEPRECATED. Retrieve a legacy agent's MMR root history across all epochs, ordered chronologically. Use /v1/agents/{passportId}/epoch instead.
     *
     * @param agentId Legacy agent identifier
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetAgentHistory(
        agentId: string,
    ): CancelablePromise<{
        success: boolean;
        agentId: string;
        history: Array<AgentHistoryEntry>;
        totalEpochs: number;
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/agents/{agentId}/history',
            path: {
                'agentId': agentId,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * @deprecated
     * Get current MMR root for agent
     * DEPRECATED. Retrieve the current MMR root hash for a legacy agent. Use /v1/agents/{passportId}/proof instead for the modern equivalent.
     *
     * @param agentId Legacy agent identifier
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetAgentRoot(
        agentId: string,
    ): CancelablePromise<{
        success: boolean;
        agentId: string;
        currentRoot: string;
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/agents/{agentId}/root',
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
     * @deprecated
     * Verify MMR integrity for agent
     * DEPRECATED. Verify the MMR integrity for a legacy agent by recomputing the tree and comparing roots. Use /v1/receipts/{receipt_id}/verify for receipt-level verification.
     *
     * @param agentId Legacy agent identifier
     * @returns any OK
     * @throws ApiError
     */
    public lucidVerifyAgentMmr(
        agentId: string,
    ): CancelablePromise<{
        success: boolean;
        agentId: string;
        verification: Record<string, any>;
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/agents/{agentId}/verify',
            path: {
                'agentId': agentId,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * @deprecated
     * List all registered agents
     * DEPRECATED. List all legacy registered agents with their statistics. Use GET /v1/agents (lucid_list_agent_passports) for the modern passport-based agent listing.
     *
     * @returns any OK
     * @throws ApiError
     */
    public lucidListAgents(): CancelablePromise<{
        success: boolean;
        totalAgents: number;
        agents: Array<AgentStats>;
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/agents',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * @deprecated
     * Plan a workflow from a goal
     * DEPRECATED. Plan a multi-step workflow from a natural language goal using the CrewAI planner. Returns a FlowSpec, reasoning explanation, and complexity estimate.
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidPlanAgentWorkflow(
        requestBody: AgentPlanRequest,
    ): CancelablePromise<{
        success: boolean;
        goal: string;
        flowspec: Record<string, any>;
        reasoning: string;
        complexity?: string;
        workflowId?: string;
        execution?: Record<string, any>;
        executionError?: string;
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/agents/plan',
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
     * @deprecated
     * Plan and execute a workflow in one call
     * DEPRECATED. Plan and execute a complete workflow in a single call via the Agent Orchestrator. Combines planning and execution with automatic executor selection.
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidAccomplishAgentGoal(
        requestBody: AgentAccomplishRequest,
    ): CancelablePromise<{
        success: boolean;
        goal: string;
        result?: Record<string, any>;
        execution?: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/agents/accomplish',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * @deprecated
     * Preview a workflow without executing
     * DEPRECATED. Generate a workflow preview (dry run) from a natural language goal without executing it. Returns the FlowSpec and reasoning for review before committing.
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidPreviewAgentWorkflow(
        requestBody: {
            goal: string;
            context?: Record<string, any>;
        },
    ): CancelablePromise<{
        success: boolean;
        preview: Record<string, any>;
        flowspec: Record<string, any>;
        reasoning?: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/agents/accomplish/preview',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * @deprecated
     * Get agent execution history for a tenant
     * DEPRECATED. Retrieve the execution history for a specific tenant, including workflow results, timing, and status. Supports an optional limit parameter.
     *
     * @param tenantId Tenant identifier for execution history lookup
     * @param limit Maximum number of history entries to return
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetAgentOrchestratorHistory(
        tenantId: string,
        limit?: number,
    ): CancelablePromise<{
        success: boolean;
        tenantId: string;
        history: Array<Record<string, any>>;
        stats?: Record<string, any>;
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/agents/history/{tenantId}',
            path: {
                'tenantId': tenantId,
            },
            query: {
                'limit': limit,
            },
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * @deprecated
     * Agent orchestrator health check
     * DEPRECATED. Check the health of all agent orchestrator sub-services (planner, executor router, n8n, LangGraph). Returns per-service status.
     *
     * @returns any OK
     * @throws ApiError
     */
    public lucidCheckAgentOrchestratorHealth(): CancelablePromise<{
        success: boolean;
        health: Record<string, any>;
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/agents/orchestrator/health',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * @deprecated
     * Execute a FlowSpec
     * DEPRECATED. Execute a FlowSpec workflow with automatic executor selection (n8n or LangGraph). Requires a tenant context with tenantId for execution tracking.
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidExecuteAgentFlowspec(
        requestBody: {
            flowspec: Record<string, any>;
            context: {
                tenantId: string;
                variables?: Record<string, any>;
            };
            executor?: 'n8n' | 'langgraph';
        },
    ): CancelablePromise<{
        success: boolean;
        result?: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/agents/execute',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * @deprecated
     * Validate a FlowSpec structure
     * DEPRECATED. Validate a FlowSpec structure for correctness without executing it. Returns validation results including any errors or warnings found in the spec.
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidValidateFlowspec(
        requestBody: Record<string, any>,
    ): CancelablePromise<{
        success: boolean;
        validation: Record<string, any>;
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/agents/validate',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * @deprecated
     * Get planner service info
     * DEPRECATED. Retrieve the agent planner service information including status, available planning backends, and configuration details.
     *
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetPlannerInfo(): CancelablePromise<{
        success: boolean;
        status: string;
        info?: Record<string, any>;
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/agents/planner/info',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * @deprecated
     * Check executor health
     * DEPRECATED. Check the health of all executor backends (n8n, LangGraph), returning a boolean status for each. Used for operational monitoring.
     *
     * @returns any OK
     * @throws ApiError
     */
    public lucidCheckExecutorHealth(): CancelablePromise<{
        success: boolean;
        executors: {
            n8n?: boolean;
            langgraph?: boolean;
        };
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/agents/executor/health',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * @deprecated
     * Get executor decision for a FlowSpec
     * DEPRECATED. Get the recommended executor for a FlowSpec without actually running it. Returns the executor choice (n8n or langgraph) and the reasoning behind the decision.
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetExecutorDecision(
        requestBody: {
            flowspec: Record<string, any>;
        },
    ): CancelablePromise<{
        success: boolean;
        decision: {
            executor?: string;
            reason?: string;
        };
        message?: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/agents/executor/decision',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
}
