/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ChainInfo = {
    chainId: string;
    name: string;
    type: 'evm' | 'solana';
    evmChainId?: number;
    testnet?: boolean;
    explorer?: string;
    connected: boolean;
    erc8004?: {
        identityRegistry?: string;
        validationRegistry?: string;
        reputationRegistry?: string;
    };
};

