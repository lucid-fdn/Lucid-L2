/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type LaunchResponse = {
    success: boolean;
    /**
     * Created passport identifier
     */
    passport_id?: string;
    /**
     * Deployment record identifier
     */
    deployment_id?: string;
    /**
     * Public URL of the deployed agent
     */
    deployment_url?: string;
    /**
     * Active verification mode
     */
    verification_mode?: 'full' | 'minimal';
    /**
     * Whether the agent is eligible for on-chain reputation scoring
     */
    reputation_eligible: boolean;
    /**
     * SHA-256 hash of the launch configuration (for audit)
     */
    config_hash?: string;
    /**
     * Error message (present only when success is false)
     */
    error?: string;
};

