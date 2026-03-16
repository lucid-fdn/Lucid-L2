// offchain/packages/engine/src/deployment/secrets/env-resolver.ts
// Reads secrets from process.env — default implementation

import { ISecretsResolver } from './interface';

/**
 * EnvSecretsResolver — resolves secret refs by reading process.env.
 * Strips the `secret:` prefix and looks up the key in the environment.
 * Missing keys are silently omitted from the result.
 */
export class EnvSecretsResolver implements ISecretsResolver {
  readonly provider = 'env';

  async resolve(refs: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const ref of refs) {
      const key = ref.replace(/^secret:/, '');
      const value = process.env[key];
      if (value) result[key] = value;
    }
    return result;
  }
}
