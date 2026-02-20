/**
 * Receipt validation wrappers.
 */

import { LucidClient } from './client';
import type { ValidateRequest, ValidateResult, ProofResult } from './types';

export class ValidationClient {
  constructor(
    private client: LucidClient,
    private defaultChainId?: string,
  ) {}

  /**
   * Validate a receipt (hash + signature + inclusion + optional on-chain).
   */
  async validate(request: ValidateRequest): Promise<ValidateResult> {
    const body = {
      receipt_hash: request.receipt_hash,
      run_id: request.run_id,
      chainId: request.chainId || this.defaultChainId,
    };

    const response = await this.client.post<ValidateResult>('/v2/validate', body);
    return response.data;
  }

  /**
   * Get Merkle inclusion proof for a receipt.
   */
  async getProof(runId: string): Promise<ProofResult> {
    const response = await this.client.get<ProofResult>(`/v1/receipts/${runId}/proof`);
    return response.data;
  }

  /**
   * Verify a receipt by run_id (hash + signature + inclusion).
   */
  async verify(runId: string): Promise<ValidateResult> {
    const response = await this.client.get<ValidateResult>(`/v1/receipts/${runId}/verify`);
    return response.data;
  }

  /**
   * Verify a receipt by its hash.
   */
  async verifyByHash(receiptHash: string): Promise<ValidateResult> {
    const response = await this.client.get<ValidateResult>(`/v1/verify/${receiptHash}`);
    return response.data;
  }

  /**
   * Get the current Merkle root and leaf count.
   */
  async getMmrRoot(): Promise<{ root: string; leaf_count: number }> {
    const response = await this.client.get<any>('/v1/mmr/root');
    return response.data;
  }

  /**
   * Get the orchestrator's signer public key.
   */
  async getSignerPubkey(): Promise<string> {
    const response = await this.client.get<any>('/v1/signer/pubkey');
    return response.data?.pubkey || response.data?.public_key;
  }
}
