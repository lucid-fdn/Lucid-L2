/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateReceiptRequest } from '../models/CreateReceiptRequest';
import type { Receipt } from '../models/Receipt';
import type { ReceiptHashVerification } from '../models/ReceiptHashVerification';
import type { ReceiptProof } from '../models/ReceiptProof';
import type { ReceiptVerification } from '../models/ReceiptVerification';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ReceiptsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Create a receipt
     * Create a new cryptographic receipt for a completed inference run and append it to the Merkle Mountain Range. The receipt is Ed25519-signed by the orchestrator and includes timing metrics.
     *
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public lucidCreateReceipt(
        requestBody: CreateReceiptRequest,
    ): CancelablePromise<{
        success: boolean;
        receipt: Receipt;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/receipts',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get a receipt
     * Retrieve a single receipt by its UUID, including the receipt hash, Ed25519 signature, signer public key, and inference metrics (tokens, latency, TTFT).
     *
     * @param receiptId Unique receipt identifier (UUID)
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetReceipt(
        receiptId: string,
    ): CancelablePromise<{
        success: boolean;
        receipt: Receipt;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/receipts/{receipt_id}',
            path: {
                'receipt_id': receiptId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Verify a receipt (hash + signature + inclusion)
     * Verify a receipt's integrity by checking its SHA-256 hash against the canonical JSON content, validating the Ed25519 signature, and confirming MMR inclusion. Returns per-check pass/fail status.
     *
     * @param receiptId Receipt identifier to verify
     * @returns ReceiptVerification OK
     * @throws ApiError
     */
    public lucidVerifyReceipt(
        receiptId: string,
    ): CancelablePromise<ReceiptVerification> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/receipts/{receipt_id}/verify',
            path: {
                'receipt_id': receiptId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get inclusion proof for receipt
     * Retrieve the MMR inclusion proof for a receipt, containing the sibling hashes needed to verify the receipt's membership in the Merkle Mountain Range.
     *
     * @param receiptId Receipt identifier to get inclusion proof for
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetReceiptProof(
        receiptId: string,
    ): CancelablePromise<{
        success: boolean;
        proof: ReceiptProof;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/receipts/{receipt_id}/proof',
            path: {
                'receipt_id': receiptId,
            },
            errors: {
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Verify receipt by hash with inclusion proof and epoch info
     * Verify a receipt using its 64-character hex hash. Returns the inclusion proof, on-chain anchoring status, and epoch information. This is the primary verification endpoint for the Fluid Compute protocol.
     *
     * @param receiptHash 64 hex character receipt hash
     * @returns ReceiptHashVerification OK
     * @throws ApiError
     */
    public lucidVerifyReceiptByHash(
        receiptHash: string,
    ): CancelablePromise<ReceiptHashVerification> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/verify/{receipt_hash}',
            path: {
                'receipt_hash': receiptHash,
            },
            errors: {
                400: `Bad Request`,
                404: `Not Found`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get current MMR root
     * Retrieve the current global MMR root hash and total leaf count. The root is recomputed via right-to-left peak bagging after each receipt append.
     *
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetMmrRoot(): CancelablePromise<{
        success: boolean;
        root: string;
        leaf_count: number;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/mmr/root',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get orchestrator signing public key
     * Retrieve the Ed25519 public key used by the orchestrator to sign receipts. Clients use this key to independently verify receipt signatures offline.
     *
     * @returns any OK
     * @throws ApiError
     */
    public lucidGetSignerPubkey(): CancelablePromise<{
        success: boolean;
        signer_type?: string;
        pubkey: string;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/signer/pubkey',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
}
