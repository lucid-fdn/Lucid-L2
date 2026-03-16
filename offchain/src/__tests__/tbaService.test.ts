/**
 * Tests for D5: ERC-6551 TBA Service
 *
 * - ERC6551RegistryClient (mocked)
 * - TBAService deterministic addresses
 * - TBA resolution for agents
 */

import { ERC6551RegistryClient, ERC6551_REGISTRY_ADDRESS } from '../../packages/engine/src/chain/blockchain/evm/erc6551/ERC6551RegistryClient';

describe('ERC6551RegistryClient', () => {
  it('uses canonical registry address', () => {
    expect(ERC6551_REGISTRY_ADDRESS).toBe('0x000000006551c19487814612e58FE06813775758');
  });

  it('creates client with custom addresses', () => {
    const mockPublicClient = {};
    const mockWalletClient = {};
    const customRegistry = '0x1234567890123456789012345678901234567890';
    const implementation = '0xABCDEF0123456789ABCDEF0123456789ABCDEF01';

    const client = new ERC6551RegistryClient(
      mockPublicClient,
      mockWalletClient,
      customRegistry,
      implementation,
    );

    expect(client).toBeDefined();
  });

  it('creates client without wallet (read-only)', () => {
    const mockPublicClient = {};
    const implementation = '0xABCDEF0123456789ABCDEF0123456789ABCDEF01';

    const client = new ERC6551RegistryClient(
      mockPublicClient,
      null,
      ERC6551_REGISTRY_ADDRESS,
      implementation,
    );

    expect(client).toBeDefined();
  });
});

describe('TBAService', () => {
  // TBAService requires a real blockchain adapter, so we test the interface
  // and deterministic behavior without actual RPC calls

  it('imports successfully', async () => {
    const { TBAService, getTBAService } = await import('../../packages/engine/src/identity/tbaService');
    expect(TBAService).toBeDefined();
    expect(getTBAService).toBeDefined();
  });

  it('singleton returns same instance', async () => {
    const { getTBAService } = await import('../../packages/engine/src/identity/tbaService');
    const a = getTBAService();
    const b = getTBAService();
    expect(a).toBe(b);
  });

  describe('TBA resolution', () => {
    it('returns null for chain without ERC-6551 config', async () => {
      const { getTBAService } = await import('../../packages/engine/src/identity/tbaService');
      const service = getTBAService();

      // solana-devnet has no ERC-6551 config
      const result = await service.resolveTBAForAgent('solana-devnet', '1');
      expect(result).toBeNull();
    });

    it('returns null for unknown chain', async () => {
      const { getTBAService } = await import('../../packages/engine/src/identity/tbaService');
      const service = getTBAService();

      const result = await service.resolveTBAForAgent('nonexistent-chain', '1');
      expect(result).toBeNull();
    });
  });
});

describe('ERC-6551 ABI', () => {
  it('loads ABI correctly', () => {
    const abi = require('../../packages/engine/src/chain/blockchain/evm/erc6551/abis/ERC6551Registry.json');
    expect(Array.isArray(abi)).toBe(true);
    expect(abi.length).toBeGreaterThan(0);

    // Check createAccount function exists
    const createAccount = abi.find((item: any) => item.name === 'createAccount');
    expect(createAccount).toBeDefined();
    expect(createAccount.inputs).toHaveLength(5);

    // Check account view function exists
    const account = abi.find((item: any) => item.name === 'account');
    expect(account).toBeDefined();
    expect(account.stateMutability).toBe('view');
  });
});
