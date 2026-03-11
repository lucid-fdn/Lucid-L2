/**
 * Escrow Routes
 *
 * REST API for LucidEscrow contract interactions.
 */

import { Router } from 'express';
import { getEscrowService } from '../../../../engine/src/finance/escrowService';

export const escrowRouter = Router();

/**
 * POST /v2/escrow/create
 * Create a new escrow for an agent-to-agent transaction.
 */
escrowRouter.post('/v2/escrow/create', async (req, res) => {
  try {
    const { chainId, beneficiary, token, amount, duration, expectedReceiptHash } = req.body;

    if (!chainId || !beneficiary || !token || !amount || !duration) {
      res.status(400).json({
        success: false,
        error: 'chainId, beneficiary, token, amount, and duration are required',
      });
      return;
    }

    const service = getEscrowService();
    const result = await service.createEscrow(chainId, {
      beneficiary,
      token,
      amount: String(amount),
      duration: Number(duration),
      expectedReceiptHash,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create escrow',
    });
  }
});

/**
 * POST /v2/escrow/release
 * Release an escrow with a verified receipt.
 */
escrowRouter.post('/v2/escrow/release', async (req, res) => {
  try {
    const { chainId, escrowId, receiptHash, signature, signerPubkey } = req.body;

    if (!chainId || !escrowId || !receiptHash || !signature || !signerPubkey) {
      res.status(400).json({
        success: false,
        error: 'chainId, escrowId, receiptHash, signature, and signerPubkey are required',
      });
      return;
    }

    const service = getEscrowService();
    const result = await service.releaseWithReceipt(
      chainId, escrowId, receiptHash, signature, signerPubkey,
    );

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to release escrow',
    });
  }
});

/**
 * POST /v2/escrow/dispute
 * Dispute an active escrow.
 */
escrowRouter.post('/v2/escrow/dispute', async (req, res) => {
  try {
    const { chainId, escrowId, reason } = req.body;

    if (!chainId || !escrowId || !reason) {
      res.status(400).json({
        success: false,
        error: 'chainId, escrowId, and reason are required',
      });
      return;
    }

    const service = getEscrowService();
    const result = await service.disputeEscrow(chainId, escrowId, reason);

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to dispute escrow',
    });
  }
});

/**
 * GET /v2/escrow/:chainId/:escrowId
 * Get escrow details.
 */
escrowRouter.get('/v2/escrow/:chainId/:escrowId', async (req, res) => {
  try {
    const { escrowId } = req.params;

    const service = getEscrowService();
    const info = await service.getEscrow(escrowId);

    if (!info) {
      res.status(404).json({ success: false, error: 'Escrow not found' });
      return;
    }

    res.json({ success: true, escrow: info });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get escrow',
    });
  }
});
