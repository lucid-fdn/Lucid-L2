/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AnchorRecord = {
    anchor_id?: string;
    artifact_type?: 'epoch_bundle' | 'epoch_proof' | 'memory_snapshot' | 'deploy_artifact' | 'passport_metadata' | 'nft_metadata' | 'mmr_checkpoint';
    artifact_id?: string;
    agent_passport_id?: string | null;
    producer?: string;
    provider?: string;
    storage_tier?: 'permanent' | 'evolving';
    cid?: string;
    content_hash?: string;
    url?: string;
    size_bytes?: number;
    status?: 'uploaded' | 'verified' | 'unreachable';
    parent_anchor_id?: string | null;
    chain_tx?: Record<string, any> | null;
    metadata?: Record<string, any>;
    /**
     * Unix timestamp in milliseconds
     */
    created_at?: number;
    /**
     * Unix timestamp in milliseconds
     */
    verified_at?: number | null;
};

