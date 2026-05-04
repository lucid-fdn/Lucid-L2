/**
 * Signature Generator for Privy REST API Authorization
 * 
 * Generates ECDSA signatures for Privy authorization-signature headers.
 * Uses native P-256 cryptography for signing payloads.
 */

import * as fs from 'fs';
import {
  createP256PrivateKey,
  generateP256KeyPair,
  getP256PublicKeyHex,
  getP256PublicKeyPEM,
  signP256DerHex,
} from './p256';

export class SignatureGenerator {
  private privateKey: ReturnType<typeof createP256PrivateKey>;

  constructor(privateKeyPath: string) {
    // Load private key from file or use directly if it's a hex string.
    if (fs.existsSync(privateKeyPath)) {
      const pemContent = fs.readFileSync(privateKeyPath, 'utf8');
      this.privateKey = createP256PrivateKey(pemContent);
    } else {
      this.privateKey = createP256PrivateKey(privateKeyPath);
    }
  }

  /**
   * Generate authorization signature for Privy API request
   * 
   * @param payload - The request payload to sign (JSON stringified body)
   * @returns Hex-encoded signature
   */
  sign(payload: any): string {
    return signP256DerHex(this.privateKey, payload);
  }

  /**
   * Generate signature with timestamp for time-based verification
   */
  signWithTimestamp(payload: any): { signature: string; timestamp: number } {
    const timestamp = Date.now();
    const payloadWithTimestamp = {
      ...payload,
      timestamp
    };
    
    return {
      signature: this.sign(payloadWithTimestamp),
      timestamp
    };
  }

  /**
   * Get public key in hex format
   */
  getPublicKey(): string {
    return getP256PublicKeyHex(this.privateKey);
  }

  /**
   * Get public key in PEM format for Privy Dashboard
   */
  getPublicKeyPEM(): string {
    return getP256PublicKeyPEM(this.privateKey);
  }
}

/**
 * Utility function to generate a new key pair for testing
 */
export function generateKeyPair(): { privateKey: string; publicKey: string; publicKeyPEM: string } {
  return generateP256KeyPair();
}
