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
 * 1. --mode layer → only local provider path (requires --target)
 * 2. --mode cloud → only Cloud path (requires Lucid auth)
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
