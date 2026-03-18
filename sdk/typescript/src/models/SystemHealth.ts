/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { HealthCheckResult } from './HealthCheckResult';
export type SystemHealth = {
    status: 'healthy' | 'degraded' | 'down';
    timestamp: string;
    uptime: number;
    version: string;
    dependencies: Record<string, HealthCheckResult>;
};

