import { QuantuLabsIdentityRegistry } from '../quantulabs/identity';
import { RegistryCapabilityError } from '../ISolanaIdentityRegistry';
import type { QuantuLabsConnection } from '../quantulabs/connection';

describe('QuantuLabsIdentityRegistry (no identity support)', () => {
  const mockConnection = {
    getSDK: () => ({}),
    capabilities: { identityRegistration: false, reputation: true },
  } as unknown as QuantuLabsConnection;

  let registry: QuantuLabsIdentityRegistry;

  beforeEach(() => {
    registry = new QuantuLabsIdentityRegistry(mockConnection);
  });

  it('has correct registry name', () => {
    expect(registry.registryName).toBe('quantulabs');
  });

  it('supports agent asset type', () => {
    expect(registry.supportedAssetTypes).toEqual(['agent']);
  });

  it('capabilities reflect no identity support', () => {
    expect(registry.capabilities).toEqual({
      register: false, resolve: false, sync: false, deregister: false,
    });
  });

  it('register throws RegistryCapabilityError', async () => {
    const passport = { passport_id: 'p1', type: 'agent', owner: 'x', metadata: {}, status: 'active', created_at: 0, updated_at: 0 } as any;
    await expect(registry.register(passport)).rejects.toThrow(RegistryCapabilityError);
  });

  it('resolve throws RegistryCapabilityError', async () => {
    await expect(registry.resolve('agent-1')).rejects.toThrow(RegistryCapabilityError);
  });

  it('isAvailable returns false', async () => {
    expect(await registry.isAvailable()).toBe(false);
  });
});

describe('QuantuLabsIdentityRegistry (with identity support)', () => {
  const mockSdk = {
    register: jest.fn().mockResolvedValue({ id: 'ql-agent-1', txHash: 'tx-abc' }),
    getAgent: jest.fn().mockResolvedValue({ id: 'ql-agent-1', owner: '3Qm', name: 'Test', description: 'D' }),
    updateAgent: jest.fn().mockResolvedValue({ txHash: 'tx-update' }),
  };

  const mockConnection = {
    getSDK: () => mockSdk,
    capabilities: { identityRegistration: true, reputation: true },
  } as unknown as QuantuLabsConnection;

  let registry: QuantuLabsIdentityRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new QuantuLabsIdentityRegistry(mockConnection);
  });

  it('capabilities reflect identity support', () => {
    expect(registry.capabilities.register).toBe(true);
    expect(registry.capabilities.resolve).toBe(true);
    expect(registry.capabilities.sync).toBe(true);
  });

  it('register calls SDK and returns result', async () => {
    const passport = {
      passport_id: 'p1', type: 'agent' as const, owner: '3Qm', name: 'Agent',
      description: 'Test', metadata: {}, status: 'active' as const,
      nft_mint: 'Mint123', created_at: 0, updated_at: 0,
    } as any;

    const result = await registry.register(passport);
    expect(result.registryName).toBe('quantulabs');
    expect(result.externalId).toBe('ql-agent-1');
    expect(mockSdk.register).toHaveBeenCalled();
  });

  it('resolve calls SDK and returns ExternalIdentity', async () => {
    const result = await registry.resolve('ql-agent-1');
    expect(result).not.toBeNull();
    expect(result!.registryName).toBe('quantulabs');
    expect(mockSdk.getAgent).toHaveBeenCalledWith('ql-agent-1');
  });

  it('isAvailable returns true', async () => {
    expect(await registry.isAvailable()).toBe(true);
  });
});
