/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PayoutConfig } from './PayoutConfig';
export type PayoutCalculateRequest = {
    run_id: string;
    total_amount_lamports: (string | number);
    compute_wallet: string;
    model_wallet?: string;
    orchestrator_wallet?: string;
    config?: PayoutConfig;
};

