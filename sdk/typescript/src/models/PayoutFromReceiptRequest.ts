/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PayoutConfig } from './PayoutConfig';
export type PayoutFromReceiptRequest = {
    run_id: string;
    tokens_in: number;
    tokens_out: number;
    price_per_1k_tokens_lamports: (string | number);
    compute_wallet: string;
    model_wallet?: string;
    orchestrator_wallet?: string;
    config?: PayoutConfig;
};

