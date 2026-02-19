import express from 'express';
import { validateWithSchema } from '../utils/schemaValidator';
import { evaluatePolicy } from '../services/policyEngine';
import { getComputeRegistry } from '../services/computeRegistry';
import { matchComputeForModel } from '../services/matchingEngine';
import { createReceipt, getReceipt, verifyReceiptHash, verifyReceipt, getReceiptProof, getMmrRoot, getMmrLeafCount, getSignerPublicKey, listReceipts, listExtendedReceipts, getExtendedReceipt, verifyExtendedReceipt } from '../services/receiptService';
import { calculatePayoutSplit, createPayoutFromReceipt, getPayout, storePayout, verifyPayoutSplit } from '../services/payoutService';
import {
  executeInferenceRequest,
  executeStreamingInferenceRequest,
  executeChatCompletion,
  ExecutionRequest,
  ChatCompletionRequest,
} from '../services/executionGateway';
import {
  createEpoch,
  getCurrentEpoch,
  getEpoch,
  listEpochs,
  getEpochsReadyForFinalization,
  getEpochStats,
  retryEpoch,
  EpochStatus,
  getAllEpochs,
} from '../services/epochService';
import {
  commitEpochRoot,
  commitEpochRootsBatch,
  verifyEpochAnchor,
  getAnchorTransaction,
  checkAnchoringHealth,
} from '../services/anchoringService';
import { blockchainAdapterFactory } from '../blockchain/BlockchainAdapterFactory';
import { CHAIN_CONFIGS } from '../blockchain/chains';

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
 * GET /v1/verify/:receipt_hash
 * Verify a receipt by its hash - returns inclusion proof and epoch anchoring status
 * This is the P0.9 endpoint for Fluid Compute v0
 */
lucidLayerRouter.get('/v1/verify/:receipt_hash', async (req, res) => {
  try {
    const { receipt_hash } = req.params;
    
    // Verify the receipt hash format
    if (!receipt_hash || receipt_hash.length !== 64) {
      return res.status(400).json({
        success: false,
        error: 'Invalid receipt_hash format (expected 64 hex characters)',
      });
    }
    
    // Search for receipt by hash in both regular and extended stores
    let receipt = null;
    let run_id: string | null = null;
    let isExtended = false;
    
    // Check regular receipts
    const regularReceipts = listReceipts();
    for (const r of regularReceipts) {
      if (r.receipt_hash === receipt_hash) {
        receipt = r;
        run_id = r.run_id;
        break;
      }
    }
    
    // Check extended receipts if not found
    if (!receipt) {
      const extendedReceipts = listExtendedReceipts();
      for (const r of extendedReceipts) {
        if (r.receipt_hash === receipt_hash) {
          receipt = r;
          run_id = r.run_id;
          isExtended = true;
          break;
        }
      }
    }
    
    if (!receipt || !run_id) {
      return res.status(404).json({
        success: false,
        verified: false,
        error: 'Receipt not found for this hash',
        receipt_hash,
      });
    }
    
    // Verify the receipt
    const verifyResult = isExtended 
      ? verifyExtendedReceipt(run_id)
      : verifyReceipt(run_id);
    
    // Get Merkle proof
    const merkleProof = getReceiptProof(run_id);
    
    // Check if receipt is in an anchored epoch
    let epoch_info = null;
    let on_chain_verified = false;
    let tx_signature = null;
    
    if (receipt._mmr_leaf_index !== undefined) {
      // Find the epoch containing this receipt - use full Epoch objects
      const allEpochs = getAllEpochs();
      const anchoredEpochs = allEpochs.filter(e => e.status === 'anchored');
      
      for (const epoch of anchoredEpochs) {
        if (epoch.start_leaf_index !== undefined && 
            epoch.end_leaf_index !== undefined &&
            receipt._mmr_leaf_index >= epoch.start_leaf_index && 
            receipt._mmr_leaf_index <= epoch.end_leaf_index) {
          epoch_info = {
            epoch_id: epoch.epoch_id,
            mmr_root: epoch.mmr_root,
            chain_tx: epoch.chain_tx,
            finalized_at: epoch.finalized_at,
          };
          tx_signature = epoch.chain_tx;
          on_chain_verified = !!epoch.chain_tx;
          break;
        }
      }
    }
    
    // Build response with type-safe access to extended fields
    const response: Record<string, unknown> = {
      success: true,
      verified: verifyResult.hash_valid && verifyResult.signature_valid,
      receipt_hash,
      run_id: receipt.run_id,
      
      // Hash verification
      hash_valid: verifyResult.hash_valid,
      
      // Signature verification  
      signature_valid: verifyResult.signature_valid,
      signer_pubkey: receipt.signer_pubkey,
      signer_type: receipt.signer_type,
    };
    
    // Add Fluid Compute v0 fields if this is an extended receipt
    if (isExtended && 'execution_mode' in receipt) {
      response.execution_mode = receipt.execution_mode;
      response.runtime_hash = receipt.runtime_hash;
      response.gpu_fingerprint = receipt.gpu_fingerprint;
    }
    
    // Add MMR proof if available
    if (merkleProof) {
      response.inclusion_proof = {
        leaf_index: merkleProof.leafIndex,
        proof: merkleProof.siblings,
        root: merkleProof.root,
        directions: merkleProof.directions,
      };
      response.inclusion_valid = verifyResult.inclusion_valid ?? true;
    } else {
      response.inclusion_valid = false;
    }
    
    // Add on-chain anchoring info
    if (epoch_info) {
      response.epoch = epoch_info;
      response.on_chain_verified = on_chain_verified;
      response.tx_signature = tx_signature;
    } else {
      response.on_chain_verified = false;
      response.epoch = null;
      response.tx_signature = null;
    }
    
    return res.json(response);
  } catch (error) {
    console.error('Error in GET /v1/verify/:receipt_hash:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/receipts/:receipt_id/proof
 * Get Merkle inclusion proof for a receipt
 */
lucidLayerRouter.get('/v1/receipts/:receipt_id/proof', async (req, res) => {
  try {
    const { receipt_id } = req.params;
    
    // Get the receipt first to get run_id and receipt_hash
    const receipt = getReceipt(receipt_id);
    if (!receipt) {
      return res.status(404).json({ success: false, error: 'Receipt not found' });
    }
    
    const merkleProof = getReceiptProof(receipt_id);
    if (!merkleProof) {
      return res.status(404).json({ success: false, error: 'No proof available for this receipt' });
    }
    
    // Transform MerkleProof to ReceiptProof format expected by OpenAPI schema
    const proof = {
      run_id: receipt.run_id,
      receipt_hash: receipt.receipt_hash,
      leaf_index: merkleProof.leafIndex,
      proof: merkleProof.siblings,
      root: merkleProof.root,
      // Include directions for verification (not in OpenAPI but useful for clients)
      directions: merkleProof.directions,
    };
    
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

    // Map SDK config field names to backend expected names
    // SDK uses: compute_bp, model_bp, orchestrator_bp
    // Backend expects: compute_provider_bp, model_provider_bp, protocol_treasury_bp, orchestrator_bp
    let config = input.config;
    if (config) {
      config = {
        compute_provider_bp: config.compute_provider_bp ?? config.compute_bp ?? 7000,
        model_provider_bp: config.model_provider_bp ?? config.model_bp ?? 2000,
        protocol_treasury_bp: config.protocol_treasury_bp ?? 1000, // SDK doesn't send this, default to 10%
        orchestrator_bp: config.orchestrator_bp ?? 0,
      };
    }

    const payout = calculatePayoutSplit({
      run_id: input.run_id,
      total_amount_lamports: totalAmount,
      compute_wallet: input.compute_wallet,
      model_wallet: input.model_wallet,
      orchestrator_wallet: input.orchestrator_wallet,
      config,
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

// =============================================================================
// EXECUTION GATEWAY ENDPOINTS
// =============================================================================

/**
 * POST /v1/run/inference
 * Execute inference through the execution gateway
 * 
 * Body: {
 *   model_passport_id: string,
 *   prompt?: string,
 *   messages?: Array<{ role: string, content: string }>,
 *   max_tokens?: number,
 *   temperature?: number,
 *   top_p?: number,
 *   top_k?: number,
 *   stop?: string[],
 *   stream?: boolean,
 *   policy?: Policy,
 *   compute_catalog?: any[],
 *   compute_passport_id?: string,
 *   trace_id?: string,
 *   request_id?: string
 * }
 * 
 * Response (non-streaming): ExecutionResult
 * Response (streaming): SSE stream of tokens
 */
lucidLayerRouter.post('/v1/run/inference', async (req, res) => {
  try {
    const request = req.body as ExecutionRequest;

    // Validate required fields
    if (!request.model_passport_id && !request.model_meta) {
      return res.status(400).json({
        success: false,
        error: 'model_passport_id or model_meta is required',
      });
    }

    if (!request.prompt && !request.messages) {
      return res.status(400).json({
        success: false,
        error: 'prompt or messages is required',
      });
    }

    // Handle streaming response
    if (request.stream) {
      try {
        const streamResult = await executeStreamingInferenceRequest(request);
        
        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Run-ID', streamResult.run_id);
        res.setHeader('X-Model-Passport-ID', streamResult.model_passport_id);
        res.setHeader('X-Compute-Passport-ID', streamResult.compute_passport_id);
        res.flushHeaders();

        // Stream tokens
        for await (const chunk of streamResult.stream) {
          const data = JSON.stringify({
            run_id: streamResult.run_id,
            text: chunk.text,
            is_first: chunk.is_first,
            is_last: chunk.is_last,
            finish_reason: chunk.finish_reason,
          });
          res.write(`data: ${data}\n\n`);
        }

        // Finalize and get metrics
        const final = await streamResult.finalize();
        const doneData = JSON.stringify({
          run_id: streamResult.run_id,
          done: true,
          tokens_in: final.tokens_in,
          tokens_out: final.tokens_out,
          ttft_ms: final.ttft_ms,
          total_latency_ms: final.total_latency_ms,
          receipt_id: final.receipt_id,
        });
        res.write(`data: ${doneData}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (streamError) {
        const errorMsg = streamError instanceof Error ? streamError.message : 'Stream error';
        if (!res.headersSent) {
          return res.status(503).json({
            success: false,
            error: errorMsg,
            error_code: errorMsg === 'NO_COMPATIBLE_COMPUTE' ? 'NO_COMPATIBLE_COMPUTE' : 'STREAM_ERROR',
          });
        }
        // If headers already sent, send error in stream
        res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
        res.end();
      }
      return;
    }

    // Non-streaming response
    const result = await executeInferenceRequest(request);

    if (!result.success) {
      const statusCode = result.error_code === 'NO_COMPATIBLE_COMPUTE' ? 422 : 503;
      return res.status(statusCode).json({
        success: false,
        run_id: result.run_id,
        error: result.error,
        error_code: result.error_code,
        total_latency_ms: result.total_latency_ms,
      });
    }

    return res.json({
      success: true,
      run_id: result.run_id,
      request_id: result.request_id,
      trace_id: result.trace_id,
      text: result.text,
      finish_reason: result.finish_reason,
      tokens_in: result.tokens_in,
      tokens_out: result.tokens_out,
      ttft_ms: result.ttft_ms,
      total_latency_ms: result.total_latency_ms,
      model_passport_id: result.model_passport_id,
      compute_passport_id: result.compute_passport_id,
      runtime: result.runtime,
      policy_hash: result.policy_hash,
      receipt_id: result.receipt_id,
      used_fallback: result.used_fallback,
      fallback_reason: result.fallback_reason,
    });
  } catch (error) {
    console.error('Error in POST /v1/run/inference:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v1/chat/completions
 * OpenAI-compatible chat completions endpoint
 * 
 * Body: OpenAI ChatCompletionRequest format
 * - model: string (use "passport:<passport_id>" for LucidLayer models)
 * - messages: Array<{ role: string, content: string }>
 * - max_tokens?: number
 * - temperature?: number
 * - top_p?: number
 * - stop?: string | string[]
 * - stream?: boolean
 * 
 * LucidLayer extensions:
 * - policy?: Policy
 * - trace_id?: string
 * 
 * Response: OpenAI ChatCompletionResponse format with LucidLayer extensions
 */
lucidLayerRouter.post('/v1/chat/completions', async (req, res) => {
  try {
    const request = req.body as ChatCompletionRequest;

    // Validate required fields
    if (!request.model) {
      return res.status(400).json({
        error: {
          message: 'model is required',
          type: 'invalid_request_error',
          param: 'model',
          code: 'missing_required_parameter',
        },
      });
    }

    if (!request.messages || !Array.isArray(request.messages) || request.messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'messages is required and must be a non-empty array',
          type: 'invalid_request_error',
          param: 'messages',
          code: 'missing_required_parameter',
        },
      });
    }

    // Handle streaming response
    if (request.stream) {
      // Parse model to get passport ID
      let model_passport_id: string | undefined;
      if (request.model.startsWith('passport:')) {
        model_passport_id = request.model.slice(9);
      }

      // Build execution request
      const execRequest: ExecutionRequest = {
        model_passport_id,
        messages: request.messages,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        stop: Array.isArray(request.stop) ? request.stop : request.stop ? [request.stop] : undefined,
        stream: true,
        policy: request.policy,
        trace_id: request.trace_id,
      };

      try {
        const streamResult = await executeStreamingInferenceRequest(execRequest);

        // Set up SSE headers for OpenAI-compatible streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        let chunkIndex = 0;
        for await (const chunk of streamResult.stream) {
          const sseChunk = {
            id: streamResult.run_id,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: request.model,
            choices: [{
              index: 0,
              delta: chunkIndex === 0 
                ? { role: 'assistant', content: chunk.text }
                : { content: chunk.text },
              finish_reason: chunk.finish_reason || null,
            }],
          };
          res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
          chunkIndex++;
        }

        res.write('data: [DONE]\n\n');
        res.end();

        // Finalize asynchronously (receipt creation)
        streamResult.finalize().catch(console.error);
      } catch (streamError) {
        const errorMsg = streamError instanceof Error ? streamError.message : 'Stream error';
        if (!res.headersSent) {
          return res.status(503).json({
            error: {
              message: errorMsg,
              type: 'server_error',
              code: errorMsg === 'NO_COMPATIBLE_COMPUTE' ? 'no_compatible_compute' : 'stream_error',
            },
          });
        }
        res.end();
      }
      return;
    }

    // Non-streaming response
    const response = await executeChatCompletion(request);

    return res.json(response);
  } catch (error) {
    console.error('Error in POST /v1/chat/completions:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      error: {
        message: errorMsg,
        type: 'server_error',
        code: 'internal_error',
      },
    });
  }
});

// =============================================================================
// EPOCH MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * GET /v1/epochs/current
 * Get the current active epoch
 */
lucidLayerRouter.get('/v1/epochs/current', async (req, res) => {
  try {
    const project_id = req.query.project_id as string | undefined;
    const epoch = getCurrentEpoch(project_id);
    
    return res.json({
      success: true,
      epoch: {
        epoch_id: epoch.epoch_id,
        project_id: epoch.project_id,
        mmr_root: epoch.mmr_root,
        leaf_count: epoch.leaf_count,
        created_at: epoch.created_at,
        status: epoch.status,
      },
    });
  } catch (error) {
    console.error('Error in GET /v1/epochs/current:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/epochs/stats
 * Get epoch statistics
 * NOTE: Must be registered BEFORE /v1/epochs/:epoch_id to avoid "stats" being matched as epoch_id
 */
lucidLayerRouter.get('/v1/epochs/stats', async (_req, res) => {
  try {
    const stats = getEpochStats();
    return res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Error in GET /v1/epochs/stats:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/epochs/ready
 * Get epochs that are ready for finalization
 * NOTE: Must be registered BEFORE /v1/epochs/:epoch_id to avoid "ready" being matched as epoch_id
 */
lucidLayerRouter.get('/v1/epochs/ready', async (_req, res) => {
  try {
    const epochs = getEpochsReadyForFinalization();

    return res.json({
      success: true,
      count: epochs.length,
      epochs: epochs.map(e => ({
        epoch_id: e.epoch_id,
        project_id: e.project_id,
        leaf_count: e.leaf_count,
        created_at: e.created_at,
        mmr_root: e.mmr_root,
      })),
    });
  } catch (error) {
    console.error('Error in GET /v1/epochs/ready:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/epochs/:epoch_id
 * Get a specific epoch by ID
 */
lucidLayerRouter.get('/v1/epochs/:epoch_id', async (req, res) => {
  try {
    const { epoch_id } = req.params;
    const epoch = getEpoch(epoch_id);
    
    if (!epoch) {
      return res.status(404).json({
        success: false,
        error: 'Epoch not found',
      });
    }

    return res.json({
      success: true,
      epoch: {
        epoch_id: epoch.epoch_id,
        project_id: epoch.project_id,
        mmr_root: epoch.mmr_root,
        leaf_count: epoch.leaf_count,
        created_at: epoch.created_at,
        finalized_at: epoch.finalized_at,
        status: epoch.status,
        chain_tx: epoch.chain_tx,
        error: epoch.error,
        start_leaf_index: epoch.start_leaf_index,
        end_leaf_index: epoch.end_leaf_index,
      },
    });
  } catch (error) {
    console.error('Error in GET /v1/epochs/:epoch_id:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/epochs
 * List epochs with optional filtering
 */
lucidLayerRouter.get('/v1/epochs', async (req, res) => {
  try {
    const {
      project_id,
      status,
      page,
      per_page,
    } = req.query;

    const result = listEpochs({
      project_id: project_id as string | undefined,
      status: status as EpochStatus | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      per_page: per_page ? parseInt(per_page as string, 10) : undefined,
    });

    return res.json({
      success: true,
      epochs: result.epochs,
      pagination: {
        total: result.total,
        page: result.page,
        per_page: result.per_page,
        total_pages: result.total_pages,
      },
    });
  } catch (error) {
    console.error('Error in GET /v1/epochs:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v1/epochs
 * Create a new epoch (optional - epochs are created automatically)
 */
lucidLayerRouter.post('/v1/epochs', async (req, res) => {
  try {
    const { project_id } = req.body || {};
    const epoch = createEpoch(project_id);
    
    return res.status(201).json({
      success: true,
      epoch: {
        epoch_id: epoch.epoch_id,
        project_id: epoch.project_id,
        mmr_root: epoch.mmr_root,
        leaf_count: epoch.leaf_count,
        created_at: epoch.created_at,
        status: epoch.status,
      },
    });
  } catch (error) {
    console.error('Error in POST /v1/epochs:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v1/epochs/:epoch_id/retry
 * Retry a failed epoch
 */
lucidLayerRouter.post('/v1/epochs/:epoch_id/retry', async (req, res) => {
  try {
    const { epoch_id } = req.params;
    const epoch = retryEpoch(epoch_id);
    
    if (!epoch) {
      return res.status(400).json({
        success: false,
        error: 'Epoch not found or not in failed state',
      });
    }

    return res.json({
      success: true,
      epoch: {
        epoch_id: epoch.epoch_id,
        status: epoch.status,
      },
    });
  } catch (error) {
    console.error('Error in POST /v1/epochs/:epoch_id/retry:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// RECEIPT ANCHORING ENDPOINTS
// =============================================================================

/**
 * POST /v1/receipts/commit-root
 * Commit the current epoch's MMR root to the blockchain
 * 
 * Body: {
 *   project_id?: string,
 *   epoch_id?: string,  // If specified, commits this specific epoch
 *   force?: boolean     // Force commit even if thresholds not met
 * }
 */
lucidLayerRouter.post('/v1/receipts/commit-root', async (req, res) => {
  try {
    const { project_id, epoch_id, force } = req.body || {};

    // If specific epoch_id provided, commit that epoch
    if (epoch_id) {
      const result = await commitEpochRoot(epoch_id);
      
      if (!result.success) {
        return res.status(503).json({
          success: false,
          error: result.error,
          epoch_id: result.epoch_id,
          root: result.root,
        });
      }

      return res.status(202).json({
        success: true,
        epoch_id: result.epoch_id,
        root: result.root,
        tx: result.signature,
      });
    }

    // Otherwise, get current epoch and commit if ready (or forced)
    const currentEpoch = getCurrentEpoch(project_id);
    
    if (!force) {
      // Check if epoch should be finalized
      const readyEpochs = getEpochsReadyForFinalization();
      const isReady = readyEpochs.some(e => e.epoch_id === currentEpoch.epoch_id);
      
      if (!isReady && currentEpoch.leaf_count === 0) {
        return res.status(400).json({
          success: false,
          error: 'Current epoch is empty',
          epoch_id: currentEpoch.epoch_id,
          leaf_count: currentEpoch.leaf_count,
        });
      }
    }

    const result = await commitEpochRoot(currentEpoch.epoch_id);
    
    if (!result.success) {
      return res.status(503).json({
        success: false,
        error: result.error,
        epoch_id: result.epoch_id,
        root: result.root,
      });
    }

    return res.status(202).json({
      success: true,
      epoch_id: result.epoch_id,
      root: result.root,
      tx: result.signature,
      leaf_count: currentEpoch.leaf_count,
    });
  } catch (error) {
    console.error('Error in POST /v1/receipts/commit-root:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v1/receipts/commit-roots-batch
 * Commit multiple epoch roots in a single transaction
 * 
 * Body: {
 *   epoch_ids: string[]
 * }
 */
lucidLayerRouter.post('/v1/receipts/commit-roots-batch', async (req, res) => {
  try {
    const { epoch_ids } = req.body || {};

    if (!epoch_ids || !Array.isArray(epoch_ids) || epoch_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'epoch_ids array is required',
      });
    }

    if (epoch_ids.length > 16) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 16 epochs per batch',
      });
    }

    const results = await commitEpochRootsBatch(epoch_ids);
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    return res.status(202).json({
      success: failed.length === 0,
      total: results.length,
      successful_count: successful.length,
      failed_count: failed.length,
      results,
    });
  } catch (error) {
    console.error('Error in POST /v1/receipts/commit-roots-batch:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/epochs/:epoch_id/verify
 * Verify that an epoch's root is anchored on-chain
 */
lucidLayerRouter.get('/v1/epochs/:epoch_id/verify', async (req, res) => {
  try {
    const { epoch_id } = req.params;
    const result = await verifyEpochAnchor(epoch_id);

    return res.json({
      success: true,
      valid: result.valid,
      on_chain_root: result.on_chain_root,
      expected_root: result.expected_root,
      tx_signature: result.tx_signature,
      error: result.error,
    });
  } catch (error) {
    console.error('Error in GET /v1/epochs/:epoch_id/verify:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/epochs/:epoch_id/transaction
 * Get the blockchain transaction details for an anchored epoch
 */
lucidLayerRouter.get('/v1/epochs/:epoch_id/transaction', async (req, res) => {
  try {
    const { epoch_id } = req.params;
    const result = await getAnchorTransaction(epoch_id);

    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: result.error || 'Transaction not found',
      });
    }

    return res.json({
      success: true,
      tx_signature: result.tx_signature,
      slot: result.slot,
      block_time: result.block_time,
    });
  } catch (error) {
    console.error('Error in GET /v1/epochs/:epoch_id/transaction:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/anchoring/health
 * Check the health of the anchoring service
 */
lucidLayerRouter.get('/v1/anchoring/health', async (_req, res) => {
  try {
    const health = await checkAnchoringHealth();

    const statusCode = health.connected ? 200 : 503;
    return res.status(statusCode).json({
      success: health.connected,
      ...health,
    });
  } catch (error) {
    console.error('Error in GET /v1/anchoring/health:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// V2 API ENDPOINTS — EVM Multi-Chain + ERC-8004 Integration
// =============================================================================

/**
 * GET /v2/chains
 * List all supported chains and their connection status.
 */
lucidLayerRouter.get('/v2/chains', async (_req, res) => {
  try {
    const chains = blockchainAdapterFactory.listChains();

    // Include all configured chains (even those without registered adapters)
    const allChains = Object.values(CHAIN_CONFIGS).map((config) => {
      const registered = chains.find((c) => c.chainId === config.chainId);
      return {
        chain_id: config.chainId,
        name: config.name,
        chain_type: config.chainType,
        evm_chain_id: config.evmChainId || null,
        is_testnet: config.isTestnet,
        explorer_url: config.explorerUrl || null,
        connected: registered?.connected || false,
        erc8004: config.erc8004 || {},
      };
    });

    return res.json({
      success: true,
      count: allChains.length,
      chains: allChains,
    });
  } catch (error) {
    console.error('Error in GET /v2/chains:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v2/chains/:chainId/status
 * Get detailed status for a specific chain.
 */
lucidLayerRouter.get('/v2/chains/:chainId/status', async (req, res) => {
  try {
    const { chainId } = req.params;
    const config = CHAIN_CONFIGS[chainId];

    if (!config) {
      return res.status(404).json({
        success: false,
        error: `Unknown chain: ${chainId}`,
      });
    }

    const adapter = blockchainAdapterFactory.get(chainId);
    let account: string | null = null;

    if (adapter?.isConnected()) {
      try {
        const acc = await adapter.getAccount();
        account = acc.address;
      } catch {
        // No wallet configured
      }
    }

    return res.json({
      success: true,
      chain: {
        chain_id: config.chainId,
        name: config.name,
        chain_type: config.chainType,
        evm_chain_id: config.evmChainId || null,
        is_testnet: config.isTestnet,
        rpc_url: config.rpcUrl,
        explorer_url: config.explorerUrl || null,
        connected: adapter?.isConnected() || false,
        account,
        erc8004: config.erc8004 || {},
      },
    });
  } catch (error) {
    console.error('Error in GET /v2/chains/:chainId/status:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v2/validate
 * Validate a receipt, optionally submit validation on-chain via ERC-8004.
 *
 * Body: {
 *   receipt_hash: string,       // Required
 *   signature?: string,         // ed25519 signature hex
 *   chain_id?: string,          // If provided, submit validation on-chain
 *   agent_token_id?: string,    // Required if chain_id provided
 * }
 */
lucidLayerRouter.post('/v2/validate', async (req, res) => {
  try {
    const { receipt_hash, run_id, signature, chain_id, agent_token_id } = req.body || {};

    if (!receipt_hash && !run_id) {
      return res.status(400).json({
        success: false,
        error: 'receipt_hash or run_id is required',
      });
    }

    // Step 1: Verify receipt locally using existing receipt system
    // verifyReceiptHash takes a run_id, verifyReceipt does full verification
    let receiptResult: { hash_valid: boolean; signature_valid: boolean } = {
      hash_valid: false,
      signature_valid: false,
    };

    if (run_id) {
      receiptResult = verifyReceipt(run_id);
    }

    const hashToSubmit = receipt_hash || '';
    const localValid = receiptResult.hash_valid && receiptResult.signature_valid;

    const response: Record<string, unknown> = {
      success: true,
      receipt_hash: hashToSubmit,
      run_id: run_id || null,
      local_valid: localValid,
      hash_valid: receiptResult.hash_valid,
      signature_valid: receiptResult.signature_valid,
    };

    // Step 2: If chain_id provided, submit validation on-chain
    if (chain_id && agent_token_id && hashToSubmit) {
      try {
        const adapter = await blockchainAdapterFactory.getAdapter(chain_id);
        const txReceipt = await adapter.submitValidation({
          agentTokenId: agent_token_id,
          receiptHash: hashToSubmit.startsWith('0x') ? hashToSubmit : `0x${hashToSubmit}`,
          valid: localValid,
        });

        response.on_chain = {
          chain_id,
          tx_hash: txReceipt.hash,
          success: txReceipt.success,
          block_number: txReceipt.blockNumber,
        };
      } catch (chainError) {
        response.on_chain = {
          chain_id,
          error: chainError instanceof Error ? chainError.message : 'Chain submission failed',
        };
      }
    }

    return res.json(response);
  } catch (error) {
    console.error('Error in POST /v2/validate:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v2/route
 * Route with chain_id parameter. Same as /v1/route but chain-aware.
 *
 * Body: same as /v1/route + { chain_id?: string }
 */
lucidLayerRouter.post('/v2/route', async (req, res) => {
  try {
    const { model_meta, policy, compute_catalog, request_id, require_live_healthy, chain_id } = req.body || {};

    // Compute matching is chain-agnostic (reuse matchingEngine)
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
        chain_id,
        explain,
      });
    }

    const selectedCompute = (compute_catalog || []).find(
      (c: any) => c && c.compute_passport_id === match.compute_passport_id
    );
    const endpoint = selectedCompute?.endpoints?.inference_url;
    if (!endpoint) {
      return res.status(422).json({
        success: false,
        error: 'SELECTED_COMPUTE_MISSING_ENDPOINT',
        request_id,
        chain_id,
        explain,
      });
    }

    const response: Record<string, unknown> = {
      success: true,
      request_id,
      chain_id: chain_id || null,
      route: {
        compute_passport_id: match.compute_passport_id,
        model_passport_id: match.model_passport_id,
        endpoint,
        runtime: match.selected_runtime,
        policy_hash: explain.policy_hash,
        fallbacks: match.fallbacks,
      },
      explain,
    };

    // If chain_id is an EVM chain, include chain-specific info
    if (chain_id && CHAIN_CONFIGS[chain_id]) {
      const chainConfig = CHAIN_CONFIGS[chain_id];
      response.chain = {
        chain_id: chainConfig.chainId,
        name: chainConfig.name,
        chain_type: chainConfig.chainType,
        erc8004: chainConfig.erc8004 || {},
      };
    }

    return res.json(response);
  } catch (error) {
    console.error('Error in POST /v2/route:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v2/agents/register
 * Register an agent on the ERC-8004 Identity Registry.
 *
 * Body: {
 *   chain_id: string,
 *   name: string,
 *   description: string,
 *   metadata_uri: string,
 *   capabilities?: string[],
 *   wallets?: Record<string, string>,
 * }
 */
lucidLayerRouter.post('/v2/agents/register', async (req, res) => {
  try {
    const { chain_id, name, description, metadata_uri, endpoints, capabilities, wallets } = req.body || {};

    if (!chain_id || !metadata_uri) {
      return res.status(400).json({
        success: false,
        error: 'chain_id and metadata_uri are required',
      });
    }

    const adapter = await blockchainAdapterFactory.getAdapter(chain_id);
    const txReceipt = await adapter.registerAgent({
      name: name || 'Lucid Agent',
      description: description || '',
      endpoints: endpoints || [],
      capabilities: capabilities || [],
      wallets,
      tokenURI: metadata_uri,
    });

    return res.status(201).json({
      success: true,
      chain_id,
      tx_hash: txReceipt.hash,
      confirmed: txReceipt.success,
      block_number: txReceipt.blockNumber,
    });
  } catch (error) {
    console.error('Error in POST /v2/agents/register:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v2/agents/:agentId/reputation
 * Cross-chain reputation query. Queries reputation from one or all chains.
 *
 * Query params: chain_id (optional — if omitted, queries all connected chains)
 */
lucidLayerRouter.get('/v2/agents/:agentId/reputation', async (req, res) => {
  try {
    const { agentId } = req.params;
    const chain_id = req.query.chain_id as string | undefined;

    const results: Array<{ chain_id: string; reputation: any }> = [];

    if (chain_id) {
      // Query specific chain
      const adapter = await blockchainAdapterFactory.getAdapter(chain_id);
      const reputation = await adapter.readReputation(agentId);
      results.push({ chain_id, reputation });
    } else {
      // Query all connected EVM chains
      const chains = blockchainAdapterFactory.listChains();
      for (const chain of chains) {
        if (!chain.connected) continue;
        try {
          const adapter = blockchainAdapterFactory.get(chain.chainId);
          if (!adapter) continue;
          const reputation = await adapter.readReputation(agentId);
          results.push({ chain_id: chain.chainId, reputation });
        } catch {
          // Skip chains that fail
        }
      }
    }

    return res.json({
      success: true,
      agent_id: agentId,
      chains_queried: results.length,
      results,
    });
  } catch (error) {
    console.error('Error in GET /v2/agents/:agentId/reputation:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
