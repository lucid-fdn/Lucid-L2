// offchain/src/index.ts
import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
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
import healthRoutes from './routes/healthRoutes';
import hyperliquidRoutes from './routes/hyperliquidRoutes';
import solanaRoutes from './routes/solanaRoutes';

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

// Serve static assets from auth-frontend build
app.use('/api/wallets/auth/assets', express.static(path.join(__dirname, '../../auth-frontend/dist/assets')));

// Mount API routes
app.use('/api', createApiRouter());

// Mount OAuth routes for Nango integration
app.use('/api/oauth', oauthRoutes);

// Mount Hyperliquid trading routes
app.use('/api/hyperliquid', hyperliquidRoutes);

// Mount Solana blockchain routes
app.use('/api/solana', solanaRoutes);

// Mount health check routes
app.use('/health', healthRoutes);

app.listen(API_PORT, '0.0.0.0', () => {
  console.log(`▶️  Lucid L2 API listening on:`);
  console.log(`   Local:  http://localhost:${API_PORT}`);
  console.log(`   WSL:    http://172.28.35.139:${API_PORT}`);
  console.log(`   Network: http://0.0.0.0:${API_PORT}`);
});
