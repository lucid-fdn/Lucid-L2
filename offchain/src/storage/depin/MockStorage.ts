// offchain/src/storage/depin/MockStorage.ts
// Local file-based storage with SHA-256 content addressing — for dev/test

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { IDepinStorage, UploadResult, UploadOptions } from './IDepinStorage';

export interface MockStorageConfig {
  storageDir?: string;
  subdir?: string;
}

export class MockStorage implements IDepinStorage {
  readonly providerName = 'mock';
  private storageDir: string;
  private initialized = false;

  constructor(config?: MockStorageConfig) {
    const base = config?.storageDir || path.join(process.cwd(), '.depin-mock-storage');
    this.storageDir = config?.subdir ? path.join(base, config.subdir) : base;
  }

  private ensureInit(): void {
    if (this.initialized) return;
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this.initialized = true;
  }

  private hash(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  async uploadJSON(data: unknown, options?: UploadOptions): Promise<UploadResult> {
    this.ensureInit();
    const json = JSON.stringify(data, null, 2);
    const buf = Buffer.from(json, 'utf-8');
    const cid = this.hash(buf);
    const ext = (options?.contentType === 'application/octet-stream') ? '.bin' : '.json';
    fs.writeFileSync(path.join(this.storageDir, `${cid}${ext}`), buf);
    return { cid, url: this.getUrl(cid), provider: this.providerName, sizeBytes: buf.length };
  }

  async uploadBytes(data: Buffer, options?: UploadOptions): Promise<UploadResult> {
    this.ensureInit();
    const cid = this.hash(data);
    const ext = '.bin';
    fs.writeFileSync(path.join(this.storageDir, `${cid}${ext}`), data);
    return { cid, url: this.getUrl(cid), provider: this.providerName, sizeBytes: data.length };
  }

  async retrieve(cid: string): Promise<Buffer | null> {
    this.ensureInit();
    for (const ext of ['.json', '.bin']) {
      const fp = path.join(this.storageDir, `${cid}${ext}`);
      if (fs.existsSync(fp)) {
        return fs.readFileSync(fp);
      }
    }
    return null;
  }

  async exists(cid: string): Promise<boolean> {
    this.ensureInit();
    for (const ext of ['.json', '.bin']) {
      if (fs.existsSync(path.join(this.storageDir, `${cid}${ext}`))) return true;
    }
    return false;
  }

  async isHealthy(): Promise<boolean> {
    try {
      this.ensureInit();
      return true;
    } catch {
      return false;
    }
  }

  getUrl(cid: string): string {
    return `file://${this.storageDir}/${cid}`;
  }
}
