/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ReceiptVerification = {
    success?: boolean;
    valid?: boolean;
    hash_valid?: boolean;
    signature_valid?: boolean;
    inclusion_valid?: boolean;
    expected_hash?: string;
    computed_hash?: string;
    merkle_root?: string;
};

