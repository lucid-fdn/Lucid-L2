/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type MemoryRecallResponse = {
    success?: boolean;
    data?: {
        memories?: Array<{
            memory_id?: string;
            type?: string;
            content?: string;
            similarity?: number;
            score?: number;
            created_at?: number;
        }>;
        query_embedding_model?: string | null;
        total_candidates?: number;
    };
};

