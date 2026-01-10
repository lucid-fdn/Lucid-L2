import express from 'express';
import { validateWithSchema } from '../utils/schemaValidator';
import { evaluatePolicy } from '../services/policyEngine';
import { getComputeRegistry } from '../services/computeRegistry';
import { matchComputeForModel } from '../services/matchingEngine';
import { createReceipt, getReceipt, verifyReceiptHash, verifyReceipt, getReceiptProof, getMmrRoot, getMmrLeafCount, getSignerPublicKey } from '../services/receiptService';
import { calculatePayoutSplit, createPayoutFromReceipt, getPayout, storePayout, verifyPayoutSplit } from '../services/payoutService';

export const lucidLayerRouter = express.Router();

/**
 * POST /v1/match/explain
 *
 * MVP debug endpoint: evaluates policy against provided compute metadata.
 * Later this will also run runtime/hardware matching and return shortlisted/rejected.
 */
lucidLayerRouter.post('/v1/match/explain', async (req, res) => {
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
lucidLayerRouter.post('/v1/match', async (req, res) => {
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
lucidLayerRouter.post('/v1/route', async (req, res) => {
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

    return res.json({
      success: true,
      request_id,
      route: {
        compute_passport_id: match.compute_passport_id,
        model_passport_id: match.model_passport_id,
        endpoint,
        runtime: match.selected_runtime,
        policy_hash: explain.policy_hash,
        fallbacks: match.fallbacks,
      },
      explain,
    });
  } catch (error) {
    console.error('Error in /v1/route:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});


/**
 * POST /v1/compute/nodes/heartbeat
 *
 * Minimal live-state endpoint.
 * The compute node (or orchestrator acting on its behalf) sends periodic heartbeats.
 */
lucidLayerRouter.post('/v1/compute/nodes/heartbeat', async (req, res) => {
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
    console.error('Error in /v1/compute/nodes/heartbeat:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /v1/compute/nodes/:compute_passport_id/health
 */
lucidLayerRouter.get('/v1/compute/nodes/:computePassportId/health', async (req, res) => {
  try {
    const { computePassportId } = req.params;
    const reg = getComputeRegistry();
    const state = reg.getLiveState(computePassportId);
    if (!state) {
      return res.status(503).json({ success: false, status: 'unknown_or_expired' });
    }
    return res.json({ success: true, state });
  } catch (error) {
    console.error('Error in /v1/compute/nodes/:id/health:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * POST /v1/receipts
 * Create a new run receipt
 */
lucidLayerRouter.post('/v1/receipts', async (req, res) => {
  try {
    const input = req.body || {};
    const required = ['model_passport_id', 'compute_passport_id', 'policy_hash', 'runtime', 'tokens_in', 'tokens_out', 'ttft_ms'];
    for (const k of required) {
      if (input[k] === undefined || input[k] === null) {
        return res.status(400).json({ success: false, error: `Missing required field: ${k}` });
      }
    }

    const receipt = createReceipt(input);
    return res.json({ success: true, receipt });
  } catch (error) {
    console.error('Error in POST /v1/receipts:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /v1/receipts/:receipt_id
 */
lucidLayerRouter.get('/v1/receipts/:receipt_id', async (req, res) => {
  try {
    const { receipt_id } = req.params;
    const receipt = getReceipt(receipt_id);
    if (!receipt) {
      return res.status(404).json({ success: false, error: 'Receipt not found' });
    }
    return res.json({ success: true, receipt });
  } catch (error) {
    console.error('Error in GET /v1/receipts/:id:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /v1/receipts/:receipt_id/verify
 * Verify receipt hash + signature integrity
 */
lucidLayerRouter.get('/v1/receipts/:receipt_id/verify', async (req, res) => {
  try {
    const { receipt_id } = req.params;
    const result = verifyReceipt(receipt_id);
    if (!result.hash_valid && result.expected_hash === undefined) {
      return res.status(404).json({ success: false, error: 'Receipt not found' });
    }
    return res.json({ 
      success: true, 
      valid: result.hash_valid && result.signature_valid,
      hash_valid: result.hash_valid,
      signature_valid: result.signature_valid,
      inclusion_valid: result.inclusion_valid,
      expected_hash: result.expected_hash,
      computed_hash: result.computed_hash,
      merkle_root: result.merkle_root,
    });
  } catch (error) {
    console.error('Error in GET /v1/receipts/:id/verify:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /v1/receipts/:receipt_id/proof
 * Get Merkle inclusion proof for a receipt
 */
lucidLayerRouter.get('/v1/receipts/:receipt_id/proof', async (req, res) => {
  try {
    const { receipt_id } = req.params;
    const proof = getReceiptProof(receipt_id);
    if (!proof) {
      return res.status(404).json({ success: false, error: 'Receipt not found or no proof available' });
    }
    return res.json({ success: true, proof });
  } catch (error) {
    console.error('Error in GET /v1/receipts/:id/proof:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /v1/signer/pubkey
 * Get the orchestrator's signing public key
 */
lucidLayerRouter.get('/v1/signer/pubkey', async (_req, res) => {
  try {
    const pubkey = getSignerPublicKey();
    return res.json({ success: true, signer_type: 'orchestrator', pubkey });
  } catch (error) {
    console.error('Error in GET /v1/signer/pubkey:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /v1/mmr/root
 * Get current MMR root (for anchoring)
 */
lucidLayerRouter.get('/v1/mmr/root', async (_req, res) => {
  try {
    const root = getMmrRoot();
    const leaf_count = getMmrLeafCount();
    return res.json({ success: true, root, leaf_count });
  } catch (error) {
    console.error('Error in GET /v1/mmr/root:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * POST /v1/payouts/calculate
 * Calculate payout split for a run
 */
lucidLayerRouter.post('/v1/payouts/calculate', async (req, res) => {
  try {
    const input = req.body || {};
    const required = ['run_id', 'total_amount_lamports', 'compute_wallet'];
    for (const k of required) {
      if (input[k] === undefined || input[k] === null) {
        return res.status(400).json({ success: false, error: `Missing required field: ${k}` });
      }
    }

    // Convert string to BigInt if needed
    const totalAmount = typeof input.total_amount_lamports === 'string' 
      ? BigInt(input.total_amount_lamports) 
      : BigInt(input.total_amount_lamports);

    const payout = calculatePayoutSplit({
      run_id: input.run_id,
      total_amount_lamports: totalAmount,
      compute_wallet: input.compute_wallet,
      model_wallet: input.model_wallet,
      orchestrator_wallet: input.orchestrator_wallet,
      config: input.config,
    });

    // Store the payout
    storePayout(payout);

    // Convert BigInt to string for JSON serialization
    const payoutJson = {
      ...payout,
      total_amount_lamports: payout.total_amount_lamports.toString(),
      recipients: payout.recipients.map(r => ({
        ...r,
        amount_lamports: r.amount_lamports.toString(),
      })),
    };

    return res.json({ success: true, payout: payoutJson });
  } catch (error) {
    console.error('Error in POST /v1/payouts/calculate:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * POST /v1/payouts/from-receipt
 * Create payout split from receipt token data
 */
lucidLayerRouter.post('/v1/payouts/from-receipt', async (req, res) => {
  try {
    const input = req.body || {};
    const required = ['run_id', 'tokens_in', 'tokens_out', 'price_per_1k_tokens_lamports', 'compute_wallet'];
    for (const k of required) {
      if (input[k] === undefined || input[k] === null) {
        return res.status(400).json({ success: false, error: `Missing required field: ${k}` });
      }
    }

    const pricePer1k = typeof input.price_per_1k_tokens_lamports === 'string'
      ? BigInt(input.price_per_1k_tokens_lamports)
      : BigInt(input.price_per_1k_tokens_lamports);

    const payout = createPayoutFromReceipt({
      run_id: input.run_id,
      tokens_in: input.tokens_in,
      tokens_out: input.tokens_out,
      price_per_1k_tokens_lamports: pricePer1k,
      compute_wallet: input.compute_wallet,
      model_wallet: input.model_wallet,
      orchestrator_wallet: input.orchestrator_wallet,
      config: input.config,
    });

    // Store the payout
    storePayout(payout);

    // Convert BigInt to string for JSON serialization
    const payoutJson = {
      ...payout,
      total_amount_lamports: payout.total_amount_lamports.toString(),
      recipients: payout.recipients.map(r => ({
        ...r,
        amount_lamports: r.amount_lamports.toString(),
      })),
    };

    return res.json({ success: true, payout: payoutJson });
  } catch (error) {
    console.error('Error in POST /v1/payouts/from-receipt:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /v1/payouts/:run_id
 * Get payout split by run_id
 */
lucidLayerRouter.get('/v1/payouts/:run_id', async (req, res) => {
  try {
    const { run_id } = req.params;
    const payout = getPayout(run_id);
    if (!payout) {
      return res.status(404).json({ success: false, error: 'Payout not found' });
    }

    // Convert BigInt to string for JSON serialization
    const payoutJson = {
      ...payout,
      total_amount_lamports: payout.total_amount_lamports.toString(),
      recipients: payout.recipients.map(r => ({
        ...r,
        amount_lamports: r.amount_lamports.toString(),
      })),
    };

    return res.json({ success: true, payout: payoutJson });
  } catch (error) {
    console.error('Error in GET /v1/payouts/:run_id:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /v1/payouts/:run_id/verify
 * Verify payout split integrity
 */
lucidLayerRouter.get('/v1/payouts/:run_id/verify', async (req, res) => {
  try {
    const { run_id } = req.params;
    const payout = getPayout(run_id);
    if (!payout) {
      return res.status(404).json({ success: false, error: 'Payout not found' });
    }

    const result = verifyPayoutSplit(payout);
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error in GET /v1/payouts/:run_id/verify:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
