/**
 * Bridge Routes
 *
 * REST API for $LUCID cross-chain bridging via LayerZero OFT.
 * Delegates to adapter.bridge() sub-interface.
 */

import { Router } from 'express';
import { blockchainAdapterFactory } from '../../../../engine/src/chains/factory';

export const bridgeRouter = Router();

// LayerZero V2 Endpoint IDs for supported chains (needed to resolve destChainId)
const LZ_CHAIN_IDS: Record<string, number> = {
  'ethereum': 30101,
  'base': 30184,
  'arbitrum': 30110,
  'avalanche': 30106,
  'polygon': 30109,
  'base-sepolia': 40245,
  'ethereum-sepolia': 40161,
};

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

    const destLzId = LZ_CHAIN_IDS[destChainId];
    if (!destLzId) {
      res.status(400).json({
        success: false,
        error: `No LayerZero endpoint ID for chain: ${destChainId}`,
      });
      return;
    }

    const adapter = await blockchainAdapterFactory.getAdapter(sourceChainId);
    const minAmount = ((BigInt(amount) * 99n) / 100n).toString(); // 1% slippage
    const tx = await adapter.bridge().bridgeTokens({
      destChainId: destLzId,
      recipient: recipientAddress,
      amount,
      minAmount,
    });

    res.json({
      success: true,
      receipt: {
        txHash: tx.hash,
        sourceChainId,
        destChainId,
        amount,
        recipientAddress,
        createdAt: Math.floor(Date.now() / 1000),
      },
    });
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

    const adapter = await blockchainAdapterFactory.getAdapter(sourceChainId);
    const status = await adapter.bridge().getBridgeStatus(txHash, sourceChainId);

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

    const destLzId = LZ_CHAIN_IDS[destChainId as string];
    if (!destLzId) {
      res.status(400).json({
        success: false,
        error: `No LayerZero endpoint ID for chain: ${destChainId}`,
      });
      return;
    }

    const adapter = await blockchainAdapterFactory.getAdapter(sourceChainId as string);
    const quote = await adapter.bridge().getQuote(destLzId, amount as string);

    res.json({ success: true, quote });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get bridge quote',
    });
  }
});
