// Copyright 2024-2026 Raijin Labs. Licensed under AGPL-3.0 — see LICENSE in this package.
// startup.ts — Background job initialization + graceful shutdown

import type { Express } from 'express';
import { getPassportManager, OnChainSyncHandler } from '../../engine/src/identity/passport/passportManager';
import { hasAvailableCompute } from './compute/matchingEngine';
import { MODEL_CATALOG } from './compute/modelCatalog';
import type { Passport } from '../../engine/src/identity/stores/passportStore';
import { initReceiptConsumer, startReceiptConsumer, stopReceiptConsumer } from '../../engine/src/shared/jobs/receiptConsumer';
import pool from '../../engine/src/shared/db/pool';
import { initReceiptMMR } from '../../engine/src/shared/crypto/receiptMMR';
import { setAnchoringConfig, setAuthorityKeypair, commitEpochRoot } from '../../engine/src/anchoring/epoch/services/anchoringService';
import { startAnchoringJob, setAnchoringJobConfig } from '../../engine/src/shared/jobs/anchoringJob';
import { setAnchorCallback, startAutoFinalization } from '../../engine/src/anchoring/epoch/services/epochService';
import { getKeypair } from '../../engine/src/chain/solana/client';
import { blockchainAdapterFactory } from '../../engine/src/chain/blockchain/BlockchainAdapterFactory';
import { EVMAdapter } from '../../engine/src/chain/blockchain/evm/EVMAdapter';
import { SolanaAdapter } from '../../engine/src/chain/blockchain/solana/SolanaAdapter';
import { CHAIN_CONFIGS, getEVMChains, getSolanaChains } from '../../engine/src/chain/blockchain/chains';
import { setX402Config } from './middleware/x402';
import { getReputationAggregator } from './reputation/reputationAggregator';
import { reputationAlgorithmRegistry } from './reputation';
import { ReceiptVolumeAlgorithm } from './reputation/algorithms/ReceiptVolumeAlgorithm';
import { CrossChainWeightedAlgorithm } from './reputation/algorithms/CrossChainWeightedAlgorithm';
import { StakeWeightedAlgorithm } from './reputation/algorithms/StakeWeightedAlgorithm';
import { initAgentMirrorConsumer, startAgentMirrorConsumer, stopAgentMirrorConsumer } from '../../engine/src/shared/jobs/agentMirrorConsumer';
import {
  flushSentry,
  setupSentryErrorHandler,
} from './lib/observability';
import { shutdownTracing } from './lib/observability';

/**
 * Initialize all background services and wire up the startup sequence.
 * Call this after routes are mounted but before app.listen().
 */
export function initializeBackgroundServices(app: Express): void {
  // Register built-in reputation algorithms
  reputationAlgorithmRegistry.register(new ReceiptVolumeAlgorithm());
  reputationAlgorithmRegistry.register(new CrossChainWeightedAlgorithm());
  reputationAlgorithmRegistry.register(new StakeWeightedAlgorithm());
  console.log(`Reputation Marketplace: ${reputationAlgorithmRegistry.count()} algorithm(s) registered`);

  // Initialize Passport Manager and wire up On-Chain Sync
  getPassportManager().setComputeAvailabilityChecker(hasAvailableCompute);
  getPassportManager().setModelCatalog(MODEL_CATALOG);
  getPassportManager().init().then(async () => {
    console.log('Passport Manager ready');

    // Auto-sync API models from TrustGate catalog
    if (process.env.TRUSTGATE_SYNC_ENABLED !== 'false') {
      try {
        const syncResult = await getPassportManager().syncApiModels();
        console.log(`TrustGate Sync: ${syncResult.created} created, ${syncResult.skipped} existing, ${syncResult.removed} revoked`);
      } catch (err) {
        console.warn('TrustGate Sync failed (non-blocking):', err instanceof Error ? err.message : err);
      }
    } else {
      console.log('TrustGate Sync disabled (TRUSTGATE_SYNC_ENABLED=false)');
    }

    // Wire up Passport On-Chain Sync via blockchain adapter (if enabled)
    if (process.env.PASSPORT_SYNC_ENABLED !== 'false') {
      try {
        const chainId = (process.env.ANCHORING_CHAINS || 'solana-devnet').split(',')[0].trim();
        const adapter = await blockchainAdapterFactory.getAdapter(chainId);
        const passportAdapter = adapter.passports();

        const adapterSyncHandler: OnChainSyncHandler = {
          async syncToChain(passport: Passport): Promise<{ pda: string; tx: string } | null> {
            const { createHash } = await import('crypto');
            const contentHash = passport.metadata?.content_hash
              || passport.metadata?.sha256
              || createHash('sha256').update(JSON.stringify(passport.metadata || {})).digest('hex');
            const owner = passport.owner || '';
            const receipt = await passportAdapter.anchorPassport(passport.passport_id, contentHash, owner);
            if (!receipt.success) return null;
            return { pda: passport.passport_id, tx: receipt.hash };
          },
        };

        getPassportManager().setOnChainSyncHandler(adapterSyncHandler);
        console.log('Passport On-Chain Sync enabled (via adapter)');
        console.log(`   Chain: ${chainId}`);
      } catch (err) {
        console.warn('Passport On-Chain Sync not available:', err instanceof Error ? err.message : err);
        console.warn('   Passports will be stored offchain only.');
      }
    } else {
      console.log('Passport On-Chain Sync disabled (PASSPORT_SYNC_ENABLED=false)');
    }
  }).catch((err) => {
    console.error('Failed to initialize Passport Manager:', err);
  });

  // Restore MMR + epoch state from DB
  (async () => {
    try {
      const mmr = await initReceiptMMR();
      if (mmr.getLeafCount() === 0) {
        const { restoreFromCheckpoint } = await import('../../engine/src/shared/jobs/mmrCheckpoint');
        const restored = await restoreFromCheckpoint();
        if (restored) {
          const reloaded = await initReceiptMMR();
          console.log(`Receipt MMR: restored from DePIN checkpoint (${reloaded.getLeafCount()} leaves)`);
        } else {
          console.log('Receipt MMR: starting fresh (no DB state, no DePIN checkpoint)');
        }
      } else {
        console.log(`Receipt MMR: ${mmr.getLeafCount()} leaves, size ${mmr.getSize()}`);
      }
    } catch (err) {
      console.warn('Receipt MMR restore failed (starting fresh):', err instanceof Error ? err.message : err);
    }
    try {
      const { loadEpochsFromDb } = await import('../../engine/src/anchoring/epoch/services/epochService');
      const loaded = await loadEpochsFromDb();
      if (loaded > 0) {
        console.log(`Epoch state: restored ${loaded} active epoch(s) from DB`);
      }
    } catch (err) {
      console.warn('Epoch state restore failed (starting fresh):', err instanceof Error ? err.message : err);
    }

    // Start periodic MMR checkpoint to DePIN (non-blocking)
    try {
      const { startCheckpointJob } = await import('../../engine/src/shared/jobs/mmrCheckpoint');
      startCheckpointJob(parseInt(process.env.MMR_CHECKPOINT_INTERVAL_MS || '1800000'));
    } catch (err) {
      console.warn('MMR checkpoint job failed to start:', err instanceof Error ? err.message : err);
    }
  })();

  // Initialize Receipt Consumer (polls receipt_events from TrustGate)
  try {
    initReceiptConsumer(
      async (sql, params) => {
        const result = await pool.query(sql, params);
        return { rows: result.rows };
      },
      {
        interval_ms: parseInt(process.env.RECEIPT_CONSUMER_INTERVAL_MS || '5000'),
        batch_size: parseInt(process.env.RECEIPT_CONSUMER_BATCH_SIZE || '50'),
        enabled: process.env.RECEIPT_CONSUMER_ENABLED !== 'false',
      }
    );
    startReceiptConsumer();
    console.log('Receipt Consumer started');
  } catch (err) {
    console.warn('Receipt Consumer failed to start:', err instanceof Error ? err.message : err);
  }

  // Start Memory background services (embedding worker + projection)
  if (process.env.MEMORY_ENABLED !== 'false') {
    try {
      const { startMemorySystem } = require('../../engine/src/memory/boot');
      startMemorySystem();
    } catch (err) {
      console.warn('[memory] Failed to start memory system:', err instanceof Error ? err.message : err);
    }
  }

  // Start Deployment Control Plane (Reconciler + LeaseManager)
  if (process.env.DEPLOYMENT_CONTROL_PLANE !== 'false') {
    try {
      const { startDeploymentControlPlane } = require('../../engine/src/compute/control-plane/boot');
      startDeploymentControlPlane();
    } catch (err) {
      console.warn('[deployment] Failed to start control plane:', err instanceof Error ? err.message : err);
    }
  } else {
    console.log('[deployment] Control plane disabled (DEPLOYMENT_CONTROL_PLANE=false)');
  }

  // Initialize Agent Mirror Consumer
  const PLATFORM_CORE_DB_URL = process.env.PLATFORM_CORE_DB_URL;
  if (PLATFORM_CORE_DB_URL) {
    try {
      initAgentMirrorConsumer(
        async (sql, params) => {
          const result = await pool.query(sql, params);
          return { rows: result.rows as Record<string, unknown>[] };
        },
        PLATFORM_CORE_DB_URL,
        {
          interval_ms: parseInt(process.env.AGENT_MIRROR_INTERVAL_MS || '10000'),
          batch_size: parseInt(process.env.AGENT_MIRROR_BATCH_SIZE || '50'),
          enabled: process.env.AGENT_MIRROR_ENABLED !== 'false',
        }
      );
      startAgentMirrorConsumer();
      console.log('Agent Mirror Consumer started (PLATFORM_CORE_DB_URL configured)');
    } catch (err) {
      console.warn('Agent Mirror Consumer failed to start:', err instanceof Error ? err.message : err);
    }
  } else {
    console.log('Agent Mirror Consumer disabled (PLATFORM_CORE_DB_URL not set)');
  }

  // Receipt retention cron — clean up processed events older than 30 days
  const RECEIPT_RETENTION_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
  setInterval(async () => {
    try {
      const result = await pool.query(
        `DELETE FROM receipt_events WHERE processed = true AND created_at < now() - interval '30 days'`
      );
      if (result.rowCount && result.rowCount > 0) {
        console.log(`Receipt retention: deleted ${result.rowCount} processed events older than 30d`);
      }
    } catch (err) {
      console.warn('Receipt retention cleanup failed:', err instanceof Error ? err.message : err);
    }
  }, RECEIPT_RETENTION_INTERVAL_MS);

  // Initialize Anchoring Service with Solana keypair
  try {
    const keypair = getKeypair();
    const network = (process.env.SOLANA_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet' | 'localnet';

    setAnchoringConfig({
      network,
      rpc_url: process.env.SOLANA_RPC_URL,
      commitment: 'confirmed',
      mock_mode: process.env.ANCHORING_MOCK_MODE === 'true',
    });
    setAuthorityKeypair(keypair);

    console.log('Anchoring Service configured');
    console.log(`   Network: ${network}`);
    console.log(`   Authority: ${keypair.publicKey.toBase58()}`);
    console.log(`   Mock Mode: ${process.env.ANCHORING_MOCK_MODE === 'true'}`);
    // Start anchoring pipeline (job + auto-finalization)
    if (process.env.ANCHORING_MOCK_MODE !== 'true') {
      setAnchorCallback(async (epoch_id: string) => {
        const result = await commitEpochRoot(epoch_id);
        return { success: result.success, error: result.error };
      });

      setAnchoringJobConfig({
        enabled: true,
        interval_ms: parseInt(process.env.ANCHORING_JOB_INTERVAL_MS || '600000'),
      });
      startAnchoringJob();

      startAutoFinalization(parseInt(process.env.EPOCH_FINALIZATION_INTERVAL_MS || '60000'));

      console.log('Anchoring pipeline started (job + auto-finalization)');
    } else {
      console.log('Anchoring pipeline skipped (mock mode)');
    }
  } catch (err) {
    console.warn('Anchoring Service not configured (Solana keypair not available):', err instanceof Error ? err.message : err);
    console.warn('   Epoch anchoring will not work until a keypair is configured.');
  }

  // Initialize EVM Blockchain Adapters (ERC-8004 Multi-Chain)
  (async () => {
    try {
      const enabledChains = process.env.EVM_ENABLED_CHAINS
        ? process.env.EVM_ENABLED_CHAINS.split(',').map((s) => s.trim())
        : getEVMChains().filter((c) => c.isTestnet).map((c) => c.chainId);

      let registered = 0;
      for (const chainId of enabledChains) {
        const config = CHAIN_CONFIGS[chainId];
        if (!config) {
          console.warn(`Unknown chain: ${chainId}, skipping`);
          continue;
        }

        const envKey = chainId.toUpperCase().replace(/-/g, '_') + '_RPC_URL';
        if (process.env[envKey]) {
          config.rpcUrl = process.env[envKey]!;
        }

        const contractsEnvKey = chainId.toUpperCase().replace(/-/g, '_') + '_CONTRACTS';
        if (process.env[contractsEnvKey]) {
          try {
            config.erc8004 = { ...config.erc8004, ...JSON.parse(process.env[contractsEnvKey]!) };
          } catch {
            // Ignore malformed JSON
          }
        }

        const adapter = new EVMAdapter();
        blockchainAdapterFactory.register(adapter, config);
        registered++;
      }

      if (registered > 0) {
        console.log(`EVM Multi-Chain: ${registered} chain(s) registered`);
        console.log(`   Chains: ${enabledChains.join(', ')}`);
        if (process.env.EVM_PRIVATE_KEY) {
          console.log(`   Wallet: configured`);
        } else {
          console.log(`   Wallet: not configured (read-only mode)`);
        }
      }
    } catch (err) {
      console.warn('EVM Multi-Chain init failed:', err instanceof Error ? err.message : err);
    }
  })();

  // Initialize Solana Blockchain Adapters
  (async () => {
    try {
      const enabledSolanaChains = process.env.SOLANA_ENABLED_CHAINS
        ? process.env.SOLANA_ENABLED_CHAINS.split(',').map((s) => s.trim())
        : getSolanaChains().filter((c) => c.isTestnet).map((c) => c.chainId);

      let registered = 0;
      for (const chainId of enabledSolanaChains) {
        const config = CHAIN_CONFIGS[chainId];
        if (!config || config.chainType !== 'solana') {
          console.warn(`Unknown or non-Solana chain: ${chainId}, skipping`);
          continue;
        }

        const envKey = chainId.toUpperCase().replace(/-/g, '_') + '_RPC_URL';
        if (process.env[envKey]) {
          config.rpcUrl = process.env[envKey]!;
        }

        const adapter = new SolanaAdapter();
        blockchainAdapterFactory.register(adapter, config);
        registered++;
      }

      if (registered > 0) {
        console.log(`Solana Multi-Chain: ${registered} chain(s) registered`);
        console.log(`   Chains: ${enabledSolanaChains.join(', ')}`);
      }
    } catch (err) {
      console.warn('Solana Multi-Chain init failed:', err instanceof Error ? err.message : err);
    }
  })();

  // Initialize Cross-Chain Reputation Aggregator
  if (process.env.REPUTATION_INDEXING_ENABLED === 'true') {
    const intervalMs = parseInt(process.env.REPUTATION_INDEXING_INTERVAL || '60000', 10);
    const aggregator = getReputationAggregator();
    aggregator.startIndexing(intervalMs);
    console.log(`Reputation Indexer: enabled (interval: ${intervalMs}ms)`);
  } else {
    console.log('Reputation Indexer: disabled (set REPUTATION_INDEXING_ENABLED=true to enable)');
  }

  // Configure x402 payment middleware
  if (process.env.X402_ENABLED === 'true') {
    setX402Config({
      enabled: true,
      paymentAddress: process.env.X402_PAYMENT_ADDRESS || '',
      paymentChain: (process.env.X402_PAYMENT_CHAIN as 'base' | 'base-sepolia') || 'base-sepolia',
    });
    console.log(`x402 Payment: enabled (chain: ${process.env.X402_PAYMENT_CHAIN || 'base-sepolia'})`);
  } else {
    console.log('x402 Payment: disabled (set X402_ENABLED=true to enable)');
  }

  // Sentry error handler — must be registered after all routes
  setupSentryErrorHandler(app);
}

/**
 * Register graceful shutdown handlers.
 * Stops consumers, checkpoints, and flushes observability.
 */
export function registerShutdownHandlers(): void {
  const gracefulShutdown = async (signal: string) => {
    console.log(`${signal} received — shutting down`);
    stopReceiptConsumer();
    stopAgentMirrorConsumer();
    try { const { stopDeploymentControlPlane } = require('../../engine/src/compute/control-plane/boot'); stopDeploymentControlPlane(); } catch { /* best-effort */ }
    try { const { stopMemorySystem } = require('../../engine/src/memory/boot'); stopMemorySystem(); } catch { /* best-effort */ }
    // Final MMR checkpoint before exit (best-effort)
    try {
      const { stopCheckpointJob, createCheckpoint } = await import('../../engine/src/shared/jobs/mmrCheckpoint');
      stopCheckpointJob();
      await createCheckpoint();
    } catch { /* best-effort */ }
    await Promise.all([flushSentry(), shutdownTracing()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
