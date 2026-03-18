/**
 * Tests for CLI credentials store + launch resolver.
 * Uses temp directories to avoid touching real ~/.lucid/.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;

// Because credentials.ts reads LUCID_CONFIG_DIR at module load time,
// we must set the env var BEFORE importing and use jest.resetModules()
// between tests to get fresh module state.
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-cli-test-'));
  process.env.LUCID_CONFIG_DIR = tmpDir;
  process.env.LUCID_CREDENTIALS_FILE = path.join(tmpDir, 'credentials.json');
  jest.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.LUCID_CONFIG_DIR;
  delete process.env.LUCID_CREDENTIALS_FILE;
});

// Helper: dynamically import credentials module (fresh per test)
async function importCredentials() {
  return await import('../cli/credentials');
}

// Helper: dynamically import launch resolver (fresh per test)
async function importResolver() {
  return await import('../cli/launch-resolver');
}

// ---------------------------------------------------------------------------
// Credentials Store (6 tests)
// ---------------------------------------------------------------------------
describe('credentials store', () => {
  it('loadCredentials() returns empty object when no file exists', async () => {
    const { loadCredentials } = await importCredentials();
    const creds = loadCredentials();
    expect(creds).toEqual({});
  });

  it('saveCredentials() creates directory and file', async () => {
    const { saveCredentials, loadCredentials } = await importCredentials();
    const data = { lucid: { api_url: 'https://api.lucid.foundation', token: 'tok_123' } };
    saveCredentials(data);

    const filePath = path.join(tmpDir, 'credentials.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const written = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(written.lucid.token).toBe('tok_123');

    // Roundtrip
    const loaded = loadCredentials();
    expect(loaded.lucid?.token).toBe('tok_123');
  });

  it('setLucidAuth() + getLucidAuth() roundtrip', async () => {
    const { setLucidAuth, getLucidAuth } = await importCredentials();
    setLucidAuth({ api_url: 'https://api.lucid.foundation', token: 'roundtrip_token' });
    const auth = getLucidAuth();
    expect(auth).toBeDefined();
    expect(auth!.token).toBe('roundtrip_token');
    expect(auth!.api_url).toBe('https://api.lucid.foundation');
  });

  it('setProvider() + getProviders() roundtrip', async () => {
    const { setProvider, getProviders } = await importCredentials();
    setProvider('railway', {
      token: 'rw_token_abc',
      method: 'manual',
      connected_at: '2026-03-18T00:00:00Z',
    });
    const providers = getProviders();
    expect(providers.railway).toBeDefined();
    expect(providers.railway.token).toBe('rw_token_abc');
    expect(providers.railway.method).toBe('manual');
  });

  it('removeProvider() deletes provider and returns true', async () => {
    const { setProvider, removeProvider, getProviders } = await importCredentials();
    setProvider('akash', {
      key: 'ak_key_123',
      method: 'manual',
      connected_at: '2026-03-18T00:00:00Z',
    });
    const result = removeProvider('akash');
    expect(result).toBe(true);
    const providers = getProviders();
    expect(providers.akash).toBeUndefined();
  });

  it('removeProvider() returns false for unknown provider', async () => {
    const { removeProvider } = await importCredentials();
    const result = removeProvider('nonexistent');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Launch Resolver (9+ tests)
// ---------------------------------------------------------------------------
describe('launch resolver', () => {
  it('--mode layer --target railway + credential -> Layer', async () => {
    const { setProvider } = await importCredentials();
    setProvider('railway', {
      token: 'rw_tok',
      method: 'manual',
      connected_at: '2026-03-18T00:00:00Z',
    });

    const { resolveLaunchPath } = await importResolver();
    const result = resolveLaunchPath({ mode: 'layer', target: 'railway' });
    expect(result.path).toBe('layer');
    expect(result.provider).toBe('railway');
    expect(result.providerCredential?.token).toBe('rw_tok');
  });

  it('--mode layer without --target -> error', async () => {
    const { resolveLaunchPath } = await importResolver();
    const result = resolveLaunchPath({ mode: 'layer' });
    expect(result.path).toBe('error');
    expect(result.error).toContain('--mode layer requires --target');
  });

  it('--mode layer --target railway without credential -> error', async () => {
    const { resolveLaunchPath } = await importResolver();
    const result = resolveLaunchPath({ mode: 'layer', target: 'railway' });
    expect(result.path).toBe('error');
    expect(result.error).toContain('railway not connected');
    expect(result.error).toContain('lucid provider add railway');
  });

  it('--mode cloud + Lucid auth -> Cloud', async () => {
    const { setLucidAuth } = await importCredentials();
    setLucidAuth({ api_url: 'https://api.lucid.foundation', token: 'cloud_tok_xyz' });

    const { resolveLaunchPath } = await importResolver();
    const result = resolveLaunchPath({ mode: 'cloud' });
    expect(result.path).toBe('cloud');
    expect(result.cloudToken).toBe('cloud_tok_xyz');
  });

  it('--mode cloud without auth -> error', async () => {
    const { resolveLaunchPath } = await importResolver();
    const result = resolveLaunchPath({ mode: 'cloud' });
    expect(result.path).toBe('error');
    expect(result.error).toContain('Not logged in');
    expect(result.error).toContain('lucid login');
  });

  it('--target railway + credential -> Layer', async () => {
    const { setProvider } = await importCredentials();
    setProvider('railway', {
      token: 'rw_auto',
      method: 'manual',
      connected_at: '2026-03-18T00:00:00Z',
    });

    const { resolveLaunchPath } = await importResolver();
    const result = resolveLaunchPath({ target: 'railway' });
    expect(result.path).toBe('layer');
    expect(result.provider).toBe('railway');
    expect(result.providerCredential?.token).toBe('rw_auto');
  });

  it('--target railway without credential -> error (contains "not connected locally")', async () => {
    const { resolveLaunchPath } = await importResolver();
    const result = resolveLaunchPath({ target: 'railway' });
    expect(result.path).toBe('error');
    expect(result.error).toContain('not connected locally');
    expect(result.error).toContain('lucid provider add railway');
  });

  it('no target + Cloud auth -> Cloud', async () => {
    const { setLucidAuth } = await importCredentials();
    setLucidAuth({ api_url: 'https://api.lucid.foundation', token: 'auto_cloud_tok' });

    const { resolveLaunchPath } = await importResolver();
    const result = resolveLaunchPath({});
    expect(result.path).toBe('cloud');
    expect(result.cloudToken).toBe('auto_cloud_tok');
  });

  it('no target + one local provider -> Layer with that provider', async () => {
    const { setProvider } = await importCredentials();
    setProvider('akash', {
      key: 'ak_only',
      method: 'manual',
      connected_at: '2026-03-18T00:00:00Z',
    });

    const { resolveLaunchPath } = await importResolver();
    const result = resolveLaunchPath({});
    expect(result.path).toBe('layer');
    expect(result.provider).toBe('akash');
    expect(result.providerCredential?.key).toBe('ak_only');
  });

  it('nothing -> error with instructions', async () => {
    const { resolveLaunchPath } = await importResolver();
    const result = resolveLaunchPath({});
    expect(result.path).toBe('error');
    expect(result.error).toContain('Not authenticated');
    expect(result.error).toContain('lucid login');
    expect(result.error).toContain('lucid provider add');
  });

  it('Cloud auth + local provider but no target -> Cloud takes priority (step 5 before step 6)', async () => {
    const { setLucidAuth, setProvider } = await importCredentials();
    setLucidAuth({ api_url: 'https://api.lucid.foundation', token: 'cloud_priority' });
    setProvider('railway', {
      token: 'rw_tok',
      method: 'manual',
      connected_at: '2026-03-18T00:00:00Z',
    });

    const { resolveLaunchPath } = await importResolver();
    const result = resolveLaunchPath({});
    expect(result.path).toBe('cloud');
    expect(result.cloudToken).toBe('cloud_priority');
  });

  it('multiple local providers + no Cloud -> error (ambiguous)', async () => {
    const { setProvider } = await importCredentials();
    setProvider('railway', {
      token: 'rw_tok',
      method: 'manual',
      connected_at: '2026-03-18T00:00:00Z',
    });
    setProvider('akash', {
      key: 'ak_key',
      method: 'manual',
      connected_at: '2026-03-18T00:00:00Z',
    });

    const { resolveLaunchPath } = await importResolver();
    const result = resolveLaunchPath({});
    expect(result.path).toBe('error');
    expect(result.error).toContain('Not authenticated');
  });
});
