/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AssetPricing } from '../models/AssetPricing';
import type { CreatePaymentGrantRequest } from '../models/CreatePaymentGrantRequest';
import type { PaymentGrant } from '../models/PaymentGrant';
import type { RevenueInfo } from '../models/RevenueInfo';
import type { SetAssetPricingRequest } from '../models/SetAssetPricingRequest';
import type { SuccessResponse } from '../models/SuccessResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class PaymentsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Get asset pricing
     * Retrieve the x402 pricing configuration for an AI asset. Returns null if no pricing has been configured (asset is free access). No authentication required.
     *
     * @param passportId AI asset passport identifier
     * @returns any Pricing data (null if not configured)
     * @throws ApiError
     */
    public lucidGetAssetPricing(
        passportId: string,
    ): CancelablePromise<{
        success: boolean;
        pricing?: AssetPricing | null;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/assets/{passport_id}/pricing',
            path: {
                'passport_id': passportId,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Set asset pricing
     * Admin-only. Sets or updates the pricing configuration for an AI asset.
     * @param passportId AI asset passport identifier to set pricing for
     * @param requestBody
     * @returns SuccessResponse Pricing updated
     * @throws ApiError
     */
    public lucidSetAssetPricing(
        passportId: string,
        requestBody: SetAssetPricingRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'PUT',
            url: '/v1/assets/{passport_id}/pricing',
            path: {
                'passport_id': passportId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized (admin auth required)`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Remove asset pricing
     * Admin-only. Removes pricing (asset becomes free access).
     * @param passportId AI asset passport identifier to remove pricing from
     * @returns any Deleted
     * @throws ApiError
     */
    public lucidDeleteAssetPricing(
        passportId: string,
    ): CancelablePromise<{
        success: boolean;
        deleted: boolean;
    }> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/v1/assets/{passport_id}/pricing',
            path: {
                'passport_id': passportId,
            },
            errors: {
                401: `Unauthorized`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get asset revenue summary
     * Retrieve the revenue summary for an AI asset including total earned, pending settlement, and withdrawn amounts. Defaults to USDC token if not specified.
     *
     * @param passportId AI asset passport identifier for revenue query
     * @param token Payment token to query revenue for (default USDC)
     * @returns any Revenue summary
     * @throws ApiError
     */
    public lucidGetAssetRevenue(
        passportId: string,
        token: string = 'USDC',
    ): CancelablePromise<{
        success: boolean;
        revenue: RevenueInfo;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/assets/{passport_id}/revenue',
            path: {
                'passport_id': passportId,
            },
            query: {
                'token': token,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Withdraw asset revenue
     * Admin-only. Marks confirmed revenue as pending_payout. The actual
     * on-chain transfer happens via the batch payout epoch.
     *
     * @param passportId AI asset passport identifier to withdraw revenue from
     * @param requestBody
     * @returns any Withdrawal queued
     * @throws ApiError
     */
    public lucidWithdrawAssetRevenue(
        passportId: string,
        requestBody?: {
            token?: string;
        },
    ): CancelablePromise<{
        success: boolean;
        withdrawal: {
            /**
             * Amount in micro-units
             */
            amount: string;
            token: string;
            status: 'pending_payout' | 'no_funds';
        };
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/assets/{passport_id}/withdraw',
            path: {
                'passport_id': passportId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get x402 payment configuration
     * Retrieve the current x402 payment configuration including supported chains, default facilitator, enabled status, and facilitator-specific settings.
     *
     * @returns any Payment configuration
     * @throws ApiError
     */
    public lucidGetPaymentConfig(): CancelablePromise<{
        success: boolean;
        config: Record<string, any>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/config/payment',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Set default payment facilitator
     * Admin-only. Sets the default x402 facilitator (direct, coinbase, payai).
     * @param requestBody
     * @returns SuccessResponse Facilitator updated
     * @throws ApiError
     */
    public lucidSetDefaultFacilitator(
        requestBody: {
            facilitator: 'direct' | 'coinbase' | 'payai';
        },
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'PUT',
            url: '/v1/config/facilitator',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * List supported payment chains
     * List all blockchain chains supported for x402 payments, including the accepted payment tokens (e.g., USDC) on each chain.
     *
     * @returns any Supported chains
     * @throws ApiError
     */
    public lucidGetSupportedChains(): CancelablePromise<{
        success: boolean;
        chains: Array<{
            chain?: string;
            tokens?: Array<string>;
        }>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/config/chains',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Subscribe to asset access
     * x402-gated. Pay via USDC and receive a time-limited access subscription.
     * On success, creates an on-chain AccessReceipt.
     *
     * @param xPaymentProof Transaction hash proving USDC payment (x402 protocol)
     * @param requestBody
     * @returns any Subscription created
     * @throws ApiError
     */
    public lucidSubscribeAsset(
        xPaymentProof: string,
        requestBody: {
            passport_id: string;
            duration_hours?: number;
        },
    ): CancelablePromise<{
        subscribed: boolean;
        passport_id: string;
        /**
         * Unix timestamp
         */
        expires_at: number;
        duration_hours: number;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/access/subscribe',
            headers: {
                'X-Payment-Proof': xPaymentProof,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                402: `Payment Required (x402)`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Issue a signed payment grant
     * Admin-only. Issues a signed payment grant for an agent run.
     * The grant is Ed25519-signed by the orchestrator and scoped to specific models/tools.
     *
     * @param requestBody
     * @returns any Grant created
     * @throws ApiError
     */
    public lucidCreatePaymentGrant(
        requestBody: CreatePaymentGrantRequest,
    ): CancelablePromise<{
        success: boolean;
        grant: PaymentGrant;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/config/grants',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized (admin auth required)`,
                500: `Internal Server Error`,
            },
        });
    }
}
