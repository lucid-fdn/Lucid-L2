/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AgentWalletSendRequest = {
    /**
     * Recipient address
     */
    to: string;
    /**
     * Amount to send
     */
    amount: string;
    /**
     * Token mint address (optional, defaults to SOL)
     */
    token?: string;
};

