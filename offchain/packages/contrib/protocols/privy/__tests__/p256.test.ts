import crypto from 'crypto';
import { SignatureGenerator, generateKeyPair } from '../SignatureGenerator';

describe('Privy P-256 signing', () => {
  it('generates keys and DER-encoded signatures with native crypto', () => {
    const keyPair = generateKeyPair();
    expect(keyPair.privateKey).toMatch(/^[0-9a-f]{64}$/);
    expect(keyPair.publicKey).toMatch(/^04[0-9a-f]{128}$/);
    expect(keyPair.publicKeyPEM).toContain('BEGIN PUBLIC KEY');

    const generator = new SignatureGenerator(keyPair.privateKey);
    const signatureHex = generator.sign({ userId: 'user_123', action: 'sign' });
    expect(signatureHex).toMatch(/^[0-9a-f]+$/);

    const publicKey = crypto.createPublicKey(keyPair.publicKeyPEM);
    const isValid = crypto.verify(
      'sha256',
      Buffer.from(JSON.stringify({ userId: 'user_123', action: 'sign' })),
      publicKey,
      Buffer.from(signatureHex, 'hex'),
    );
    expect(isValid).toBe(true);
  });
});
