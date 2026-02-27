/**
 * Tests for D1: Cross-Chain Identity Bridge
 *
 * - SolanaAdapter (mocked Connection)
 * - CAIP-10 utilities
 * - IdentityBridgeService (in-memory storage)
 */

import { SolanaAdapter } from '../blockchain/solana/SolanaAdapter';
import {
  toCaip10,
  fromCaip10,
  validateCaip10,
  solanaCaip10,
  evmCaip10,
  isSolanaCaip10,
  isEvmCaip10,
} from '../services/identity/caip10';
import { IdentityBridgeService } from '../services/identity/identityBridgeService';

// =============================================================================
// CAIP-10 Utilities
// =============================================================================

describe('CAIP-10 Utilities', () => {
  describe('toCaip10', () => {
    it('builds Solana CAIP-10 string', () => {
      const result = toCaip10('solana', 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1', 'AbC123def');
      expect(result).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:AbC123def');
    });

    it('builds EVM CAIP-10 string', () => {
      const result = toCaip10('eip155', '8453', '0x1234567890abcdef');
      expect(result).toBe('eip155:8453:0x1234567890abcdef');
    });
  });

  describe('fromCaip10', () => {
    it('parses Solana CAIP-10', () => {
      const parsed = fromCaip10('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:AbC123def');
      expect(parsed.namespace).toBe('solana');
      expect(parsed.reference).toBe('EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
      expect(parsed.address).toBe('AbC123def');
    });

    it('parses EVM CAIP-10', () => {
      const parsed = fromCaip10('eip155:8453:0xAbC123');
      expect(parsed.namespace).toBe('eip155');
      expect(parsed.reference).toBe('8453');
      expect(parsed.address).toBe('0xAbC123');
    });

    it('throws on invalid format', () => {
      expect(() => fromCaip10('invalid')).toThrow('Invalid CAIP-10 format');
      expect(() => fromCaip10('only:two')).toThrow('Invalid CAIP-10 format');
    });
  });

  describe('validateCaip10', () => {
    it('validates correct CAIP-10 strings', () => {
      expect(validateCaip10('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:AbC123def')).toBe(true);
      expect(validateCaip10('eip155:8453:0x1234567890abcdef')).toBe(true);
    });

    it('rejects invalid strings', () => {
      expect(validateCaip10('')).toBe(false);
      expect(validateCaip10('invalid')).toBe(false);
      expect(validateCaip10('123:ref:addr')).toBe(false); // namespace must start with letter
      expect(validateCaip10('ns::addr')).toBe(false); // empty reference
    });
  });

  describe('convenience functions', () => {
    it('solanaCaip10 builds devnet address', () => {
      const result = solanaCaip10('SomePubKey123', 'devnet');
      expect(result).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:SomePubKey123');
    });

    it('solanaCaip10 builds mainnet address', () => {
      const result = solanaCaip10('SomePubKey123', 'mainnet');
      expect(result).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:SomePubKey123');
    });

    it('evmCaip10 builds Base address', () => {
      const result = evmCaip10('0xABC', 8453);
      expect(result).toBe('eip155:8453:0xABC');
    });

    it('isSolanaCaip10 / isEvmCaip10', () => {
      expect(isSolanaCaip10('solana:ref:addr')).toBe(true);
      expect(isSolanaCaip10('eip155:1:0x123')).toBe(false);
      expect(isEvmCaip10('eip155:8453:0xABC')).toBe(true);
      expect(isEvmCaip10('solana:ref:addr')).toBe(false);
    });
  });
});

// =============================================================================
// SolanaAdapter
// =============================================================================

describe('SolanaAdapter', () => {
  let adapter: SolanaAdapter;

  beforeEach(() => {
    adapter = new SolanaAdapter();
  });

  it('has correct chainType', () => {
    expect(adapter.chainType).toBe('solana');
  });

  it('is not connected initially', () => {
    expect(adapter.isConnected()).toBe(false);
  });

  it('rejects non-solana chain config', async () => {
    await expect(
      adapter.connect({
        chainId: 'base',
        name: 'Base',
        chainType: 'evm',
        rpcUrl: 'https://mainnet.base.org',
        isTestnet: false,
      }),
    ).rejects.toThrow('SolanaAdapter cannot connect to evm chain');
  });

  it('connects with valid Solana config', async () => {
    await adapter.connect({
      chainId: 'solana-devnet',
      name: 'Solana Devnet',
      chainType: 'solana',
      rpcUrl: 'https://api.devnet.solana.com',
      isTestnet: true,
    });

    expect(adapter.isConnected()).toBe(true);
    expect(adapter.chainId).toBe('solana-devnet');
  });

  it('disconnects properly', async () => {
    await adapter.connect({
      chainId: 'solana-devnet',
      name: 'Solana Devnet',
      chainType: 'solana',
      rpcUrl: 'https://api.devnet.solana.com',
      isTestnet: true,
    });

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  describe('when connected', () => {
    beforeEach(async () => {
      await adapter.connect({
        chainId: 'solana-devnet',
        name: 'Solana Devnet',
        chainType: 'solana',
        rpcUrl: 'https://api.devnet.solana.com',
        isTestnet: true,
      });
    });

    afterEach(async () => {
      await adapter.disconnect();
    });

    it('stores validation results locally', async () => {
      const result = await adapter.submitValidation({
        agentTokenId: 'agent-123',
        receiptHash: 'hash-abc',
        valid: true,
        metadata: 'test',
      });

      expect(result.success).toBe(true);
      expect(result.chainId).toBe('solana-devnet');

      const validation = await adapter.getValidation(result.hash);
      expect(validation).not.toBeNull();
      expect(validation!.agentTokenId).toBe('agent-123');
      expect(validation!.valid).toBe(true);
    });

    it('stores reputation data locally', async () => {
      const result = await adapter.submitReputation({
        agentTokenId: 'agent-456',
        score: 85,
        category: 'performance',
      });

      expect(result.success).toBe(true);

      const reputationData = await adapter.readReputation('agent-456');
      expect(reputationData).toHaveLength(1);
      expect(reputationData[0].score).toBe(85);
      expect(reputationData[0].category).toBe('performance');
    });

    it('returns null for unknown validation', async () => {
      const result = await adapter.getValidation('nonexistent');
      expect(result).toBeNull();
    });

    it('returns empty array for unknown reputation', async () => {
      const result = await adapter.readReputation('nonexistent');
      expect(result).toEqual([]);
    });
  });
});

// =============================================================================
// IdentityBridgeService
// =============================================================================

describe('IdentityBridgeService', () => {
  let service: IdentityBridgeService;

  beforeEach(async () => {
    // Reset singletons to get clean state per test
    IdentityBridgeService.reset();
    const { resetIdentityStore, getIdentityStore } = await import('../storage/identityStore');
    resetIdentityStore();

    // Create a fresh store with unique temp dir so no data leaks between tests
    const tmpDir = `/tmp/lucid-test-identity-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const store = getIdentityStore(tmpDir);
    await store.init();

    service = IdentityBridgeService.getInstance();
    await service.init();
  });

  afterEach(async () => {
    IdentityBridgeService.reset();
    const { resetIdentityStore } = await import('../storage/identityStore');
    resetIdentityStore();
  });

  const solanaAddr = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:SolanaPubKey123';
  const evmBaseAddr = 'eip155:8453:0xBaseAddress123';
  const evmEthAddr = 'eip155:1:0xEthAddress456';

  it('links two identities', async () => {
    const link = await service.linkIdentity(solanaAddr, evmBaseAddr, 'sig-proof-123');
    expect(link.linkId).toBeTruthy();
    expect(link.primaryCaip10).toBe(solanaAddr);
    expect(link.linkedCaip10).toBe(evmBaseAddr);
  });

  it('rejects invalid CAIP-10 addresses', async () => {
    await expect(
      service.linkIdentity('invalid', evmBaseAddr),
    ).rejects.toThrow('Invalid CAIP-10 format');
  });

  it('rejects self-linking', async () => {
    await expect(
      service.linkIdentity(solanaAddr, solanaAddr),
    ).rejects.toThrow('Cannot link an identity to itself');
  });

  it('resolves linked identities', async () => {
    await service.linkIdentity(solanaAddr, evmBaseAddr);

    const resolution = service.resolveIdentity(solanaAddr);
    expect(resolution.primaryCaip10).toBe(solanaAddr);
    expect(resolution.linkedIdentities).toHaveLength(1);
    expect(resolution.linkedIdentities[0].caip10).toBe(evmBaseAddr);
    expect(resolution.linkCount).toBe(1);
  });

  it('resolves transitive links', async () => {
    await service.linkIdentity(solanaAddr, evmBaseAddr);
    await service.linkIdentity(evmBaseAddr, evmEthAddr);

    // Querying Solana should find both EVM addresses
    const resolution = service.resolveIdentity(solanaAddr);
    const linkedCaip10s = resolution.linkedIdentities.map(li => li.caip10);
    expect(linkedCaip10s).toContain(evmBaseAddr);
    expect(linkedCaip10s).toContain(evmEthAddr);
  });

  it('gets linked chains', async () => {
    await service.linkIdentity(solanaAddr, evmBaseAddr);
    await service.linkIdentity(solanaAddr, evmEthAddr);

    const chains = service.getLinkedChains(solanaAddr);
    expect(chains).toContain('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
    expect(chains).toContain('eip155:8453');
    expect(chains).toContain('eip155:1');
  });

  it('checks if two addresses are linked', async () => {
    await service.linkIdentity(solanaAddr, evmBaseAddr);

    expect(service.areLinked(solanaAddr, evmBaseAddr)).toBe(true);
    expect(service.areLinked(solanaAddr, evmEthAddr)).toBe(false);
  });

  it('unlinks identities', async () => {
    await service.linkIdentity(solanaAddr, evmBaseAddr);
    expect(service.areLinked(solanaAddr, evmBaseAddr)).toBe(true);

    const deleted = await service.unlinkIdentity(solanaAddr, evmBaseAddr);
    expect(deleted).toBe(true);
    expect(service.areLinked(solanaAddr, evmBaseAddr)).toBe(false);
  });

  it('returns empty for unlinked address', () => {
    const resolution = service.resolveIdentity('solana:ref:unknown');
    expect(resolution.linkedIdentities).toHaveLength(0);
    expect(resolution.linkCount).toBe(0);
  });
});
