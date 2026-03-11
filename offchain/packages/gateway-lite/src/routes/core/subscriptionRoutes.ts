import { Router, Request, Response } from 'express';
import { requirePayment } from '../../middleware/x402';
import { blockchainAdapterFactory } from '../../../../engine/src/chains/factory';

/**
 * Subscription Routes
 *
 * POST /v1/access/subscribe — x402-gated subscription endpoint.
 * The calling agent pays via the x402 protocol (USDC on Base), then the
 * handler creates an on-chain AccessReceipt via the blockchain adapter.
 */
export function createSubscriptionRouter(): Router {
  const router = Router();

  /**
   * POST /v1/access/subscribe
   *
   * Body: { passport_id: string, duration_hours: number }
   *
   * x402-gated: agent must include a valid X-Payment-Proof header.
   * On success the handler calls adapter.passports().payForAccess() to
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

        // Calculate duration in seconds for the adapter
        const durationSeconds = hours * 3600;

        // Create on-chain AccessReceipt via adapter
        try {
          const chainId = (process.env.ANCHORING_CHAINS || 'solana-devnet').split(',')[0].trim();
          const adapter = await blockchainAdapterFactory.getAdapter(chainId);
          await adapter.passports().payForAccess(passport_id, durationSeconds);
        } catch (chainErr) {
          // If on-chain call fails (e.g., no adapter registered), log but still
          // return success since the x402 payment was already verified.
          console.warn(
            '[SubscriptionRoute] On-chain AccessReceipt creation failed (non-blocking):',
            chainErr instanceof Error ? chainErr.message : chainErr,
          );
        }

        const expiresAt = Math.floor(Date.now() / 1000) + durationSeconds;

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
