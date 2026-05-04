import { verifyMessage } from 'ethers';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decodeBase58(value: string): Uint8Array {
  const bytes = [0];
  for (const char of value) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base58 character');
    let carry = index;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of value) {
    if (char !== '1') break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

function decodeSignature(signature: string, encoding?: string): Uint8Array {
  if (encoding === 'base58') return decodeBase58(signature);
  return Uint8Array.from(Buffer.from(signature, 'base64'));
}

export function verifyWalletSignature(params: {
  owner: string;
  message: string;
  signature: string;
  signatureEncoding?: 'base64' | 'base58';
}): boolean {
  const owner = params.owner.trim();
  if (owner.startsWith('0x')) {
    const recovered = verifyMessage(params.message, params.signature);
    return recovered.toLowerCase() === owner.toLowerCase();
  }

  const publicKey = new PublicKey(owner);
  const signatureBytes = decodeSignature(params.signature, params.signatureEncoding);
  const messageBytes = new TextEncoder().encode(params.message);
  return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey.toBytes());
}
