/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ComputeRuntime = {
    name: 'vllm' | 'tgi' | 'tensorrt' | 'hf-inference-api' | 'openai-compatible' | 'custom';
    version?: string;
    /**
     * Docker image reference
     */
    image?: string;
};

