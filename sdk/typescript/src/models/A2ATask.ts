/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type A2ATask = {
    id?: string;
    status?: {
        state?: 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';
        timestamp?: string;
        message?: string;
    };
    artifacts?: Array<{
        parts?: Array<{
            type?: string;
            text?: string;
        }>;
    }>;
    history?: Array<Record<string, any>>;
    metadata?: Record<string, any>;
};

