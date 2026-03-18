// offchain/packages/engine/src/compute/control-plane/store/index.ts
// Factory singletons + barrel exports for the Deployment Control Plane

import type { IDeploymentStore } from './store';
import { InMemoryDeploymentStore } from './in-memory-store';
import { PostgresDeploymentStore } from './postgres-store';
import { logger } from '../../../shared/lib/logger';

/* ------------------------------------------------------------------ */
/*  Factory Singleton                                                 */
/* ------------------------------------------------------------------ */

let store: IDeploymentStore | null = null;

/**
 * Get the deployment store singleton.
 * Reads `DEPLOYMENT_STORE` env: 'postgres' (default) | 'memory'.
 * Falls back to in-memory store if Postgres is unavailable (e.g., CLI without DB).
 */
export function getDeploymentStore(): IDeploymentStore {
  if (!store) {
    const backend = process.env.DEPLOYMENT_STORE ?? 'postgres';
    if (backend === 'memory') {
      store = new InMemoryDeploymentStore();
    } else {
      // Check if Postgres credentials are configured before attempting connection.
      // Without a password, the pool will fail on first query — fall back early.
      const hasPostgres = !!(
        process.env.POSTGRES_PASSWORD ||
        process.env.SUPABASE_DB_PASSWORD ||
        process.env.DATABASE_URL
      );
      if (!hasPostgres) {
        logger.warn(
          '[DeploymentStore] No Postgres credentials found (POSTGRES_PASSWORD / SUPABASE_DB_PASSWORD / DATABASE_URL). ' +
          'Falling back to in-memory store.',
        );
        store = new InMemoryDeploymentStore();
      } else {
        try {
          store = new PostgresDeploymentStore();
        } catch (err) {
          logger.warn(
            `[DeploymentStore] Postgres unavailable, falling back to in-memory store: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          store = new InMemoryDeploymentStore();
        }
      }
    }
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
