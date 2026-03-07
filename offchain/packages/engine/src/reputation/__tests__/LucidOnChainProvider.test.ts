/**
 * Unit tests for LucidOnChainProvider.
 * Mocks the Anchor program and @solana/web3.js to test on-chain reputation logic.
 */

// ---------------------------------------------------------------------------
// Module mocks — must be declared before imports
// ---------------------------------------------------------------------------

jest.mock('@coral-xyz/anchor', () => ({
  AnchorProvider: { env: jest.fn() },
  Program: jest.fn(),
  web3: {
    PublicKey: {
      findProgramAddressSync: jest.fn().mockReturnValue([{ toBase58: () => 'mockPDA' }, 255]),
    },
    SystemProgram: { programId: 'system' },
  },
  BN: jest.fn().mockImplementation((n: number) => ({ toNumber: () => n })),
}));

jest.mock('@solana/web3.js', () => {
  const mockDefault = { toBase58: () => '11111111111111111111111111111111' };
  return {
    PublicKey: {
      findProgramAddressSync: jest.fn().mockReturnValue([{ toBase58: () => 'mockPDA' }, 255]),
      default: mockDefault,
    },
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { LucidOnChainProvider } from '../providers/LucidOnChainProvider';
import { FeedbackParams, ValidationParams, ASSET_TYPE_MAP } from '../types';

// ---------------------------------------------------------------------------
// Helpers to create mock program
// ---------------------------------------------------------------------------

function createMockProgram() {
  const rpcFn = jest.fn().mockResolvedValue('txHashABC123');

  const methodsChain = {
    accounts: jest.fn().mockReturnValue({ rpc: rpcFn }),
  };

  const methods = {
    initStats: jest.fn().mockReturnValue({
      accounts: jest.fn().mockReturnValue({ rpc: jest.fn().mockResolvedValue('initTx') }),
    }),
    submitFeedback: jest.fn().mockReturnValue(methodsChain),
    submitValidation: jest.fn().mockReturnValue(methodsChain),
  };

  const account = {
    passportStats: {
      fetch: jest.fn(),
    },
    feedbackEntry: {
      fetch: jest.fn(),
    },
    validationEntry: {
      fetch: jest.fn(),
    },
  };

  return {
    programId: { toBase58: () => 'programId123' },
    methods,
    account,
    _rpcFn: rpcFn,
    _methodsChain: methodsChain,
  };
}

function createMockWallet() {
  return {
    publicKey: { toBase58: () => 'walletPubkey123' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LucidOnChainProvider', () => {
  let provider: LucidOnChainProvider;
  let mockProgram: ReturnType<typeof createMockProgram>;
  let mockWallet: ReturnType<typeof createMockWallet>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProgram = createMockProgram();
    mockWallet = createMockWallet();
    provider = new LucidOnChainProvider(mockProgram, mockWallet);
  });

  // -------------------------------------------------------------------------
  // providerName
  // -------------------------------------------------------------------------

  it('should have providerName "lucid-onchain"', () => {
    expect(provider.providerName).toBe('lucid-onchain');
  });

  // -------------------------------------------------------------------------
  // submitFeedback
  // -------------------------------------------------------------------------

  describe('submitFeedback', () => {
    const feedbackParams: FeedbackParams = {
      passportId: 'passport-001',
      score: 90,
      category: 'accuracy',
      receiptHash: 'abcdef0123456789',
      assetType: 'model',
      metadata: 'good output',
    };

    it('should auto-init stats and build correct submit tx', async () => {
      // First fetch → stats doesn't exist (init needed)
      mockProgram.account.passportStats.fetch
        .mockRejectedValueOnce(new Error('Account not found'))
        // After init, fetch succeeds with feedbackCount = 0
        .mockResolvedValueOnce({ feedbackCount: 0 });

      const result = await provider.submitFeedback(feedbackParams);

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('txHashABC123');

      // initStats should have been called
      expect(mockProgram.methods.initStats).toHaveBeenCalledWith('passport-001');

      // submitFeedback should have been called with correct args
      expect(mockProgram.methods.submitFeedback).toHaveBeenCalledWith(
        'passport-001',
        90,
        'accuracy',
        expect.any(Array), // receiptBytes
        ASSET_TYPE_MAP['model'], // 0
        'good output',
      );
    });

    it('should skip init when stats already exist', async () => {
      // Stats already exist
      mockProgram.account.passportStats.fetch
        .mockResolvedValueOnce({ feedbackCount: 5 })
        .mockResolvedValueOnce({ feedbackCount: 5 });

      const result = await provider.submitFeedback(feedbackParams);

      expect(result.success).toBe(true);
      // initStats should NOT have been called
      expect(mockProgram.methods.initStats).not.toHaveBeenCalled();
      // submitFeedback uses feedbackCount as index
      expect(mockProgram.methods.submitFeedback).toHaveBeenCalled();
    });

    it('should return success:false on error', async () => {
      mockProgram.account.passportStats.fetch
        .mockResolvedValueOnce({ feedbackCount: 0 });

      mockProgram.methods.submitFeedback.mockReturnValueOnce({
        accounts: jest.fn().mockReturnValue({
          rpc: jest.fn().mockRejectedValue(new Error('tx failed')),
        }),
      });

      const result = await provider.submitFeedback(feedbackParams);
      expect(result.success).toBe(false);
      expect(result.txHash).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // submitValidation
  // -------------------------------------------------------------------------

  describe('submitValidation', () => {
    const validationParams: ValidationParams = {
      passportId: 'passport-002',
      receiptHash: 'deadbeef01234567',
      valid: true,
      assetType: 'compute',
      metadata: 'validated ok',
    };

    it('should build correct validation tx', async () => {
      const result = await provider.submitValidation(validationParams);

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('txHashABC123');

      expect(mockProgram.methods.submitValidation).toHaveBeenCalledWith(
        'passport-002',
        expect.any(Array), // receiptBytes
        true,
        ASSET_TYPE_MAP['compute'], // 1
        'validated ok',
      );
    });

    it('should return success:false on error', async () => {
      mockProgram.methods.submitValidation.mockReturnValueOnce({
        accounts: jest.fn().mockReturnValue({
          rpc: jest.fn().mockRejectedValue(new Error('validation tx failed')),
        }),
      });

      const result = await provider.submitValidation(validationParams);
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getSummary
  // -------------------------------------------------------------------------

  describe('getSummary', () => {
    it('should read PassportStats PDA and convert avgScore', async () => {
      mockProgram.account.passportStats.fetch.mockResolvedValueOnce({
        feedbackCount: 10,
        validationCount: 3,
        avgScore: 8500, // stored as integer * 100
        totalScore: 850,
        lastUpdated: 1700000000,
      });

      const summary = await provider.getSummary('passport-003');

      expect(summary.passportId).toBe('passport-003');
      expect(summary.feedbackCount).toBe(10);
      expect(summary.validationCount).toBe(3);
      expect(summary.avgScore).toBe(85); // 8500 / 100
      expect(summary.totalScore).toBe(850);
      expect(summary.lastUpdated).toBe(1700000000);
    });

    it('should return zeros for unknown passport (fetch throws)', async () => {
      mockProgram.account.passportStats.fetch.mockRejectedValueOnce(
        new Error('Account does not exist'),
      );

      const summary = await provider.getSummary('passport-unknown');

      expect(summary.passportId).toBe('passport-unknown');
      expect(summary.feedbackCount).toBe(0);
      expect(summary.validationCount).toBe(0);
      expect(summary.avgScore).toBe(0);
      expect(summary.totalScore).toBe(0);
      expect(summary.lastUpdated).toBe(0);
    });

    it('should handle BN-like values from on-chain', async () => {
      const bn = (n: number) => ({ toNumber: () => n });
      mockProgram.account.passportStats.fetch.mockResolvedValueOnce({
        feedbackCount: bn(7),
        validationCount: bn(2),
        avgScore: bn(9200),
        totalScore: bn(644),
        lastUpdated: bn(1700001000),
      });

      const summary = await provider.getSummary('passport-bn');

      expect(summary.avgScore).toBe(92);
      expect(summary.feedbackCount).toBe(7);
    });
  });

  // -------------------------------------------------------------------------
  // readFeedback
  // -------------------------------------------------------------------------

  describe('readFeedback', () => {
    it('should return empty array when stats PDA does not exist', async () => {
      mockProgram.account.passportStats.fetch.mockRejectedValueOnce(
        new Error('Account not found'),
      );

      const result = await provider.readFeedback('passport-none');
      expect(result).toEqual([]);
    });

    it('should iterate feedback entries by index', async () => {
      mockProgram.account.passportStats.fetch.mockResolvedValueOnce({
        feedbackCount: 2,
      });

      mockProgram.account.feedbackEntry.fetch
        .mockResolvedValueOnce({
          passportId: 'passport-004',
          from: { toBase58: () => 'fromPubkey1' },
          score: 80,
          category: 'speed',
          receiptHash: 'aabb',
          assetType: 0, // model
          timestamp: 1700000001,
          revoked: false,
        })
        .mockResolvedValueOnce({
          passportId: 'passport-004',
          from: { toBase58: () => 'fromPubkey2' },
          score: 95,
          category: 'accuracy',
          receiptHash: 'ccdd',
          assetType: 2, // tool
          timestamp: 1700000002,
          revoked: false,
        });

      const result = await provider.readFeedback('passport-004');

      expect(result).toHaveLength(2);
      expect(result[0].score).toBe(80);
      expect(result[0].assetType).toBe('model');
      expect(result[0].index).toBe(0);
      expect(result[1].score).toBe(95);
      expect(result[1].assetType).toBe('tool');
      expect(result[1].index).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // getValidation
  // -------------------------------------------------------------------------

  describe('getValidation', () => {
    it('should return null when validation PDA does not exist', async () => {
      mockProgram.account.validationEntry.fetch.mockRejectedValueOnce(
        new Error('Account not found'),
      );

      const result = await provider.getValidation('passport-x', 'aabbccdd');
      expect(result).toBeNull();
    });

    it('should fetch and return validation entry', async () => {
      mockProgram.account.validationEntry.fetch.mockResolvedValueOnce({
        passportId: 'passport-005',
        validator: { toBase58: () => 'validatorPubkey' },
        valid: true,
        receiptHash: 'aabbccdd',
        assetType: 3, // agent
        timestamp: 1700000500,
      });

      const result = await provider.getValidation('passport-005', 'aabbccdd');

      expect(result).not.toBeNull();
      expect(result!.passportId).toBe('passport-005');
      expect(result!.validator).toBe('validatorPubkey');
      expect(result!.valid).toBe(true);
      expect(result!.assetType).toBe('agent');
      expect(result!.timestamp).toBe(1700000500);
    });
  });

  // -------------------------------------------------------------------------
  // isHealthy
  // -------------------------------------------------------------------------

  describe('isHealthy', () => {
    it('should return true', async () => {
      const healthy = await provider.isHealthy();
      expect(healthy).toBe(true);
    });
  });
});
