/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AirdropRequest } from '../models/AirdropRequest';
import type { AirdropResponse } from '../models/AirdropResponse';
import type { TokenInfo } from '../models/TokenInfo';
import type { TokenLaunchRequest } from '../models/TokenLaunchRequest';
import type { TokenLaunchResponse } from '../models/TokenLaunchResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class SharesService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Launch a share token for a passport
     * Create and launch an SPL Token-2022 share token for fractional ownership of an AI asset. Configurable name, symbol, initial supply, and decimals. Requires the passport to exist and not already have a share token.
     *
     * @param passportId Passport identifier to launch share token for
     * @param requestBody
     * @returns TokenLaunchResponse Token launched
     * @throws ApiError
     */
    public lucidLaunchShareToken(
        passportId: string,
        requestBody: TokenLaunchRequest,
    ): CancelablePromise<TokenLaunchResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/passports/{passport_id}/token/launch',
            path: {
                'passport_id': passportId,
            },
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
     * Get share token info for a passport
     * Retrieve share token information for a passport including the SPL mint address, total supply, decimals, and current holder count. Returns 404 if no share token has been launched.
     *
     * @param passportId Passport identifier to query share token info
     * @returns TokenInfo OK
     * @throws ApiError
     */
    public lucidGetShareToken(
        passportId: string,
    ): CancelablePromise<TokenInfo> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/passports/{passport_id}/token',
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
     * Trigger revenue airdrop for share token holders
     * Snapshot all current share token holders and distribute accumulated SOL revenue proportionally based on each holder's token balance. Requires the passport to have a launched share token with accumulated revenue.
     *
     * @param passportId Passport identifier for revenue airdrop
     * @param requestBody
     * @returns AirdropResponse Airdrop executed
     * @throws ApiError
     */
    public lucidTriggerRevenueAirdrop(
        passportId: string,
        requestBody: AirdropRequest,
    ): CancelablePromise<AirdropResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/passports/{passport_id}/token/airdrop',
            path: {
                'passport_id': passportId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
}
