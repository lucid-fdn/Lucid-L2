// offchain/packages/engine/src/deployment/secrets/index.ts
// Factory + barrel exports for secrets resolution

import { ISecretsResolver } from './interface';
import { EnvSecretsResolver } from './env-resolver';
import { MockSecretsResolver } from './mock-resolver';

/**
 * Factory — reads SECRETS_PROVIDER env (default 'env').
 */
export function getSecretsResolver(): ISecretsResolver {
  const provider = process.env.SECRETS_PROVIDER || 'env';
  switch (provider) {
    case 'env': return new EnvSecretsResolver();
    case 'mock': return new MockSecretsResolver();
    default: throw new Error(`Unknown SECRETS_PROVIDER: ${provider}`);
  }
}

// Barrel exports
export { ISecretsResolver } from './interface';
export { EnvSecretsResolver } from './env-resolver';
export { MockSecretsResolver } from './mock-resolver';
