import { Router, Request, Response } from 'express';
import { requirePayment } from '../middleware/x402';
import { getPaymentGateService } from '../../../engine/src/finance/paymentGateService';

/**
 * Subscription Routes
 *
 * POST /v1/access/subscribe — x402-gated subscription endpoint.
 * The calling agent pays via the x402 protocol (USDC on Base), then the
 * handler creates an on-chain AccessReceipt via paymentGateService.
 */
export function createSubscriptionRouter(): Router {
  const router = Router();

  /**
   * POST /v1/access/subscribe
   *
   * Body: { passport_id: string, duration_hours: number }
   *
   * x402-gated: agent must include a valid X-Payment-Proof header.
   * On success the handler calls paymentGateService.payForAccess() to
   * mint an on-chain AccessReceipt, then returns subscription details.
   */
  router.post(
    '/v1/access/subscribe',
    requirePayment({ dynamic: true }),
    async (req: Request, res: Response) => {
      try {
        const { passport_id, duration_hours } = req.body || {};

        if (!passport_id || typeof passport_id !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'passport_id is required and must be a string',
          });
        }

        const hours = typeof duration_hours === 'number' && duration_hours > 0
          ? duration_hours
          : 24; // default 24 hours

        // Calculate expiration timestamp
        const expiresAt = Math.floor(Date.now() / 1000) + hours * 3600;

        // Create on-chain AccessReceipt
        try {
          const paymentGateService = getPaymentGateService();
          await paymentGateService.payForAccess(passport_id, undefined, expiresAt);
        } catch (chainErr) {
          // If on-chain call fails (e.g., no Solana keypair), log but still
          // return success since the x402 payment was already verified.
          console.warn(
            '[SubscriptionRoute] On-chain AccessReceipt creation failed (non-blocking):',
            chainErr instanceof Error ? chainErr.message : chainErr,
          );
        }

        return res.json({
          subscribed: true,
          passport_id,
          expires_at: expiresAt,
          duration_hours: hours,
        });
      } catch (error) {
        console.error('Error in POST /v1/access/subscribe:', error);
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  );

  return router;
}
