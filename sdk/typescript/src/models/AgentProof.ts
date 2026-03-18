/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AgentProof = {
    passport_id: string;
    epoch_id: string;
    epoch_index?: number;
    mmr_root: string;
    leaf_count?: number;
    chain_tx?: string | null;
    verified: boolean;
    finalized_at?: string;
    total_receipts?: number;
};

