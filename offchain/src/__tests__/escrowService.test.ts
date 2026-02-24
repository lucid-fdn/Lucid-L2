/**
 * Tests for EscrowService
 */
import { EscrowService, getEscrowService } from '../services/escrowService';
import type { EscrowParams } from '../services/escrowTypes';
import { EscrowStatus } from '../services/escrowTypes';

describe('EscrowService', () => {
  describe('singleton', () => {
    it('should return the same instance', () => {
      const a = getEscrowService();
      const b = getEscrowService();
      expect(a).toBe(b);
    });

    it('should be an instance of EscrowService', () => {
      const service = getEscrowService();
      expect(service).toBeInstanceOf(EscrowService);
    });
  });

  describe('getEscrow', () => {
    it('should return null for non-existent escrow', () => {
      const service = getEscrowService();
      const result = service.getEscrow('nonexistent_id');
      expect(result).toBeNull();
    });
  });

  describe('listEscrows', () => {
    it('should return empty array for unknown address', () => {
      const service = getEscrowService();
      const result = service.listEscrows('0xunknown');
      expect(result).toEqual([]);
    });
  });

  describe('ABI', () => {
    it('should expose the escrow ABI', () => {
      const abi = EscrowService.getABI();
      expect(Array.isArray(abi)).toBe(true);
      expect(abi.length).toBeGreaterThan(0);

      const createFn = abi.find((f) => f.name === 'createEscrow');
      expect(createFn).toBeDefined();
      expect(createFn?.type).toBe('function');
    });

    it('should include all required functions', () => {
      const abi = EscrowService.getABI();
      const functionNames = abi.filter((f) => f.type === 'function').map((f) => f.name);

      expect(functionNames).toContain('createEscrow');
      expect(functionNames).toContain('releaseEscrow');
      expect(functionNames).toContain('claimTimeout');
      expect(functionNames).toContain('disputeEscrow');
      expect(functionNames).toContain('getEscrow');
    });

    it('should include EscrowCreated event', () => {
      const abi = EscrowService.getABI();
      const events = abi.filter((f) => f.type === 'event');
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].name).toBe('EscrowCreated');
    });
  });

  describe('EscrowStatus enum', () => {
    it('should have correct values', () => {
      expect(EscrowStatus.Created).toBe(0);
      expect(EscrowStatus.Released).toBe(1);
      expect(EscrowStatus.Refunded).toBe(2);
      expect(EscrowStatus.Disputed).toBe(3);
    });
  });

  describe('createEscrow validation', () => {
    it('should reject unknown chain', async () => {
      const service = getEscrowService();
      const params: EscrowParams = {
        beneficiary: '0x1234',
        token: '0x5678',
        amount: '1000',
        duration: 86400,
      };

      await expect(service.createEscrow('nonexistent-chain', params))
        .rejects.toThrow('Unknown chain');
    });

    it('should reject chain without escrow contract', async () => {
      const service = getEscrowService();
      const params: EscrowParams = {
        beneficiary: '0x1234',
        token: '0x5678',
        amount: '1000',
        duration: 86400,
      };

      // 'base' exists but has no escrow contract address
      await expect(service.createEscrow('base', params))
        .rejects.toThrow('No escrow contract');
    });
  });

  describe('releaseWithReceipt validation', () => {
    it('should reject unknown chain', async () => {
      const service = getEscrowService();
      await expect(
        service.releaseWithReceipt('bad-chain', 'eid', 'rh', 'sig', 'pk')
      ).rejects.toThrow();
    });
  });

  describe('claimTimeout validation', () => {
    it('should reject unknown chain', async () => {
      const service = getEscrowService();
      await expect(
        service.claimTimeout('bad-chain', 'eid')
      ).rejects.toThrow();
    });
  });

  describe('disputeEscrow validation', () => {
    it('should reject unknown chain', async () => {
      const service = getEscrowService();
      await expect(
        service.disputeEscrow('bad-chain', 'eid', 'reason')
      ).rejects.toThrow();
    });
  });
});
