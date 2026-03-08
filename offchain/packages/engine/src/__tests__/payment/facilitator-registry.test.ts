import { FacilitatorRegistry } from '../../payment/facilitators/index';
import type { X402Facilitator } from '../../payment/facilitators/interface';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function createMockFacilitator(name: string): X402Facilitator {
  return {
    name,
    supportedChains: [],
    supportedTokens: [],
    verify: jest.fn().mockResolvedValue({ valid: true }),
    instructions: jest.fn().mockReturnValue({
      chain: 'base',
      token: 'USDC',
      tokenAddress: '0x0',
      amount: '0',
      recipient: '0x0',
      facilitator: name,
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FacilitatorRegistry', () => {
  let registry: FacilitatorRegistry;

  beforeEach(() => {
    registry = new FacilitatorRegistry();
  });

  // -------------------------------------------------------------------------
  // register & get
  // -------------------------------------------------------------------------

  it('registers and retrieves a facilitator by name', () => {
    const fac = createMockFacilitator('direct');
    registry.register(fac);

    expect(registry.get('direct')).toBe(fac);
  });

  it('returns undefined for an unregistered facilitator', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // setDefault / getDefault
  // -------------------------------------------------------------------------

  it('sets and gets the default facilitator', () => {
    const fac = createMockFacilitator('direct');
    registry.register(fac);
    registry.setDefault('direct');

    expect(registry.getDefault()).toBe(fac);
  });

  it('throws when setting default to an unregistered facilitator', () => {
    expect(() => registry.setDefault('unknown')).toThrow(
      'Facilitator "unknown" not registered',
    );
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  it('lists all registered facilitators', () => {
    const a = createMockFacilitator('alpha');
    const b = createMockFacilitator('beta');
    registry.register(a);
    registry.register(b);

    const all = registry.list();
    expect(all).toHaveLength(2);
    expect(all).toContain(a);
    expect(all).toContain(b);
  });

  // -------------------------------------------------------------------------
  // getDefault fallback
  // -------------------------------------------------------------------------

  it('uses the first registered facilitator as default when none is set', () => {
    const first = createMockFacilitator('first');
    const second = createMockFacilitator('second');
    registry.register(first);
    registry.register(second);

    expect(registry.getDefault()).toBe(first);
  });

  it('throws getDefault when no facilitators are registered', () => {
    expect(() => registry.getDefault()).toThrow('No facilitators registered');
  });
});
