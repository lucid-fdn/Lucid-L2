// offchain/packages/engine/src/deploy/RailwayDeployer.ts
// Railway.app deployer — creates services via Railway GraphQL API with Docker image source.
// Requires RAILWAY_API_TOKEN and RAILWAY_PROJECT_ID environment variables.

import { IDeployer, RuntimeArtifact, DeploymentConfig, DeploymentResult, DeploymentStatus, LogOptions } from './IDeployer';
import { isImageDeploy } from './types';
import type { ImageDeployInput } from './types';
import { resilientFetch } from './resilientFetch';
import { logger } from '../../shared/lib/logger';
import type { DeploymentMetrics, EnvVarPatch, MetricsOptions, RedeployResult } from './capability-types';

const RAILWAY_API_URL = 'https://backboard.railway.app/graphql/v2';

/** Maximum time to wait for a deployment to reach a terminal state */
const DEPLOY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
/** Polling interval when waiting for deployment status */
const POLL_INTERVAL_MS = 5_000;

/** Map Railway deployment statuses to our lifecycle statuses */
const STATUS_MAP: Record<string, string> = {
  SUCCESS: 'running',
  BUILDING: 'deploying',
  DEPLOYING: 'deploying',
  INITIALIZING: 'deploying',
  WAITING: 'deploying',
  FAILED: 'failed',
  CRASHED: 'failed',
  REMOVED: 'terminated',
  REMOVING: 'terminated',
  SLEEPING: 'stopped',
};

export class RailwayDeployer implements IDeployer {
  readonly target = 'railway';
  readonly description = 'Railway.app container deployment';

  // Read token at deploy time, not construction — allows CLI to inject credential after factory init
  private get apiToken(): string {
    return process.env.RAILWAY_API_TOKEN || '';
  }

  async deploy(input: RuntimeArtifact | ImageDeployInput, config: DeploymentConfig, passportId: string): Promise<DeploymentResult> {
    if (!this.apiToken) {
      return {
        success: false,
        deployment_id: '',
        target: this.target,
        error: 'RAILWAY_API_TOKEN not set',
      };
    }

    try {
      let projectId = (config.target as any).project_id || process.env.RAILWAY_PROJECT_ID;
      if (!projectId) {
        // Auto-create project (industry standard — Vercel, Railway CLI, Fly.io all do this)
        logger.info('[Deploy:Railway] No project ID — creating new project...');
        try {
          const createProjectResult = await this.graphql(`
            mutation ProjectCreate($input: ProjectCreateInput!) {
              projectCreate(input: $input) { id name }
            }
          `, { input: { name: `lucid-agent-${passportId.substring(0, 12)}` } });
          projectId = createProjectResult.data?.projectCreate?.id;
          if (!projectId) throw new Error('Project creation returned no ID');
          logger.info(`[Deploy:Railway] Project created: ${projectId}`);
        } catch (err: any) {
          return {
            success: false,
            deployment_id: '',
            target: this.target,
            error: `Failed to create Railway project: ${err.message}`,
          };
        }
      }

      // Resolve Docker image reference
      const imageRef = isImageDeploy(input)
        ? input.image
        : ((config.target as any).image_ref
          || input.env_vars.AGENT_IMAGE_REF
          || (config.env_vars?.AGENT_IMAGE_REF));
      if (!imageRef) {
        return {
          success: false,
          deployment_id: '',
          target: this.target,
          error: 'Docker image reference required: set target.image_ref or AGENT_IMAGE_REF env var',
        };
      }

      let environmentId = (config.target as any).environment_id || process.env.RAILWAY_ENVIRONMENT_ID;

      // Auto-fetch default environment if not provided (needed for env vars + domain)
      if (!environmentId) {
        try {
          const envResult = await this.graphql(`
            query ProjectEnvs($projectId: String!) {
              project(id: $projectId) {
                environments { edges { node { id name } } }
              }
            }
          `, { projectId });
          const envs = envResult.data?.project?.environments?.edges || [];
          const prod = envs.find((e: any) => e.node.name === 'production');
          environmentId = prod?.node?.id || envs[0]?.node?.id;
        } catch {
          // Continue without environmentId — some operations may fail
        }
      }

      // Create service with Docker image or GitHub repo source
      const serviceName = `agent-${passportId.substring(0, 20)}`;
      const repoUrl = (config.env_vars?.GITHUB_REPO_URL)
        || (config.target as any).repo_url;
      const source = repoUrl
        ? { repo: repoUrl }
        : { image: imageRef };
      logger.info(`[Deploy:Railway] Creating service "${serviceName}" with source:`, source);

      // Pass registry credentials for private Docker images (e.g. GHCR)
      const registryAuth = isImageDeploy(input) && input.registry_auth
        ? { username: input.registry_auth.username, password: input.registry_auth.password }
        : undefined;

      const createServiceResult = await this.graphql(`
        mutation ServiceCreate($input: ServiceCreateInput!) {
          serviceCreate(input: $input) {
            id
            name
          }
        }
      `, {
        input: {
          name: serviceName,
          projectId,
          source,
          ...(registryAuth ? { registryCredentials: registryAuth } : {}),
        },
      });

      if (createServiceResult.errors?.length) {
        return {
          success: false,
          deployment_id: '',
          target: this.target,
          error: `Railway serviceCreate failed: ${createServiceResult.errors[0].message}`,
        };
      }

      const serviceId = createServiceResult?.data?.serviceCreate?.id;
      if (!serviceId) {
        return {
          success: false,
          deployment_id: '',
          target: this.target,
          error: 'Failed to create Railway service: no service ID returned',
        };
      }

      // Provision Postgres if the agent needs a database (e.g., IronClaw)
      const needsPostgres = config.env_vars?.NEEDS_POSTGRES === 'true'
        || (config.target as any).needs_postgres === true;
      if (needsPostgres) {
        logger.info(`[Deploy:Railway] Agent needs Postgres — creating database service...`);
        try {
          const dbServiceResult = await this.graphql(`
            mutation ServiceCreate($input: ServiceCreateInput!) {
              serviceCreate(input: $input) { id name }
            }
          `, {
            input: {
              name: `db-${passportId.substring(0, 16)}`,
              projectId,
              source: { image: 'postgres:15' },
            },
          });
          const dbServiceId = dbServiceResult?.data?.serviceCreate?.id;
          if (dbServiceId) {
            // Set Postgres env vars on the DB service
            const dbPassword = require('crypto').randomBytes(16).toString('hex');
            await this.graphql(`
              mutation VariablesUpsert($input: VariableCollectionUpsertInput!) {
                variableCollectionUpsert(input: $input)
              }
            `, {
              input: {
                serviceId: dbServiceId,
                projectId,
                ...(environmentId ? { environmentId } : {}),
                variables: {
                  POSTGRES_USER: 'ironclaw',
                  POSTGRES_PASSWORD: dbPassword,
                  POSTGRES_DB: 'ironclaw',
                },
              },
            });
            // Generate internal domain for DB service
            const dbDomainResult = await this.graphql(`
              mutation ServiceDomainCreate($input: ServiceDomainCreateInput!) {
                serviceDomainCreate(input: $input) { domain }
              }
            `, {
              input: { serviceId: dbServiceId, ...(environmentId ? { environmentId } : {}) },
            });
            const dbDomain = dbDomainResult?.data?.serviceDomainCreate?.domain;
            if (dbDomain) {
              // Inject DATABASE_URL into the agent's env vars
              config.env_vars = config.env_vars || {};
              config.env_vars.DATABASE_URL = `postgres://ironclaw:${dbPassword}@${dbDomain}:5432/ironclaw`;
              logger.info(`[Deploy:Railway] Postgres provisioned: ${dbDomain}`);
            }
          }
        } catch (dbErr) {
          logger.warn(`[Deploy:Railway] Postgres provisioning failed (non-fatal): ${dbErr}`);
          // Agent may fail if it strictly requires DATABASE_URL, but don't block deployment
        }
      }

      // Set environment variables on the service
      const envVars = { ...input.env_vars, ...config.env_vars };
      // Remove AGENT_IMAGE_REF from env vars — it was used for the image source, not runtime
      delete envVars.AGENT_IMAGE_REF;
      // Remove internal flags
      delete envVars.NEEDS_POSTGRES;
      delete envVars.GITHUB_REPO_URL;

      const envInput: Record<string, string> = {};
      for (const [key, value] of Object.entries(envVars)) {
        if (value != null && value !== '') {
          envInput[key] = value;
        }
      }

      if (Object.keys(envInput).length > 0) {
        const varResult = await this.graphql(`
          mutation VariablesUpsert($input: VariableCollectionUpsertInput!) {
            variableCollectionUpsert(input: $input)
          }
        `, {
          input: {
            serviceId,
            projectId,
            ...(environmentId ? { environmentId } : {}),
            variables: envInput,
          },
        });

        if (varResult.errors?.length) {
          logger.warn(`[Deploy] Railway env var upsert warning: ${varResult.errors[0].message}`);
          // Fall back to individual upserts
          for (const [key, value] of Object.entries(envInput)) {
            await this.graphql(`
              mutation VariableUpsert($input: VariableUpsertInput!) {
                variableUpsert(input: $input)
              }
            `, {
              input: {
                serviceId,
                projectId,
                ...(environmentId ? { environmentId } : {}),
                name: key,
                value,
              },
            });
          }
        }
      }

      // Generate a service domain (*.up.railway.app)
      let url: string | undefined;
      try {
        const domainResult = await this.graphql(`
          mutation ServiceDomainCreate($input: ServiceDomainCreateInput!) {
            serviceDomainCreate(input: $input) {
              domain
            }
          }
        `, {
          input: {
            serviceId,
            ...(environmentId ? { environmentId } : {}),
          },
        });

        const domain = domainResult?.data?.serviceDomainCreate?.domain;
        if (domain) {
          url = `https://${domain}`;
        }
      } catch (domainErr) {
        logger.warn(`[Deploy] Railway domain creation failed (non-fatal): ${domainErr}`);
      }

      logger.info(`[Deploy] Railway service created: ${serviceId} (image: ${imageRef})`);
      if (url) {
        logger.info(`[Deploy]   URL: ${url}`);
      }

      // Wait for initial deployment to reach a terminal state
      const skipPolling = (config.target as any).skip_deploy_polling === true;
      let deploymentStatus = 'deploying';
      if (!skipPolling) {
        deploymentStatus = await this.pollDeploymentStatus(serviceId, DEPLOY_TIMEOUT_MS);
      }

      const success = deploymentStatus === 'running' || deploymentStatus === 'deploying';

      return {
        success,
        deployment_id: serviceId,
        target: this.target,
        url,
        ...(success ? {} : { error: `Deployment reached status: ${deploymentStatus}` }),
        metadata: { projectId, serviceId, imageRef, deploymentStatus },
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
    try {
      const result = await this.graphql(`
        query ServiceStatus($id: String!) {
          service(id: $id) {
            id
            name
            deployments(first: 1) {
              edges {
                node {
                  id
                  status
                  createdAt
                }
              }
            }
          }
        }
      `, { id: deploymentId });

      if (result.errors?.length) {
        const msg = result.errors[0].message;
        logger.warn(`[Railway:status] GraphQL error for ${deploymentId}: ${msg}`);
        return { deployment_id: deploymentId, status: 'unknown', health: 'unknown', error: msg };
      }

      const service = result?.data?.service;
      if (!service) {
        return { deployment_id: deploymentId, status: 'terminated', health: 'unknown' };
      }

      const deployment = service.deployments?.edges?.[0]?.node;
      const rawStatus = deployment?.status || 'UNKNOWN';
      const mappedStatus = (STATUS_MAP[rawStatus] || 'stopped') as DeploymentStatus['status'];

      return {
        deployment_id: deploymentId,
        status: mappedStatus,
        health: mappedStatus === 'running' ? 'healthy' : mappedStatus === 'failed' ? 'unhealthy' : 'unknown',
        uptime_ms: deployment?.createdAt ? Date.now() - new Date(deployment.createdAt).getTime() : undefined,
        last_check: Date.now(),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[Railway:status] Status check failed for ${deploymentId}: ${msg}`);
      return { deployment_id: deploymentId, status: 'unknown', health: 'unknown', error: 'Status check failed — container may still be running' };
    }
  }

  async logs(deploymentId: string, options?: LogOptions): Promise<string> {
    try {
      // First get the latest deployment ID for this service
      const serviceResult = await this.graphql(`
        query ServiceDeployments($id: String!) {
          service(id: $id) {
            deployments(first: 1) {
              edges {
                node {
                  id
                }
              }
            }
          }
        }
      `, { id: deploymentId });

      const railwayDeploymentId = serviceResult?.data?.service?.deployments?.edges?.[0]?.node?.id;
      if (!railwayDeploymentId) {
        return `No deployments found for service ${deploymentId}`;
      }

      const limit = options?.tail || 100;
      const result = await this.graphql(`
        query DeploymentLogs($deploymentId: String!, $limit: Int!) {
          deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
            message
            timestamp
          }
        }
      `, { deploymentId: railwayDeploymentId, limit });

      const logs = result?.data?.deploymentLogs || [];
      if (logs.length === 0) return `No logs available for ${deploymentId}`;

      return logs.map((l: any) => `[${l.timestamp}] ${l.message}`).join('\n');
    } catch {
      return `Failed to fetch logs for ${deploymentId}`;
    }
  }

  async terminate(deploymentId: string): Promise<void> {
    const result = await this.graphql(`
      mutation ServiceDelete($id: String!) {
        serviceDelete(id: $id)
      }
    `, { id: deploymentId });

    if (result.errors?.length) {
      throw new Error(`Failed to terminate Railway service: ${result.errors[0].message}`);
    }

    logger.info(`[Deploy] Railway service terminated: ${deploymentId}`);
  }

  async scale(deploymentId: string, replicas: number): Promise<void> {
    // Railway supports scaling via service instance settings
    const result = await this.graphql(`
      mutation ServiceInstanceUpdate($serviceId: String!, $input: ServiceInstanceUpdateInput!) {
        serviceInstanceUpdate(serviceId: $serviceId, input: $input)
      }
    `, {
      serviceId: deploymentId,
      input: { numReplicas: replicas },
    });

    if (result.errors?.length) {
      logger.warn(`[Deploy] Railway scaling via API failed: ${result.errors[0].message}. Use Railway dashboard.`);
    } else {
      logger.info(`[Deploy] Railway service ${deploymentId} scaled to ${replicas} replicas`);
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.apiToken) return false;
    try {
      const result = await this.graphql(`query { me { id } }`);
      return !!result?.data?.me?.id;
    } catch {
      return false;
    }
  }

  async metrics(deploymentId: string, options?: MetricsOptions): Promise<DeploymentMetrics> {
    // Railway serviceId = deploymentId in our model
    // Get the latest deployment for this service to query metrics
    const serviceResult = await this.graphql(`
      query ServiceDeployments($id: String!) {
        service(id: $id) {
          deployments(first: 1) {
            edges { node { id } }
          }
        }
      }
    `, { id: deploymentId });

    const railwayDeploymentId = serviceResult?.data?.service?.deployments?.edges?.[0]?.node?.id;
    if (!railwayDeploymentId) {
      return { collectedAt: Date.now() };
    }

    // Railway metrics query — returns time series for CPU, memory, network
    const rangeMinutes = options?.range ? Math.ceil(options.range / 60) : 60;
    const resolution = options?.granularity === 'day' ? 1440
      : options?.granularity === 'hour' ? 60
      : 5; // default 5-min resolution

    try {
      const metricsResult = await this.graphql(`
        query DeploymentMetrics($deploymentId: String!, $measurements: [MetricMeasurement!]!, $startDate: DateTime!, $sampleRateSeconds: Int) {
          metrics(
            deploymentId: $deploymentId,
            measurements: $measurements,
            startDate: $startDate,
            sampleRateSeconds: $sampleRateSeconds
          ) {
            measurement
            tags
            values {
              ts
              value
            }
          }
        }
      `, {
        deploymentId: railwayDeploymentId,
        measurements: ['CPU_USAGE', 'MEMORY_USAGE_MB', 'DISK_USAGE_GB', 'NETWORK_RX_BYTES', 'NETWORK_TX_BYTES'],
        startDate: new Date(Date.now() - rangeMinutes * 60 * 1000).toISOString(),
        sampleRateSeconds: resolution * 60,
      });

      const rawMetrics = metricsResult?.data?.metrics || [];

      const findMetric = (measurement: string) => {
        const m = rawMetrics.find((r: any) => r.measurement === measurement);
        if (!m?.values?.length) return undefined;
        const series = m.values.map((v: any) => ({ timestamp: new Date(v.ts).getTime(), value: v.value }));
        const latest = series[series.length - 1];
        return { current: latest?.value, series };
      };

      const cpuData = findMetric('CPU_USAGE');
      const memData = findMetric('MEMORY_USAGE_MB');
      const diskData = findMetric('DISK_USAGE_GB');
      const rxData = findMetric('NETWORK_RX_BYTES');
      const txData = findMetric('NETWORK_TX_BYTES');

      return {
        cpu: cpuData ? { ...cpuData, unit: 'percent' as const } : undefined,
        memory: memData ? { ...memData, unit: 'bytes' as const } : undefined,
        disk: diskData ? { ...diskData, unit: 'bytes' as const } : undefined,
        network: (rxData || txData) ? {
          rxBytes: rxData ? { ...rxData, unit: 'bytes' as const } : undefined,
          txBytes: txData ? { ...txData, unit: 'bytes' as const } : undefined,
        } : undefined,
        collectedAt: Date.now(),
      };
    } catch (err) {
      logger.warn(`[Railway:metrics] Metrics query failed for ${deploymentId}: ${err instanceof Error ? err.message : String(err)}`);
      return { collectedAt: Date.now() };
    }
  }

  async redeploy(deploymentId: string): Promise<RedeployResult> {
    try {
      // Get the latest deployment to redeploy
      const serviceResult = await this.graphql(`
        query ServiceDeployments($id: String!) {
          service(id: $id) {
            deployments(first: 1) {
              edges { node { id, environmentId } }
            }
          }
        }
      `, { id: deploymentId });

      const latestDeployment = serviceResult?.data?.service?.deployments?.edges?.[0]?.node;
      if (!latestDeployment) {
        return {
          success: false,
          deployment_id: deploymentId,
          status: 'failed',
        };
      }

      // Trigger redeploy via serviceInstanceRedeploy
      const redeployResult = await this.graphql(`
        mutation ServiceInstanceRedeploy($serviceId: String!, $environmentId: String!) {
          serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
        }
      `, {
        serviceId: deploymentId,
        environmentId: latestDeployment.environmentId,
      });

      if (redeployResult.errors?.length) {
        logger.warn(`[Railway:redeploy] Redeploy failed for ${deploymentId}: ${redeployResult.errors[0].message}`);
        return {
          success: false,
          deployment_id: deploymentId,
          status: 'failed',
        };
      }

      logger.info(`[Railway:redeploy] Redeploy triggered for service ${deploymentId}`);
      return {
        success: true,
        deployment_id: deploymentId,
        status: 'queued',
        operation_id: `redeploy-${Date.now()}`,
      };
    } catch (err) {
      logger.warn(`[Railway:redeploy] Error redeploying ${deploymentId}: ${err instanceof Error ? err.message : String(err)}`);
      return {
        success: false,
        deployment_id: deploymentId,
        status: 'failed',
      };
    }
  }

  async updateEnvVars(deploymentId: string, vars: EnvVarPatch): Promise<void> {
    const projectId = process.env.RAILWAY_PROJECT_ID;
    if (!projectId) {
      throw new Error('RAILWAY_PROJECT_ID not set');
    }

    const serviceResult = await this.graphql(`
      query ServiceEnvContext($id: String!) {
        service(id: $id) {
          deployments(first: 1) {
            edges {
              node {
                environmentId
              }
            }
          }
        }
      }
    `, { id: deploymentId });

    const environmentId =
      serviceResult?.data?.service?.deployments?.edges?.[0]?.node?.environmentId
      || process.env.RAILWAY_ENVIRONMENT_ID;
    if (!environmentId) {
      throw new Error(`No Railway environment found for service ${deploymentId}`);
    }

    const upserts: Record<string, string> = {};
    const skippedDeletes: string[] = [];
    for (const [key, value] of Object.entries(vars)) {
      if (value === null) {
        skippedDeletes.push(key);
        continue;
      }
      if (value !== '') {
        upserts[key] = value;
      }
    }

    if (Object.keys(upserts).length > 0) {
      const result = await this.graphql(`
        mutation VariablesUpsert($input: VariableCollectionUpsertInput!) {
          variableCollectionUpsert(input: $input)
        }
      `, {
        input: {
          serviceId: deploymentId,
          projectId,
          environmentId,
          variables: upserts,
        },
      });

      if (result.errors?.length) {
        throw new Error(`Railway env upsert failed: ${result.errors[0].message}`);
      }
    }

    if (skippedDeletes.length > 0) {
      logger.warn(
        `[Railway:updateEnvVars] Null deletes are not implemented; skipped ${skippedDeletes.join(', ')}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Poll the latest deployment on a service until it reaches a terminal state
   * or the timeout expires.
   */
  private async pollDeploymentStatus(serviceId: string, timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const result = await this.graphql(`
          query ServiceDeploymentStatus($id: String!) {
            service(id: $id) {
              deployments(first: 1) {
                edges {
                  node {
                    status
                  }
                }
              }
            }
          }
        `, { id: serviceId });

        const rawStatus = result?.data?.service?.deployments?.edges?.[0]?.node?.status;
        const mapped = STATUS_MAP[rawStatus] || 'deploying';

        if (mapped === 'running' || mapped === 'failed' || mapped === 'terminated') {
          return mapped;
        }
      } catch {
        // Transient error — keep polling
      }

      await this.sleep(POLL_INTERVAL_MS);
    }

    return 'deploying'; // Timed out but still deploying
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async graphql(query: string, variables: Record<string, any> = {}): Promise<any> {
    const res = await resilientFetch(RAILWAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Railway API error: ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);
    }
    return res.json();
  }
}
