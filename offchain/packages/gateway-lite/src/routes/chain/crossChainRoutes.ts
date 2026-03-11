import { Router } from 'express';
import { matchComputeForModel } from '../../compute/matchingEngine';
import { verifyInferenceReceipt } from '../../../../engine/src/receipt/receiptService';
import { executePayoutSplit, getPayoutExecution } from '../../../../engine/src/finance/payoutService';
import { blockchainAdapterFactory } from '../../../../engine/src/chain/blockchain/BlockchainAdapterFactory';
import { CHAIN_CONFIGS } from '../../../../engine/src/chain/blockchain/chains';
import { getReputationAggregator } from '../../reputation/reputationAggregator';
import { getReceiptReputation, submitReceiptReputation } from '../../reputation/receiptReputationService';
import { getReputationProvider } from '../../../../engine/src/reputation';

export const crossChainRouter = Router();

// =============================================================================
// V2 API ENDPOINTS — EVM Multi-Chain + ERC-8004 Integration
// =============================================================================

/**
 * GET /v2/chains
 * List all supported chains and their connection status.
 */
crossChainRouter.get('/v2/chains', async (_req, res) => {
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
crossChainRouter.get('/v2/chains/:chainId/status', async (req, res) => {
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
crossChainRouter.post('/v2/validate', async (req, res) => {
  try {
    const { receipt_hash, run_id, signature, chain_id, agent_token_id } = req.body || {};

    if (!receipt_hash && !run_id) {
      return res.status(400).json({
        success: false,
        error: 'receipt_hash or run_id is required',
      });
    }

    // Step 1: Verify receipt locally using existing receipt system
    // verifyInferenceReceiptHash takes a run_id, verifyInferenceReceipt does full verification
    let receiptResult: { hash_valid: boolean; signature_valid: boolean } = {
      hash_valid: false,
      signature_valid: false,
    };

    if (run_id) {
      receiptResult = verifyInferenceReceipt(run_id);
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
        const reputationProvider = getReputationProvider();
        const txReceipt = await reputationProvider.submitValidation({
          passportId: agent_token_id,
          receiptHash: hashToSubmit.startsWith('0x') ? hashToSubmit.slice(2) : hashToSubmit,
          valid: localValid,
          assetType: 'agent',
          metadata: `chain:${chain_id}`,
        });

        response.on_chain = {
          chain_id,
          tx_hash: txReceipt.txHash || txReceipt.id,
          success: txReceipt.success,
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
crossChainRouter.post('/v2/route', async (req, res) => {
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

    const m2 = match as any;
    const response: Record<string, unknown> = {
      success: true,
      request_id,
      chain_id: chain_id || null,
      route: {
        compute_passport_id: m2.compute_passport_id,
        model_passport_id: m2.model_passport_id,
        endpoint,
        runtime: m2.selected_runtime,
        policy_hash: explain.policy_hash,
        fallbacks: m2.fallbacks,
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
crossChainRouter.post('/v2/agents/register', async (req, res) => {
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
crossChainRouter.get('/v2/agents/:agentId/reputation', async (req, res) => {
  try {
    const { agentId } = req.params;
    const chain_id = req.query.chain_id as string | undefined;

    const results: Array<{ chain_id: string; reputation: any }> = [];

    // Query reputation from the unified reputation provider
    const reputationProvider = getReputationProvider();
    const feedback = await reputationProvider.readFeedback(agentId);
    const summary = await reputationProvider.getSummary(agentId);
    results.push({
      chain_id: chain_id || 'all',
      reputation: { feedback, summary },
    });

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

// =============================================================================
// V2 Phase 1 Endpoints
// =============================================================================

/**
 * GET /v2/reputation/:agentId
 *
 * Unified cross-chain reputation score for an agent.
 * Aggregates on-chain reputation data from all indexed ERC-8004 chains.
 */
crossChainRouter.get('/v2/reputation/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;

    const aggregator = getReputationAggregator();
    const unified = await aggregator.getUnifiedScore(agentId);

    if (!unified) {
      return res.json({
        success: true,
        agentId,
        unifiedScore: 0,
        totalFeedbackCount: 0,
        chainCount: 0,
        message: 'No reputation data found. The agent may not have received feedback yet, or indexing may still be in progress.',
      });
    }

    return res.json({
      success: true,
      ...unified,
    });
  } catch (error) {
    console.error('Error in GET /v2/reputation/:agentId:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v2/reputation/:agentId/breakdown
 *
 * Per-chain reputation breakdown with individual feedback records.
 */
crossChainRouter.get('/v2/reputation/:agentId/breakdown', async (req, res) => {
  try {
    const { agentId } = req.params;

    const aggregator = getReputationAggregator();
    const chains = aggregator.getCrossChainReputation(agentId);

    return res.json({
      success: true,
      agentId,
      chainCount: chains.length,
      chains,
    });
  } catch (error) {
    console.error('Error in GET /v2/reputation/:agentId/breakdown:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v2/reputation/:agentId/receipt-based
 *
 * Receipt-derived reputation score (Sybil-resistant).
 * Computes reputation from verified receipts rather than subjective votes.
 */
crossChainRouter.get('/v2/reputation/:agentId/receipt-based', async (req, res) => {
  try {
    const { agentId } = req.params;

    const score = getReceiptReputation(agentId);

    return res.json({
      success: true,
      ...score,
    });
  } catch (error) {
    console.error('Error in GET /v2/reputation/:agentId/receipt-based:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v2/reputation/:agentId/submit
 *
 * Submit receipt-based reputation to on-chain Reputation Registry.
 * Body: { chainId: string }
 */
crossChainRouter.post('/v2/reputation/:agentId/submit', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { chainId } = req.body || {};

    if (!chainId) {
      return res.status(400).json({ success: false, error: 'chainId is required' });
    }

    const result = await submitReceiptReputation(chainId, agentId);

    return res.json({
      success: result.success,
      txHash: result.txHash,
      score: result.score,
      error: result.error,
    });
  } catch (error) {
    console.error('Error in POST /v2/reputation/:agentId/submit:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v2/reputation/indexer/status
 *
 * Status of the cross-chain reputation indexer.
 */
crossChainRouter.get('/v2/reputation/indexer/status', async (_req, res) => {
  try {
    const aggregator = getReputationAggregator();
    const status = aggregator.getIndexerStatus();

    return res.json({
      success: true,
      chains: status,
    });
  } catch (error) {
    console.error('Error in GET /v2/reputation/indexer/status:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v2/payouts/execute
 *
 * Execute a payout split on-chain via USDC transfers.
 * Body: { run_id: string, chainId: string }
 */
crossChainRouter.post('/v2/payouts/execute', async (req, res) => {
  try {
    const { run_id, chainId } = req.body || {};

    if (!run_id) {
      return res.status(400).json({ success: false, error: 'run_id is required' });
    }
    if (!chainId) {
      return res.status(400).json({ success: false, error: 'chainId is required' });
    }

    const execution = await executePayoutSplit(run_id, chainId);
    const allSucceeded = execution.transfers.every(t => t.success);

    return res.json({
      success: allSucceeded,
      execution,
    });
  } catch (error) {
    console.error('Error in POST /v2/payouts/execute:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v2/payouts/:runId/execution
 *
 * Get payout execution status.
 * Query: ?chainId=...
 */
crossChainRouter.get('/v2/payouts/:runId/execution', async (req, res) => {
  try {
    const { runId } = req.params;
    const chainId = req.query.chainId as string;

    if (!chainId) {
      return res.status(400).json({ success: false, error: 'chainId query parameter is required' });
    }

    const execution = await getPayoutExecution(runId, chainId);
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'No execution found for this run_id and chainId',
      });
    }

    return res.json({
      success: true,
      execution,
    });
  } catch (error) {
    console.error('Error in GET /v2/payouts/:runId/execution:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
