import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { MockStorage } from '../../packages/engine/src/shared/depin/MockStorage';
import { getPermanentStorage, getEvolvingStorage, resetDepinStorage } from '../../packages/engine/src/shared/depin';

describe('MockStorage', () => {
  let storage: MockStorage;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `depin-test-${Date.now()}`);
    storage = new MockStorage({ storageDir: testDir });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should upload and retrieve JSON', async () => {
    const data = { name: 'test-model', version: '1.0.0' };
    const result = await storage.uploadJSON(data);

    expect(result.cid).toBeTruthy();
    expect(result.provider).toBe('mock');
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.url).toContain(result.cid);

    const retrieved = await storage.retrieve(result.cid);
    expect(retrieved).not.toBeNull();
    const parsed = JSON.parse(retrieved!.toString());
    expect(parsed.name).toBe('test-model');
  });

  it('should upload and retrieve bytes', async () => {
    const data = Buffer.from('binary proof data');
    const result = await storage.uploadBytes(data);

    expect(result.cid).toBeTruthy();
    expect(result.provider).toBe('mock');

    const retrieved = await storage.retrieve(result.cid);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.toString()).toBe('binary proof data');
  });

  it('should check existence', async () => {
    const result = await storage.uploadJSON({ test: true });
    expect(await storage.exists(result.cid)).toBe(true);
    expect(await storage.exists('nonexistent')).toBe(false);
  });

  it('should return null for missing CID', async () => {
    const result = await storage.retrieve('nonexistent');
    expect(result).toBeNull();
  });

  it('should be healthy', async () => {
    expect(await storage.isHealthy()).toBe(true);
  });

  it('should produce deterministic CIDs for same content', async () => {
    const data = { deterministic: true };
    const r1 = await storage.uploadJSON(data);
    const r2 = await storage.uploadJSON(data);
    expect(r1.cid).toBe(r2.cid);
  });
});

describe('DePIN Factory', () => {
  afterEach(() => {
    resetDepinStorage();
    delete process.env.DEPIN_PERMANENT_PROVIDER;
    delete process.env.DEPIN_EVOLVING_PROVIDER;
  });

  it('should default to mock provider', () => {
    const permanent = getPermanentStorage();
    expect(permanent.providerName).toBe('mock');

    const evolving = getEvolvingStorage();
    expect(evolving.providerName).toBe('mock');
  });

  it('should return singletons', () => {
    const a = getPermanentStorage();
    const b = getPermanentStorage();
    expect(a).toBe(b);
  });

  it('should reset singletons', () => {
    const a = getPermanentStorage();
    resetDepinStorage();
    const b = getPermanentStorage();
    expect(a).not.toBe(b);
  });
});
