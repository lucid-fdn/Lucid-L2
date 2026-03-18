/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateTBARequest } from '../models/CreateTBARequest';
import type { GetTBAResponse } from '../models/GetTBAResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class TbaService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Create TBA for passport NFT
     * Create an ERC-6551 Token Bound Account for a passport NFT on a specific EVM chain. The TBA enables the AI asset to hold tokens and interact with smart contracts autonomously.
     *
     * @param requestBody
     * @returns GetTBAResponse TBA created
     * @throws ApiError
     */
    public lucidCreateTba(
        requestBody: CreateTBARequest,
    ): CancelablePromise<GetTBAResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/tba/create',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get TBA address
     * Retrieve the Token Bound Account address for an NFT by chain, token ID, and contract address. Returns the computed TBA address and deployment status.
     *
     * @param chainId EVM chain identifier
     * @param tokenId NFT token identifier for TBA lookup
     * @param tokenContract NFT contract address (EVM 0x format)
     * @returns GetTBAResponse TBA info
     * @throws ApiError
     */
    public lucidGetTba(
        chainId: string,
        tokenId: string,
        tokenContract: string,
    ): CancelablePromise<GetTBAResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/tba/{chainId}/{tokenId}',
            path: {
                'chainId': chainId,
                'tokenId': tokenId,
            },
            query: {
                'tokenContract': tokenContract,
            },
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
}
