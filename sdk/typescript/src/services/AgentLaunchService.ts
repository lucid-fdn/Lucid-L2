/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { LaunchBaseRuntimeRequest } from '../models/LaunchBaseRuntimeRequest';
import type { LaunchImageRequest } from '../models/LaunchImageRequest';
import type { LaunchResponse } from '../models/LaunchResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class AgentLaunchService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Launch an agent in the Lucid verified network
     * Launch an agent via one of two modes:
     * - **image**: Deploy a pre-built Docker image (Path A — Bring Your Own Image).
     * - **base-runtime**: Deploy a pre-configured base runtime with model, prompt, and optional tools (Path B — No-Code).
     *
     * Both modes create a passport, deploy to the target provider, and inject Lucid env vars.
     * Returns the passport_id, deployment_id, and deployment URL.
     *
     * @param requestBody
     * @returns LaunchResponse Agent launched
     * @throws ApiError
     */
    public lucidLaunchAgent(
        requestBody: (LaunchImageRequest | LaunchBaseRuntimeRequest),
    ): CancelablePromise<LaunchResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/agents/launch',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Initiate blue-green deployment
     * Start a blue-green rollout for an agent. Deploys a new version into the
     * blue slot while the current primary continues serving traffic. Use promote
     * or rollback to finalize.
     *
     * @param passportId Agent passport identifier
     * @param requestBody
     * @returns any Blue deployment created
     * @throws ApiError
     */
    public lucidDeployBlueGreen(
        passportId: string,
        requestBody: {
            /**
             * Docker image reference for the blue deployment
             */
            image: string;
            /**
             * Deploy target override (docker
             */
            target?: string;
            /**
             * Environment variable overrides
             */
            env_vars?: Record<string, string>;
            /**
             * Health check wait time in milliseconds before promotion eligibility
             */
            health_gate_ms?: number;
        },
    ): CancelablePromise<{
        success: boolean;
        deployment_id: string;
        slot: 'blue';
        status?: string;
        url?: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/agents/{passportId}/deploy/blue-green',
            path: {
                'passportId': passportId,
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
     * Promote blue to primary
     * Promote the blue deployment to primary. The current primary is terminated
     * and the blue slot becomes the new primary. Fails if no healthy blue
     * deployment exists.
     *
     * @param passportId Agent passport identifier
     * @returns any Blue promoted to primary
     * @throws ApiError
     */
    public lucidPromoteBlue(
        passportId: string,
    ): CancelablePromise<{
        success: boolean;
        message: string;
        deployment_id?: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/agents/{passportId}/promote',
            path: {
                'passportId': passportId,
            },
            errors: {
                400: `Bad Request`,
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Rollback to previous deployment
     * Rollback to the previous primary deployment. Terminates the current
     * primary and restores the prior version. Fails if no rollback target exists.
     *
     * @param passportId Agent passport identifier
     * @returns any Rolled back
     * @throws ApiError
     */
    public lucidRollbackDeployment(
        passportId: string,
    ): CancelablePromise<{
        success: boolean;
        message: string;
        deployment_id?: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/agents/{passportId}/rollback',
            path: {
                'passportId': passportId,
            },
            errors: {
                400: `Bad Request`,
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get blue deployment status
     * Retrieve the current blue-slot deployment status for an agent, including
     * health state, URL, and promotion eligibility.
     *
     * @param passportId Agent passport identifier
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetBlueDeployment(
        passportId: string,
    ): CancelablePromise<{
        success?: boolean;
        deployment?: {
            deployment_id?: string;
            slot?: 'blue';
            status?: string;
            url?: string;
            healthy?: boolean;
            created_at?: string;
        };
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/agents/{passportId}/blue',
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
     * Cancel blue deployment
     * Cancel and terminate the blue-slot deployment without affecting the
     * current primary. Useful when the blue deployment fails health checks
     * or is no longer needed.
     *
     * @param passportId Agent passport identifier
     * @returns any Blue deployment canceled
     * @throws ApiError
     */
    public lucidCancelBlueDeployment(
        passportId: string,
    ): CancelablePromise<{
        success: boolean;
        message: string;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/agents/{passportId}/blue/cancel',
            path: {
                'passportId': passportId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
}
