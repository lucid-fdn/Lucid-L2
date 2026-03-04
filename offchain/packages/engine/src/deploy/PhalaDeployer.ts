// offchain/packages/engine/src/deploy/PhalaDeployer.ts
// Phala Network deployer (TEE) — deploys agents to Phala Cloud with Trusted Execution Environment.
// Best for agents handling sensitive data, credentials, or wallets.

import { IDeployer, RuntimeArtifact, DeploymentConfig, DeploymentResult, DeploymentStatus, LogOptions } from './IDeployer';

export class PhalaDeployer implements IDeployer {
  readonly target = 'phala';
  readonly description = 'Phala Network TEE-secured deployment';

  private apiKey: string;
  private apiUrl: string;

  constructor() {
    this.apiKey = process.env.PHALA_API_KEY || '';
    this.apiUrl = process.env.PHALA_API_URL || 'https://cloud.phala.network/api/v1';
  }

  async deploy(artifact: RuntimeArtifact, config: DeploymentConfig, passportId: string): Promise<DeploymentResult> {
    const deploymentId = `phala_${Date.now()}_${passportId.substring(0, 8)}`;

    if (!this.apiKey) {
      return {
        success: false,
        deployment_id: deploymentId,
        target: this.target,
        error: 'PHALA_API_KEY not set. Register at https://cloud.phala.network',
      };
    }

    try {
      const envVars = { ...artifact.env_vars, ...config.env_vars };

      const res = await fetch(`${this.apiUrl}/deployments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          name: `lucid-agent-${passportId.substring(0, 16)}`,
          image: `lucid-agent:${passportId}`,
          env: envVars,
          tee: (config.target as any).tee_required !== false,
          ports: [{ containerPort: 3100, protocol: 'TCP' }],
          replicas: config.replicas || 1,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        return { success: false, deployment_id: deploymentId, target: this.target, error };
      }

      const data = await res.json() as any;
      console.log(`[Deploy] Phala TEE deployment created: ${data.id || deploymentId}`);

      return {
        success: true,
        deployment_id: data.id || deploymentId,
        target: this.target,
        url: data.url,
        metadata: { tee: true, attestation: data.attestation },
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
    if (!this.apiKey) return { deployment_id: deploymentId, status: 'failed', health: 'unknown' };
    try {
      const res = await fetch(`${this.apiUrl}/deployments/${deploymentId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      if (!res.ok) return { deployment_id: deploymentId, status: 'failed', health: 'unknown' };
      const data = await res.json() as any;
      return {
        deployment_id: deploymentId,
        status: data.status || 'stopped',
        url: data.url,
        health: data.health || 'unknown',
        last_check: Date.now(),
      };
    } catch {
      return { deployment_id: deploymentId, status: 'failed', health: 'unknown' };
    }
  }

  async logs(deploymentId: string, _options?: LogOptions): Promise<string> {
    if (!this.apiKey) return 'PHALA_API_KEY not set';
    try {
      const res = await fetch(`${this.apiUrl}/deployments/${deploymentId}/logs`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      return res.ok ? await res.text() : `Failed to fetch logs: ${res.status}`;
    } catch {
      return `Failed to fetch logs for ${deploymentId}`;
    }
  }

  async terminate(deploymentId: string): Promise<void> {
    if (!this.apiKey) throw new Error('PHALA_API_KEY not set');
    await fetch(`${this.apiUrl}/deployments/${deploymentId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });
    console.log(`[Deploy] Phala deployment terminated: ${deploymentId}`);
  }

  async scale(deploymentId: string, replicas: number): Promise<void> {
    if (!this.apiKey) throw new Error('PHALA_API_KEY not set');
    await fetch(`${this.apiUrl}/deployments/${deploymentId}/scale`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ replicas }),
    });
  }

  async isHealthy(): Promise<boolean> {
    return !!this.apiKey;
  }
}
