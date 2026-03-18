/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateEscrowRequest } from '../models/CreateEscrowRequest';
import type { DisputeEscrowRequest } from '../models/DisputeEscrowRequest';
import type { GetEscrowResponse } from '../models/GetEscrowResponse';
import type { ReleaseEscrowRequest } from '../models/ReleaseEscrowRequest';
import type { SuccessResponse } from '../models/SuccessResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class EscrowService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Create a time-locked escrow
     * Create a new time-locked escrow for agent-to-agent transactions on a specific chain. Funds are held until released by receipt verification or timed out.
     *
     * @param requestBody
     * @returns SuccessResponse Escrow created
     * @throws ApiError
     */
    public lucidCreateEscrow(
        requestBody: CreateEscrowRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/escrow/create',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Release escrow with verified receipt
     * Release escrowed funds to the beneficiary after verifying the associated receipt. Requires a valid receipt hash proving service delivery.
     *
     * @param requestBody
     * @returns SuccessResponse Escrow released
     * @throws ApiError
     */
    public lucidReleaseEscrow(
        requestBody: ReleaseEscrowRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/escrow/release',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Dispute an escrow
     * Dispute an active escrow, freezing the funds and initiating the arbitration process. The escrow must be in 'active' status to be disputed.
     *
     * @param requestBody
     * @returns SuccessResponse Escrow disputed
     * @throws ApiError
     */
    public lucidDisputeEscrow(
        requestBody: DisputeEscrowRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/escrow/dispute',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get escrow details
     * Retrieve the full details of a specific escrow by chain and escrow ID, including status, parties, amounts, timeout, and associated receipt hashes.
     *
     * @param chainId Blockchain chain identifier (e.g. base, solana-devnet)
     * @param escrowId Escrow identifier on the specified chain
     * @returns GetEscrowResponse Escrow details
     * @throws ApiError
     */
    public lucidGetEscrow(
        chainId: string,
        escrowId: string,
    ): CancelablePromise<GetEscrowResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/escrow/{chainId}/{escrowId}',
            path: {
                'chainId': chainId,
                'escrowId': escrowId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
}
