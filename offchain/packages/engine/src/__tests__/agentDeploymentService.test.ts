/**
 * AgentDeploymentService — Comprehensive Tests (Core Orchestrator)
 *
 * Tests the full deployment pipeline end-to-end with mocked dependencies:
 * - deployAgent(): schema validation -> passport -> adapter -> wallet -> deployer -> A2A -> marketplace
 * - previewAgent(): code gen without deploying
 * - getCapabilities(): list adapters and deployers
 * - listDeployments(), getDeployment(): deployment state management
 * - terminateAgent(): graceful termination
 * - Error cases: invalid descriptor, missing adapter, failed deployment, etc.
 */

import {
  AgentDeploymentService,
  resetAgentDeploymentService,
} from '../agent/agentDeploymentService';
import type { DeployAgentInput } from '../agent/agentDeploymentService';
import type { AgentDescriptor } from '../agent/agentDescriptor';

// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

// Mock schemaValidator
jest.mock('../crypto/schemaValidator', () => ({
  validateWithSchema: jest.fn(),
}));

// Mock passportManager
jest.mock('../passport/passportManager', () => ({
  getPassportManager: jest.fn(),
}));

// Mock runtime adapters
jest.mock('../runtime', () => ({
  getRuntimeAdapter: jest.fn(),
  selectBestAdapter: jest.fn(),
  listAdapterNames: jest.fn(() => ['vercel-ai', 'openclaw', 'docker']),
}));

// Mock deployers
jest.mock('../deploy', () => ({
  getDeployer: jest.fn(),
  listDeployerTargets: jest.fn(() => ['docker', 'railway']),
}));

// Mock wallet
jest.mock('../agent/wallet', () => ({
  getAgentWalletProvider: jest.fn(),
}));

// Mock A2A
jest.mock('../agent/a2a/agentCard', () => ({
  generateAgentCard: jest.fn(() => ({
    name: 'test-agent',
    capabilities: ['research'],
  })),
}));

// Mock marketplace
jest.mock('../agent/marketplace', () => ({
  getMarketplaceService: jest.fn(),
}));

// Import mocked modules
import { validateWithSchema } from '../crypto/schemaValidator';
import { getPassportManager } from '../passport/passportManager';
import { getRuntimeAdapter, selectBestAdapter, listAdapterNames } from '../runtime';
import { getDeployer, listDeployerTargets } from '../deploy';
import { getAgentWalletProvider } from '../agent/wallet';
import { generateAgentCard } from '../agent/a2a/agentCard';
import { getMarketplaceService } from '../agent/marketplace';

const mockedValidate = validateWithSchema as jest.Mock;
const mockedGetPassportManager = getPassportManager as jest.Mock;
const mockedGetRuntimeAdapter = getRuntimeAdapter as jest.Mock;
const mockedSelectBestAdapter = selectBestAdapter as jest.Mock;
const mockedGetDeployer = getDeployer as jest.Mock;
const mockedGetAgentWalletProvider = getAgentWalletProvider as jest.Mock;
const mockedGetMarketplaceService = getMarketplaceService as jest.Mock;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function makeDescriptor(overrides: Partial<AgentDescriptor> = {}): AgentDescriptor {
  return {
    agent_config: {
      system_prompt: 'You are a helpful agent.',
      model_passport_id: 'passport_model_abc',
      tool_passport_ids: [],
      skill_slugs: [],
      mcp_servers: [],
      autonomy_level: 'supervised',
      stop_conditions: [],
      guardrails: [],
      memory_enabled: false,
      memory_provider: 'supabase',
      memory_window_size: 10,
      workflow_type: 'single',
      channels: [],
      a2a_enabled: false,
    },
    deployment_config: {
      target: { type: 'docker' },
      restart_policy: 'on_failure',
    },
    ...overrides,
  };
}

function makeInput(overrides?: Partial<DeployAgentInput>): DeployAgentInput {
  return {
    name: 'Test Agent',
    description: 'A test agent',
    owner: 'owner_sol_address',
    descriptor: makeDescriptor(),
    ...overrides,
  };
}

function createMockArtifact() {
  const files = new Map<string, string>();
  files.set('agent.ts', 'console.log("agent");');
  files.set('Dockerfile', 'FROM node:20-slim');
  return {
    adapter: 'vercel-ai',
    files,
    entrypoint: 'agent.ts',
    dependencies: { tsx: '^4.0.0' },
    env_vars: { PORT: '3100' },
    dockerfile: 'FROM node:20-slim',
  };
}

// ---------------------------------------------------------------------------
// Default mock implementations
// ---------------------------------------------------------------------------

function setupDefaultMocks() {
  // Validation succeeds
  mockedValidate.mockReturnValue({ ok: true, value: {} });

  // Passport creation succeeds
  mockedGetPassportManager.mockReturnValue({
    createPassport: jest.fn().mockResolvedValue({
      ok: true,
      data: { passport_id: 'passport_new_agent_123' },
    }),
  });

  // Runtime adapter
  const mockAdapter = {
    name: 'vercel-ai',
    version: '1.0.0',
    language: 'typescript',
    canHandle: jest.fn(() => true),
    generate: jest.fn().mockResolvedValue(createMockArtifact()),
  };
  mockedSelectBestAdapter.mockReturnValue(mockAdapter);
  mockedGetRuntimeAdapter.mockReturnValue(mockAdapter);

  // Deployer
  const mockDeployer = {
    target: 'docker',
    description: 'Docker deployer',
    deploy: jest.fn().mockResolvedValue({
      success: true,
      deployment_id: 'deploy_abc123',
      target: 'docker',
      url: 'http://localhost:3100',
    }),
    status: jest.fn().mockResolvedValue({
      deployment_id: 'deploy_abc123',
      status: 'running',
      health: 'healthy',
      url: 'http://localhost:3100',
    }),
    logs: jest.fn().mockResolvedValue('Agent started'),
    terminate: jest.fn().mockResolvedValue(undefined),
    scale: jest.fn().mockResolvedValue(undefined),
    isHealthy: jest.fn().mockResolvedValue(true),
  };
  mockedGetDeployer.mockReturnValue(mockDeployer);

  // Wallet provider
  const mockWallet = {
    providerName: 'mock',
    chain: 'mock',
    createWallet: jest.fn().mockResolvedValue({
      address: 'mock_wallet_addr',
      chain: 'mock',
      provider: 'mock',
      agent_passport_id: 'passport_new_agent_123',
      created_at: Date.now(),
    }),
    setSpendingLimits: jest.fn().mockResolvedValue(undefined),
  };
  mockedGetAgentWalletProvider.mockReturnValue(mockWallet);

  // Marketplace
  mockedGetMarketplaceService.mockReturnValue({
    createListing: jest.fn().mockResolvedValue({ id: 'listing_1' }),
  });

  return { mockAdapter, mockDeployer, mockWallet };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('AgentDeploymentService', () => {
  let service: AgentDeploymentService;

  beforeEach(() => {
    resetAgentDeploymentService();
    service = new AgentDeploymentService();
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // deployAgent — Happy Path
  // -------------------------------------------------------------------------

  describe('deployAgent — Happy Path', () => {
    it('should successfully deploy an agent through the full pipeline', async () => {
      const { mockAdapter, mockDeployer } = setupDefaultMocks();

      const result = await service.deployAgent(makeInput());

      expect(result.success).toBe(true);
      expect(result.passport_id).toBe('passport_new_agent_123');
      expect(result.deployment_id).toBe('deploy_abc123');
      expect(result.deployment_url).toBe('http://localhost:3100');
      expect(result.adapter_used).toBe('vercel-ai');
      expect(result.target_used).toBe('docker');
      expect(result.files).toBeDefined();
      expect(result.files!['agent.ts']).toBeTruthy();
    });

    it('should validate the descriptor as the first step', async () => {
      setupDefaultMocks();
      await service.deployAgent(makeInput());
      expect(mockedValidate).toHaveBeenCalledWith('AgentDescriptor', expect.any(Object));
    });

    it('should create a passport with correct input', async () => {
      setupDefaultMocks();
      const pm = mockedGetPassportManager();
      await service.deployAgent(makeInput({ name: 'MyAgent', tags: ['ai', 'research'] }));
      expect(pm.createPassport).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent',
          name: 'MyAgent',
          tags: ['ai', 'research'],
        }),
      );
    });

    it('should auto-select adapter when preferred_adapter is not specified', async () => {
      setupDefaultMocks();
      await service.deployAgent(makeInput());
      expect(mockedSelectBestAdapter).toHaveBeenCalled();
    });

    it('should use preferred_adapter when specified', async () => {
      setupDefaultMocks();
      await service.deployAgent(makeInput({ preferred_adapter: 'crewai' }));
      expect(mockedGetRuntimeAdapter).toHaveBeenCalledWith('crewai');
    });

    it('should create wallet when wallet_config.enabled is true', async () => {
      const { mockWallet } = setupDefaultMocks();
      const descriptor = makeDescriptor({
        wallet_config: {
          enabled: true,
          provider: 'crossmint',
          chains: ['solana-devnet'],
          spending_limits: { per_tx_usd: 1.0, daily_usd: 10.0 },
        },
      });

      const result = await service.deployAgent(makeInput({ descriptor }));
      expect(result.wallet_address).toBe('mock_wallet_addr');
      expect(mockWallet.createWallet).toHaveBeenCalled();
      expect(mockWallet.setSpendingLimits).toHaveBeenCalledWith(
        'mock_wallet_addr',
        { per_tx_usd: 1.0, daily_usd: 10.0 },
      );
    });

    it('should skip wallet when wallet_config.enabled is false', async () => {
      const { mockWallet } = setupDefaultMocks();
      const result = await service.deployAgent(makeInput());
      expect(result.wallet_address).toBeUndefined();
      expect(mockWallet.createWallet).not.toHaveBeenCalled();
    });

    it('should configure A2A endpoint when a2a_enabled is true', async () => {
      setupDefaultMocks();
      const descriptor = makeDescriptor();
      descriptor.agent_config.a2a_enabled = true;
      descriptor.agent_config.a2a_capabilities = ['research'];

      const result = await service.deployAgent(makeInput({ descriptor }));
      expect(result.a2a_endpoint).toContain('.well-known/agent.json');
      expect(generateAgentCard).toHaveBeenCalled();
    });

    it('should skip A2A when a2a_enabled is false', async () => {
      setupDefaultMocks();
      const result = await service.deployAgent(makeInput());
      expect(result.a2a_endpoint).toBeUndefined();
    });

    it('should create marketplace listing when list_on_marketplace and monetization.enabled', async () => {
      setupDefaultMocks();
      const marketplace = mockedGetMarketplaceService();
      const descriptor = makeDescriptor({
        monetization: {
          enabled: true,
          pricing_model: 'per_call',
          price_per_call_usd: 0.01,
        },
      });

      await service.deployAgent(makeInput({
        descriptor,
        list_on_marketplace: true,
        tags: ['research'],
      }));

      expect(marketplace.createListing).toHaveBeenCalledWith(
        'passport_new_agent_123',
        expect.objectContaining({
          listing_type: 'per_call',
          price_per_call_usd: 0.01,
        }),
      );
    });

    it('should store deployment state in internal map', async () => {
      setupDefaultMocks();
      await service.deployAgent(makeInput());

      const deployment = await service.getDeployment('passport_new_agent_123');
      expect(deployment).not.toBeNull();
      expect(deployment!.status).toBe('running');
      expect(deployment!.runtime_adapter).toBe('vercel-ai');
      expect(deployment!.deployment_target).toBe('docker');
    });

    it('should inject AGENT_PASSPORT_ID and AGENT_WALLET_ADDRESS into deployer env vars', async () => {
      const { mockDeployer } = setupDefaultMocks();
      const descriptor = makeDescriptor({
        wallet_config: {
          enabled: true,
          chains: ['solana-devnet'],
        },
      });

      await service.deployAgent(makeInput({ descriptor }));

      const deployCall = mockDeployer.deploy.mock.calls[0];
      const config = deployCall[1]; // DeploymentConfig
      expect(config.env_vars.AGENT_PASSPORT_ID).toBe('passport_new_agent_123');
      expect(config.env_vars.AGENT_WALLET_ADDRESS).toBe('mock_wallet_addr');
    });
  });

  // -------------------------------------------------------------------------
  // deployAgent — Error Cases
  // -------------------------------------------------------------------------

  describe('deployAgent — Error Cases', () => {
    it('should return error when descriptor validation fails', async () => {
      mockedValidate.mockReturnValue({
        ok: false,
        errors: [{ message: 'Missing system_prompt' }],
      });

      const result = await service.deployAgent(makeInput());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Descriptor validation failed');
    });

    it('should return error when passport creation fails', async () => {
      mockedValidate.mockReturnValue({ ok: true });
      mockedGetPassportManager.mockReturnValue({
        createPassport: jest.fn().mockResolvedValue({
          ok: false,
          error: 'Database connection failed',
        }),
      });

      const result = await service.deployAgent(makeInput());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Passport creation failed');
    });

    it('should return error when passport creation throws', async () => {
      mockedValidate.mockReturnValue({ ok: true });
      mockedGetPassportManager.mockReturnValue({
        createPassport: jest.fn().mockRejectedValue(new Error('DB timeout')),
      });

      const result = await service.deployAgent(makeInput());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Passport creation error');
      expect(result.error).toContain('DB timeout');
    });

    it('should return error when runtime adapter throws', async () => {
      mockedValidate.mockReturnValue({ ok: true });
      mockedGetPassportManager.mockReturnValue({
        createPassport: jest.fn().mockResolvedValue({
          ok: true,
          data: { passport_id: 'p_123' },
        }),
      });
      mockedSelectBestAdapter.mockImplementation(() => {
        throw new Error('No compatible adapter found');
      });

      const result = await service.deployAgent(makeInput());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Code generation failed');
      expect(result.passport_id).toBe('p_123');
    });

    it('should return error when deployer returns failure', async () => {
      setupDefaultMocks();
      mockedGetDeployer.mockReturnValue({
        target: 'docker',
        deploy: jest.fn().mockResolvedValue({
          success: false,
          deployment_id: 'deploy_fail',
          target: 'docker',
          error: 'Out of disk space',
        }),
      });

      const result = await service.deployAgent(makeInput());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Deployment failed');
      expect(result.error).toContain('Out of disk space');
      expect(result.passport_id).toBeTruthy();
      expect(result.adapter_used).toBe('vercel-ai');
    });

    it('should return error when deployer throws exception', async () => {
      setupDefaultMocks();
      mockedGetDeployer.mockReturnValue({
        target: 'docker',
        deploy: jest.fn().mockRejectedValue(new Error('Network failure')),
      });

      const result = await service.deployAgent(makeInput());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Deployment error');
      expect(result.error).toContain('Network failure');
    });

    it('should continue (non-blocking) when wallet creation fails', async () => {
      setupDefaultMocks();
      mockedGetAgentWalletProvider.mockReturnValue({
        createWallet: jest.fn().mockRejectedValue(new Error('API key expired')),
      });

      const descriptor = makeDescriptor({
        wallet_config: { enabled: true, chains: ['solana-devnet'] },
      });

      const result = await service.deployAgent(makeInput({ descriptor }));
      expect(result.success).toBe(true);
      expect(result.wallet_address).toBeUndefined();
    });

    it('should continue (non-blocking) when marketplace listing fails', async () => {
      setupDefaultMocks();
      mockedGetMarketplaceService.mockReturnValue({
        createListing: jest.fn().mockRejectedValue(new Error('Marketplace down')),
      });

      const descriptor = makeDescriptor({
        monetization: { enabled: true, pricing_model: 'free' },
      });

      const result = await service.deployAgent(makeInput({
        descriptor,
        list_on_marketplace: true,
      }));
      expect(result.success).toBe(true); // Non-blocking failure
    });
  });

  // -------------------------------------------------------------------------
  // previewAgent
  // -------------------------------------------------------------------------

  describe('previewAgent', () => {
    it('should generate code without deploying', async () => {
      setupDefaultMocks();
      const result = await service.previewAgent(makeInput());
      expect(result.adapter).toBe('vercel-ai');
      expect(result.files).toBeDefined();
      expect(result.files['agent.ts']).toBeTruthy();
      expect(result.entrypoint).toBe('agent.ts');
      expect(result.dependencies).toBeDefined();
    });

    it('should auto-select adapter when preferred_adapter is not set', async () => {
      setupDefaultMocks();
      await service.previewAgent(makeInput());
      expect(mockedSelectBestAdapter).toHaveBeenCalled();
    });

    it('should use preferred_adapter when specified', async () => {
      setupDefaultMocks();
      await service.previewAgent(makeInput({ preferred_adapter: 'docker' }));
      expect(mockedGetRuntimeAdapter).toHaveBeenCalledWith('docker');
    });

    it('should not create a passport or deploy', async () => {
      setupDefaultMocks();
      const pm = mockedGetPassportManager();
      const deployer = mockedGetDeployer();

      await service.previewAgent(makeInput());

      expect(pm.createPassport).not.toHaveBeenCalled();
      expect(deployer.deploy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getCapabilities
  // -------------------------------------------------------------------------

  describe('getCapabilities', () => {
    it('should return available adapters and deployers', () => {
      const caps = service.getCapabilities();
      expect(caps.adapters).toEqual(['vercel-ai', 'openclaw', 'docker']);
      expect(caps.deployers).toEqual(['docker', 'railway']);
    });
  });

  // -------------------------------------------------------------------------
  // listDeployments / getDeployment
  // -------------------------------------------------------------------------

  describe('Deployment State Management', () => {
    beforeEach(async () => {
      setupDefaultMocks();
    });

    it('should return null for a non-existent deployment', async () => {
      const deployment = await service.getDeployment('nonexistent');
      expect(deployment).toBeNull();
    });

    it('should list all deployments', async () => {
      await service.deployAgent(makeInput());

      const deployments = await service.listDeployments();
      expect(deployments).toHaveLength(1);
      expect(deployments[0].status).toBe('running');
    });

    it('should filter deployments by tenant_id', async () => {
      // Deploy two agents with different owners
      const mockPm = mockedGetPassportManager();
      let callCount = 0;
      mockPm.createPassport = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          data: { passport_id: `passport_${callCount}` },
        });
      });

      await service.deployAgent(makeInput({ owner: 'owner_a' }));
      await service.deployAgent(makeInput({ owner: 'owner_b' }));

      const all = await service.listDeployments();
      expect(all).toHaveLength(2);

      const filtered = await service.listDeployments({ tenant_id: 'owner_a' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].tenant_id).toBe('owner_a');
    });

    it('should filter deployments by status', async () => {
      await service.deployAgent(makeInput());

      const running = await service.listDeployments({ status: 'running' });
      expect(running).toHaveLength(1);

      const stopped = await service.listDeployments({ status: 'stopped' });
      expect(stopped).toHaveLength(0);
    });

    it('should filter deployments by target', async () => {
      await service.deployAgent(makeInput());

      const docker = await service.listDeployments({ target: 'docker' });
      expect(docker).toHaveLength(1);

      const railway = await service.listDeployments({ target: 'railway' });
      expect(railway).toHaveLength(0);
    });

    it('should sort deployments by created_at descending', async () => {
      const mockPm = mockedGetPassportManager();
      let callCount = 0;
      mockPm.createPassport = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          data: { passport_id: `passport_${callCount}` },
        });
      });

      await service.deployAgent(makeInput());
      await service.deployAgent(makeInput());

      const deployments = await service.listDeployments();
      expect(deployments[0].created_at).toBeGreaterThanOrEqual(deployments[1].created_at);
    });
  });

  // -------------------------------------------------------------------------
  // terminateAgent
  // -------------------------------------------------------------------------

  describe('terminateAgent', () => {
    it('should terminate a deployed agent', async () => {
      const { mockDeployer } = setupDefaultMocks();
      await service.deployAgent(makeInput());

      const result = await service.terminateAgent('passport_new_agent_123');
      expect(result.success).toBe(true);
      expect(mockDeployer.terminate).toHaveBeenCalledWith('deploy_abc123');

      const deployment = await service.getDeployment('passport_new_agent_123');
      expect(deployment!.status).toBe('terminated');
    });

    it('should return error for non-existent deployment', async () => {
      setupDefaultMocks();
      const result = await service.terminateAgent('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error when deployer.terminate throws', async () => {
      setupDefaultMocks();
      const mockDeployer = mockedGetDeployer();
      mockDeployer.terminate = jest.fn().mockRejectedValue(new Error('Service not reachable'));

      await service.deployAgent(makeInput());
      const result = await service.terminateAgent('passport_new_agent_123');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Service not reachable');
    });
  });

  // -------------------------------------------------------------------------
  // getAgentStatus
  // -------------------------------------------------------------------------

  describe('getAgentStatus', () => {
    it('should return live status from the deployer', async () => {
      setupDefaultMocks();
      await service.deployAgent(makeInput());

      const status = await service.getAgentStatus('passport_new_agent_123');
      expect(status).not.toBeNull();
      expect(status!.status).toBe('running');
      expect(status!.health).toBe('healthy');
      expect(status!.url).toBe('http://localhost:3100');
    });

    it('should return null for non-existent deployment', async () => {
      const status = await service.getAgentStatus('nonexistent');
      expect(status).toBeNull();
    });

    it('should fall back to cached status when deployer status check fails', async () => {
      setupDefaultMocks();
      await service.deployAgent(makeInput());

      // Make deployer status throw
      const mockDeployer = mockedGetDeployer();
      mockDeployer.status = jest.fn().mockRejectedValue(new Error('Unreachable'));

      const status = await service.getAgentStatus('passport_new_agent_123');
      expect(status).not.toBeNull();
      expect(status!.status).toBe('running'); // Cached from initial deployment
    });
  });

  // -------------------------------------------------------------------------
  // getAgentLogs
  // -------------------------------------------------------------------------

  describe('getAgentLogs', () => {
    it('should return logs from the deployer', async () => {
      setupDefaultMocks();
      await service.deployAgent(makeInput());

      const logs = await service.getAgentLogs('passport_new_agent_123');
      expect(logs).toBe('Agent started');
    });

    it('should return not found message for non-existent deployment', async () => {
      const logs = await service.getAgentLogs('nonexistent');
      expect(logs).toContain('No deployment found');
    });

    it('should return error message when deployer.logs throws', async () => {
      setupDefaultMocks();
      await service.deployAgent(makeInput());

      const mockDeployer = mockedGetDeployer();
      mockDeployer.logs = jest.fn().mockRejectedValue(new Error('Timeout'));

      const logs = await service.getAgentLogs('passport_new_agent_123');
      expect(logs).toContain('Failed to fetch logs');
    });
  });
});
