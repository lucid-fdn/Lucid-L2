/**
 * zkML Routes
 *
 * REST API for zero-knowledge ML proof operations.
 */

import { Router } from 'express';
import { getZkMLService } from '../../integrations/zkml/zkmlService';

export const zkmlRouter = Router();

/**
 * POST /v2/zkml/prove
 * Generate a zkML proof for a model inference.
 */
zkmlRouter.post('/v2/zkml/prove', async (req, res) => {
  try {
    const { modelId, inputHash, outputHash, policyHash } = req.body;

    if (!modelId || !inputHash || !outputHash || !policyHash) {
      res.status(400).json({
        success: false,
        error: 'modelId, inputHash, outputHash, and policyHash are required',
      });
      return;
    }

    const service = getZkMLService();
    const proof = service.generateProof({ modelId, inputHash, outputHash, policyHash });

    res.json({ success: true, proof });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate proof',
    });
  }
});

/**
 * POST /v2/zkml/verify
 * Verify a zkML proof on-chain.
 */
zkmlRouter.post('/v2/zkml/verify', async (req, res) => {
  try {
    const { chainId, proof, receiptHash } = req.body;

    if (!chainId || !proof || !receiptHash) {
      res.status(400).json({
        success: false,
        error: 'chainId, proof, and receiptHash are required',
      });
      return;
    }

    const service = getZkMLService();

    // First verify off-chain structure
    const offchainResult = service.verifyProofOffchain(proof);
    if (!offchainResult.valid) {
      res.json({
        success: true,
        valid: false,
        error: offchainResult.error,
        stage: 'offchain',
      });
      return;
    }

    // Then verify on-chain
    const result = await service.verifyProofOnchain(chainId, proof, receiptHash);

    res.json({ success: true, ...result, stage: 'onchain' });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify proof',
    });
  }
});

/**
 * POST /v2/zkml/register-model
 * Register a model circuit's verifying key on-chain.
 */
zkmlRouter.post('/v2/zkml/register-model', async (req, res) => {
  try {
    const { chainId, modelHash, verifyingKey } = req.body;

    if (!chainId || !modelHash || !verifyingKey) {
      res.status(400).json({
        success: false,
        error: 'chainId, modelHash, and verifyingKey are required',
      });
      return;
    }

    const service = getZkMLService();
    const result = await service.registerModelCircuit(chainId, modelHash, verifyingKey);

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to register model',
    });
  }
});

/**
 * GET /v2/zkml/models/:chainId
 * List registered model circuits.
 */
zkmlRouter.get('/v2/zkml/models/:chainId', async (_req, res) => {
  try {
    const service = getZkMLService();
    const models = service.listRegisteredModels();

    res.json({ success: true, models });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list models',
    });
  }
});
