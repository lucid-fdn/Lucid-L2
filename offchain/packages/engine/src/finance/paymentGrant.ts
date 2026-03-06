import { createHash, randomUUID } from 'crypto';
import * as nacl from 'tweetnacl';
import { canonicalJson } from '../crypto/canonicalJson';

export interface PaymentGrantScope {
  models: string[];
  tools: string[];
  max_per_call_usd: number;
}

export interface PaymentGrantLimits {
  total_usd: number;
  expires_at: number;
  max_calls: number;
}

export interface PaymentGrantAttestation {
  balance_verified_at: number;
  balance_source: 'escrow' | 'credit' | 'prepaid';
}

export interface PaymentGrant {
  grant_id: string;
  tenant_id: string;
  agent_passport_id: string;
  run_id: string;
  scope: PaymentGrantScope;
  limits: PaymentGrantLimits;
  attestation: PaymentGrantAttestation;
  signature: string;
  signer_pubkey: string;
}

export interface PaymentGrantInput {
  tenant_id: string;
  agent_passport_id: string;
  run_id: string;
  scope: PaymentGrantScope;
  limits: PaymentGrantLimits;
  attestation: PaymentGrantAttestation;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

/**
 * Create a signed PaymentGrant.
 * Signs Ed25519(SHA-256(canonicalJson(payload))).
 */
export async function createPaymentGrant(
  input: PaymentGrantInput,
  secretKey: Uint8Array,
): Promise<PaymentGrant> {
  const grant_id = `grant_${randomUUID()}`;
  const pubkey = nacl.sign.keyPair.fromSecretKey(secretKey).publicKey;

  const payload = {
    grant_id,
    tenant_id: input.tenant_id,
    agent_passport_id: input.agent_passport_id,
    run_id: input.run_id,
    scope: input.scope,
    limits: input.limits,
    attestation: input.attestation,
  };

  const message = Buffer.from(canonicalJson(payload), 'utf8');
  const digest = createHash('sha256').update(message).digest();
  const sig = nacl.sign.detached(digest, secretKey);

  return {
    ...payload,
    signature: Buffer.from(sig).toString('hex'),
    signer_pubkey: Buffer.from(pubkey).toString('hex'),
  };
}

/**
 * Verify a PaymentGrant signature and expiry.
 * Does NOT check balance — that's the issuer's responsibility at issuance time.
 */
export function verifyPaymentGrant(
  grant: PaymentGrant,
  trustedSignerPubkey: string,
): VerifyResult {
  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (grant.limits.expires_at < now) {
    return { valid: false, reason: `Grant expired at ${grant.limits.expires_at}, now ${now}` };
  }

  // Check signer matches trusted key
  if (grant.signer_pubkey !== trustedSignerPubkey) {
    return { valid: false, reason: 'Signer pubkey does not match trusted key' };
  }

  // Verify signature
  try {
    const payload = {
      grant_id: grant.grant_id,
      tenant_id: grant.tenant_id,
      agent_passport_id: grant.agent_passport_id,
      run_id: grant.run_id,
      scope: grant.scope,
      limits: grant.limits,
      attestation: grant.attestation,
    };

    const message = Buffer.from(canonicalJson(payload), 'utf8');
    const digest = createHash('sha256').update(message).digest();
    const sigBytes = Buffer.from(grant.signature, 'hex');
    const pubkeyBytes = Buffer.from(grant.signer_pubkey, 'hex');

    const valid = nacl.sign.detached.verify(digest, sigBytes, pubkeyBytes);
    if (!valid) {
      return { valid: false, reason: 'Invalid signature' };
    }
  } catch {
    return { valid: false, reason: 'Signature verification error' };
  }

  return { valid: true };
}
