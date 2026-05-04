import crypto from 'crypto';

function base64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function privateKeyFromHex(privateKeyHex: string): crypto.KeyObject {
  const d = Buffer.from(privateKeyHex.replace(/^0x/, ''), 'hex');
  if (d.length !== 32) {
    throw new Error('P-256 private key must be 32 bytes');
  }

  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(d);
  const publicKey = ecdh.getPublicKey(undefined, 'uncompressed');

  return crypto.createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: base64Url(d),
      x: base64Url(publicKey.subarray(1, 33)),
      y: base64Url(publicKey.subarray(33, 65)),
    },
    format: 'jwk',
  });
}

function publicKeyHexFromKeyObject(keyObject: crypto.KeyObject): string {
  const publicJwk = crypto.createPublicKey(keyObject).export({ format: 'jwk' }) as JsonWebKey;
  if (!publicJwk.x || !publicJwk.y) {
    throw new Error('P-256 public key is missing coordinates');
  }

  const x = Buffer.from(publicJwk.x.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const y = Buffer.from(publicJwk.y.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return Buffer.concat([Buffer.from([0x04]), x, y]).toString('hex');
}

export function createP256PrivateKey(input: string): crypto.KeyObject {
  if (input.includes('BEGIN')) {
    return crypto.createPrivateKey(input);
  }

  return privateKeyFromHex(input);
}

export function generateP256KeyPair(): { privateKey: string; publicKey: string; publicKeyPEM: string } {
  const { privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const privateJwk = privateKey.export({ format: 'jwk' }) as JsonWebKey;
  if (!privateJwk.d) {
    throw new Error('Generated P-256 private key is missing private scalar');
  }

  const privateKeyHex = Buffer.from(privateJwk.d.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('hex');
  return {
    privateKey: privateKeyHex,
    publicKey: publicKeyHexFromKeyObject(privateKey),
    publicKeyPEM: getP256PublicKeyPEM(privateKey),
  };
}

export function signP256DerHex(privateKey: crypto.KeyObject, payload: unknown): string {
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto
    .sign('sha256', Buffer.from(message), { key: privateKey, dsaEncoding: 'der' })
    .toString('hex');
}

export function getP256PublicKeyHex(privateKey: crypto.KeyObject): string {
  return publicKeyHexFromKeyObject(privateKey);
}

export function getP256PublicKeyPEM(privateKey: crypto.KeyObject): string {
  return crypto
    .createPublicKey(privateKey)
    .export({ type: 'spki', format: 'pem' })
    .toString();
}
