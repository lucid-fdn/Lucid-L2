/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type EpochStatsResponse = {
    success: boolean;
    stats: {
        total_epochs?: number;
        total_receipts?: number;
        by_status?: {
            open?: number;
            anchoring?: number;
            anchored?: number;
            failed?: number;
        };
        avg_receipts_per_epoch?: number;
        last_anchor_time?: number;
    };
};

