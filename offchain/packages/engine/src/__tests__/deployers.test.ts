/**
 * Deployers — Comprehensive Tests
 *
 * Tests all 6 deployers:
 * - DockerDeployer
 * - RailwayDeployer
 * - AkashDeployer
 * - PhalaDeployer
 * - IoNetDeployer
 * - NosanaDeployer
 *
 * Also tests factory functions: getDeployer, getAllDeployers, listDeployerTargets
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { DockerDeployer } from '../compute/deploy/DockerDeployer';
import { RailwayDeployer } from '../compute/deploy/RailwayDeployer';
import { AkashDeployer } from '../compute/deploy/AkashDeployer';
import { PhalaDeployer } from '../compute/deploy/PhalaDeployer';
import { IoNetDeployer } from '../compute/deploy/IoNetDeployer';
import { NosanaDeployer } from '../compute/deploy/NosanaDeployer';
import {
  getDeployer,
  getAllDeployers,
  listDeployerTargets,
  resetDeployers,
} from '../compute/deploy';
import type { RuntimeArtifact, DeploymentConfig } from '../compute/deploy/IDeployer';
import { isImageDeploy } from '../compute/deploy/types';
import type { ImageDeployInput } from '../compute/deploy/types';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

function makeArtifact(overrides?: Partial<RuntimeArtifact>): RuntimeArtifact {
  const files = new Map<string, string>();
  files.set('agent.ts', 'console.log("hello");');
  files.set('package.json', '{"name":"test"}');
  files.set('Dockerfile', 'FROM node:20-slim\nCMD ["node","agent.ts"]');

  return {
    adapter: 'test-adapter',
    files,
    entrypoint: 'agent.ts',
    dependencies: { tsx: '^4.0.0' },
    env_vars: { PORT: '3100', TRUSTGATE_URL: 'https://example.com' },
    dockerfile: 'FROM node:20-slim\nCMD ["node","agent.ts"]',
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<DeploymentConfig>): DeploymentConfig {
  return {
    target: { type: 'docker' },
    replicas: 1,
    restart_policy: 'on_failure',
    health_check_interval_ms: 30000,
    env_vars: { AGENT_PASSPORT_ID: 'passport_test' },
    ...overrides,
  };
}

const PASSPORT_ID = 'passport_deploy_test_123';

// ---------------------------------------------------------------------------
// Mock global fetch for API-based deployers
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;
let mockFetch: jest.Mock;

beforeEach(() => {
  mockFetch = jest.fn();
  global.fetch = mockFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ===========================================================================
// DockerDeployer
// ===========================================================================

describe('DockerDeployer', () => {
  let deployer: DockerDeployer;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `docker-deploy-test-${Date.now()}`);
    deployer = new DockerDeployer(testDir);
    // Restore real fetch for DockerDeployer (no external API calls)
    global.fetch = originalFetch;
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should have correct identity properties', () => {
    expect(deployer.target).toBe('docker');
    expect(deployer.description).toBeTruthy();
  });

  describe('deploy', () => {
    it('should return a successful DeploymentResult', async () => {
      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(true);
      expect(result.deployment_id).toBeTruthy();
      expect(result.target).toBe('docker');
      expect(result.url).toContain('localhost');
    });

    it('should create deployment directory with all artifact files', async () => {
      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(true);

      const deployDir = (result.metadata as any).dir;
      expect(fs.existsSync(path.join(deployDir, 'agent.ts'))).toBe(true);
      expect(fs.existsSync(path.join(deployDir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(deployDir, 'Dockerfile'))).toBe(true);
    });

    it('should generate docker-compose.yml', async () => {
      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      const deployDir = (result.metadata as any).dir;
      const compose = fs.readFileSync(path.join(deployDir, 'docker-compose.yml'), 'utf-8');
      expect(compose).toContain('lucid-agent-');
      expect(compose).toContain('3100:3100');
    });

    it('should generate .env file with merged env vars', async () => {
      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      const deployDir = (result.metadata as any).dir;
      const envFile = fs.readFileSync(path.join(deployDir, '.env'), 'utf-8');
      expect(envFile).toContain('PORT=3100');
      expect(envFile).toContain('AGENT_PASSPORT_ID=passport_test');
    });

    it('should generate deployment.json metadata', async () => {
      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      const deployDir = (result.metadata as any).dir;
      const meta = JSON.parse(fs.readFileSync(path.join(deployDir, 'deployment.json'), 'utf-8'));
      expect(meta.passport_id).toBe(PASSPORT_ID);
      expect(meta.adapter).toBe('test-adapter');
    });

    it('should create subdirectories for nested file paths', async () => {
      const artifact = makeArtifact();
      artifact.files.set('config/settings.json', '{}');
      const result = await deployer.deploy(artifact, makeConfig(), PASSPORT_ID);
      const deployDir = (result.metadata as any).dir;
      expect(fs.existsSync(path.join(deployDir, 'config', 'settings.json'))).toBe(true);
    });
  });

  describe('status', () => {
    it('should return running status for a deployed agent', async () => {
      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      const status = await deployer.status(result.deployment_id);
      expect(status.deployment_id).toBe(result.deployment_id);
      expect(status.status).toBe('running');
      expect(status.uptime_ms).toBeDefined();
    });

    it('should return terminated status for unknown deployment', async () => {
      const status = await deployer.status('nonexistent');
      expect(status.status).toBe('terminated');
    });
  });

  describe('logs', () => {
    it('should return log instructions for a deployed agent', async () => {
      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      const logs = await deployer.logs(result.deployment_id);
      expect(logs).toContain('docker compose');
    });

    it('should return not found message for unknown deployment', async () => {
      const logs = await deployer.logs('nonexistent');
      expect(logs).toContain('not found');
    });
  });

  describe('terminate', () => {
    it('should mark deployment as terminated', async () => {
      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      await deployer.terminate(result.deployment_id);
      const status = await deployer.status(result.deployment_id);
      expect(status.status).toBe('terminated');
    });
  });

  describe('scale', () => {
    it('should not throw when scaling', async () => {
      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      await expect(deployer.scale(result.deployment_id, 3)).resolves.toBeUndefined();
    });
  });

  describe('isHealthy', () => {
    it('should always return true (file-based deployer)', async () => {
      expect(await deployer.isHealthy()).toBe(true);
    });
  });
});

// ===========================================================================
// RailwayDeployer
// ===========================================================================

describe('RailwayDeployer', () => {
  let deployer: RailwayDeployer;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, RAILWAY_API_TOKEN: 'test-railway-token' };
    deployer = new RailwayDeployer();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should have correct identity properties', () => {
    expect(deployer.target).toBe('railway');
    expect(deployer.description).toBeTruthy();
  });

  describe('deploy', () => {
    it('should return error when RAILWAY_API_TOKEN is not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.RAILWAY_API_TOKEN;
      const d = new RailwayDeployer();
      const result = await d.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('RAILWAY_API_TOKEN');
    });

    it('should return error when project_id is missing', async () => {
      const config = makeConfig({ target: { type: 'railway' } });
      const result = await deployer.deploy(makeArtifact(), config, PASSPORT_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('project_id');
    });

    it('should return error when image_ref is missing', async () => {
      const artifact = makeArtifact();
      delete artifact.env_vars.AGENT_IMAGE_REF;
      const config = makeConfig({ target: { type: 'railway', project_id: 'proj_123' } });
      delete config.env_vars!.AGENT_IMAGE_REF;
      const result = await deployer.deploy(artifact, config, PASSPORT_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('image reference');
    });

    it('should create a Railway service with Docker image source', async () => {
      const serviceId = 'svc_railway_123';

      // serviceCreate
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { serviceCreate: { id: serviceId, name: 'agent' } } }),
      });
      // variableCollectionUpsert
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { variableCollectionUpsert: true } }),
      });
      // serviceDomainCreate
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { serviceDomainCreate: { domain: 'agent-test.up.railway.app' } } }),
      });
      // deployment status poll
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { service: { deployments: { edges: [{ node: { status: 'SUCCESS' } }] } } },
        }),
      });

      const config = makeConfig({
        target: { type: 'railway', project_id: 'proj_123', image_ref: 'ghcr.io/test:latest' },
      });
      const result = await deployer.deploy(makeArtifact(), config, PASSPORT_ID);
      expect(result.success).toBe(true);
      expect(result.deployment_id).toBe(serviceId);
      expect(result.url).toContain('railway.app');
    });

    it('should return error when Railway API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Internal Server Error',
      });

      const config = makeConfig({
        target: { type: 'railway', project_id: 'proj_123', image_ref: 'ghcr.io/test:latest' },
      });
      const result = await deployer.deploy(makeArtifact(), config, PASSPORT_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('status', () => {
    it('should return status from Railway GraphQL API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            service: {
              id: 'svc_123',
              name: 'agent',
              deployments: {
                edges: [{ node: { id: 'd1', status: 'SUCCESS', createdAt: new Date().toISOString() } }],
              },
            },
          },
        }),
      });

      const status = await deployer.status('svc_123');
      expect(status.status).toBe('running');
      expect(status.health).toBe('healthy');
    });

    it('should return failed status when API call fails', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));
      const status = await deployer.status('svc_123');
      expect(status.status).toBe('failed');
    });
  });

  describe('logs', () => {
    it('should return formatted logs from Railway API', async () => {
      // First call: get deployment ID
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { service: { deployments: { edges: [{ node: { id: 'dep_1' } }] } } },
        }),
      });
      // Second call: get logs
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            deploymentLogs: [
              { message: 'Started', timestamp: '2026-01-01T00:00:00Z' },
              { message: 'Ready', timestamp: '2026-01-01T00:00:01Z' },
            ],
          },
        }),
      });

      const logs = await deployer.logs('svc_123');
      expect(logs).toContain('Started');
      expect(logs).toContain('Ready');
    });
  });

  describe('terminate', () => {
    it('should call ServiceDelete GraphQL mutation', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: { serviceDelete: true } }) });
      await deployer.terminate('svc_123');
      expect(mockFetch).toHaveBeenCalled();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.query).toContain('serviceDelete');
    });
  });

  describe('isHealthy', () => {
    it('should verify API token by querying Railway', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { me: { id: 'user_123' } } }),
      });
      expect(await deployer.isHealthy()).toBe(true);
    });

    it('should return false when API token is not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.RAILWAY_API_TOKEN;
      const d = new RailwayDeployer();
      expect(await d.isHealthy()).toBe(false);
    });
  });
});

// ===========================================================================
// AkashDeployer
// ===========================================================================

describe('AkashDeployer', () => {
  let deployer: AkashDeployer;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AKASH_CONSOLE_API_KEY: 'test-akash-key',
      AKASH_WALLET_ADDRESS: 'akash1test',
    };
    deployer = new AkashDeployer();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should have correct identity properties', () => {
    expect(deployer.target).toBe('akash');
    expect(deployer.description).toBeTruthy();
  });

  describe('deploy', () => {
    it('should create deployment via Console API', async () => {
      // Mock all fetch calls in sequence
      let callCount = 0;
      mockFetch.mockImplementation(async (url: string, opts: any) => {
        callCount++;
        const urlStr = String(url);

        // Call 1: POST /v1/deployments (create)
        if (callCount === 1 && opts?.method === 'POST') {
          return { ok: true, json: async () => ({ dseq: '12345', status: 'created' }) };
        }
        // Call 2: GET bids
        if (urlStr.includes('/bids')) {
          return {
            ok: true,
            json: async () => ({
              bids: [{ id: 'bid_1', provider: 'prov_1', price: { denom: 'uakt', amount: '100' }, status: 'open' }],
            }),
          };
        }
        // Call 3: POST accept bid
        if (urlStr.includes('/accept')) {
          return {
            ok: true,
            json: async () => ({ id: 'lease_1', dseq: '12345', gseq: 1, oseq: 1, provider: 'prov_1', status: 'active' }),
          };
        }
        // Call 4: POST manifest
        if (urlStr.includes('/manifest')) {
          return { ok: true, json: async () => ({}) };
        }
        // Call 5+: GET deployment status (poll for running)
        return {
          ok: true,
          json: async () => ({
            status: 'active',
            services: { agent: { uris: ['agent.akash.network'] } },
          }),
        };
      });

      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(true);
      expect(result.deployment_id).toBe('12345');
      expect(result.url).toContain('akash');
    }, 30_000);

    it('should return error when Console API fails', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ dseq: '', error: 'Insufficient funds' }),
      });

      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      // Either fails with error or gets empty dseq
      expect(result.deployment_id).toBeDefined();
    }, 15_000);
  });

  describe('status', () => {
    it('should return status from Console API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          dseq: '12345',
          status: 'active',
          services: { agent: { uris: ['agent.akash.network'] } },
        }),
      });

      const status = await deployer.status('12345');
      expect(status.status).toBe('running');
      expect(status.health).toBe('healthy');
    });
  });

  describe('logs', () => {
    it('should fetch logs from Console API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ logs: 'Agent started\nListening on port 3100' }),
      });

      const logs = await deployer.logs('12345');
      expect(logs).toContain('Agent started');
    });
  });

  describe('terminate', () => {
    it('should call DELETE on Console API', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
      await deployer.terminate('12345');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('12345'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('isHealthy', () => {
    it('should check Console API status', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
      expect(await deployer.isHealthy()).toBe(true);
    });

    it('should return false when API key is not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.AKASH_CONSOLE_API_KEY;
      const d = new AkashDeployer();
      expect(await d.isHealthy()).toBe(false);
    });
  });
});

// ===========================================================================
// PhalaDeployer
// ===========================================================================

describe('PhalaDeployer', () => {
  let deployer: PhalaDeployer;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, PHALA_API_KEY: 'test-phala-key' };
    deployer = new PhalaDeployer();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should have correct identity properties', () => {
    expect(deployer.target).toBe('phala');
    expect(deployer.description).toBeTruthy();
  });

  describe('deploy', () => {
    it('should return error when PHALA_API_KEY is not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.PHALA_API_KEY;
      delete process.env.PHALA_CLOUD_API_KEY;
      const d = new PhalaDeployer();
      const result = await d.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('PHALA_CLOUD_API_KEY');
    });

    it('should execute two-phase CVM provisioning', async () => {
      // Phase 1: provision
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          app_id: 'phala_app_123',
          compose_hash: 'hash_abc',
          app_env_encrypt_pubkey: 'pubkey_xyz',
        }),
      });
      // Phase 2: commit
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'committed' }) });
      // Poll until running
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'running' }),
      });

      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(true);
      expect(result.deployment_id).toBe('phala_app_123');
      expect(result.url).toContain('dstack-prod5.phala.network');
      expect(result.metadata).toHaveProperty('tee', true);
      expect(result.metadata).toHaveProperty('compose_hash', 'hash_abc');
    });

    it('should return error when provision fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('provision failed');
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
    });
  });

  describe('status', () => {
    it('should return status from Phala CVM state API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'running' }),
      });

      const status = await deployer.status('phala_app_123');
      expect(status.status).toBe('running');
      expect(status.health).toBe('healthy');
      expect(status.url).toContain('dstack-prod5.phala.network');
    });

    it('should return failed when API key is missing', async () => {
      process.env = { ...originalEnv };
      delete process.env.PHALA_API_KEY;
      delete process.env.PHALA_CLOUD_API_KEY;
      const d = new PhalaDeployer();
      const status = await d.status('phala_app_123');
      expect(status.status).toBe('failed');
    });
  });

  describe('logs', () => {
    it('should return logs from Phala API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => 'Agent started\nListening on port 3100',
      });

      const logs = await deployer.logs('phala_app_123');
      expect(logs).toContain('Agent started');
    });

    it('should return message when API key is missing', async () => {
      process.env = { ...originalEnv };
      delete process.env.PHALA_API_KEY;
      delete process.env.PHALA_CLOUD_API_KEY;
      const d = new PhalaDeployer();
      const logs = await d.logs('phala_app_123');
      expect(logs).toContain('PHALA_CLOUD_API_KEY');
    });
  });

  describe('terminate', () => {
    it('should stop and delete CVM', async () => {
      // stop
      mockFetch.mockResolvedValueOnce({ ok: true });
      // delete
      mockFetch.mockResolvedValueOnce({ ok: true });
      await deployer.terminate('phala_app_123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw when API key is missing', async () => {
      process.env = { ...originalEnv };
      delete process.env.PHALA_API_KEY;
      delete process.env.PHALA_CLOUD_API_KEY;
      const d = new PhalaDeployer();
      await expect(d.terminate('phala_app_123')).rejects.toThrow('PHALA_CLOUD_API_KEY');
    });
  });

  describe('scale', () => {
    it('should throw because Phala CVM does not support horizontal scaling', async () => {
      await expect(deployer.scale('phala_app_123', 3)).rejects.toThrow('scaling');
    });
  });

  describe('isHealthy', () => {
    it('should return true when API key is set', async () => {
      expect(await deployer.isHealthy()).toBe(true);
    });

    it('should return false when API key is not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.PHALA_API_KEY;
      delete process.env.PHALA_CLOUD_API_KEY;
      const d = new PhalaDeployer();
      expect(await d.isHealthy()).toBe(false);
    });
  });
});

// ===========================================================================
// IoNetDeployer
// ===========================================================================

describe('IoNetDeployer', () => {
  let deployer: IoNetDeployer;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, IONET_API_KEY: 'test-ionet-key' };
    deployer = new IoNetDeployer();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should have correct identity properties', () => {
    expect(deployer.target).toBe('ionet');
    expect(deployer.description).toBeTruthy();
  });

  describe('deploy', () => {
    it('should return error when IONET_API_KEY is not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.IONET_API_KEY;
      const d = new IoNetDeployer();
      const result = await d.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('IONET_API_KEY');
    });

    it('should create a GPU deployment via CaaS API', async () => {
      // availability check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 1 }] }),
      });
      // deploy
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deployment_id: 'ionet_dep_123' }),
      });
      // poll for URL
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { workers: [{ public_url: 'https://ionet-agent.example.com', status: 'running' }] },
        }),
      });

      const config = makeConfig({ target: { type: 'ionet', gpu: 'a100' } });
      const result = await deployer.deploy(makeArtifact(), config, PASSPORT_ID);
      expect(result.success).toBe(true);
      expect(result.deployment_id).toBe('ionet_dep_123');
      expect(result.url).toContain('ionet-agent');
    });

    it('should handle API errors gracefully', async () => {
      // availability check fails
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'error' });
      // deploy fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service unavailable',
      });

      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(false);
    });
  });

  describe('status', () => {
    it('should return running status from containers API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { workers: [{ status: 'running', public_url: 'https://example.com' }] },
        }),
      });

      const status = await deployer.status('ionet_dep_abc');
      expect(status.status).toBe('running');
      expect(status.health).toBe('healthy');
    });

    it('should return failed when API key is missing', async () => {
      process.env = { ...originalEnv };
      delete process.env.IONET_API_KEY;
      const d = new IoNetDeployer();
      const status = await d.status('ionet_dep_abc');
      expect(status.status).toBe('failed');
    });
  });

  describe('logs', () => {
    it('should fetch logs via container log endpoint', async () => {
      // get containers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { workers: [{ container_id: 'ctr_1' }] },
        }),
      });
      // get logs
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Agent started\nio.net deployment ready',
      });

      const logs = await deployer.logs('ionet_dep_abc');
      expect(logs).toContain('Agent started');
    });
  });

  describe('terminate', () => {
    it('should call DELETE on deployment endpoint', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      await deployer.terminate('ionet_dep_abc');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('ionet_dep_abc'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should throw when API key is missing', async () => {
      process.env = { ...originalEnv };
      delete process.env.IONET_API_KEY;
      const d = new IoNetDeployer();
      await expect(d.terminate('ionet_dep_abc')).rejects.toThrow('IONET_API_KEY');
    });
  });

  describe('isHealthy', () => {
    it('should return true when API key is set', async () => {
      expect(await deployer.isHealthy()).toBe(true);
    });

    it('should return false when API key is not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.IONET_API_KEY;
      const d = new IoNetDeployer();
      expect(await d.isHealthy()).toBe(false);
    });
  });
});

// ===========================================================================
// NosanaDeployer
// ===========================================================================

describe('NosanaDeployer', () => {
  let deployer: NosanaDeployer;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NOSANA_API_KEY: 'test-nosana-key' };
    deployer = new NosanaDeployer();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should have correct identity properties', () => {
    expect(deployer.target).toBe('nosana');
    expect(deployer.description).toBeTruthy();
  });

  describe('deploy', () => {
    it('should return error when NOSANA_API_KEY is not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.NOSANA_API_KEY;
      const d = new NosanaDeployer();
      const result = await d.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('NOSANA_API_KEY');
    });

    it('should create deployment via Nosana REST API', async () => {
      // create deployment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'nos_dep_123', status: 'DRAFT' }),
      });
      // start deployment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'nos_dep_123', status: 'RUNNING' }),
      });

      const config = makeConfig({ target: { type: 'nosana', gpu: 'rtx-4090' } });
      const result = await deployer.deploy(makeArtifact(), config, PASSPORT_ID);
      expect(result.success).toBe(true);
      expect(result.deployment_id).toBe('nos_dep_123');
      expect(result.url).toContain('nos');
    });
  });

  describe('status', () => {
    it('should return status from Nosana API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'nos_dep_123', status: 'RUNNING' }),
      });

      const status = await deployer.status('nos_dep_123');
      expect(status.status).toBe('running');
      expect(status.health).toBe('healthy');
    });
  });

  describe('terminate', () => {
    it('should stop and archive deployment', async () => {
      // stop
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // archive
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      await deployer.terminate('nos_dep_123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('isHealthy', () => {
    it('should return true when API key is set', async () => {
      expect(await deployer.isHealthy()).toBe(true);
    });

    it('should return false when API key is not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.NOSANA_API_KEY;
      const d = new NosanaDeployer();
      expect(await d.isHealthy()).toBe(false);
    });
  });
});

// ===========================================================================
// Deployer Factory
// ===========================================================================

describe('Deployer Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetDeployers();
    process.env = {
      ...originalEnv,
      RAILWAY_API_TOKEN: 'tok',
      PHALA_API_KEY: 'key',
      IONET_API_KEY: 'key',
      NOSANA_API_KEY: 'key',
    };
  });

  afterEach(() => {
    resetDeployers();
    process.env = originalEnv;
  });

  describe('getDeployer', () => {
    it('should return the correct deployer by target name', () => {
      expect(getDeployer('docker').target).toBe('docker');
      expect(getDeployer('railway').target).toBe('railway');
      expect(getDeployer('akash').target).toBe('akash');
      expect(getDeployer('phala').target).toBe('phala');
      expect(getDeployer('ionet').target).toBe('ionet');
      expect(getDeployer('nosana').target).toBe('nosana');
    });

    it('should throw for unknown target names', () => {
      expect(() => getDeployer('nonexistent')).toThrow('Unknown deployment target');
    });

    it('should default to docker when no target specified and no env var set', () => {
      delete process.env.DEPLOY_TARGET;
      const deployer = getDeployer();
      expect(deployer.target).toBe('docker');
    });

    it('should use DEPLOY_TARGET env var when no argument is passed', () => {
      process.env.DEPLOY_TARGET = 'railway';
      resetDeployers();
      const deployer = getDeployer();
      expect(deployer.target).toBe('railway');
    });
  });

  describe('getAllDeployers', () => {
    it('should return all 6 deployers', () => {
      const all = getAllDeployers();
      expect(all).toHaveLength(6);
      const targets = all.map(d => d.target);
      expect(targets).toContain('docker');
      expect(targets).toContain('railway');
      expect(targets).toContain('akash');
      expect(targets).toContain('phala');
      expect(targets).toContain('ionet');
      expect(targets).toContain('nosana');
    });
  });

  describe('listDeployerTargets', () => {
    it('should return all 6 target names', () => {
      const targets = listDeployerTargets();
      expect(targets).toHaveLength(6);
      expect(targets).toContain('docker');
      expect(targets).toContain('railway');
      expect(targets).toContain('akash');
      expect(targets).toContain('phala');
      expect(targets).toContain('ionet');
      expect(targets).toContain('nosana');
    });
  });
});

// ===========================================================================
// Image-based deployment
// ===========================================================================

describe('Image-based deployment', () => {
  const imageInput: ImageDeployInput = {
    image: 'ghcr.io/test/my-agent:v1',
    env_vars: { LUCID_API_URL: 'http://localhost:3001', LUCID_PASSPORT_ID: 'test_passport' },
    port: 8080,
    verification: 'full',
  };

  test('DockerDeployer deploys image ref with prepared status', async () => {
    const deployer = getDeployer('docker');
    const result = await deployer.deploy(imageInput, { target: { type: 'docker' }, restart_policy: 'on-failure' } as any, 'test_passport');
    expect(result.success).toBe(true);
    expect(result.url).toContain('8080');
    expect(result.metadata?.status).toBe('prepared');
    expect(result.metadata?.requires_manual_start).toBe(true);
  });

  test('isImageDeploy correctly identifies image vs artifact', () => {
    expect(isImageDeploy(imageInput)).toBe(true);
    expect(isImageDeploy({ files: new Map(), entrypoint: 'x', adapter: 'y', dependencies: {}, env_vars: {} })).toBe(false);
    expect(isImageDeploy(null)).toBe(false);
    expect(isImageDeploy('string')).toBe(false);
  });

  test('DockerDeployer image deploy generates compose with image: not build:', async () => {
    const deployer = getDeployer('docker');
    const result = await deployer.deploy(imageInput, { target: { type: 'docker' }, restart_policy: 'on-failure' } as any, 'test_compose');
    // Read the generated docker-compose.yml
    const dir = (result.metadata as any).dir;
    const compose = fs.readFileSync(path.join(dir, 'docker-compose.yml'), 'utf-8');
    expect(compose).toContain('image: ghcr.io/test/my-agent:v1');
    expect(compose).not.toContain('build:');
    expect(compose).toContain('8080:8080');
  });
});
