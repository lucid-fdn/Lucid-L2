import { MetaplexIdentityRegistry } from '../metaplex/identity';
import { RegistryCapabilityError } from '../ISolanaIdentityRegistry';

const mockUmi = { payer: { publicKey: 'OperatorPubkey' }, rpc: { getAccount: jest.fn() } };
const mockRegisterIdentityV1 = jest.fn().mockReturnValue({ sendAndConfirm: jest.fn().mockResolvedValue({ signature: new Uint8Array([1, 2, 3]) }) });
const mockRegisterExecutiveV1 = jest.fn().mockReturnValue({ sendAndConfirm: jest.fn().mockResolvedValue({}) });
const mockDelegateExecutionV1 = jest.fn().mockReturnValue({ sendAndConfirm: jest.fn().mockResolvedValue({}) });
const mockFindAgentIdentityV1Pda = jest.fn().mockReturnValue('AgentIdentityPDA');

jest.mock('@metaplex-foundation/mpl-agent-registry', () => ({
  mplAgentIdentity: jest.fn().mockReturnValue({}),
  registerIdentityV1: (...args: any[]) => mockRegisterIdentityV1(...args),
  registerExecutiveV1: (...args: any[]) => mockRegisterExecutiveV1(...args),
  delegateExecutionV1: (...args: any[]) => mockDelegateExecutionV1(...args),
  findAgentIdentityV1Pda: (...args: any[]) => mockFindAgentIdentityV1Pda(...args),
  findExecutiveProfileV1Pda: jest.fn().mockReturnValue('ExecProfilePDA'),
}), { virtual: true });

jest.mock('@metaplex-foundation/umi', () => ({
  publicKey: (k: string) => k,
}), { virtual: true });

const mockDispatch = jest.fn().mockResolvedValue({ url: 'https://arweave.net/doc123', cid: 'doc123' });
jest.mock('../../../anchoring', () => ({
  getAnchorDispatcher: () => ({ dispatch: mockDispatch }),
}), { virtual: true });

const mockConnection = { getUmi: jest.fn().mockResolvedValue(mockUmi) } as any;

describe('MetaplexIdentityRegistry', () => {
  let registry: MetaplexIdentityRegistry;
  beforeEach(() => {
    jest.clearAllMocks();
    mockUmi.rpc.getAccount.mockResolvedValue({ exists: false });
    registry = new MetaplexIdentityRegistry(mockConnection);
  });

  it('has correct registry name', () => { expect(registry.registryName).toBe('metaplex'); });

  it('capabilities include register, resolve, sync but not deregister', () => {
    expect(registry.capabilities).toEqual({ register: true, resolve: true, sync: true, deregister: false });
  });

  it('register throws if nft_mint is missing', async () => {
    const passport = { passport_id: 'p1', type: 'agent', owner: '3Qm', name: 'Agent', description: 'Test', metadata: {}, status: 'active', nft_mint: undefined, created_at: 0, updated_at: 0 } as any;
    await expect(registry.register(passport)).rejects.toThrow('nft_mint');
  });

  it('register calls registerIdentityV1 and returns result', async () => {
    const passport = { passport_id: 'p1', type: 'agent', owner: '3Qm', name: 'Agent', description: 'Test', metadata: {}, status: 'active', nft_mint: 'MintPubkey', created_at: 0, updated_at: 0 } as any;
    const result = await registry.register(passport);
    expect(result.registryName).toBe('metaplex');
    expect(result.externalId).toBe('MintPubkey');
    expect(result.registrationDocUri).toBe('https://arweave.net/doc123');
    expect(mockDispatch).toHaveBeenCalled();
    expect(mockRegisterIdentityV1).toHaveBeenCalled();
    expect(mockRegisterExecutiveV1).toHaveBeenCalled();
    expect(mockDelegateExecutionV1).toHaveBeenCalled();
  });

  it('deregister throws RegistryCapabilityError', async () => {
    await expect(registry.deregister('agent-1')).rejects.toThrow(RegistryCapabilityError);
  });
});
