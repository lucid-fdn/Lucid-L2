/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ReceiptProof = {
    run_id: string;
    receipt_hash: string;
    /**
     * The leaf hash (receipt_hash) at leaf_index
     */
    leaf?: string;
    leaf_index: number;
    /**
     * Sibling hashes along the Merkle path
     */
    proof: Array<string>;
    root: string;
    /**
     * Direction of each sibling (L = sibling is on left, R = on right).
     */
    directions?: Array<'L' | 'R'>;
};

