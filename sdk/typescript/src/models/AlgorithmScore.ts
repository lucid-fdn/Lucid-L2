/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AlgorithmScore = {
    /**
     * Overall score (0-100)
     */
    overall: number;
    /**
     * Component scores (algorithm-specific)
     */
    components: Record<string, number>;
    /**
     * Raw metadata from the computation
     */
    metadata?: Record<string, any>;
    /**
     * Unix timestamp
     */
    computedAt: number;
};

