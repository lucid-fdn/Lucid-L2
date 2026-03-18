/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { A2AAgentCard } from '../models/A2AAgentCard';
import type { A2ASendTaskRequest } from '../models/A2ASendTaskRequest';
import type { A2ATask } from '../models/A2ATask';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class A2AService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Get A2A Agent Card
     * Standard A2A discovery endpoint. Returns the Agent Card for
     * the specified agent, conforming to the A2A protocol spec.
     *
     * @param passportId Agent passport identifier for A2A card discovery
     * @returns A2AAgentCard Agent Card
     * @throws ApiError
     */
    public lucidGetA2AAgentCard(
        passportId: string,
    ): CancelablePromise<A2AAgentCard> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/a2a/{passportId}/agent.json',
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
     * Send task to A2A agent
     * Admin-only. Sends a task to an A2A-compatible agent. If the agent
     * has a deployment URL, the request is forwarded via the A2A client.
     *
     * @param passportId Agent passport identifier to send task to
     * @param requestBody
     * @returns A2ATask Task created/forwarded
     * @throws ApiError
     */
    public lucidSendA2ATask(
        passportId: string,
        requestBody: A2ASendTaskRequest,
    ): CancelablePromise<A2ATask> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/a2a/{passportId}/tasks/send',
            path: {
                'passportId': passportId,
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
     * Discover an external A2A agent
     * Admin-only. Fetches the Agent Card from an external HTTPS URL.
     * Includes SSRF protection (blocks internal/private IPs).
     *
     * @param requestBody
     * @returns any Agent discovered
     * @throws ApiError
     */
    public lucidDiscoverA2AAgent(
        requestBody: {
            /**
             * HTTPS URL of the agent
             */
            agent_url: string;
            /**
             * Optional auth token for the remote agent
             */
            auth_token?: string;
        },
    ): CancelablePromise<{
        success: boolean;
        agent_card: A2AAgentCard;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/a2a/discover',
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
     * Get A2A task status
     * Admin-only. Retrieves the current state of a task.
     * @param passportId Agent passport identifier
     * @param taskId A2A task identifier (UUID)
     * @returns A2ATask Task details
     * @throws ApiError
     */
    public lucidGetA2ATask(
        passportId: string,
        taskId: string,
    ): CancelablePromise<A2ATask> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/a2a/{passportId}/tasks/{taskId}',
            path: {
                'passportId': passportId,
                'taskId': taskId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Delete an A2A task
     * Admin-only. Deletes a task record. If the task is still in progress it is
     * canceled first, then the record is removed. Returns 404 if the task does
     * not exist.
     *
     * @param passportId Agent passport identifier
     * @param taskId A2A task identifier to delete (UUID)
     * @returns any Task deleted
     * @throws ApiError
     */
    public lucidDeleteA2ATask(
        passportId: string,
        taskId: string,
    ): CancelablePromise<{
        success: boolean;
    }> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/v1/a2a/{passportId}/tasks/{taskId}',
            path: {
                'passportId': passportId,
                'taskId': taskId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * List A2A tasks for an agent
     * Admin-only. Lists tasks with optional state filter and pagination.
     * @param passportId Agent passport identifier to list tasks for
     * @param state Filter by task state
     * @param page Page number for pagination (starts at 1)
     * @param perPage Number of results per page (1-100)
     * @returns any OK
     * @throws ApiError
     */
    public lucidListA2ATasks(
        passportId: string,
        state?: 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled',
        page: number = 1,
        perPage: number = 20,
    ): CancelablePromise<{
        tasks: Array<A2ATask>;
        total: number;
        page: number;
        per_page: number;
        total_pages: number;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/a2a/{passportId}/tasks',
            path: {
                'passportId': passportId,
            },
            query: {
                'state': state,
                'page': page,
                'per_page': perPage,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
}
