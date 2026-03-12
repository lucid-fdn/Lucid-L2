// offchain/packages/engine/src/deploy/RailwayDeployer.ts
// Railway.app deployer — creates services via Railway GraphQL API with Docker image source.
// Requires RAILWAY_API_TOKEN and RAILWAY_PROJECT_ID environment variables.

import { IDeployer, RuntimeArtifact, DeploymentConfig, DeploymentResult, DeploymentStatus, LogOptions } from './IDeployer';
import { resilientFetch } from './resilientFetch';

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

  private apiToken: string;

  constructor() {
    this.apiToken = process.env.RAILWAY_API_TOKEN || '';
  }

  async deploy(artifact: RuntimeArtifact, config: DeploymentConfig, passportId: string): Promise<DeploymentResult> {
    if (!this.apiToken) {
      return {
        success: false,
        deployment_id: '',
        target: this.target,
        error: 'RAILWAY_API_TOKEN not set',
      };
    }

    try {
      const projectId = (config.target as any).project_id || process.env.RAILWAY_PROJECT_ID;
      if (!projectId) {
        return {
          success: false,
          deployment_id: '',
          target: this.target,
          error: 'Railway project_id required in deployment target config or RAILWAY_PROJECT_ID env var',
        };
      }

      // Resolve Docker image reference
      const imageRef = (config.target as any).image_ref
        || artifact.env_vars.AGENT_IMAGE_REF
        || (config.env_vars?.AGENT_IMAGE_REF);
      if (!imageRef) {
        return {
          success: false,
          deployment_id: '',
          target: this.target,
          error: 'Docker image reference required: set target.image_ref or AGENT_IMAGE_REF env var',
        };
      }

      const environmentId = (config.target as any).environment_id || process.env.RAILWAY_ENVIRONMENT_ID;

      // Create service with Docker image source
      const serviceName = `agent-${passportId.substring(0, 20)}`;
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
          source: { image: imageRef },
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

      // Set environment variables on the service
      const envVars = { ...artifact.env_vars, ...config.env_vars };
      // Remove AGENT_IMAGE_REF from env vars — it was used for the image source, not runtime
      delete envVars.AGENT_IMAGE_REF;

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
          console.warn(`[Deploy] Railway env var upsert warning: ${varResult.errors[0].message}`);
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
        console.warn(`[Deploy] Railway domain creation failed (non-fatal): ${domainErr}`);
      }

      console.log(`[Deploy] Railway service created: ${serviceId} (image: ${imageRef})`);
      if (url) {
        console.log(`[Deploy]   URL: ${url}`);
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
            deployments(first: 1, input: { status: { } }) {
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
        return { deployment_id: deploymentId, status: 'failed', error: result.errors[0].message };
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
    } catch {
      return { deployment_id: deploymentId, status: 'failed', health: 'unknown' };
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

    console.log(`[Deploy] Railway service terminated: ${deploymentId}`);
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
      console.warn(`[Deploy] Railway scaling via API failed: ${result.errors[0].message}. Use Railway dashboard.`);
    } else {
      console.log(`[Deploy] Railway service ${deploymentId} scaled to ${replicas} replicas`);
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
