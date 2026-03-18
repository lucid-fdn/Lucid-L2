/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Input fields for creating a receipt. The backend computes the hash, signature, and wraps metrics.
 */
export type CreateReceiptRequest = {
    model_passport_id: string;
    compute_passport_id: string;
    policy_hash: string;
    runtime: string;
    tokens_in: number;
    tokens_out: number;
    ttft_ms: number;
    total_latency_ms?: number;
    timestamp?: number;
    trace_id?: string;
    run_id?: string;
    image_hash?: string;
    model_hash?: string;
    attestation?: Record<string, any>;
    execution_mode?: string;
    node_id?: string;
    runtime_hash?: string;
    gpu_fingerprint?: string;
};

