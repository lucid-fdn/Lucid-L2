// offchain/src/nft/MockNFTProvider.ts
// In-memory mock NFT provider for dev/test

import { createHash, randomBytes } from 'crypto';
import { INFTProvider, MintResult, NFTMetadata } from './INFTProvider';

interface StoredNFT {
  mint: string;
  owner: string;
  metadata: NFTMetadata;
  createdAt: number;
}

export class MockNFTProvider implements INFTProvider {
  readonly providerName = 'mock';
  readonly chain = 'mock-chain';
  private assets = new Map<string, StoredNFT>();

  async mint(owner: string, metadata: NFTMetadata): Promise<MintResult> {
    const mint = 'mock_nft_' + randomBytes(16).toString('hex');
    const txSignature = 'mock_tx_' + randomBytes(16).toString('hex');

    this.assets.set(mint, {
      mint,
      owner,
      metadata,
      createdAt: Date.now(),
    });

    return {
      mint,
      txSignature,
      tokenAccount: owner,
      chain: this.chain,
      provider: this.providerName,
    };
  }

  async burn(mint: string): Promise<string> {
    if (!this.assets.has(mint)) throw new Error(`NFT not found: ${mint}`);
    this.assets.delete(mint);
    return 'mock_burn_tx_' + randomBytes(16).toString('hex');
  }

  async updateMetadata(mint: string, newMetadata: Partial<NFTMetadata>): Promise<string> {
    const nft = this.assets.get(mint);
    if (!nft) throw new Error(`NFT not found: ${mint}`);
    Object.assign(nft.metadata, newMetadata);
    return 'mock_update_tx_' + randomBytes(16).toString('hex');
  }

  async getAsset(mint: string): Promise<StoredNFT | null> {
    return this.assets.get(mint) || null;
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
