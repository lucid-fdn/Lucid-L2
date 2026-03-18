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

export async function addProviderCommand(provider: string, opts?: { key?: string; token?: string }): Promise<void> {
  const validProviders = [...Object.keys(OAUTH_PROVIDERS), ...KEY_PROVIDERS];
  if (!validProviders.includes(provider)) {
    console.error(`Unknown provider: ${provider}`);
    console.error(`Available: ${validProviders.join(', ')}`);
    process.exit(1);
  }

  // Non-interactive mode (CI/scripts): --key or --token flag
  if (opts?.key || opts?.token) {
    const value = opts.key || opts.token || '';
    setProvider(provider, { key: value, token: value, method: 'manual', connected_at: new Date().toISOString() });
    console.log(`✓ ${provider} connected`);
    console.log('✓ Saved to ~/.lucid/credentials.json');
    return;
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
        // @ts-expect-error — 'open' is an optional dependency, fallback below handles missing case
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
