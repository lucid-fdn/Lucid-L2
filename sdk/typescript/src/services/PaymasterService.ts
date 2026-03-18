/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EstimateGasRequest } from '../models/EstimateGasRequest';
import type { PaymasterRateResponse } from '../models/PaymasterRateResponse';
import type { SponsorUserOpRequest } from '../models/SponsorUserOpRequest';
import type { SuccessResponse } from '../models/SuccessResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class PaymasterService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Sponsor a UserOp with $LUCID
     * Sponsor an ERC-4337 UserOperation by paying the gas cost in LUCID tokens. The paymaster signs the UserOp and deducts LUCID from the sender's balance at the current exchange rate.
     *
     * @param requestBody
     * @returns SuccessResponse UserOp sponsored
     * @throws ApiError
     */
    public lucidSponsorUserOp(
        requestBody: SponsorUserOpRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/paymaster/sponsor',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get LUCID/ETH exchange rate
     * Retrieve the current LUCID-per-ETH exchange rate used for gas sponsoring on a specific EVM chain. The rate determines how much LUCID is charged per gas unit.
     *
     * @param chainId EVM chain identifier for exchange rate lookup
     * @returns PaymasterRateResponse Exchange rate
     * @throws ApiError
     */
    public lucidGetPaymasterRate(
        chainId: string,
    ): CancelablePromise<PaymasterRateResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/paymaster/rate/{chainId}',
            path: {
                'chainId': chainId,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Estimate gas cost in $LUCID
     * Estimate the LUCID token cost for a UserOperation before submitting it. Returns the estimated gas in ETH and the equivalent LUCID amount at the current exchange rate.
     *
     * @param requestBody
     * @returns SuccessResponse Gas estimate
     * @throws ApiError
     */
    public lucidEstimateGasLucid(
        requestBody: EstimateGasRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/paymaster/estimate',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
}
