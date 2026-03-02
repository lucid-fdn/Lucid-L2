/**
 * ERC-8004 Reputation Registry Client
 *
 * Thin wrapper around viem calls to the Reputation Registry contract.
 */

import type { Hash } from 'viem';
import type { ReputationData } from '../../chains/types';
import type { ReputationSummary } from './types';
import ReputationRegistryABI from './abis/ReputationRegistry.json';

export class ReputationRegistryClient {
  constructor(
    private publicClient: any,
    private walletClient: any | null,
    private contractAddress: `0x${string}`,
  ) {}

  /**
   * Submit reputation feedback for an agent.
   */
  async submitFeedback(
    agentTokenId: string,
    score: number,
    category: string,
  ): Promise<Hash> {
    if (!this.walletClient) throw new Error('Wallet client required');

    const { request } = await this.publicClient.simulateContract({
      address: this.contractAddress,
      abi: ReputationRegistryABI,
      functionName: 'submitFeedback',
      args: [BigInt(agentTokenId), score, category],
      account: this.walletClient.account,
    });

    return this.walletClient.writeContract(request);
  }

  /**
   * Get reputation feedback for an agent.
   */
  async getFeedback(agentTokenId: string): Promise<ReputationData[]> {
    try {
      const count = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: ReputationRegistryABI,
        functionName: 'getFeedbackCount',
        args: [BigInt(agentTokenId)],
      }) as bigint;

      if (count === 0n) return [];

      const [average] = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: ReputationRegistryABI,
        functionName: 'getAverageScore',
        args: [BigInt(agentTokenId)],
      }) as [bigint, bigint];

      return [{
        from: 'aggregate',
        agentTokenId,
        score: Number(average),
        category: 'overall',
        timestamp: Math.floor(Date.now() / 1000),
      }];
    } catch {
      return [];
    }
  }

  /**
   * Get average reputation score for an agent.
   */
  async getAverageScore(agentTokenId: string): Promise<ReputationSummary> {
    try {
      const [average, count] = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: ReputationRegistryABI,
        functionName: 'getAverageScore',
        args: [BigInt(agentTokenId)],
      }) as [bigint, bigint];

      return {
        agentTokenId,
        averageScore: Number(average),
        totalFeedback: Number(count),
        chainId: '',
      };
    } catch {
      return {
        agentTokenId,
        averageScore: 0,
        totalFeedback: 0,
        chainId: '',
      };
    }
  }

  /**
   * Get total feedback count for an agent.
   */
  async getFeedbackCount(agentTokenId: string): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ReputationRegistryABI,
      functionName: 'getFeedbackCount',
      args: [BigInt(agentTokenId)],
    });
    return result as bigint;
  }
}
