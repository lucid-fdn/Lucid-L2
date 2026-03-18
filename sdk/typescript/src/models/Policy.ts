/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type Policy = {
    /**
     * Policy schema version, e.g. '1.0'
     */
    policy_version: string;
    allow_regions?: Array<string>;
    residency_required?: boolean;
    attestation?: {
        attestation_required?: boolean;
        require_cc_on?: boolean;
        fallback_allowed?: boolean;
    };
    latency?: {
        p95_ms_budget?: number;
        hard_timeout_ms?: number;
    };
    cost?: {
        max_price_per_1k_tokens_usd?: number;
        spot_only?: boolean;
    };
    privacy?: {
        store_inputs?: boolean;
        redact_pii?: boolean;
    };
};

