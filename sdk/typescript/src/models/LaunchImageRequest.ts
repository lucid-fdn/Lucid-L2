/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type LaunchImageRequest = {
    /**
     * Launch mode — bring your own Docker image
     */
    mode: 'image';
    /**
     * Docker image reference (e.g. ghcr.io/myorg/my-agent:latest)
     */
    image: string;
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
     * Container port to expose (default 8080)
     */
    port?: number;
    /**
     * Verification mode (full includes receipts + memory + payment hooks)
     */
    verification?: 'full' | 'minimal';
    /**
     * Additional environment variables injected into the container
     */
    env_vars?: Record<string, string>;
    /**
     * Private registry credentials (never stored, used at deploy time only)
     */
    registry_auth?: {
        username?: string;
        password?: string;
    };
};

