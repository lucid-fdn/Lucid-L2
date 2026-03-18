/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type LaunchBaseRuntimeRequest = {
    /**
     * Launch mode — pre-built base runtime
     */
    mode: 'base-runtime';
    /**
     * Model identifier (e.g. gpt-4o, claude-3-opus)
     */
    model: string;
    /**
     * System prompt for the agent
     */
    prompt: string;
    /**
     * Deployment target provider
     */
    target: 'docker' | 'railway' | 'akash' | 'phala' | 'ionet' | 'nosana';
    /**
     * Owner wallet address (Solana base58 or EVM 0x)
     */
    owner: string;
    /**
     * Human-readable agent name
     */
    name: string;
    /**
     * Optional tool identifiers to enable
     */
    tools?: Array<string>;
};

