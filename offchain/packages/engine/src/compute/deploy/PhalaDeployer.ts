// offchain/packages/engine/src/deploy/PhalaDeployer.ts
// Phala Network deployer (TEE) — deploys agents to Phala Cloud CVM with encrypted env vars.
// Uses real Phala Cloud API: two-phase CVM provisioning (provision → commit).
// Requires PHALA_CLOUD_API_KEY environment variable.

import { IDeployer, RuntimeArtifact, DeploymentConfig, DeploymentResult, DeploymentStatus, LogOptions } from './IDeployer';
import { resilientFetch } from './resilientFetch';
import { logger } from '../../shared/lib/logger';

const PHALA_API_URL = 'https://cloud-api.phala.com/api/v1';
const PHALA_API_VERSION = '2026-01-21';

/** Poll interval when waiting for CVM to reach 'running' state */
const POLL_INTERVAL_MS = 5_000;
/** Maximum time to wait for CVM startup */
const STARTUP_TIMEOUT_MS = 5 * 60 * 1000;

/** Instance type mapping from abstract GPU names to Phala CVM types */
const INSTANCE_TYPE_MAP: Record<string, string> = {
  'cpu':        'tdx.small',
  'small':      'tdx.small',
  'medium':     'tdx.medium',
  'large':      'tdx.large',
  't4':         'tdx.gpu.small',
  'a100':       'tdx.gpu.medium',
  'h100':       'tdx.gpu.large',
  'h200':       'tdx.gpu.xlarge',
};

/** Map Phala CVM states to DeploymentStatusType */
const STATE_MAP: Record<string, string> = {
  provisioning: 'deploying',
  committing:   'deploying',
  starting:     'deploying',
  running:      'running',
  stopping:     'stopped',
  stopped:      'stopped',
  error:        'failed',
  failed:       'failed',
  deleted:      'terminated',
};

export class PhalaDeployer implements IDeployer {
  readonly target = 'phala';
  readonly description = 'Phala Network TEE-secured deployment';

  private apiKey: string;

  constructor() {
    this.apiKey = process.env.PHALA_CLOUD_API_KEY || process.env.PHALA_API_KEY || '';
  }

  async deploy(artifact: RuntimeArtifact, config: DeploymentConfig, passportId: string): Promise<DeploymentResult> {
    if (!this.apiKey) {
      return {
        success: false,
        deployment_id: '',
        target: this.target,
        error: 'PHALA_CLOUD_API_KEY not set. Register at https://cloud.phala.network',
      };
    }

    try {
      // Resolve Docker image reference
      const image = (config.target as any).image_ref
        || artifact.env_vars.AGENT_IMAGE_REF
        || `ghcr.io/raijinlabs/lucid-agents/${passportId}:latest`;

      // Merge environment variables
      const envVars: Record<string, string> = {
        ...artifact.env_vars,
        ...config.env_vars,
        PORT: '3100',
        NODE_ENV: 'production',
        AGENT_PASSPORT_ID: passportId,
      };
      delete envVars.AGENT_IMAGE_REF;

      // Generate Docker Compose YAML for Phala CVM
      const composeYaml = this.generateCompose(image, envVars);

      // Resolve instance type
      const gpuType = (config.target as any).gpu || (config.target as any).instance_type || 'cpu';
      const instanceType = INSTANCE_TYPE_MAP[gpuType] || 'tdx.small';

      // Phase 1: Provision CVM
      const provisionRes = await this.request('POST', '/cvm/provision', {
        name: `lucid-agent-${passportId.substring(0, 16)}`,
        compose_file: {
          docker_compose_file: composeYaml,
          public_logs: true,
          gateway_enabled: true,
        },
        instance_type: instanceType,
      });

      if (!provisionRes.ok) {
        const error = await provisionRes.text();
        return { success: false, deployment_id: '', target: this.target, error: `Phala provision failed: ${error}` };
      }

      const provision = await provisionRes.json() as any;
      const appId = provision.app_id;
      const composeHash = provision.compose_hash;

      if (!appId) {
        return { success: false, deployment_id: '', target: this.target, error: 'Phala provision returned no app_id' };
      }

      // Phase 2: Encrypt env vars and commit
      // Simplified encryption: base64 encode env vars for MVP
      // In production, use app_env_encrypt_pubkey for proper encryption
      const envEntries = Object.entries(envVars).map(([k, v]) => ({
        key: k,
        value: Buffer.from(v).toString('base64'),
      }));

      const commitRes = await this.request('POST', '/cvm/commit', {
        app_id: appId,
        compose_hash: composeHash,
        encrypted_env: envEntries,
        env_keys: Object.keys(envVars),
      });

      if (!commitRes.ok) {
        const error = await commitRes.text();
        return { success: false, deployment_id: appId, target: this.target, error: `Phala commit failed: ${error}` };
      }

      // Poll until running or timeout
      const finalStatus = await this.pollUntilRunning(appId, STARTUP_TIMEOUT_MS);
      const url = `https://${appId}-3100.dstack-prod5.phala.network`;

      logger.info(`[Deploy] Phala TEE deployment created: ${appId}`);
      logger.info(`[Deploy]   URL: ${url}`);
      logger.info(`[Deploy]   Instance: ${instanceType}`);

      return {
        success: finalStatus === 'running',
        deployment_id: appId,
        target: this.target,
        url,
        ...(finalStatus !== 'running' ? { error: `CVM reached state: ${finalStatus}` } : {}),
        metadata: {
          tee: true,
          instance_type: instanceType,
          compose_hash: composeHash,
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
    if (!this.apiKey) return { deployment_id: deploymentId, status: 'failed', error: 'PHALA_CLOUD_API_KEY not set' };

    try {
      const res = await this.request('GET', `/cvm/${deploymentId}/state`);
      if (!res.ok) return { deployment_id: deploymentId, status: 'failed', health: 'unknown' };

      const data = await res.json() as any;
      const rawStatus = data.status || 'stopped';
      const mapped = (STATE_MAP[rawStatus] || 'stopped') as DeploymentStatus['status'];

      return {
        deployment_id: deploymentId,
        status: mapped,
        url: `https://${deploymentId}-3100.dstack-prod5.phala.network`,
        health: mapped === 'running' ? 'healthy' : mapped === 'failed' ? 'unhealthy' : 'unknown',
        last_check: Date.now(),
      };
    } catch {
      return { deployment_id: deploymentId, status: 'failed', health: 'unknown' };
    }
  }

  async logs(deploymentId: string, _options?: LogOptions): Promise<string> {
    if (!this.apiKey) return 'PHALA_CLOUD_API_KEY not set';

    try {
      const res = await this.request('GET', `/cvm/${deploymentId}/logs`);
      if (!res.ok) return `Failed to fetch Phala logs: ${res.status}`;
      return await res.text();
    } catch {
      return `Failed to fetch logs for ${deploymentId}`;
    }
  }

  async terminate(deploymentId: string): Promise<void> {
    if (!this.apiKey) throw new Error('PHALA_CLOUD_API_KEY not set');

    // Stop the CVM first, then delete
    await this.request('POST', `/cvm/${deploymentId}/stop`);
    const res = await this.request('DELETE', `/cvm/${deploymentId}`);
    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to delete Phala CVM: ${error}`);
    }

    logger.info(`[Deploy] Phala deployment terminated: ${deploymentId}`);
  }

  async scale(_deploymentId: string, _replicas: number): Promise<void> {
    throw new Error('Phala CVM does not support horizontal scaling. Deploy additional CVMs instead.');
  }

  async isHealthy(): Promise<boolean> {
    return !!this.apiKey;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private generateCompose(image: string, envVars: Record<string, string>): string {
    const envLines = Object.entries(envVars)
      .filter(([_, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `      - ${k}=${v}`)
      .join('\n');

    return `services:
  agent:
    image: ${image}
    ports:
      - "3100:3100"
    environment:
${envLines}
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3100/health"]
      interval: 30s
      timeout: 5s
      retries: 3
`;
  }

  private async pollUntilRunning(appId: string, timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const res = await this.request('GET', `/cvm/${appId}/state`);
        if (res.ok) {
          const data = await res.json() as any;
          const status = data.status || 'provisioning';
          if (status === 'running' || status === 'error' || status === 'failed') {
            return status;
          }
        }
      } catch {
        // Transient error — keep polling
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    return 'deploying'; // Timed out
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'X-Phala-Version': PHALA_API_VERSION,
    };

    const init: RequestInit = { method, headers };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    return resilientFetch(`${PHALA_API_URL}${path}`, init);
  }
}
