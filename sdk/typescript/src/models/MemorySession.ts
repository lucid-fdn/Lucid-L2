/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type MemorySession = {
    session_id?: string;
    agent_passport_id?: string;
    namespace?: string;
    status?: 'active' | 'closed' | 'archived';
    turn_count?: number;
    total_tokens?: number;
    summary?: string;
    created_at?: number;
    last_activity?: number;
};

