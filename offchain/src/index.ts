// offchain/src/index.ts
import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import { createApiRouter } from './services/api';
import { API_PORT } from './utils/config';
import { validateEnvironmentOrThrow, printEnvironmentStatus } from './utils/environmentValidator';

// --- Observability ---------------------------------------------------------
// Sentry & OTel provide error tracking, performance monitoring, and
// distributed tracing.  Both degrade gracefully when env vars are absent.
import {
  initSentry,
  setupSentryErrorHandler,
  captureError,
  flushSentry,
} from './lib/observability';
import { initTracing, shutdownTracing } from './lib/observability';

// Initialise Sentry early (synchronous, no-op when SENTRY_DSN is unset)
initSentry();

// Kick off OTel tracing (async, no-op when OTEL_ENABLED !== 'true').
// The dynamic imports inside initTracing will register instrumentation hooks
// for HTTP, Express, and pg as soon as the promise resolves.
initTracing().catch((err) =>
  console.warn('[otel] Failed to initialize tracing:', err),
);
// ---------------------------------------------------------------------------

// Validate environment variables on startup
validateEnvironmentOrThrow();
printEnvironmentStatus();

// Import protocol adapters to trigger auto-registration
import './protocols/adapters';

// Import OAuth routes
import oauthRoutes from './routes/oauthRoutes';
import oauthResourcesRoutes from './routes/oauthResourcesRoutes';
import healthRoutes from './routes/healthRoutes';
import hyperliquidRoutes from './routes/hyperliquidRoutes';
import solanaRoutes from './routes/solanaRoutes';
import { lucidLayerRouter } from './routes/lucidLayerRoutes';
import { passportRouter } from './routes/passportRoutes';
import { getPassportManager } from './services/passportManager';
import { getPassportSyncService } from './services/passportSyncService';
import { initReceiptConsumer, startReceiptConsumer, stopReceiptConsumer } from './jobs/receiptConsumer';
import pool from './lib/db/pool';
import { setAnchoringConfig, setAuthorityKeypair } from './services/anchoringService';
import { getKeypair } from './solana/client';
import { blockchainAdapterFactory } from './blockchain/BlockchainAdapterFactory';
import { EVMAdapter } from './blockchain/evm/EVMAdapter';
import { CHAIN_CONFIGS, getEVMChains } from './blockchain/chains';
import { setX402Config } from './middleware/x402';

const app = express();

// Add CORS headers for WSL-Windows cross-origin requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Payment-Proof');
  // Allow Chrome private network access preflight from secure pages
  res.header('Access-Control-Allow-Private-Network', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
});

app.use(bodyParser.json());

// -----------------------------------------------------------------------------
// OpenAPI / Swagger UI
// -----------------------------------------------------------------------------

// Serve raw OpenAPI spec
app.get('/api/openapi.yaml', (_req, res) => {
  try {
    const specPath = path.join(__dirname, '../openapi.yaml');
    const yaml = fs.readFileSync(specPath, 'utf8');
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.send(yaml);
  } catch (err) {
    console.error('Failed to read openapi.yaml:', err);
    res.status(500).json({ success: false, error: 'Failed to load OpenAPI spec' });
  }
});

// Swagger UI (loads the spec via URL so we don't need a YAML parser at runtime)
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(undefined, {
    swaggerOptions: {
      url: '/api/openapi.yaml',
    },
  })
);

// -----------------------------------------------------------------------------
// OpenAPI request validation
// -----------------------------------------------------------------------------
// Validates only routes that are described in openapi.yaml.
// We load the YAML ourselves (no runtime YAML parser dependency) and pass the
// parsed document to the validator.
(async () => {
  try {
    const specPath = path.join(__dirname, '../openapi.yaml');
    const yamlContent = fs.readFileSync(specPath, 'utf8');

    // Very small inline YAML->JSON conversion without adding a YAML parser:
    // express-openapi-validator can accept a path, but it expects JSON/YAML parsing.
    // To avoid adding new deps, we use the built-in `yaml` parser already shipped
    // by express-openapi-validator via its transitive deps.
    const yamlModule = await import('yaml');
    const apiSpec = yamlModule.parse(yamlContent);

    const OpenApiValidator = await import('express-openapi-validator');
    app.use(
      OpenApiValidator.middleware({
        apiSpec,
        validateRequests: true,
        // Response validation is useful but can be noisy until the spec fully matches
        // every endpoint and all error shapes.
        validateResponses: false,
        validateApiSpec: true,
      })
    );
  } catch (err) {
    console.warn('OpenAPI validator disabled (failed to load/parse openapi.yaml):', err);
  }
})();

// Serve static assets from auth-frontend build
app.use('/api/wallets/auth/assets', express.static(path.join(__dirname, '../../auth-frontend/dist/assets')));

// Mount API routes (async router needs to be awaited)
(async () => {
  const apiRouter = await createApiRouter();
  app.use('/api', apiRouter);
})();

// Mount LucidLayer MVP routes (versioned)
app.use('/', lucidLayerRouter);

// Mount Passport CRUD routes (LucidLayer Phase 1)
app.use('/', passportRouter);

// Mount OAuth routes for Nango integration
app.use('/api/oauth', oauthRoutes);
app.use('/api/oauth', oauthResourcesRoutes);

// Mount Hyperliquid trading routes
app.use('/api/hyperliquid', hyperliquidRoutes);

// Mount Solana blockchain routes
app.use('/api/solana', solanaRoutes);

// Mount health check routes
app.use('/health', healthRoutes);

// Initialize Passport Manager and wire up On-Chain Sync
getPassportManager().init().then(async () => {
  console.log('📦 Passport Manager ready');
  
  // Wire up Passport On-Chain Sync Service (if enabled)
  if (process.env.PASSPORT_SYNC_ENABLED !== 'false') {
    try {
      const syncService = getPassportSyncService();
      await syncService.init();
      getPassportManager().setOnChainSyncHandler(syncService);
      console.log('🔗 Passport On-Chain Sync enabled');
      console.log(`   Program ID: 38yaXUezrbLyLDnAQ5jqFXPiFurr8qhw19gYnE6H9VsW`);
    } catch (err) {
      console.warn('⚠️ Passport On-Chain Sync not available:', err instanceof Error ? err.message : err);
      console.warn('   Passports will be stored offchain only.');
    }
  } else {
    console.log('ℹ️ Passport On-Chain Sync disabled (PASSPORT_SYNC_ENABLED=false)');
  }
}).catch((err) => {
  console.error('Failed to initialize Passport Manager:', err);
});

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
  console.log('🧾 Receipt Consumer started');
} catch (err) {
  console.warn('⚠️ Receipt Consumer failed to start:', err instanceof Error ? err.message : err);
}

// Receipt retention cron — clean up processed events older than 30 days
const RECEIPT_RETENTION_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
setInterval(async () => {
  try {
    const result = await pool.query(
      `DELETE FROM receipt_events WHERE processed = true AND created_at < now() - interval '30 days'`
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(`🗑️  Receipt retention: deleted ${result.rowCount} processed events older than 30d`);
    }
  } catch (err) {
    console.warn('⚠️ Receipt retention cleanup failed:', err instanceof Error ? err.message : err);
  }
}, RECEIPT_RETENTION_INTERVAL_MS);

// Graceful shutdown — stop receipt consumer & flush observability
process.on('SIGTERM', async () => {
  console.log('SIGTERM received — shutting down');
  stopReceiptConsumer();
  await Promise.all([flushSentry(), shutdownTracing()]);
  process.exit(0);
});
process.on('SIGINT', async () => {
  console.log('SIGINT received — shutting down');
  stopReceiptConsumer();
  await Promise.all([flushSentry(), shutdownTracing()]);
  process.exit(0);
});

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
  
  console.log('⚓ Anchoring Service configured');
  console.log(`   Network: ${network}`);
  console.log(`   Authority: ${keypair.publicKey.toBase58()}`);
  console.log(`   Mock Mode: ${process.env.ANCHORING_MOCK_MODE === 'true'}`);
} catch (err) {
  console.warn('⚠️ Anchoring Service not configured (Solana keypair not available):', err instanceof Error ? err.message : err);
  console.warn('   Epoch anchoring will not work until a keypair is configured.');
}

// Initialize EVM Blockchain Adapters (ERC-8004 Multi-Chain)
(async () => {
  try {
    // Determine which chains to enable
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

      // Allow per-chain RPC override via env (e.g., APECHAIN_RPC_URL)
      const envKey = chainId.toUpperCase().replace(/-/g, '_') + '_RPC_URL';
      if (process.env[envKey]) {
        config.rpcUrl = process.env[envKey]!;
      }

      // Allow per-chain ERC-8004 contract overrides
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

// Sentry error handler — must be registered after all routes but before any
// custom error-handling middleware so that Sentry sees unhandled errors first.
setupSentryErrorHandler(app);

app.listen(API_PORT, '0.0.0.0', () => {
  console.log(`Lucid L2 API listening on:`);
  console.log(`   Local:  http://localhost:${API_PORT}`);
  console.log(`   WSL:    http://172.28.35.139:${API_PORT}`);
  console.log(`   Network: http://0.0.0.0:${API_PORT}`);
});
