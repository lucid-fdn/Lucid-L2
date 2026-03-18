/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { GenerateZkMLProofRequest } from '../models/GenerateZkMLProofRequest';
import type { ListZkMLModelsResponse } from '../models/ListZkMLModelsResponse';
import type { RegisterZkMLModelRequest } from '../models/RegisterZkMLModelRequest';
import type { SuccessResponse } from '../models/SuccessResponse';
import type { VerifyZkMLProofRequest } from '../models/VerifyZkMLProofRequest';
import type { ZkMLProof } from '../models/ZkMLProof';
import type { ZkMLVerifyResponse } from '../models/ZkMLVerifyResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ZkMlService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Generate zkML proof
     * Generate a zero-knowledge proof for a model inference run. The proof attests that a specific model produced a specific output without revealing the model weights or full input.
     *
     * @param requestBody
     * @returns any Proof generated
     * @throws ApiError
     */
    public lucidGenerateZkmlProof(
        requestBody: GenerateZkMLProofRequest,
    ): CancelablePromise<{
        success: boolean;
        proof?: ZkMLProof;
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/zkml/prove',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Verify zkML proof
     * Verify a zkML Groth16 proof. Performs off-chain verification first, then optionally submits for on-chain verification via the ecPairing precompile on EVM chains.
     *
     * @param requestBody
     * @returns ZkMLVerifyResponse Verification result
     * @throws ApiError
     */
    public lucidVerifyZkmlProof(
        requestBody: VerifyZkMLProofRequest,
    ): CancelablePromise<ZkMLVerifyResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/zkml/verify',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Register model circuit
     * Register a model's Groth16 verifying key on-chain, enabling future proofs for this model to be verified by the ZkMLVerifier smart contract.
     *
     * @param requestBody
     * @returns SuccessResponse Model registered
     * @throws ApiError
     */
    public lucidRegisterZkmlModel(
        requestBody: RegisterZkMLModelRequest,
    ): CancelablePromise<SuccessResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v2/zkml/register-model',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * List registered model circuits
     * List all registered zkML model circuits on a specific chain, including model IDs, verifying key hashes, and registration timestamps.
     *
     * @param chainId Chain identifier for registered model circuits
     * @returns ListZkMLModelsResponse Model circuits
     * @throws ApiError
     */
    public lucidListZkmlModels(
        chainId: string,
    ): CancelablePromise<ListZkMLModelsResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v2/zkml/models/{chainId}',
            path: {
                'chainId': chainId,
            },
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
}
