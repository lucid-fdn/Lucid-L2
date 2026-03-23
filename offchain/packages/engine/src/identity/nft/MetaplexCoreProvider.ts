// offchain/src/nft/MetaplexCoreProvider.ts
// Metaplex Core NFT provider — lazy-loaded, optional alternative to Token-2022

import { INFTProvider, MintResult, NFTMetadata } from './INFTProvider';
import { LazyUmi } from '../../shared/chains/solana/umi';

export class MetaplexCoreProvider implements INFTProvider {
  readonly providerName = 'metaplex-core';
  readonly chain: string;
  private lazyUmi = new LazyUmi();

  constructor() {
    this.chain = process.env.SOLANA_CLUSTER === 'mainnet-beta' ? 'solana-mainnet' : 'solana-devnet';
  }

  private async getUmi(): Promise<any> {
    return this.lazyUmi.get();
  }

  async mint(owner: string, metadata: NFTMetadata): Promise<MintResult> {
    const umi = await this.getUmi();
    const { createV1 } = require('@metaplex-foundation/mpl-core');
    const { generateSigner, publicKey } = require('@metaplex-foundation/umi');

    const assetSigner = generateSigner(umi);
    const collectionAddress = process.env.METAPLEX_COLLECTION_ADDRESS;

    const builder = createV1(umi, {
      asset: assetSigner,
      name: metadata.name,
      uri: metadata.uri,
      owner: publicKey(owner),
      ...(collectionAddress ? { collection: publicKey(collectionAddress) } : {}),
    });

    const result = await builder.sendAndConfirm(umi);

    return {
      mint: assetSigner.publicKey.toString(),
      txSignature: Buffer.from(result.signature).toString('base64'),
      chain: this.chain,
      provider: this.providerName,
    };
  }

  async burn(mint: string): Promise<string> {
    const umi = await this.getUmi();
    const { burnV1 } = require('@metaplex-foundation/mpl-core');
    const { publicKey } = require('@metaplex-foundation/umi');

    const result = await burnV1(umi, { asset: publicKey(mint) }).sendAndConfirm(umi);
    return Buffer.from(result.signature).toString('base64');
  }

  async updateMetadata(mint: string, newMetadata: Partial<NFTMetadata>): Promise<string> {
    const umi = await this.getUmi();
    const { updateV1 } = require('@metaplex-foundation/mpl-core');
    const { publicKey } = require('@metaplex-foundation/umi');

    const result = await updateV1(umi, {
      asset: publicKey(mint),
      ...(newMetadata.name ? { name: newMetadata.name } : {}),
      ...(newMetadata.uri ? { uri: newMetadata.uri } : {}),
    }).sendAndConfirm(umi);

    return Buffer.from(result.signature).toString('base64');
  }

  async getAsset(mint: string): Promise<any | null> {
    try {
      const umi = await this.getUmi();
      const { fetchAssetV1 } = require('@metaplex-foundation/mpl-core');
      const { publicKey } = require('@metaplex-foundation/umi');
      return fetchAssetV1(umi, publicKey(mint));
    } catch {
      return null;
    }
  }

  /**
   * Add a custom data plugin to an existing Metaplex Core asset.
   * MIP #52 prep: stores structured data (reputation, capabilities) on-chain.
   *
   * Plugin types for Lucid:
   * - 'reputation': { avg_score, feedback_count, last_updated }
   * - 'capabilities': { tools, models, channels }
   * - 'deployment': { target, url, status }
   */
  async addPlugin(
    mint: string,
    pluginType: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const umi = await this.getUmi();
    const { addPluginV1 } = require('@metaplex-foundation/mpl-core');
    const { publicKey } = require('@metaplex-foundation/umi');

    // Encode plugin data as JSON attribute map
    const result = await addPluginV1(umi, {
      asset: publicKey(mint),
      plugin: {
        type: 'Attributes',
        attributeList: Object.entries(data).map(([key, value]) => ({
          key: `${pluginType}:${key}`,
          value: String(value),
        })),
      },
    }).sendAndConfirm(umi);

    return Buffer.from(result.signature).toString('base64');
  }

  /**
   * Update reputation data on a Metaplex Core asset plugin.
   * MIP #52 prep: keeps on-chain reputation in sync with aggregated scores.
   */
  async syncReputationPlugin(
    mint: string,
    reputation: { avg_score: number; feedback_count: number; validation_count: number },
  ): Promise<string> {
    return this.addPlugin(mint, 'reputation', {
      avg_score: reputation.avg_score.toString(),
      feedback_count: reputation.feedback_count.toString(),
      validation_count: reputation.validation_count.toString(),
      last_updated: Math.floor(Date.now() / 1000).toString(),
    });
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.getUmi();
      return true;
    } catch {
      return false;
    }
  }
}
