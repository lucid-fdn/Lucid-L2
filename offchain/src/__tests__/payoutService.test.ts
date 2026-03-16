/**
 * Tests for PR6: Payout Split Calculation Service
 */
import {
  validateSplitConfig,
  calculatePayoutSplit,
  estimatePayout,
  createPayoutFromReceipt,
  verifyPayoutSplit,
  storePayout,
  getPayout,
  DEFAULT_SPLIT_CONFIG,
  SplitConfig,
} from '../../packages/engine/src/payment/services/payoutService';

describe('PayoutService', () => {
  describe('validateSplitConfig', () => {
    it('should validate default config as valid', () => {
      const result = validateSplitConfig(DEFAULT_SPLIT_CONFIG);
      expect(result.valid).toBe(true);
    });

    it('should reject config not summing to 10000', () => {
      const badConfig: SplitConfig = {
        compute_provider_bp: 5000,
        model_provider_bp: 2000,
        protocol_treasury_bp: 1000,
      };
      const result = validateSplitConfig(badConfig);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('8000 bp');
    });

    it('should reject negative values', () => {
      const badConfig: SplitConfig = {
        compute_provider_bp: -1000,
        model_provider_bp: 6000,
        protocol_treasury_bp: 5000,
      };
      const result = validateSplitConfig(badConfig);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('negative');
    });

    it('should validate custom config with orchestrator', () => {
      const config: SplitConfig = {
        compute_provider_bp: 6000,
        model_provider_bp: 2000,
        protocol_treasury_bp: 1000,
        orchestrator_bp: 1000,
      };
      const result = validateSplitConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  describe('calculatePayoutSplit', () => {
    it('should calculate correct split with default config', () => {
      const payout = calculatePayoutSplit({
        run_id: 'run_test123',
        total_amount_lamports: BigInt(10000000), // 0.01 SOL
        compute_wallet: 'ComputeWallet111111111111111111111111111111',
      });

      expect(payout.run_id).toBe('run_test123');
      expect(payout.total_amount_lamports).toBe(BigInt(10000000));
      expect(payout.recipients.length).toBe(3); // compute, model (to treasury), protocol

      // Compute: 70%
      const computeRecipient = payout.recipients.find(r => r.role === 'compute');
      expect(computeRecipient?.amount_lamports).toBe(BigInt(7000000));
      expect(computeRecipient?.amount_bp).toBe(7000);

      // Model: 20% (goes to treasury since no model_wallet)
      const modelRecipient = payout.recipients.find(r => r.role === 'model');
      expect(modelRecipient?.amount_lamports).toBe(BigInt(2000000));

      // Protocol: 10%
      const protocolRecipient = payout.recipients.find(r => r.role === 'protocol');
      expect(protocolRecipient?.amount_lamports).toBe(BigInt(1000000));
    });

    it('should use model wallet when provided', () => {
      const payout = calculatePayoutSplit({
        run_id: 'run_test456',
        total_amount_lamports: BigInt(10000000),
        compute_wallet: 'ComputeWallet111111111111111111111111111111',
        model_wallet: 'ModelWallet1111111111111111111111111111111',
      });

      const modelRecipient = payout.recipients.find(r => r.role === 'model');
      expect(modelRecipient?.wallet_address).toBe('ModelWallet1111111111111111111111111111111');
    });

    it('should include orchestrator when configured', () => {
      const config: SplitConfig = {
        compute_provider_bp: 6000,
        model_provider_bp: 2000,
        protocol_treasury_bp: 1000,
        orchestrator_bp: 1000,
      };

      const payout = calculatePayoutSplit({
        run_id: 'run_test789',
        total_amount_lamports: BigInt(10000000),
        compute_wallet: 'ComputeWallet111111111111111111111111111111',
        orchestrator_wallet: 'OrchestratorWallet1111111111111111111111',
        config,
      });

      expect(payout.recipients.length).toBe(4);
      
      const orchestratorRecipient = payout.recipients.find(r => r.role === 'orchestrator');
      expect(orchestratorRecipient?.amount_lamports).toBe(BigInt(1000000)); // 10%
      expect(orchestratorRecipient?.wallet_address).toBe('OrchestratorWallet1111111111111111111111');
    });

    it('should throw on invalid config', () => {
      expect(() => {
        calculatePayoutSplit({
          run_id: 'run_bad',
          total_amount_lamports: BigInt(10000000),
          compute_wallet: 'ComputeWallet111111111111111111111111111111',
          config: {
            compute_provider_bp: 5000,
            model_provider_bp: 2000,
            protocol_treasury_bp: 1000, // Only 80%
          },
        });
      }).toThrow();
    });
  });

  describe('estimatePayout', () => {
    it('should calculate correct payout based on tokens', () => {
      const amount = estimatePayout({
        tokens_in: 1000,
        tokens_out: 500,
        price_per_1k_tokens_lamports: BigInt(100000), // 0.0001 SOL per 1k tokens
      });

      // (1000 + 500) * 100000 / 1000 = 150000 lamports
      expect(amount).toBe(BigInt(150000));
    });

    it('should handle zero tokens', () => {
      const amount = estimatePayout({
        tokens_in: 0,
        tokens_out: 0,
        price_per_1k_tokens_lamports: BigInt(100000),
      });

      expect(amount).toBe(BigInt(0));
    });
  });

  describe('createPayoutFromReceipt', () => {
    it('should create payout from receipt data', () => {
      const payout = createPayoutFromReceipt({
        run_id: 'run_receipt_test',
        tokens_in: 2000,
        tokens_out: 1000,
        price_per_1k_tokens_lamports: BigInt(50000), // 0.00005 SOL per 1k
        compute_wallet: 'ComputeWallet111111111111111111111111111111',
        model_wallet: 'ModelWallet1111111111111111111111111111111',
      });

      // Total: (2000 + 1000) * 50000 / 1000 = 150000 lamports
      expect(payout.total_amount_lamports).toBe(BigInt(150000));
      expect(payout.run_id).toBe('run_receipt_test');

      // Compute: 70% of 150000 = 105000
      const computeRecipient = payout.recipients.find(r => r.role === 'compute');
      expect(computeRecipient?.amount_lamports).toBe(BigInt(105000));
    });
  });

  describe('verifyPayoutSplit', () => {
    it('should verify valid payout', () => {
      const payout = calculatePayoutSplit({
        run_id: 'run_verify',
        total_amount_lamports: BigInt(10000000),
        compute_wallet: 'ComputeWallet111111111111111111111111111111',
      });

      const result = verifyPayoutSplit(payout);
      expect(result.valid).toBe(true);
    });

    it('should detect invalid config in payout', () => {
      const payout = calculatePayoutSplit({
        run_id: 'run_verify2',
        total_amount_lamports: BigInt(10000000),
        compute_wallet: 'ComputeWallet111111111111111111111111111111',
      });

      // Corrupt the config
      payout.split_config.compute_provider_bp = 5000;

      const result = verifyPayoutSplit(payout);
      expect(result.valid).toBe(false);
    });
  });

  describe('storePayout / getPayout', () => {
    it('should store and retrieve payout', async () => {
      const payout = calculatePayoutSplit({
        run_id: 'run_store_test',
        total_amount_lamports: BigInt(5000000),
        compute_wallet: 'ComputeWallet111111111111111111111111111111',
      });

      await storePayout(payout);

      const retrieved = await getPayout('run_store_test');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.run_id).toBe('run_store_test');
      expect(retrieved?.total_amount_lamports).toBe(BigInt(5000000));
    });

    it('should return null for non-existent payout', async () => {
      const result = await getPayout('run_nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle very large amounts', () => {
      const payout = calculatePayoutSplit({
        run_id: 'run_large',
        total_amount_lamports: BigInt('1000000000000000'), // 1000 SOL
        compute_wallet: 'ComputeWallet111111111111111111111111111111',
      });

      expect(payout.total_amount_lamports).toBe(BigInt('1000000000000000'));
      
      const computeRecipient = payout.recipients.find(r => r.role === 'compute');
      expect(computeRecipient?.amount_lamports).toBe(BigInt('700000000000000')); // 70%
    });

    it('should handle minimum amounts', () => {
      const payout = calculatePayoutSplit({
        run_id: 'run_small',
        total_amount_lamports: BigInt(100), // Very small amount
        compute_wallet: 'ComputeWallet111111111111111111111111111111',
      });

      // With 100 lamports and integer division:
      // Compute: 100 * 7000 / 10000 = 70
      // Model: 100 * 2000 / 10000 = 20
      // Protocol: 100 * 1000 / 10000 = 10
      const computeRecipient = payout.recipients.find(r => r.role === 'compute');
      expect(computeRecipient?.amount_lamports).toBe(BigInt(70));
    });
  });
});
