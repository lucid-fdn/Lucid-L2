/**
 * Tests for DisputeService
 */
import { DisputeService, getDisputeService } from '../../packages/engine/src/payment/escrow/disputeService';
import { DisputeStatus } from '../../packages/engine/src/payment/escrow/disputeTypes';

describe('DisputeService', () => {
  describe('singleton', () => {
    it('should return the same instance', () => {
      const a = getDisputeService();
      const b = getDisputeService();
      expect(a).toBe(b);
    });

    it('should be an instance of DisputeService', () => {
      const service = getDisputeService();
      expect(service).toBeInstanceOf(DisputeService);
    });
  });

  describe('getDispute', () => {
    it('should return null for non-existent dispute', () => {
      const service = getDisputeService();
      expect(service.getDispute('nonexistent')).toBeNull();
    });
  });

  describe('listDisputes', () => {
    it('should return empty array for unknown address', () => {
      const service = getDisputeService();
      expect(service.listDisputes('0xunknown')).toEqual([]);
    });
  });

  describe('ABI', () => {
    it('should expose the arbitration ABI', () => {
      const abi = DisputeService.getABI();
      expect(Array.isArray(abi)).toBe(true);
      expect(abi.length).toBeGreaterThan(0);
    });

    it('should include all required functions', () => {
      const abi = DisputeService.getABI();
      const functionNames = abi.filter((f) => f.type === 'function').map((f) => f.name);

      expect(functionNames).toContain('openDispute');
      expect(functionNames).toContain('submitEvidence');
      expect(functionNames).toContain('resolveDispute');
      expect(functionNames).toContain('appealDecision');
      expect(functionNames).toContain('getDispute');
    });

    it('should include DisputeOpened event', () => {
      const abi = DisputeService.getABI();
      const events = abi.filter((f) => f.type === 'event');
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].name).toBe('DisputeOpened');
    });
  });

  describe('DisputeStatus enum', () => {
    it('should have correct values', () => {
      expect(DisputeStatus.Open).toBe(0);
      expect(DisputeStatus.EvidencePhase).toBe(1);
      expect(DisputeStatus.Resolved).toBe(2);
      expect(DisputeStatus.Appealed).toBe(3);
    });
  });

  describe('openDispute validation', () => {
    it('should reject unknown chain', async () => {
      const service = getDisputeService();
      await expect(
        service.openDispute('bad-chain', '0xescrowid', 'reason')
      ).rejects.toThrow('Unknown chain');
    });

    it('should reject chain without arbitration contract', async () => {
      const service = getDisputeService();
      await expect(
        service.openDispute('base', '0xescrowid', 'reason')
      ).rejects.toThrow('No arbitration contract');
    });
  });

  describe('submitEvidence validation', () => {
    it('should reject unknown chain', async () => {
      const service = getDisputeService();
      await expect(
        service.submitEvidence('bad-chain', 'did', {
          receiptHash: '0x',
          mmrRoot: '0x',
          mmrProof: '0x',
          description: 'test',
        })
      ).rejects.toThrow();
    });
  });

  describe('resolveDispute validation', () => {
    it('should reject unknown chain', async () => {
      const service = getDisputeService();
      await expect(
        service.resolveDispute('bad-chain', 'did')
      ).rejects.toThrow();
    });
  });

  describe('appealDecision validation', () => {
    it('should reject unknown chain', async () => {
      const service = getDisputeService();
      await expect(
        service.appealDecision('bad-chain', 'did')
      ).rejects.toThrow();
    });
  });
});
