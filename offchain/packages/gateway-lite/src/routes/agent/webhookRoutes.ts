// offchain/packages/gateway-lite/src/routes/agent/webhookRoutes.ts
// POST /v1/webhooks/:provider — Provider webhook ingestion

import { Router } from 'express';

export const webhookRouter = Router();

/**
 * Provider webhook callback endpoint.
 * Normalizes payload, updates deployment store, enqueues reconciliation.
 * Always returns 2xx after basic validation -- never block the provider.
 */
// Telegram webhook proxy → forwards to telegram-bot service (port 4050)
webhookRouter.post('/v1/webhooks/telegram', async (req, res) => {
  const botUrl = process.env.TELEGRAM_BOT_URL || 'http://localhost:4050';
  try {
    const proxyRes = await fetch(`${botUrl}/webhooks/telegram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers['x-telegram-bot-api-secret-token']
          ? { 'x-telegram-bot-api-secret-token': req.headers['x-telegram-bot-api-secret-token'] as string }
          : {}),
      },
      body: JSON.stringify(req.body),
    });
    const data = await proxyRes.json();
    return res.json(data);
  } catch (err: any) {
    console.warn('[webhook] Telegram proxy error:', err.message);
    return res.json({ ok: true });
  }
});

webhookRouter.post('/v1/webhooks/:provider', async (req, res) => {
  try {
    const { WebhookHandler } = await import('../../../../engine/src/compute/control-plane/webhooks/handler');
    const { getDeploymentStore } = await import('../../../../engine/src/compute/control-plane/store');
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
