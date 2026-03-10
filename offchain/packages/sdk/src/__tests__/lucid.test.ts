import { Lucid } from '../lucid';
import {
  LucidError,
  ChainError,
  ChainFeatureUnavailable,
  ValidationError,
  SolanaError,
  EVMError,
  NetworkError,
  TimeoutError,
  RateLimitError,
  DeployError,
  AuthError,
} from '../errors';

describe('Lucid SDK', () => {
  describe('constructor', () => {
    it('should instantiate with minimal config', () => {
      const lucid = new Lucid({
        orchestratorKey: 'deadbeef'.repeat(8),
        chains: {
          solana: { rpc: 'http://127.0.0.1:8899' },
        },
      });

      expect(lucid).toBeInstanceOf(Lucid);
    });

    it('should expose all stable namespaces', () => {
      const lucid = new Lucid({
        orchestratorKey: 'deadbeef'.repeat(8),
        chains: { solana: { rpc: 'http://127.0.0.1:8899' } },
      });

      expect(lucid.passport).toBeDefined();
      expect(lucid.receipt).toBeDefined();
      expect(lucid.epoch).toBeDefined();
      expect(lucid.agent).toBeDefined();
      expect(lucid.payment).toBeDefined();
      expect(lucid.deploy).toBeDefined();
      expect(lucid.crypto).toBeDefined();
      expect(lucid.chain).toBeDefined();
    });

    it('should accept dual-chain config', () => {
      const lucid = new Lucid({
        orchestratorKey: 'deadbeef'.repeat(8),
        chains: {
          solana: { rpc: 'http://127.0.0.1:8899' },
          evm: { rpc: 'https://base-sepolia.example.com', privateKey: '0xdeadbeef' },
        },
        anchoringChains: ['solana-devnet', 'base'],
      });

      expect(lucid).toBeInstanceOf(Lucid);
    });

    it('should set environment variables from config', () => {
      const lucid = new Lucid({
        orchestratorKey: 'test-key-123',
        chains: { solana: { rpc: 'http://custom-rpc:8899' } },
        db: 'postgresql://localhost/lucid_test',
        nftProvider: 'metaplex-core',
        deployTarget: 'railway',
        depinStorage: 'arweave',
        anchoringChains: ['solana-devnet', 'base'],
      });

      expect(process.env.LUCID_ORCHESTRATOR_SECRET_KEY).toBe('test-key-123');
      expect(process.env.DATABASE_URL).toBe('postgresql://localhost/lucid_test');
      expect(process.env.NFT_PROVIDER).toBe('metaplex-core');
      expect(process.env.DEPLOY_TARGET).toBe('railway');
      expect(process.env.DEPIN_PERMANENT_PROVIDER).toBe('arweave');
      expect(process.env.ANCHORING_CHAINS).toBe('solana-devnet,base');
    });
  });

  describe('chain.capabilities', () => {
    it('should return Solana capabilities', () => {
      const lucid = new Lucid({
        orchestratorKey: 'deadbeef'.repeat(8),
        chains: { solana: { rpc: 'http://127.0.0.1:8899' } },
      });

      const caps = lucid.chain.capabilities('solana');
      expect(caps.epoch).toBe(true);
      expect(caps.passport).toBe(true);
      expect(caps.escrow).toBe(true);
      expect(caps.sessionKeys).toBe(true);
      expect(caps.zkml).toBe(false);
      expect(caps.paymaster).toBe(false);
    });

    it('should return EVM capabilities', () => {
      const lucid = new Lucid({
        orchestratorKey: 'deadbeef'.repeat(8),
        chains: { solana: { rpc: 'http://127.0.0.1:8899' } },
      });

      const caps = lucid.chain.capabilities('evm');
      expect(caps.epoch).toBe(true);
      expect(caps.passport).toBe(true);
      expect(caps.zkml).toBe(true);
      expect(caps.paymaster).toBe(true);
      expect(caps.sessionKeys).toBe(false);
    });
  });

  describe('preview namespace', () => {
    it('should log a warning on first access', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const lucid = new Lucid({
        orchestratorKey: 'deadbeef'.repeat(8),
        chains: { solana: { rpc: 'http://127.0.0.1:8899' } },
      });

      // First access triggers warning
      const p = lucid.preview;
      expect(p).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('preview features'),
      );

      // Second access does NOT warn again
      warnSpy.mockClear();
      const p2 = lucid.preview;
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});

describe('Error hierarchy', () => {
  it('LucidError extends Error with code', () => {
    const err = new LucidError('test', 'TEST_CODE');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LucidError);
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test');
    expect(err.name).toBe('LucidError');
  });

  it('ChainError includes chain', () => {
    const err = new ChainError('fail', 'CHAIN_ERR', 'solana');
    expect(err).toBeInstanceOf(LucidError);
    expect(err.chain).toBe('solana');
  });

  it('SolanaError sets chain to solana', () => {
    const err = new SolanaError('tx failed', 'SOL_ERR', '5abc...');
    expect(err).toBeInstanceOf(ChainError);
    expect(err.chain).toBe('solana');
    expect(err.txSignature).toBe('5abc...');
  });

  it('EVMError sets chain to evm', () => {
    const err = new EVMError('revert', 'EVM_ERR', '0xabc');
    expect(err).toBeInstanceOf(ChainError);
    expect(err.chain).toBe('evm');
    expect(err.txHash).toBe('0xabc');
  });

  it('ChainFeatureUnavailable has feature and human-readable message', () => {
    const err = new ChainFeatureUnavailable('escrow', 'evm');
    expect(err).toBeInstanceOf(ChainError);
    expect(err.feature).toBe('escrow');
    expect(err.chain).toBe('evm');
    expect(err.message).toBe('escrow is not yet available on evm');
    expect(err.code).toBe('CHAIN_FEATURE_UNAVAILABLE');
  });

  it('ValidationError includes field info', () => {
    const err = new ValidationError('bad slug', 'slug', 'alphanumeric');
    expect(err).toBeInstanceOf(LucidError);
    expect(err.field).toBe('slug');
    expect(err.expected).toBe('alphanumeric');
  });

  it('AuthError has AUTH_ERROR code', () => {
    const err = new AuthError('unauthorized');
    expect(err).toBeInstanceOf(LucidError);
    expect(err.code).toBe('AUTH_ERROR');
  });

  it('DeployError includes target', () => {
    const err = new DeployError('build failed', 'railway', 'dep-123');
    expect(err.target).toBe('railway');
    expect(err.deploymentId).toBe('dep-123');
  });

  it('NetworkError includes url and statusCode', () => {
    const err = new NetworkError('timeout', 'https://rpc.example.com', 503);
    expect(err.url).toBe('https://rpc.example.com');
    expect(err.statusCode).toBe(503);
  });

  it('TimeoutError includes timing info', () => {
    const err = new TimeoutError('slow', 5000, 3000);
    expect(err.operationMs).toBe(5000);
    expect(err.limitMs).toBe(3000);
  });

  it('RateLimitError includes retry hint', () => {
    const err = new RateLimitError('throttled', 60000);
    expect(err.retryAfterMs).toBe(60000);
  });

  it('errors serialize to JSON with all fields', () => {
    const err = new ChainFeatureUnavailable('escrow', 'evm');
    const json = err.toJSON();
    expect(json.code).toBe('CHAIN_FEATURE_UNAVAILABLE');
    expect(json.feature).toBe('escrow');
    expect(json.chain).toBe('evm');
    expect(json.message).toBe('escrow is not yet available on evm');
  });
});
