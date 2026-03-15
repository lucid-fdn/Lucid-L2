// offchain/src/storage/depin/ArweaveStorage.ts
// Arweave storage via Irys Uploader — permanent, pay with SOL
// Lazy-loaded: @irys/upload + @irys/upload-solana only imported when first upload happens

import { IDepinStorage, UploadResult, UploadOptions } from './IDepinStorage';
import { logger } from '../lib/logger';

export class ArweaveStorage implements IDepinStorage {
  readonly providerName = 'arweave';
  private uploader: any = null;
  private network: string;

  constructor() {
    this.network = process.env.IRYS_NETWORK || 'devnet';
  }

  private async getUploader(): Promise<any> {
    if (this.uploader) return this.uploader;

    const privateKeyEnv = process.env.IRYS_PRIVATE_KEY;
    if (!privateKeyEnv) throw new Error('IRYS_PRIVATE_KEY env var required for Arweave uploads');

    try {
      const { Uploader } = require('@irys/upload');
      const { Solana } = require('@irys/upload-solana');

      // Parse key: supports JSON array "[1,2,3,...]" or base58 string
      let wallet: Uint8Array;
      if (privateKeyEnv.trimStart().startsWith('[')) {
        wallet = new Uint8Array(JSON.parse(privateKeyEnv));
      } else {
        wallet = new Uint8Array(Buffer.from(privateKeyEnv, 'base64'));
      }

      const rpcUrl = this.network === 'mainnet'
        ? 'https://api.mainnet-beta.solana.com'
        : 'https://api.devnet.solana.com';

      this.uploader = await Uploader(Solana)
        .withWallet(wallet)
        .withRpc(rpcUrl)
        .devnet(this.network !== 'mainnet');

      const balance = await this.uploader.getBalance();
      logger.info(`[ArweaveStorage] Connected to Irys (${this.network}), balance: ${balance}`);
      return this.uploader;
    } catch (err) {
      this.uploader = null;
      throw new Error(`Failed to initialize Irys: ${err instanceof Error ? err.message : err}`);
    }
  }

  async uploadJSON(data: unknown, options?: UploadOptions): Promise<UploadResult> {
    const uploader = await this.getUploader();
    const json = JSON.stringify(data);
    const buf = Buffer.from(json, 'utf-8');

    const tags = [
      { name: 'Content-Type', value: options?.contentType || 'application/json' },
      ...(options?.tags
        ? Object.entries(options.tags).map(([name, value]) => ({ name, value }))
        : []),
    ];

    const receipt = await uploader.upload(buf, { tags });
    return {
      cid: receipt.id,
      url: this.getUrl(receipt.id),
      provider: this.providerName,
      sizeBytes: buf.length,
    };
  }

  async uploadBytes(data: Buffer, options?: UploadOptions): Promise<UploadResult> {
    const uploader = await this.getUploader();
    const tags = [
      { name: 'Content-Type', value: options?.contentType || 'application/octet-stream' },
      ...(options?.tags
        ? Object.entries(options.tags).map(([name, value]) => ({ name, value }))
        : []),
    ];

    const receipt = await uploader.upload(data, { tags });
    return {
      cid: receipt.id,
      url: this.getUrl(receipt.id),
      provider: this.providerName,
      sizeBytes: data.length,
    };
  }

  async retrieve(cid: string): Promise<Buffer | null> {
    try {
      const res = await fetch(this.getUrl(cid));
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  async exists(cid: string): Promise<boolean> {
    try {
      const res = await fetch(this.getUrl(cid), { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const uploader = await this.getUploader();
      return !!uploader;
    } catch {
      return false;
    }
  }

  getUrl(cid: string): string {
    return `https://arweave.net/${cid}`;
  }
}
