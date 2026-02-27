// offchain/src/solana/keypair.ts
// Shared Solana keypair parsing — consolidates 7 duplicated approaches into one.

import { Keypair } from '@solana/web3.js';
import { execSync } from 'child_process';
import fs from 'fs';

/**
 * Parse a Solana Keypair from multiple supported formats.
 *
 * Resolution order:
 * 1. Custom env var (if provided) — base64 string OR JSON array of bytes
 * 2. LUCID_ORCHESTRATOR_SECRET_KEY env var — same formats
 * 3. SOLANA_KEYPAIR env var — JSON array of bytes
 * 4. SOLANA_KEYPAIR_PATH env var — path to JSON file
 * 5. `solana config get` CLI fallback — dev-only
 *
 * @param envVar Optional custom env var name to check first
 * @throws Error if no keypair can be resolved
 */
export function getSolanaKeypair(envVar?: string): Keypair {
  // 1. Check custom env var
  if (envVar && process.env[envVar]) {
    return parseKeypairString(process.env[envVar]!);
  }

  // 2. Check default orchestrator key
  const orchestratorKey = process.env.LUCID_ORCHESTRATOR_SECRET_KEY;
  if (orchestratorKey) {
    return parseKeypairString(orchestratorKey);
  }

  // 3. Check SOLANA_KEYPAIR env var (JSON array)
  const solanaKeypair = process.env.SOLANA_KEYPAIR;
  if (solanaKeypair) {
    return parseKeypairString(solanaKeypair);
  }

  // 4. Check keypair file path
  const keypairPath = process.env.SOLANA_KEYPAIR_PATH;
  if (keypairPath) {
    return loadKeypairFromFile(keypairPath);
  }

  // 5. Fallback to solana CLI config (dev-only)
  return loadKeypairFromCLI();
}

/**
 * Parse a keypair from a string (base64 or JSON array of bytes).
 */
export function parseKeypairString(value: string): Keypair {
  const trimmed = value.trim();

  // Try JSON array first: [1,2,3,...]
  if (trimmed.startsWith('[')) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
  }

  // Otherwise treat as base64
  return Keypair.fromSecretKey(Buffer.from(trimmed, 'base64'));
}

/**
 * Load keypair from a JSON file (Solana CLI format: array of bytes).
 */
export function loadKeypairFromFile(filePath: string): Keypair {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Keypair.fromSecretKey(new Uint8Array(data));
}

/**
 * Load keypair from Solana CLI config (`solana config get`).
 * Dev-only fallback — requires Solana CLI installed.
 */
function loadKeypairFromCLI(): Keypair {
  const configOutput = execSync('solana config get', { encoding: 'utf8' });
  const keypairMatch = configOutput.match(/Keypair Path: (.+)/);
  if (!keypairMatch) {
    throw new Error('No Solana keypair found in CLI config');
  }
  return loadKeypairFromFile(keypairMatch[1].trim());
}
