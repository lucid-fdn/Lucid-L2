/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ComputeWorker = {
    worker_id: string;
    status: 'online' | 'offline' | 'degraded' | 'draining';
    /**
     * Unix timestamp of last heartbeat
     */
    last_heartbeat?: number;
};

