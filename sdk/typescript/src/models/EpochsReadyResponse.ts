/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type EpochsReadyResponse = {
    success: boolean;
    count: number;
    epochs: Array<{
        epoch_id?: string;
        project_id?: string;
        leaf_count?: number;
        created_at?: number;
        mmr_root?: string;
    }>;
};

