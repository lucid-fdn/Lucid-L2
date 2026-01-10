/**
 * Tests for ed25519 signing utilities.
 */
import {
  signMessage,
  verifySignature,
  getOrchestratorPublicKey,
  resetKeypair,
  generateKeypair,
  exportKeypairToHex,
} from '../utils/signing';

describe('signing utilities', () => {
  beforeEach(() => {
    resetKeypair();
  });

  describe('signMessage', () => {
    it('should sign a message and return signature + public key', () => {
      const messageHash = 'a'.repeat(64); // Simulated sha256 hash
      const result = signMessage(messageHash);

      expect(result.signature).toMatch(/^[0-9a-f]{128}$/); // 64 bytes = 128 hex chars
      expect(result.publicKey).toMatch(/^[0-9a-f]{64}$/); // 32 bytes = 64 hex chars
    });

    it('should produce consistent signatures with same keypair', () => {
      const messageHash = 'b'.repeat(64);
      const result1 = signMessage(messageHash);
      const result2 = signMessage(messageHash);

      expect(result1.signature).toBe(result2.signature);
      expect(result1.publicKey).toBe(result2.publicKey);
    });

    it('should produce different signatures for different messages', () => {
      const hash1 = 'a'.repeat(64);
      const hash2 = 'b'.repeat(64);
      const sig1 = signMessage(hash1);
      const sig2 = signMessage(hash2);

      expect(sig1.signature).not.toBe(sig2.signature);
    });
  });

  describe('verifySignature', () => {
    it('should verify a valid signature', () => {
      const messageHash = 'c'.repeat(64);
      const { signature, publicKey } = signMessage(messageHash);

      const valid = verifySignature(messageHash, signature, publicKey);
      expect(valid).toBe(true);
    });

    it('should reject signature with wrong message', () => {
      const messageHash = 'd'.repeat(64);
      const { signature, publicKey } = signMessage(messageHash);

      const wrongMessage = 'e'.repeat(64);
      const valid = verifySignature(wrongMessage, signature, publicKey);
      expect(valid).toBe(false);
    });

    it('should reject signature with wrong public key', () => {
      const messageHash = 'f'.repeat(64);
      const { signature } = signMessage(messageHash);

      // Generate a different keypair's public key
      const otherKeypair = generateKeypair();
      const otherPubkey = Buffer.from(otherKeypair.publicKey).toString('hex');

      const valid = verifySignature(messageHash, signature, otherPubkey);
      expect(valid).toBe(false);
    });

    it('should reject malformed signatures', () => {
      const messageHash = '0'.repeat(64);

      // Too short signature
      expect(verifySignature(messageHash, 'abc', '0'.repeat(64))).toBe(false);

      // Too short public key
      expect(verifySignature(messageHash, '0'.repeat(128), 'abc')).toBe(false);

      // Invalid hex
      expect(verifySignature(messageHash, 'xyz'.repeat(43), '0'.repeat(64))).toBe(false);
    });
  });

  describe('getOrchestratorPublicKey', () => {
    it('should return consistent public key', () => {
      const pk1 = getOrchestratorPublicKey();
      const pk2 = getOrchestratorPublicKey();

      expect(pk1).toBe(pk2);
      expect(pk1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should match signMessage public key', () => {
      const { publicKey } = signMessage('0'.repeat(64));
      const orchestratorPk = getOrchestratorPublicKey();

      expect(publicKey).toBe(orchestratorPk);
    });
  });

  describe('generateKeypair and exportKeypairToHex', () => {
    it('should generate a valid keypair', () => {
      const keypair = generateKeypair();

      expect(keypair.publicKey).toHaveLength(32);
      expect(keypair.secretKey).toHaveLength(64);
    });

    it('should export keypair to hex strings', () => {
      const keypair = generateKeypair();
      const exported = exportKeypairToHex(keypair);

      expect(exported.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
      expect(exported.secretKeyHex).toMatch(/^[0-9a-f]{128}$/);
    });
  });
});
