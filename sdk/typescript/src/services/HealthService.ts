/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { HealthCheckResult } from '../models/HealthCheckResult';
import type { SystemHealth } from '../models/SystemHealth';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class HealthService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Overall system health
     * Check overall system health including all dependencies (database, Redis, Solana, Nango). Returns healthy, degraded, or down status with a 200 when healthy or 503 when degraded/down. Use /health/detailed for resource metrics.
     *
     * @returns SystemHealth Healthy
     * @throws ApiError
     */
    public lucidCheckSystemHealth(): CancelablePromise<SystemHealth> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/health',
            errors: {
                503: `Degraded or down`,
            },
        });
    }
    /**
     * Liveness probe
     * Kubernetes-compatible liveness probe. Returns 200 if the application process is alive. Does not check dependencies. Use /health/ready for full readiness.
     *
     * @returns any Alive
     * @throws ApiError
     */
    public lucidCheckLiveness(): CancelablePromise<{
        status: string;
        timestamp: string;
        uptime: number;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/health/live',
        });
    }
    /**
     * Readiness probe
     * Kubernetes-compatible readiness probe. Checks all dependencies (database, Redis, etc.) and returns 200 only when the service is ready to accept traffic. Returns 503 with dependency status details when not ready.
     *
     * @returns any Ready
     * @throws ApiError
     */
    public lucidCheckReadiness(): CancelablePromise<{
        status: string;
        timestamp?: string;
        dependencies?: Record<string, HealthCheckResult>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/health/ready',
            errors: {
                503: `Not ready`,
            },
        });
    }
    /**
     * Database health check
     * Check database (PostgreSQL/Supabase) connectivity and query latency. Returns 503 when the database is unreachable.
     *
     * @returns HealthCheckResult Healthy
     * @throws ApiError
     */
    public lucidCheckDatabaseHealth(): CancelablePromise<HealthCheckResult> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/health/database',
            errors: {
                503: `Unhealthy`,
            },
        });
    }
    /**
     * Redis health check
     * Check Redis connectivity and latency. Redis is used for spent proof deduplication and caching. Returns 503 when Redis is unreachable.
     *
     * @returns HealthCheckResult Healthy
     * @throws ApiError
     */
    public lucidCheckRedisHealth(): CancelablePromise<HealthCheckResult> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/health/redis',
            errors: {
                503: `Unhealthy`,
            },
        });
    }
    /**
     * Nango service health check
     * Check Nango OAuth service connectivity. Nango manages third-party OAuth connections for agent integrations. Returns 503 when Nango is unreachable.
     *
     * @returns HealthCheckResult Healthy
     * @throws ApiError
     */
    public lucidCheckNangoHealth(): CancelablePromise<HealthCheckResult> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/health/nango',
            errors: {
                503: `Unhealthy`,
            },
        });
    }
    /**
     * Detailed health with statistics
     * Detailed health check including system resources (memory, CPU), per-dependency status, version info, environment, and aggregate statistics. Use this for operational dashboards and monitoring.
     *
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetDetailedHealth(): CancelablePromise<{
        status: 'healthy' | 'degraded' | 'down';
        timestamp: string;
        uptime: number;
        version: string;
        environment: string;
        dependencies: Record<string, HealthCheckResult>;
        statistics?: Record<string, any> | null;
        resources?: {
            memory?: Record<string, any>;
            cpu?: Record<string, any>;
        };
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/health/detailed',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
}
