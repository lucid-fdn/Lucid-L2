import { Router } from 'express';
import { createReceipt, getReceipt, verifyReceiptHash, verifyReceipt, getReceiptProof, getMmrRoot, getMmrLeafCount, getSignerPublicKey, listReceipts, listExtendedReceipts, getExtendedReceipt, verifyExtendedReceipt } from '../../../../engine/src/receipt/receiptService';
import { getAllEpochs, addReceiptToEpoch } from '../../../../engine/src/receipt/epochService';

export const receiptRouter = Router();

/**
 * POST /v1/receipts
 * Create a new run receipt
 */
receiptRouter.post('/v1/receipts', async (req, res) => {
  try {
    const input = req.body || {};
    const required = ['model_passport_id', 'compute_passport_id', 'policy_hash', 'runtime', 'tokens_in', 'tokens_out', 'ttft_ms'];
    for (const k of required) {
      if (input[k] === undefined || input[k] === null) {
        return res.status(400).json({ success: false, error: `Missing required field: ${k}` });
      }
    }

    const receipt = createReceipt(input);
    addReceiptToEpoch(receipt.run_id);
    return res.json({ success: true, receipt });
  } catch (error) {
    console.error('Error in POST /v1/receipts:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /v1/receipts/:receipt_id
 */
receiptRouter.get('/v1/receipts/:receipt_id', async (req, res) => {
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
receiptRouter.get('/v1/receipts/:receipt_id/verify', async (req, res) => {
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
receiptRouter.get('/v1/verify/:receipt_hash', async (req, res) => {
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
receiptRouter.get('/v1/receipts/:receipt_id/proof', async (req, res) => {
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

    // Transform MerkleProof to ReceiptProof format (matches openapi.yaml ReceiptProof schema)
    const proof = {
      run_id: receipt.run_id,
      receipt_hash: receipt.receipt_hash,
      leaf: merkleProof.leaf,
      leaf_index: merkleProof.leafIndex,
      proof: merkleProof.siblings,
      root: merkleProof.root,
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
receiptRouter.get('/v1/signer/pubkey', async (_req, res) => {
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
receiptRouter.get('/v1/mmr/root', async (_req, res) => {
  try {
    const root = getMmrRoot();
    const leaf_count = getMmrLeafCount();
    return res.json({ success: true, root, leaf_count });
  } catch (error) {
    console.error('Error in GET /v1/mmr/root:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
