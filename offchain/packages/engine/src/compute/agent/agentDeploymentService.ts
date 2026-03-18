/**
 * Agent Deployment Service
 *
 * Core orchestrator that wires together the entire agent deployment pipeline:
 * schema validation -> runtime adapter -> deployer -> wallet -> passport -> NFT -> monitoring
 *
 * State is now durable via IDeploymentStore (Postgres/InMemory).
 * Deploy flow: create record in pending -> transition to deploying -> call provider -> running/failed.
 * Record exists BEFORE provider call for crash recovery.
 */

import { validateWithSchema } from '../../shared/crypto/schemaValidator';
import { getPassportManager } from '../../identity/passport/passportManager';
import type { CreatePassportInput } from '../../identity/passport/passportManager';
import {
  AgentDescriptor,
  AgentDeployment,
  DEFAULT_AGENT_CONFIG,
  DEFAULT_DEPLOYMENT_CONFIG,
  DEFAULT_COMPLIANCE,
  DeploymentStatus,
  HealthStatus as AgentHealthStatus,
} from './agentDescriptor';
import type { DeploymentResult as DeployerResult } from '../deploy/IDeployer';
import { getRuntimeAdapter, selectBestAdapter, listAdapterNames } from '../runtime';
import { getDeployer, listDeployerTargets } from '../deploy';
import { getAgentWalletProvider } from '../../identity/wallet';
import { generateAgentCard } from './a2a/agentCard';
import { logger } from '../../shared/lib/logger';
import { getDeploymentStore } from '../deployment/control-plane';
import type { IDeploymentStore } from '../deployment/control-plane/store';
import type { Deployment, ActualState } from '../deployment/control-plane/types';
// WIP: marketplace moved to _wip/ — needs DB persistence before ship
// import { getMarketplaceService } from './marketplace';

export interface DeployAgentInput {
  /** Agent name */
  name: string;
  /** Description */
  description?: string;
  /** Owner address (Solana base58 or EVM 0x) */
  owner: string;
  /** The Universal Agent Descriptor */
  descriptor: AgentDescriptor;
  /** Preferred runtime adapter (auto-select if omitted) */
  preferred_adapter?: string;
  /** Tags for discovery */
  tags?: string[];
  /** Create marketplace listing */
  list_on_marketplace?: boolean;
  /** Idempotency key to prevent duplicate deploys */
  idempotency_key?: string;
}

export interface DeployAgentResult {
  success: boolean;
  passport_id?: string;
  deployment_id?: string;
  deployment_url?: string;
  a2a_endpoint?: string;
  wallet_address?: string;
  nft_mint?: string;
  adapter_used?: string;
  target_used?: string;
  error?: string;
  files?: Record<string, string>;
}

export class AgentDeploymentService {
  /**
   * One-click agent deployment pipeline with durable state.
   *
   * Flow:
   * 1. Check idempotency (if key provided)
   * 2. Validate descriptor against schema
   * 3. Validate revenue splits
   * 4. Create agent passport
   * 5. Select runtime adapter -> generate code
   * 6. Create agent wallet (if enabled)
   * 7. CREATE deployment record in 'pending' state (record exists BEFORE provider call)
   * 8. Transition to 'deploying' + emit 'created' + 'started' events
   * 9. Call deployer.deploy() — the actual provider call
   * 10. On success: update provider resources, transition to 'running', emit 'succeeded' event
   * 11. On failure: transition to 'failed', emit 'failed' event
   * 12. A2A config, share token, DePIN anchor (existing logic, non-blocking)
   */
  async deployAgent(input: DeployAgentInput): Promise<DeployAgentResult> {
    const startTime = Date.now();
    const store = getDeploymentStore();
    logger.info(`[AgentDeploy] Starting deployment: ${input.name}`);

    // Step 1: Check idempotency
    if (input.idempotency_key) {
      const existing = await store.getByIdempotencyKey(input.idempotency_key);
      if (existing) {
        logger.info(`[AgentDeploy] Idempotent hit for key=${input.idempotency_key}, returning existing deployment`);
        return {
          success: true,
          passport_id: existing.agent_passport_id,
          deployment_id: existing.provider_deployment_id || existing.deployment_id,
          deployment_url: existing.deployment_url || undefined,
          a2a_endpoint: existing.a2a_endpoint || undefined,
          wallet_address: existing.wallet_address || undefined,
          adapter_used: existing.runtime_adapter,
          target_used: existing.provider,
        };
      }
    }

    // Step 2: Validate descriptor
    logger.info(`[AgentDeploy] Step 1: Validating agent descriptor...`);
    const validation = validateWithSchema('AgentDescriptor', input.descriptor);
    if (!validation.ok) {
      logger.error(`[AgentDeploy] Validation failed:`, validation.errors);
      return {
        success: false,
        error: `Descriptor validation failed: ${JSON.stringify(validation.errors)}`,
      };
    }

    // Revenue split cross-field validation
    const split = input.descriptor.monetization?.revenue_split;
    if (split) {
      const total = (split.creator || 0) + (split.compute || 0) + (split.protocol || 0);
      if (total > 100) {
        return {
          success: false,
          error: `Revenue split total (${total}%) exceeds 100%`,
        };
      }
    }

    // Step 3: Create agent passport
    logger.info(`[AgentDeploy] Step 2: Creating agent passport...`);
    let passportId: string;
    try {
      const pm = getPassportManager();
      const passportInput: CreatePassportInput = {
        type: 'agent',
        owner: input.owner,
        metadata: input.descriptor,
        name: input.name,
        description: input.description || input.descriptor.agent_config.system_prompt.substring(0, 200),
        version: '1.0.0',
        tags: input.tags || ['agent'],
      };
      const result = await pm.createPassport(passportInput);
      if (!result.ok || !result.data) {
        return { success: false, error: `Passport creation failed: ${result.error}` };
      }
      passportId = result.data.passport_id;
      logger.info(`[AgentDeploy] Passport created: ${passportId}`);
    } catch (error) {
      return {
        success: false,
        error: `Passport creation error: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }

    // Step 4: Select adapter and generate code
    logger.info(`[AgentDeploy] Step 3: Generating agent code...`);
    let adapter;
    let artifact;
    try {
      adapter = input.preferred_adapter
        ? getRuntimeAdapter(input.preferred_adapter)
        : selectBestAdapter(input.descriptor);

      logger.info(`[AgentDeploy]   Using adapter: ${adapter.name} (${adapter.language})`);
      artifact = await adapter.generate(input.descriptor, passportId);
      logger.info(`[AgentDeploy] Generated ${artifact.files.size} files (entrypoint: ${artifact.entrypoint})`);
    } catch (error) {
      return {
        success: false,
        passport_id: passportId,
        error: `Code generation failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }

    // Step 5: Create agent wallet (if enabled)
    let walletAddress: string | undefined;
    if (input.descriptor.wallet_config?.enabled) {
      logger.info(`[AgentDeploy] Step 4: Creating agent wallet...`);
      try {
        const walletProvider = getAgentWalletProvider();
        const wallet = await walletProvider.createWallet(passportId);
        walletAddress = wallet.address;
        logger.info(`[AgentDeploy] Wallet created: ${walletAddress} (${wallet.provider})`);

        // Set spending limits if configured
        if (input.descriptor.wallet_config.spending_limits) {
          await walletProvider.setSpendingLimits(
            walletAddress,
            input.descriptor.wallet_config.spending_limits
          );
        }
      } catch (error) {
        logger.warn(`[AgentDeploy] Wallet creation failed (non-blocking): ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    } else {
      logger.info(`[AgentDeploy] Step 4: Wallet disabled, skipping...`);
    }

    // Step 6: Create deployment record in 'pending' state
    logger.info(`[AgentDeploy] Step 5: Creating durable deployment record...`);
    let deployment: Deployment;
    try {
      deployment = await store.create({
        agent_passport_id: passportId,
        tenant_id: input.owner,
        provider: input.descriptor.deployment_config.target.type,
        runtime_adapter: adapter.name,
        descriptor_snapshot: input.descriptor as unknown as Record<string, unknown>,
        created_by: 'system',
        idempotency_key: input.idempotency_key,
      });
      logger.info(`[AgentDeploy] Deployment record created: ${deployment.deployment_id} (pending)`);
    } catch (error) {
      return {
        success: false,
        passport_id: passportId,
        adapter_used: adapter.name,
        error: `Deployment record creation failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }

    // Step 7: Transition to 'deploying' + emit 'created' and 'started' events
    try {
      deployment = await store.transition(deployment.deployment_id, 'deploying', deployment.version, {
        actor: 'system',
      });

      // Emit created event
      await store.appendEvent({
        deployment_id: deployment.deployment_id,
        event_type: 'created',
        actor: 'system',
        previous_state: 'pending',
        new_state: 'deploying',
        metadata: {
          passport_id: passportId,
          provider: input.descriptor.deployment_config.target.type,
          adapter: adapter.name,
        },
      });

      // Emit started event
      await store.appendEvent({
        deployment_id: deployment.deployment_id,
        event_type: 'started',
        actor: 'system',
        previous_state: 'pending',
        new_state: 'deploying',
      });
    } catch (error) {
      logger.error(`[AgentDeploy] Failed to transition to deploying: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    // Step 8: Deploy to target (the actual provider call)
    logger.info(`[AgentDeploy] Step 6: Deploying to ${input.descriptor.deployment_config.target.type}...`);
    let deployerResult: DeployerResult;
    try {
      const deployer = getDeployer(input.descriptor.deployment_config.target.type);

      // Inject wallet address and passport ID into env vars
      const enrichedConfig = { ...input.descriptor.deployment_config };
      enrichedConfig.env_vars = {
        ...enrichedConfig.env_vars,
        AGENT_PASSPORT_ID: passportId,
        ...(walletAddress ? { AGENT_WALLET_ADDRESS: walletAddress } : {}),
      };

      deployerResult = await deployer.deploy(artifact, enrichedConfig, passportId);

      if (!deployerResult.success) {
        // Transition to failed + emit failed event
        try {
          const freshDeploy = await store.getById(deployment.deployment_id);
          if (freshDeploy) {
            await store.transition(freshDeploy.deployment_id, 'failed', freshDeploy.version, {
              actor: 'system',
              error: `Deployment failed: ${deployerResult.error}`,
            });
            await store.appendEvent({
              deployment_id: deployment.deployment_id,
              event_type: 'failed',
              actor: 'system',
              previous_state: 'deploying',
              new_state: 'failed',
              metadata: { error: deployerResult.error },
            });
          }
        } catch (transErr) {
          logger.error(`[AgentDeploy] Failed to record failure state: ${transErr instanceof Error ? transErr.message : 'Unknown'}`);
        }

        return {
          success: false,
          passport_id: passportId,
          wallet_address: walletAddress,
          adapter_used: adapter.name,
          error: `Deployment failed: ${deployerResult.error}`,
        };
      }
      logger.info(`[AgentDeploy] Deployed: ${deployerResult.deployment_id} -> ${deployerResult.url || 'pending'}`);
    } catch (error) {
      // Transition to failed + emit failed event
      try {
        const freshDeploy = await store.getById(deployment.deployment_id);
        if (freshDeploy) {
          await store.transition(freshDeploy.deployment_id, 'failed', freshDeploy.version, {
            actor: 'system',
            error: `Deployment error: ${error instanceof Error ? error.message : 'Unknown'}`,
          });
          await store.appendEvent({
            deployment_id: deployment.deployment_id,
            event_type: 'failed',
            actor: 'system',
            previous_state: 'deploying',
            new_state: 'failed',
            metadata: { error: error instanceof Error ? error.message : 'Unknown' },
          });
        }
      } catch (transErr) {
        logger.error(`[AgentDeploy] Failed to record failure state: ${transErr instanceof Error ? transErr.message : 'Unknown'}`);
      }

      return {
        success: false,
        passport_id: passportId,
        wallet_address: walletAddress,
        adapter_used: adapter.name,
        error: `Deployment error: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }

    // Step 9: Update provider resources + transition to 'running' + emit 'succeeded' event
    try {
      await store.updateProviderResources(deployment.deployment_id, {
        provider_deployment_id: deployerResult.deployment_id,
        deployment_url: deployerResult.url,
        wallet_address: walletAddress,
      });

      // Re-read to get fresh version after updateProviderResources
      const freshDeploy = await store.getById(deployment.deployment_id);
      if (freshDeploy) {
        deployment = await store.transition(freshDeploy.deployment_id, 'running', freshDeploy.version, {
          actor: 'system',
        });
      }

      await store.appendEvent({
        deployment_id: deployment.deployment_id,
        event_type: 'succeeded',
        actor: 'system',
        previous_state: 'deploying',
        new_state: 'running',
        metadata: {
          provider_deployment_id: deployerResult.deployment_id,
          url: deployerResult.url,
        },
      });
    } catch (transErr) {
      logger.error(`[AgentDeploy] Failed to transition to running: ${transErr instanceof Error ? transErr.message : 'Unknown'}`);
    }

    // Step 10: Configure A2A (if enabled)
    let a2aEndpoint: string | undefined;
    if (input.descriptor.agent_config.a2a_enabled && deployerResult.url) {
      logger.info(`[AgentDeploy] Step 7: Configuring A2A protocol...`);
      a2aEndpoint = `${deployerResult.url}/.well-known/agent.json`;
      const agentCard = generateAgentCard(passportId, input.descriptor, deployerResult.url);
      logger.info(`[AgentDeploy] A2A Agent Card ready at: ${a2aEndpoint}`);
      logger.info(`[AgentDeploy]   Capabilities: ${agentCard.capabilities.join(', ') || 'general'}`);

      // Update a2a_endpoint in store
      try {
        await store.updateProviderResources(deployment.deployment_id, {
          a2a_endpoint: a2aEndpoint,
        });
      } catch { /* non-blocking */ }
    }

    // WIP: marketplace listing creation moved to _wip/ — needs DB persistence
    // Step 7 will be re-enabled when marketplace is backed by PostgreSQL

    // Step 11: Auto-launch share token (if configured)
    if (input.descriptor.monetization?.share_token?.auto_launch) {
      logger.info(`[AgentDeploy] Step 7.5: Auto-launching share token...`);
      try {
        const { getTokenLauncher } = await import('../../identity/shares');
        const launcher = getTokenLauncher();
        const shareConfig = input.descriptor.monetization.share_token;
        const launchResult = await launcher.launchToken({
          passportId,
          name: `${input.name} Share`,
          symbol: shareConfig.symbol,
          uri: '', // Metadata URI set later
          totalSupply: shareConfig.total_supply,
          decimals: 6,
          owner: input.owner,
        });
        // Store mint address in monetization config for downstream use
        input.descriptor.monetization.share_token_mint = launchResult.mint;
        logger.info(`[AgentDeploy] Share token launched: ${launchResult.mint} (${shareConfig.symbol})`);
      } catch (error) {
        logger.warn(`[AgentDeploy] Share token launch failed (non-blocking): ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    // Step 12: Store deployment artifact on DePIN (if enabled)
    try {
      const { getAnchorDispatcher } = await import('../../anchoring');
      await getAnchorDispatcher().dispatch({
        artifact_type: 'deploy_artifact',
        artifact_id: `${passportId}:${input.descriptor.deployment_config.target.type}`,
        agent_passport_id: passportId,
        producer: 'agentDeploymentService',
        storage_tier: 'permanent',
        payload: {
          passport_id: passportId,
          deployment_target: input.descriptor.deployment_config.target.type,
          deployment_url: deployerResult.url,
          adapter: adapter.name,
          deployed_at: new Date().toISOString(),
        },
        tags: { type: 'agent-deployment', passport_id: passportId },
      });
      logger.info(`[AgentDeploy] Deployment artifact stored on DePIN`);
    } catch (depinErr) {
      logger.warn(`[AgentDeploy] DePIN artifact upload failed: ${depinErr instanceof Error ? depinErr.message : 'Unknown'}`);
    }

    // Convert artifact files to plain object for response
    const filesObj: Record<string, string> = {};
    for (const [name, content] of artifact.files) {
      filesObj[name] = content;
    }

    const totalTime = Date.now() - startTime;
    logger.info(`[AgentDeploy] Agent deployed successfully in ${totalTime}ms`);
    logger.info(`[AgentDeploy]   Passport: ${passportId}`);
    logger.info(`[AgentDeploy]   Adapter: ${adapter.name}`);
    logger.info(`[AgentDeploy]   Target: ${input.descriptor.deployment_config.target.type}`);
    logger.info(`[AgentDeploy]   URL: ${deployerResult.url || 'pending'}`);

    return {
      success: true,
      passport_id: passportId,
      deployment_id: deployerResult.deployment_id,
      deployment_url: deployerResult.url,
      a2a_endpoint: a2aEndpoint,
      wallet_address: walletAddress,
      adapter_used: adapter.name,
      target_used: input.descriptor.deployment_config.target.type,
      files: filesObj,
    };
  }

  /**
   * Get deployment state for an agent.
   * Returns the active (non-terminated, non-failed) deployment from the store,
   * converted to AgentDeployment for backward compatibility.
   */
  async getDeployment(passportId: string): Promise<AgentDeployment | null> {
    const store = getDeploymentStore();
    const deployment = await store.getActiveByAgent(passportId);
    if (!deployment) return null;
    return this.toAgentDeployment(deployment);
  }

  /**
   * List all deployments.
   * Delegates to IDeploymentStore with filter mapping for backward compat.
   */
  async listDeployments(filters?: {
    tenant_id?: string;
    status?: string;
    target?: string;
  }): Promise<AgentDeployment[]> {
    const store = getDeploymentStore();
    const deployments = await store.list({
      tenant_id: filters?.tenant_id,
      actual_state: filters?.status as ActualState | undefined,
      provider: filters?.target,
      order_by: 'created_at',
      order_dir: 'desc',
    });
    return deployments.map(d => this.toAgentDeployment(d));
  }

  /**
   * Terminate a deployed agent.
   * Calls provider terminate, then transitions to 'terminated' in the store.
   */
  async terminateAgent(passportId: string): Promise<{ success: boolean; error?: string }> {
    const store = getDeploymentStore();
    const deployment = await store.getActiveByAgent(passportId);
    if (!deployment) return { success: false, error: 'Deployment not found' };

    try {
      const deployer = getDeployer(deployment.provider);
      if (deployment.provider_deployment_id) {
        await deployer.terminate(deployment.provider_deployment_id);
      }

      // Transition to terminated + emit event
      const previousState = deployment.actual_state;
      await store.transition(deployment.deployment_id, 'terminated', deployment.version, {
        actor: 'user',
        terminatedReason: 'user_request',
      });
      await store.appendEvent({
        deployment_id: deployment.deployment_id,
        event_type: 'terminated',
        actor: 'user',
        previous_state: previousState,
        new_state: 'terminated',
        metadata: { terminated_reason: 'user_request' },
      });

      logger.info(`[AgentDeploy] Agent terminated: ${passportId}`);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get deployment health/status.
   * Reads from durable store, optionally refreshes from deployer.
   */
  async getAgentStatus(passportId: string): Promise<{
    status: string;
    health: string;
    deployment_id?: string;
    url?: string;
  } | null> {
    const store = getDeploymentStore();
    const deployment = await store.getActiveByAgent(passportId);
    if (!deployment) return null;

    // Try to get live status from deployer
    if (deployment.provider_deployment_id) {
      try {
        const deployer = getDeployer(deployment.provider);
        const status = await deployer.status(deployment.provider_deployment_id);

        // Update health in store (non-blocking)
        try {
          await store.updateHealth(
            deployment.deployment_id,
            (status.health || 'unknown') as any,
            Date.now(),
          );
        } catch { /* non-blocking */ }

        return {
          status: status.status,
          health: status.health || 'unknown',
          deployment_id: deployment.provider_deployment_id,
          url: status.url,
        };
      } catch {
        // Fall through to cached status
      }
    }

    return {
      status: deployment.actual_state,
      health: deployment.health_status,
      deployment_id: deployment.provider_deployment_id || undefined,
      url: deployment.deployment_url || undefined,
    };
  }

  /**
   * Get deployment logs.
   */
  async getAgentLogs(passportId: string, tail?: number): Promise<string> {
    const store = getDeploymentStore();
    const deployment = await store.getActiveByAgent(passportId);
    if (!deployment || !deployment.provider_deployment_id) return 'No deployment found';

    try {
      const deployer = getDeployer(deployment.provider);
      return await deployer.logs(deployment.provider_deployment_id, { tail });
    } catch (error) {
      return `Failed to fetch logs: ${error instanceof Error ? error.message : 'Unknown'}`;
    }
  }

  /**
   * Preview: generate code without deploying.
   */
  async previewAgent(input: DeployAgentInput): Promise<{
    adapter: string;
    files: Record<string, string>;
    entrypoint: string;
    dependencies: Record<string, string>;
  }> {
    const adapter = input.preferred_adapter
      ? getRuntimeAdapter(input.preferred_adapter)
      : selectBestAdapter(input.descriptor);

    const artifact = await adapter.generate(input.descriptor, `preview_${Date.now()}`);
    const filesObj: Record<string, string> = {};
    for (const [name, content] of artifact.files) {
      filesObj[name] = content;
    }

    return {
      adapter: adapter.name,
      files: filesObj,
      entrypoint: artifact.entrypoint,
      dependencies: artifact.dependencies,
    };
  }

  /**
   * List available adapters and deployers.
   */
  getCapabilities(): {
    adapters: string[];
    deployers: string[];
  } {
    return {
      adapters: listAdapterNames(),
      deployers: listDeployerTargets(),
    };
  }

  /**
   * Convert a Deployment (control plane type) to AgentDeployment (legacy type)
   * for backward compatibility with existing routes and consumers.
   */
  private toAgentDeployment(d: Deployment): AgentDeployment {
    return {
      id: d.provider_deployment_id || d.deployment_id,
      agent_passport_id: d.agent_passport_id,
      tenant_id: d.tenant_id || '',
      deployment_target: d.provider,
      deployment_id: d.provider_deployment_id || undefined,
      status: d.actual_state as DeploymentStatus,
      runtime_adapter: d.runtime_adapter,
      wallet_address: d.wallet_address || undefined,
      a2a_endpoint: d.a2a_endpoint || undefined,
      health_status: d.health_status as AgentHealthStatus,
      last_health_check: d.last_health_at || undefined,
      config: d.descriptor_snapshot as unknown as AgentDescriptor,
      created_at: d.created_at,
      updated_at: d.updated_at,
    };
  }
}

// Singleton
let instance: AgentDeploymentService | null = null;
export function getAgentDeploymentService(): AgentDeploymentService {
  if (!instance) instance = new AgentDeploymentService();
  return instance;
}
export function resetAgentDeploymentService(): void { instance = null; }
