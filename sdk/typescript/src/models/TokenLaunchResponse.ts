/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type TokenLaunchResponse = {
    success: boolean;
    /**
     * SPL token mint address
     */
    mint: string;
    /**
     * Transaction signature
     */
    txSignature: string;
    totalSupply: number;
    /**
     * Token launcher provider used
     */
    provider: string;
};

