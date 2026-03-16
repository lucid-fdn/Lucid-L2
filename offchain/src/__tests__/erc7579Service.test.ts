/**
 * Tests for ERC7579Service
 */
import { ERC7579Service, getERC7579Service } from '../../packages/engine/src/identity/erc7579Service';
import { ModuleType } from '../../packages/engine/src/identity/erc7579Types';

describe('ERC7579Service', () => {
  describe('singleton', () => {
    it('should return the same instance', () => {
      const a = getERC7579Service();
      const b = getERC7579Service();
      expect(a).toBe(b);
    });

    it('should be an instance of ERC7579Service', () => {
      const service = getERC7579Service();
      expect(service).toBeInstanceOf(ERC7579Service);
    });
  });

  describe('ModuleType enum', () => {
    it('should have correct values', () => {
      expect(ModuleType.Validator).toBe(1);
      expect(ModuleType.Executor).toBe(2);
    });
  });

  describe('listInstalledModules', () => {
    it('should return empty array for unknown account', () => {
      const service = getERC7579Service();
      const modules = service.listInstalledModules('base', '0xunknown');
      expect(modules).toEqual([]);
    });
  });

  describe('ABIs', () => {
    it('should expose all module ABIs', () => {
      const abis = ERC7579Service.getABIs();
      expect(abis.policy).toBeDefined();
      expect(abis.payout).toBeDefined();
      expect(abis.receipt).toBeDefined();
    });

    it('policy ABI should include setPolicy', () => {
      const abis = ERC7579Service.getABIs();
      const names = abis.policy.map((f) => f.name);
      expect(names).toContain('setPolicy');
      expect(names).toContain('isPolicyAllowed');
    });

    it('payout ABI should include execute', () => {
      const abis = ERC7579Service.getABIs();
      const names = abis.payout.map((f) => f.name);
      expect(names).toContain('execute');
      expect(names).toContain('setSplit');
    });

    it('receipt ABI should include emitReceipt', () => {
      const abis = ERC7579Service.getABIs();
      const names = abis.receipt.filter((f) => f.type === 'function').map((f) => f.name);
      expect(names).toContain('emitReceipt');
    });
  });

  describe('installModule validation', () => {
    it('should reject unknown chain', async () => {
      const service = getERC7579Service();
      await expect(
        service.installModule('bad-chain', '0xaccount', ModuleType.Validator, '0xmodule')
      ).rejects.toThrow('Unknown chain');
    });
  });

  describe('uninstallModule validation', () => {
    it('should reject unknown chain', async () => {
      const service = getERC7579Service();
      await expect(
        service.uninstallModule('bad-chain', '0xaccount', ModuleType.Validator, '0xmodule')
      ).rejects.toThrow('Unknown chain');
    });
  });

  describe('configurePolicyModule validation', () => {
    it('should reject chain without policy module', async () => {
      const service = getERC7579Service();
      await expect(
        service.configurePolicyModule('base', '0xaccount', ['0xhash'])
      ).rejects.toThrow('No policy module');
    });
  });

  describe('configurePayoutModule validation', () => {
    it('should reject chain without payout module', async () => {
      const service = getERC7579Service();
      await expect(
        service.configurePayoutModule('base', '0xaccount', ['0xaddr'], [10000])
      ).rejects.toThrow('No payout module');
    });

    it('should reject basis points not summing to 10000', async () => {
      const service = getERC7579Service();
      await expect(
        service.configurePayoutModule('base', '0xaccount', ['0xaddr'], [5000])
      ).rejects.toThrow('No payout module');
    });
  });

  describe('emitReceipt validation', () => {
    it('should reject chain without receipt module', async () => {
      const service = getERC7579Service();
      await expect(
        service.emitReceipt('base', '0xaccount', {
          receiptHash: '0x',
          policyHash: '0x',
          modelPassportId: 'model',
          computePassportId: 'compute',
          tokensIn: 100,
          tokensOut: 50,
        })
      ).rejects.toThrow('No receipt module');
    });
  });
});
