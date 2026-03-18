/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type DeployAgentRequest = {
    name: string;
    description?: string;
    owner: string;
    /**
     * Agent runtime descriptor
     */
    descriptor: Record<string, any>;
    /**
     * Runtime adapter (e.g. vercel-ai, openclaw, docker)
     */
    preferred_adapter?: string;
    tags?: Array<string>;
    list_on_marketplace?: boolean;
};

