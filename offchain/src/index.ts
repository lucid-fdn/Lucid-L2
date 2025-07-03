// offchain/src/index.ts
import express from 'express';
import bodyParser from 'body-parser';
import { createApiRouter } from './services/api';
import { API_PORT } from './utils/config';

const app = express();
app.use(bodyParser.json());

// Mount API routes
app.use('/', createApiRouter());

app.listen(API_PORT, () => {
  console.log(`▶️  Lucid L2 API listening on http://localhost:${API_PORT}`);
});
