/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ComputeHeartbeat = {
    compute_passport_id: string;
    status: 'healthy' | 'degraded' | 'down';
    queue_depth?: number;
    price_per_1k_tokens_estimate?: number;
    p95_ms_estimate?: number;
};

