// offchain/packages/gateway-lite/src/routes/agent/launchRoutes.ts
// REST API route for launching agents via image (Path A) or base runtime (Path B).

import express from 'express';
import { verifyAdminAuth } from '../../middleware/adminAuth';
import { logger } from '../../../../engine/src/shared/lib/logger';

export const launchRouter = express.Router();

/**
 * POST /v1/agents/launch
 * Launch an agent via image (BYOI) or base-runtime (no-code).
 * Body: { mode: 'image' | 'base-runtime', ...fields }
 */
launchRouter.post('/v1/agents/launch', verifyAdminAuth, async (req, res) => {
  try {
    const { mode } = req.body || {};

    if (mode === 'image') {
      const { launchImage } = await import('../../../../engine/src/compute/control-plane/launch');
      const result = await launchImage({
        image: req.body.image,
        target: req.body.target || 'docker',
        owner: req.body.owner,
        name: req.body.name,
        port: req.body.port,
        verification: req.body.verification || 'full',
        env_vars: req.body.env_vars,
      });
      return res.status(result.success ? 200 : 400).json(result);
    } else if (mode === 'base-runtime') {
      const { launchBaseRuntime } = await import('../../../../engine/src/compute/control-plane/launch');
      const result = await launchBaseRuntime({
        model: req.body.model,
        prompt: req.body.prompt,
        target: req.body.target || 'docker',
        owner: req.body.owner,
        name: req.body.name || `base-${req.body.model}`,
        tools: req.body.tools,
      });
      return res.status(result.success ? 200 : 400).json(result);
    } else {
      return res.status(400).json({ success: false, error: 'mode must be "image" or "base-runtime"' });
    }
  } catch (err: any) {
    logger.error('Error in POST /v1/agents/launch:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Launch failed',
    });
  }
});
