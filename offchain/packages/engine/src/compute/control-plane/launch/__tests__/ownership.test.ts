import { resolvePassportOwnership } from '../ownership';

const VALID_OWNER = '3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3';

describe('launch ownership resolution', () => {
  const originalOwner = process.env.LUCID_DEFAULT_PASSPORT_OWNER;
  const originalWallet = process.env.LUCID_PLATFORM_WALLET;
  const originalPlatform = process.env.PLATFORM_OWNER_ADDRESS;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalOwner === undefined) delete process.env.LUCID_DEFAULT_PASSPORT_OWNER;
    else process.env.LUCID_DEFAULT_PASSPORT_OWNER = originalOwner;
    if (originalWallet === undefined) delete process.env.LUCID_PLATFORM_WALLET;
    else process.env.LUCID_PLATFORM_WALLET = originalWallet;
    if (originalPlatform === undefined) delete process.env.PLATFORM_OWNER_ADDRESS;
    else process.env.PLATFORM_OWNER_ADDRESS = originalPlatform;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('uses explicit user wallet ownership by default', () => {
    const result = resolvePassportOwnership({ owner: VALID_OWNER });
    expect(result).toEqual({
      owner: VALID_OWNER,
      owner_mode: 'user_wallet',
      claim_status: 'claimed',
      source: 'request_owner',
    });
  });

  it('preserves explicit custody mode for app-resolved workspace owners', () => {
    const result = resolvePassportOwnership({
      owner: VALID_OWNER,
      owner_mode: 'workspace_custody',
    });
    expect(result).toEqual({
      owner: VALID_OWNER,
      owner_mode: 'workspace_custody',
      claim_status: 'claimable',
      source: 'request_owner',
    });
  });

  it('requires configured platform owner in production when no owner is provided', () => {
    delete process.env.LUCID_DEFAULT_PASSPORT_OWNER;
    delete process.env.LUCID_PLATFORM_WALLET;
    delete process.env.PLATFORM_OWNER_ADDRESS;
    process.env.NODE_ENV = 'production';

    const result = resolvePassportOwnership({});
    expect(result).toEqual({
      error:
        'Platform owner wallet is not configured. Set LUCID_DEFAULT_PASSPORT_OWNER, LUCID_PLATFORM_WALLET, or PLATFORM_OWNER_ADDRESS.',
    });
  });
});
