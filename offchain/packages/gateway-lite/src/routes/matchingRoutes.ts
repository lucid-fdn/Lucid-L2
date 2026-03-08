import { Router } from 'express';
import { validateWithSchema } from '../../../engine/src/crypto/schemaValidator';
import { evaluatePolicy } from '../compute/policyEngine';
import { matchComputeForModel } from '../compute/matchingEngine';
import { requirePayment } from '../middleware/x402';

export const matchingRouter = Router();

/**
 * POST /v1/match/explain
 *
 * MVP debug endpoint: evaluates policy against provided compute metadata.
 * Later this will also run runtime/hardware matching and return shortlisted/rejected.
 */
matchingRouter.post('/v1/match/explain', async (req, res) => {
  try {
    const { policy, compute_meta, model_meta } = req.body || {};

    const pv = validateWithSchema('Policy', policy);
    if (!pv.ok) {
      return res.status(400).json({
        success: false,
        error: 'Invalid policy schema',
        details: pv.errors,
      });
    }

    if (compute_meta) {
      const cv = validateWithSchema('ComputeMeta', compute_meta);
      if (!cv.ok) {
        return res.status(400).json({
          success: false,
          error: 'Invalid compute_meta schema',
          details: cv.errors,
        });
      }
    }

    if (model_meta) {
      const mv = validateWithSchema('ModelMeta', model_meta);
      if (!mv.ok) {
        return res.status(400).json({
          success: false,
          error: 'Invalid model_meta schema',
          details: mv.errors,
        });
      }
    }

    // If caller passes a single compute_meta, keep legacy behavior.
    const evalResult = evaluatePolicy({ policy, modelMeta: model_meta, computeMeta: compute_meta });

    return res.json({
      success: true,
      allowed: evalResult.allowed,
      reasons: evalResult.reasons,
      policy_hash: evalResult.policy_hash,
    });
  } catch (error) {
    console.error('Error in /v1/match/explain:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v1/match
 * Input: { model_meta, policy, compute_catalog[] }
 * Output: selected compute + fallbacks
 */
matchingRouter.post('/v1/match', requirePayment({ dynamic: true }), async (req, res) => {
  try {
    const { model_meta, policy, compute_catalog, require_live_healthy } = req.body || {};
    const { match, explain } = matchComputeForModel({
      model_meta,
      policy,
      compute_catalog,
      require_live_healthy: require_live_healthy !== false,
    });

    if (!match) {
      return res.status(422).json({
        success: false,
        error: 'NO_COMPATIBLE_COMPUTE',
        explain,
      });
    }

    return res.json({
      success: true,
      match,
      explain,
    });
  } catch (error) {
    console.error('Error in /v1/match:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * POST /v1/route
 *
 * MVP execution gateway (planner):
 * - runs /v1/match logic
 * - returns an executable route (endpoint + runtime + policy_hash + fallbacks)
 *
 * Input: { model_meta, policy, compute_catalog, request_id? }
 */
matchingRouter.post('/v1/route', async (req, res) => {
  try {
    const { model_meta, policy, compute_catalog, request_id, require_live_healthy } = req.body || {};
    const { match, explain } = matchComputeForModel({
      model_meta,
      policy,
      compute_catalog,
      require_live_healthy: require_live_healthy !== false,
    });

    if (!match) {
      return res.status(422).json({
        success: false,
        error: 'NO_COMPATIBLE_COMPUTE',
        request_id,
        explain,
      });
    }

    // Resolve primary endpoint from compute_catalog
    const selectedCompute = (compute_catalog || []).find(
      (c: any) => c && c.compute_passport_id === match.compute_passport_id
    );
    const endpoint = selectedCompute?.endpoints?.inference_url;
    if (!endpoint) {
      return res.status(422).json({
        success: false,
        error: 'SELECTED_COMPUTE_MISSING_ENDPOINT',
        request_id,
        explain,
      });
    }

    const m = match as any;
    return res.json({
      success: true,
      request_id,
      route: {
        compute_passport_id: m.compute_passport_id,
        model_passport_id: m.model_passport_id,
        endpoint,
        runtime: m.selected_runtime,
        policy_hash: explain.policy_hash,
        fallbacks: m.fallbacks,
      },
      explain,
    });
  } catch (error) {
    console.error('Error in /v1/route:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
