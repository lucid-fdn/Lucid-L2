/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DeployAgentRequest } from '../models/DeployAgentRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class AgentDeployService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * One-click agent deployment
     * Admin-only. Creates a passport, generates code via runtime adapter,
     * builds a Docker image, and deploys to the preferred target.
     *
     * @param requestBody
     * @returns any Deployment created
     * @throws ApiError
     */
    public lucidDeployAgent(
        requestBody: DeployAgentRequest,
    ): CancelablePromise<{
        success: boolean;
        deployment: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/agents/deploy',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Generate agent code preview
     * Admin-only. Generates agent code without deploying (dry run).
     *
     * @param requestBody
     * @returns any Preview generated
     * @throws ApiError
     */
    public lucidPreviewAgent(
        requestBody: {
            name?: string;
            owner?: string;
            /**
             * Agent runtime descriptor
             */
            descriptor: Record<string, any>;
            preferred_adapter?: string;
        },
    ): CancelablePromise<{
        success: boolean;
        preview: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/agents/preview',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * List all agent deployments
     * Admin-only. Lists all agent deployments with optional filters.
     * @param tenantId Filter deployments by tenant identifier
     * @param status Filter by deployment status (e.g. running, stopped, failed)
     * @param target Filter by deploy target (docker, railway, akash, phala, ionet, nosana)
     * @returns any OK
     * @throws ApiError
     */
    public lucidListAgentDeployments(
        tenantId?: string,
        status?: string,
        target?: string,
    ): CancelablePromise<{
        success: boolean;
        deployments: Array<Record<string, any>>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/agents/deployments',
            query: {
                'tenant_id': tenantId,
                'status': status,
                'target': target,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * List available runtime adapters and deploy targets
     * List the available runtime adapters (node, python, langchain, crewai) and deployment targets (docker, railway, akash, phala, ionet, nosana) for agent deployment.
     *
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetAgentCapabilities(): CancelablePromise<{
        success: boolean;
        capabilities: {
            adapters?: Array<string>;
            deployers?: Array<string>;
        };
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/agents/capabilities',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get agent deployment status
     * Retrieve the current deployment status for an agent by passport ID, including target platform, URL, health state, and deployment timestamps.
     *
     * @param passportId Agent passport identifier
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetAgentDeployStatus(
        passportId: string,
    ): CancelablePromise<{
        success: boolean;
        status: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/agents/{passportId}/status',
            path: {
                'passportId': passportId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get agent deployment logs
     * Retrieve deployment logs for an agent. Supports a tail parameter to control the number of log lines returned (default 100).
     *
     * @param passportId Agent passport identifier
     * @param tail Number of log lines to return (default 100)
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetAgentDeployLogs(
        passportId: string,
        tail: number = 100,
    ): CancelablePromise<{
        success: boolean;
        logs: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/agents/{passportId}/logs',
            path: {
                'passportId': passportId,
            },
            query: {
                'tail': tail,
            },
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Terminate a deployed agent
     * Admin-only. Terminates an active agent deployment.
     * @param passportId Agent passport identifier to terminate
     * @returns any Agent terminated
     * @throws ApiError
     */
    public lucidTerminateAgent(
        passportId: string,
    ): CancelablePromise<{
        success: boolean;
        message: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/agents/{passportId}/terminate',
            path: {
                'passportId': passportId,
            },
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get deployment event history
     * Returns append-only audit log of deployment lifecycle events.
     * @param passportId Agent passport identifier
     * @param limit Maximum number of events to return
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetDeploymentEvents(
        passportId: string,
        limit: number = 50,
    ): CancelablePromise<{
        success?: boolean;
        data?: Array<{
            event_id?: string;
            deployment_id?: string;
            event_type?: string;
            actor?: string;
            previous_state?: string;
            new_state?: string;
            metadata?: Record<string, any>;
            created_at?: string;
        }>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/agents/{passportId}/events',
            path: {
                'passportId': passportId,
            },
            query: {
                'limit': limit,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
}
