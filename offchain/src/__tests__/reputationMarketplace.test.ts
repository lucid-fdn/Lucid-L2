/**
 * Tests for D4: Reputation Marketplace
 *
 * - Algorithm registry
 * - Built-in algorithms
 * - Backward compatibility: ReceiptVolumeAlgorithm must match computeReceiptReputation()
 * - Composite scoring
 */

import {
  ReputationAlgorithmRegistry,
  ReceiptVolumeAlgorithm,
  CrossChainWeightedAlgorithm,
  StakeWeightedAlgorithm,
} from '../services/reputation';
import type { IReputationAlgorithm, AlgorithmScore, ReputationContext } from '../services/reputation';
import { computeReceiptReputation } from '../services/receiptReputationService';

describe('ReputationAlgorithmRegistry', () => {
  let registry: ReputationAlgorithmRegistry;

  beforeEach(() => {
    ReputationAlgorithmRegistry.reset();
    registry = ReputationAlgorithmRegistry.getInstance();
  });

  it('starts empty', () => {
    expect(registry.count()).toBe(0);
    expect(registry.list()).toHaveLength(0);
  });

  it('registers and retrieves algorithms', () => {
    const algo = new ReceiptVolumeAlgorithm();
    registry.register(algo);

    expect(registry.count()).toBe(1);
    expect(registry.get('receipt-volume-v1')).toBe(algo);
    expect(registry.list()[0].id).toBe('receipt-volume-v1');
  });

  it('replaces duplicate registrations', () => {
    const algo1 = new ReceiptVolumeAlgorithm();
    const algo2 = new ReceiptVolumeAlgorithm();
    registry.register(algo1);
    registry.register(algo2);

    expect(registry.count()).toBe(1);
    expect(registry.get('receipt-volume-v1')).toBe(algo2);
  });

  it('throws for unknown algorithm', async () => {
    await expect(registry.computeScore('nonexistent', 'agent-1')).rejects.toThrow(
      'Unknown reputation algorithm',
    );
  });

  describe('computeComposite', () => {
    it('validates matching array lengths', async () => {
      await expect(
        registry.computeComposite(['a', 'b'], [1], 'agent-1'),
      ).rejects.toThrow('same length');
    });

    it('validates non-zero total weight', async () => {
      await expect(
        registry.computeComposite(['a'], [0], 'agent-1'),
      ).rejects.toThrow('Total weight must be > 0');
    });
  });
});

describe('ReceiptVolumeAlgorithm', () => {
  const algo = new ReceiptVolumeAlgorithm();

  it('has correct metadata', () => {
    expect(algo.id).toBe('receipt-volume-v1');
    expect(algo.name).toBe('Receipt Volume');
    expect(algo.version).toBe('1.0.0');
  });

  it('returns zero score for unknown agent', async () => {
    const score = await algo.compute('nonexistent-agent-xyz', {});
    expect(score.overall).toBe(0);
    expect(score.components.volume).toBe(0);
    expect(score.components.reliability).toBe(0);
  });

  it('backward compatibility: produces identical output to computeReceiptReputation', async () => {
    const agentId = 'test-backward-compat-agent';

    // Both should return identical results for the same agent
    const directScore = computeReceiptReputation(agentId);
    const algoScore = await algo.compute(agentId, {});

    expect(algoScore.overall).toBe(directScore.overall);
    expect(algoScore.components.volume).toBe(directScore.components.volume);
    expect(algoScore.components.reliability).toBe(directScore.components.reliability);
    expect(algoScore.components.performance).toBe(directScore.components.performance);
    expect(algoScore.components.consistency).toBe(directScore.components.consistency);
  });
});

describe('CrossChainWeightedAlgorithm', () => {
  const algo = new CrossChainWeightedAlgorithm();

  it('has correct metadata', () => {
    expect(algo.id).toBe('cross-chain-weighted-v1');
    expect(algo.name).toBe('Cross-Chain Weighted');
  });

  it('returns zero score for agent without cross-chain data', async () => {
    const score = await algo.compute('no-cross-chain-agent', {});
    expect(score.overall).toBe(0);
    expect(score.metadata?.chainCount).toBe(0);
  });
});

describe('StakeWeightedAlgorithm', () => {
  const algo = new StakeWeightedAlgorithm();

  it('has correct metadata', () => {
    expect(algo.id).toBe('stake-weighted-v1');
    expect(algo.name).toBe('Stake Weighted');
  });

  it('applies 0.5x multiplier for no stake', async () => {
    const score = await algo.compute('no-stake-agent', { params: { stakedLucid: 0 } });
    expect(score.components.stakeMultiplier).toBe(0.5);
    expect(score.metadata?.stakeTier).toBe('none');
  });

  it('applies 1.0x multiplier for silver tier', async () => {
    const score = await algo.compute('silver-agent', { params: { stakedLucid: 5000 } });
    expect(score.components.stakeMultiplier).toBe(1.0);
    expect(score.metadata?.stakeTier).toBe('silver');
  });

  it('applies 1.25x multiplier for diamond tier', async () => {
    const score = await algo.compute('diamond-agent', { params: { stakedLucid: 200_000 } });
    expect(score.components.stakeMultiplier).toBe(1.25);
    expect(score.metadata?.stakeTier).toBe('diamond');
  });

  it('caps score at 100', async () => {
    // Even with 1.25x multiplier, score should not exceed 100
    const score = await algo.compute('any-agent', { params: { stakedLucid: 500_000 } });
    expect(score.overall).toBeLessThanOrEqual(100);
  });
});

describe('Composite scoring', () => {
  let registry: ReputationAlgorithmRegistry;

  beforeEach(() => {
    ReputationAlgorithmRegistry.reset();
    registry = ReputationAlgorithmRegistry.getInstance();
    registry.register(new ReceiptVolumeAlgorithm());
    registry.register(new CrossChainWeightedAlgorithm());
    registry.register(new StakeWeightedAlgorithm());
  });

  it('computes equal-weighted composite', async () => {
    const composite = await registry.computeComposite(
      ['receipt-volume-v1', 'cross-chain-weighted-v1'],
      [1, 1],
      'composite-test-agent',
    );

    expect(composite.overall).toBeGreaterThanOrEqual(0);
    expect(composite.overall).toBeLessThanOrEqual(100);
    expect(composite.algorithmScores).toHaveLength(2);
    expect(composite.algorithmScores[0].algorithmId).toBe('receipt-volume-v1');
    expect(composite.algorithmScores[1].algorithmId).toBe('cross-chain-weighted-v1');
  });

  it('respects custom weights', async () => {
    const composite = await registry.computeComposite(
      ['receipt-volume-v1', 'cross-chain-weighted-v1'],
      [3, 1], // 75% receipt, 25% cross-chain
      'weighted-test-agent',
    );

    expect(composite.algorithmScores[0].weight).toBeCloseTo(0.75);
    expect(composite.algorithmScores[1].weight).toBeCloseTo(0.25);
  });
});
