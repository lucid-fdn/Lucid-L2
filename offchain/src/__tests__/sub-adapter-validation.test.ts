/**
 * Integration tests for validation() sub-adapter on both chains.
 * Solana: all methods throw ChainFeatureUnavailable (EVM-only feature)
 * EVM: returns sub-adapter with correct method shape
 */
import { SolanaAdapter } from '../../packages/engine/src/chains/solana/adapter';
import { EVMAdapter } from '../../packages/engine/src/chains/evm/adapter';
import { ChainFeatureUnavailable } from '../../packages/engine/src/errors';

describe('SolanaAdapter.validation()', () => {
  let adapter: SolanaAdapter;

  beforeEach(() => {
    adapter = new SolanaAdapter();
  });

  it('returns a validation sub-adapter', () => {
    expect(adapter.validation()).toBeDefined();
  });

  it('requestValidation() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.validation().requestValidation('1', '0xhash'))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('submitResult() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.validation().submitResult('1', '0xhash', true))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('getValidation() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.validation().getValidation('v1'))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('getValidationCount() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.validation().getValidationCount('1'))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('verifyMMRProof() throws ChainFeatureUnavailable', async () => {
    await expect(adapter.validation().verifyMMRProof('0xhash', [], [], 0, '0xroot'))
      .rejects.toThrow(ChainFeatureUnavailable);
  });

  it('capabilities().validation is false', () => {
    expect(adapter.capabilities().validation).toBe(false);
  });
});

describe('EVMAdapter.validation()', () => {
  it('validation() method exists on EVMAdapter', () => {
    const adapter = new EVMAdapter();
    expect(typeof adapter.validation).toBe('function');
  });

  it('requires connection before use', () => {
    const adapter = new EVMAdapter();
    expect(() => adapter.validation()).toThrow(/not connected/i);
  });
});
