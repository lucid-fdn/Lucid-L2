/**
 * Ed25519 signing utilities for receipt authenticity.
 * 
 * MVP: Orchestrator-signed using keys from environment variables.
 * Upgrade path: Compute-signed using keys from compute nodes.
 */
import nacl from 'tweetnacl';
import { Buffer } from 'buffer';
import { logger } from '../lib/logger';

export interface SigningKeypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface SignatureResult {
  signature: string; // hex encoded
  publicKey: string; // hex encoded
}

// Cached keypair singleton
let cachedKeypair: SigningKeypair | null = null;

/**
 * Get or generate the orchestrator signing keypair.
 * 
 * In production, this should be loaded from secure key storage.
 * For MVP, we use environment variables or generate a deterministic key.
 */
export function getOrchestratorKeypair(): SigningKeypair {
  if (cachedKeypair) {
    return cachedKeypair;
  }

  const secretKeyHex = process.env.LUCID_ORCHESTRATOR_SECRET_KEY;
  
  if (secretKeyHex) {
    // Load from environment (64-byte secret key in hex = 128 chars)
    const secretKey = Buffer.from(secretKeyHex, 'hex');
    if (secretKey.length !== 64) {
      throw new Error('LUCID_ORCHESTRATOR_SECRET_KEY must be 64 bytes (128 hex chars)');
    }
    const publicKey = secretKey.slice(32); // Last 32 bytes of nacl secretKey is the publicKey
    cachedKeypair = {
      publicKey: new Uint8Array(publicKey),
      secretKey: new Uint8Array(secretKey),
    };
  } else if (process.env.NODE_ENV === 'production') {
    // CRITICAL: Never fall back to a dev key in production
    throw new Error(
      'LUCID_ORCHESTRATOR_SECRET_KEY is required in production. ' +
      'Generate one with: node -e "logger.info(require(\'tweetnacl\').sign.keyPair().secretKey.reduce((s,b)=>s+b.toString(16).padStart(2,\'0\'),\'\'))"'
    );
  } else {
    // Development/test fallback: deterministic keypair from a seed
    const seed = Buffer.alloc(32);
    Buffer.from('LUCID_MVP_DEV_SEED_DO_NOT_USE_IN_PROD').copy(seed, 0, 0, 32);
    const keypair = nacl.sign.keyPair.fromSeed(seed);
    cachedKeypair = {
      publicKey: keypair.publicKey,
      secretKey: keypair.secretKey,
    };
    logger.warn('[WARN] Using development signing key. Set LUCID_ORCHESTRATOR_SECRET_KEY for production.');
  }

  return cachedKeypair;
}

/**
 * Sign a message (typically the canonical receipt hash).
 */
export function signMessage(message: string | Buffer): SignatureResult {
  const keypair = getOrchestratorKeypair();
  const messageBytes = typeof message === 'string' ? Buffer.from(message, 'hex') : message;
  
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  
  return {
    signature: Buffer.from(signature).toString('hex'),
    publicKey: Buffer.from(keypair.publicKey).toString('hex'),
  };
}

/**
 * Verify a signature against a message and public key.
 */
export function verifySignature(
  message: string | Buffer,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  try {
    const messageBytes = typeof message === 'string' ? Buffer.from(message, 'hex') : message;
    const signature = Buffer.from(signatureHex, 'hex');
    const publicKey = Buffer.from(publicKeyHex, 'hex');
    
    if (signature.length !== 64 || publicKey.length !== 32) {
      return false;
    }
    
    return nacl.sign.detached.verify(messageBytes, signature, publicKey);
  } catch {
    return false;
  }
}

/**
 * Get the orchestrator's public key (for verification).
 */
export function getOrchestratorPublicKey(): string {
  const keypair = getOrchestratorKeypair();
  return Buffer.from(keypair.publicKey).toString('hex');
}

/**
 * Reset the cached keypair (for testing).
 */
export function resetKeypair(): void {
  cachedKeypair = null;
}

/**
 * Generate a new random keypair (for testing or key rotation).
 */
export function generateKeypair(): SigningKeypair {
  const keypair = nacl.sign.keyPair();
  return {
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
  };
}

/**
 * Export keypair to hex strings (for storing in env).
 */
export function exportKeypairToHex(keypair: SigningKeypair): { secretKeyHex: string; publicKeyHex: string } {
  return {
    secretKeyHex: Buffer.from(keypair.secretKey).toString('hex'),
    publicKeyHex: Buffer.from(keypair.publicKey).toString('hex'),
  };
}
