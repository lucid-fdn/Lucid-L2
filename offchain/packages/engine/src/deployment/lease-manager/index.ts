// offchain/packages/engine/src/deployment/lease-manager/index.ts
// Barrel exports + factory for LeaseManagerService

import { LeaseManagerService } from './service';
import { getDefaultLeaseConfig } from './policies';
import type { IDeploymentStore } from '../control-plane/store';

/* ------------------------------------------------------------------ */
/*  Factory Singleton                                                  */
/* ------------------------------------------------------------------ */

let leaseManager: LeaseManagerService | null = null;

/**
 * Get or create the LeaseManagerService singleton.
 */
export function getLeaseManager(store: IDeploymentStore): LeaseManagerService {
  if (!leaseManager) {
    leaseManager = new LeaseManagerService(store, getDefaultLeaseConfig());
  }
  return leaseManager;
}

/**
 * Reset the singleton -- for tests only.
 */
export function resetLeaseManager(): void {
  leaseManager = null;
}

/* ------------------------------------------------------------------ */
/*  Re-exports                                                         */
/* ------------------------------------------------------------------ */

export { LeaseManagerService } from './service';
export { LeaseConfig, getDefaultLeaseConfig } from './policies';
