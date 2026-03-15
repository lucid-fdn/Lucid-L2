/**
 * Escrow Routes
 *
 * REST API for LucidEscrow contract interactions.
 * Delegates to adapter.escrow() sub-interface for on-chain operations,
 * and EscrowService for DB-backed lookups.
 */

import { Router } from 'express';
import { blockchainAdapterFactory } from '../../../../engine/src/shared/chains/factory';
import { getEscrowService } from '../../../../engine/src/payment/escrow/escrowService';

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

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    const account = await adapter.getAccount();
    const result = await adapter.escrow().createEscrow({
      payer: account.address,
      payee: beneficiary,
      amount: String(amount),
      timeoutSeconds: Number(duration),
      receiptHash: expectedReceiptHash,
      metadata: token,
    });

    res.json({ success: true, escrowId: result.escrowId, txHash: result.tx.hash });
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
    const { chainId, escrowId, receiptHash, signature, signerPubkey: _signerPubkey } = req.body;

    if (!chainId || !escrowId || !receiptHash || !signature) {
      res.status(400).json({
        success: false,
        error: 'chainId, escrowId, receiptHash, and signature are required',
      });
      return;
    }

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    const tx = await adapter.escrow().releaseEscrow(escrowId, receiptHash, signature);

    res.json({ success: true, txHash: tx.hash });
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

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    const tx = await adapter.escrow().disputeEscrow(escrowId, reason);

    res.json({ success: true, txHash: tx.hash });
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
 * NOTE: Escrow lookup is a DB concern; uses EscrowService directly.
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
