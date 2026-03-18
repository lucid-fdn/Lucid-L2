// offchain/packages/engine/src/deployment/rollout/index.ts
// Factory + barrel exports for the Rollout module

import { RolloutManager } from './service';
import { getDefaultRolloutConfig, RolloutConfig } from './policies';
import { IDeploymentStore } from '../control-plane/store';
import { ISecretsResolver } from '../secrets/interface';
import { getSecretsResolver } from '../secrets';
import { getDeploymentStore } from '../control-plane';

let manager: RolloutManager | null = null;

/**
 * Get the RolloutManager singleton.
 */
export function getRolloutManager(overrides?: {
  store?: IDeploymentStore;
  secretsResolver?: ISecretsResolver;
  config?: RolloutConfig;
}): RolloutManager {
  if (!manager) {
    const store = overrides?.store ?? getDeploymentStore();
    const secretsResolver = overrides?.secretsResolver ?? getSecretsResolver();
    const config = overrides?.config ?? getDefaultRolloutConfig();
    manager = new RolloutManager(store, secretsResolver, config);
  }
  return manager;
}

/**
 * Reset the singleton — for tests only.
 */
export function resetRolloutManager(): void {
  manager = null;
}

// Barrel exports
export { RolloutManager } from './service';
export { RolloutConfig, getDefaultRolloutConfig } from './policies';
