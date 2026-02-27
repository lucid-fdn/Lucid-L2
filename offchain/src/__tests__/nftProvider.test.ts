import { MockNFTProvider } from '../nft/MockNFTProvider';
import { getNFTProvider, resetNFTProvider } from '../nft';
import { NFTMetadata } from '../nft/INFTProvider';

const testMetadata: NFTMetadata = {
  name: 'Test Model NFT',
  symbol: 'TMOD',
  uri: 'https://arweave.net/abc123',
  passportId: 'mdl_test123',
  passportType: 'model',
  description: 'A test model passport NFT',
  attributes: [
    { trait_type: 'format', value: 'safetensors' },
    { trait_type: 'parameters', value: '7B' },
  ],
};

describe('MockNFTProvider', () => {
  let provider: MockNFTProvider;

  beforeEach(() => {
    provider = new MockNFTProvider();
  });

  it('should mint an NFT and return result', async () => {
    const result = await provider.mint('owner123', testMetadata);

    expect(result.mint).toMatch(/^mock_nft_/);
    expect(result.txSignature).toMatch(/^mock_tx_/);
    expect(result.chain).toBe('mock-chain');
    expect(result.provider).toBe('mock');
    expect(result.tokenAccount).toBe('owner123');
  });

  it('should retrieve minted asset', async () => {
    const result = await provider.mint('owner123', testMetadata);
    const asset = await provider.getAsset(result.mint);

    expect(asset).not.toBeNull();
    expect(asset!.mint).toBe(result.mint);
    expect(asset!.owner).toBe('owner123');
    expect(asset!.metadata.name).toBe('Test Model NFT');
    expect(asset!.metadata.passportId).toBe('mdl_test123');
  });

  it('should return null for nonexistent asset', async () => {
    const asset = await provider.getAsset('nonexistent');
    expect(asset).toBeNull();
  });

  it('should burn an NFT', async () => {
    const result = await provider.mint('owner123', testMetadata);
    const burnTx = await provider.burn(result.mint);

    expect(burnTx).toMatch(/^mock_burn_tx_/);

    const asset = await provider.getAsset(result.mint);
    expect(asset).toBeNull();
  });

  it('should throw on burning nonexistent NFT', async () => {
    await expect(provider.burn('nonexistent')).rejects.toThrow('NFT not found');
  });

  it('should update metadata', async () => {
    const result = await provider.mint('owner123', testMetadata);
    const updateTx = await provider.updateMetadata(result.mint, {
      name: 'Updated Model NFT',
      uri: 'https://arweave.net/updated',
    });

    expect(updateTx).toMatch(/^mock_update_tx_/);

    const asset = await provider.getAsset(result.mint);
    expect(asset!.metadata.name).toBe('Updated Model NFT');
    expect(asset!.metadata.uri).toBe('https://arweave.net/updated');
    // Original fields preserved
    expect(asset!.metadata.symbol).toBe('TMOD');
    expect(asset!.metadata.passportId).toBe('mdl_test123');
  });

  it('should throw on updating nonexistent NFT', async () => {
    await expect(
      provider.updateMetadata('nonexistent', { name: 'fail' }),
    ).rejects.toThrow('NFT not found');
  });

  it('should be healthy', async () => {
    expect(await provider.isHealthy()).toBe(true);
  });

  it('should mint multiple NFTs independently', async () => {
    const r1 = await provider.mint('ownerA', testMetadata);
    const r2 = await provider.mint('ownerB', { ...testMetadata, name: 'Second NFT' });

    expect(r1.mint).not.toBe(r2.mint);

    const a1 = await provider.getAsset(r1.mint);
    const a2 = await provider.getAsset(r2.mint);
    expect(a1!.owner).toBe('ownerA');
    expect(a2!.owner).toBe('ownerB');
    expect(a2!.metadata.name).toBe('Second NFT');
  });
});

describe('NFT Factory', () => {
  afterEach(() => {
    resetNFTProvider();
    delete process.env.NFT_PROVIDER;
  });

  it('should default to mock provider', () => {
    const provider = getNFTProvider();
    expect(provider.providerName).toBe('mock');
    expect(provider.chain).toBe('mock-chain');
  });

  it('should return singletons', () => {
    const a = getNFTProvider();
    const b = getNFTProvider();
    expect(a).toBe(b);
  });

  it('should reset singletons', () => {
    const a = getNFTProvider();
    resetNFTProvider();
    const b = getNFTProvider();
    expect(a).not.toBe(b);
  });
});
