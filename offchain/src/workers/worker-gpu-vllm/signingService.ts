/**
 * Worker Signing Service
 * 
 * Manages ed25519 keypair for signing quotes and receipts.
 * In byo_runtime mode, the worker signs all quotes and receipts directly.
 * 
 * Key storage options:
 * 1. Environment variable (WORKER_PRIVATE_KEY)
 * 2. File-based key (WORKER_KEY_PATH)
 * 3. Auto-generated (development only)
 * 
 * @module signingService
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * ed25519 Key Pair
 */
export interface KeyPair {
  publicKey: Buffer;
  privateKey: Buffer;
  publicKeyHex: string;
  privateKeyHex: string;
}

/**
 * Signature result
 */
export interface SignatureResult {
  signature: string;  // hex-encoded
  publicKey: string;  // hex-encoded
}

/**
 * Worker Signing Service
 * 
 * Manages the worker's ed25519 keypair for cryptographic operations.
 */
export class WorkerSigningService {
  private keyPair: KeyPair;
  private initialized: boolean = false;

  constructor() {
    // Key pair will be initialized lazily or explicitly
    this.keyPair = {} as KeyPair;
  }

  /**
   * Initialize the signing service.
   * 
   * Priority:
   * 1. WORKER_PRIVATE_KEY env var (hex-encoded 64-byte private key)
   * 2. WORKER_KEY_PATH file
   * 3. Auto-generate (only if WORKER_AUTO_GENERATE_KEY=true)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Method 1: Environment variable
    const envKey = process.env.WORKER_PRIVATE_KEY;
    if (envKey) {
      this.keyPair = this.loadFromHex(envKey);
      console.log('[SigningService] Loaded key from WORKER_PRIVATE_KEY');
      this.initialized = true;
      return;
    }

    // Method 2: File-based key
    const keyPath = process.env.WORKER_KEY_PATH;
    if (keyPath && fs.existsSync(keyPath)) {
      const keyContent = fs.readFileSync(keyPath, 'utf-8').trim();
      this.keyPair = this.loadFromHex(keyContent);
      console.log(`[SigningService] Loaded key from ${keyPath}`);
      this.initialized = true;
      return;
    }

    // Method 3: Auto-generate (development only)
    if (process.env.WORKER_AUTO_GENERATE_KEY === 'true' || process.env.NODE_ENV === 'development') {
      this.keyPair = this.generateKeyPair();
      console.warn('[SigningService] WARNING: Auto-generated key pair. This should NOT be used in production.');
      console.log(`[SigningService] Public key: ${this.keyPair.publicKeyHex}`);
      
      // Optionally save the key
      if (keyPath) {
        fs.mkdirSync(path.dirname(keyPath), { recursive: true });
        fs.writeFileSync(keyPath, this.keyPair.privateKeyHex, { mode: 0o600 });
        console.log(`[SigningService] Saved generated key to ${keyPath}`);
      }
      
      this.initialized = true;
      return;
    }

    throw new Error(
      'Worker signing key not configured. Set WORKER_PRIVATE_KEY or WORKER_KEY_PATH, ' +
      'or set WORKER_AUTO_GENERATE_KEY=true for development.'
    );
  }

  /**
   * Generate a new ed25519 key pair.
   */
  generateKeyPair(): KeyPair {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });

    // Extract raw keys from DER format
    // ed25519 public key is last 32 bytes of SPKI DER
    // ed25519 private key is last 32 bytes of PKCS8 DER (seed)
    const rawPublicKey = publicKey.slice(-32);
    const rawPrivateKey = privateKey.slice(-32);

    return {
      publicKey: rawPublicKey,
      privateKey: rawPrivateKey,
      publicKeyHex: rawPublicKey.toString('hex'),
      privateKeyHex: rawPrivateKey.toString('hex'),
    };
  }

  /**
   * Load key pair from hex-encoded private key.
   * 
   * The private key can be:
   * - 32-byte seed (64 hex chars)
   * - 64-byte full private key (128 hex chars, seed + public)
   */
  loadFromHex(hexKey: string): KeyPair {
    // Clean input
    const cleanHex = hexKey.replace(/^0x/, '').toLowerCase();
    
    let seed: Buffer;
    if (cleanHex.length === 64) {
      // 32-byte seed
      seed = Buffer.from(cleanHex, 'hex');
    } else if (cleanHex.length === 128) {
      // 64-byte full key (seed is first 32 bytes)
      seed = Buffer.from(cleanHex.substring(0, 64), 'hex');
    } else {
      throw new Error(`Invalid private key length: expected 64 or 128 hex chars, got ${cleanHex.length}`);
    }

    // Generate public key from seed
    const privateKeyDer = this.seedToPkcs8(seed);
    const keyObject = crypto.createPrivateKey({
      key: privateKeyDer,
      format: 'der',
      type: 'pkcs8',
    });

    const publicKeyObject = crypto.createPublicKey(keyObject);
    const publicKeyDer = publicKeyObject.export({ type: 'spki', format: 'der' });
    const rawPublicKey = Buffer.from(publicKeyDer.slice(-32));

    return {
      publicKey: rawPublicKey,
      privateKey: seed,
      publicKeyHex: rawPublicKey.toString('hex'),
      privateKeyHex: seed.toString('hex'),
    };
  }

  /**
   * Convert a 32-byte seed to PKCS8 DER format for Node's crypto API.
   */
  private seedToPkcs8(seed: Buffer): Buffer {
    // PKCS8 header for ed25519
    const pkcs8Header = Buffer.from([
      0x30, 0x2e, // SEQUENCE, length 46
      0x02, 0x01, 0x00, // INTEGER 0 (version)
      0x30, 0x05, // SEQUENCE, length 5
      0x06, 0x03, 0x2b, 0x65, 0x70, // OID 1.3.101.112 (ed25519)
      0x04, 0x22, // OCTET STRING, length 34
      0x04, 0x20, // OCTET STRING, length 32
    ]);
    return Buffer.concat([pkcs8Header, seed]);
  }

  /**
   * Get the public key (hex-encoded).
   */
  getPublicKey(): string {
    if (!this.initialized) {
      throw new Error('SigningService not initialized. Call initialize() first.');
    }
    return this.keyPair.publicKeyHex;
  }

  /**
   * Get the public key as a Buffer.
   */
  getPublicKeyBuffer(): Buffer {
    if (!this.initialized) {
      throw new Error('SigningService not initialized. Call initialize() first.');
    }
    return this.keyPair.publicKey;
  }

  /**
   * Sign a message (string or Buffer).
   * 
   * @param message - The message to sign
   * @returns Signature result with hex-encoded signature and public key
   */
  sign(message: string | Buffer): SignatureResult {
    if (!this.initialized) {
      throw new Error('SigningService not initialized. Call initialize() first.');
    }

    const messageBuffer = typeof message === 'string' ? Buffer.from(message) : message;
    
    // Create private key object
    const privateKeyDer = this.seedToPkcs8(this.keyPair.privateKey);
    const keyObject = crypto.createPrivateKey({
      key: privateKeyDer,
      format: 'der',
      type: 'pkcs8',
    });

    // Sign
    const signature = crypto.sign(null, messageBuffer, keyObject);

    return {
      signature: signature.toString('hex'),
      publicKey: this.keyPair.publicKeyHex,
    };
  }

  /**
   * Sign a hash (hex-encoded).
   * 
   * @param hashHex - The hash to sign (hex string)
   * @returns Signature result
   */
  signHash(hashHex: string): SignatureResult {
    const hashBuffer = Buffer.from(hashHex.replace(/^0x/, ''), 'hex');
    return this.sign(hashBuffer);
  }

  /**
   * Verify a signature.
   * 
   * @param message - The original message
   * @param signatureHex - The signature (hex-encoded)
   * @param publicKeyHex - The public key (hex-encoded)
   * @returns True if signature is valid
   */
  static verify(message: string | Buffer, signatureHex: string, publicKeyHex: string): boolean {
    try {
      const messageBuffer = typeof message === 'string' ? Buffer.from(message) : message;
      const signatureBuffer = Buffer.from(signatureHex.replace(/^0x/, ''), 'hex');
      const publicKeyBuffer = Buffer.from(publicKeyHex.replace(/^0x/, ''), 'hex');

      // Create public key object from raw bytes
      const spkiHeader = Buffer.from([
        0x30, 0x2a, // SEQUENCE, length 42
        0x30, 0x05, // SEQUENCE, length 5
        0x06, 0x03, 0x2b, 0x65, 0x70, // OID 1.3.101.112 (ed25519)
        0x03, 0x21, 0x00, // BIT STRING, length 33, 0 unused bits
      ]);
      const publicKeyDer = Buffer.concat([spkiHeader, publicKeyBuffer]);

      const keyObject = crypto.createPublicKey({
        key: publicKeyDer,
        format: 'der',
        type: 'spki',
      });

      return crypto.verify(null, messageBuffer, keyObject, signatureBuffer);
    } catch (error) {
      console.error('[SigningService] Verification error:', error);
      return false;
    }
  }

  /**
   * Verify a hash signature.
   */
  static verifyHash(hashHex: string, signatureHex: string, publicKeyHex: string): boolean {
    const hashBuffer = Buffer.from(hashHex.replace(/^0x/, ''), 'hex');
    return WorkerSigningService.verify(hashBuffer, signatureHex, publicKeyHex);
  }

  /**
   * Check if service is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Export the key pair for backup.
   * WARNING: Handle with care - contains private key.
   */
  exportKeyPair(): { publicKey: string; privateKey: string } {
    if (!this.initialized) {
      throw new Error('SigningService not initialized.');
    }
    return {
      publicKey: this.keyPair.publicKeyHex,
      privateKey: this.keyPair.privateKeyHex,
    };
  }
}

// Singleton instance for the worker
let signingServiceInstance: WorkerSigningService | null = null;

/**
 * Get or create the worker signing service instance.
 */
export function getWorkerSigningService(): WorkerSigningService {
  if (!signingServiceInstance) {
    signingServiceInstance = new WorkerSigningService();
  }
  return signingServiceInstance;
}

/**
 * Initialize and return the worker signing service.
 */
export async function initializeWorkerSigningService(): Promise<WorkerSigningService> {
  const service = getWorkerSigningService();
  await service.initialize();
  return service;
}

/**
 * Reset the singleton (for testing).
 */
export function resetWorkerSigningService(): void {
  signingServiceInstance = null;
}