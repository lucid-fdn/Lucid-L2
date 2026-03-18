/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ConfigurePayoutRequest = {
    chainId: string;
    account: string;
    recipients: Array<string>;
    /**
     * Must sum to 10000
     */
    basisPoints: Array<number>;
};

