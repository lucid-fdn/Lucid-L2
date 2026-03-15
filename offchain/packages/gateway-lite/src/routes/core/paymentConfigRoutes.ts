/**
 * Payment Config Routes
 *
 * REST API for querying and updating the gateway payment configuration,
 * including x402 settings, facilitator selection, and supported chains/tokens.
 */

import { Router } from 'express';
import { getX402Config } from '../../middleware/x402';
import { getFacilitatorRegistry } from '../../middleware/x402';
import { verifyAdminAuth } from '../../middleware/adminAuth';
import { createPaymentGrant } from '../../../../engine/src/payment/settlement/paymentGrant';
import { getOrchestratorKeypair } from '../../../../engine/src/crypto/signing';
import { logger } from '../../../../engine/src/lib/logger';

export function createPaymentConfigRouter(): Router {
  const router = Router();

  /**
   * GET /payment
   * Return the current payment configuration (x402 config + facilitator info).
   */
  router.get('/payment', async (_req, res) => {
    try {
      const x402Config = getX402Config();
      const registry = getFacilitatorRegistry();

      let facilitatorName: string | null = null;
      let supportedChains: unknown[] = [];
      let supportedTokens: unknown[] = [];

      if (registry) {
        try {
          const defaultFacilitator = registry.getDefault();
          facilitatorName = defaultFacilitator.name;
          supportedChains = defaultFacilitator.supportedChains;
          supportedTokens = defaultFacilitator.supportedTokens;
        } catch {
          // No facilitators registered
        }
      }

      return res.json({
        success: true,
        config: {
          enabled: x402Config.enabled,
          paymentChain: x402Config.paymentChain,
          paymentAddress: x402Config.paymentAddress,
          defaultPriceUSDC: x402Config.defaultPriceUSDC,
          facilitator: facilitatorName,
          supportedChains,
          supportedTokens,
        },
      });
    } catch (error) {
      logger.error('Error in GET /payment:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * PUT /facilitator
   * Change the default facilitator. Requires admin authentication.
   */
  router.put('/facilitator', verifyAdminAuth, async (req, res) => {
    try {
      const { name } = req.body || {};

      if (!name || typeof name !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: name',
        });
      }

      const registry = getFacilitatorRegistry();
      if (!registry) {
        return res.status(500).json({
          success: false,
          error: 'FacilitatorRegistry not configured',
        });
      }

      registry.setDefault(name);

      return res.json({ success: true, facilitator: name });
    } catch (error) {
      logger.error('Error in PUT /facilitator:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /chains
   * List supported chains and tokens from the current default facilitator.
   */
  router.get('/chains', async (_req, res) => {
    try {
      const registry = getFacilitatorRegistry();
      if (!registry) {
        return res.json({
          success: true,
          chains: [],
          tokens: [],
        });
      }

      try {
        const facilitator = registry.getDefault();
        return res.json({
          success: true,
          facilitator: facilitator.name,
          chains: facilitator.supportedChains,
          tokens: facilitator.supportedTokens,
        });
      } catch {
        // No facilitators registered
        return res.json({
          success: true,
          chains: [],
          tokens: [],
        });
      }
    } catch (error) {
      logger.error('Error in GET /chains:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /grants
   * Issue a signed payment grant. Requires admin authentication.
   * Body: { tenant_id, agent_passport_id, run_id, scope, limits, attestation }
   */
  router.post('/grants', verifyAdminAuth, async (req, res) => {
    try {
      const { tenant_id, agent_passport_id, run_id, scope, limits, attestation } = req.body || {};

      if (!tenant_id || !agent_passport_id || !run_id || !scope || !limits) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: tenant_id, agent_passport_id, run_id, scope, limits',
        });
      }

      const keypair = getOrchestratorKeypair();
      const grant = await createPaymentGrant(
        {
          tenant_id,
          agent_passport_id,
          run_id,
          scope,
          limits,
          attestation: attestation || {
            balance_verified_at: Math.floor(Date.now() / 1000),
            balance_source: 'credit',
          },
        },
        keypair.secretKey,
      );

      return res.status(201).json({ success: true, grant });
    } catch (error) {
      logger.error('Error in POST /grants:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
