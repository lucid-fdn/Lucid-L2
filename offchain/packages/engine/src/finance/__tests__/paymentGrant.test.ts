import { createPaymentGrant, verifyPaymentGrant, type PaymentGrant } from '../paymentGrant';

describe('PaymentGrant', () => {
  const secretKey = Buffer.alloc(64); // test key
  const publicKey = Buffer.alloc(32);

  beforeAll(async () => {
    const nacl = await import('tweetnacl');
    const pair = nacl.sign.keyPair();
    secretKey.set(pair.secretKey);
    publicKey.set(pair.publicKey);
  });

  it('should create and verify a valid grant', async () => {
    const grant = await createPaymentGrant({
      tenant_id: 'tenant_1',
      agent_passport_id: 'agent_1',
      run_id: 'run_1',
      scope: { models: ['*'], tools: ['*'], max_per_call_usd: 1.0 },
      limits: { total_usd: 100, expires_at: Math.floor(Date.now() / 1000) + 3600, max_calls: 1000 },
      attestation: { balance_verified_at: Math.floor(Date.now() / 1000), balance_source: 'credit' },
    }, secretKey);

    expect(grant.grant_id).toBeDefined();
    expect(grant.grant_id).toMatch(/^grant_/);
    expect(grant.signature).toBeDefined();
    expect(grant.signer_pubkey).toBeDefined();

    const result = verifyPaymentGrant(grant, publicKey.toString('hex'));
    expect(result.valid).toBe(true);
  });

  it('should reject expired grant', () => {
    const grant: PaymentGrant = {
      grant_id: 'g1',
      tenant_id: 't1',
      agent_passport_id: 'a1',
      run_id: 'r1',
      scope: { models: ['*'], tools: ['*'], max_per_call_usd: 1.0 },
      limits: { total_usd: 100, expires_at: Math.floor(Date.now() / 1000) - 100, max_calls: 1000 },
      attestation: { balance_verified_at: 0, balance_source: 'credit' },
      signature: 'fake',
      signer_pubkey: 'fake',
    };

    const result = verifyPaymentGrant(grant, 'fake');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('should reject tampered grant', async () => {
    const grant = await createPaymentGrant({
      tenant_id: 'tenant_1',
      agent_passport_id: 'agent_1',
      run_id: 'run_1',
      scope: { models: ['*'], tools: ['*'], max_per_call_usd: 1.0 },
      limits: { total_usd: 100, expires_at: Math.floor(Date.now() / 1000) + 3600, max_calls: 1000 },
      attestation: { balance_verified_at: Math.floor(Date.now() / 1000), balance_source: 'credit' },
    }, secretKey);

    // Tamper with the grant
    grant.limits.total_usd = 999999;

    const result = verifyPaymentGrant(grant, publicKey.toString('hex'));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('signature');
  });

  it('should reject wrong signer', async () => {
    const grant = await createPaymentGrant({
      tenant_id: 'tenant_1',
      agent_passport_id: 'agent_1',
      run_id: 'run_1',
      scope: { models: ['*'], tools: ['*'], max_per_call_usd: 1.0 },
      limits: { total_usd: 100, expires_at: Math.floor(Date.now() / 1000) + 3600, max_calls: 1000 },
      attestation: { balance_verified_at: Math.floor(Date.now() / 1000), balance_source: 'credit' },
    }, secretKey);

    // Use a different "trusted" key
    const otherPubkey = Buffer.alloc(32, 0xab).toString('hex');
    const result = verifyPaymentGrant(grant, otherPubkey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('trusted');
  });
});
