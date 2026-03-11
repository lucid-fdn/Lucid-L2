// offchain/packages/gateway-lite/src/routes/agentWalletRoutes.ts
// REST API routes for agent wallet operations.

import express from 'express';
import { verifyAdminAuth } from '../../middleware/adminAuth';

function getWalletProvider() {
  const { getAgentWalletProvider } = require('../../../engine/src/agent/wallet');
  return getAgentWalletProvider();
}

export const agentWalletRouter = express.Router();

/**
 * GET /v1/agents/:id/wallet/balance
 * Get agent wallet balance
 */
agentWalletRouter.get('/v1/agents/:id/wallet/balance', async (req, res) => {
  try {
    const { id } = req.params;
    const provider = getWalletProvider();
    const wallet = await provider.getWallet(id);

    if (!wallet) {
      return res.status(404).json({ success: false, error: 'Agent wallet not found' });
    }

    const balance = await provider.getBalance(wallet.address);
    return res.json({ success: true, balance });
  } catch (error) {
    console.error('Error in GET /v1/agents/:id/wallet/balance:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /v1/agents/:id/wallet/send
 * Send from agent wallet (policy-gated)
 */
agentWalletRouter.post('/v1/agents/:id/wallet/send', verifyAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { to, amount, token } = req.body || {};

    if (!to || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields: to, amount' });
    }

    const provider = getWalletProvider();
    const wallet = await provider.getWallet(id);

    if (!wallet) {
      return res.status(404).json({ success: false, error: 'Agent wallet not found' });
    }

    const result = await provider.executeTransaction(wallet.address, {
      to,
      value: amount,
      token_mint: token,
    });

    return res.json({ success: result.success, transaction: result });
  } catch (error) {
    console.error('Error in POST /v1/agents/:id/wallet/send:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * PUT /v1/agents/:id/wallet/limits
 * Set spending limits
 */
agentWalletRouter.put('/v1/agents/:id/wallet/limits', verifyAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { per_tx_usd, daily_usd } = req.body || {};

    if (per_tx_usd === undefined || daily_usd === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required fields: per_tx_usd, daily_usd' });
    }

    const provider = getWalletProvider();
    const wallet = await provider.getWallet(id);

    if (!wallet) {
      return res.status(404).json({ success: false, error: 'Agent wallet not found' });
    }

    await provider.setSpendingLimits(wallet.address, { per_tx_usd, daily_usd });
    return res.json({ success: true, message: 'Spending limits updated' });
  } catch (error) {
    console.error('Error in PUT /v1/agents/:id/wallet/limits:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/agents/:id/wallet/policy
 * Get current wallet policy
 */
agentWalletRouter.get('/v1/agents/:id/wallet/policy', async (req, res) => {
  try {
    const { id } = req.params;
    const provider = getWalletProvider();
    const wallet = await provider.getWallet(id);

    if (!wallet) {
      return res.status(404).json({ success: false, error: 'Agent wallet not found' });
    }

    return res.json({
      success: true,
      wallet: {
        address: wallet.address,
        chain: wallet.chain,
        provider: wallet.provider,
        agent_passport_id: wallet.agent_passport_id,
      },
    });
  } catch (error) {
    console.error('Error in GET /v1/agents/:id/wallet/policy:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});
