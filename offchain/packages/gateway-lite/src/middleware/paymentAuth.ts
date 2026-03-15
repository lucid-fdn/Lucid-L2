/**
 * Payment Authorization Middleware
 *
 * Verifies PaymentGrant headers on incoming requests.
 * Returns HTTP 402 with accepted payment methods when no payment auth is present.
 *
 * Accepts:
 * 1. X-Payment-Grant header (base64-encoded signed PaymentGrant JSON)
 * 2. X-Access-Receipt header (on-chain access receipt -- Phase D, not yet implemented)
 *
 * Opt-in per route -- wrap any Express route handler with requirePaymentAuth().
 */

import { Request, Response, NextFunction } from 'express';
import { verifyPaymentGrant, type PaymentGrant } from '../../../engine/src/payment/settlement/paymentGrant';
import { logger } from '../../../engine/src/shared/lib/logger';

const TRUSTED_SIGNER = process.env.PAYMENT_GRANT_SIGNER_PUBKEY || '';

/**
 * Payment authorization middleware factory.
 * Returns an Express middleware that checks for payment authorization.
 */
export function requirePaymentAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Path 1: PaymentGrant header
    const grantHeader = req.headers['x-payment-grant'] as string | undefined;
    if (grantHeader) {
      try {
        const grant: PaymentGrant = JSON.parse(
          Buffer.from(grantHeader, 'base64').toString('utf8'),
        );

        // Verify signature + expiry
        const result = verifyPaymentGrant(grant, TRUSTED_SIGNER);
        if (!result.valid) {
          return res.status(402).json({ error: 'Invalid PaymentGrant', reason: result.reason });
        }

        // Atomic spend tracking via grant_budgets table
        try {
          const pool = (await import('../../../engine/src/shared/db/pool')).default;

          // Ensure grant budget row exists (lazy init from signed grant limits)
          await pool.query(
            `INSERT INTO grant_budgets (grant_id, tenant_id, signer_pubkey, max_calls, max_usd, expires_at)
             VALUES ($1, $2, $3, $4, $5, to_timestamp($6))
             ON CONFLICT (grant_id) DO NOTHING`,
            [
              grant.grant_id,
              grant.tenant_id,
              grant.signer_pubkey,
              grant.limits.max_calls,
              grant.limits.total_usd,
              grant.limits.expires_at,
            ],
          );

          // Consume budget atomically
          const estimatedCostUsd = grant.scope.max_per_call_usd;
          const { rows } = await pool.query(
            'SELECT consume_grant_budget($1, $2, $3) as ok',
            [grant.grant_id, estimatedCostUsd, 1],
          );

          if (!rows[0]?.ok) {
            return res.status(402).json({ error: 'Grant budget exceeded or expired' });
          }
        } catch {
          // DB not available -- fall back to signature-only verification (no spend tracking)
          logger.warn(
            '[paymentAuth] Grant budget tracking failed (DB unavailable), proceeding with signature-only verification',
          );
        }

        (req as any).paymentGrant = grant;
        return next();
      } catch {
        return res.status(402).json({ error: 'Malformed PaymentGrant header' });
      }
    }

    // Path 2: On-chain AccessReceipt (to be implemented in Phase D / Task 13)
    // const accessReceipt = req.headers['x-access-receipt'];

    // No payment authorization present -- return 402 with accepted methods
    return res.status(402).json({
      error: 'Payment Required',
      methods: [
        {
          type: 'payment_grant',
          header: 'X-Payment-Grant',
          description: 'Base64-encoded signed PaymentGrant JSON',
        },
        {
          type: 'access_receipt',
          header: 'X-Access-Receipt',
          description: 'Base64-encoded JSON with chain_id, passport_id, payer',
        },
      ],
    });
  };
}
