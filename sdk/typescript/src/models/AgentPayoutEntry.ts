/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AgentPayoutEntry = {
    run_id: string;
    total_amount_lamports: string;
    recipients: Array<{
        address?: string;
        role?: string;
        bps?: number;
        amount_lamports?: string;
    }>;
    created_at: number;
};

