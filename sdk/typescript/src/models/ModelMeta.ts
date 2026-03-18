/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ModelRequirements } from './ModelRequirements';
/**
 * Metadata for a model passport. Validated against schemas/ModelMeta.schema.json (additionalProperties: false).
 */
export type ModelMeta = {
    schema_version: '1.0';
    model_passport_id: string;
    format: 'safetensors' | 'gguf' | 'api';
    runtime_recommended: 'vllm' | 'tgi' | 'tensorrt' | 'trustgate' | 'openai';
    name?: string;
    description?: string;
    /**
     * Provider name (e.g. trustgate, openai)
     */
    provider?: string;
    base?: 'hf' | 'openai' | 'anthropic' | 'google' | 'cohere' | 'custom_endpoint';
    hf?: {
        repo_id?: string;
        revision?: string;
    };
    context_length?: number;
    quantizations?: Array<'fp16' | 'int8' | 'awq' | 'gptq' | 'gguf_q4'>;
    requirements?: ModelRequirements;
    endpoints?: {
        openai_compat_base_url?: string;
        auth_mode?: 'byok' | 'lucid_key' | 'none';
    };
    artifacts?: Array<string>;
    weights_uri?: string;
    weights_hash?: string;
};

