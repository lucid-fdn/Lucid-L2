// offchain/src/index.ts
import express from 'express';
import bodyParser from 'body-parser';
import { createApiRouter } from './services/api';
import { API_PORT } from './utils/config';

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

// Mount API routes
app.use('/', createApiRouter());

app.listen(API_PORT, '0.0.0.0', () => {
  console.log(`▶️  Lucid L2 API listening on:`);
  console.log(`   Local:  http://localhost:${API_PORT}`);
  console.log(`   WSL:    http://172.28.35.139:${API_PORT}`);
  console.log(`   Network: http://0.0.0.0:${API_PORT}`);
});
