/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ComputeHeartbeat } from '../models/ComputeHeartbeat';
import type { Pagination } from '../models/Pagination';
import type { Passport } from '../models/Passport';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ComputeService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Search compute passports
     * Search compute passports with ComputeMeta-specific filters including region, runtime, provider type, minimum VRAM, and GPU model. Returns paginated results with full passport details.
     *
     * @param regions Comma-separated region filter (e.g. us-east-1, eu-west-1)
     * @param runtimes Comma-separated runtime filter (e.g. vllm, tgi)
     * @param providerType Filter by provider type (depin, cloud, onprem, managed)
     * @param minVram Minimum VRAM requirement in GB
     * @param gpu Filter by GPU model (e.g. NVIDIA-A100-40GB)
     * @param owner Filter by compute provider owner wallet address
     * @param tags Comma-separated tag filter
     * @param search Free-text search across compute passport fields
     * @param page Page number for pagination (starts at 1)
     * @param perPage Number of results per page (1-100)
     * @returns any OK
     * @throws ApiError
     */
    public lucidSearchCompute(
        regions?: string,
        runtimes?: string,
        providerType?: string,
        minVram?: number,
        gpu?: string,
        owner?: string,
        tags?: string,
        search?: string,
        page?: number,
        perPage?: number,
    ): CancelablePromise<{
        success: boolean;
        compute: Array<Passport>;
        pagination: Pagination;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/compute',
            query: {
                'regions': regions,
                'runtimes': runtimes,
                'provider_type': providerType,
                'min_vram': minVram,
                'gpu': gpu,
                'owner': owner,
                'tags': tags,
                'search': search,
                'page': page,
                'per_page': perPage,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Submit compute node heartbeat
     * Submit a heartbeat from a compute node to register or update its live state. Compute nodes must send heartbeats within the 30-second TTL to remain eligible for matching. Includes queue depth and P95 latency estimates.
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidHeartbeat(
        requestBody: ComputeHeartbeat,
    ): CancelablePromise<{
        success?: boolean;
        state?: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/compute/nodes/heartbeat',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get compute node health
     * Get the current health state of a compute node. Returns 503 if the node's heartbeat has expired (>30s since last heartbeat).
     *
     * @param computePassportId Compute node passport identifier
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetHealth(
        computePassportId: string,
    ): CancelablePromise<{
        success?: boolean;
        state?: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/compute/nodes/{computePassportId}/health',
            path: {
                'computePassportId': computePassportId,
            },
            errors: {
                500: `Internal Server Error`,
                503: `Service Unavailable`,
            },
        });
    }
}
