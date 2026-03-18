// offchain/packages/engine/src/deploy/IoNetDeployer.ts
// io.net deployer (GPU DePIN) — deploys agents to io.net CaaS (Container as a Service).
// Uses real CaaS API at api.io.solutions with hardware discovery and container deployment.
// Requires IONET_API_KEY environment variable.

import { IDeployer, RuntimeArtifact, DeploymentConfig, DeploymentResult, DeploymentStatus, LogOptions } from './IDeployer';
import { isImageDeploy } from './types';
import type { ImageDeployInput } from './types';
import { resilientFetch } from './resilientFetch';
import { logger } from '../../shared/lib/logger';

const IONET_API_URL = 'https://api.io.solutions/enterprise/v1/io-cloud/caas';

/** Poll interval when waiting for public URL */
const POLL_INTERVAL_MS = 10_000;
/** Maximum time to wait for container to start */
const STARTUP_TIMEOUT_MS = 5 * 60 * 1000;

/** Known hardware IDs for common GPU types */
const HARDWARE_MAP: Record<string, number> = {
  'a100':     203,
  'a100-80gb': 203,
  'h100':     204,
  'rtx-4090': 205,
  'rtx-3090': 206,
  'l40s':     207,
};

export class IoNetDeployer implements IDeployer {
  readonly target = 'ionet';
  readonly description = 'io.net decentralized GPU deployment';

  // Read token at deploy time, not construction — allows CLI to inject credential after factory init
  private get apiKey(): string {
    return process.env.IONET_API_KEY || '';
  }

  async deploy(input: RuntimeArtifact | ImageDeployInput, config: DeploymentConfig, passportId: string): Promise<DeploymentResult> {
    if (!this.apiKey) {
      return {
        success: false,
        deployment_id: '',
        target: this.target,
        error: 'IONET_API_KEY not set. Get your API key from https://ai.io.net/ai/api-keys',
      };
    }

    try {
      // Resolve Docker image
      const imageUrl = isImageDeploy(input)
        ? input.image
        : ((config.target as any).image_ref
          || input.env_vars.AGENT_IMAGE_REF
          || `ghcr.io/raijinlabs/lucid-agents/${passportId}:latest`);

      // Merge environment variables
      const envVars: Record<string, string> = {
        ...input.env_vars,
        ...config.env_vars,
        PORT: '3100',
        NODE_ENV: 'production',
        AGENT_PASSPORT_ID: passportId,
      };
      delete envVars.AGENT_IMAGE_REF;

      // Separate secret env vars (keys matching common secret patterns)
      const SECRET_PATTERNS = /^(.*KEY|.*SECRET|.*TOKEN|.*PASSWORD|.*CREDENTIAL)/i;
      const publicEnv: Record<string, string> = {};
      const secretEnv: Record<string, string> = {};
      for (const [k, v] of Object.entries(envVars)) {
        if (v === undefined || v === '') continue;
        if (SECRET_PATTERNS.test(k)) {
          secretEnv[k] = v;
        } else {
          publicEnv[k] = v;
        }
      }

      // Resolve hardware ID
      const gpuRequested = (config.target as any).gpu || (config.target as any).gpu_type || 'a100';
      let hardwareId = HARDWARE_MAP[gpuRequested.toLowerCase()];

      // If not in static map, try to discover from API
      if (!hardwareId) {
        hardwareId = await this.discoverHardware(gpuRequested);
      }
      if (!hardwareId) {
        hardwareId = HARDWARE_MAP['a100']; // fallback to A100
      }

      // Check availability
      let locationIds: number[] = [];
      try {
        const availRes = await this.request('GET', `/available-replicas?hardware_id=${hardwareId}&hardware_qty=1`);
        if (availRes.ok) {
          const availData = await availRes.json() as any;
          const locations = availData.data || availData;
          if (Array.isArray(locations) && locations.length > 0) {
            locationIds = [locations[0].id || locations[0]];
          }
        }
      } catch {
        // Availability check failed — deploy anyway, let io.net handle placement
      }

      // Duration from config or default 24h
      const durationHours = (config.target as any).duration_hours || 24;

      // Deploy
      const deployRes = await this.request('POST', '/deploy', {
        resource_private_name: `lucid-agent-${passportId.substring(0, 16)}`,
        duration_hours: durationHours,
        gpus_per_container: (config.target as any).gpu_count || 1,
        hardware_id: hardwareId,
        ...(locationIds.length > 0 ? { location_ids: locationIds } : {}),
        container_config: {
          replica_count: config.replicas || 1,
          traffic_port: 3100,
          entrypoint: isImageDeploy(input)
            ? (input.entrypoint || undefined)
            : (input.entrypoint ? ['node', input.entrypoint] : ['node', 'index.js']),
          env_variables: publicEnv,
          secret_env_variables: secretEnv,
        },
        registry_config: {
          image_url: imageUrl,
          registry_username: process.env.GHCR_USERNAME || '',
          registry_secret: process.env.GHCR_TOKEN || '',
        },
      });

      if (!deployRes.ok) {
        const error = await deployRes.text();
        return { success: false, deployment_id: '', target: this.target, error: `io.net deploy failed (${deployRes.status}): ${error}` };
      }

      const deployData = await deployRes.json() as any;
      const deploymentId = deployData.deployment_id || deployData.id;

      if (!deploymentId) {
        return { success: false, deployment_id: '', target: this.target, error: 'io.net returned no deployment_id' };
      }

      // Poll for public URL
      const publicUrl = await this.pollForUrl(deploymentId, STARTUP_TIMEOUT_MS);

      logger.info(`[Deploy] io.net GPU deployment created: ${deploymentId}`);
      logger.info(`[Deploy]   GPU: ${gpuRequested} (hardware_id: ${hardwareId})`);
      if (publicUrl) logger.info(`[Deploy]   URL: ${publicUrl}`);

      return {
        success: true,
        deployment_id: deploymentId,
        target: this.target,
        url: publicUrl || undefined,
        metadata: {
          hardware_id: hardwareId,
          gpu: gpuRequested,
          duration_hours: durationHours,
          image: imageUrl,
        },
      };
    } catch (error) {
      return {
        success: false,
        deployment_id: '',
        target: this.target,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async status(deploymentId: string): Promise<DeploymentStatus> {
    if (!this.apiKey) return { deployment_id: deploymentId, status: 'failed', error: 'IONET_API_KEY not set' };

    try {
      const res = await this.request('GET', `/deployment/${deploymentId}/containers`);
      if (!res.ok) return { deployment_id: deploymentId, status: 'failed', health: 'unknown' };

      const data = await res.json() as any;
      const workers = data.data?.workers || data.workers || [];
      const firstWorker = workers[0];

      if (!firstWorker) {
        return { deployment_id: deploymentId, status: 'deploying', health: 'unknown', last_check: Date.now() };
      }

      const isRunning = firstWorker.status === 'running' || !!firstWorker.public_url;

      return {
        deployment_id: deploymentId,
        status: isRunning ? 'running' : 'deploying',
        url: firstWorker.public_url,
        health: isRunning ? 'healthy' : 'unknown',
        last_check: Date.now(),
      };
    } catch {
      return { deployment_id: deploymentId, status: 'failed', health: 'unknown' };
    }
  }

  async logs(deploymentId: string, _options?: LogOptions): Promise<string> {
    if (!this.apiKey) return 'IONET_API_KEY not set';

    try {
      // Get container ID first
      const containerRes = await this.request('GET', `/deployment/${deploymentId}/containers`);
      if (!containerRes.ok) return `Failed to get containers: ${containerRes.status}`;

      const containerData = await containerRes.json() as any;
      const workers = containerData.data?.workers || containerData.workers || [];
      const containerId = workers[0]?.container_id;
      if (!containerId) return 'No containers found for this deployment';

      // Fetch logs via SSE endpoint (read as text)
      const logRes = await this.request('GET', `/deployment/${deploymentId}/log/${containerId}?stream=stdout`);
      if (!logRes.ok) return `Failed to fetch logs: ${logRes.status}`;

      return await logRes.text();
    } catch {
      return `Failed to fetch logs for deployment ${deploymentId}`;
    }
  }

  async terminate(deploymentId: string): Promise<void> {
    if (!this.apiKey) throw new Error('IONET_API_KEY not set');

    const res = await this.request('DELETE', `/deployment/${deploymentId}`);
    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to terminate io.net deployment: ${error}`);
    }

    logger.info(`[Deploy] io.net deployment terminated: ${deploymentId}`);
  }

  async scale(deploymentId: string, replicas: number): Promise<void> {
    if (!this.apiKey) throw new Error('IONET_API_KEY not set');

    const res = await this.request('PATCH', `/deployment/${deploymentId}`, {
      container_config: { replica_count: replicas },
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to scale io.net deployment: ${error}`);
    }

    logger.info(`[Deploy] io.net deployment ${deploymentId} scaled to ${replicas} replicas`);
  }

  async isHealthy(): Promise<boolean> {
    return !!this.apiKey;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async discoverHardware(gpuName: string): Promise<number | null> {
    try {
      const res = await this.request('GET', '/hardware/max-gpus-per-container');
      if (!res.ok) return null;

      const data = await res.json() as any;
      const hardware = Array.isArray(data) ? data : data.data || [];
      const normalized = gpuName.toLowerCase().replace(/[-_\s]/g, '');

      const match = hardware.find((hw: any) => {
        const hwName = (hw.name || hw.label || '').toLowerCase().replace(/[-_\s]/g, '');
        return hwName.includes(normalized) || normalized.includes(hwName);
      });

      return match?.id || match?.hardware_id || null;
    } catch {
      return null;
    }
  }

  private async pollForUrl(deploymentId: string, timeoutMs: number): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const res = await this.request('GET', `/deployment/${deploymentId}/containers`);
        if (res.ok) {
          const data = await res.json() as any;
          const workers = data.data?.workers || data.workers || [];
          const url = workers[0]?.public_url;
          if (url) return url;
        }
      } catch {
        // Transient error — keep polling
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    return null;
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      'X-API-KEY': this.apiKey,
    };

    const init: RequestInit = { method, headers };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    return resilientFetch(`${IONET_API_URL}${path}`, init);
  }
}
