// offchain/packages/gateway-lite/src/routes/agentRevenueRoutes.ts
// REST API routes for agent revenue pool and airdrop management.

import express from 'express';
import { verifyAdminAuth } from '../../middleware/adminAuth';
import { logger } from '../../../../engine/src/shared/lib/logger';

function getRevenueService() {
  const mod = require('../../../engine/src/compute/agent/agentRevenueService');
  return mod;
}

export const agentRevenueRouter = express.Router();

/**
 * GET /v1/agents/:id/revenue
 * Get agent revenue pool status
 */
agentRevenueRouter.get('/v1/agents/:id/revenue', async (req, res) => {
  try {
    const { id } = req.params;
    const { getAgentRevenuePool } = getRevenueService();
    const pool = getAgentRevenuePool(id);

    if (!pool) {
      return res.json({
        success: true,
        revenue: {
          agent_passport_id: id,
          accumulated_lamports: '0',
          total_distributed_lamports: '0',
          last_airdrop_at: 0,
        },
      });
    }

    return res.json({
      success: true,
      revenue: {
        agent_passport_id: pool.agent_passport_id,
        accumulated_lamports: pool.accumulated_lamports.toString(),
        total_distributed_lamports: pool.total_distributed_lamports.toString(),
        last_airdrop_at: pool.last_airdrop_at,
      },
    });
  } catch (error) {
    logger.error('Error in GET /v1/agents/:id/revenue:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /v1/agents/:id/revenue/airdrop
 * Trigger airdrop of accumulated revenue to share token holders
 */
agentRevenueRouter.post('/v1/agents/:id/revenue/airdrop', verifyAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { triggerAgentAirdrop } = getRevenueService();
    const result = await triggerAgentAirdrop(id);

    if (!result) {
      return res.status(400).json({
        success: false,
        error: 'No accumulated revenue to distribute',
      });
    }

    return res.json({
      success: true,
      airdrop: {
        distributed_lamports: result.distributed_lamports.toString(),
        holder_count: result.holder_count,
      },
    });
  } catch (error) {
    logger.error('Error in POST /v1/agents/:id/revenue/airdrop:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /v1/agents/:id/revenue/history
 * Get payout history for an agent
 */
agentRevenueRouter.get('/v1/agents/:id/revenue/history', async (req, res) => {
  try {
    const { id } = req.params;

    // Lazy import payoutService to get agent-attributed payouts
    const { getAllPayouts } = require('../../../engine/src/payment/services/payoutService');
    const allPayouts = getAllPayouts();
    const agentPayouts = allPayouts.filter(
      (p: any) => p.agent_passport_id === id,
    );

    return res.json({
      success: true,
      history: agentPayouts.map((p: any) => ({
        run_id: p.run_id,
        total_amount_lamports: p.total_amount_lamports.toString(),
        recipients: p.recipients.map((r: any) => ({
          ...r,
          amount_lamports: r.amount_lamports.toString(),
        })),
        created_at: p.created_at,
      })),
    });
  } catch (error) {
    logger.error('Error in GET /v1/agents/:id/revenue/history:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});
