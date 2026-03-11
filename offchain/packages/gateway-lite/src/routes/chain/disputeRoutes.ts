/**
 * Dispute Routes
 *
 * REST API for LucidArbitration contract interactions.
 */

import { Router } from 'express';
import { getDisputeService } from '../../../../engine/src/finance/disputeService';

export const disputeRouter = Router();

/**
 * POST /v2/disputes/open
 * Open a dispute for an escrow.
 */
disputeRouter.post('/v2/disputes/open', async (req, res) => {
  try {
    const { chainId, escrowId, reason } = req.body;

    if (!chainId || !escrowId || !reason) {
      res.status(400).json({
        success: false,
        error: 'chainId, escrowId, and reason are required',
      });
      return;
    }

    const service = getDisputeService();
    const result = await service.openDispute(chainId, escrowId, reason);

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to open dispute',
    });
  }
});

/**
 * POST /v2/disputes/:disputeId/evidence
 * Submit evidence for a dispute.
 */
disputeRouter.post('/v2/disputes/:disputeId/evidence', async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { chainId, receiptHash, mmrRoot, mmrProof, description } = req.body;

    if (!chainId) {
      res.status(400).json({
        success: false,
        error: 'chainId is required',
      });
      return;
    }

    const service = getDisputeService();
    const result = await service.submitEvidence(chainId, disputeId, {
      receiptHash: receiptHash || '',
      mmrRoot: mmrRoot || '',
      mmrProof: mmrProof || '',
      description: description || '',
    });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit evidence',
    });
  }
});

/**
 * POST /v2/disputes/:disputeId/resolve
 * Trigger dispute resolution.
 */
disputeRouter.post('/v2/disputes/:disputeId/resolve', async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { chainId } = req.body;

    if (!chainId) {
      res.status(400).json({
        success: false,
        error: 'chainId is required',
      });
      return;
    }

    const service = getDisputeService();
    const result = await service.resolveDispute(chainId, disputeId);

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resolve dispute',
    });
  }
});

/**
 * POST /v2/disputes/:disputeId/appeal
 * Appeal a dispute decision.
 */
disputeRouter.post('/v2/disputes/:disputeId/appeal', async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { chainId } = req.body;

    if (!chainId) {
      res.status(400).json({
        success: false,
        error: 'chainId is required',
      });
      return;
    }

    const service = getDisputeService();
    const result = await service.appealDecision(chainId, disputeId);

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to appeal dispute',
    });
  }
});

/**
 * GET /v2/disputes/:chainId/:disputeId
 * Get dispute details.
 */
disputeRouter.get('/v2/disputes/:chainId/:disputeId', async (req, res) => {
  try {
    const { disputeId } = req.params;

    const service = getDisputeService();
    const info = service.getDispute(disputeId);

    if (!info) {
      res.status(404).json({ success: false, error: 'Dispute not found' });
      return;
    }

    res.json({ success: true, dispute: info });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get dispute',
    });
  }
});
