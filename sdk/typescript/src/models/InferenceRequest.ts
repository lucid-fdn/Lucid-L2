/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ChatMessage } from './ChatMessage';
import type { Policy } from './Policy';
export type InferenceRequest = {
    model_passport_id?: string;
    model?: string;
    prompt?: string;
    messages?: Array<ChatMessage>;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    stop?: Array<string>;
    stream?: boolean;
    policy?: Policy;
    compute_passport_id?: string;
    trace_id?: string;
    request_id?: string;
};

