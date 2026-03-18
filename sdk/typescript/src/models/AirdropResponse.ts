/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AirdropResponse = {
    success: boolean;
    passportId: string;
    tokenMint: string;
    /**
     * Total lamports distributed
     */
    totalDistributed: number;
    /**
     * Number of holders who received airdrop
     */
    holders: number;
    distributions: Array<{
        holder?: string;
        balance?: number;
        share?: number;
        amountLamports?: number;
    }>;
    txSignatures: Array<string>;
};

