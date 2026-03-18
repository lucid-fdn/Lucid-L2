/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type Receipt = {
    schema_version?: string;
    run_id: string;
    model_passport_id: string;
    compute_passport_id: string;
    policy_hash: string;
    runtime: string;
    timestamp: number;
    trace_id?: string;
    image_hash?: string;
    model_hash?: string;
    attestation?: Record<string, any>;
    execution_mode?: string;
    job_hash?: string;
    quote_hash?: string;
    node_id?: string;
    runtime_hash?: string | null;
    gpu_fingerprint?: string | null;
    outputs_hash?: string;
    output_ref?: string;
    start_ts?: number;
    end_ts?: number;
    input_ref?: string;
    error_code?: string;
    error_message?: string;
    metrics: {
        ttft_ms: number;
        tokens_in: number;
        tokens_out: number;
        p95_ms?: number;
        total_latency_ms?: number;
        queue_wait_ms?: number;
        queue_time_ms?: number;
        cold_start_ms?: number;
        model_load_ms?: number;
        cache_hit?: boolean;
    };
    receipt_hash: string;
    receipt_signature: string;
    signer_pubkey: string;
    signer_type: 'orchestrator' | 'compute' | 'worker';
    _mmr_leaf_index?: number;
    anchor?: {
        chain?: string;
        tx?: string;
        root?: string;
        epoch_id?: string;
    } | null;
};

