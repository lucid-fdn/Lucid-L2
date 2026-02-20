/**
 * Reputation query wrappers.
 */

import { LucidClient } from './client';
import type {
  UnifiedReputation,
  ChainReputation,
  ReceiptReputation,
} from './types';

export class ReputationClient {
  constructor(private client: LucidClient) {}

  /**
   * Get unified cross-chain reputation score.
   */
  async getUnified(agentId: string): Promise<UnifiedReputation> {
    const response = await this.client.get<UnifiedReputation>(
      `/v2/reputation/${agentId}`
    );
    return response.data;
  }

  /**
   * Get per-chain reputation breakdown.
   */
  async getBreakdown(agentId: string): Promise<{
    success: boolean;
    agentId: string;
    chainCount: number;
    chains: ChainReputation[];
  }> {
    const response = await this.client.get(
      `/v2/reputation/${agentId}/breakdown`
    );
    return response.data as any;
  }

  /**
   * Get receipt-based (Sybil-resistant) reputation score.
   */
  async getReceiptBased(agentId: string): Promise<ReceiptReputation> {
    const response = await this.client.get<ReceiptReputation>(
      `/v2/reputation/${agentId}/receipt-based`
    );
    return response.data;
  }

  /**
   * Submit receipt-based reputation to on-chain registry.
   */
  async submitToChain(
    agentId: string,
    chainId: string
  ): Promise<{
    success: boolean;
    txHash?: string;
    score?: ReceiptReputation;
    error?: string;
  }> {
    const response = await this.client.post(
      `/v2/reputation/${agentId}/submit`,
      { chainId }
    );
    return response.data as any;
  }

  /**
   * Get reputation from a specific chain via the v2 agents endpoint.
   */
  async getFromChain(
    agentId: string,
    chainId?: string
  ): Promise<{
    success: boolean;
    agent_id: string;
    chains_queried: number;
    results: Array<{ chain_id: string; reputation: unknown }>;
  }> {
    const query = chainId ? { chain_id: chainId } : undefined;
    const response = await this.client.get(
      `/v2/agents/${agentId}/reputation`,
      query
    );
    return response.data as any;
  }

  /**
   * Get indexer status for all chains.
   */
  async getIndexerStatus(): Promise<{
    success: boolean;
    chains: Array<{
      chainId: string;
      lastIndexedBlock: string;
      isRunning: boolean;
    }>;
  }> {
    const response = await this.client.get('/v2/reputation/indexer/status');
    return response.data as any;
  }
}
