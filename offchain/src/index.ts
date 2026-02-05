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
import { setAnchoringConfig, setAuthorityKeypair } from './services/anchoringService';
import { getKeypair } from './solana/client';

const app = express();

// Add CORS headers for WSL-Windows cross-origin requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
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

app.listen(API_PORT, '0.0.0.0', () => {
  console.log(`▶️  Lucid L2 API listening on:`);
  console.log(`   Local:  http://localhost:${API_PORT}`);
  console.log(`   WSL:    http://172.28.35.139:${API_PORT}`);
  console.log(`   Network: http://0.0.0.0:${API_PORT}`);
});
