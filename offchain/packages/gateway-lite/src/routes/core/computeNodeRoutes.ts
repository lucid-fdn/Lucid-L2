import { Router } from 'express';
import { getComputeRegistry } from '../../compute/computeRegistry';
import { logger } from '../../../../engine/src/lib/logger';

export const computeNodeRouter = Router();

/**
 * POST /v1/compute/nodes/heartbeat
 *
 * Minimal live-state endpoint.
 * The compute node (or orchestrator acting on its behalf) sends periodic heartbeats.
 */
computeNodeRouter.post('/v1/compute/nodes/heartbeat', async (req, res) => {
  try {
    const hb = req.body as any;
    if (!hb?.compute_passport_id || typeof hb.compute_passport_id !== 'string') {
      return res.status(400).json({ success: false, error: 'compute_passport_id is required' });
    }
    const status = hb.status as string;
    if (!['healthy', 'degraded', 'down'].includes(status)) {
      return res.status(400).json({ success: false, error: 'status must be healthy|degraded|down' });
    }

    const reg = getComputeRegistry();
    const state = reg.upsertHeartbeat({
      compute_passport_id: hb.compute_passport_id,
      status: status as any,
      queue_depth: hb.queue_depth,
      price_per_1k_tokens_estimate: hb.price_per_1k_tokens_estimate,
      p95_ms_estimate: hb.p95_ms_estimate,
    });

    return res.json({ success: true, state });
  } catch (error) {
    logger.error('Error in /v1/compute/nodes/heartbeat:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /v1/compute/nodes/:compute_passport_id/health
 */
computeNodeRouter.get('/v1/compute/nodes/:computePassportId/health', async (req, res) => {
  try {
    const { computePassportId } = req.params;
    const reg = getComputeRegistry();
    const state = reg.getLiveState(computePassportId);
    if (!state) {
      return res.status(503).json({ success: false, status: 'unknown_or_expired' });
    }
    return res.json({ success: true, state });
  } catch (error) {
    logger.error('Error in /v1/compute/nodes/:id/health:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
