/**
 * Tests for PaymasterService
 */
import { PaymasterService, getPaymasterService } from '../services/identity/paymasterService';
import type { UserOperation } from '../services/identity/paymasterTypes';

const mockUserOp: UserOperation = {
  sender: '0x1234567890abcdef1234567890abcdef12345678',
  nonce: '0',
  initCode: '0x',
  callData: '0x' + 'aa'.repeat(100),
  accountGasLimits: '0x' + '00'.repeat(32),
  preVerificationGas: '0',
  gasFees: '0x' + '00'.repeat(32),
  paymasterAndData: '0x',
  signature: '0x',
};

describe('PaymasterService', () => {
  describe('singleton', () => {
    it('should return the same instance', () => {
      const a = getPaymasterService();
      const b = getPaymasterService();
      expect(a).toBe(b);
    });

    it('should be an instance of PaymasterService', () => {
      const service = getPaymasterService();
      expect(service).toBeInstanceOf(PaymasterService);
    });
  });

  describe('getEntryPointAddress', () => {
    it('should return the canonical EntryPoint v0.7 address', () => {
      const service = getPaymasterService();
      const addr = service.getEntryPointAddress();
      expect(addr).toBe('0x0000000071727De22E5E9d8BAf0edAc6f37da032');
    });
  });

  describe('ABI', () => {
    it('should expose the paymaster ABI', () => {
      const abi = PaymasterService.getABI();
      expect(Array.isArray(abi)).toBe(true);
      expect(abi.length).toBeGreaterThan(0);
    });

    it('should include key functions', () => {
      const abi = PaymasterService.getABI();
      const names = abi.map((f) => f.name);
      expect(names).toContain('validatePaymasterUserOp');
      expect(names).toContain('lucidPerEth');
      expect(names).toContain('estimateLucidCost');
      expect(names).toContain('getDeposit');
    });
  });

  describe('estimateGasInLucid', () => {
    it('should reject unknown chain', async () => {
      const service = getPaymasterService();
      await expect(
        service.estimateGasInLucid('bad-chain', mockUserOp)
      ).rejects.toThrow('Unknown chain');
    });

    it('should reject chain without paymaster', async () => {
      const service = getPaymasterService();
      await expect(
        service.estimateGasInLucid('base', mockUserOp)
      ).rejects.toThrow('No paymaster');
    });
  });

  describe('sponsorUserOp', () => {
    it('should reject unknown chain', async () => {
      const service = getPaymasterService();
      await expect(
        service.sponsorUserOp('bad-chain', mockUserOp)
      ).rejects.toThrow('Unknown chain');
    });

    it('should reject chain without paymaster', async () => {
      const service = getPaymasterService();
      await expect(
        service.sponsorUserOp('base', mockUserOp)
      ).rejects.toThrow('No paymaster');
    });
  });

  describe('getExchangeRate', () => {
    it('should reject chain without paymaster', async () => {
      const service = getPaymasterService();
      await expect(
        service.getExchangeRate('base')
      ).rejects.toThrow('No paymaster');
    });
  });

  describe('getPaymasterBalance', () => {
    it('should reject chain without paymaster', async () => {
      const service = getPaymasterService();
      await expect(
        service.getPaymasterBalance('base')
      ).rejects.toThrow('No paymaster');
    });
  });
});
