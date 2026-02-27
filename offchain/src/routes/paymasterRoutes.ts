/**
 * Paymaster Routes
 *
 * REST API for ERC-4337 Paymaster ($LUCID as gas).
 */

import { Router } from 'express';
import { getPaymasterService } from '../services/identity/paymasterService';

export const paymasterRouter = Router();

/**
 * POST /v2/paymaster/sponsor
 * Sponsor a UserOp with $LUCID gas payment.
 */
paymasterRouter.post('/v2/paymaster/sponsor', async (req, res) => {
  try {
    const { chainId, userOp } = req.body;

    if (!chainId || !userOp) {
      res.status(400).json({
        success: false,
        error: 'chainId and userOp are required',
      });
      return;
    }

    const service = getPaymasterService();
    const result = await service.sponsorUserOp(chainId, userOp);

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sponsor UserOp',
    });
  }
});

/**
 * GET /v2/paymaster/rate/:chainId
 * Get current $LUCID/ETH exchange rate.
 */
paymasterRouter.get('/v2/paymaster/rate/:chainId', async (req, res) => {
  try {
    const { chainId } = req.params;

    const service = getPaymasterService();
    const rate = await service.getExchangeRate(chainId);

    res.json({ success: true, exchangeRate: rate, chainId });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get exchange rate',
    });
  }
});

/**
 * POST /v2/paymaster/estimate
 * Estimate gas cost in $LUCID for a UserOp.
 */
paymasterRouter.post('/v2/paymaster/estimate', async (req, res) => {
  try {
    const { chainId, userOp } = req.body;

    if (!chainId || !userOp) {
      res.status(400).json({
        success: false,
        error: 'chainId and userOp are required',
      });
      return;
    }

    const service = getPaymasterService();
    const estimate = await service.estimateGasInLucid(chainId, userOp);

    res.json({ success: true, estimate });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to estimate gas',
    });
  }
});
