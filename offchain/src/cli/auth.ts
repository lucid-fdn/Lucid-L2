// src/cli/auth.ts
import { setLucidAuth, getLucidAuth, loadCredentials, saveCredentials } from './credentials';

const LUCID_AUTH_URL = process.env.LUCID_AUTH_URL || 'https://lucid.foundation/auth/cli';

/**
 * lucid login — authenticate with Lucid account
 *
 * Browser OAuth (default): opens browser -> OAuth flow -> token returned via localhost callback
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
      // @ts-expect-error — 'open' is an optional dependency, fallback below handles missing case
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

export async function logoutCommand(opts?: { provider?: string }): Promise<void> {
  if (opts?.provider) {
    const { removeProvider } = await import('./credentials');
    if (removeProvider(opts.provider)) {
      console.log(`✓ ${opts.provider} disconnected`);
    } else {
      console.log(`${opts.provider} was not connected`);
    }
    return;
  }
  // Remove Lucid auth
  const creds = loadCredentials();
  delete creds.lucid;
  saveCredentials(creds);
  console.log('✓ Logged out');
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
