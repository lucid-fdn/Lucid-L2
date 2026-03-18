/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type X402PaymentRequired = {
    error: string;
    x402: {
        version: string;
        facilitator: string;
        description?: string;
        payment: {
            chain: string;
            token: string;
            tokenAddress: string;
            /**
             * Amount in micro-units (6 decimals)
             */
            amount: string;
            /**
             * Wallet or splitter contract address
             */
            recipient: string;
            facilitator: string;
            scheme: 'exact';
        };
        alternatives?: Array<Record<string, any>>;
        splits?: Array<Record<string, any>>;
        /**
         * Unix timestamp
         */
        expires: number;
    };
};

