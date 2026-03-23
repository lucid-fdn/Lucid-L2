import { getIdentityRegistries, resetIdentityRegistryFactory } from '../factory';

describe('getIdentityRegistries', () => {
  beforeEach(() => {
    resetIdentityRegistryFactory();
    delete process.env.IDENTITY_REGISTRIES;
  });

  it('returns empty array when IDENTITY_REGISTRIES not set', () => {
    expect(getIdentityRegistries()).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    process.env.IDENTITY_REGISTRIES = '';
    expect(getIdentityRegistries()).toEqual([]);
  });

  it('returns singleton (same array on second call)', () => {
    const first = getIdentityRegistries();
    const second = getIdentityRegistries();
    expect(first).toBe(second);
  });

  it('reset clears singleton', () => {
    const first = getIdentityRegistries();
    resetIdentityRegistryFactory();
    const second = getIdentityRegistries();
    expect(first).not.toBe(second);
  });
});
