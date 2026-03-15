import { FacilitatorRegistry } from '../../payment/facilitators/index';
import { DirectFacilitator } from '../../payment/facilitators/direct';
import { CoinbaseFacilitator } from '../../payment/facilitators/coinbase';
import { PayAIFacilitator } from '../../payment/facilitators/payai';
import { SpentProofsStoreFactory } from '../../payment/stores/spentProofsStore';

// ---------------------------------------------------------------------------
// Integration tests — verify the entire payment stack works together
// ---------------------------------------------------------------------------

describe('Payment System Integration', () => {
  describe('FacilitatorRegistry with all facilitators', () => {
    it('should register and use DirectFacilitator', () => {
      const registry = new FacilitatorRegistry();
      const direct = new DirectFacilitator({
        chains: [{ name: 'base', chainId: 8453, rpcUrl: 'https://mainnet.base.org' }],
        tokens: [{ symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, chain: 'base' }],
      });
      registry.register(direct);
      expect(registry.getDefault().name).toBe('direct');
    });

    it('should register all three facilitators', () => {
      const registry = new FacilitatorRegistry();
      registry.register(new DirectFacilitator({
        chains: [{ name: 'base', chainId: 8453, rpcUrl: '' }],
        tokens: [],
      }));
      registry.register(new CoinbaseFacilitator({ apiUrl: 'https://api.coinbase.com/x402' }));
      registry.register(new PayAIFacilitator({ apiUrl: 'https://facilitator.payai.network' }));

      expect(registry.list()).toHaveLength(3);
      expect(registry.get('direct')).toBeDefined();
      expect(registry.get('coinbase')).toBeDefined();
      expect(registry.get('payai')).toBeDefined();
    });

    it('should switch default facilitator', () => {
      const registry = new FacilitatorRegistry();
      registry.register(new DirectFacilitator({ chains: [], tokens: [] }));
      registry.register(new PayAIFacilitator({ apiUrl: 'https://facilitator.payai.network' }));

      registry.setDefault('payai');
      expect(registry.getDefault().name).toBe('payai');
    });
  });

  describe('SpentProofsStore', () => {
    it('should work with in-memory store end-to-end', async () => {
      const store = SpentProofsStoreFactory.createInMemory();

      expect(await store.isSpent('0xtest123')).toBe(false);
      await store.markSpent('0xtest123', 300);
      expect(await store.isSpent('0xtest123')).toBe(true);
      expect(await store.isSpent('0xTEST123')).toBe(true); // case insensitive
      expect(await store.count()).toBe(1);
    });
  });

  describe('Payment instructions generation', () => {
    it('should generate instructions for each facilitator type', () => {
      const token = { symbol: 'USDC', address: '0xUSDC', decimals: 6, chain: 'base' };
      const params = { amount: 30000n, token, chain: 'base', recipient: '0xSplitter' };

      const direct = new DirectFacilitator({ chains: [], tokens: [] });
      const coinbase = new CoinbaseFacilitator({ apiUrl: 'https://api.coinbase.com' });
      const payai = new PayAIFacilitator({ apiUrl: 'https://facilitator.payai.network' });

      const directInstr = direct.instructions(params);
      expect(directInstr.scheme).toBe('exact');
      expect(directInstr.facilitator).toBe('direct');

      const coinbaseInstr = coinbase.instructions(params);
      expect(coinbaseInstr.scheme).toBe('eip-3009');
      expect(coinbaseInstr.facilitator).toBe('coinbase');

      const payaiInstr = payai.instructions(params);
      expect(payaiInstr.facilitator).toBe('payai');
    });
  });
});
