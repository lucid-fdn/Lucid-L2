/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PassportStatsResponse = {
    success: boolean;
    stats: {
        total: number;
        by_type: {
            model?: number;
            compute?: number;
            tool?: number;
            dataset?: number;
            agent?: number;
        };
        by_status: {
            active?: number;
            deprecated?: number;
            revoked?: number;
        };
    };
};

