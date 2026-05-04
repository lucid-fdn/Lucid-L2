export type PassportOwnershipMode = 'user_wallet' | 'workspace_custody' | 'platform_default';
export type PassportClaimStatus = 'claimed' | 'claimable';

export interface ResolvedPassportOwnership {
  owner: string;
  owner_mode: PassportOwnershipMode;
  claim_status: PassportClaimStatus;
  source: 'request_owner' | 'env_default' | 'dev_default';
}

const DEV_PLATFORM_OWNER = '11111111111111111111111111111111';

export function isWalletOwner(owner: string): boolean {
  return owner.startsWith('0x') || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(owner);
}

export function normalizeOwnershipMode(mode?: string): PassportOwnershipMode | undefined {
  if (mode === 'user_wallet' || mode === 'workspace_custody' || mode === 'platform_default') {
    return mode;
  }
  return undefined;
}

function resolveConfiguredPlatformOwner(): string | null {
  const owner =
    process.env.LUCID_DEFAULT_PASSPORT_OWNER?.trim()
    || process.env.LUCID_PLATFORM_WALLET?.trim()
    || process.env.PLATFORM_OWNER_ADDRESS?.trim()
    || null;

  if (owner) return owner;
  return process.env.NODE_ENV === 'production' ? null : DEV_PLATFORM_OWNER;
}

export function resolvePassportOwnership(params: {
  owner?: string;
  owner_mode?: string;
}): ResolvedPassportOwnership | { error: string } {
  const requestedOwner = params.owner?.trim();
  const requestedMode = normalizeOwnershipMode(params.owner_mode);

  if (requestedOwner) {
    if (!isWalletOwner(requestedOwner)) {
      return { error: 'Invalid owner address: must be a valid Solana or EVM wallet address' };
    }
    const ownerMode = requestedMode ?? 'user_wallet';
    return {
      owner: requestedOwner,
      owner_mode: ownerMode,
      claim_status: ownerMode === 'user_wallet' ? 'claimed' : 'claimable',
      source: 'request_owner',
    };
  }

  const platformOwner = resolveConfiguredPlatformOwner();
  if (!platformOwner) {
    return {
      error:
        'Platform owner wallet is not configured. Set LUCID_DEFAULT_PASSPORT_OWNER, LUCID_PLATFORM_WALLET, or PLATFORM_OWNER_ADDRESS.',
    };
  }
  if (!isWalletOwner(platformOwner)) {
    return { error: 'Configured platform owner wallet is invalid' };
  }

  return {
    owner: platformOwner,
    owner_mode: requestedMode ?? 'platform_default',
    claim_status: 'claimable',
    source: platformOwner === DEV_PLATFORM_OWNER ? 'dev_default' : 'env_default',
  };
}
