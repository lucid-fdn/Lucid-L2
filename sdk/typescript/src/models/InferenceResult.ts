/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type InferenceResult = {
    success: boolean;
    run_id: string;
    request_id?: string;
    trace_id?: string;
    text?: string;
    finish_reason?: string;
    tokens_in: number;
    tokens_out: number;
    ttft_ms: number;
    total_latency_ms: number;
    model_passport_id: string;
    compute_passport_id: string;
    runtime: string;
    policy_hash?: string;
    receipt_id?: string;
    used_fallback?: boolean;
    fallback_reason?: string;
    error?: string;
    error_code?: string;
};

