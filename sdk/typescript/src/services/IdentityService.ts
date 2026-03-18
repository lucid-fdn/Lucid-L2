/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { IdentityChainsResponse } from '../models/IdentityChainsResponse';
import type { IdentityLinkResponse } from '../models/IdentityLinkResponse';
import type { LinkIdentityRequest } from '../models/LinkIdentityRequest';
import type { ResolveIdentityRequest } from '../models/ResolveIdentityRequest';
import type { SuccessResponse } from '../models/SuccessResponse';
import type { UnlinkIdentityRequest } from '../models/UnlinkIdentityRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class IdentityService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Link addresses cross-chain
     * Link a new blockchain address to an existing cross-chain identity using CAIP-10 format. Creates the identity graph if it does not exist. Supports both Solana and EVM addresses.
     *
     * @param requestBody
     * @returns IdentityLinkResponse Identity linked
     * @throws ApiError
     */
    public lucidLinkIdentity(
        requestBody: LinkIdentityRequest,
    ): CancelablePromise<IdentityLinkResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/identity/link',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Resolve cross-chain identity
     * Resolve a CAIP-10 address to its full cross-chain identity graph via POST. Returns all linked addresses across chains and the identity's creation timestamp.
     *
     * @param requestBody
     * @returns SuccessResponse Identity resolved
     * @throws ApiError
     */
    public lucidResolveIdentity(
        requestBody: ResolveIdentityRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/identity/resolve',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Resolve identity (GET)
     * Resolve a CAIP-10 address to its cross-chain identity graph via GET query parameter. Functionally equivalent to the POST resolve endpoint but uses query string input.
     *
     * @param caip10 CAIP-10 address to resolve (e.g. eip155:8453:0x1234...)
     * @returns SuccessResponse Identity resolved
     * @throws ApiError
     */
    public lucidGetIdentity(
        caip10: string,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/identity/resolve',
            query: {
                'caip10': caip10,
            },
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get linked chains for identity
     * Retrieve all blockchain chains linked to a CAIP-10 address, returning chain identifiers and their associated addresses within the identity graph.
     *
     * @param caip10 CAIP-10 address to query chains for
     * @returns IdentityChainsResponse Linked chains
     * @throws ApiError
     */
    public lucidGetIdentityChains(
        caip10: string,
    ): CancelablePromise<IdentityChainsResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/identity/chains',
            query: {
                'caip10': caip10,
            },
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Unlink a cross-chain address
     * Remove a linked address from a cross-chain identity graph. Returns 404 if the address is not found in any identity graph.
     *
     * @param requestBody
     * @returns SuccessResponse Identity unlinked
     * @throws ApiError
     */
    public lucidUnlinkIdentity(
        requestBody: UnlinkIdentityRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/identity/unlink',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
}
