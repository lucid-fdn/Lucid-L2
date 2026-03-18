/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * A2A Agent Card for agent discovery (per A2A protocol spec).
 */
export type A2AAgentCard = {
    name?: string;
    description?: string;
    url?: string;
    provider?: {
        organization?: string;
        url?: string;
    };
    version?: string;
    capabilities?: Record<string, any>;
    skills?: Array<{
        id?: string;
        name?: string;
        description?: string;
    }>;
};

