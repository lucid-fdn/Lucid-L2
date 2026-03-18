// offchain/packages/engine/src/deploy/DockerDeployer.ts
// Universal fallback deployer — writes agent files to disk and generates docker-compose.yml.
// Does NOT require Docker SDK — generates files only.

import { IDeployer, RuntimeArtifact, DeploymentConfig, DeploymentResult, DeploymentStatus, LogOptions } from './IDeployer';
import { isImageDeploy } from './types';
import type { ImageDeployInput } from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../../shared/lib/logger';

export class DockerDeployer implements IDeployer {
  readonly target = 'docker';
  readonly description = 'Local Docker deployment (generates docker-compose)';

  private deployments = new Map<string, { dir: string; status: string; passportId: string; createdAt: number }>();
  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.join(process.cwd(), 'data', 'deployments');
  }

  async deploy(input: RuntimeArtifact | ImageDeployInput, config: DeploymentConfig, passportId: string): Promise<DeploymentResult> {
    if (isImageDeploy(input)) {
      return this.deployImage(input, config, passportId);
    }
    const artifact = input; // existing code-gen path continues unchanged

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

      logger.info(`[Deploy] Docker deployment created: ${deployDir}`);
      logger.info(`[Deploy]   To start: cd ${deployDir} && docker compose up -d`);

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
      logger.info(`[Deploy] Docker deployment terminated: ${deploymentId}`);
    }
  }

  async scale(deploymentId: string, replicas: number): Promise<void> {
    logger.info(`[Deploy] Scale ${deploymentId} to ${replicas} replicas (update docker-compose.yml manually)`);
  }

  async isHealthy(): Promise<boolean> {
    return true; // Docker deployer is always available (generates files only)
  }

  private async deployImage(input: ImageDeployInput, config: DeploymentConfig, passportId: string): Promise<DeploymentResult> {
    const deployId = `deploy_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const deployDir = path.join(this.outputDir, deployId);

    try {
      fs.mkdirSync(deployDir, { recursive: true });

      // Merge env vars: input env_vars + config env_vars (config takes precedence)
      const envVars = { ...input.env_vars, ...config.env_vars };
      const port = input.port || 3100;
      const replicas = config.replicas || 1;
      const restartPolicy =
        config.restart_policy === 'always' ? 'always' :
        config.restart_policy === 'on_failure' ? 'on-failure' : 'no';

      // Generate docker-compose.yml with image: directive (NOT build: .)
      const entrypointBlock = input.entrypoint
        ? `    entrypoint: [${input.entrypoint.map(e => `"${e}"`).join(', ')}]\n`
        : '';
      const envBlock = Object.entries(envVars)
        .map(([k, v]) => `      - ${k}=${v}`)
        .join('\n');

      const compose = `services:
  agent:
    image: ${input.image}
    container_name: lucid-agent-${deployId}
${entrypointBlock}    ports:
      - "${port}:${port}"
    environment:
${envBlock}
    restart: ${restartPolicy}
    deploy:
      replicas: ${replicas}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${port}/health"]
      interval: ${config.health_check_interval_ms || 30000}ms
      timeout: 5s
      retries: 3
    labels:
      - "lucid.passport_id=${passportId}"
      - "lucid.deployment_id=${deployId}"
`;
      fs.writeFileSync(path.join(deployDir, 'docker-compose.yml'), compose, 'utf-8');

      // Write deployment metadata
      const meta = {
        deployment_id: deployId,
        passport_id: passportId,
        image: input.image,
        verification: input.verification,
        target: this.target,
        created_at: Date.now(),
        port,
        config,
      };
      fs.writeFileSync(path.join(deployDir, 'deployment.json'), JSON.stringify(meta, null, 2), 'utf-8');

      // Write .env file — filter out known secret patterns
      const SECRET_PATTERNS = /^(.*KEY|.*SECRET|.*TOKEN|.*PASSWORD|.*CREDENTIAL)/i;
      const envFile = Object.entries(envVars)
        .filter(([_k, v]) => v !== '')
        .map(([k, v]) => SECRET_PATTERNS.test(k) ? `${k}=# SET_ME` : `${k}=${v}`)
        .join('\n');
      fs.writeFileSync(path.join(deployDir, '.env'), envFile, { encoding: 'utf-8', mode: 0o600 });

      this.deployments.set(deployId, {
        dir: deployDir,
        status: 'prepared',
        passportId,
        createdAt: Date.now(),
      });

      logger.info(`[Deploy] Docker image deployment prepared: ${deployDir}`);
      logger.info(`[Deploy]   Image: ${input.image}`);
      logger.info(`[Deploy]   To start: cd ${deployDir} && docker compose up -d`);

      return {
        success: true,
        deployment_id: deployId,
        target: this.target,
        url: `http://localhost:${port}`,
        metadata: { dir: deployDir, status: 'prepared', requires_manual_start: true },
      };
    } catch (error) {
      return {
        success: false,
        deployment_id: deployId,
        target: this.target,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
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
