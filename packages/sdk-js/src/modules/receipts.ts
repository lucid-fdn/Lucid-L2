// @lucidlayer/sdk - Receipts Module
// Receipt management and verification operations

import type { LucidClient } from '../client';
import type {
  Receipt,
  ReceiptProof,
  ReceiptVerification,
  Epoch,
  EpochFilters,
  PaginatedResponse,
} from '../types';

/**
 * ReceiptModule - Manage receipts and verify proofs
 * 
 * @example
 * ```typescript
 * // Get a receipt
 * const receipt = await client.receipts.get('run-id');
 * 
 * // Verify a receipt
 * const verification = await client.receipts.verify('run-id');
 * 
 * // Get Merkle proof
 * const proof = await client.receipts.getProof('run-id');
 * 
 * // Wait for receipt to be anchored
 * const anchoredReceipt = await client.receipts.waitForAnchor('run-id', 60000);
 * ```
 */
export class ReceiptModule {
  constructor(private client: LucidClient) {}

  /**
   * Get a receipt by run ID
   * 
   * @param runId Run ID
   * @returns Receipt
   */
  async get(runId: string): Promise<Receipt> {
    const response = await this.client.request<{
      success: boolean;
      receipt: Receipt;
    }>('GET', `/v1/receipts/${runId}`);

    return response.receipt;
  }

  /**
   * Verify a receipt's hash and signature
   * 
   * @param runId Run ID
   * @returns Verification result
   */
  async verify(runId: string): Promise<ReceiptVerification> {
    const response = await this.client.request<{
      success: boolean;
      valid: boolean;
      hash_valid: boolean;
      signature_valid: boolean;
      inclusion_valid: boolean;
      expected_hash?: string;
      computed_hash?: string;
      merkle_root?: string;
    }>('GET', `/v1/receipts/${runId}/verify`);

    return {
      valid: response.valid,
      hash_valid: response.hash_valid,
      signature_valid: response.signature_valid,
      inclusion_valid: response.inclusion_valid,
      expected_hash: response.expected_hash,
      computed_hash: response.computed_hash,
      merkle_root: response.merkle_root,
    };
  }

  /**
   * Get Merkle inclusion proof for a receipt
   * 
   * @param runId Run ID
   * @returns Merkle proof
   */
  async getProof(runId: string): Promise<ReceiptProof> {
    const response = await this.client.request<{
      success: boolean;
      proof: ReceiptProof;
    }>('GET', `/v1/receipts/${runId}/proof`);

    return response.proof;
  }

  /**
   * Wait for a receipt to be anchored on-chain
   * 
   * @param runId Run ID
   * @param timeoutMs Timeout in milliseconds (default: 300000 = 5 minutes)
   * @param pollIntervalMs Poll interval in milliseconds (default: 5000 = 5 seconds)
   * @returns Anchored receipt
   */
  async waitForAnchor(
    runId: string,
    timeoutMs: number = 300000,
    pollIntervalMs: number = 5000
  ): Promise<Receipt> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const receipt = await this.get(runId);

      if (receipt.anchor && receipt.anchor.tx) {
        return receipt;
      }

      await this.sleep(pollIntervalMs);
    }

    throw new Error(`Timeout waiting for receipt ${runId} to be anchored`);
  }

  /**
   * Get the current MMR root
   * 
   * @returns Current MMR root and leaf count
   */
  async getMmrRoot(): Promise<{ root: string; leaf_count: number }> {
    const response = await this.client.request<{
      success: boolean;
      root: string;
      leaf_count: number;
    }>('GET', '/v1/mmr/root');

    return {
      root: response.root,
      leaf_count: response.leaf_count,
    };
  }

  /**
   * Get the orchestrator's signing public key
   * 
   * @returns Signer public key
   */
  async getSignerPublicKey(): Promise<string> {
    const response = await this.client.request<{
      success: boolean;
      signer_type: string;
      pubkey: string;
    }>('GET', '/v1/signer/pubkey');

    return response.pubkey;
  }

  // ==========================================================================
  // EPOCH MANAGEMENT
  // ==========================================================================

  /**
   * Get the current active epoch
   * 
   * @param projectId Optional project ID
   * @returns Current epoch
   */
  async getCurrentEpoch(projectId?: string): Promise<Epoch> {
    const query: Record<string, any> = {};
    if (projectId) query.project_id = projectId;

    const response = await this.client.request<{
      success: boolean;
      epoch: Epoch;
    }>('GET', '/v1/epochs/current', { query });

    return response.epoch;
  }

  /**
   * Get an epoch by ID
   * 
   * @param epochId Epoch ID
   * @returns Epoch
   */
  async getEpoch(epochId: string): Promise<Epoch> {
    const response = await this.client.request<{
      success: boolean;
      epoch: Epoch;
    }>('GET', `/v1/epochs/${epochId}`);

    return response.epoch;
  }

  /**
   * List epochs with filtering
   * 
   * @param filters Filter options
   * @returns Paginated list of epochs
   */
  async listEpochs(filters?: EpochFilters): Promise<PaginatedResponse<Epoch>> {
    const query: Record<string, any> = {};

    if (filters) {
      if (filters.project_id) query.project_id = filters.project_id;
      if (filters.status) query.status = filters.status;
      if (filters.page) query.page = filters.page;
      if (filters.per_page) query.per_page = filters.per_page;
    }

    const response = await this.client.request<{
      success: boolean;
      epochs: Epoch[];
      pagination: PaginatedResponse<Epoch>['pagination'];
    }>('GET', '/v1/epochs', { query });

    return {
      items: response.epochs,
      pagination: response.pagination,
    };
  }

  /**
   * Get epochs ready for finalization
   * 
   * @returns List of epochs ready to be anchored
   */
  async getReadyEpochs(): Promise<Epoch[]> {
    const response = await this.client.request<{
      success: boolean;
      count: number;
      epochs: Epoch[];
    }>('GET', '/v1/epochs/ready');

    return response.epochs;
  }

  /**
   * Commit epoch root to blockchain
   * 
   * @param options Commit options
   * @returns Commit result
   */
  async commitEpochRoot(options?: {
    project_id?: string;
    epoch_id?: string;
    force?: boolean;
  }): Promise<{
    success: boolean;
    epoch_id: string;
    root: string;
    tx?: string;
    error?: string;
  }> {
    const response = await this.client.request<{
      success: boolean;
      epoch_id: string;
      root: string;
      tx?: string;
      error?: string;
    }>('POST', '/v1/receipts/commit-root', {
      body: options || {},
    });

    return response;
  }

  /**
   * Verify epoch anchor on-chain
   * 
   * @param epochId Epoch ID
   * @returns Verification result
   */
  async verifyEpochAnchor(epochId: string): Promise<{
    valid: boolean;
    on_chain_root?: string;
    expected_root?: string;
    tx_signature?: string;
    error?: string;
  }> {
    const response = await this.client.request<{
      success: boolean;
      valid: boolean;
      on_chain_root?: string;
      expected_root?: string;
      tx_signature?: string;
      error?: string;
    }>('GET', `/v1/epochs/${epochId}/verify`);

    return {
      valid: response.valid,
      on_chain_root: response.on_chain_root,
      expected_root: response.expected_root,
      tx_signature: response.tx_signature,
      error: response.error,
    };
  }

  /**
   * Get blockchain transaction for anchored epoch
   * 
   * @param epochId Epoch ID
   * @returns Transaction details
   */
  async getEpochTransaction(epochId: string): Promise<{
    tx_signature: string;
    slot?: number;
    block_time?: number;
  }> {
    const response = await this.client.request<{
      success: boolean;
      tx_signature: string;
      slot?: number;
      block_time?: number;
    }>('GET', `/v1/epochs/${epochId}/transaction`);

    return {
      tx_signature: response.tx_signature,
      slot: response.slot,
      block_time: response.block_time,
    };
  }

  /**
   * Check anchoring service health
   * 
   * @returns Health status
   */
  async checkAnchoringHealth(): Promise<{
    connected: boolean;
    network?: string;
    balance?: number;
    error?: string;
  }> {
    const response = await this.client.request<{
      success: boolean;
      connected: boolean;
      network?: string;
      balance?: number;
      error?: string;
    }>('GET', '/v1/anchoring/health');

    return {
      connected: response.connected,
      network: response.network,
      balance: response.balance,
      error: response.error,
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
