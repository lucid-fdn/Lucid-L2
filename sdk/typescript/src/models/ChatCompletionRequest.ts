/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ChatMessage } from './ChatMessage';
import type { Policy } from './Policy';
export type ChatCompletionRequest = {
    model: string;
    messages: Array<ChatMessage>;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    stop?: (string | Array<string>);
    stream?: boolean;
    policy?: Policy;
    trace_id?: string;
};

