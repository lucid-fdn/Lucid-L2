/**
 * Signature Generator for Privy REST API Authorization
 * 
 * Generates ECDSA signatures for Privy authorization-signature headers.
 * Uses elliptic curve cryptography (P-256) for signing payloads.
 */

import * as crypto from 'crypto';
import { ec as EC } from 'elliptic';
import * as fs from 'fs';

export class SignatureGenerator {
  private privateKey: string;
  private ec: EC;
  private keyPair: EC.KeyPair;

  constructor(privateKeyPath: string) {
    this.ec = new EC('p256');
    
    // Load private key from file or use directly if it's a hex string
    if (fs.existsSync(privateKeyPath)) {
      const pemContent = fs.readFileSync(privateKeyPath, 'utf8');
      this.privateKey = this.extractPrivateKeyFromPEM(pemContent);
    } else {
      // Assume it's already a hex string
      this.privateKey = privateKeyPath;
    }

    // Create key pair from private key
    this.keyPair = this.ec.keyFromPrivate(this.privateKey, 'hex');
  }

  /**
   * Extract hex private key from PEM format
   */
  private extractPrivateKeyFromPEM(pem: string): string {
    try {
      // Remove PEM headers and newlines
      const pemContent = pem
        .replace('-----BEGIN EC PRIVATE KEY-----', '')
        .replace('-----END EC PRIVATE KEY-----', '')
        .replace(/\s/g, '');
      
      // Decode base64
      const der = Buffer.from(pemContent, 'base64');
      
      // Extract private key from DER (skip ASN.1 structure)
      // For P-256, the private key is 32 bytes
      // DER structure typically has the key after specific markers
      const keyStart = der.indexOf(Buffer.from([0x04, 0x20])) + 2; // OCTET STRING of length 32
      const privateKey = der.slice(keyStart, keyStart + 32);
      
      return privateKey.toString('hex');
    } catch (error) {
      throw new Error(`Failed to parse PEM private key: ${error}`);
    }
  }

  /**
   * Generate authorization signature for Privy API request
   * 
   * @param payload - The request payload to sign (JSON stringified body)
   * @returns Hex-encoded signature
   */
  sign(payload: any): string {
    // Convert payload to canonical JSON string
    const message = typeof payload === 'string' 
      ? payload 
      : JSON.stringify(payload);
    
    // Hash the message
    const messageHash = crypto
      .createHash('sha256')
      .update(message)
      .digest();

    // Sign the hash
    const signature = this.keyPair.sign(messageHash);
    
    // Return DER-encoded signature as hex
    return signature.toDER('hex');
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
    return this.keyPair.getPublic('hex');
  }

  /**
   * Get public key in PEM format for Privy Dashboard
   */
  getPublicKeyPEM(): string {
    const publicKey = this.keyPair.getPublic();
    const x = publicKey.getX().toString('hex', 64);
    const y = publicKey.getY().toString('hex', 64);
    
    // Build uncompressed public key (0x04 + x + y)
    const uncompressed = '04' + x + y;
    
    // Convert to DER format
    const der = this.buildPublicKeyDER(Buffer.from(uncompressed, 'hex'));
    
    // Convert to PEM
    const base64 = der.toString('base64');
    const pem = 
      '-----BEGIN PUBLIC KEY-----\n' +
      base64.match(/.{1,64}/g)!.join('\n') +
      '\n-----END PUBLIC KEY-----';
    
    return pem;
  }

  /**
   * Build DER-encoded public key
   */
  private buildPublicKeyDER(publicKey: Buffer): Buffer {
    // ASN.1 structure for P-256 public key
    const oid = Buffer.from([
      0x06, 0x08, // OID length
      0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07 // prime256v1 OID
    ]);
    
    const algorithm = Buffer.concat([
      Buffer.from([0x30, 0x13]), // SEQUENCE
      Buffer.from([0x06, 0x07]), // OID
      Buffer.from([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]), // ecPublicKey OID
      oid
    ]);
    
    const bitString = Buffer.concat([
      Buffer.from([0x03, publicKey.length + 1, 0x00]), // BIT STRING
      publicKey
    ]);
    
    const der = Buffer.concat([
      Buffer.from([0x30, algorithm.length + bitString.length]), // SEQUENCE
      algorithm,
      bitString
    ]);
    
    return der;
  }
}

/**
 * Utility function to generate a new key pair for testing
 */
export function generateKeyPair(): { privateKey: string; publicKey: string; publicKeyPEM: string } {
  const ec = new EC('p256');
  const keyPair = ec.genKeyPair();
  
  const privateKey = keyPair.getPrivate('hex');
  const publicKey = keyPair.getPublic('hex');
  
  // Build PEM for public key
  const generator = new SignatureGenerator(privateKey);
  const publicKeyPEM = generator.getPublicKeyPEM();
  
  return {
    privateKey,
    publicKey,
    publicKeyPEM
  };
}
