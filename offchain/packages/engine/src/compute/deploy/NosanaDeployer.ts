// offchain/packages/engine/src/deploy/NosanaDeployer.ts
// Nosana deployer (Solana GPU) — deploys agents to Nosana decentralized GPU compute.
// Uses REST API at https://dashboard.k8s.prd.nos.ci/api with INFINITE strategy for persistent services.
// Requires NOSANA_API_KEY environment variable.

import { IDeployer, RuntimeArtifact, DeploymentConfig, DeploymentResult, DeploymentStatus, DeploymentStatusType, LogOptions } from './IDeployer';
import { resilientFetch } from './resilientFetch';
import { logger } from '../../shared/lib/logger';

/**
 * GPU market addresses — Solana pubkeys for Nosana GPU node markets.
 * Used in the `market` field when creating deployments.
 */
const GPU_MARKETS: Record<string, string> = {
  'rtx-4090':   '7AtiXMSH6R1jjBxrcYjehCkkSF7zvYWte63gwEDBcGHq',
  'rtx-4080':   '9fBq8bqR8HuXjcEf4w4GtDqXPDqXKaLWxAMFHMVKzWcM',
  'rtx-3090':   '5E5PxDaivVftFLvJrJhBcZPN2i7D7PNpmS9yyBFBKfAT',
  'a100':       'HBvXxnPwFzjTCuW5qiJhNBR7hVEPxXNbQBbZ9b9YSRHL',
  'a100-80gb':  'HBvXxnPwFzjTCuW5qiJhNBR7hVEPxXNbQBbZ9b9YSRHL',
  'h100':       '2LNGf5UwCD3grdMa6q2sE3s93VSRT8RFHKwTaK6xZwjR',
};

/** Default GPU market (RTX 4090) */
const DEFAULT_GPU_MARKET = GPU_MARKETS['rtx-4090'];

/**
 * Map Nosana deployment states to IDeployer DeploymentStatusType.
 * Nosana states: DRAFT -> STARTING -> RUNNING -> STOPPING -> STOPPED -> ARCHIVED
 */
const NOSANA_STATE_MAP: Record<string, DeploymentStatusType> = {
  DRAFT:     'deploying',
  STARTING:  'deploying',
  RUNNING:   'running',
  STOPPING:  'stopped',
  STOPPED:   'stopped',
  ARCHIVED:  'terminated',
  FAILED:    'failed',
  ERROR:     'failed',
};

export class NosanaDeployer implements IDeployer {
  readonly target = 'nosana';
  readonly description = 'Nosana Solana GPU deployment';

  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.NOSANA_API_KEY || '';
    this.baseUrl = process.env.NOSANA_API_URL || 'https://dashboard.k8s.prd.nos.ci/api';
  }

  async deploy(artifact: RuntimeArtifact, config: DeploymentConfig, passportId: string): Promise<DeploymentResult> {
    if (!this.apiKey) {
      return {
        success: false,
        deployment_id: '',
        target: this.target,
        error: 'NOSANA_API_KEY not set. Get your API key from https://dashboard.nosana.io',
      };
    }

    try {
      // Resolve container image — from config, artifact env, or default
      const image = (config.target as any).image
        || artifact.env_vars.AGENT_IMAGE_REF
        || `ghcr.io/raijinlabs/lucid-agents/${passportId}:latest`;

      // Merge environment variables: artifact defaults < config overrides < auto-injected
      const envVars: Record<string, string> = {
        ...artifact.env_vars,
        ...config.env_vars,
        PORT: '3100',
        NODE_ENV: 'production',
        AGENT_PASSPORT_ID: passportId,
      };

      // Convert env vars to Nosana's expected format (key-value entries)
      const envEntries = Object.entries(envVars)
        .filter(([_, v]) => v !== undefined && v !== '')
        .map(([name, value]) => ({ name, value }));

      // Resolve GPU market address
      const gpuRequested = (config.target as any).gpu || (config.target as any).gpu_type || 'rtx-4090';
      const market = this.mapGpu(gpuRequested);

      // Build the Nosana job definition with container/run operation
      const jobDefinition = {
        global: {
          image,
          trigger: 'cli',
        },
        ops: [
          {
            op: 'container/run',
            id: 'agent-service',
            args: {
              cmd: artifact.entrypoint ? ['node', artifact.entrypoint] : ['node', 'index.js'],
              env: envEntries,
              ports: [{ port: 3100, protocol: 'tcp' }],
              resources: {
                gpu: (config.target as any).gpu_count || 1,
              },
              work_dir: '/app',
            },
          },
        ],
      };

      const body = {
        name: `lucid-agent-${passportId.substring(0, 16)}`,
        strategy: 'INFINITE',
        market,
        job_definition: jobDefinition,
        replicas: config.replicas || 1,
      };

      const res = await this.request('POST', '/deployments', body);

      if (!res.ok) {
        const errorText = await res.text();
        return {
          success: false,
          deployment_id: '',
          target: this.target,
          error: `Nosana API error (${res.status}): ${errorText}`,
        };
      }

      const data = await res.json() as any;
      const deploymentId = data.id || data._id;

      if (!deploymentId) {
        return {
          success: false,
          deployment_id: '',
          target: this.target,
          error: 'Nosana API returned no deployment ID',
        };
      }

      // Start the deployment (transitions from DRAFT to STARTING)
      await this.request('POST', `/deployments/${deploymentId}/start`);

      const url = `https://${deploymentId}.node.k8s.prd.nos.ci`;
      logger.info(`[Deploy] Nosana GPU deployment created: ${deploymentId}`);
      logger.info(`[Deploy]   URL: ${url}`);
      logger.info(`[Deploy]   GPU market: ${gpuRequested} (${market})`);

      return {
        success: true,
        deployment_id: deploymentId,
        target: this.target,
        url,
        metadata: {
          market,
          gpu: gpuRequested,
          strategy: 'INFINITE',
          image,
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
    if (!this.apiKey) {
      return { deployment_id: deploymentId, status: 'failed', error: 'NOSANA_API_KEY not set' };
    }

    try {
      const res = await this.request('GET', `/deployments/${deploymentId}`);

      if (!res.ok) {
        return { deployment_id: deploymentId, status: 'failed', health: 'unknown' };
      }

      const data = await res.json() as any;
      const nosanaState = data.state || data.status || 'STOPPED';
      const mappedStatus = NOSANA_STATE_MAP[nosanaState] || 'stopped';

      return {
        deployment_id: deploymentId,
        status: mappedStatus,
        url: `https://${deploymentId}.node.k8s.prd.nos.ci`,
        health: mappedStatus === 'running' ? 'healthy' : 'unknown',
        uptime_ms: data.started_at ? Date.now() - new Date(data.started_at).getTime() : undefined,
        last_check: Date.now(),
      };
    } catch {
      return { deployment_id: deploymentId, status: 'failed', health: 'unknown' };
    }
  }

  async logs(deploymentId: string, options?: LogOptions): Promise<string> {
    if (!this.apiKey) return 'NOSANA_API_KEY not set';

    try {
      const params = new URLSearchParams();
      if (options?.tail) params.set('tail', String(options.tail));
      if (options?.since) params.set('since', String(options.since));

      const queryString = params.toString();
      const path = `/deployments/${deploymentId}/logs${queryString ? `?${queryString}` : ''}`;
      const res = await this.request('GET', path);

      if (!res.ok) {
        return `Failed to fetch Nosana logs: ${res.status}`;
      }

      return await res.text();
    } catch {
      return `Failed to fetch logs for deployment ${deploymentId}`;
    }
  }

  async terminate(deploymentId: string): Promise<void> {
    if (!this.apiKey) throw new Error('NOSANA_API_KEY not set');

    // Nosana lifecycle: stop first, then archive
    const stopRes = await this.request('POST', `/deployments/${deploymentId}/stop`);
    if (!stopRes.ok) {
      const error = await stopRes.text();
      throw new Error(`Failed to stop Nosana deployment: ${error}`);
    }

    // Archive after stop to fully clean up resources
    const archiveRes = await this.request('POST', `/deployments/${deploymentId}/archive`);
    if (!archiveRes.ok) {
      // Non-fatal: deployment is already stopped, archiving is cleanup
      logger.warn(`[Deploy] Nosana archive failed for ${deploymentId} (deployment is stopped)`);
    }

    logger.info(`[Deploy] Nosana deployment terminated: ${deploymentId}`);
  }

  async scale(deploymentId: string, replicas: number): Promise<void> {
    if (!this.apiKey) throw new Error('NOSANA_API_KEY not set');

    const res = await this.request('PATCH', `/deployments/${deploymentId}`, { replicas });
    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to scale Nosana deployment: ${error}`);
    }

    logger.info(`[Deploy] Nosana deployment ${deploymentId} scaled to ${replicas} replicas`);
  }

  async isHealthy(): Promise<boolean> {
    return !!this.apiKey;
  }

  /**
   * Map abstract GPU name to Nosana market address (Solana pubkey).
   * Falls back to RTX 4090 market if the requested GPU is not recognized.
   */
  private mapGpu(requested: string): string {
    // Allow direct market address (Solana base58 pubkey — 32-44 chars)
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(requested)) {
      return requested;
    }

    // Normalize: lowercase, strip spaces
    const normalized = requested.toLowerCase().replace(/\s+/g, '-');
    return GPU_MARKETS[normalized] || DEFAULT_GPU_MARKET;
  }

  /**
   * Make an authenticated request to the Nosana API.
   */
  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
    };

    const init: RequestInit = { method, headers };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const res = await resilientFetch(url, init);
    return res;
  }
}
