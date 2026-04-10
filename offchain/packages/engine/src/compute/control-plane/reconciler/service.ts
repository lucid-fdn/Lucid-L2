// offchain/packages/engine/src/deployment/reconciler/service.ts
// ReconcilerService — polling sweep + single-deployment reconcile

import type { IDeploymentStore } from '../store/store';
import type { Deployment, ActualState } from '../store/types';
import { canTransition } from '../store/state-machine';
import { syncProviderState, mapProviderStatus, getProviderCapabilities } from './provider-sync';
import type { ReconcilerConfig, SweepResult } from './policies';
import type { LeaseManagerService } from '../lease-manager/service';
import { getDeployer } from '../../providers';

export class ReconcilerService {
  private interval: NodeJS.Timeout | null = null;
  private pollIntervalMs: number;
  /** Per-deployment retry counters (deployment_id -> count) */
  private retryCounts = new Map<string, number>();

  constructor(
    private store: IDeploymentStore,
    private leaseManager: LeaseManagerService,
    private config: ReconcilerConfig,
  ) {
    this.pollIntervalMs = config.pollIntervalMs || 60_000;
  }

  /* ---------------------------------------------------------------- */
  /*  Immediate reconciliation (single deployment)                     */
  /* ---------------------------------------------------------------- */

  async reconcileDeployment(deploymentId: string): Promise<void> {
    const deployment = await this.store.getById(deploymentId);
    if (!deployment) return;
    if (deployment.actual_state === 'terminated') return;

    // Cooldown: don't hammer broken deployments
    this.markReconcileAttempt(deploymentId);

    // 1. Sync with provider if stale
    if (this.isProviderStale(deployment)) {
      await syncProviderState(deployment, this.store);
      // Re-read after sync to pick up any state updates
      const refreshed = await this.store.getById(deploymentId);
      if (!refreshed || refreshed.actual_state === 'terminated') return;
    }

    // 2. Check drift: desired != actual
    const current = await this.store.getById(deploymentId);
    if (!current) return;

    if (this.isDrifted(current)) {
      await this.repairDrift(current);
    }

    // 3. Check stuck transitions
    const afterDrift = await this.store.getById(deploymentId);
    if (!afterDrift) return;

    if (this.isStuck(afterDrift)) {
      await this.repairStuck(afterDrift);
    }

    // 4. Check lease
    const afterStuck = await this.store.getById(deploymentId);
    if (!afterStuck) return;

    if (this.isLeaseExpiring(afterStuck)) {
      await this.leaseManager.handleExpiring(afterStuck);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Safety sweep (polling, targeted subsets)                         */
  /* ---------------------------------------------------------------- */

  async sweep(): Promise<SweepResult> {
    const result: SweepResult = { drifted: 0, stuck: 0, leases: 0, health: 0 };

    // Drifted: desired != actual
    const drifted = await this.store.listDrifted();
    for (const d of drifted) {
      try {
        await this.reconcileDeployment(d.deployment_id);
        result.drifted++;
      } catch (_err) {
        // Don't let one deployment failure stop the sweep
      }
    }

    // Stuck in deploying > timeout
    const deploying = await this.store.listByState('deploying');
    for (const d of deploying) {
      if (this.isStuck(d)) {
        try {
          await this.reconcileDeployment(d.deployment_id);
          result.stuck++;
        } catch (_err) {
          // Best effort
        }
      }
    }

    // Stale running — running deployments with stale health (provider may have died silently)
    const running = await this.store.listByState('running');
    for (const d of running) {
      if (this.isProviderStale(d) && !this.isOnCooldown(d.deployment_id)) {
        try {
          await this.reconcileDeployment(d.deployment_id);
          result.health++;
        } catch (_err) {
          // Best effort
        }
      }
    }

    // Expiring leases
    const expiring = await this.store.listExpiringLeases(this.config.leaseWarningMs);
    for (const d of expiring) {
      try {
        await this.leaseManager.handleExpiring(d);
        result.leases++;
      } catch (_err) {
        // Best effort
      }
    }

    return result;
  }

  /** Cooldown: prevent hammering broken deployments */
  private lastReconcileAttempt = new Map<string, number>();

  private isOnCooldown(deploymentId: string): boolean {
    const last = this.lastReconcileAttempt.get(deploymentId);
    if (!last) return false;
    const cooldownMs = Math.min(this.pollIntervalMs * 5, 300_000); // 5x poll interval or 5min max
    return Date.now() - last < cooldownMs;
  }

  private markReconcileAttempt(deploymentId: string): void {
    this.lastReconcileAttempt.set(deploymentId, Date.now());
  }

  /* ---------------------------------------------------------------- */
  /*  Lifecycle                                                        */
  /* ---------------------------------------------------------------- */

  start(): void {
    if (this.interval) return;
    // NOTE: Reconciler is triggered by polling only in Phase 2.
    // Webhook handler enqueues reconcile requests via deployment_events table.
    // The sweep() picks up reconcile_requested events.

    // Add startup jitter (0-10s) to prevent synchronized sweeps across multiple instances
    const jitterMs = Math.floor(Math.random() * 10_000);
    setTimeout(() => {
      // Per-cycle jitter: ±10% of pollIntervalMs
      const scheduleNext = () => {
        const jitter = this.pollIntervalMs * 0.1 * (Math.random() * 2 - 1);
        this.interval = setTimeout(() => {
          this.sweep().catch(() => {});
          scheduleNext();
        }, this.pollIntervalMs + jitter);
      };
      this.sweep().catch(() => {});
      scheduleNext();
    }, jitterMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.retryCounts.clear();
  }

  isRunning(): boolean {
    return this.interval !== null;
  }

  /* ---------------------------------------------------------------- */
  /*  State checks                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Drift: desired_state != actual_state (excluding terminated).
   * Special case: pending is always drifted from running (that's expected).
   */
  isDrifted(d: Deployment): boolean {
    if (d.actual_state === 'terminated') return false;
    // Pending is a special initial state — not drift
    if (d.actual_state === 'pending') return false;
    return d.desired_state !== d.actual_state;
  }

  /**
   * Stuck: actual_state == 'deploying' for longer than stuckTimeoutMs.
   */
  isStuck(d: Deployment): boolean {
    if (d.actual_state !== 'deploying') return false;
    if (!d.last_transition_at) return false;
    return (Date.now() - d.last_transition_at) > this.config.stuckTimeoutMs;
  }

  /**
   * Provider stale: last_health_at too old or never checked.
   */
  isProviderStale(d: Deployment): boolean {
    if (!d.provider_deployment_id) return false;
    if (!d.last_health_at) return true;
    return (Date.now() - d.last_health_at) > this.config.providerStalenessMs;
  }

  /**
   * Lease expiring: lease_expires_at within leaseWarningMs.
   */
  isLeaseExpiring(d: Deployment): boolean {
    if (!d.lease_expires_at) return false;
    const remaining = d.lease_expires_at - Date.now();
    return remaining < this.config.leaseWarningMs;
  }

  /* ---------------------------------------------------------------- */
  /*  Drift repair                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Repair drift per rules table:
   * | Desired     | Actual    | Action                                   |
   * |-------------|-----------|------------------------------------------|
   * | running     | stopped   | Redeploy (transition to deploying)       |
   * | running     | failed    | Retry if < maxRetries, else leave failed |
   * | stopped     | running   | Terminate or stop                        |
   * | terminated  | running   | Terminate                                |
   * | terminated  | stopped   | Transition to terminated                 |
   * | terminated  | deploying | Terminate if possible                    |
   * | terminated  | failed    | Transition to terminated                 |
   */
  async repairDrift(d: Deployment): Promise<void> {
    const { desired_state, actual_state, deployment_id, version, provider } = d;
    const caps = getProviderCapabilities(provider);

    if (desired_state === 'running' && actual_state === 'stopped') {
      // Redeploy: transition stopped -> deploying
      if (canTransition(actual_state, 'deploying')) {
        await this.store.transition(deployment_id, 'deploying', version, {
          actor: 'reconciler',
          metadata: { reason: 'drift_repair', from: actual_state },
        });
        await this.store.appendEvent({
          deployment_id,
          event_type: 'restarted',
          actor: 'reconciler',
          previous_state: actual_state,
          new_state: 'deploying',
          metadata: { reason: 'drift_repair_redeploy' },
        });
      }
      return;
    }

    if (desired_state === 'running' && actual_state === 'failed') {
      const retries = this.retryCounts.get(deployment_id) || 0;
      if (retries < this.config.maxRetries) {
        this.retryCounts.set(deployment_id, retries + 1);
        if (canTransition(actual_state, 'deploying')) {
          await this.store.transition(deployment_id, 'deploying', version, {
            actor: 'reconciler',
            metadata: { reason: 'drift_repair_retry', attempt: retries + 1 },
          });
          await this.store.appendEvent({
            deployment_id,
            event_type: 'restarted',
            actor: 'reconciler',
            previous_state: actual_state,
            new_state: 'deploying',
            metadata: { reason: 'drift_repair_retry', attempt: retries + 1 },
          });
        }
      }
      // else: leave failed, maxRetries exceeded
      return;
    }

    if (desired_state === 'stopped' && actual_state === 'running') {
      // Try to stop or terminate
      if (caps.lifecycle.stop) {
        try {
          const deployer = getDeployer(provider);
          await deployer.terminate(d.provider_deployment_id || '');
        } catch (_err) { /* best effort */ }
      }
      if (canTransition(actual_state, 'stopped')) {
        await this.store.transition(deployment_id, 'stopped', version, {
          actor: 'reconciler',
          metadata: { reason: 'drift_repair_stop' },
        });
      }
      return;
    }

    if (desired_state === 'terminated') {
      // Terminate regardless of actual state
      if (actual_state === 'running' || actual_state === 'deploying') {
        if (caps.observability.status && d.provider_deployment_id) {
          try {
            const deployer = getDeployer(provider);
            await deployer.terminate(d.provider_deployment_id);
          } catch (_err) { /* best effort */ }
        }
      }
      if (canTransition(actual_state, 'terminated')) {
        await this.store.transition(deployment_id, 'terminated', version, {
          actor: 'reconciler',
          terminatedReason: 'drift_repair',
          metadata: { reason: 'drift_repair_terminate', from: actual_state },
        });
      }
      return;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Stuck repair                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Repair stuck deployments:
   * 1. Check provider status
   * 2. If running -> transition to running
   * 3. If failed -> transition to failed
   * 4. If unreachable -> increment retry, leave deploying
   * 5. If retries > max -> transition to failed
   */
  async repairStuck(d: Deployment): Promise<void> {
    const { deployment_id, version, provider, provider_deployment_id } = d;
    const caps = getProviderCapabilities(provider);

    if (!caps.observability.status || !provider_deployment_id) {
      // Can't check provider -- increment retry
      const retries = this.retryCounts.get(deployment_id) || 0;
      if (retries >= this.config.maxRetries) {
        if (canTransition('deploying', 'failed')) {
          await this.store.transition(deployment_id, 'failed', version, {
            actor: 'reconciler',
            error: 'stuck_max_retries_exceeded',
            metadata: { reason: 'stuck_no_status', retries },
          });
        }
      } else {
        this.retryCounts.set(deployment_id, retries + 1);
      }
      return;
    }

    try {
      const deployer = getDeployer(provider);
      const status = await deployer.status(provider_deployment_id);
      const mapped = mapProviderStatus(provider, status.status);

      if (mapped.actualState === 'running') {
        if (canTransition('deploying', 'running')) {
          await this.store.transition(deployment_id, 'running', version, {
            actor: 'reconciler',
            providerStatus: status.status,
            metadata: { reason: 'stuck_repair_provider_running' },
          });
          this.retryCounts.delete(deployment_id);
        }
      } else if (mapped.actualState === 'failed') {
        if (canTransition('deploying', 'failed')) {
          await this.store.transition(deployment_id, 'failed', version, {
            actor: 'reconciler',
            error: `provider_status: ${status.status}`,
            providerStatus: status.status,
            metadata: { reason: 'stuck_repair_provider_failed' },
          });
        }
      } else {
        // Still deploying or unknown -- increment retry
        const retries = this.retryCounts.get(deployment_id) || 0;
        if (retries >= this.config.maxRetries) {
          if (canTransition('deploying', 'failed')) {
            await this.store.transition(deployment_id, 'failed', version, {
              actor: 'reconciler',
              error: 'stuck_max_retries_exceeded',
              metadata: { reason: 'stuck_retries_exhausted', retries },
            });
          }
        } else {
          this.retryCounts.set(deployment_id, retries + 1);
        }
      }
    } catch (_err) {
      // Provider unreachable
      await this.store.updateHealth(deployment_id, 'unknown', Date.now());
      const retries = this.retryCounts.get(deployment_id) || 0;
      if (retries >= this.config.maxRetries) {
        if (canTransition('deploying', 'failed')) {
          await this.store.transition(deployment_id, 'failed', version, {
            actor: 'reconciler',
            error: 'stuck_provider_unreachable',
            metadata: { reason: 'stuck_provider_unreachable', retries },
          });
        }
      } else {
        this.retryCounts.set(deployment_id, retries + 1);
      }
    }
  }
}
