// offchain/packages/engine/src/compute/control-plane/store/index.ts
// Factory singletons + barrel exports for the Deployment Control Plane

import type { IDeploymentStore } from './store';
import { InMemoryDeploymentStore } from './in-memory-store';
import { PostgresDeploymentStore } from './postgres-store';

/* ------------------------------------------------------------------ */
/*  Factory Singleton                                                 */
/* ------------------------------------------------------------------ */

let store: IDeploymentStore | null = null;

/**
 * Get the deployment store singleton.
 * Reads `DEPLOYMENT_STORE` env: 'postgres' (default) | 'memory'.
 */
export function getDeploymentStore(): IDeploymentStore {
  if (!store) {
    const backend = process.env.DEPLOYMENT_STORE ?? 'postgres';
    store = backend === 'memory'
      ? new InMemoryDeploymentStore()
      : new PostgresDeploymentStore();
  }
  return store;
}

/**
 * Reset the singleton — for tests only.
 */
export function resetDeploymentStore(): void {
  store = null;
}

/* ------------------------------------------------------------------ */
/*  Re-exports                                                        */
/* ------------------------------------------------------------------ */

// Types
export type {
  Deployment,
  DeploymentEvent,
  CreateDeploymentInput,
  CreateDeploymentEvent,
  DeploymentFilters,
  DesiredState,
  ActualState,
  HealthStatus,
  DeploymentEventType,
} from './types';

export {
  DESIRED_STATES,
  ACTUAL_STATES,
  HEALTH_STATES,
  DEPLOYMENT_EVENT_TYPES,
  StaleVersionError,
  InvalidTransitionError,
} from './types';

// State machine
export {
  canTransition,
  assertValidTransition,
  LIFECYCLE_EVENTS,
  HEALTH_EVENTS,
  LEASE_EVENTS,
  CONFIG_EVENTS,
  ROLLOUT_EVENTS,
  VALID_TRANSITIONS,
} from './state-machine';

// Store interface
export type { IDeploymentStore } from './store';

// Store implementations
export { InMemoryDeploymentStore } from './in-memory-store';
export { PostgresDeploymentStore } from './postgres-store';
