/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SetAssetPricingRequest = {
    /**
     * Micro-units (e.g. "10000" = $0.01)
     */
    price_per_call?: string;
    price_per_token?: string;
    price_subscription_hour?: string;
    accepted_tokens?: Array<string>;
    accepted_chains?: Array<string>;
    payout_address: string;
    custom_split_bps?: Record<string, number>;
};

