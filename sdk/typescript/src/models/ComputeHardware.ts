/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ComputeHardware = {
    /**
     * GPU model (e.g. 'NVIDIA-A100-40GB')
     */
    gpu: string;
    /**
     * GPU VRAM in gigabytes
     */
    vram_gb: number;
    /**
     * GPU architecture (e.g. 'ampere', 'hopper')
     */
    arch?: string;
    gpu_count?: number;
    cpu_cores?: number;
    /**
     * System RAM in gigabytes
     */
    memory_gb?: number;
};

