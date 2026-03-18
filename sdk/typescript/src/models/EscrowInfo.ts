/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EscrowStatus } from './EscrowStatus';
export type EscrowInfo = {
    escrowId?: string;
    depositor?: string;
    beneficiary?: string;
    token?: string;
    amount?: string;
    createdAt?: string;
    expiresAt?: string;
    expectedReceiptHash?: string;
    status?: EscrowStatus;
};

