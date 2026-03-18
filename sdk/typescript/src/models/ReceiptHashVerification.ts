/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ReceiptHashVerification = {
    success: boolean;
    verified: boolean;
    receipt_hash: string;
    run_id?: string;
    hash_valid?: boolean;
    signature_valid?: boolean;
    signer_pubkey?: string;
    signer_type?: string;
    execution_mode?: string;
    runtime_hash?: string;
    gpu_fingerprint?: string;
    inclusion_proof?: {
        leaf_index?: number;
        proof?: Array<string>;
        root?: string;
        directions?: Array<string>;
    } | null;
    inclusion_valid?: boolean;
    epoch?: {
        epoch_id?: string;
        mmr_root?: string;
        chain_tx?: string;
        finalized_at?: number;
    } | null;
    on_chain_verified?: boolean;
    tx_signature?: string | null;
};

