/**
 * Reputation Algorithm Registry
 *
 * Singleton registry for pluggable reputation scoring algorithms.
 * Follows the BlockchainAdapterFactory pattern.
 */

import type { IReputationAlgorithm, AlgorithmScore, ReputationContext } from './IReputationAlgorithm';
import { logger } from '../../../engine/src/shared/lib/logger';

export interface CompositeScore {
  overall: number;
  algorithmScores: Array<{
    algorithmId: string;
    weight: number;
    score: AlgorithmScore;
  }>;
  computedAt: number;
}

export class ReputationAlgorithmRegistry {
  private static instance: ReputationAlgorithmRegistry;
  private algorithms = new Map<string, IReputationAlgorithm>();

  private constructor() {}

  static getInstance(): ReputationAlgorithmRegistry {
    if (!ReputationAlgorithmRegistry.instance) {
      ReputationAlgorithmRegistry.instance = new ReputationAlgorithmRegistry();
    }
    return ReputationAlgorithmRegistry.instance;
  }

  /** Register a scoring algorithm */
  register(algo: IReputationAlgorithm): void {
    if (this.algorithms.has(algo.id)) {
      logger.warn(`Reputation algorithm '${algo.id}' already registered. Replacing.`);
    }
    this.algorithms.set(algo.id, algo);
    logger.info(`Registered reputation algorithm: ${algo.name} (${algo.id})`);
  }

  /** Get an algorithm by ID */
  get(id: string): IReputationAlgorithm | undefined {
    return this.algorithms.get(id);
  }

  /** List all registered algorithms */
  list(): Array<{ id: string; name: string; version: string; description: string }> {
    return Array.from(this.algorithms.values()).map(a => ({
      id: a.id,
      name: a.name,
      version: a.version,
      description: a.description,
    }));
  }

  /** Compute score with a specific algorithm */
  async computeScore(
    algorithmId: string,
    agentId: string,
    context?: ReputationContext,
  ): Promise<AlgorithmScore> {
    const algo = this.algorithms.get(algorithmId);
    if (!algo) {
      throw new Error(`Unknown reputation algorithm: ${algorithmId}`);
    }
    return algo.compute(agentId, context || {});
  }

  /**
   * Compute a weighted composite score from multiple algorithms.
   */
  async computeComposite(
    algorithmIds: string[],
    weights: number[],
    agentId: string,
    context?: ReputationContext,
  ): Promise<CompositeScore> {
    if (algorithmIds.length !== weights.length) {
      throw new Error('algorithmIds and weights must have the same length');
    }

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) {
      throw new Error('Total weight must be > 0');
    }

    const scores = await Promise.all(
      algorithmIds.map(id => this.computeScore(id, agentId, context)),
    );

    let weightedSum = 0;
    const algorithmScores = scores.map((score, i) => {
      const normalizedWeight = weights[i] / totalWeight;
      weightedSum += score.overall * normalizedWeight;
      return {
        algorithmId: algorithmIds[i],
        weight: normalizedWeight,
        score,
      };
    });

    return {
      overall: Math.round(weightedSum * 100) / 100,
      algorithmScores,
      computedAt: Math.floor(Date.now() / 1000),
    };
  }

  /** Count registered algorithms */
  count(): number {
    return this.algorithms.size;
  }

  /** Reset for testing */
  static reset(): void {
    ReputationAlgorithmRegistry.instance = new ReputationAlgorithmRegistry();
  }
}

export const reputationAlgorithmRegistry = ReputationAlgorithmRegistry.getInstance();
