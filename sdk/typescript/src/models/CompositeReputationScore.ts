/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AlgorithmScore } from './AlgorithmScore';
export type CompositeReputationScore = {
    overall: number;
    algorithmScores: Array<{
        algorithmId: string;
        weight: number;
        score: AlgorithmScore;
    }>;
    /**
     * Unix timestamp
     */
    computedAt: number;
};

