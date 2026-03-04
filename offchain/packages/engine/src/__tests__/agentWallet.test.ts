/**
 * Agent Wallet Providers — Comprehensive Tests
 *
 * Tests all 3 wallet providers:
 * - CrossmintWalletProvider
 * - ERC6551WalletProvider
 * - MockWalletProvider
 *
 * Also tests factory: getAgentWalletProvider, resetAgentWalletProvider
 */

import { MockWalletProvider } from '../agent/wallet/MockWalletProvider';
import { CrossmintWalletProvider } from '../agent/wallet/CrossmintWalletProvider';
import { ERC6551WalletProvider } from '../agent/wallet/ERC6551WalletProvider';
import {
  getAgentWalletProvider,
  resetAgentWalletProvider,
} from '../agent/wallet';
import type {
  AgentWallet,
  WalletBalance,
  TransactionResult,
  SpendingLimits,
} from '../agent/wallet/IAgentWalletProvider';

const PASSPORT_ID = 'passport_wallet_test_abc';

// ---------------------------------------------------------------------------
// Mock global fetch for API-based providers
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;
let mockFetch: jest.Mock;

beforeEach(() => {
  mockFetch = jest.fn();
  global.fetch = mockFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ===========================================================================
// MockWalletProvider
// ===========================================================================

describe('MockWalletProvider', () => {
  let provider: MockWalletProvider;

  beforeEach(() => {
    provider = new MockWalletProvider();
    // Restore real fetch — MockWalletProvider does not use fetch
    global.fetch = originalFetch;
  });

  it('should have correct identity properties', () => {
    expect(provider.providerName).toBe('mock');
    expect(provider.chain).toBe('mock');
  });

  describe('createWallet', () => {
    it('should return an AgentWallet with a mock address', async () => {
      const wallet = await provider.createWallet(PASSPORT_ID);
      expect(wallet.address).toMatch(/^mock_/);
      expect(wallet.chain).toBe('mock');
      expect(wallet.provider).toBe('mock');
      expect(wallet.agent_passport_id).toBe(PASSPORT_ID);
      expect(typeof wallet.created_at).toBe('number');
    });

    it('should create unique addresses for different agents', async () => {
      const w1 = await provider.createWallet('agent_1');
      const w2 = await provider.createWallet('agent_2');
      expect(w1.address).not.toBe(w2.address);
    });

    it('should accept an optional chain parameter', async () => {
      const wallet = await provider.createWallet(PASSPORT_ID, 'solana-devnet');
      expect(wallet.chain).toBe('solana-devnet');
    });
  });

  describe('getWallet', () => {
    it('should return the created wallet', async () => {
      const created = await provider.createWallet(PASSPORT_ID);
      const retrieved = await provider.getWallet(PASSPORT_ID);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.address).toBe(created.address);
    });

    it('should return null for non-existent agent', async () => {
      const wallet = await provider.getWallet('nonexistent');
      expect(wallet).toBeNull();
    });
  });

  describe('getBalance', () => {
    it('should return default balance after wallet creation', async () => {
      const wallet = await provider.createWallet(PASSPORT_ID);
      const balance = await provider.getBalance(wallet.address);
      expect(balance.address).toBe(wallet.address);
      expect(balance.balances).toHaveLength(1);
      expect(balance.balances[0].token).toBe('MOCK');
      expect(balance.balances[0].amount).toBe('1000.0');
    });

    it('should return empty balances for unknown address', async () => {
      const balance = await provider.getBalance('unknown_addr');
      expect(balance.balances).toHaveLength(0);
    });
  });

  describe('executeTransaction', () => {
    it('should return a successful transaction result', async () => {
      const wallet = await provider.createWallet(PASSPORT_ID);
      const result = await provider.executeTransaction(wallet.address, {
        to: 'recipient_addr',
        amount: '10',
      });
      expect(result.success).toBe(true);
      expect(result.tx_signature).toMatch(/^mock_tx_/);
      expect(result.chain).toBe('mock');
    });

    it('should record transactions in the internal list', async () => {
      const wallet = await provider.createWallet(PASSPORT_ID);
      await provider.executeTransaction(wallet.address, { to: 'r1', amount: '5' });
      await provider.executeTransaction(wallet.address, { to: 'r2', amount: '10' });
      expect(provider.getTransactions()).toHaveLength(2);
    });
  });

  describe('setSpendingLimits', () => {
    it('should store spending limits', async () => {
      const wallet = await provider.createWallet(PASSPORT_ID);
      const limits: SpendingLimits = { per_tx_usd: 1.0, daily_usd: 10.0 };
      await provider.setSpendingLimits(wallet.address, limits);
      const stored = provider.getSpendingLimits(wallet.address);
      expect(stored).toEqual(limits);
    });
  });

  describe('isHealthy', () => {
    it('should always return true', async () => {
      expect(await provider.isHealthy()).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear all internal state', async () => {
      await provider.createWallet(PASSPORT_ID);
      const wallet = await provider.getWallet(PASSPORT_ID);
      await provider.executeTransaction(wallet!.address, { to: 'r', amount: '1' });
      await provider.setSpendingLimits(wallet!.address, { per_tx_usd: 1, daily_usd: 5 });

      provider.reset();

      expect(await provider.getWallet(PASSPORT_ID)).toBeNull();
      expect(provider.getTransactions()).toHaveLength(0);
    });
  });
});

// ===========================================================================
// CrossmintWalletProvider
// ===========================================================================

describe('CrossmintWalletProvider', () => {
  let provider: CrossmintWalletProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CROSSMINT_API_KEY: 'test-crossmint-key',
      CROSSMINT_PROJECT_ID: 'proj_test',
    };
    provider = new CrossmintWalletProvider();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should have correct identity properties', () => {
    expect(provider.providerName).toBe('crossmint');
    expect(provider.chain).toBe('solana');
  });

  describe('createWallet', () => {
    it('should create a wallet via Crossmint API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ address: 'So1ana1234567890abcdefgh' }),
      });

      const wallet = await provider.createWallet(PASSPORT_ID);
      expect(wallet.address).toBe('So1ana1234567890abcdefgh');
      expect(wallet.chain).toBe('solana');
      expect(wallet.provider).toBe('crossmint');
      expect(wallet.agent_passport_id).toBe(PASSPORT_ID);
    });

    it('should send correct payload to Crossmint API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ address: 'test_addr' }),
      });

      await provider.createWallet(PASSPORT_ID);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('/wallets');
      const body = JSON.parse(callArgs[1].body);
      expect(body.type).toBe('solana-smart-wallet');
      expect(body.linkedUser).toContain(PASSPORT_ID);
    });

    it('should throw when CROSSMINT_API_KEY is not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.CROSSMINT_API_KEY;
      const p = new CrossmintWalletProvider();
      await expect(p.createWallet(PASSPORT_ID)).rejects.toThrow('CROSSMINT_API_KEY');
    });

    it('should throw when API returns error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Bad request',
      });

      await expect(provider.createWallet(PASSPORT_ID)).rejects.toThrow('Crossmint wallet creation failed');
    });

    it('should use publicKey field when address is not present', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ publicKey: 'pubkey_solana_abc' }),
      });

      const wallet = await provider.createWallet(PASSPORT_ID);
      expect(wallet.address).toBe('pubkey_solana_abc');
    });
  });

  describe('getWallet', () => {
    it('should return cached wallet without API call', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ address: 'cached_addr' }),
      });

      // Create first (populates cache)
      await provider.createWallet(PASSPORT_ID);
      mockFetch.mockClear();

      // Get should use cache
      const wallet = await provider.getWallet(PASSPORT_ID);
      expect(wallet).not.toBeNull();
      expect(wallet!.address).toBe('cached_addr');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch from API when not cached', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ address: 'fetched_addr' }),
      });

      const wallet = await provider.getWallet('uncached_agent');
      expect(wallet).not.toBeNull();
      expect(wallet!.address).toBe('fetched_addr');
    });

    it('should return null when API key is not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.CROSSMINT_API_KEY;
      const p = new CrossmintWalletProvider();
      const wallet = await p.getWallet('any_agent');
      expect(wallet).toBeNull();
    });

    it('should return null when API returns error', async () => {
      mockFetch.mockResolvedValue({ ok: false });
      const wallet = await provider.getWallet('error_agent');
      expect(wallet).toBeNull();
    });
  });

  describe('getBalance', () => {
    it('should return balance from Crossmint API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          balances: [
            { token: 'SOL', amount: '2.5', decimals: 9, usdValue: 375.0 },
          ],
        }),
      });

      const balance = await provider.getBalance('sol_wallet_addr');
      expect(balance.address).toBe('sol_wallet_addr');
      expect(balance.balances).toHaveLength(1);
      expect(balance.balances[0].token).toBe('SOL');
      expect(balance.balances[0].usd_value).toBe(375.0);
    });

    it('should throw when API key is not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.CROSSMINT_API_KEY;
      const p = new CrossmintWalletProvider();
      await expect(p.getBalance('addr')).rejects.toThrow('CROSSMINT_API_KEY');
    });
  });

  describe('executeTransaction', () => {
    it('should execute a transaction via Crossmint API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ txSignature: 'sig_abc123' }),
      });

      const result = await provider.executeTransaction('wallet_addr', {
        to: 'recipient',
        amount: '1.0',
        token_mint: 'SOL',
      });
      expect(result.success).toBe(true);
      expect(result.tx_signature).toBe('sig_abc123');
      expect(result.chain).toBe('solana');
    });

    it('should return failure when API returns error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Insufficient funds',
      });

      const result = await provider.executeTransaction('wallet_addr', {
        to: 'recipient',
        amount: '1000000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient funds');
    });
  });

  describe('setSpendingLimits', () => {
    it('should send limits to Crossmint API', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await provider.setSpendingLimits('wallet_addr', {
        per_tx_usd: 5.0,
        daily_usd: 50.0,
      });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('/limits');
      const body = JSON.parse(callArgs[1].body);
      expect(body.perTransaction).toBe(5.0);
      expect(body.daily).toBe(50.0);
    });

    it('should throw when API key is not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.CROSSMINT_API_KEY;
      const p = new CrossmintWalletProvider();
      await expect(
        p.setSpendingLimits('addr', { per_tx_usd: 1, daily_usd: 10 })
      ).rejects.toThrow('CROSSMINT_API_KEY');
    });
  });

  describe('isHealthy', () => {
    it('should return true when API key is set', async () => {
      expect(await provider.isHealthy()).toBe(true);
    });

    it('should return false when API key is not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.CROSSMINT_API_KEY;
      const p = new CrossmintWalletProvider();
      expect(await p.isHealthy()).toBe(false);
    });
  });
});

// ===========================================================================
// ERC6551WalletProvider
// ===========================================================================

describe('ERC6551WalletProvider', () => {
  let provider: ERC6551WalletProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, EVM_RPC_URL: 'https://mock-rpc.example.com' };
    provider = new ERC6551WalletProvider();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should have correct identity properties', () => {
    expect(provider.providerName).toBe('erc6551');
    expect(provider.chain).toBe('evm');
  });

  describe('createWallet', () => {
    it('should return a deterministic 0x address derived from passport ID', async () => {
      const wallet = await provider.createWallet(PASSPORT_ID);
      expect(wallet.address).toMatch(/^0x[a-f0-9]{40}$/);
      expect(wallet.chain).toBe('base');
      expect(wallet.provider).toBe('erc6551');
      expect(wallet.agent_passport_id).toBe(PASSPORT_ID);
    });

    it('should produce deterministic addresses for the same passport ID', async () => {
      const w1 = await provider.createWallet(PASSPORT_ID);
      const p2 = new ERC6551WalletProvider();
      const w2 = await p2.createWallet(PASSPORT_ID);
      expect(w1.address).toBe(w2.address);
    });

    it('should produce different addresses for different passport IDs', async () => {
      const w1 = await provider.createWallet('agent_a');
      const w2 = await provider.createWallet('agent_b');
      expect(w1.address).not.toBe(w2.address);
    });

    it('should use custom chain when provided', async () => {
      const wallet = await provider.createWallet(PASSPORT_ID, 'polygon');
      expect(wallet.chain).toBe('polygon');
    });
  });

  describe('getWallet', () => {
    it('should return the wallet from cache after creation', async () => {
      const created = await provider.createWallet(PASSPORT_ID);
      const retrieved = await provider.getWallet(PASSPORT_ID);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.address).toBe(created.address);
    });

    it('should return null for non-existent agent', async () => {
      const wallet = await provider.getWallet('nonexistent');
      expect(wallet).toBeNull();
    });
  });

  describe('getBalance', () => {
    it('should query ETH balance via JSON-RPC', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ result: '0xDE0B6B3A7640000' }), // 1 ETH in wei (hex)
      });

      const balance = await provider.getBalance('0x1234567890abcdef1234567890abcdef12345678');
      expect(balance.balances).toHaveLength(1);
      expect(balance.balances[0].token).toBe('ETH');
      expect(parseFloat(balance.balances[0].amount)).toBeGreaterThan(0);
    });

    it('should return empty balances on RPC error', async () => {
      mockFetch.mockRejectedValue(new Error('RPC error'));
      const balance = await provider.getBalance('0xabc');
      expect(balance.balances).toHaveLength(0);
    });
  });

  describe('executeTransaction', () => {
    it('should return error since TBA requires NFT owner signature', async () => {
      const result = await provider.executeTransaction('0xwallet', {
        to: '0xrecipient',
        value: '1000000000000000000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('NFT owner signature');
    });
  });

  describe('setSpendingLimits', () => {
    it('should not throw (logs warning about custom guard contract)', async () => {
      await expect(
        provider.setSpendingLimits('0xwallet', { per_tx_usd: 1, daily_usd: 10 })
      ).resolves.toBeUndefined();
    });
  });

  describe('isHealthy', () => {
    it('should return true when RPC responds', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      expect(await provider.isHealthy()).toBe(true);
    });

    it('should return false when RPC fails', async () => {
      mockFetch.mockRejectedValue(new Error('RPC down'));
      expect(await provider.isHealthy()).toBe(false);
    });
  });
});

// ===========================================================================
// Agent Wallet Factory
// ===========================================================================

describe('Agent Wallet Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetAgentWalletProvider();
  });

  afterEach(() => {
    resetAgentWalletProvider();
    process.env = originalEnv;
  });

  describe('getAgentWalletProvider', () => {
    it('should return MockWalletProvider by default', () => {
      delete process.env.AGENT_WALLET_PROVIDER;
      const provider = getAgentWalletProvider();
      expect(provider.providerName).toBe('mock');
    });

    it('should return MockWalletProvider when env is "mock"', () => {
      process.env.AGENT_WALLET_PROVIDER = 'mock';
      const provider = getAgentWalletProvider();
      expect(provider.providerName).toBe('mock');
    });

    it('should return CrossmintWalletProvider when env is "crossmint"', () => {
      process.env.AGENT_WALLET_PROVIDER = 'crossmint';
      process.env.CROSSMINT_API_KEY = 'test-key';
      const provider = getAgentWalletProvider();
      expect(provider.providerName).toBe('crossmint');
    });

    it('should return ERC6551WalletProvider when env is "erc6551"', () => {
      process.env.AGENT_WALLET_PROVIDER = 'erc6551';
      const provider = getAgentWalletProvider();
      expect(provider.providerName).toBe('erc6551');
    });

    it('should return the same singleton on repeated calls', () => {
      process.env.AGENT_WALLET_PROVIDER = 'mock';
      const p1 = getAgentWalletProvider();
      const p2 = getAgentWalletProvider();
      expect(p1).toBe(p2);
    });

    it('should return a new instance after reset', () => {
      process.env.AGENT_WALLET_PROVIDER = 'mock';
      const p1 = getAgentWalletProvider();
      resetAgentWalletProvider();
      const p2 = getAgentWalletProvider();
      expect(p1).not.toBe(p2);
    });
  });
});
