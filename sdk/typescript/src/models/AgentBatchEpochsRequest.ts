/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AgentBatchEpochsRequest = {
    epochs: Array<{
        agentId: string;
        vectors: Array<string>;
        epochNumber?: number;
    }>;
};

