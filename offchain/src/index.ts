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
try {
  const specPath = path.join(__dirname, '../openapi.yaml');
  const yaml = fs.readFileSync(specPath, 'utf8');

  // Very small inline YAML->JSON conversion without adding a YAML parser:
  // express-openapi-validator can accept a path, but it expects JSON/YAML parsing.
  // To avoid adding new deps, we use the built-in `yaml` parser already shipped
  // by express-openapi-validator via its transitive deps.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { parse } = require('yaml');
  const apiSpec = parse(yaml);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const OpenApiValidator = require('express-openapi-validator');
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

// Serve static assets from auth-frontend build
app.use('/api/wallets/auth/assets', express.static(path.join(__dirname, '../../auth-frontend/dist/assets')));

// Mount API routes
app.use('/api', createApiRouter());

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

// Initialize Passport Manager
getPassportManager().init().then(() => {
  console.log('📦 Passport Manager ready');
}).catch((err) => {
  console.error('Failed to initialize Passport Manager:', err);
});

app.listen(API_PORT, '0.0.0.0', () => {
  console.log(`▶️  Lucid L2 API listening on:`);
  console.log(`   Local:  http://localhost:${API_PORT}`);
  console.log(`   WSL:    http://172.28.35.139:${API_PORT}`);
  console.log(`   Network: http://0.0.0.0:${API_PORT}`);
});
