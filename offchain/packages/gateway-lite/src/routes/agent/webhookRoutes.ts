// offchain/packages/gateway-lite/src/routes/agent/webhookRoutes.ts
// POST /v1/webhooks/:provider — Provider webhook ingestion

import { Router } from 'express';

export const webhookRouter = Router();

/**
 * Provider webhook callback endpoint.
 * Normalizes payload, updates deployment store, enqueues reconciliation.
 * Always returns 2xx after basic validation -- never block the provider.
 */
webhookRouter.post('/v1/webhooks/:provider', async (req, res) => {
  try {
    const { WebhookHandler } = await import('../../../../engine/src/compute/deployment/webhooks/handler');
    const { getDeploymentStore } = await import('../../../../engine/src/compute/deployment/control-plane');
    const handler = new WebhookHandler(getDeploymentStore());
    const result = await handler.handle(
      req.params.provider,
      req.body,
      req.headers as Record<string, string>,
    );
    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[webhook] Error processing ${req.params.provider} callback:`, message);
    // Always return 2xx after shape validation -- never block provider retries
    return res.json({ success: true, warning: 'accepted but processing failed' });
  }
});
