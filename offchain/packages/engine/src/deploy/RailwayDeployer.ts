// offchain/packages/engine/src/deploy/RailwayDeployer.ts
// Railway.app deployer — creates services via Railway GraphQL API.
// Requires RAILWAY_API_TOKEN environment variable.

import { IDeployer, RuntimeArtifact, DeploymentConfig, DeploymentResult, DeploymentStatus, LogOptions } from './IDeployer';

const RAILWAY_API_URL = 'https://backboard.railway.app/graphql/v2';

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

      // Create service via Railway GraphQL API
      const createServiceResult = await this.graphql(`
        mutation ServiceCreate($input: ServiceCreateInput!) {
          serviceCreate(input: $input) {
            id
            name
          }
        }
      `, {
        input: {
          name: `agent-${passportId.substring(0, 20)}`,
          projectId,
        },
      });

      const serviceId = createServiceResult?.data?.serviceCreate?.id;
      if (!serviceId) {
        return {
          success: false,
          deployment_id: '',
          target: this.target,
          error: 'Failed to create Railway service',
        };
      }

      // Set environment variables
      const envVars = { ...artifact.env_vars, ...config.env_vars };
      for (const [key, value] of Object.entries(envVars)) {
        if (value) {
          await this.graphql(`
            mutation VariableUpsert($input: VariableUpsertInput!) {
              variableUpsert(input: $input)
            }
          `, {
            input: {
              serviceId,
              projectId,
              name: key,
              value,
            },
          });
        }
      }

      console.log(`[Deploy] Railway service created: ${serviceId}`);
      console.log(`[Deploy]   Deploy via: railway up --service ${serviceId}`);

      return {
        success: true,
        deployment_id: serviceId,
        target: this.target,
        metadata: { projectId, serviceId },
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
                  url
                }
              }
            }
          }
        }
      `, { id: deploymentId });

      const deployment = result?.data?.service?.deployments?.edges?.[0]?.node;
      const statusMap: Record<string, string> = {
        SUCCESS: 'running',
        BUILDING: 'deploying',
        DEPLOYING: 'deploying',
        FAILED: 'failed',
        CRASHED: 'failed',
        REMOVED: 'terminated',
      };

      return {
        deployment_id: deploymentId,
        status: (statusMap[deployment?.status] || 'stopped') as any,
        url: deployment?.url,
        health: deployment?.status === 'SUCCESS' ? 'healthy' : 'unknown',
        last_check: Date.now(),
      };
    } catch {
      return { deployment_id: deploymentId, status: 'failed', health: 'unknown' };
    }
  }

  async logs(deploymentId: string, options?: LogOptions): Promise<string> {
    try {
      const result = await this.graphql(`
        query DeploymentLogs($id: String!) {
          deploymentLogs(deploymentId: $id, limit: ${options?.tail || 100}) {
            message
            timestamp
          }
        }
      `, { id: deploymentId });

      const logs = result?.data?.deploymentLogs || [];
      return logs.map((l: any) => `[${l.timestamp}] ${l.message}`).join('\n');
    } catch {
      return `Failed to fetch logs for ${deploymentId}`;
    }
  }

  async terminate(deploymentId: string): Promise<void> {
    await this.graphql(`
      mutation ServiceDelete($id: String!) {
        serviceDelete(id: $id)
      }
    `, { id: deploymentId });
    console.log(`[Deploy] Railway service terminated: ${deploymentId}`);
  }

  async scale(deploymentId: string, replicas: number): Promise<void> {
    console.log(`[Deploy] Railway scaling for ${deploymentId} to ${replicas} (use Railway dashboard)`);
  }

  async isHealthy(): Promise<boolean> {
    return !!this.apiToken;
  }

  private async graphql(query: string, variables: Record<string, any> = {}): Promise<any> {
    const res = await fetch(RAILWAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Railway API error: ${res.status}`);
    return res.json();
  }
}
