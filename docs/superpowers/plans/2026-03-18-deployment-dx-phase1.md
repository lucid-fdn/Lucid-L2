# Deployment DX Phase 1: Credentials + Login + Launch Resolver

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `lucid login` authenticates users, `lucid provider add` connects providers, `lucid launch` auto-detects Layer vs Cloud path. Foundation for one-click deployment.

**Architecture:** New `src/cli/` module with credentials store (`~/.lucid/credentials.json`), OAuth login flow, provider management, and deterministic launch resolver. Builds on existing `lucid launch` command.

**Tech Stack:** TypeScript, Commander.js (already used in cli.ts), `open` package (browser open), `http` (localhost OAuth callback).

**Spec:** `docs/superpowers/specs/2026-03-18-deployment-dx-design.md`

**Baseline:** 102 test suites, 1585 tests, 0 failures.

---

## File Structure

### Files to Create (6)
| File | Responsibility |
|------|---------------|
| `src/cli/credentials.ts` | Read/write `~/.lucid/credentials.json`, chmod 600 |
| `src/cli/auth.ts` | `lucid login` — browser OAuth + `--token` fallback |
| `src/cli/providers.ts` | `lucid provider add/list/remove` — OAuth (Railway) + key prompt |
| `src/cli/launch-resolver.ts` | 6-step deterministic resolution: `--mode` → `--target` → Cloud → Layer → error |
| `src/cli/oauth-callback.ts` | Localhost HTTP server for OAuth redirect callbacks |
| `src/__tests__/cli-credentials.test.ts` | Tests for credentials + resolver logic |

### Files to Modify (1)
| File | Changes |
|------|---------|
| `src/cli.ts` | Wire new commands: `login`, `provider add/list/remove`, update `launch` to use resolver |

---

## Task 1: Credentials Store

**Files:**
- Create: `offchain/src/cli/credentials.ts`

- [ ] **Step 1: Create credentials module**

```typescript
// src/cli/credentials.ts
import fs from 'fs';
import path from 'path';
import os from 'os';

const LUCID_DIR = path.join(os.homedir(), '.lucid');
const CREDS_FILE = path.join(LUCID_DIR, 'credentials.json');

export interface LucidAuth {
  api_url: string;
  token: string;
  expires_at?: string;
}

export interface ProviderCredential {
  token?: string;
  key?: string;
  method: 'oauth' | 'manual';
  connected_at: string;
}

export interface Credentials {
  lucid?: LucidAuth;
  providers?: Record<string, ProviderCredential>;
}

export function loadCredentials(): Credentials {
  try {
    if (!fs.existsSync(CREDS_FILE)) return {};
    return JSON.parse(fs.readFileSync(CREDS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveCredentials(creds: Credentials): void {
  fs.mkdirSync(LUCID_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function setLucidAuth(auth: LucidAuth): void {
  const creds = loadCredentials();
  creds.lucid = auth;
  saveCredentials(creds);
}

export function setProvider(name: string, credential: ProviderCredential): void {
  const creds = loadCredentials();
  if (!creds.providers) creds.providers = {};
  creds.providers[name] = credential;
  saveCredentials(creds);
}

export function removeProvider(name: string): boolean {
  const creds = loadCredentials();
  if (!creds.providers?.[name]) return false;
  delete creds.providers[name];
  saveCredentials(creds);
  return true;
}

export function getProviders(): Record<string, ProviderCredential> {
  return loadCredentials().providers || {};
}

export function getLucidAuth(): LucidAuth | undefined {
  return loadCredentials().lucid;
}

export { LUCID_DIR, CREDS_FILE };
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/credentials.ts
git commit -m "feat(cli): credentials store — ~/.lucid/credentials.json with chmod 600"
```

---

## Task 2: OAuth Callback Server

**Files:**
- Create: `offchain/src/cli/oauth-callback.ts`

- [ ] **Step 1: Create OAuth callback handler**

A temporary localhost HTTP server that receives OAuth redirects. Used by `lucid login` and `lucid provider add railway`.

```typescript
// src/cli/oauth-callback.ts
import http from 'http';
import { URL } from 'url';

/**
 * Start a temporary localhost server to receive OAuth callback.
 * Returns the authorization code or token from the callback URL.
 */
export function waitForOAuthCallback(port: number = 0): Promise<{ code?: string; token?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${port}`);
      const code = url.searchParams.get('code');
      const token = url.searchParams.get('token');
      const error = url.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (error) {
        res.end('<html><body><h2>Authentication failed</h2><p>You can close this window.</p></body></html>');
        server.close();
        resolve({ error });
      } else {
        res.end('<html><body><h2>Authenticated!</h2><p>You can close this window and return to the terminal.</p></body></html>');
        server.close();
        resolve({ code: code || undefined, token: token || undefined });
      }
    });

    server.listen(port, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      (server as any)._resolvedPort = addr.port;
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth callback timed out after 2 minutes'));
    }, 120000);
  });
}

export function getCallbackPort(server: http.Server): number {
  return (server.address() as { port: number })?.port || 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/oauth-callback.ts
git commit -m "feat(cli): OAuth callback server for browser-based auth flows"
```

---

## Task 3: `lucid login`

**Files:**
- Create: `offchain/src/cli/auth.ts`

- [ ] **Step 1: Create login command**

```typescript
// src/cli/auth.ts
import { setLucidAuth, getLucidAuth } from './credentials';

const LUCID_AUTH_URL = process.env.LUCID_AUTH_URL || 'https://lucid.foundation/auth/cli';

/**
 * lucid login — authenticate with Lucid account
 *
 * Browser OAuth (default): opens browser → OAuth flow → token returned via localhost callback
 * Token mode (--token): directly saves provided token (for CI/headless)
 */
export async function loginCommand(opts: { token?: string }): Promise<void> {
  // Token mode (CI/headless)
  if (opts.token) {
    setLucidAuth({
      api_url: process.env.LUCID_API_URL || 'https://api.lucid.foundation',
      token: opts.token,
    });
    console.log('✓ Token saved to ~/.lucid/credentials.json');
    return;
  }

  // Browser OAuth
  try {
    const { waitForOAuthCallback } = await import('./oauth-callback');
    const callbackPromise = waitForOAuthCallback(0);

    // Wait a tick for server to start, then open browser
    await new Promise(r => setTimeout(r, 500));

    // Dynamic import 'open' for browser launch
    let openBrowser: (url: string) => Promise<any>;
    try {
      const open = await import('open');
      openBrowser = open.default;
    } catch {
      // 'open' not installed — print URL for manual open
      console.log(`Open this URL in your browser: ${LUCID_AUTH_URL}`);
      openBrowser = async () => {};
    }

    console.log('Opening browser for authentication...');
    await openBrowser(LUCID_AUTH_URL);
    console.log('Waiting for authentication...');

    const result = await callbackPromise;
    if (result.error) {
      console.error(`✗ Authentication failed: ${result.error}`);
      process.exit(1);
    }

    const token = result.token || result.code || '';
    if (!token) {
      console.error('✗ No token received');
      process.exit(1);
    }

    setLucidAuth({
      api_url: process.env.LUCID_API_URL || 'https://api.lucid.foundation',
      token,
    });
    console.log('✓ Authenticated');
    console.log('✓ Token saved to ~/.lucid/credentials.json');
  } catch (err: any) {
    console.error(`✗ Login failed: ${err.message}`);
    process.exit(1);
  }
}

export async function whoamiCommand(): Promise<void> {
  const auth = getLucidAuth();
  if (!auth) {
    console.log('Not logged in. Run: lucid login');
    return;
  }
  console.log(`Logged in to ${auth.api_url}`);
  console.log(`Token: ${auth.token.slice(0, 8)}...${auth.token.slice(-4)}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/auth.ts
git commit -m "feat(cli): lucid login — browser OAuth + --token for CI"
```

---

## Task 4: `lucid provider add/list/remove`

**Files:**
- Create: `offchain/src/cli/providers.ts`

- [ ] **Step 1: Create provider management commands**

```typescript
// src/cli/providers.ts
import { setProvider, removeProvider, getProviders } from './credentials';
import readline from 'readline';

const OAUTH_PROVIDERS: Record<string, { authUrl: string; clientId: string }> = {
  railway: {
    authUrl: 'https://railway.app/authorize',
    clientId: process.env.LUCID_RAILWAY_CLIENT_ID || '',
  },
};

const KEY_PROVIDERS = ['akash', 'phala', 'ionet', 'nosana'];

const PROVIDER_HELP: Record<string, string> = {
  railway: 'Get token at: https://railway.app/account/tokens',
  akash: 'Get API key at: https://console.akash.network/settings',
  phala: 'Get API key at: https://cloud.phala.network/dashboard',
  ionet: 'Get API key at: https://cloud.io.net/settings/api',
  nosana: 'Get API key at: https://dashboard.nosana.io/settings',
};

async function promptForKey(provider: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`Enter your ${provider} API key (${PROVIDER_HELP[provider] || ''}): `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function addProviderCommand(provider: string): Promise<void> {
  const validProviders = [...Object.keys(OAUTH_PROVIDERS), ...KEY_PROVIDERS];
  if (!validProviders.includes(provider)) {
    console.error(`Unknown provider: ${provider}`);
    console.error(`Available: ${validProviders.join(', ')}`);
    process.exit(1);
  }

  if (OAUTH_PROVIDERS[provider] && OAUTH_PROVIDERS[provider].clientId) {
    // OAuth flow (Railway)
    try {
      const { waitForOAuthCallback } = await import('./oauth-callback');
      const callbackPromise = waitForOAuthCallback(0);
      await new Promise(r => setTimeout(r, 500));

      const authUrl = `${OAUTH_PROVIDERS[provider].authUrl}?client_id=${OAUTH_PROVIDERS[provider].clientId}&response_type=code`;
      console.log(`Opening browser for ${provider} authorization...`);

      try {
        const open = await import('open');
        await open.default(authUrl);
      } catch {
        console.log(`Open this URL: ${authUrl}`);
      }

      const result = await callbackPromise;
      if (result.error || !result.code) {
        console.error(`✗ ${provider} authorization failed`);
        process.exit(1);
      }

      setProvider(provider, { token: result.code, method: 'oauth', connected_at: new Date().toISOString() });
      console.log(`✓ ${provider} connected (OAuth)`);
    } catch {
      // Fallback to manual token entry
      console.log(`OAuth not available. Enter token manually.`);
      const key = await promptForKey(provider);
      if (!key) { console.error('✗ No key provided'); process.exit(1); }
      setProvider(provider, { token: key, method: 'manual', connected_at: new Date().toISOString() });
      console.log(`✓ ${provider} connected`);
    }
  } else {
    // Manual key entry
    const key = await promptForKey(provider);
    if (!key) { console.error('✗ No key provided'); process.exit(1); }
    setProvider(provider, { key, method: 'manual', connected_at: new Date().toISOString() });
    console.log(`✓ ${provider} connected`);
  }

  console.log('✓ Saved to ~/.lucid/credentials.json');
}

export async function listProvidersCommand(): Promise<void> {
  const providers = getProviders();
  const names = Object.keys(providers);
  if (names.length === 0) {
    console.log('No providers connected. Run: lucid provider add <provider>');
    console.log('Available: railway, akash, phala, ionet, nosana');
    return;
  }
  console.log('Connected providers:');
  for (const [name, cred] of Object.entries(providers)) {
    const token = cred.token || cred.key || '';
    const masked = token.slice(0, 6) + '...' + token.slice(-4);
    console.log(`  ${name}: ${masked} (${cred.method}, ${cred.connected_at})`);
  }
}

export async function removeProviderCommand(provider: string): Promise<void> {
  if (removeProvider(provider)) {
    console.log(`✓ ${provider} removed`);
  } else {
    console.log(`${provider} was not connected`);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/providers.ts
git commit -m "feat(cli): lucid provider add/list/remove — OAuth + API key flows"
```

---

## Task 5: Launch Resolver

**Files:**
- Create: `offchain/src/cli/launch-resolver.ts`

- [ ] **Step 1: Create deterministic resolver**

```typescript
// src/cli/launch-resolver.ts
import { loadCredentials } from './credentials';
import type { ProviderCredential } from './credentials';

export interface ResolvedLaunch {
  path: 'layer' | 'cloud' | 'error';
  provider?: string;
  providerCredential?: ProviderCredential;
  cloudToken?: string;
  error?: string;
}

/**
 * 6-step deterministic resolution (from architect review):
 * 1. --mode layer → only local provider path
 * 2. --mode cloud → only Cloud path
 * 3. --target X + local credential → Layer
 * 4. --target X + no local credential → fail clearly (never redirect to Cloud)
 * 5. No --target + Cloud auth → Cloud
 * 6. No --target + no Cloud + one local provider → Layer with that provider
 * 7. Otherwise → error with instructions
 */
export function resolveLaunchPath(opts: {
  mode?: 'layer' | 'cloud';
  target?: string;
}): ResolvedLaunch {
  const creds = loadCredentials();

  // 1. Explicit --mode layer
  if (opts.mode === 'layer') {
    if (!opts.target) return { path: 'error', error: '--mode layer requires --target <provider>' };
    if (!creds.providers?.[opts.target]) {
      return { path: 'error', error: `${opts.target} not connected. Run: lucid provider add ${opts.target}` };
    }
    return { path: 'layer', provider: opts.target, providerCredential: creds.providers[opts.target] };
  }

  // 2. Explicit --mode cloud
  if (opts.mode === 'cloud') {
    if (!creds.lucid?.token) return { path: 'error', error: 'Not logged in. Run: lucid login' };
    return { path: 'cloud', cloudToken: creds.lucid.token };
  }

  // 3. Explicit --target with local credential → Layer
  if (opts.target && creds.providers?.[opts.target]) {
    return { path: 'layer', provider: opts.target, providerCredential: creds.providers[opts.target] };
  }

  // 4. Explicit --target without local credential → fail (never redirect)
  if (opts.target) {
    return {
      path: 'error',
      error: `${opts.target} not connected locally.\n  Run: lucid provider add ${opts.target}\n  Or omit --target to use Lucid Cloud.`,
    };
  }

  // 5. No --target, Cloud auth → Cloud
  if (creds.lucid?.token) {
    return { path: 'cloud', cloudToken: creds.lucid.token };
  }

  // 6. No --target, no Cloud, one local provider → Layer
  const localProviders = Object.keys(creds.providers || {});
  if (localProviders.length === 1) {
    return { path: 'layer', provider: localProviders[0], providerCredential: creds.providers![localProviders[0]] };
  }

  // 7. Nothing → guide user
  return {
    path: 'error',
    error: 'Not authenticated.\n  lucid login                    # Managed deployment (recommended)\n  lucid provider add railway     # Self-hosted with your own account',
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/launch-resolver.ts
git commit -m "feat(cli): 6-step deterministic launch resolver — Layer vs Cloud vs error"
```

---

## Task 6: Tests

**Files:**
- Create: `offchain/src/__tests__/cli-credentials.test.ts`

- [ ] **Step 1: Write tests for credentials + resolver**

Test cases:
1. `loadCredentials()` returns empty when no file
2. `saveCredentials()` creates dir + file with correct permissions
3. `setLucidAuth()` + `getLucidAuth()` roundtrip
4. `setProvider()` + `getProviders()` roundtrip
5. `removeProvider()` deletes and returns true
6. `removeProvider()` returns false for unknown provider
7. Resolver: `--mode layer --target railway` + credential → Layer
8. Resolver: `--mode layer` no target → error
9. Resolver: `--mode cloud` + auth → Cloud
10. Resolver: `--mode cloud` no auth → error
11. Resolver: `--target railway` + credential → Layer
12. Resolver: `--target railway` no credential → error (never redirect)
13. Resolver: no target + Cloud auth → Cloud
14. Resolver: no target + one local provider → Layer with that
15. Resolver: nothing → error with instructions

Use `os.tmpdir()` for test credential files to avoid touching real `~/.lucid/`.

- [ ] **Step 2: Run tests**

Run: `cd offchain && npx jest src/__tests__/cli-credentials.test.ts --no-coverage`
Expected: 15 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/cli-credentials.test.ts
git commit -m "test(cli): 15 tests — credentials store + launch resolver"
```

---

## Task 7: Wire into CLI

**Files:**
- Modify: `offchain/src/cli.ts`

- [ ] **Step 1: Add `login`, `whoami`, `provider` commands**

Add before `program.parse()`:

```typescript
// Authentication
program.command('login')
  .description('Authenticate with Lucid')
  .option('--token <token>', 'API token (for CI/headless)')
  .action(async (opts) => {
    const { loginCommand } = await import('./cli/auth');
    await loginCommand(opts);
  });

program.command('whoami')
  .description('Show current authentication status')
  .action(async () => {
    const { whoamiCommand } = await import('./cli/auth');
    await whoamiCommand();
  });

// Provider management
const providerCmd = program.command('provider').description('Manage deployment providers');

providerCmd.command('add <provider>')
  .description('Connect a deployment provider (railway, akash, phala, ionet, nosana)')
  .action(async (provider) => {
    const { addProviderCommand } = await import('./cli/providers');
    await addProviderCommand(provider);
  });

providerCmd.command('list')
  .description('List connected providers')
  .action(async () => {
    const { listProvidersCommand } = await import('./cli/providers');
    await listProvidersCommand();
  });

providerCmd.command('remove <provider>')
  .description('Remove a provider connection')
  .action(async (provider) => {
    const { removeProviderCommand } = await import('./cli/providers');
    await removeProviderCommand(provider);
  });
```

- [ ] **Step 2: Update `launch` command to use resolver**

Add `--mode` option. Before calling `launchImage()`, call `resolveLaunchPath()`. If path is `'cloud'`, call Lucid Cloud API instead. If `'layer'`, inject provider credential into the deployer. If `'error'`, print message and exit.

- [ ] **Step 3: Type-check and test**

Run: `npx tsc --noEmit 2>&1 | grep -v node_modules | grep "error TS" | head -10` → 0 errors
Run: `npx jest --no-coverage 2>&1 | tail -5` → all pass

- [ ] **Step 4: Manual test**

```bash
# Login with token
npx ts-node src/cli.ts login --token test_token_123
npx ts-node src/cli.ts whoami

# Provider management
npx ts-node src/cli.ts provider list
npx ts-node src/cli.ts provider add akash  # Will prompt for key

# Launch resolver (should show Lucid Cloud path since we have a token)
DEPLOYMENT_STORE=memory npx ts-node src/cli.ts launch --image nginx:latest
```

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): wire login, whoami, provider, launch resolver into CLI"
```

---

## Verification Checklist

- [ ] `lucid login --token lk_test` → saves to `~/.lucid/credentials.json`
- [ ] `lucid whoami` → shows token
- [ ] `lucid provider add akash` → prompts for key, saves
- [ ] `lucid provider list` → shows connected providers
- [ ] `lucid provider remove akash` → removes
- [ ] `lucid launch --image x` with no auth → clear error
- [ ] `lucid launch --image x` with Lucid token → Cloud path
- [ ] `lucid launch --target railway --image x` without Railway credential → clear error (not redirect)
- [ ] `lucid launch --mode layer --target docker --image x` → Layer path
- [ ] `lucid launch --mode cloud --image x` with token → Cloud path
- [ ] 15 unit tests pass
- [ ] Type-check: 0 errors
- [ ] Full test suite: all pass
