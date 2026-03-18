/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type VerifyZkMLProofRequest = {
    chainId: string;
    /**
     * Groth16 proof (a, b, c points)
     */
    proof: Record<string, any>;
    receiptHash: string;
};

