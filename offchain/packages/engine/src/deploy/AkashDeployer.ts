/**
 * Akash Network Deployer (DePIN)
 *
 * Uses the Akash Console API (console-api.akash.network) to avoid raw Cosmos
 * transaction complexity. The managed wallet approach handles signing, gas,
 * and bid management automatically.
 *
 * Deploy flow:
 * 1. Generate SDL v2.0 from agent artifact + config
 * 2. POST /v1/deployments → creates on-chain deployment
 * 3. Poll for bids → auto-accept best bid
 * 4. Send manifest → container starts
 * 5. Poll for lease status → return public URL
 *
 * Env:
 *   AKASH_CONSOLE_API_KEY — Bearer token from console.akash.network
 *   AKASH_CONSOLE_URL     — API base (default: https://console-api.akash.network)
 *   AKASH_WALLET_ADDRESS  — Managed wallet address (created via console)
 */

import type {
  IDeployer,
  RuntimeArtifact,
  DeploymentConfig,
  DeploymentResult,
  DeploymentStatus,
  LogOptions,
} from './IDeployer';
import { resilientFetch } from './resilientFetch';
import { logger } from '../lib/logger';

// ---------------------------------------------------------------------------
// GPU mapping — abstract name → SDL gpu.units + gpu.attributes vendor/model
// ---------------------------------------------------------------------------

const GPU_MAP: Record<string, { units: number; vendor: string; model: string }> = {
  't4':       { units: 1, vendor: 'nvidia', model: 'T4' },
  'a100':     { units: 1, vendor: 'nvidia', model: 'A100' },
  'a100-80':  { units: 1, vendor: 'nvidia', model: 'A100-80' },
  'h100':     { units: 1, vendor: 'nvidia', model: 'H100' },
  'rtx-3090': { units: 1, vendor: 'nvidia', model: 'RTX3090' },
  'rtx-4090': { units: 1, vendor: 'nvidia', model: 'RTX4090' },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AkashDeploymentResponse {
  dseq: string;
  status: string;
  error?: string;
}

interface AkashBid {
  id: string;
  provider: string;
  price: { denom: string; amount: string };
  status: string;
}

interface AkashLease {
  id: string;
  dseq: string;
  gseq: number;
  oseq: number;
  provider: string;
  status: string;
  forwarded_ports?: Array<{ host: number; external_port: number; proto: string }>;
  services?: Record<string, { uris?: string[] }>;
}

// ---------------------------------------------------------------------------
// Deployer
// ---------------------------------------------------------------------------

export class AkashDeployer implements IDeployer {
  readonly target = 'akash';
  readonly description = 'Akash Network decentralized cloud deployment (Console API)';

  private get baseUrl(): string {
    return process.env.AKASH_CONSOLE_URL || 'https://console-api.akash.network';
  }

  private get apiKey(): string {
    return process.env.AKASH_CONSOLE_API_KEY || '';
  }

  private get walletAddress(): string {
    return process.env.AKASH_WALLET_ADDRESS || '';
  }

  // -------------------------------------------------------------------------
  // IDeployer implementation
  // -------------------------------------------------------------------------

  async deploy(
    artifact: RuntimeArtifact,
    config: DeploymentConfig,
    passportId: string,
  ): Promise<DeploymentResult> {
    const deploymentId = `akash_${Date.now()}_${passportId.substring(0, 8)}`;

    try {
      // 1. Build image reference
      const imageRef = await this.resolveImageRef(artifact, passportId);

      // 2. Generate SDL
      const sdl = this.generateSDL(imageRef, artifact, config, passportId);
      logger.info(`[Deploy:Akash] SDL generated for ${passportId}`);

      // 3. Create deployment via Console API
      const deployment = await this.api<AkashDeploymentResponse>(
        'POST',
        '/v1/deployments',
        { sdl, wallet_address: this.walletAddress },
      );

      if (deployment.error) {
        return {
          success: false,
          deployment_id: deploymentId,
          target: this.target,
          error: `Deployment creation failed: ${deployment.error}`,
        };
      }

      const dseq = deployment.dseq;
      logger.info(`[Deploy:Akash] Deployment created: dseq=${dseq}`);

      // 4. Wait for bids and accept the best one
      const lease = await this.waitForLease(dseq);
      if (!lease) {
        return {
          success: false,
          deployment_id: dseq,
          target: this.target,
          error: 'No bids received within timeout',
        };
      }

      logger.info(`[Deploy:Akash] Lease accepted: provider=${lease.provider}`);

      // 5. Send manifest
      await this.api('POST', `/v1/deployments/${dseq}/manifest`, {
        sdl,
        provider: lease.provider,
      });

      logger.info(`[Deploy:Akash] Manifest sent to provider`);

      // 6. Poll for running status + URL
      const url = await this.waitForRunning(dseq);

      return {
        success: true,
        deployment_id: dseq,
        target: this.target,
        url: url || undefined,
        metadata: {
          provider: lease.provider,
          gseq: lease.gseq,
          oseq: lease.oseq,
        },
      };
    } catch (error) {
      return {
        success: false,
        deployment_id: deploymentId,
        target: this.target,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async status(deploymentId: string): Promise<DeploymentStatus> {
    try {
      const result = await this.api<{
        dseq: string;
        status: string;
        services?: Record<string, { uris?: string[]; available_replicas?: number }>;
      }>('GET', `/v1/deployments/${deploymentId}`);

      const uris = Object.values(result.services || {})
        .flatMap(s => s.uris || []);

      return {
        deployment_id: deploymentId,
        status: this.mapStatus(result.status),
        url: uris[0] ? `http://${uris[0]}` : undefined,
        health: result.status === 'active' ? 'healthy' : 'unknown',
      };
    } catch {
      return {
        deployment_id: deploymentId,
        status: 'running',
        health: 'unknown',
      };
    }
  }

  async logs(deploymentId: string, options?: LogOptions): Promise<string> {
    try {
      const params = new URLSearchParams();
      params.set('service', 'agent');
      if (options?.tail) params.set('tail', String(options.tail));

      const result = await this.api<{ logs: string }>(
        'GET',
        `/v1/deployments/${deploymentId}/logs?${params.toString()}`,
      );

      return result.logs || 'No logs available';
    } catch (error) {
      return `Failed to fetch logs: ${error instanceof Error ? error.message : 'Unknown'}`;
    }
  }

  async terminate(deploymentId: string): Promise<void> {
    await this.api('DELETE', `/v1/deployments/${deploymentId}`, {
      wallet_address: this.walletAddress,
    });
    logger.info(`[Deploy:Akash] Deployment ${deploymentId} closed`);
  }

  async scale(deploymentId: string, replicas: number): Promise<void> {
    // Akash scaling requires SDL update → new deployment group
    await this.api('PUT', `/v1/deployments/${deploymentId}/scale`, {
      service: 'agent',
      count: replicas,
      wallet_address: this.walletAddress,
    });
    logger.info(`[Deploy:Akash] Scaled deployment ${deploymentId} to ${replicas} replicas`);
  }

  async isHealthy(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      await this.api('GET', '/v1/status');
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // SDL generation
  // -------------------------------------------------------------------------

  private generateSDL(
    imageRef: string,
    artifact: RuntimeArtifact,
    config: DeploymentConfig,
    _passportId: string,
  ): string {
    const envVars = { ...artifact.env_vars, ...config.env_vars };
    const envLines = Object.entries(envVars)
      .filter(([, v]) => v)
      .map(([k, v]) => `        - "${k}=${v}"`)
      .join('\n');

    // Determine resource profile
    const gpuName = (config.target as any)?.gpu as string | undefined;
    const gpu = gpuName ? GPU_MAP[gpuName] : undefined;

    const cpuUnits = gpu ? '4.0' : '1.0';
    const memSize = gpu ? '8Gi' : '1Gi';
    const storageSize = gpu ? '20Gi' : '4Gi';

    let gpuSection = '';
    if (gpu) {
      gpuSection = `
        gpu:
          units: ${gpu.units}
          attributes:
            vendor:
              ${gpu.vendor}:
                - model: ${gpu.model}`;
    }

    const replicas = config.replicas || 1;

    return `---
version: "2.0"

services:
  agent:
    image: ${imageRef}
    env:
${envLines}
    expose:
      - port: 3100
        as: 80
        to:
          - global: true

profiles:
  compute:
    agent:
      resources:
        cpu:
          units: ${cpuUnits}
        memory:
          size: ${memSize}
        storage:
          size: ${storageSize}${gpuSection}

  placement:
    dcloud:
      attributes:
        host: akash
      signedBy:
        anyOf:
          - akash18qa2a6yejfveldkz2k68v263rshcj64cc8te4l
          - akash1365ez4rv0skq7x70jyvy6qrxqhlxaucp4x50uk
      pricing:
        agent:
          denom: uakt
          amount: 10000

deployment:
  agent:
    dcloud:
      profile: agent
      count: ${replicas}
`;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async resolveImageRef(artifact: RuntimeArtifact, passportId: string): Promise<string> {
    try {
      const { getImageBuilder } = await import('./imageBuilder');
      const builder = getImageBuilder();
      const image = await builder.build(artifact, passportId);
      return image.fullRef;
    } catch {
      // Fallback to generic node image if ImageBuilder not available
      return 'node:20-slim';
    }
  }

  /** Wait for bids and accept the cheapest one */
  private async waitForLease(dseq: string, timeoutMs = 120_000): Promise<AkashLease | null> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      await this.sleep(5000);

      try {
        const bids = await this.api<{ bids: AkashBid[] }>(
          'GET',
          `/v1/deployments/${dseq}/bids`,
        );

        if (bids.bids && bids.bids.length > 0) {
          // Sort by price ascending, accept cheapest
          const sorted = bids.bids
            .filter(b => b.status === 'open')
            .sort((a, b) => Number(a.price.amount) - Number(b.price.amount));

          if (sorted.length === 0) continue;

          const best = sorted[0];

          // Accept the bid → creates a lease
          const lease = await this.api<AkashLease>(
            'POST',
            `/v1/deployments/${dseq}/bids/${best.id}/accept`,
            { wallet_address: this.walletAddress },
          );

          return lease;
        }
      } catch {
        // Bids not ready yet, keep polling
      }
    }

    return null;
  }

  /** Wait for deployment to be running and extract URL */
  private async waitForRunning(dseq: string, timeoutMs = 300_000): Promise<string | null> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      await this.sleep(10_000);

      try {
        const result = await this.api<{
          status: string;
          services?: Record<string, { uris?: string[] }>;
        }>('GET', `/v1/deployments/${dseq}`);

        if (result.status === 'active' && result.services) {
          const uris = Object.values(result.services)
            .flatMap(s => s.uris || []);
          if (uris.length > 0) {
            return `http://${uris[0]}`;
          }
        }

        if (result.status === 'closed') {
          throw new Error('Deployment was closed before becoming active');
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('closed')) throw error;
        // Status not ready yet
      }
    }

    return null;
  }

  private mapStatus(akashStatus: string): 'deploying' | 'running' | 'stopped' | 'failed' | 'terminated' {
    switch (akashStatus) {
      case 'active': return 'running';
      case 'closed': return 'terminated';
      case 'pending': return 'deploying';
      default: return 'running';
    }
  }

  private async api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await resilientFetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Akash Console API ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
