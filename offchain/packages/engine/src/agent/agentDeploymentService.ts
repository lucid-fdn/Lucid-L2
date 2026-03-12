/**
 * Agent Deployment Service
 *
 * Core orchestrator that wires together the entire agent deployment pipeline:
 * schema validation -> runtime adapter -> deployer -> wallet -> passport -> NFT -> monitoring
 */

import { validateWithSchema } from '../crypto/schemaValidator';
import { getPassportManager } from '../passport/passportManager';
import type { CreatePassportInput } from '../passport/passportManager';
import {
  AgentDescriptor,
  AgentDeployment,
  DEFAULT_AGENT_CONFIG,
  DEFAULT_DEPLOYMENT_CONFIG,
  DEFAULT_COMPLIANCE,
  DeploymentStatus,
  HealthStatus,
} from './agentDescriptor';
import type { DeploymentResult as DeployerResult } from '../deploy/IDeployer';
import { getRuntimeAdapter, selectBestAdapter, listAdapterNames } from '../runtime';
import { getDeployer, listDeployerTargets } from '../deploy';
import { getAgentWalletProvider } from './wallet';
import { generateAgentCard } from './a2a/agentCard';
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
  private deployments = new Map<string, AgentDeployment>();

  /**
   * One-click agent deployment pipeline.
   *
   * Flow:
   * 1. Validate descriptor against schema
   * 2. Create agent passport
   * 3. Select runtime adapter -> generate code
   * 4. Create agent wallet (if enabled)
   * 5. Deploy to target infrastructure
   * 6. Configure A2A endpoint (if enabled)
   * 7. Create marketplace listing (if requested)
   * 8. Store deployment state
   */
  async deployAgent(input: DeployAgentInput): Promise<DeployAgentResult> {
    const startTime = Date.now();
    console.log(`[AgentDeploy] Starting deployment: ${input.name}`);

    // Step 1: Validate descriptor
    console.log(`[AgentDeploy] Step 1: Validating agent descriptor...`);
    const validation = validateWithSchema('AgentDescriptor', input.descriptor);
    if (!validation.ok) {
      console.error(`[AgentDeploy] Validation failed:`, validation.errors);
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

    // Step 2: Create agent passport
    console.log(`[AgentDeploy] Step 2: Creating agent passport...`);
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
      console.log(`[AgentDeploy] Passport created: ${passportId}`);
    } catch (error) {
      return {
        success: false,
        error: `Passport creation error: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }

    // Step 3: Select adapter and generate code
    console.log(`[AgentDeploy] Step 3: Generating agent code...`);
    let adapter;
    let artifact;
    try {
      adapter = input.preferred_adapter
        ? getRuntimeAdapter(input.preferred_adapter)
        : selectBestAdapter(input.descriptor);

      console.log(`[AgentDeploy]   Using adapter: ${adapter.name} (${adapter.language})`);
      artifact = await adapter.generate(input.descriptor, passportId);
      console.log(`[AgentDeploy] Generated ${artifact.files.size} files (entrypoint: ${artifact.entrypoint})`);
    } catch (error) {
      return {
        success: false,
        passport_id: passportId,
        error: `Code generation failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }

    // Step 4: Create agent wallet (if enabled)
    let walletAddress: string | undefined;
    if (input.descriptor.wallet_config?.enabled) {
      console.log(`[AgentDeploy] Step 4: Creating agent wallet...`);
      try {
        const walletProvider = getAgentWalletProvider();
        const wallet = await walletProvider.createWallet(passportId);
        walletAddress = wallet.address;
        console.log(`[AgentDeploy] Wallet created: ${walletAddress} (${wallet.provider})`);

        // Set spending limits if configured
        if (input.descriptor.wallet_config.spending_limits) {
          await walletProvider.setSpendingLimits(
            walletAddress,
            input.descriptor.wallet_config.spending_limits
          );
        }
      } catch (error) {
        console.warn(`[AgentDeploy] Wallet creation failed (non-blocking): ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    } else {
      console.log(`[AgentDeploy] Step 4: Wallet disabled, skipping...`);
    }

    // Step 5: Deploy to target
    console.log(`[AgentDeploy] Step 5: Deploying to ${input.descriptor.deployment_config.target.type}...`);
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
        return {
          success: false,
          passport_id: passportId,
          wallet_address: walletAddress,
          adapter_used: adapter.name,
          error: `Deployment failed: ${deployerResult.error}`,
        };
      }
      console.log(`[AgentDeploy] Deployed: ${deployerResult.deployment_id} -> ${deployerResult.url || 'pending'}`);
    } catch (error) {
      return {
        success: false,
        passport_id: passportId,
        wallet_address: walletAddress,
        adapter_used: adapter.name,
        error: `Deployment error: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }

    // Step 6: Configure A2A (if enabled)
    let a2aEndpoint: string | undefined;
    if (input.descriptor.agent_config.a2a_enabled && deployerResult.url) {
      console.log(`[AgentDeploy] Step 6: Configuring A2A protocol...`);
      a2aEndpoint = `${deployerResult.url}/.well-known/agent.json`;
      const agentCard = generateAgentCard(passportId, input.descriptor, deployerResult.url);
      console.log(`[AgentDeploy] A2A Agent Card ready at: ${a2aEndpoint}`);
      console.log(`[AgentDeploy]   Capabilities: ${agentCard.capabilities.join(', ') || 'general'}`);
    }

    // WIP: marketplace listing creation moved to _wip/ — needs DB persistence
    // Step 7 will be re-enabled when marketplace is backed by PostgreSQL

    // Step 7.5: Auto-launch share token (if configured)
    if (input.descriptor.monetization?.share_token?.auto_launch) {
      console.log(`[AgentDeploy] Step 7.5: Auto-launching share token...`);
      try {
        const { getTokenLauncher } = await import('../assets/shares');
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
        console.log(`[AgentDeploy] Share token launched: ${launchResult.mint} (${shareConfig.symbol})`);
      } catch (error) {
        console.warn(`[AgentDeploy] Share token launch failed (non-blocking): ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    // Step 7.6: Store deployment artifact on DePIN (if enabled)
    if (process.env.DEPIN_UPLOAD_ENABLED !== 'false') {
      try {
        const { getPermanentStorage } = await import('../storage/depin');
        const storage = getPermanentStorage();
        await storage.uploadJSON({
            passport_id: passportId,
            deployment_target: input.descriptor.deployment_config.target.type,
            deployment_url: deployerResult.url,
            adapter: adapter.name,
            deployed_at: new Date().toISOString(),
          }, { tags: { type: 'agent-deployment', passport_id: passportId } });
        console.log(`[AgentDeploy] Deployment artifact stored on DePIN`);
      } catch (error) {
        console.warn(`[AgentDeploy] DePIN storage failed (non-blocking): ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    // Step 8: Store deployment state
    const deployment: AgentDeployment = {
      id: deployerResult.deployment_id,
      agent_passport_id: passportId,
      tenant_id: input.owner,
      deployment_target: input.descriptor.deployment_config.target.type,
      deployment_id: deployerResult.deployment_id,
      status: 'running',
      runtime_adapter: adapter.name,
      wallet_address: walletAddress,
      a2a_endpoint: a2aEndpoint,
      health_status: 'unknown',
      config: input.descriptor,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    this.deployments.set(passportId, deployment);

    // Convert artifact files to plain object for response
    const filesObj: Record<string, string> = {};
    for (const [name, content] of artifact.files) {
      filesObj[name] = content;
    }

    const totalTime = Date.now() - startTime;
    console.log(`[AgentDeploy] Agent deployed successfully in ${totalTime}ms`);
    console.log(`[AgentDeploy]   Passport: ${passportId}`);
    console.log(`[AgentDeploy]   Adapter: ${adapter.name}`);
    console.log(`[AgentDeploy]   Target: ${input.descriptor.deployment_config.target.type}`);
    console.log(`[AgentDeploy]   URL: ${deployerResult.url || 'pending'}`);

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
   */
  async getDeployment(passportId: string): Promise<AgentDeployment | null> {
    return this.deployments.get(passportId) || null;
  }

  /**
   * List all deployments.
   */
  async listDeployments(filters?: {
    tenant_id?: string;
    status?: string;
    target?: string;
  }): Promise<AgentDeployment[]> {
    let items = Array.from(this.deployments.values());
    if (filters?.tenant_id) items = items.filter(d => d.tenant_id === filters.tenant_id);
    if (filters?.status) items = items.filter(d => d.status === filters.status);
    if (filters?.target) items = items.filter(d => d.deployment_target === filters.target);
    return items.sort((a, b) => b.created_at - a.created_at);
  }

  /**
   * Terminate a deployed agent.
   */
  async terminateAgent(passportId: string): Promise<{ success: boolean; error?: string }> {
    const deployment = this.deployments.get(passportId);
    if (!deployment) return { success: false, error: 'Deployment not found' };

    try {
      const deployer = getDeployer(deployment.deployment_target);
      if (deployment.deployment_id) {
        await deployer.terminate(deployment.deployment_id);
      }
      deployment.status = 'terminated';
      deployment.updated_at = Date.now();
      console.log(`[AgentDeploy] Agent terminated: ${passportId}`);
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
   */
  async getAgentStatus(passportId: string): Promise<{
    status: string;
    health: string;
    deployment_id?: string;
    url?: string;
  } | null> {
    const deployment = this.deployments.get(passportId);
    if (!deployment) return null;

    // Try to get live status from deployer
    if (deployment.deployment_id) {
      try {
        const deployer = getDeployer(deployment.deployment_target);
        const status = await deployer.status(deployment.deployment_id);
        deployment.health_status = (status.health || 'unknown') as HealthStatus;
        deployment.updated_at = Date.now();
        return {
          status: status.status,
          health: status.health || 'unknown',
          deployment_id: deployment.deployment_id,
          url: status.url,
        };
      } catch {
        // Fall through to cached status
      }
    }

    return {
      status: deployment.status,
      health: deployment.health_status,
      deployment_id: deployment.deployment_id,
    };
  }

  /**
   * Get deployment logs.
   */
  async getAgentLogs(passportId: string, tail?: number): Promise<string> {
    const deployment = this.deployments.get(passportId);
    if (!deployment || !deployment.deployment_id) return 'No deployment found';

    try {
      const deployer = getDeployer(deployment.deployment_target);
      return await deployer.logs(deployment.deployment_id, { tail });
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
}

// Singleton
let instance: AgentDeploymentService | null = null;
export function getAgentDeploymentService(): AgentDeploymentService {
  if (!instance) instance = new AgentDeploymentService();
  return instance;
}
export function resetAgentDeploymentService(): void { instance = null; }
