/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AssetPricing = {
    passport_id: string;
    /**
     * Micro-units (6 decimals)
     */
    price_per_call?: string | null;
    price_per_token?: string | null;
    price_subscription_hour?: string | null;
    accepted_tokens?: Array<string>;
    accepted_chains?: Array<string>;
    payout_address: string;
    custom_split_bps?: Record<string, number> | null;
    updated_at?: string;
};

