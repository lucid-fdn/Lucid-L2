/**
 * Cross-Chain Reputation Aggregator
 *
 * Polls ERC-8004 Reputation Registry events across all configured chains
 * via viem getLogs, building a unified reputation score per agent.
 *
 * Phase 1 deliverable: fills Gap #2 from the EVM Multi-Chain Strategy.
 */

import { createPublicClient, http, parseAbiItem } from 'viem';
import { blockchainAdapterFactory } from '../../../engine/src/chain/blockchain/BlockchainAdapterFactory';
import { CHAIN_CONFIGS, getEVMChains } from '../../../engine/src/chain/blockchain/chains';
import type { ChainConfig } from '../../../engine/src/chain/blockchain/types';
import type { ReputationService } from './reputationService';

// =============================================================================
// Types
// =============================================================================

export interface ChainReputationData {
  chainId: string;
  agentTokenId: string;
  averageScore: number;
  feedbackCount: number;
  feedbacks: FeedbackRecord[];
  lastUpdated: number;
}

export interface FeedbackRecord {
  feedbackId: string;
  from: string;
  score: number;
  blockNumber: number;
  timestamp: number;
  chainId: string;
}

export interface UnifiedReputationScore {
  agentId: string;
  /** Weighted average score across chains (weight = feedbackCount) */
  unifiedScore: number;
  /** Total feedback count across all chains */
  totalFeedbackCount: number;
  /** Number of chains with data */
  chainCount: number;
  /** Per-chain breakdown */
  chains: ChainReputationData[];
  /** When this score was last computed */
  computedAt: number;
}

interface IndexerState {
  chainId: string;
  lastIndexedBlock: bigint;
  isRunning: boolean;
}

// FeedbackSubmitted event signature
const FEEDBACK_SUBMITTED_EVENT = parseAbiItem(
  'event FeedbackSubmitted(uint256 indexed feedbackId, uint256 indexed agentTokenId, address indexed from, uint8 score)'
);

// =============================================================================
// ReputationAggregator
// =============================================================================

export class ReputationAggregator {
  private static instance: ReputationAggregator | null = null;

  /** agentId -> chainId -> ChainReputationData */
  private reputationStore = new Map<string, Map<string, ChainReputationData>>();

  /** chainId -> IndexerState */
  private indexerStates = new Map<string, IndexerState>();

  /** Optional ReputationService for Lucid-native reputation data */
  private reputationService?: ReputationService;

  setReputationService(service: ReputationService): void {
    this.reputationService = service;
  }

  /** Polling interval handle */
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  private constructor() {}

  static getInstance(): ReputationAggregator {
    if (!ReputationAggregator.instance) {
      ReputationAggregator.instance = new ReputationAggregator();
    }
    return ReputationAggregator.instance;
  }

  /**
   * Start periodic indexing of all configured EVM chains.
   */
  startIndexing(intervalMs: number = 60_000): void {
    if (this.intervalHandle) {
      console.log('[ReputationAggregator] Already running');
      return;
    }

    console.log(`[ReputationAggregator] Starting indexing (interval: ${intervalMs}ms)`);

    // Initialize indexer states for chains with reputation registries
    for (const config of getEVMChains()) {
      if (config.erc8004?.reputationRegistry) {
        this.indexerStates.set(config.chainId, {
          chainId: config.chainId,
          lastIndexedBlock: 0n,
          isRunning: false,
        });
      }
    }

    // Run initial index
    this.indexAllChains().catch(err =>
      console.error('[ReputationAggregator] Initial index error:', err)
    );

    // Set up periodic polling
    this.intervalHandle = setInterval(() => {
      this.indexAllChains().catch(err =>
        console.error('[ReputationAggregator] Polling error:', err)
      );
    }, intervalMs);
  }

  /**
   * Stop the indexing loop.
   */
  stopIndexing(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      console.log('[ReputationAggregator] Stopped indexing');
    }
  }

  /**
   * Index all configured chains.
   */
  private async indexAllChains(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [chainId] of this.indexerStates) {
      promises.push(this.indexChain(chainId));
    }

    await Promise.allSettled(promises);
  }

  /**
   * Index a single chain for FeedbackSubmitted events.
   */
  async indexChain(chainId: string): Promise<void> {
    const state = this.indexerStates.get(chainId);
    if (!state) return;

    // Skip if already running
    if (state.isRunning) return;
    state.isRunning = true;

    try {
      const chainConfig = CHAIN_CONFIGS[chainId];
      if (!chainConfig?.erc8004?.reputationRegistry) return;

      const client = createPublicClient({
        transport: http(chainConfig.rpcUrl),
      });

      // Get current block
      const currentBlock = await client.getBlockNumber();

      // Calculate from block (start from last indexed + 1, or latest - 10000 for first run)
      const fromBlock = state.lastIndexedBlock > 0n
        ? state.lastIndexedBlock + 1n
        : currentBlock > 10000n ? currentBlock - 10000n : 0n;

      if (fromBlock > currentBlock) {
        return; // Nothing new to index
      }

      // Fetch FeedbackSubmitted events in chunks to avoid RPC limits
      const CHUNK_SIZE = 2000n;
      let chunkFrom = fromBlock;

      while (chunkFrom <= currentBlock) {
        const chunkTo = chunkFrom + CHUNK_SIZE > currentBlock
          ? currentBlock
          : chunkFrom + CHUNK_SIZE;

        const logs = await client.getLogs({
          address: chainConfig.erc8004.reputationRegistry as `0x${string}`,
          event: FEEDBACK_SUBMITTED_EVENT,
          fromBlock: chunkFrom,
          toBlock: chunkTo,
        });

        for (const log of logs) {
          const feedbackId = (log.args.feedbackId ?? 0n).toString();
          const agentTokenId = (log.args.agentTokenId ?? 0n).toString();
          const from = log.args.from ?? '0x0';
          const score = log.args.score ?? 0;
          const blockNumber = Number(log.blockNumber ?? 0n);

          const record: FeedbackRecord = {
            feedbackId,
            from,
            score,
            blockNumber,
            timestamp: Math.floor(Date.now() / 1000), // approximate; could fetch block timestamp
            chainId,
          };

          this.addFeedback(agentTokenId, chainId, record);
        }

        chunkFrom = chunkTo + 1n;
      }

      state.lastIndexedBlock = currentBlock;
    } catch (error) {
      console.error(`[ReputationAggregator] Error indexing ${chainId}:`, error);
    } finally {
      state.isRunning = false;
    }
  }

  /**
   * Add a feedback record to the store.
   */
  private addFeedback(agentId: string, chainId: string, record: FeedbackRecord): void {
    if (!this.reputationStore.has(agentId)) {
      this.reputationStore.set(agentId, new Map());
    }

    const agentData = this.reputationStore.get(agentId)!;

    if (!agentData.has(chainId)) {
      agentData.set(chainId, {
        chainId,
        agentTokenId: agentId,
        averageScore: 0,
        feedbackCount: 0,
        feedbacks: [],
        lastUpdated: 0,
      });
    }

    const chainData = agentData.get(chainId)!;

    // Deduplicate by feedbackId
    if (chainData.feedbacks.some(f => f.feedbackId === record.feedbackId)) {
      return;
    }

    chainData.feedbacks.push(record);
    chainData.feedbackCount = chainData.feedbacks.length;
    chainData.averageScore = chainData.feedbacks.reduce((sum, f) => sum + f.score, 0) / chainData.feedbackCount;
    chainData.lastUpdated = Math.floor(Date.now() / 1000);
  }

  /**
   * Get unified cross-chain reputation score for an agent.
   * Score is weighted average across chains (weight = feedbackCount per chain).
   */
  async getUnifiedScore(agentId: string): Promise<UnifiedReputationScore | null> {
    const agentData = this.reputationStore.get(agentId);
    if (!agentData || agentData.size === 0) {
      return null;
    }

    const chains = Array.from(agentData.values());
    const totalFeedback = chains.reduce((sum, c) => sum + c.feedbackCount, 0);

    if (totalFeedback === 0) {
      return {
        agentId,
        unifiedScore: 0,
        totalFeedbackCount: 0,
        chainCount: chains.length,
        chains,
        computedAt: Math.floor(Date.now() / 1000),
      };
    }

    // Merge Lucid-native reputation if available
    let extraScore = 0;
    let extraCount = 0;
    if (this.reputationService) {
      try {
        const lucidSummary = await this.reputationService.getSummary(agentId);
        if (lucidSummary.feedbackCount > 0) {
          extraScore = lucidSummary.avgScore * lucidSummary.feedbackCount;
          extraCount = lucidSummary.feedbackCount;
        }
      } catch {
        // ReputationService unavailable, continue with EVM data only
      }
    }

    // Weighted average: weight = feedbackCount per chain + Lucid native
    const weightedSum = chains.reduce(
      (sum, c) => sum + c.averageScore * c.feedbackCount,
      extraScore,
    );
    const combinedCount = totalFeedback + extraCount;
    const unifiedScore = combinedCount > 0 ? weightedSum / combinedCount : 0;

    return {
      agentId,
      unifiedScore: Math.round(unifiedScore * 100) / 100,
      totalFeedbackCount: combinedCount,
      chainCount: chains.length,
      chains,
      computedAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Get per-chain reputation breakdown.
   */
  getCrossChainReputation(agentId: string): ChainReputationData[] {
    const agentData = this.reputationStore.get(agentId);
    if (!agentData) return [];
    return Array.from(agentData.values());
  }

  /**
   * Manually add reputation data (e.g., from direct RPC queries when indexer hasn't caught up).
   */
  addExternalReputation(
    agentId: string,
    chainId: string,
    score: number,
    count: number,
  ): void {
    if (!this.reputationStore.has(agentId)) {
      this.reputationStore.set(agentId, new Map());
    }

    const agentData = this.reputationStore.get(agentId)!;
    agentData.set(chainId, {
      chainId,
      agentTokenId: agentId,
      averageScore: score,
      feedbackCount: count,
      feedbacks: [],
      lastUpdated: Math.floor(Date.now() / 1000),
    });
  }

  /**
   * Get indexer status for all chains.
   */
  getIndexerStatus(): Array<{ chainId: string; lastIndexedBlock: string; isRunning: boolean }> {
    return Array.from(this.indexerStates.values()).map(s => ({
      chainId: s.chainId,
      lastIndexedBlock: s.lastIndexedBlock.toString(),
      isRunning: s.isRunning,
    }));
  }

  /**
   * Reset all state (for testing).
   */
  reset(): void {
    this.stopIndexing();
    this.reputationStore.clear();
    this.indexerStates.clear();
  }
}

/** Singleton accessor */
export function getReputationAggregator(): ReputationAggregator {
  return ReputationAggregator.getInstance();
}
