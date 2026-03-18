// offchain/packages/engine/src/deployment/boot.ts
// Start / stop the Deployment Control Plane (Reconciler + LeaseManager)

import { getDeploymentStore } from './control-plane';
import { LeaseManagerService } from './lease-manager/service';
import { getDefaultLeaseConfig } from './lease-manager/policies';
import { ReconcilerService } from './reconciler/service';
import { getDefaultReconcilerConfig } from './reconciler/policies';

let reconciler: ReconcilerService | null = null;
let leaseManager: LeaseManagerService | null = null;

/**
 * Start the Deployment Control Plane.
 * Creates LeaseManager + ReconcilerService and starts the polling loop.
 */
export function startDeploymentControlPlane(): void {
  if (reconciler) return; // already running

  const store = getDeploymentStore();
  leaseManager = new LeaseManagerService(store, getDefaultLeaseConfig());
  reconciler = new ReconcilerService(store, leaseManager, getDefaultReconcilerConfig());
  reconciler.start();

  console.log('[deployment] Control plane started (reconciler polling)');
}

/**
 * Stop the Deployment Control Plane.
 * Stops the reconciler polling loop.
 */
export function stopDeploymentControlPlane(): void {
  if (reconciler) {
    reconciler.stop();
    reconciler = null;
  }
  leaseManager = null;
  console.log('[deployment] Control plane stopped');
}

/**
 * Check if the control plane is running.
 */
export function isDeploymentControlPlaneRunning(): boolean {
  return reconciler !== null && reconciler.isRunning();
}
