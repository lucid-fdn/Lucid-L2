// offchain/packages/engine/src/deployment/reconciler/provider-sync.ts
// Provider capability flags, canonical status mapping, and provider state sync

import type { Deployment, ActualState, HealthStatus } from '../control-plane/types';
import type { IDeploymentStore } from '../control-plane/store';
import { getDeployer } from '../../deploy';

/* ------------------------------------------------------------------ */
/*  Provider Capabilities                                              */
/* ------------------------------------------------------------------ */

export interface ProviderCapabilities {
  supportsStop: boolean;
  supportsResume: boolean;
  supportsExtend: boolean;
  supportsStatus: boolean;
  supportsScale: boolean;
  supportsLogs: boolean;
}

/**
 * Per-provider capability map.
 * The reconciler uses these to decide which operations are safe.
 */
export const PROVIDER_CAPABILITIES: Record<string, ProviderCapabilities> = {
  railway: {
    supportsStop: false,
    supportsResume: false,
    supportsExtend: false,
    supportsStatus: true,
    supportsScale: false,
    supportsLogs: true,
  },
  akash: {
    supportsStop: false,
    supportsResume: false,
    supportsExtend: false,
    supportsStatus: true,
    supportsScale: true,
    supportsLogs: true,
  },
  phala: {
    supportsStop: true,
    supportsResume: false,
    supportsExtend: false,
    supportsStatus: true,
    supportsScale: false,
    supportsLogs: true,
  },
  ionet: {
    supportsStop: false,
    supportsResume: false,
    supportsExtend: true,
    supportsStatus: true,
    supportsScale: true,
    supportsLogs: true,
  },
  nosana: {
    supportsStop: true,
    supportsResume: false,
    supportsExtend: false,
    supportsStatus: true,
    supportsScale: true,
    supportsLogs: true,
  },
  docker: {
    supportsStop: true,
    supportsResume: false,
    supportsExtend: false,
    supportsStatus: true,
    supportsScale: false,
    supportsLogs: true,
  },
};

/**
 * Get capabilities for a provider. Defaults to all-false for unknown providers.
 */
export function getProviderCapabilities(provider: string): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[provider] ?? {
    supportsStop: false,
    supportsResume: false,
    supportsExtend: false,
    supportsStatus: false,
    supportsScale: false,
    supportsLogs: false,
  };
}

/* ------------------------------------------------------------------ */
/*  Canonical Provider Status Mapping                                  */
/* ------------------------------------------------------------------ */

export interface MappedProviderStatus {
  actualState?: ActualState;
  health?: HealthStatus;
  isTerminal: boolean;
  isTransitional: boolean;
}

/**
 * Map provider-specific status strings to Lucid platform state.
 * ONE canonical function — all consumers use this. Never ad-hoc status parsing.
 */
export function mapProviderStatus(provider: string, rawStatus: string): MappedProviderStatus {
  const normalized = rawStatus.toUpperCase();

  // Universal terminal states
  if (['FAILED', 'CRASHED', 'ERROR', 'DEAD'].includes(normalized)) {
    return { actualState: 'failed', health: 'unhealthy', isTerminal: true, isTransitional: false };
  }
  if (['REMOVED', 'REMOVING', 'DELETED', 'ARCHIVED'].includes(normalized)) {
    return { actualState: 'terminated', health: 'unknown', isTerminal: true, isTransitional: false };
  }

  // Universal transitional states
  if (['BUILDING', 'DEPLOYING', 'INITIALIZING', 'PROVISIONING', 'COMMITTING', 'STARTING', 'WAITING', 'PENDING'].includes(normalized)) {
    return { actualState: 'deploying', health: 'unknown', isTerminal: false, isTransitional: true };
  }

  // Universal running states
  if (['RUNNING', 'ACTIVE', 'SUCCESS', 'READY'].includes(normalized)) {
    return { actualState: 'running', health: 'healthy', isTerminal: false, isTransitional: false };
  }

  // Universal stopped states
  if (['STOPPED', 'PAUSED', 'SLEEPING', 'STOPPING'].includes(normalized)) {
    return { actualState: 'stopped', health: 'unknown', isTerminal: false, isTransitional: false };
  }

  // Unknown -- don't change state
  return { health: 'unknown', isTerminal: false, isTransitional: false };
}

/* ------------------------------------------------------------------ */
/*  Provider State Sync                                                */
/* ------------------------------------------------------------------ */

/**
 * Sync actual provider state into the deployment store.
 * Calls deployer.status() and updates health + provider resources.
 */
export async function syncProviderState(
  deployment: Deployment,
  store: IDeploymentStore,
): Promise<void> {
  if (!deployment.provider_deployment_id) return;

  const caps = getProviderCapabilities(deployment.provider);
  if (!caps.supportsStatus) return;

  try {
    const deployer = getDeployer(deployment.provider);
    const status = await deployer.status(deployment.provider_deployment_id);

    await store.updateProviderResources(deployment.deployment_id, {
      provider_status: status.status,
      provider_status_detail: {
        health: status.health,
        uptime_ms: status.uptime_ms,
        url: status.url,
      },
      deployment_url: status.url || deployment.deployment_url || undefined,
    });

    const healthValue: HealthStatus = status.health === 'healthy'
      ? 'healthy'
      : status.health === 'degraded'
        ? 'degraded'
        : status.health === 'unhealthy'
          ? 'unhealthy'
          : 'unknown';

    await store.updateHealth(deployment.deployment_id, healthValue, Date.now());
  } catch (_err) {
    // Provider unreachable -- don't crash reconciler
    await store.updateHealth(deployment.deployment_id, 'unknown', Date.now());
  }
}
