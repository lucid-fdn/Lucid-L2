/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { GetDisputeResponse } from '../models/GetDisputeResponse';
import type { OpenDisputeRequest } from '../models/OpenDisputeRequest';
import type { SubmitEvidenceRequest } from '../models/SubmitEvidenceRequest';
import type { SuccessResponse } from '../models/SuccessResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class DisputesService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Open a dispute on an escrow
     * Open a formal dispute on an active escrow, transitioning it to the evidence submission phase. Both parties can then submit evidence before resolution.
     *
     * @param requestBody
     * @returns SuccessResponse Dispute opened
     * @throws ApiError
     */
    public lucidOpenDispute(
        requestBody: OpenDisputeRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/disputes/open',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Submit evidence for a dispute
     * Submit evidence (receipt hashes, MMR proofs, or other supporting data) for an open dispute. Evidence is recorded on-chain and used during automated resolution.
     *
     * @param disputeId Dispute identifier for evidence submission
     * @param requestBody
     * @returns SuccessResponse Evidence submitted
     * @throws ApiError
     */
    public lucidSubmitEvidence(
        disputeId: string,
        requestBody: SubmitEvidenceRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/disputes/{disputeId}/evidence',
            path: {
                'disputeId': disputeId,
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
     * Resolve a dispute
     * Trigger automated resolution of a dispute based on the submitted evidence. The resolution logic evaluates receipt validity and proof correctness to determine the outcome.
     *
     * @param disputeId Dispute identifier to resolve
     * @param requestBody
     * @returns SuccessResponse Dispute resolved
     * @throws ApiError
     */
    public lucidResolveDispute(
        disputeId: string,
        requestBody: {
            chainId: string;
        },
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/disputes/{disputeId}/resolve',
            path: {
                'disputeId': disputeId,
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
     * Appeal a dispute decision
     * Appeal a dispute resolution decision. Requires staking LUCID tokens as a bond. The appeal triggers a secondary review with stricter evidence requirements.
     *
     * @param disputeId Dispute identifier to appeal
     * @param requestBody
     * @returns SuccessResponse Appeal submitted
     * @throws ApiError
     */
    public lucidAppealDispute(
        disputeId: string,
        requestBody: {
            chainId: string;
        },
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/disputes/{disputeId}/appeal',
            path: {
                'disputeId': disputeId,
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
     * Get dispute details
     * Retrieve the full details of a specific dispute by chain and dispute ID, including status, evidence submissions, resolution outcome, and appeal status.
     *
     * @param chainId Blockchain chain identifier
     * @param disputeId Dispute identifier to query
     * @returns GetDisputeResponse Dispute details
     * @throws ApiError
     */
    public lucidGetDispute(
        chainId: string,
        disputeId: string,
    ): CancelablePromise<GetDisputeResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/disputes/{chainId}/{disputeId}',
            path: {
                'chainId': chainId,
                'disputeId': disputeId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
}
