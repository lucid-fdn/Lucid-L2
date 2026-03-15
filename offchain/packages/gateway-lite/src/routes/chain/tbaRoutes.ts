/**
 * TBA Routes
 *
 * REST API for ERC-6551 Token Bound Accounts.
 * Delegates to adapter.identity() sub-interface.
 */

import { Router } from 'express';
import { blockchainAdapterFactory } from '../../../../engine/src/shared/chains/factory';

export const tbaRouter = Router();

/**
 * POST /v2/tba/create
 * Create a Token Bound Account for a passport NFT.
 */
tbaRouter.post('/v2/tba/create', async (req, res) => {
  try {
    const { chainId, tokenContract, tokenId } = req.body;

    if (!chainId || !tokenContract || !tokenId) {
      res.status(400).json({
        success: false,
        error: 'chainId, tokenContract, and tokenId are required',
      });
      return;
    }

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    const result = await adapter.identity().createTBA(tokenContract, tokenId);

    res.json({ success: true, tba: result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create TBA',
    });
  }
});

/**
 * GET /v2/tba/:chainId/:tokenId
 * Get the TBA for a passport NFT.
 */
tbaRouter.get('/v2/tba/:chainId/:tokenId', async (req, res) => {
  try {
    const { chainId, tokenId } = req.params;
    const tokenContract = req.query.tokenContract as string;

    if (!tokenContract) {
      res.status(400).json({
        success: false,
        error: 'tokenContract query parameter required',
      });
      return;
    }

    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    const tbaAddress = await adapter.identity().getTBA(tokenContract, tokenId);

    res.json({ success: true, tba: { address: tbaAddress } });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get TBA',
    });
  }
});

/**
 * POST /v2/tba/execute
 * Execute a transaction from a TBA (owner only).
 */
tbaRouter.post('/v2/tba/execute', async (_req, res) => {
  // TBA execution requires the NFT owner's wallet to sign
  // For now, this is a placeholder — actual execution goes through
  // the TBA contract directly from the owner's wallet
  res.status(501).json({
    success: false,
    error: 'TBA execution must be performed directly from the NFT owner wallet via the TBA contract',
  });
});
