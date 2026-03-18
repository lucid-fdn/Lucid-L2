// offchain/packages/engine/src/deployment/reconciler/index.ts
// Barrel exports + factory for ReconcilerService

import { ReconcilerService } from './service';
import { getDefaultReconcilerConfig } from './policies';
import type { IDeploymentStore } from '../store/store';
import type { LeaseManagerService } from '../lease-manager/service';

/* ------------------------------------------------------------------ */
/*  Factory Singleton                                                  */
/* ------------------------------------------------------------------ */

let reconciler: ReconcilerService | null = null;

/**
 * Get or create the ReconcilerService singleton.
 */
export function getReconciler(
  store: IDeploymentStore,
  leaseManager: LeaseManagerService,
): ReconcilerService {
  if (!reconciler) {
    reconciler = new ReconcilerService(store, leaseManager, getDefaultReconcilerConfig());
  }
  return reconciler;
}

/**
 * Reset the singleton -- for tests only.
 */
export function resetReconciler(): void {
  if (reconciler) {
    reconciler.stop();
  }
  reconciler = null;
}

/* ------------------------------------------------------------------ */
/*  Re-exports                                                         */
/* ------------------------------------------------------------------ */

export { ReconcilerService } from './service';
export {
  ReconcilerConfig,
  SweepResult,
  getDefaultReconcilerConfig,
} from './policies';
export {
  ProviderCapabilities,
  MappedProviderStatus,
  PROVIDER_CAPABILITIES,
  getProviderCapabilities,
  mapProviderStatus,
  syncProviderState,
} from './provider-sync';
