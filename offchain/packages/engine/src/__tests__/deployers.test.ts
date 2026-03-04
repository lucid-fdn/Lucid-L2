/**
 * Deployers — Comprehensive Tests
 *
 * Tests all 5 deployers:
 * - DockerDeployer
 * - RailwayDeployer
 * - AkashDeployer
 * - PhalaDeployer
 * - IoNetDeployer
 *
 * Also tests factory functions: getDeployer, getAllDeployers, listDeployerTargets
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { DockerDeployer } from '../deploy/DockerDeployer';
import { RailwayDeployer } from '../deploy/RailwayDeployer';
import { AkashDeployer } from '../deploy/AkashDeployer';
import { PhalaDeployer } from '../deploy/PhalaDeployer';
import { IoNetDeployer } from '../deploy/IoNetDeployer';
import {
  getDeployer,
  getAllDeployers,
  listDeployerTargets,
  resetDeployers,
} from '../deploy';
import type { RuntimeArtifact, DeploymentConfig } from '../deploy/IDeployer';

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
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
      const result = await deployer.deploy(makeArtifact(), config, PASSPORT_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('project_id');
    });

    it('should create a Railway service via GraphQL when config is valid', async () => {
      const serviceId = 'svc_railway_123';
      // First call: ServiceCreate
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { serviceCreate: { id: serviceId, name: 'agent' } } }),
      });
      // Subsequent calls: VariableUpsert (for each env var with a value)
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { variableUpsert: true } }),
      });

      const config = makeConfig({
        target: { type: 'railway', project_id: 'proj_123' },
      });
      const result = await deployer.deploy(makeArtifact(), config, PASSPORT_ID);
      expect(result.success).toBe(true);
      expect(result.deployment_id).toBe(serviceId);
      expect(result.target).toBe('railway');
    });

    it('should return error when Railway API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const config = makeConfig({
        target: { type: 'railway', project_id: 'proj_123' },
      });
      const result = await deployer.deploy(makeArtifact(), config, PASSPORT_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Railway API error');
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
                edges: [{ node: { id: 'd1', status: 'SUCCESS', url: 'https://test.up.railway.app' } }],
              },
            },
          },
        }),
      });

      const status = await deployer.status('svc_123');
      expect(status.status).toBe('running');
      expect(status.health).toBe('healthy');
      expect(status.url).toContain('railway.app');
    });

    it('should return failed status when API call fails', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));
      const status = await deployer.status('svc_123');
      expect(status.status).toBe('failed');
    });
  });

  describe('logs', () => {
    it('should return formatted logs from Railway API', async () => {
      mockFetch.mockResolvedValue({
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
    it('should return true when API token is set', async () => {
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

  beforeEach(() => {
    deployer = new AkashDeployer();
  });

  it('should have correct identity properties', () => {
    expect(deployer.target).toBe('akash');
    expect(deployer.description).toBeTruthy();
  });

  describe('deploy', () => {
    it('should return a successful DeploymentResult with SDL metadata', async () => {
      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(true);
      expect(result.deployment_id).toContain('akash_');
      expect(result.target).toBe('akash');
      expect(result.metadata).toHaveProperty('sdl');
      expect(result.metadata).toHaveProperty('instructions');
    });

    it('should generate valid Akash SDL with env vars', async () => {
      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      const sdl = (result.metadata as any).sdl;
      expect(sdl).toContain('version: "2.0"');
      expect(sdl).toContain('services:');
      expect(sdl).toContain('agent:');
      expect(sdl).toContain('PORT=3100');
    });

    it('should set correct replica count from config', async () => {
      const config = makeConfig({ replicas: 3 });
      const result = await deployer.deploy(makeArtifact(), config, PASSPORT_ID);
      const sdl = (result.metadata as any).sdl;
      expect(sdl).toContain('count: 3');
    });
  });

  describe('status', () => {
    it('should return running status (on-chain query required)', async () => {
      const status = await deployer.status('akash_123');
      expect(status.status).toBe('running');
      expect(status.health).toBe('unknown');
    });
  });

  describe('logs', () => {
    it('should return CLI instructions', async () => {
      const logs = await deployer.logs('akash_123');
      expect(logs).toContain('akash');
    });
  });

  describe('terminate', () => {
    it('should not throw when terminating', async () => {
      await expect(deployer.terminate('akash_123')).resolves.toBeUndefined();
    });
  });

  describe('scale', () => {
    it('should throw because Akash requires SDL update', async () => {
      await expect(deployer.scale('akash_123', 2)).rejects.toThrow('SDL update');
    });
  });

  describe('isHealthy', () => {
    it('should return true (SDL generation is always available)', async () => {
      expect(await deployer.isHealthy()).toBe(true);
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
      const d = new PhalaDeployer();
      const result = await d.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('PHALA_API_KEY');
    });

    it('should create a TEE deployment via Phala API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'phala_dep_abc',
          url: 'https://phala-agent.example.com',
          attestation: 'attest_xyz',
        }),
      });

      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(true);
      expect(result.deployment_id).toBe('phala_dep_abc');
      expect(result.url).toContain('phala-agent');
      expect(result.metadata).toHaveProperty('tee', true);
    });

    it('should return error when Phala API returns non-OK', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
    });
  });

  describe('status', () => {
    it('should return status from Phala API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'running', url: 'https://phala.example.com', health: 'healthy' }),
      });

      const status = await deployer.status('phala_dep_abc');
      expect(status.status).toBe('running');
      expect(status.health).toBe('healthy');
    });

    it('should return failed when API key is missing', async () => {
      process.env = { ...originalEnv };
      delete process.env.PHALA_API_KEY;
      const d = new PhalaDeployer();
      const status = await d.status('phala_dep_abc');
      expect(status.status).toBe('failed');
    });
  });

  describe('logs', () => {
    it('should return logs from Phala API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => 'Agent started\nListening on port 3100',
      });

      const logs = await deployer.logs('phala_dep_abc');
      expect(logs).toContain('Agent started');
    });

    it('should return message when API key is missing', async () => {
      process.env = { ...originalEnv };
      delete process.env.PHALA_API_KEY;
      const d = new PhalaDeployer();
      const logs = await d.logs('phala_dep_abc');
      expect(logs).toContain('PHALA_API_KEY');
    });
  });

  describe('terminate', () => {
    it('should call DELETE on Phala API', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      await deployer.terminate('phala_dep_abc');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('phala_dep_abc'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should throw when API key is missing', async () => {
      process.env = { ...originalEnv };
      delete process.env.PHALA_API_KEY;
      const d = new PhalaDeployer();
      await expect(d.terminate('phala_dep_abc')).rejects.toThrow('PHALA_API_KEY');
    });
  });

  describe('scale', () => {
    it('should call PATCH on Phala API', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      await deployer.scale('phala_dep_abc', 3);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('scale'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('isHealthy', () => {
    it('should return true when API key is set', async () => {
      expect(await deployer.isHealthy()).toBe(true);
    });

    it('should return false when API key is not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.PHALA_API_KEY;
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

    it('should create a GPU deployment via io.net API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'ionet_dep_abc',
          url: 'https://ionet-agent.example.com',
        }),
      });

      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(true);
      expect(result.deployment_id).toBe('ionet_dep_abc');
      expect(result.url).toContain('ionet-agent');
    });

    it('should pass gpu_type from deployment target config', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'ionet_dep', url: 'https://example.com' }),
      });

      const config = makeConfig({
        target: { type: 'ionet', gpu_type: 'h100' },
      });
      await deployer.deploy(makeArtifact(), config, PASSPORT_ID);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.gpu_type).toBe('h100');
    });

    it('should default gpu_type to a100', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'ionet_dep', url: 'https://example.com' }),
      });

      await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.gpu_type).toBe('a100');
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service unavailable',
      });

      const result = await deployer.deploy(makeArtifact(), makeConfig(), PASSPORT_ID);
      expect(result.success).toBe(false);
    });
  });

  describe('status', () => {
    it('should return running status', async () => {
      const status = await deployer.status('ionet_dep_abc');
      expect(status.status).toBe('running');
      expect(status.health).toBe('unknown');
    });
  });

  describe('logs', () => {
    it('should return dashboard instructions', async () => {
      const logs = await deployer.logs('ionet_dep_abc');
      expect(logs).toContain('io.net');
    });
  });

  describe('terminate', () => {
    it('should call DELETE on io.net API', async () => {
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
    it('should return all 5 deployers', () => {
      const all = getAllDeployers();
      expect(all).toHaveLength(5);
      const targets = all.map(d => d.target);
      expect(targets).toContain('docker');
      expect(targets).toContain('railway');
      expect(targets).toContain('akash');
      expect(targets).toContain('phala');
      expect(targets).toContain('ionet');
    });
  });

  describe('listDeployerTargets', () => {
    it('should return all 5 target names', () => {
      const targets = listDeployerTargets();
      expect(targets).toHaveLength(5);
      expect(targets).toContain('docker');
      expect(targets).toContain('railway');
      expect(targets).toContain('akash');
      expect(targets).toContain('phala');
      expect(targets).toContain('ionet');
    });
  });
});
