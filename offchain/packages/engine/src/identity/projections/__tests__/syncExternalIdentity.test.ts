import { syncExternalIdentity } from '../jobs/syncExternalIdentity';

const mockRegister = jest.fn().mockResolvedValue({
  registryName: 'metaplex',
  externalId: 'MintPubkey',
  txSignature: 'tx-123',
  registrationDocUri: 'https://arweave.net/doc',
});

const mockRegistry = {
  registryName: 'metaplex',
  supportedAssetTypes: ['agent'],
  capabilities: { register: true, resolve: true, sync: true, deregister: false },
  register: mockRegister,
  sync: jest.fn().mockResolvedValue({ success: true }),
  isAvailable: jest.fn().mockResolvedValue(true),
};

jest.mock('../factory', () => ({
  getIdentityRegistries: () => [mockRegistry],
}));

const mockUpdateExternalRegistration = jest.fn();
jest.mock('../../stores/passportStore', () => ({
  getPassportStore: () => ({
    get: jest.fn().mockResolvedValue({}),
    update: jest.fn(),
    updateExternalRegistration: mockUpdateExternalRegistration,
  }),
}));

describe('syncExternalIdentity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registers passport on available registries', async () => {
    const passport = {
      passport_id: 'p1', type: 'agent', owner: '3Qm', name: 'Agent',
      metadata: {}, status: 'active', nft_mint: 'MintPubkey',
      created_at: 0, updated_at: 0,
    } as any;

    await syncExternalIdentity(passport);

    expect(mockRegister).toHaveBeenCalledWith(passport, { skipIfExists: true });
    expect(mockUpdateExternalRegistration).toHaveBeenCalled();
  });

  it('skips registries that do not support the asset type', async () => {
    const passport = {
      passport_id: 'p1', type: 'model', owner: '3Qm', name: 'Model',
      metadata: {}, status: 'active', nft_mint: 'MintPubkey',
      created_at: 0, updated_at: 0,
    } as any;

    await syncExternalIdentity(passport);

    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('does not throw on registry failure', async () => {
    mockRegister.mockRejectedValueOnce(new Error('Network error'));

    const passport = {
      passport_id: 'p1', type: 'agent', owner: '3Qm', name: 'Agent',
      metadata: {}, status: 'active', nft_mint: 'MintPubkey',
      created_at: 0, updated_at: 0,
    } as any;

    await expect(syncExternalIdentity(passport)).resolves.not.toThrow();
  });
});
