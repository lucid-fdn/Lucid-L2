/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type Epoch = {
    epoch_id: string;
    project_id?: string;
    mmr_root: string;
    leaf_count: number;
    created_at: number;
    finalized_at?: number;
    status: 'open' | 'anchoring' | 'anchored' | 'failed';
    chain_tx?: string;
    error?: string;
    start_leaf_index?: number;
    end_leaf_index?: number;
};

