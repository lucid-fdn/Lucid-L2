/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PayoutRecipient } from './PayoutRecipient';
export type Payout = {
    run_id: string;
    /**
     * BigInt serialized as string
     */
    total_amount_lamports: string;
    recipients: Array<PayoutRecipient>;
    payout_hash: string;
    timestamp: number;
};

