// offchain/packages/engine/src/deployment/lease-manager/service.ts
// LeaseManagerService — extend time-limited deployments, warn on expiry

import type { IDeploymentStore } from '../control-plane/store';
import type { Deployment } from '../control-plane/types';
import type { LeaseConfig } from './policies';
import { getProviderCapabilities } from '../reconciler/provider-sync';
import { getDeployer } from '../../deploy';

export class LeaseManagerService {
  constructor(
    private store: IDeploymentStore,
    private config: LeaseConfig,
  ) {}

  /**
   * Handle a deployment whose lease is expiring.
   * If the provider supports extension (io.net), extend.
   * Otherwise, append a warning event.
   */
  async handleExpiring(deployment: Deployment): Promise<void> {
    if (!deployment.lease_expires_at) return;

    const remaining = deployment.lease_expires_at - Date.now();
    if (remaining > this.config.warningThresholdMs) return;

    if (this.canExtend(deployment)) {
      try {
        await this.extend(deployment);
      } catch (err) {
        await this.store.appendEvent({
          deployment_id: deployment.deployment_id,
          event_type: 'lease_expiring',
          actor: 'lease_manager',
          metadata: {
            error: String(err instanceof Error ? err.message : err),
            remaining_ms: remaining,
          },
        });
      }
    } else {
      // Cannot extend -- warn
      await this.store.appendEvent({
        deployment_id: deployment.deployment_id,
        event_type: 'lease_expiring',
        actor: 'lease_manager',
        metadata: {
          remaining_ms: remaining,
          reason: 'extension_not_supported',
        },
      });
    }
  }

  /**
   * Check if a deployment's provider supports lease extension.
   * Phase 2: io.net only.
   */
  private canExtend(deployment: Deployment): boolean {
    const caps = getProviderCapabilities(deployment.provider);
    return caps.supportsExtend;
  }

  /**
   * Extend a deployment's lease via the provider.
   */
  private async extend(deployment: Deployment): Promise<void> {
    const deployer = getDeployer(deployment.provider);

    // Provider-specific extension (io.net: PATCH /deployment with new duration)
    if ('extend' in deployer && typeof (deployer as Record<string, unknown>).extend === 'function') {
      await (deployer as Record<string, unknown> & { extend: (id: string, hours: number) => Promise<void> })
        .extend(deployment.provider_deployment_id || '', this.config.extensionHours);
    }

    const newExpiry = Date.now() + this.config.extensionHours * 3600_000;
    await this.store.updateLease(deployment.deployment_id, newExpiry);
    await this.store.appendEvent({
      deployment_id: deployment.deployment_id,
      event_type: 'lease_extended',
      actor: 'lease_manager',
      metadata: {
        new_expires_at: newExpiry,
        extension_hours: this.config.extensionHours,
      },
    });
  }
}
