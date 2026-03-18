/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PassportType } from './PassportType';
export type CreatePassportRequest = {
    type: PassportType;
    owner: string;
    metadata: Record<string, any>;
    name?: string;
    description?: string;
    version?: string;
    tags?: Array<string>;
};

