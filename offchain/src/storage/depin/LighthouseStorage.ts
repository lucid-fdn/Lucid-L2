// offchain/src/storage/depin/LighthouseStorage.ts
// Lighthouse storage (Filecoin + IPFS) — evolving data, pay once
// Lazy-loaded: @lighthouse-web3/sdk only imported when first upload happens

import { IDepinStorage, UploadResult, UploadOptions } from './IDepinStorage';

export class LighthouseStorage implements IDepinStorage {
  readonly providerName = 'lighthouse';
  private sdk: any = null;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.LIGHTHOUSE_API_KEY || '';
  }

  private getSdk(): any {
    if (this.sdk) return this.sdk;
    if (!this.apiKey) throw new Error('LIGHTHOUSE_API_KEY env var required for Lighthouse uploads');

    try {
      this.sdk = require('@lighthouse-web3/sdk');
      return this.sdk;
    } catch (err) {
      throw new Error(`Failed to load @lighthouse-web3/sdk: ${err instanceof Error ? err.message : err}`);
    }
  }

  async uploadJSON(data: unknown, options?: UploadOptions): Promise<UploadResult> {
    const sdk = this.getSdk();
    const json = JSON.stringify(data);

    const response = await sdk.uploadText(json, this.apiKey, undefined, options?.tags);
    const cid = response?.data?.Hash;
    if (!cid) throw new Error('Lighthouse upload returned no CID');

    return {
      cid,
      url: this.getUrl(cid),
      provider: this.providerName,
      sizeBytes: Buffer.byteLength(json, 'utf-8'),
    };
  }

  async uploadBytes(data: Buffer, options?: UploadOptions): Promise<UploadResult> {
    const sdk = this.getSdk();

    const response = await sdk.uploadBuffer(data, this.apiKey);
    const cid = response?.data?.Hash;
    if (!cid) throw new Error('Lighthouse upload returned no CID');

    return {
      cid,
      url: this.getUrl(cid),
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
      this.getSdk();
      return !!this.apiKey;
    } catch {
      return false;
    }
  }

  getUrl(cid: string): string {
    return `https://gateway.lighthouse.storage/ipfs/${cid}`;
  }
}
