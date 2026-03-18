/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AgentRunProof = {
    passport_id: string;
    run_id: string;
    receipt_hash: string;
    epoch_id?: string;
    mmr_root?: string;
    chain_tx?: string | null;
    verified: boolean;
    epoch_status?: string;
    model_passport_id?: string;
    policy_hash?: string;
    tokens_in?: number;
    tokens_out?: number;
    status?: string;
    created_at?: string;
};

