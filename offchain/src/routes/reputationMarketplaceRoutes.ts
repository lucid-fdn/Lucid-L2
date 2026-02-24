/**
 * Reputation Marketplace Routes
 *
 * REST API for pluggable reputation scoring.
 */

import { Router } from 'express';
import { reputationAlgorithmRegistry } from '../services/reputation';

export const reputationMarketplaceRouter = Router();

/**
 * GET /v2/reputation/algorithms
 * List all available scoring algorithms.
 */
reputationMarketplaceRouter.get('/v2/reputation/algorithms', (_req, res) => {
  const algorithms = reputationAlgorithmRegistry.list();
  res.json({ success: true, algorithms });
});

/**
 * POST /v2/reputation/:agentId/compute
 * Compute reputation score with a specific algorithm.
 */
reputationMarketplaceRouter.post('/v2/reputation/:agentId/compute', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { algorithmId, context } = req.body;

    const algoId = algorithmId || 'receipt-volume-v1';

    const score = await reputationAlgorithmRegistry.computeScore(algoId, agentId, context);

    res.json({ success: true, algorithmId: algoId, agentId, score });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to compute reputation',
    });
  }
});

/**
 * GET /v2/reputation/:agentId/composite
 * Compute default composite reputation score (all registered algorithms).
 */
reputationMarketplaceRouter.get('/v2/reputation/:agentId/composite', async (req, res) => {
  try {
    const { agentId } = req.params;

    const algorithms = reputationAlgorithmRegistry.list();
    if (algorithms.length === 0) {
      res.status(404).json({ success: false, error: 'No algorithms registered' });
      return;
    }

    // Equal weights for all algorithms
    const ids = algorithms.map(a => a.id);
    const weights = algorithms.map(() => 1);

    const composite = await reputationAlgorithmRegistry.computeComposite(
      ids,
      weights,
      agentId,
    );

    res.json({ success: true, agentId, composite });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to compute composite reputation',
    });
  }
});
