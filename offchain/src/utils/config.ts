// offchain/src/utils/config.ts
import { PublicKey } from '@solana/web3.js';

// Version 1.0 - Lucid L2 Configuration
export const CONFIG_VERSION = '1.0';

// Gas rates and costs
export const IGAS_PER_CALL = 1;      // 1 LUCID per inference call
export const MGAS_PER_ROOT = 5;      // 5 LUCID per memory write
export const IGAS_PER_BATCH = 2;     // 2 LUCID per batch operation

// Token configuration
export const LUCID_MINT = new PublicKey('7cBsSHBB4nSVQy6ceUvmrA8Z2ks8Me8AjxSUqvJ2q1S9');
export const LUCID_DECIMALS = 9;

// Solana configuration
export const COMPUTE_UNITS = 400_000;
export const RPC_URL = 'http://localhost:8899'; // localnet
export const COMMITMENT = 'confirmed';

// Program configuration
export const PROGRAM_ID = new PublicKey('GdbWhvXLg55ACeauwTPB4rXpcgHxjKyT6YuTGeH5orCo');

// API configuration
export const API_PORT = 3000;
export const MAX_BATCH_SIZE = 10;

// Development configuration
export const MEMORY_WALLET_PATH = './memory-wallet.json';
