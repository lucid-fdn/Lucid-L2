/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type InstallModuleRequest = {
    chainId: string;
    /**
     * Smart account address
     */
    account: string;
    /**
     * Module type (validator, executor)
     */
    moduleType: string;
    /**
     * Module contract address
     */
    moduleAddress: string;
    /**
     * Optional init calldata (hex)
     */
    initData?: string;
};

