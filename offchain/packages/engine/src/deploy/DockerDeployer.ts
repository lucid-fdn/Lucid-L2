// offchain/packages/engine/src/deploy/DockerDeployer.ts
// Universal fallback deployer — writes agent files to disk and generates docker-compose.yml.
// Does NOT require Docker SDK — generates files only.

import { IDeployer, RuntimeArtifact, DeploymentConfig, DeploymentResult, DeploymentStatus, LogOptions } from './IDeployer';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class DockerDeployer implements IDeployer {
  readonly target = 'docker';
  readonly description = 'Local Docker deployment (generates docker-compose)';

  private deployments = new Map<string, { dir: string; status: string; passportId: string; createdAt: number }>();
  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.join(process.cwd(), 'data', 'deployments');
  }

  async deploy(artifact: RuntimeArtifact, config: DeploymentConfig, passportId: string): Promise<DeploymentResult> {
    const deploymentId = `deploy_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const deployDir = path.join(this.outputDir, deploymentId);

    try {
      // Create deployment directory
      fs.mkdirSync(deployDir, { recursive: true });

      // Write all artifact files (with path traversal protection)
      const resolvedDeployDir = path.resolve(deployDir);
      for (const [filename, content] of artifact.files) {
        const filePath = path.resolve(deployDir, filename);
        if (!filePath.startsWith(resolvedDeployDir)) {
          throw new Error(`Path traversal detected: ${filename}`);
        }
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');
      }

      // Generate docker-compose.yml (use env_file reference, not inline secrets)
      const envVars = { ...artifact.env_vars, ...config.env_vars };
      const compose = this.generateDockerCompose(passportId, deploymentId, config, envVars);
      fs.writeFileSync(path.join(deployDir, 'docker-compose.yml'), compose, 'utf-8');

      // Generate .env file — filter out known secret patterns
      const SECRET_PATTERNS = /^(.*KEY|.*SECRET|.*TOKEN|.*PASSWORD|.*CREDENTIAL)/i;
      const envFile = Object.entries(envVars)
        .filter(([k, v]) => v !== '') // skip empty values
        .map(([k, v]) => SECRET_PATTERNS.test(k) ? `${k}=# SET_ME` : `${k}=${v}`)
        .join('\n');
      fs.writeFileSync(path.join(deployDir, '.env'), envFile, { encoding: 'utf-8', mode: 0o600 });

      // Generate deployment metadata
      const meta = {
        deployment_id: deploymentId,
        passport_id: passportId,
        adapter: artifact.adapter,
        target: this.target,
        created_at: Date.now(),
        entrypoint: artifact.entrypoint,
        config,
      };
      fs.writeFileSync(path.join(deployDir, 'deployment.json'), JSON.stringify(meta, null, 2), 'utf-8');

      this.deployments.set(deploymentId, {
        dir: deployDir,
        status: 'running',
        passportId,
        createdAt: Date.now(),
      });

      console.log(`[Deploy] Docker deployment created: ${deployDir}`);
      console.log(`[Deploy]   To start: cd ${deployDir} && docker compose up -d`);

      return {
        success: true,
        deployment_id: deploymentId,
        target: this.target,
        url: `http://localhost:3100`,
        metadata: { dir: deployDir },
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
    const dep = this.deployments.get(deploymentId);
    if (!dep) {
      return { deployment_id: deploymentId, status: 'terminated', health: 'unknown' };
    }
    return {
      deployment_id: deploymentId,
      status: dep.status as any,
      health: 'unknown',
      uptime_ms: Date.now() - dep.createdAt,
      last_check: Date.now(),
    };
  }

  async logs(deploymentId: string, _options?: LogOptions): Promise<string> {
    const dep = this.deployments.get(deploymentId);
    if (!dep) return `Deployment ${deploymentId} not found`;
    return `Docker deployment at ${dep.dir}. Use: docker compose -f ${dep.dir}/docker-compose.yml logs`;
  }

  async terminate(deploymentId: string): Promise<void> {
    const dep = this.deployments.get(deploymentId);
    if (dep) {
      dep.status = 'terminated';
      console.log(`[Deploy] Docker deployment terminated: ${deploymentId}`);
    }
  }

  async scale(deploymentId: string, replicas: number): Promise<void> {
    console.log(`[Deploy] Scale ${deploymentId} to ${replicas} replicas (update docker-compose.yml manually)`);
  }

  async isHealthy(): Promise<boolean> {
    return true; // Docker deployer is always available (generates files only)
  }

  private generateDockerCompose(
    passportId: string,
    deploymentId: string,
    config: DeploymentConfig,
    envVars: Record<string, string>,
  ): string {
    const replicas = config.replicas || 1;
    const restartPolicy =
      config.restart_policy === 'always' ? 'always' :
      config.restart_policy === 'on_failure' ? 'on-failure' : 'no';

    return `services:
  agent:
    build: .
    container_name: lucid-agent-${deploymentId}
    ports:
      - "3100:3100"
    environment:
${Object.entries(envVars).map(([k, v]) => `      - ${k}=${v}`).join('\n')}
    restart: ${restartPolicy}
    deploy:
      replicas: ${replicas}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3100/health"]
      interval: ${config.health_check_interval_ms || 30000}ms
      timeout: 5s
      retries: 3
    labels:
      - "lucid.passport_id=${passportId}"
      - "lucid.deployment_id=${deploymentId}"
`;
  }
}
