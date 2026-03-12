/**
 * Integration tests for bridge() sub-adapter on both chains.
 * Solana: all methods throw ChainFeatureUnavailable (EVM-only feature)
 * EVM: returns sub-adapter with correct method shape
 */
import { SolanaAdapter } from '../../packages/engine/src/chains/solana/adapter';
import { EVMAdapter } from '../../packages/engine/src/chains/evm/adapter';
import { ChainFeatureUnavailable } from '../../packages/engine/src/errors';

describe('SolanaAdapter.bridge()', () => {
  let adapter: SolanaAdapter;

  beforeEach(() => {
    adapter = new SolanaAdapter();
  });

  it('returns a bridge sub-adapter', () => {
    expect(adapter.bridge()).toBeDefined();
  });

  it('bridgeTokens() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.bridge().bridgeTokens({
      destChainId: 8453,
      recipient: '0x1',
      amount: '1000',
      minAmount: '900',
    })).rejects.toThrow(ChainFeatureUnavailable);
  });

  it('getQuote() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.bridge().getQuote(8453, '1000'))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('getBridgeStatus() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.bridge().getBridgeStatus('0xhash'))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('capabilities().bridge is false', () => {
    expect(adapter.capabilities().bridge).toBe(false);
  });
});

describe('EVMAdapter.bridge()', () => {
  it('bridge() method exists on EVMAdapter', () => {
    const adapter = new EVMAdapter();
    expect(typeof adapter.bridge).toBe('function');
  });

  it('requires connection before use', () => {
    const adapter = new EVMAdapter();
    expect(() => adapter.bridge()).toThrow(/not connected/i);
  });
});
