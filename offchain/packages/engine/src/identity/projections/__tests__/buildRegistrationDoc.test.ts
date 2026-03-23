import { buildRegistrationDocFromPassport } from '../registration-doc/buildRegistrationDoc';

describe('buildRegistrationDocFromPassport', () => {
  const basePassport = {
    passport_id: 'passport_abc123',
    type: 'agent' as const,
    owner: '3Qmmq...',
    name: 'TestAgent',
    description: 'A test agent',
    status: 'active' as const,
    metadata: {},
    created_at: 1700000000,
    updated_at: 1700000000,
  };

  it('builds doc with correct type field', () => {
    const doc = buildRegistrationDocFromPassport(basePassport);
    expect(doc.type).toBe('https://eips.ethereum.org/EIPS/eip-8004#registration-v1');
  });

  it('maps agent type to autonomous capability', () => {
    const doc = buildRegistrationDocFromPassport(basePassport);
    expect(doc.capabilities).toEqual(['autonomous']);
  });

  it('maps model type to inference capability', () => {
    const doc = buildRegistrationDocFromPassport({ ...basePassport, type: 'model' as const });
    expect(doc.capabilities).toEqual(['inference']);
  });

  it('maps tool type to integration capability', () => {
    const doc = buildRegistrationDocFromPassport({ ...basePassport, type: 'tool' as const });
    expect(doc.capabilities).toEqual(['integration']);
  });

  it('maps compute type to execution capability', () => {
    const doc = buildRegistrationDocFromPassport({ ...basePassport, type: 'compute' as const });
    expect(doc.capabilities).toEqual(['execution']);
  });

  it('maps dataset type to data capability', () => {
    const doc = buildRegistrationDocFromPassport({ ...basePassport, type: 'dataset' as const });
    expect(doc.capabilities).toEqual(['data']);
  });

  it('maps endpoints to services array', () => {
    const doc = buildRegistrationDocFromPassport({
      ...basePassport,
      metadata: {
        endpoints: {
          mcp: { url: 'https://agent.example.com/mcp', type: 'mcp' },
          web: { url: 'https://agent.example.com', type: 'web' },
        },
      },
    });
    expect(doc.services).toEqual([
      { name: 'mcp', endpoint: 'https://agent.example.com/mcp' },
      { name: 'web', endpoint: 'https://agent.example.com' },
    ]);
  });

  it('returns empty services when no endpoints', () => {
    const doc = buildRegistrationDocFromPassport(basePassport);
    expect(doc.services).toEqual([]);
  });

  it('includes nft_mint in registrations when present', () => {
    const doc = buildRegistrationDocFromPassport({
      ...basePassport,
      nft_mint: 'MintPubkey123',
    });
    expect(doc.registrations).toEqual([
      { agentId: 'MintPubkey123', agentRegistry: 'solana:101:metaplex' },
    ]);
  });

  it('returns empty registrations when no nft_mint', () => {
    const doc = buildRegistrationDocFromPassport(basePassport);
    expect(doc.registrations).toEqual([]);
  });

  it('accepts custom agentRegistry', () => {
    const doc = buildRegistrationDocFromPassport(
      { ...basePassport, nft_mint: 'MintPubkey123' },
      { agentRegistry: 'solana:101:quantulabs' },
    );
    expect(doc.registrations![0].agentRegistry).toBe('solana:101:quantulabs');
  });

  it('sets active based on passport status', () => {
    expect(buildRegistrationDocFromPassport(basePassport).active).toBe(true);
    expect(buildRegistrationDocFromPassport({ ...basePassport, status: 'revoked' as const }).active).toBe(false);
  });

  it('always includes reputation in supportedTrust', () => {
    const doc = buildRegistrationDocFromPassport(basePassport);
    expect(doc.supportedTrust).toEqual(['reputation']);
  });

  it('falls back to passport_id for name', () => {
    const doc = buildRegistrationDocFromPassport({ ...basePassport, name: undefined });
    expect(doc.name).toBe('passport_abc123');
  });
});
