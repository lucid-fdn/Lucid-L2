/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreatePassportRequest } from '../models/CreatePassportRequest';
import type { CreatePassportResponse } from '../models/CreatePassportResponse';
import type { GetPassportResponse } from '../models/GetPassportResponse';
import type { ListPassportsResponse } from '../models/ListPassportsResponse';
import type { Pagination } from '../models/Pagination';
import type { Passport } from '../models/Passport';
import type { PassportStatsResponse } from '../models/PassportStatsResponse';
import type { PassportStatus } from '../models/PassportStatus';
import type { PassportType } from '../models/PassportType';
import type { UpdatePassportEndpointsRequest } from '../models/UpdatePassportEndpointsRequest';
import type { UpdatePassportPricingRequest } from '../models/UpdatePassportPricingRequest';
import type { UpdatePassportRequest } from '../models/UpdatePassportRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class PassportsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Create a passport
     * Register a new AI asset passport (model, compute, tool, dataset, or agent) with metadata validated against the appropriate JSON schema. Returns the created passport with its generated passport_id.
     *
     * @param requestBody
     * @returns CreatePassportResponse Created
     * @throws ApiError
     */
    public lucidCreatePassport(
        requestBody: CreatePassportRequest,
    ): CancelablePromise<CreatePassportResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/passports',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                422: `Unprocessable Entity`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * List passports
     * Retrieve a paginated list of passports with optional filtering by type, owner, status, and tags. Supports free-text search across name, description, and tags. Defaults to page 1, 20 results per page.
     *
     * @param type Filter by passport type (model, compute, tool, dataset, agent)
     * @param owner Filter by owner wallet address (Solana base58 or EVM 0x)
     * @param status Filter by passport status (active, deprecated, revoked)
     * @param tags Comma-separated
     * @param tagMatch Tag matching mode - all (every tag must match) or any (at least one)
     * @param search Free-text search across name, description, and tags
     * @param page Page number for pagination (starts at 1)
     * @param perPage Number of results per page (1-100)
     * @param sortBy Sort field (created_at, updated_at, or name)
     * @param sortOrder Sort direction (asc or desc)
     * @returns ListPassportsResponse OK
     * @throws ApiError
     */
    public lucidListPassports(
        type?: (PassportType | Array<PassportType>),
        owner?: string,
        status?: (PassportStatus | Array<PassportStatus>),
        tags?: string,
        tagMatch?: 'all' | 'any',
        search?: string,
        page?: number,
        perPage?: number,
        sortBy?: 'created_at' | 'updated_at' | 'name',
        sortOrder?: 'asc' | 'desc',
    ): CancelablePromise<ListPassportsResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/passports',
            query: {
                'type': type,
                'owner': owner,
                'status': status,
                'tags': tags,
                'tag_match': tagMatch,
                'search': search,
                'page': page,
                'per_page': perPage,
                'sort_by': sortBy,
                'sort_order': sortOrder,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get a passport
     * Retrieve a single passport by its passport_id, including all metadata, on-chain sync status, DePIN storage CIDs, and NFT mint addresses.
     *
     * @param passportId Unique passport identifier (e.g. ppt_model_7xK9mQ2v)
     * @returns GetPassportResponse OK
     * @throws ApiError
     */
    public lucidGetPassport(
        passportId: string,
    ): CancelablePromise<GetPassportResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/passports/{passport_id}',
            path: {
                'passport_id': passportId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Update a passport
     * Update mutable fields on an existing passport (metadata, name, description, version, tags, status). Requires the X-Owner-Address header for ownership verification if configured.
     *
     * @param passportId Unique passport identifier to update
     * @param requestBody
     * @param xOwnerAddress Owner wallet address for ownership verification
     * @returns GetPassportResponse OK
     * @throws ApiError
     */
    public lucidUpdatePassport(
        passportId: string,
        requestBody: UpdatePassportRequest,
        xOwnerAddress?: string,
    ): CancelablePromise<GetPassportResponse> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/v1/passports/{passport_id}',
            path: {
                'passport_id': passportId,
            },
            headers: {
                'X-Owner-Address': xOwnerAddress,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                403: `Forbidden`,
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Delete a passport (soft delete)
     * Soft-delete a passport by setting its status to revoked. The passport record is retained for audit purposes. Requires X-Owner-Address header for ownership verification.
     *
     * @param passportId Unique passport identifier to delete (soft delete)
     * @param xOwnerAddress Owner wallet address for ownership verification
     * @returns any OK
     * @throws ApiError
     */
    public lucidDeletePassport(
        passportId: string,
        xOwnerAddress?: string,
    ): CancelablePromise<{
        success: boolean;
        deleted: boolean;
    }> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/v1/passports/{passport_id}',
            path: {
                'passport_id': passportId,
            },
            headers: {
                'X-Owner-Address': xOwnerAddress,
            },
            errors: {
                403: `Forbidden`,
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Trigger on-chain sync for a passport
     * Initiate an on-chain sync for a passport, writing its metadata hash to the Solana lucid_passports program. Returns the PDA address and transaction signature on success.
     *
     * @param passportId Unique passport identifier to sync on-chain
     * @returns any OK
     * @throws ApiError
     */
    public lucidTriggerPassportSync(
        passportId: string,
    ): CancelablePromise<{
        success: boolean;
        on_chain_pda?: string | null;
        on_chain_tx?: string | null;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/passports/{passport_id}/sync',
            path: {
                'passport_id': passportId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get passports pending sync
     * List all passports that have been created or updated off-chain but not yet synced to on-chain state. Useful for monitoring the sync backlog.
     *
     * @returns any OK
     * @throws ApiError
     */
    public lucidListPassportsPendingSync(): CancelablePromise<{
        success: boolean;
        count: number;
        passports: Array<Passport>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/passports/pending-sync',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Passport statistics
     * Retrieve aggregate statistics about passports including counts by type, status breakdown, and sync status. No authentication required.
     *
     * @returns PassportStatsResponse OK
     * @throws ApiError
     */
    public lucidGetPassportStats(): CancelablePromise<PassportStatsResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/passports/stats',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Search model passports
     * Search model passports with ModelMeta-specific filters including runtime, format, max VRAM, and availability. The availability filter is tri-state: 'true' for models with healthy compute, 'false' for unavailable models, omit for all.
     *
     * @param runtime Filter by recommended runtime (vllm, tgi, tensorrt, trustgate, openai)
     * @param format Filter by model format (safetensors, gguf, or api)
     * @param maxVram Maximum VRAM requirement in GB
     * @param available Tri-state filter: 'true' returns only models that can serve inference (healthy compute or API-hosted), 'false' returns only unavailable models (missing compute), omit for all models
     * @param owner Filter by model owner wallet address
     * @param tags Comma-separated tag filter
     * @param search Free-text search across model name and description
     * @param page Page number for pagination (starts at 1)
     * @param perPage Number of results per page (1-100)
     * @returns any OK
     * @throws ApiError
     */
    public lucidSearchModels(
        runtime?: string,
        format?: string,
        maxVram?: number,
        available?: 'true' | 'false',
        owner?: string,
        tags?: string,
        search?: string,
        page?: number,
        perPage?: number,
    ): CancelablePromise<{
        success: boolean;
        models: Array<Passport>;
        pagination: Pagination;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/models',
            query: {
                'runtime': runtime,
                'format': format,
                'max_vram': maxVram,
                'available': available,
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
     * List tool passports
     * List active tool passports with optional filtering by owner, tags, and free-text search. Returns paginated results sorted by creation date.
     *
     * @param owner Filter by tool owner wallet address
     * @param tags Comma-separated
     * @param search Free-text search across tool name and description
     * @param page Page number for pagination (starts at 1)
     * @param perPage Number of results per page (1-100)
     * @returns any OK
     * @throws ApiError
     */
    public lucidListTools(
        owner?: string,
        tags?: string,
        search?: string,
        page?: number,
        perPage?: number,
    ): CancelablePromise<{
        success: boolean;
        tools: Array<Passport>;
        pagination: Pagination;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/tools',
            query: {
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
     * List dataset passports
     * List active dataset passports with optional filtering by owner, tags, and free-text search. Returns paginated results sorted by creation date.
     *
     * @param owner Filter by dataset owner wallet address
     * @param tags Comma-separated
     * @param search Free-text search across dataset name and description
     * @param page Page number for pagination (starts at 1)
     * @param perPage Number of results per page (1-100)
     * @returns any OK
     * @throws ApiError
     */
    public lucidListDatasets(
        owner?: string,
        tags?: string,
        search?: string,
        page?: number,
        perPage?: number,
    ): CancelablePromise<{
        success: boolean;
        datasets: Array<Passport>;
        pagination: Pagination;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/datasets',
            query: {
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
     * List agent passports
     * List active agent passports with optional filtering by owner, tags, and free-text search. Returns paginated results sorted by creation date.
     *
     * @param owner Filter by agent owner wallet address
     * @param tags Comma-separated
     * @param search Free-text search across agent name and description
     * @param page Page number for pagination (starts at 1)
     * @param perPage Number of results per page (1-100)
     * @returns any OK
     * @throws ApiError
     */
    public lucidListAgentPassports(
        owner?: string,
        tags?: string,
        search?: string,
        page?: number,
        perPage?: number,
    ): CancelablePromise<{
        success: boolean;
        agents: Array<Passport>;
        pagination: Pagination;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/agents',
            query: {
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
     * Update passport pricing
     * Update pricing-related fields on a passport (e.g., price per token, pricing model). Requires X-Owner-Address header for ownership verification.
     *
     * @param passportId Passport identifier to update pricing for
     * @param requestBody
     * @param xOwnerAddress Owner wallet address for ownership verification
     * @returns GetPassportResponse Updated
     * @throws ApiError
     */
    public lucidUpdatePassportPricing(
        passportId: string,
        requestBody: UpdatePassportPricingRequest,
        xOwnerAddress?: string,
    ): CancelablePromise<GetPassportResponse> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/v1/passports/{passport_id}/pricing',
            path: {
                'passport_id': passportId,
            },
            headers: {
                'X-Owner-Address': xOwnerAddress,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                403: `Forbidden`,
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Update passport endpoint URLs
     * Update the endpoint URLs on a passport (inference URL, health URL, metrics URL). Requires X-Owner-Address header for ownership verification.
     *
     * @param passportId Passport identifier to update endpoints for
     * @param requestBody
     * @param xOwnerAddress Owner wallet address for ownership verification
     * @returns GetPassportResponse Updated
     * @throws ApiError
     */
    public lucidUpdatePassportEndpoints(
        passportId: string,
        requestBody: UpdatePassportEndpointsRequest,
        xOwnerAddress?: string,
    ): CancelablePromise<GetPassportResponse> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/v1/passports/{passport_id}/endpoints',
            path: {
                'passport_id': passportId,
            },
            headers: {
                'X-Owner-Address': xOwnerAddress,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                403: `Forbidden`,
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
}
