import { Lucid } from '../lucid';
import type { MMRNamespace } from '../lucid';
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

const TEST_KEY = 'deadbeef'.repeat(8);

function makeLucid(overrides?: Partial<ConstructorParameters<typeof Lucid>[0]>) {
  return new Lucid({
    orchestratorKey: TEST_KEY,
    chains: { solana: { rpc: 'http://127.0.0.1:8899' } },
    ...overrides,
  });
}

describe('Lucid SDK', () => {
  describe('constructor', () => {
    it('should instantiate with minimal config', () => {
      const lucid = makeLucid();
      expect(lucid).toBeInstanceOf(Lucid);
    });

    it('should expose all stable namespaces', () => {
      const lucid = makeLucid();
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
      const lucid = makeLucid({
        chains: {
          solana: { rpc: 'http://127.0.0.1:8899' },
          evm: { rpc: 'https://base-sepolia.example.com', privateKey: '0xdeadbeef' },
        },
        anchoringChains: ['solana-devnet', 'base'],
      });
      expect(lucid).toBeInstanceOf(Lucid);
    });

    it('should set environment variables from config', () => {
      makeLucid({
        db: 'postgresql://localhost/lucid_test',
        nftProvider: 'metaplex-core',
        deployTarget: 'railway',
        depinStorage: 'arweave',
        anchoringChains: ['solana-devnet', 'base'],
      });

      expect(process.env.LUCID_ORCHESTRATOR_SECRET_KEY).toBe(TEST_KEY);
      expect(process.env.DATABASE_URL).toBe('postgresql://localhost/lucid_test');
      expect(process.env.NFT_PROVIDER).toBe('metaplex-core');
      expect(process.env.DEPLOY_TARGET).toBe('railway');
      expect(process.env.DEPIN_PERMANENT_PROVIDER).toBe('arweave');
      expect(process.env.ANCHORING_CHAINS).toBe('solana-devnet,base');
    });
  });

  describe('Lucid.fromEnv()', () => {
    const savedEnv = { ...process.env };

    afterEach(() => {
      // Restore env
      for (const key of Object.keys(process.env)) {
        if (!(key in savedEnv)) delete process.env[key];
      }
      Object.assign(process.env, savedEnv);
    });

    it('should create instance from environment variables', () => {
      process.env.LUCID_ORCHESTRATOR_SECRET_KEY = TEST_KEY;
      process.env.SOLANA_RPC_URL = 'http://127.0.0.1:8899';

      const lucid = Lucid.fromEnv();
      expect(lucid).toBeInstanceOf(Lucid);
    });

    it('should throw without orchestrator key', () => {
      delete process.env.LUCID_ORCHESTRATOR_SECRET_KEY;
      expect(() => Lucid.fromEnv()).toThrow('LUCID_ORCHESTRATOR_SECRET_KEY is required');
    });

    it('should throw without any chain RPC', () => {
      process.env.LUCID_ORCHESTRATOR_SECRET_KEY = TEST_KEY;
      delete process.env.SOLANA_RPC_URL;
      delete process.env.EVM_RPC_URL;
      expect(() => Lucid.fromEnv()).toThrow('At least one of SOLANA_RPC_URL or EVM_RPC_URL must be set');
    });
  });

  describe('chain.capabilities (fallback)', () => {
    it('should return conservative Solana capabilities', () => {
      const lucid = makeLucid();
      const caps = lucid.chain.capabilities('solana');
      expect(caps.epoch).toBe(true);
      expect(caps.passport).toBe(true);
      expect(caps.escrow).toBe(false);       // Not wired to IEscrowAdapter
      expect(caps.sessionKeys).toBe(false);   // Requires agentWalletProgram config
      expect(caps.zkml).toBe(false);
      expect(caps.paymaster).toBe(false);
    });

    it('should return conservative EVM capabilities', () => {
      const lucid = makeLucid();
      const caps = lucid.chain.capabilities('evm');
      expect(caps.epoch).toBe(true);
      expect(caps.passport).toBe(true);
      expect(caps.zkml).toBe(true);
      expect(caps.paymaster).toBe(false);     // Requires paymaster config
      expect(caps.sessionKeys).toBe(false);   // Requires sessionManager config
      expect(caps.escrow).toBe(false);        // Requires escrowContract config
    });

    it('should detect solana-devnet as Solana', () => {
      const lucid = makeLucid();
      const caps = lucid.chain.capabilities('solana-devnet');
      expect(caps.zkml).toBe(false);
    });
  });

  describe('chain.adapter', () => {
    it('should return a Promise', async () => {
      const lucid = makeLucid();
      const result = lucid.chain.adapter('solana-devnet');
      expect(result).toBeInstanceOf(Promise);
      // Will reject since no adapter is registered in test env
      await expect(result).rejects.toThrow();
    });
  });

  describe('crypto.mmr (stateful)', () => {
    it('should persist state across calls', () => {
      const lucid = makeLucid();
      const mmr = lucid.crypto.mmr;

      // Append a leaf and get the root
      const hash = lucid.crypto.hash('test data');
      const rootAfterAppend = mmr.append(hash);
      expect(typeof rootAfterAppend).toBe('string');
      expect(rootAfterAppend.length).toBeGreaterThan(0);

      // root() should return the same root (state persisted)
      expect(mmr.root()).toBe(rootAfterAppend);

      // size should be > 0
      expect(mmr.size()).toBeGreaterThan(0);
    });

    it('should generate proofs for appended leaves', () => {
      const lucid = makeLucid();
      const mmr = lucid.crypto.mmr;
      mmr.reset();

      const hash = lucid.crypto.hash('proof test');
      mmr.append(hash);

      const proof = mmr.prove(0);
      expect(proof).not.toBeNull();
      expect(proof?.leafIndex).toBe(0);
    });

    it('should return null for non-existent leaf index', () => {
      const lucid = makeLucid();
      const mmr = lucid.crypto.mmr;
      mmr.reset();

      const proof = mmr.prove(999);
      expect(proof).toBeNull();
    });

    it('should reset state', () => {
      const lucid = makeLucid();
      const mmr = lucid.crypto.mmr;

      mmr.append(lucid.crypto.hash('a'));
      expect(mmr.size()).toBeGreaterThan(0);

      mmr.reset();
      expect(mmr.size()).toBe(0);
    });
  });

  describe('preview namespace', () => {
    it('should log a warning on first access', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const lucid = makeLucid();

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

  it('LucidError.toJSON includes cause message', () => {
    const cause = new Error('original error');
    const err = new LucidError('wrapped', 'WRAP', cause);
    const json = err.toJSON();
    expect(json.cause).toBe('original error');
  });
});
