/**
 * Integration tests for identity() sub-adapter on both chains.
 * Solana: all methods throw ChainFeatureUnavailable (EVM-only feature)
 * EVM: returns sub-adapter with correct method shape
 */
import { SolanaAdapter } from '../../packages/engine/src/chains/solana/adapter';
import { EVMAdapter } from '../../packages/engine/src/chains/evm/adapter';
import { ChainFeatureUnavailable } from '../../packages/engine/src/errors';

describe('SolanaAdapter.identity()', () => {
  let adapter: SolanaAdapter;

  beforeEach(() => {
    adapter = new SolanaAdapter();
  });

  it('returns an identity sub-adapter', () => {
    const identity = adapter.identity();
    expect(identity).toBeDefined();
  });

  it('register() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.identity().register('uri', '0x1'))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('query() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.identity().query('1'))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('createTBA() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.identity().createTBA('0x1', '1'))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('getTBA() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.identity().getTBA('0x1', '1'))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('isTBADeployed() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.identity().isTBADeployed('0x1'))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('installModule() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.identity().installModule('0x1', 1, '0x2', '0x'))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('uninstallModule() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.identity().uninstallModule('0x1', 1, '0x2'))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('configurePolicy() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.identity().configurePolicy('0x1', ['0xabc']))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('configurePayout() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.identity().configurePayout('0x1', [{ address: '0x2', bps: 5000 }]))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('capabilities().identity is false', () => {
    expect(adapter.capabilities().identity).toBe(false);
  });
});

describe('EVMAdapter.identity()', () => {
  it('identity() method exists on EVMAdapter', () => {
    const adapter = new EVMAdapter();
    expect(typeof adapter.identity).toBe('function');
  });

  it('requires connection before use (guards against uninitialized calls)', () => {
    const adapter = new EVMAdapter();
    expect(() => adapter.identity()).toThrow(/not connected/i);
  });
});
