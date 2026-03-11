/**
 * Asset Payment Routes
 *
 * REST API for per-asset pricing, revenue tracking, and withdrawal.
 */

import { Router } from 'express';
import { PricingService } from '../../../../engine/src/payment/pricingService';
import { RevenueService } from '../../../../engine/src/payment/revenueService';
import { verifyAdminAuth } from '../../middleware/adminAuth';

/**
 * Serialize a value that may contain BigInt fields into JSON-safe form.
 * BigInt values are converted to strings.
 */
function serializeBigInts(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'bigint') {
      result[key] = value.toString();
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function createAssetPaymentRouter(): Router {
  const router = Router();
  const pricingService = new PricingService();
  const revenueService = new RevenueService();

  /**
   * GET /:passportId/pricing
   * Get pricing configuration for an asset.
   */
  router.get('/:passportId/pricing', async (req, res) => {
    try {
      const { passportId } = req.params;
      const pricing = await pricingService.getPricing(passportId);

      if (!pricing) {
        return res.json({ success: true, pricing: null });
      }

      return res.json({
        success: true,
        pricing: serializeBigInts(pricing as unknown as Record<string, unknown>),
      });
    } catch (error) {
      console.error('Error in GET /:passportId/pricing:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * PUT /:passportId/pricing
   * Set or update pricing configuration for an asset.
   */
  router.put('/:passportId/pricing', verifyAdminAuth, async (req, res) => {
    try {
      const { passportId } = req.params;
      const body = req.body || {};

      // Validate required fields
      if (!body.payout_address) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: payout_address',
        });
      }

      if (body.price_per_call != null && !/^\d+$/.test(String(body.price_per_call))) {
        return res.status(400).json({
          success: false,
          error: 'price_per_call must be a numeric string',
        });
      }

      await pricingService.setPricing({
        passport_id: passportId,
        price_per_call: body.price_per_call != null ? BigInt(body.price_per_call) : undefined,
        price_per_token: body.price_per_token != null ? BigInt(body.price_per_token) : undefined,
        price_subscription_hour: body.price_subscription_hour != null ? BigInt(body.price_subscription_hour) : undefined,
        accepted_tokens: body.accepted_tokens,
        accepted_chains: body.accepted_chains,
        payout_address: body.payout_address,
        custom_split_bps: body.custom_split_bps,
      });

      return res.json({ success: true });
    } catch (error) {
      console.error('Error in PUT /:passportId/pricing:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /:passportId/pricing
   * Remove pricing (free access).
   */
  router.delete('/:passportId/pricing', verifyAdminAuth, async (req, res) => {
    try {
      const { passportId } = req.params;
      const deleted = await pricingService.deletePricing(passportId);

      return res.json({ success: true, deleted });
    } catch (error) {
      console.error('Error in DELETE /:passportId/pricing:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /:passportId/revenue
   * Get revenue summary for an asset.
   */
  router.get('/:passportId/revenue', async (req, res) => {
    try {
      const { passportId } = req.params;
      const token = (req.query.token as string) || 'USDC';
      const revenue = await revenueService.getRevenue(passportId, token);

      return res.json({
        success: true,
        revenue: serializeBigInts(revenue as unknown as Record<string, unknown>),
      });
    } catch (error) {
      console.error('Error in GET /:passportId/revenue:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /:passportId/withdraw
   * Withdraw earnings for an asset.
   */
  router.post('/:passportId/withdraw', verifyAdminAuth, async (req, res) => {
    try {
      const { passportId } = req.params;
      const token = (req.body?.token as string) || 'USDC';
      const result = await revenueService.withdraw(passportId, token);

      return res.json({
        success: true,
        withdrawal: serializeBigInts(result as unknown as Record<string, unknown>),
      });
    } catch (error) {
      console.error('Error in POST /:passportId/withdraw:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
