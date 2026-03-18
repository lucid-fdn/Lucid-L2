/**
 * Launch Service Tests (12 tests)
 *
 * Tests both launch paths:
 *   Path A: launchImage  — BYOI (bring your own image)
 *   Path B: launchBaseRuntime — no-code base runtime
 *
 * Covers:
 *   1.  launchImage deploys to docker, returns success
 *   2.  launchImage with minimal verification returns reputation_eligible: false
 *   3.  launchImage with full verification returns reputation_eligible: true
 *   4.  launchImage reuses existing passport_id when provided
 *   5.  launchImage with custom port
 *   6.  launchImage with custom env_vars merged
 *   7.  launchImage with missing image returns validation error
 *   8.  launchImage with invalid owner returns passport error
 *   9.  launchBaseRuntime deploys with model+prompt
 *   10. launchBaseRuntime always returns reputation_eligible: true (forced full)
 *   11. launchBaseRuntime returns config_hash
 *   12. launchBaseRuntime with missing model returns validation error
 */

// ---------------------------------------------------------------------------
// Env setup — MUST be before any imports that read process.env
// ---------------------------------------------------------------------------
process.env.DEPLOYMENT_STORE = 'memory';

// ---------------------------------------------------------------------------
// Mocks — MUST be before imports that trigger module loading
// ---------------------------------------------------------------------------

// Mock schema validator (passportManager imports it)
jest.mock('../shared/crypto/schemaValidator', () => ({
  validateWithSchema: jest.fn(() => ({ ok: true, value: {} })),
}));

// Mock passport manager — returns predictable passport_ids.
// Shared mockCreatePassport so tests can override per-call behavior.
let passportCounter = 0;
const mockCreatePassport = jest.fn().mockImplementation(() => {
  passportCounter++;
  return Promise.resolve({
    ok: true,
    data: { passport_id: `passport_launch_${passportCounter}` },
  });
});

jest.mock('../identity/passport/passportManager', () => ({
  getPassportManager: jest.fn(() => ({
    createPassport: mockCreatePassport,
  })),
  resetPassportManager: jest.fn(),
}));

// Mock deployer factory — returns a mock docker deployer
const mockDeployResult = {
  success: true,
  deployment_id: 'deploy_mock_001',
  target: 'docker',
  url: 'http://localhost:3100',
  metadata: { dir: '/tmp/test-deploy', status: 'prepared', requires_manual_start: true },
};

const mockDeployer = {
  target: 'docker',
  description: 'Mock Docker deployer',
  deploy: jest.fn().mockResolvedValue(mockDeployResult),
  status: jest.fn().mockResolvedValue({ deployment_id: 'deploy_mock_001', status: 'running' }),
  logs: jest.fn().mockResolvedValue('Agent started'),
  terminate: jest.fn().mockResolvedValue(undefined),
  scale: jest.fn().mockResolvedValue(undefined),
  isHealthy: jest.fn().mockResolvedValue(true),
};

jest.mock('../compute/providers', () => ({
  getDeployer: jest.fn(() => mockDeployer),
  listDeployerTargets: jest.fn(() => ['docker']),
  resetDeployers: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { launchImage, launchBaseRuntime } from '../compute/control-plane/launch';
import { resetDeploymentStore } from '../compute/control-plane/store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_OWNER = '3kYo5DwnsYQeHt3KihqLXqoWW6L7AHodavyG9j4yimC3';
const TEST_IMAGE = 'ghcr.io/myorg/my-agent:latest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset deployment store singleton so each test gets a clean store
  resetDeploymentStore();
  // Reset mock call counts
  mockDeployer.deploy.mockClear();
  mockDeployer.deploy.mockResolvedValue(mockDeployResult);
});

// ===========================================================================
// Path A: launchImage
// ===========================================================================

describe('launchImage', () => {
  test('1. deploys to docker, returns success', async () => {
    const result = await launchImage({
      image: TEST_IMAGE,
      target: 'docker',
      owner: VALID_OWNER,
      name: 'test-agent',
    });

    expect(result.success).toBe(true);
    expect(result.passport_id).toBeDefined();
    expect(result.deployment_id).toBeDefined();
    expect(result.deployment_url).toBe('http://localhost:3100');
    expect(result.error).toBeUndefined();
    expect(mockDeployer.deploy).toHaveBeenCalledTimes(1);

    // Verify deploy was called with an ImageDeployInput
    const deployCall = mockDeployer.deploy.mock.calls[0];
    expect(deployCall[0]).toHaveProperty('image', TEST_IMAGE);
    expect(deployCall[0]).toHaveProperty('verification');
  });

  test('2. with minimal verification returns reputation_eligible: false', async () => {
    const result = await launchImage({
      image: TEST_IMAGE,
      target: 'docker',
      owner: VALID_OWNER,
      name: 'test-agent-minimal',
      verification: 'minimal',
    });

    expect(result.success).toBe(true);
    expect(result.reputation_eligible).toBe(false);
    expect(result.verification_mode).toBe('minimal');
  });

  test('3. with full verification returns reputation_eligible: true', async () => {
    const result = await launchImage({
      image: TEST_IMAGE,
      target: 'docker',
      owner: VALID_OWNER,
      name: 'test-agent-full',
      verification: 'full',
    });

    expect(result.success).toBe(true);
    expect(result.reputation_eligible).toBe(true);
    expect(result.verification_mode).toBe('full');
  });

  test('4. reuses existing passport_id when provided', async () => {
    const result = await launchImage({
      image: TEST_IMAGE,
      target: 'docker',
      owner: VALID_OWNER,
      name: 'test-agent-reuse',
      passport_id: 'passport_existing_123',
    });

    expect(result.success).toBe(true);
    expect(result.passport_id).toBe('passport_existing_123');
  });

  test('5. with custom port', async () => {
    const result = await launchImage({
      image: TEST_IMAGE,
      target: 'docker',
      owner: VALID_OWNER,
      name: 'test-agent-port',
      port: 8080,
    });

    expect(result.success).toBe(true);

    // Verify the deployer received the custom port
    const deployCall = mockDeployer.deploy.mock.calls[0];
    const imageInput = deployCall[0];
    expect(imageInput.port).toBe(8080);
  });

  test('6. with custom env_vars merged', async () => {
    const customEnv = { MY_VAR: 'my_value', ANOTHER: 'hello' };

    const result = await launchImage({
      image: TEST_IMAGE,
      target: 'docker',
      owner: VALID_OWNER,
      name: 'test-agent-env',
      env_vars: customEnv,
    });

    expect(result.success).toBe(true);

    // Verify custom env vars were merged into the deploy input
    const deployCall = mockDeployer.deploy.mock.calls[0];
    const imageInput = deployCall[0];
    expect(imageInput.env_vars).toHaveProperty('MY_VAR', 'my_value');
    expect(imageInput.env_vars).toHaveProperty('ANOTHER', 'hello');
    // Standard Lucid env vars should also be present
    expect(imageInput.env_vars).toHaveProperty('LUCID_PASSPORT_ID');
    expect(imageInput.env_vars).toHaveProperty('LUCID_VERIFICATION_MODE');
  });

  test('7. with missing image returns validation error', async () => {
    const result = await launchImage({
      image: '',
      target: 'docker',
      owner: VALID_OWNER,
      name: 'test-agent-no-image',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/image/i);
    // Deployer should NOT have been called
    expect(mockDeployer.deploy).not.toHaveBeenCalled();
  });

  test('8. with invalid owner returns passport error', async () => {
    // Override the shared mock to simulate a passport creation failure
    mockCreatePassport.mockResolvedValueOnce({
      ok: false,
      error: 'Invalid owner address: must be a valid Solana or EVM wallet address',
    });

    const result = await launchImage({
      image: TEST_IMAGE,
      target: 'docker',
      owner: 'invalid-not-a-wallet',
      name: 'test-agent-bad-owner',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/passport|owner|wallet/i);
    // Deployer should NOT have been called
    expect(mockDeployer.deploy).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Path B: launchBaseRuntime
// ===========================================================================

describe('launchBaseRuntime', () => {
  test('9. deploys with model+prompt', async () => {
    const result = await launchBaseRuntime({
      model: 'gpt-4o',
      prompt: 'You are a helpful assistant',
      target: 'docker',
      owner: VALID_OWNER,
      name: 'base-agent',
    });

    expect(result.success).toBe(true);
    expect(result.passport_id).toBeDefined();
    expect(result.deployment_id).toBeDefined();
    expect(mockDeployer.deploy).toHaveBeenCalledTimes(1);

    // Verify the image is the base runtime image
    const deployCall = mockDeployer.deploy.mock.calls[0];
    const imageInput = deployCall[0];
    expect(imageInput.image).toMatch(/ghcr\.io\/lucid-fdn\/agent-runtime/);
    // Verify model and prompt are in env vars
    expect(imageInput.env_vars).toHaveProperty('LUCID_MODEL', 'gpt-4o');
    expect(imageInput.env_vars).toHaveProperty('LUCID_PROMPT', 'You are a helpful assistant');
  });

  test('10. always returns reputation_eligible: true (forced full)', async () => {
    const result = await launchBaseRuntime({
      model: 'gpt-4o',
      prompt: 'You are a helpful assistant',
      target: 'docker',
      owner: VALID_OWNER,
      name: 'base-agent-rep',
    });

    expect(result.success).toBe(true);
    expect(result.reputation_eligible).toBe(true);
    // Base runtime always uses full verification
    expect(result.verification_mode).toBe('full');
  });

  test('11. returns config_hash', async () => {
    const result = await launchBaseRuntime({
      model: 'gpt-4o',
      prompt: 'You are a helpful assistant',
      target: 'docker',
      owner: VALID_OWNER,
      name: 'base-agent-hash',
    });

    expect(result.success).toBe(true);
    expect(result.config_hash).toBeDefined();
    expect(typeof result.config_hash).toBe('string');
    // config_hash is first 16 hex chars of SHA-256
    expect(result.config_hash).toMatch(/^[0-9a-f]{16}$/);

    // Verify the config_hash is passed as env var to the deployer
    const deployCall = mockDeployer.deploy.mock.calls[0];
    const imageInput = deployCall[0];
    expect(imageInput.env_vars).toHaveProperty('LUCID_CONFIG_HASH', result.config_hash);
  });

  test('12. with missing model returns validation error', async () => {
    const result = await launchBaseRuntime({
      model: '',
      prompt: 'You are a helpful assistant',
      target: 'docker',
      owner: VALID_OWNER,
      name: 'base-agent-no-model',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/model/i);
    // Deployer should NOT have been called
    expect(mockDeployer.deploy).not.toHaveBeenCalled();
  });
});
