/**
 * Agent Health Monitor Job
 *
 * Periodically checks health of all running agent deployments.
 * Auto-extends time-limited deployments (io.net, Nosana) before expiry.
 * Updates deployment state and health status.
 */

import type { AgentDeployment, HealthStatus } from '../../agent/agentDescriptor';
import { logger } from '../lib/logger';

// Default check interval: 5 minutes
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

// Auto-extend when less than 2 hours remain
const EXTEND_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// Default extension duration: 24 hours
const DEFAULT_EXTEND_HOURS = 24;

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export interface HealthCheckResult {
  passportId: string;
  status: string;
  health: HealthStatus;
  extended?: boolean;
  error?: string;
}

/**
 * Start the health monitor loop.
 */
export function startAgentHealthMonitor(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (intervalHandle) {
    logger.info('[AgentHealthMonitor] Already running');
    return;
  }

  logger.info(`[AgentHealthMonitor] Starting (interval: ${intervalMs}ms)`);

  // Run immediately
  runHealthCheck().catch(err =>
    logger.error('[AgentHealthMonitor] Initial check error:', err)
  );

  intervalHandle = setInterval(() => {
    runHealthCheck().catch(err =>
      logger.error('[AgentHealthMonitor] Check error:', err)
    );
  }, intervalMs);
}

/**
 * Stop the health monitor loop.
 */
export function stopAgentHealthMonitor(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('[AgentHealthMonitor] Stopped');
  }
}

/**
 * Run a single health check cycle across all deployments.
 */
export async function runHealthCheck(): Promise<HealthCheckResult[]> {
  // Lazy import to avoid circular deps
  const { getAgentDeploymentService } = await import('../../agent/agentDeploymentService');
  const { getDeployer } = await import('../../deploy');

  const service = getAgentDeploymentService();
  const deployments = await service.listDeployments({ status: 'running' });
  const results: HealthCheckResult[] = [];

  for (const deployment of deployments) {
    const result = await checkDeployment(deployment, getDeployer);
    results.push(result);
  }

  if (results.length > 0) {
    const healthy = results.filter(r => r.health === 'healthy').length;
    const unhealthy = results.filter(r => r.health === 'unhealthy').length;
    const extended = results.filter(r => r.extended).length;
    logger.info(
      `[AgentHealthMonitor] Checked ${results.length} deployments: ${healthy} healthy, ${unhealthy} unhealthy, ${extended} extended`
    );
  }

  return results;
}

/**
 * Check a single deployment's health and auto-extend if needed.
 */
async function checkDeployment(
  deployment: AgentDeployment,
  getDeployerFn: (target: string) => any,
): Promise<HealthCheckResult> {
  const passportId = deployment.agent_passport_id;

  try {
    const deployer = getDeployerFn(deployment.deployment_target);

    if (!deployment.deployment_id) {
      return { passportId, status: deployment.status, health: 'unknown' };
    }

    // Get live status
    const status = await deployer.status(deployment.deployment_id);
    const health = (status.health || 'unknown') as HealthStatus;

    // Update deployment state
    deployment.health_status = health;
    deployment.last_health_check = Date.now();
    deployment.updated_at = Date.now();

    // Mark as failed if deployer reports failure
    if (status.status === 'failed' || status.status === 'terminated') {
      deployment.status = status.status as any;
    }

    // Auto-extend for time-limited providers (io.net, Nosana)
    let extended = false;
    if (
      (deployment.deployment_target === 'ionet' || deployment.deployment_target === 'nosana') &&
      status.status === 'running'
    ) {
      extended = await tryAutoExtend(deployment, deployer);
    }

    // Log unhealthy deployments
    if (health === 'unhealthy') {
      logger.warn(
        `[AgentHealthMonitor] Unhealthy deployment: ${passportId} (${deployment.deployment_target})`
      );
    }

    return { passportId, status: status.status, health, extended };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    logger.error(`[AgentHealthMonitor] Error checking ${passportId}: ${msg}`);
    return { passportId, status: deployment.status, health: 'unknown', error: msg };
  }
}

/**
 * Try to auto-extend a time-limited deployment.
 */
async function tryAutoExtend(
  deployment: AgentDeployment,
  deployer: any,
): Promise<boolean> {
  try {
    // Check if deployer supports extension
    if (typeof deployer.extend !== 'function') return false;

    // Calculate remaining time (approximate — based on creation time + assumed 24h)
    const elapsedMs = Date.now() - deployment.created_at;
    const assumedDurationMs = 24 * 60 * 60 * 1000;
    const remainingMs = assumedDurationMs - elapsedMs;

    if (remainingMs < EXTEND_THRESHOLD_MS) {
      logger.info(
        `[AgentHealthMonitor] Auto-extending ${deployment.agent_passport_id} (${deployment.deployment_target}, ~${Math.round(remainingMs / 60000)}min remaining)`
      );
      await deployer.extend(deployment.deployment_id, DEFAULT_EXTEND_HOURS);
      deployment.updated_at = Date.now();
      return true;
    }
  } catch (error) {
    logger.warn(
      `[AgentHealthMonitor] Extension failed for ${deployment.agent_passport_id}: ${error instanceof Error ? error.message : error}`
    );
  }
  return false;
}

/** Check if monitor is running */
export function isHealthMonitorRunning(): boolean {
  return intervalHandle !== null;
}
