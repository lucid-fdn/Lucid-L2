/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Payout split configuration (basis points, must sum to 10000)
 */
export type PayoutConfig = {
    /**
     * Basis points for compute provider (e.g., 7000 = 70%)
     */
    compute_bp?: number;
    /**
     * Basis points for model owner (e.g., 2000 = 20%)
     */
    model_bp?: number;
    /**
     * Basis points for orchestrator (e.g., 1000 = 10%)
     */
    orchestrator_bp?: number;
};

