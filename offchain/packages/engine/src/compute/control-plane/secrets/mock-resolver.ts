// offchain/packages/engine/src/deployment/secrets/mock-resolver.ts
// Mock implementation for tests — returns preconfigured secrets

import { ISecretsResolver } from './interface';

/**
 * MockSecretsResolver — for tests. Preloaded with a fixed secrets map.
 */
export class MockSecretsResolver implements ISecretsResolver {
  readonly provider = 'mock';
  private secrets: Record<string, string>;

  constructor(secrets: Record<string, string> = {}) {
    this.secrets = secrets;
  }

  async resolve(refs: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const ref of refs) {
      const key = ref.replace(/^secret:/, '');
      if (this.secrets[key]) result[key] = this.secrets[key];
    }
    return result;
  }
}
