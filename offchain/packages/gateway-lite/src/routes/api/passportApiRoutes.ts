import express from 'express';

export const passportApiRouter = express.Router();

// ============================================================================
// PASSPORT API ENDPOINTS
// ============================================================================

/**
 * Register a new passport manually
 * POST /register
 */
async function handlePassportRegister(req: express.Request, res: express.Response) {
  try {
    const { getPassportService } = await import('../../../../engine/src/passport/passportService');
    const { getContentService } = await import('../../inference/contentService');

    const passportService = getPassportService();
    const contentService = getContentService();

    const {
      assetType,
      slug,
      version,
      contentCid,
      metadataCid,
      licenseCode,
      policyFlags
    } = req.body;

    // Validate required fields
    if (!assetType || !slug || !version) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: assetType, slug, version'
      });
    }

    // Compute content hash if not provided
    const contentHash = contentCid
      ? contentService.computeContentHash(contentCid)
      : Buffer.alloc(32);

    const result = await passportService.registerPassport({
      assetType,
      slug,
      version,
      contentCid: contentCid || 'QmPending',
      contentHash,
      metadataCid: metadataCid || 'QmPending',
      licenseCode: licenseCode || 'Unknown',
      policyFlags: policyFlags || 0,
    });

    res.json({
      success: true,
      passport: result.passportPDA.toBase58(),
      signature: result.signature,
      message: `Passport registered for ${slug} v${version.major}.${version.minor}.${version.patch}`
    });
  } catch (error) {
    console.error('Error in handlePassportRegister:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get passport details
 * GET /:passportId
 */
async function handlePassportGet(req: express.Request, res: express.Response) {
  try {
    const { getPassportService } = await import('../../../../engine/src/passport/passportService');
    const { PublicKey } = await import('@solana/web3.js');

    const passportService = getPassportService();
    const { passportId } = req.params;

    const passportPDA = new PublicKey(passportId);
    const passport = await passportService.fetchPassport(passportPDA);

    if (!passport) {
      return res.status(404).json({
        success: false,
        error: 'Passport not found'
      });
    }

    res.json({
      success: true,
      passport: {
        address: passportId,
        owner: passport.owner.toBase58(),
        assetType: passport.assetType,
        slug: passport.slug,
        version: passport.version,
        contentCid: passport.contentCid,
        metadataCid: passport.metadataCid,
        licenseCode: passport.licenseCode,
        status: passport.status,
        createdAt: passport.createdAt.toString(),
        updatedAt: passport.updatedAt.toString(),
      }
    });
  } catch (error) {
    console.error('Error in handlePassportGet:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get all passports for an owner
 * GET /owner/:owner
 */
async function handlePassportsByOwner(req: express.Request, res: express.Response) {
  try {
    const { getPassportService } = await import('../../../../engine/src/passport/passportService');
    const { PublicKey } = await import('@solana/web3.js');

    const passportService = getPassportService();
    const { owner } = req.params;

    const ownerPubkey = new PublicKey(owner);
    const passports = await passportService.fetchPassportsByOwner(ownerPubkey);

    res.json({
      success: true,
      owner,
      count: passports.length,
      passports: passports.map(p => ({
        address: p.pubkey.toBase58(),
        slug: p.data.slug,
        assetType: p.data.assetType,
        version: p.data.version,
        status: p.data.status,
      }))
    });
  } catch (error) {
    console.error('Error in handlePassportsByOwner:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Sync HuggingFace models to blockchain
 * POST /sync-hf-models
 */
async function handleSyncHFModels(req: express.Request, res: express.Response) {
  try {
    const { getHFBridgeService } = await import('../../../../contrib/integrations/hf/hfBridgeService');

    const { limit = 5, hfToken } = req.body;

    console.log(`🔄 Starting HF model sync, limit: ${limit}`);

    const hfBridge = getHFBridgeService(hfToken);
    const results = await hfBridge.syncModels(limit);

    res.json({
      success: true,
      synced: results.length,
      total: limit,
      models: results,
      message: `Successfully synced ${results.length} models to blockchain`
    });
  } catch (error) {
    console.error('Error in handleSyncHFModels:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Sync HuggingFace datasets to blockchain
 * POST /sync-hf-datasets
 */
async function handleSyncHFDatasets(req: express.Request, res: express.Response) {
  try {
    const { getHFBridgeService } = await import('../../../../contrib/integrations/hf/hfBridgeService');

    const { limit = 5, hfToken } = req.body;

    console.log(`🔄 Starting HF dataset sync, limit: ${limit}`);

    const hfBridge = getHFBridgeService(hfToken);
    const results = await hfBridge.syncDatasets(limit);

    res.json({
      success: true,
      synced: results.length,
      total: limit,
      datasets: results,
      message: `Successfully synced ${results.length} datasets to blockchain`
    });
  } catch (error) {
    console.error('Error in handleSyncHFDatasets:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Search passports by type or other criteria
 * GET /search
 */
async function handlePassportSearch(req: express.Request, res: express.Response) {
  try {
    const { getPassportService } = await import('../../../../engine/src/passport/passportService');

    const passportService = getPassportService();
    const { type } = req.query;

    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: type (0=Model, 1=Dataset, etc.)'
      });
    }

    const assetType = parseInt(type as string, 10);
    const passports = await passportService.searchPassportsByType(assetType);

    res.json({
      success: true,
      type: assetType,
      count: passports.length,
      passports: passports.map(p => ({
        address: p.pubkey.toBase58(),
        slug: p.data.slug,
        version: p.data.version,
        owner: p.data.owner.toBase58(),
        status: p.data.status,
      }))
    });
  } catch (error) {
    console.error('Error in handlePassportSearch:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// HF SYNC ORCHESTRATOR API ENDPOINTS (Comprehensive Sync)
// ============================================================================

/**
 * Start comprehensive sync of all HuggingFace assets
 * POST /sync-all-hf
 * Body: { types: ['models' | 'datasets' | 'all'], batchSize?: number, concurrency?: number, hfToken?: string }
 */
async function handleSyncAllHF(req: express.Request, res: express.Response) {
  try {
    const { getHFSyncOrchestrator } = await import('../../../../contrib/integrations/hf/hfSyncOrchestrator');

    const {
      types = ['all'],
      batchSize = 100,
      concurrency = 10,
      hfToken,
      checkpointInterval = 100,
      maxRetries = 3,
      minDownloads = 1000,
      minLikes = 0
    } = req.body;

    console.log(`🚀 Starting comprehensive HF sync: ${types.join(', ')}`);

    const orchestrator = getHFSyncOrchestrator(hfToken);

    // Start sync in background
    orchestrator.startFullSync({
      types,
      batchSize,
      concurrency,
      hfToken,
      checkpointInterval,
      maxRetries,
      minDownloads,
      minLikes
    }).catch((error: any) => {
      console.error('Background sync failed:', error);
    });

    res.json({
      success: true,
      message: 'Comprehensive sync started in background',
      config: {
        types,
        batchSize,
        concurrency,
        checkpointInterval
      }
    });
  } catch (error) {
    console.error('Error in handleSyncAllHF:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get current sync progress
 * GET /sync-progress
 */
async function handleSyncProgress(req: express.Request, res: express.Response) {
  try {
    const { getHFSyncOrchestrator } = await import('../../../../contrib/integrations/hf/hfSyncOrchestrator');

    const orchestrator = getHFSyncOrchestrator();
    const progress = orchestrator.getProgress();

    res.json({
      success: true,
      progress,
      message: `Overall progress: ${progress.overall.progress}`
    });
  } catch (error) {
    console.error('Error in handleSyncProgress:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Resume sync from last checkpoint
 * POST /sync-resume
 * Body: { batchSize?: number, concurrency?: number }
 */
async function handleSyncResume(req: express.Request, res: express.Response) {
  try {
    const { getHFSyncOrchestrator } = await import('../../../../contrib/integrations/hf/hfSyncOrchestrator');

    const { batchSize, concurrency, hfToken } = req.body;

    console.log('🔄 Resuming sync from checkpoint...');

    const orchestrator = getHFSyncOrchestrator(hfToken);

    // Resume in background
    orchestrator.resume({ batchSize, concurrency, hfToken }).catch((error) => {
      console.error('Resume failed:', error);
    });

    res.json({
      success: true,
      message: 'Sync resumed from last checkpoint'
    });
  } catch (error) {
    console.error('Error in handleSyncResume:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Stop sync gracefully
 * POST /sync-stop
 */
async function handleSyncStop(req: express.Request, res: express.Response) {
  try {
    const { getHFSyncOrchestrator } = await import('../../../../contrib/integrations/hf/hfSyncOrchestrator');

    const orchestrator = getHFSyncOrchestrator();
    orchestrator.stop();

    res.json({
      success: true,
      message: 'Sync stop requested, will complete current batch'
    });
  } catch (error) {
    console.error('Error in handleSyncStop:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Retry failed assets
 * POST /sync-retry-failed
 * Body: { maxAttempts?: number, concurrency?: number }
 */
async function handleSyncRetryFailed(req: express.Request, res: express.Response) {
  try {
    const { getHFSyncOrchestrator } = await import('../../../../contrib/integrations/hf/hfSyncOrchestrator');

    const { maxAttempts = 3, concurrency = 5 } = req.body;

    const orchestrator = getHFSyncOrchestrator();

    // Retry in background
    orchestrator.retryFailed(maxAttempts, concurrency).catch((error) => {
      console.error('Retry failed:', error);
    });

    res.json({
      success: true,
      message: 'Retrying failed assets in background',
      config: { maxAttempts, concurrency }
    });
  } catch (error) {
    console.error('Error in handleSyncRetryFailed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get detailed sync report
 * GET /sync-report
 */
async function handleSyncReport(req: express.Request, res: express.Response) {
  try {
    const { getHFSyncOrchestrator } = await import('../../../../contrib/integrations/hf/hfSyncOrchestrator');

    const orchestrator = getHFSyncOrchestrator();
    const report = orchestrator.generateReport();

    res.json({
      success: true,
      report,
      message: 'Sync report generated'
    });
  } catch (error) {
    console.error('Error in handleSyncReport:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get sync status
 * GET /sync-status
 */
async function handleSyncStatus(req: express.Request, res: express.Response) {
  try {
    const { getHFSyncOrchestrator } = await import('../../../../contrib/integrations/hf/hfSyncOrchestrator');

    const orchestrator = getHFSyncOrchestrator();
    const status = orchestrator.getStatus();

    res.json({
      success: true,
      status,
      message: status.isRunning ? 'Sync is running' : 'Sync is idle'
    });
  } catch (error) {
    console.error('Error in handleSyncStatus:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// SPACES SYNC + DEPRECATION + PAYMENT GATE ENDPOINTS
// ============================================================================

/**
 * Start spaces-only sync
 * POST /sync-spaces
 */
async function handleSyncSpaces(req: express.Request, res: express.Response) {
  try {
    const { getHFSyncOrchestrator } = await import('../../../../contrib/integrations/hf/hfSyncOrchestrator');

    const {
      batchSize = 100,
      concurrency = 10,
      hfToken,
      minLikes = 0,
    } = req.body;

    const orchestrator = getHFSyncOrchestrator(hfToken);

    orchestrator.startFullSync({
      types: ['spaces'],
      batchSize,
      concurrency,
      hfToken,
      checkpointInterval: 100,
      maxRetries: 3,
      minLikes,
    }).catch((error: any) => {
      console.error('Background spaces sync failed:', error);
    });

    res.json({
      success: true,
      message: 'Spaces sync started in background',
      config: { batchSize, concurrency, minLikes },
    });
  } catch (error) {
    console.error('Error in handleSyncSpaces:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Run deprecation detection
 * POST /detect-deprecations
 */
async function handleDetectDeprecations(req: express.Request, res: express.Response) {
  try {
    const { getDeprecationDetector } = await import('../../../../contrib/integrations/hf/deprecationDetector');

    const { hfToken } = req.body || {};
    const detector = getDeprecationDetector(hfToken);

    // Run in background for large indexes
    const resultPromise = detector.detectAndRevoke();

    // If quick, wait up to 10s for the result
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 10000));
    const result = await Promise.race([resultPromise, timeout]);

    if (result) {
      res.json({
        success: true,
        ...(result as any),
        message: `Deprecation detection complete: ${(result as any).revoked} passports revoked`,
      });
    } else {
      res.json({
        success: true,
        message: 'Deprecation detection started in background (index is large)',
      });
    }
  } catch (error) {
    console.error('Error in handleDetectDeprecations:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Set payment gate on a passport
 * POST /:id/payment-gate
 */
async function handleSetPaymentGate(req: express.Request, res: express.Response) {
  try {
    const { blockchainAdapterFactory } = await import('../../../../engine/src/chains/factory');
    const { id } = req.params;
    const { priceLamports = 0, priceLucid = 0 } = req.body;

    const chainId = (process.env.ANCHORING_CHAINS || 'solana-devnet').split(',')[0].trim();
    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    const receipt = await adapter.passports().setPaymentGate(id, String(priceLamports), String(priceLucid));

    res.json({
      success: true,
      passportPDA: id,
      transaction: receipt.hash,
      priceLamports,
      priceLucid,
      message: 'Payment gate set successfully',
    });
  } catch (error) {
    console.error('Error in handleSetPaymentGate:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Pay for access to a gated passport
 * POST /:id/pay
 */
async function handlePayForAccess(req: express.Request, res: express.Response) {
  try {
    const { blockchainAdapterFactory } = await import('../../../../engine/src/chains/factory');
    const { id } = req.params;
    const { expiresAt = 0 } = req.body;

    const chainId = (process.env.ANCHORING_CHAINS || 'solana-devnet').split(',')[0].trim();
    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    const duration = expiresAt > 0 ? expiresAt - Math.floor(Date.now() / 1000) : 0;
    const receipt = await adapter.passports().payForAccess(id, duration);

    res.json({
      success: true,
      passportPDA: id,
      transaction: receipt.hash,
      message: 'Access purchased successfully',
    });
  } catch (error) {
    console.error('Error in handlePayForAccess:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Check if a wallet has access to a passport
 * GET /:id/access/:wallet
 */
async function handleCheckAccess(req: express.Request, res: express.Response) {
  try {
    const { blockchainAdapterFactory } = await import('../../../../engine/src/chains/factory');
    const { id, wallet } = req.params;

    const chainId = (process.env.ANCHORING_CHAINS || 'solana-devnet').split(',')[0].trim();
    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    const hasAccess = await adapter.passports().checkAccess(id, wallet);

    // Also fetch gate info (read-only utility not on adapter interface)
    const { getPaymentGateService } = await import('../../../../engine/src/finance/paymentGateService');
    const gateInfo = await getPaymentGateService().getPaymentGateInfo(id);

    res.json({
      success: true,
      passportPDA: id,
      wallet,
      hasAccess,
      paymentGate: gateInfo ? {
        priceLamports: gateInfo.priceLamports?.toString(),
        priceLucid: gateInfo.priceLucid?.toString(),
        totalRevenue: gateInfo.totalRevenue?.toString(),
        totalAccesses: gateInfo.totalAccesses?.toString(),
        enabled: gateInfo.enabled,
      } : null,
    });
  } catch (error) {
    console.error('Error in handleCheckAccess:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Withdraw revenue from payment gate vault
 * POST /:id/withdraw
 */
async function handleWithdrawRevenue(req: express.Request, res: express.Response) {
  try {
    const { blockchainAdapterFactory } = await import('../../../../engine/src/chains/factory');
    const { id } = req.params;

    const chainId = (process.env.ANCHORING_CHAINS || 'solana-devnet').split(',')[0].trim();
    const adapter = await blockchainAdapterFactory.getAdapter(chainId);
    const receipt = await adapter.passports().withdrawRevenue(id);

    res.json({
      success: true,
      passportPDA: id,
      transaction: receipt.hash,
      message: 'Revenue withdrawn successfully',
    });
  } catch (error) {
    console.error('Error in handleWithdrawRevenue:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Mount routes — parent will mount this at /passports
passportApiRouter.post('/register', handlePassportRegister);
passportApiRouter.get('/:passportId', handlePassportGet);
passportApiRouter.get('/owner/:owner', handlePassportsByOwner);
passportApiRouter.post('/sync-hf-models', handleSyncHFModels);
passportApiRouter.post('/sync-hf-datasets', handleSyncHFDatasets);
passportApiRouter.get('/search', handlePassportSearch);

// HF Sync Orchestrator endpoints (Comprehensive Sync)
passportApiRouter.post('/sync-all-hf', handleSyncAllHF);
passportApiRouter.get('/sync-progress', handleSyncProgress);
passportApiRouter.post('/sync-resume', handleSyncResume);
passportApiRouter.post('/sync-stop', handleSyncStop);
passportApiRouter.post('/sync-retry-failed', handleSyncRetryFailed);
passportApiRouter.get('/sync-report', handleSyncReport);
passportApiRouter.get('/sync-status', handleSyncStatus);

// Spaces sync + deprecation detection
passportApiRouter.post('/sync-spaces', handleSyncSpaces);
passportApiRouter.post('/detect-deprecations', handleDetectDeprecations);

// Payment gate endpoints
passportApiRouter.post('/:id/payment-gate', handleSetPaymentGate);
passportApiRouter.post('/:id/pay', handlePayForAccess);
passportApiRouter.get('/:id/access/:wallet', handleCheckAccess);
passportApiRouter.post('/:id/withdraw', handleWithdrawRevenue);
