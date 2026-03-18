/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ChatMessage } from './ChatMessage';
export type ChatCompletionResponse = {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index?: number;
        message?: ChatMessage;
        finish_reason?: string | null;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
};

