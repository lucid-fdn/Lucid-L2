/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ComputeCapabilities } from './ComputeCapabilities';
import type { ComputeEndpoints } from './ComputeEndpoints';
import type { ComputeHardware } from './ComputeHardware';
import type { ComputeRuntime } from './ComputeRuntime';
import type { ComputeWorker } from './ComputeWorker';
/**
 * Metadata for a compute provider passport. Validated against schemas/ComputeMeta.schema.json (additionalProperties: false).
 */
export type ComputeMeta = {
    schema_version: '1.0';
    compute_passport_id: string;
    provider_type: 'depin' | 'cloud' | 'onprem' | 'managed';
    execution_mode?: 'byo_runtime' | 'managed_endpoint';
    /**
     * ed25519 public key (hex) of the provider operator
     */
    operator_pubkey?: string;
    regions: Array<string>;
    residency_supported?: boolean;
    hardware: ComputeHardware;
    /**
     * GPU hardware fingerprint. Must be null for managed_endpoint mode.
     */
    gpu_fingerprint?: string | null;
    /**
     * Docker image digest. Must be null for managed_endpoint mode.
     */
    runtime_hash?: string | null;
    runtimes: Array<ComputeRuntime>;
    capabilities?: ComputeCapabilities;
    network?: {
        p95_ms_estimate?: number;
        bandwidth?: string;
    };
    limits?: {
        max_context?: number;
        max_batch?: number;
        max_input_tokens?: number;
        max_output_tokens?: number;
        requests_per_minute?: number;
    };
    pricing?: {
        price_per_1k_tokens_estimate?: number;
        price_per_minute_estimate?: number;
        per_input_token?: number;
        per_output_token?: number;
        currency?: 'lamports' | 'usd_cents' | 'credits';
    };
    endpoints: ComputeEndpoints;
    workers?: Array<ComputeWorker>;
    sla?: {
        tier?: 'best-effort' | 'standard' | 'premium' | 'enterprise';
        uptime_target?: number;
    };
    /**
     * Tags for matching (e.g. 'hipaa', 'gdpr', 'no-logging')
     */
    policy_tags?: Array<string>;
    metadata?: Record<string, any>;
};

