/**
 * Bridge Routes
 *
 * REST API for $LUCID cross-chain bridging via LayerZero OFT.
 */

import { Router } from 'express';
import { getCrossChainBridgeService } from '../../../../engine/src/identity/crossChainBridgeService';

export const bridgeRouter = Router();

/**
 * POST /v2/bridge/send
 * Initiate a cross-chain $LUCID transfer.
 */
bridgeRouter.post('/v2/bridge/send', async (req, res) => {
  try {
    const { sourceChainId, destChainId, amount, recipientAddress } = req.body;

    if (!sourceChainId || !destChainId || !amount || !recipientAddress) {
      res.status(400).json({
        success: false,
        error: 'sourceChainId, destChainId, amount, and recipientAddress are required',
      });
      return;
    }

    const service = getCrossChainBridgeService();
    const receipt = await service.bridgeTokens({
      sourceChainId,
      destChainId,
      amount,
      recipientAddress,
    });

    res.json({ success: true, receipt });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Bridge transfer failed',
    });
  }
});

/**
 * GET /v2/bridge/status/:txHash
 * Get bridge transfer status.
 */
bridgeRouter.get('/v2/bridge/status/:txHash', async (req, res) => {
  try {
    const { txHash } = req.params;
    const sourceChainId = (req.query.sourceChainId as string) || 'base';

    const service = getCrossChainBridgeService();
    const status = await service.getBridgeStatus(txHash, sourceChainId);

    res.json({ success: true, status });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get bridge status',
    });
  }
});

/**
 * GET /v2/bridge/quote
 * Get a quote for bridging $LUCID.
 */
bridgeRouter.get('/v2/bridge/quote', async (req, res) => {
  try {
    const { sourceChainId, destChainId, amount } = req.query;

    if (!sourceChainId || !destChainId || !amount) {
      res.status(400).json({
        success: false,
        error: 'sourceChainId, destChainId, and amount query params required',
      });
      return;
    }

    const service = getCrossChainBridgeService();
    const quote = await service.getQuote(
      sourceChainId as string,
      destChainId as string,
      amount as string,
    );

    res.json({ success: true, quote });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get bridge quote',
    });
  }
});
