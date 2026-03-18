/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type HealthCheckResult = {
    status: 'healthy' | 'degraded' | 'down';
    latency?: number;
    error?: string;
    details?: Record<string, any>;
};

