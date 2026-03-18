/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type UpdatePassportPricingRequest = {
    price_per_request?: number;
    billing_model?: string;
    revenue_split?: {
        compute_bps?: number;
        model_bps?: number;
        protocol_bps?: number;
    };
};

