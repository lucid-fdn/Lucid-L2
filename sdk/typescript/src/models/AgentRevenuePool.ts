/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AgentRevenuePool = {
    agent_passport_id: string;
    /**
     * Lamports accumulated in pool
     */
    accumulated_lamports: string;
    /**
     * Total lamports distributed via airdrops
     */
    total_distributed_lamports: string;
    /**
     * Unix timestamp of last airdrop (0 if never)
     */
    last_airdrop_at: number;
};

