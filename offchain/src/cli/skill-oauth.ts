/**
 * OAuth integration for skill connections.
 * Generic framework — one implementation handles all OAuth providers.
 * Client IDs are public (embedded in CLI). Tokens stored locally.
 *
 * Flow: CLI opens browser → user authorizes → localhost callback → token saved
 */

import { waitForOAuthCallback } from './oauth-callback';

export interface OAuthProvider {
  name: string;
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  scopes: string;
  /** Some providers need the redirect_uri in the token exchange */
  needsRedirectUri?: boolean;
}

/**
 * OAuth providers for skills.
 * Client IDs are public — safe to embed in CLI.
 * To register new providers: create an OAuth app with the service,
 * set redirect URI to http://localhost:0/callback (any port).
 *
 * Set via env vars to override (e.g., LUCID_NOTION_CLIENT_ID).
 */
const PROVIDERS: Record<string, OAuthProvider> = {
  notion: {
    name: 'Notion',
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    clientId: process.env.LUCID_NOTION_CLIENT_ID || '',
    scopes: '',
    needsRedirectUri: true,
  },
  github: {
    name: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    clientId: process.env.LUCID_GITHUB_CLIENT_ID || '',
    scopes: 'repo,read:user',
  },
  slack: {
    name: 'Slack',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    clientId: process.env.LUCID_SLACK_CLIENT_ID || '',
    scopes: 'chat:write,channels:read,groups:read,im:read,mpim:read',
  },
  discord: {
    name: 'Discord',
    authUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    clientId: process.env.LUCID_DISCORD_CLIENT_ID || '',
    scopes: 'bot applications.commands',
  },
  spotify: {
    name: 'Spotify',
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    clientId: process.env.LUCID_SPOTIFY_CLIENT_ID || '',
    scopes: 'user-read-playback-state user-modify-playback-state',
  },
  trello: {
    name: 'Trello',
    authUrl: 'https://trello.com/1/authorize',
    tokenUrl: '', // Trello uses token directly from callback
    clientId: process.env.LUCID_TRELLO_CLIENT_ID || '',
    scopes: 'read,write',
  },
  google: {
    name: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: process.env.LUCID_GOOGLE_CLIENT_ID || '',
    scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar',
    needsRedirectUri: true,
  },
};

/**
 * Map skill env var names to OAuth providers.
 * If a skill's required env matches a key here, OAuth is available.
 */
const ENV_TO_PROVIDER: Record<string, string> = {
  NOTION_API_KEY: 'notion',
  GITHUB_TOKEN: 'github',
  GH_TOKEN: 'github',
  SLACK_BOT_TOKEN: 'slack',
  SLACK_APP_TOKEN: 'slack',
  DISCORD_BOT_TOKEN: 'discord',
  SPOTIFY_CLIENT_ID: 'spotify',
  TRELLO_API_KEY: 'trello',
  TRELLO_TOKEN: 'trello',
  GOOGLE_API_KEY: 'google',
};

/**
 * Check if an env var has an OAuth provider available.
 */
export function hasOAuthProvider(envVar: string): boolean {
  const providerName = ENV_TO_PROVIDER[envVar];
  if (!providerName) return false;
  const provider = PROVIDERS[providerName];
  return !!provider?.clientId; // Only available if client ID is configured
}

/**
 * Get the provider name for display.
 */
export function getOAuthProviderName(envVar: string): string | null {
  const providerName = ENV_TO_PROVIDER[envVar];
  return providerName ? PROVIDERS[providerName]?.name || null : null;
}

/**
 * Connect to a service via OAuth.
 * Opens browser, waits for callback, exchanges code for token.
 * Returns the access token.
 */
export async function oauthConnect(envVar: string): Promise<string | null> {
  const providerName = ENV_TO_PROVIDER[envVar];
  if (!providerName) return null;
  const provider = PROVIDERS[providerName];
  if (!provider?.clientId) return null;

  try {
    // Start localhost callback server
    const callbackPromise = waitForOAuthCallback(0);
    await new Promise(r => setTimeout(r, 500));

    // Build auth URL
    const callbackUrl = `http://localhost:${(callbackPromise as any)._port || 0}/callback`;
    const params = new URLSearchParams({
      client_id: provider.clientId,
      response_type: 'code',
      redirect_uri: callbackUrl,
      ...(provider.scopes ? { scope: provider.scopes } : {}),
    });
    const authUrl = `${provider.authUrl}?${params.toString()}`;

    // Open browser
    console.log(`  Opening browser for ${provider.name} authorization...`);
    try {
      // @ts-expect-error — open is optional, fallback prints URL
      const open = (await import('open')).default;
      await open(authUrl);
    } catch {
      console.log(`  Open this URL: ${authUrl}`);
    }

    console.log('  Waiting for authorization...');
    const result = await callbackPromise;

    if (result.error) {
      console.error(`  Authorization failed: ${result.error}`);
      return null;
    }

    const code = result.code || result.token;
    if (!code) {
      console.error('  No authorization code received');
      return null;
    }

    // If provider has a token URL, exchange code for token
    if (provider.tokenUrl) {
      const tokenRes = await fetch(provider.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: provider.clientId,
          ...(provider.needsRedirectUri ? { redirect_uri: callbackUrl } : {}),
        }).toString(),
      });

      if (!tokenRes.ok) {
        console.error(`  Token exchange failed: ${tokenRes.status}`);
        return null;
      }

      const tokenData = await tokenRes.json() as any;
      const token = tokenData.access_token || tokenData.token;
      if (token) {
        console.log(`  ✓ ${provider.name} connected`);
        return token;
      }
    }

    // Some providers (Trello) return token directly in callback
    console.log(`  ✓ ${provider.name} connected`);
    return code;
  } catch (err: any) {
    console.error(`  OAuth failed: ${err.message}`);
    return null;
  }
}

/**
 * Get list of all available OAuth providers (for display).
 */
export function listOAuthProviders(): Array<{ envVar: string; provider: string; configured: boolean }> {
  return Object.entries(ENV_TO_PROVIDER).map(([envVar, providerName]) => ({
    envVar,
    provider: PROVIDERS[providerName]?.name || providerName,
    configured: !!PROVIDERS[providerName]?.clientId,
  }));
}
