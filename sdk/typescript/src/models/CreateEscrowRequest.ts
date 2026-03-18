/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateEscrowRequest = {
    /**
     * Chain identifier (e.g. 'base', 'ethereum-sepolia')
     */
    chainId: string;
    /**
     * Beneficiary address
     */
    beneficiary: string;
    /**
     * ERC-20 token address
     */
    token: string;
    /**
     * Amount in token base units
     */
    amount: string;
    /**
     * Escrow duration in seconds
     */
    duration: number;
    /**
     * Optional expected receipt hash for auto-release
     */
    expectedReceiptHash?: string;
};

