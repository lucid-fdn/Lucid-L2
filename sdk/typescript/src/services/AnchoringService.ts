/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AnchorRecord } from '../models/AnchorRecord';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class AnchoringService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Query anchor records
     * List anchor records for a given agent passport. Optionally filter by artifact type and limit results.
     *
     * @param agentPassportId Agent passport ID to filter anchor records
     * @param artifactType Filter by artifact type
     * @param limit Maximum number of records to return
     * @returns any OK
     * @throws ApiError
     */
    public lucidListAnchors(
        agentPassportId: string,
        artifactType?: 'epoch_bundle' | 'epoch_proof' | 'memory_snapshot' | 'deploy_artifact' | 'passport_metadata' | 'nft_metadata' | 'mmr_checkpoint',
        limit: number = 50,
    ): CancelablePromise<{
        success?: boolean;
        data?: Array<AnchorRecord>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/anchors',
            query: {
                'agent_passport_id': agentPassportId,
                'artifact_type': artifactType,
                'limit': limit,
            },
            errors: {
                400: `Bad Request`,
                401: `Unauthorized — missing or invalid admin key`,
            },
        });
    }
    /**
     * Get a single anchor record
     * Retrieve a single anchor record by its unique ID.
     * @param anchorId
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetAnchor(
        anchorId: string,
    ): CancelablePromise<{
        success?: boolean;
        data?: AnchorRecord;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/anchors/{anchor_id}',
            path: {
                'anchor_id': anchorId,
            },
            errors: {
                404: `Not Found`,
            },
        });
    }
    /**
     * Get anchor parent chain
     * Walk the parent_anchor_id chain for a given anchor, returning the full lineage from the target record back to the root.
     *
     * @param anchorId
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetAnchorLineage(
        anchorId: string,
    ): CancelablePromise<{
        success?: boolean;
        data?: Array<AnchorRecord>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/anchors/{anchor_id}/lineage',
            path: {
                'anchor_id': anchorId,
            },
            errors: {
                404: `Not Found`,
            },
        });
    }
    /**
     * Verify anchor CID against DePIN provider
     * Trigger verification of the anchor's CID against its DePIN storage provider. Updates the anchor status to verified or unreachable.
     *
     * @param anchorId
     * @returns any OK
     * @throws ApiError
     */
    public lucidVerifyAnchor(
        anchorId: string,
    ): CancelablePromise<{
        success?: boolean;
        data?: {
            anchor_id?: string;
            status?: 'verified' | 'unreachable';
            /**
             * Unix timestamp in milliseconds
             */
            verified_at?: number | null;
        };
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/anchors/{anchor_id}/verify',
            path: {
                'anchor_id': anchorId,
            },
            errors: {
                404: `Not Found`,
            },
        });
    }
    /**
     * Reverse lookup anchor by CID
     * Find anchor records that match a given content identifier (CID).
     * @param cid
     * @returns any OK
     * @throws ApiError
     */
    public lucidLookupAnchorByCid(
        cid: string,
    ): CancelablePromise<{
        success?: boolean;
        data?: Array<AnchorRecord>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/anchors/cid/{cid}',
            path: {
                'cid': cid,
            },
            errors: {
                404: `Not Found`,
            },
        });
    }
}
