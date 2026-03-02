import { Router } from 'express';
import {
  createEpoch,
  getCurrentEpoch,
  getEpoch,
  listEpochs,
  getEpochsReadyForFinalization,
  getEpochStats,
  retryEpoch,
  EpochStatus,
} from '../../../engine/src/receipt/epochService';
import {
  commitEpochRoot,
  commitEpochRootsBatch,
  verifyEpochAnchor,
  getAnchorTransaction,
  checkAnchoringHealth,
} from '../../../engine/src/receipt/anchoringService';

export const epochRouter = Router();

// =============================================================================
// EPOCH MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * GET /v1/epochs/current
 * Get the current active epoch
 */
epochRouter.get('/v1/epochs/current', async (req, res) => {
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
epochRouter.get('/v1/epochs/stats', async (_req, res) => {
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
epochRouter.get('/v1/epochs/ready', async (_req, res) => {
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
epochRouter.get('/v1/epochs/:epoch_id', async (req, res) => {
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
epochRouter.get('/v1/epochs', async (req, res) => {
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
epochRouter.post('/v1/epochs', async (req, res) => {
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
epochRouter.post('/v1/epochs/:epoch_id/retry', async (req, res) => {
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
epochRouter.post('/v1/receipts/commit-root', async (req, res) => {
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
epochRouter.post('/v1/receipts/commit-roots-batch', async (req, res) => {
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
epochRouter.get('/v1/epochs/:epoch_id/verify', async (req, res) => {
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
epochRouter.get('/v1/epochs/:epoch_id/transaction', async (req, res) => {
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
epochRouter.get('/v1/anchoring/health', async (_req, res) => {
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
