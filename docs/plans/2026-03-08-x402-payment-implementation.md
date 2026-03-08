# x402 Universal Payment System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make x402 the single, universal, facilitator-agnostic payment interface for Lucid L2 — every paid interaction flows through HTTP 402 with dynamic splits, multi-chain support, and zero breaking changes.

**Architecture:** Facilitator adapter pattern (Direct/Coinbase/PayAI) behind a rewritten x402 middleware. Split resolution at routing time determines single-recipient or splitter-contract payments. In-memory state migrated to Redis (spentProofs) and PostgreSQL (payouts, pricing, revenue). All existing routes untouched — `requirePayment()` added as opt-in middleware.

**Tech Stack:** Express, TypeScript, PostgreSQL (Supabase), Redis (ioredis), viem, Jest (ts-jest)

**Design Doc:** `docs/plans/2026-03-08-x402-payment-architecture-design.md`

---

## Task 1: Payment Types & Facilitator Interface

**Files:**
- Create: `offchain/packages/engine/src/payment/types.ts`
- Create: `offchain/packages/engine/src/payment/facilitators/interface.ts`
- Test: `offchain/packages/engine/src/__tests__/payment/facilitator-interface.test.ts`

**Step 1: Write the failing test**

```typescript
// offchain/packages/engine/src/__tests__/payment/facilitator-interface.test.ts
import type {
  X402Facilitator,
  PaymentProof,
  PaymentExpectation,
  VerificationResult,
  PaymentInstructions,
  PaymentParams,
  ChainConfig,
  TokenConfig,
} from '../../payment/facilitators/interface';

describe('X402Facilitator interface', () => {
  it('should allow implementing a mock facilitator', () => {
    const mock: X402Facilitator = {
      name: 'mock',
      supportedChains: [{ name: 'base', chainId: 8453, rpcUrl: 'https://mainnet.base.org' }],
      supportedTokens: [{ symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, chain: 'base' }],
      verify: async (proof: PaymentProof, expected: PaymentExpectation): Promise<VerificationResult> => {
        return { valid: true, txHash: proof.txHash };
      },
      instructions: (params: PaymentParams): PaymentInstructions => {
        return {
          chain: params.chain,
          token: params.token.symbol,
          tokenAddress: params.token.address,
          amount: params.amount.toString(),
          recipient: params.recipient,
          facilitator: 'mock',
        };
      },
    };

    expect(mock.name).toBe('mock');
    expect(mock.supportedChains).toHaveLength(1);
    expect(mock.supportedTokens).toHaveLength(1);
  });

  it('should verify a payment proof', async () => {
    const mock: X402Facilitator = {
      name: 'mock',
      supportedChains: [],
      supportedTokens: [],
      verify: async () => ({ valid: true, txHash: '0xabc' }),
      instructions: () => ({
        chain: 'base', token: 'USDC', tokenAddress: '0x', amount: '1000',
        recipient: '0x', facilitator: 'mock',
      }),
    };

    const result = await mock.verify(
      { chain: 'base', txHash: '0xabc' },
      { amount: 1000n, token: { symbol: 'USDC', address: '0x', decimals: 6, chain: 'base' }, recipient: '0x' },
    );
    expect(result.valid).toBe(true);
    expect(result.txHash).toBe('0xabc');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern='payment/facilitator-interface' --no-coverage`
Expected: FAIL — module not found

**Step 3: Write types and interface**

```typescript
// offchain/packages/engine/src/payment/types.ts
export interface ChainConfig {
  name: string;          // 'base', 'solana', 'avalanche', etc.
  chainId?: number;      // EVM chain ID (undefined for non-EVM)
  rpcUrl: string;
}

export interface TokenConfig {
  symbol: string;        // 'USDC', 'LUCID', 'SOL'
  address: string;       // Contract address (EVM) or mint (Solana)
  decimals: number;
  chain: string;         // Which chain this token config is for
}

export interface PaymentProof {
  chain: string;
  txHash?: string;
  authorization?: string;           // EIP-3009 signed authorization
  facilitatorData?: Record<string, unknown>;
}

export interface PaymentExpectation {
  amount: bigint;
  token: TokenConfig;
  recipient: string;
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
  txHash?: string;
  settledAmount?: bigint;
  metadata?: Record<string, unknown>;
}

export interface PaymentParams {
  amount: bigint;
  token: TokenConfig;
  chain: string;
  recipient: string;
}

export interface PaymentInstructions {
  chain: string;
  token: string;
  tokenAddress: string;
  amount: string;
  recipient: string;
  facilitator: string;
  facilitatorUrl?: string;
  scheme?: string;
}

export interface SplitRecipient {
  role: 'compute' | 'model' | 'protocol' | 'orchestrator';
  passportId?: string;
  walletAddress: string;
  bps: number;
}

export interface SplitResolution {
  recipients: SplitRecipient[];
  useSplitter: boolean;
  splitterAddress?: string;
  totalAmount: bigint;
  token: TokenConfig;
  chain: string;
}

export interface X402ResponseV2 {
  version: '2';
  facilitator: string;
  description: string;
  payment: PaymentInstructions;
  alternatives?: PaymentInstructions[];
  splits?: Array<{ role: string; passport?: string; bps: number }>;
  expires?: number;
}
```

```typescript
// offchain/packages/engine/src/payment/facilitators/interface.ts
import type {
  ChainConfig,
  TokenConfig,
  PaymentProof,
  PaymentExpectation,
  VerificationResult,
  PaymentParams,
  PaymentInstructions,
} from '../types';

export interface X402Facilitator {
  readonly name: string;
  readonly supportedChains: ChainConfig[];
  readonly supportedTokens: TokenConfig[];

  verify(proof: PaymentProof, expected: PaymentExpectation): Promise<VerificationResult>;
  instructions(params: PaymentParams): PaymentInstructions;
}

export type { ChainConfig, TokenConfig, PaymentProof, PaymentExpectation, VerificationResult, PaymentParams, PaymentInstructions };
```

**Step 4: Run test to verify it passes**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern='payment/facilitator-interface' --no-coverage`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
cd /c/Lucid-L2 && git add offchain/packages/engine/src/payment/ offchain/packages/engine/src/__tests__/payment/
git commit -m "feat(payment): add x402 facilitator interface and payment types"
```

---

## Task 2: DirectFacilitator (Port Existing Verification Logic)

**Files:**
- Create: `offchain/packages/engine/src/payment/facilitators/direct.ts`
- Test: `offchain/packages/engine/src/__tests__/payment/direct-facilitator.test.ts`

**Step 1: Write the failing test**

```typescript
// offchain/packages/engine/src/__tests__/payment/direct-facilitator.test.ts
import { DirectFacilitator } from '../../payment/facilitators/direct';
import type { PaymentProof, PaymentExpectation, TokenConfig } from '../../payment/types';

const USDC_BASE: TokenConfig = {
  symbol: 'USDC',
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  decimals: 6,
  chain: 'base',
};

describe('DirectFacilitator', () => {
  let facilitator: DirectFacilitator;

  beforeEach(() => {
    facilitator = new DirectFacilitator({
      chains: [{ name: 'base', chainId: 8453, rpcUrl: 'https://mainnet.base.org' }],
      tokens: [USDC_BASE],
      maxProofAge: 300,
    });
  });

  it('should have name "direct"', () => {
    expect(facilitator.name).toBe('direct');
  });

  it('should list supported chains', () => {
    expect(facilitator.supportedChains).toHaveLength(1);
    expect(facilitator.supportedChains[0].name).toBe('base');
  });

  it('should list supported tokens', () => {
    expect(facilitator.supportedTokens).toHaveLength(1);
    expect(facilitator.supportedTokens[0].symbol).toBe('USDC');
  });

  it('should generate payment instructions', () => {
    const instructions = facilitator.instructions({
      amount: 30000n,
      token: USDC_BASE,
      chain: 'base',
      recipient: '0xRecipient',
    });

    expect(instructions.chain).toBe('base');
    expect(instructions.token).toBe('USDC');
    expect(instructions.amount).toBe('30000');
    expect(instructions.recipient).toBe('0xRecipient');
    expect(instructions.facilitator).toBe('direct');
    expect(instructions.scheme).toBe('exact');
  });

  it('should reject proof with missing txHash', async () => {
    const proof: PaymentProof = { chain: 'base' };
    const expected: PaymentExpectation = { amount: 30000n, token: USDC_BASE, recipient: '0xR' };

    const result = await facilitator.verify(proof, expected);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('txHash');
  });

  it('should reject proof for unsupported chain', async () => {
    const proof: PaymentProof = { chain: 'ethereum', txHash: '0xabc' };
    const expected: PaymentExpectation = { amount: 30000n, token: USDC_BASE, recipient: '0xR' };

    const result = await facilitator.verify(proof, expected);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unsupported chain');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern='direct-facilitator' --no-coverage`
Expected: FAIL — module not found

**Step 3: Write DirectFacilitator**

Port the existing verification logic from `gateway-lite/src/middleware/x402.ts` (lines 167-236) into the facilitator adapter pattern:

```typescript
// offchain/packages/engine/src/payment/facilitators/direct.ts
import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import type { X402Facilitator } from './interface';
import type {
  ChainConfig,
  TokenConfig,
  PaymentProof,
  PaymentExpectation,
  VerificationResult,
  PaymentParams,
  PaymentInstructions,
} from '../types';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const VIEM_CHAINS: Record<string, any> = {
  base,
  'base-sepolia': baseSepolia,
};

export interface DirectFacilitatorConfig {
  chains: ChainConfig[];
  tokens: TokenConfig[];
  maxProofAge?: number; // seconds, default 300
}

export class DirectFacilitator implements X402Facilitator {
  readonly name = 'direct';
  readonly supportedChains: ChainConfig[];
  readonly supportedTokens: TokenConfig[];
  private maxProofAge: number;

  constructor(config: DirectFacilitatorConfig) {
    this.supportedChains = config.chains;
    this.supportedTokens = config.tokens;
    this.maxProofAge = config.maxProofAge ?? 300;
  }

  instructions(params: PaymentParams): PaymentInstructions {
    return {
      chain: params.chain,
      token: params.token.symbol,
      tokenAddress: params.token.address,
      amount: params.amount.toString(),
      recipient: params.recipient,
      facilitator: this.name,
      scheme: 'exact',
    };
  }

  async verify(proof: PaymentProof, expected: PaymentExpectation): Promise<VerificationResult> {
    if (!proof.txHash) {
      return { valid: false, reason: 'Missing txHash in payment proof' };
    }

    const chainConfig = this.supportedChains.find(c => c.name === proof.chain);
    if (!chainConfig) {
      return { valid: false, reason: `Unsupported chain: ${proof.chain}` };
    }

    const viemChain = VIEM_CHAINS[proof.chain];
    if (!viemChain) {
      return { valid: false, reason: `No viem chain config for: ${proof.chain}` };
    }

    const client = createPublicClient({
      chain: viemChain,
      transport: http(chainConfig.rpcUrl),
    });

    try {
      const receipt = await client.getTransactionReceipt({
        hash: proof.txHash as `0x${string}`,
      });

      if (receipt.status !== 'success') {
        return { valid: false, reason: 'Transaction failed on-chain' };
      }

      // Check transaction age
      const block = await client.getBlock({ blockNumber: receipt.blockNumber });
      const txAge = Math.floor(Date.now() / 1000) - Number(block.timestamp);
      if (txAge > this.maxProofAge) {
        return { valid: false, reason: `Payment too old (${txAge}s > ${this.maxProofAge}s)` };
      }

      // Look for ERC-20 Transfer event to recipient
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== expected.token.address.toLowerCase()) continue;

        const topics: string[] = (log as any).topics || [];
        if (topics[0] !== TRANSFER_TOPIC) continue;

        const toAddress = '0x' + (topics[2] || '').slice(26);
        if (toAddress.toLowerCase() !== expected.recipient.toLowerCase()) continue;

        const value = BigInt(log.data);
        if (value >= expected.amount) {
          return { valid: true, txHash: proof.txHash, settledAmount: value };
        }
      }

      return {
        valid: false,
        reason: `No qualifying transfer to ${expected.recipient} found in tx`,
      };
    } catch (error) {
      return {
        valid: false,
        reason: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern='direct-facilitator' --no-coverage`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
cd /c/Lucid-L2 && git add offchain/packages/engine/src/payment/facilitators/direct.ts offchain/packages/engine/src/__tests__/payment/
git commit -m "feat(payment): add DirectFacilitator with EVM on-chain verification"
```

---

## Task 3: FacilitatorRegistry

**Files:**
- Create: `offchain/packages/engine/src/payment/facilitators/index.ts`
- Test: `offchain/packages/engine/src/__tests__/payment/facilitator-registry.test.ts`

**Step 1: Write the failing test**

```typescript
// offchain/packages/engine/src/__tests__/payment/facilitator-registry.test.ts
import { FacilitatorRegistry } from '../../payment/facilitators';
import type { X402Facilitator } from '../../payment/facilitators/interface';

function createMockFacilitator(name: string): X402Facilitator {
  return {
    name,
    supportedChains: [],
    supportedTokens: [],
    verify: async () => ({ valid: true }),
    instructions: () => ({
      chain: 'base', token: 'USDC', tokenAddress: '0x', amount: '1000',
      recipient: '0x', facilitator: name,
    }),
  };
}

describe('FacilitatorRegistry', () => {
  let registry: FacilitatorRegistry;

  beforeEach(() => {
    registry = new FacilitatorRegistry();
  });

  it('should register and retrieve a facilitator', () => {
    const mock = createMockFacilitator('mock');
    registry.register(mock);
    expect(registry.get('mock')).toBe(mock);
  });

  it('should return undefined for unregistered facilitator', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('should set and get default facilitator', () => {
    const mock = createMockFacilitator('mock');
    registry.register(mock);
    registry.setDefault('mock');
    expect(registry.getDefault()).toBe(mock);
  });

  it('should throw when setting default to unregistered facilitator', () => {
    expect(() => registry.setDefault('nonexistent')).toThrow('not registered');
  });

  it('should list all registered facilitators', () => {
    registry.register(createMockFacilitator('a'));
    registry.register(createMockFacilitator('b'));
    expect(registry.list()).toHaveLength(2);
  });

  it('should use first registered as default if none set', () => {
    const first = createMockFacilitator('first');
    registry.register(first);
    registry.register(createMockFacilitator('second'));
    expect(registry.getDefault()).toBe(first);
  });

  it('should throw getDefault when no facilitators registered', () => {
    expect(() => registry.getDefault()).toThrow('No facilitators registered');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern='facilitator-registry' --no-coverage`
Expected: FAIL

**Step 3: Write FacilitatorRegistry**

```typescript
// offchain/packages/engine/src/payment/facilitators/index.ts
import type { X402Facilitator } from './interface';

export class FacilitatorRegistry {
  private facilitators = new Map<string, X402Facilitator>();
  private defaultName: string | null = null;

  register(facilitator: X402Facilitator): void {
    this.facilitators.set(facilitator.name, facilitator);
  }

  get(name: string): X402Facilitator | undefined {
    return this.facilitators.get(name);
  }

  setDefault(name: string): void {
    if (!this.facilitators.has(name)) {
      throw new Error(`Facilitator "${name}" not registered`);
    }
    this.defaultName = name;
  }

  getDefault(): X402Facilitator {
    if (this.defaultName && this.facilitators.has(this.defaultName)) {
      return this.facilitators.get(this.defaultName)!;
    }
    const first = this.facilitators.values().next();
    if (first.done) {
      throw new Error('No facilitators registered');
    }
    return first.value;
  }

  list(): X402Facilitator[] {
    return Array.from(this.facilitators.values());
  }
}

export { X402Facilitator } from './interface';
export { DirectFacilitator } from './direct';
export type { DirectFacilitatorConfig } from './direct';
```

**Step 4: Run test to verify it passes**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern='facilitator-registry' --no-coverage`
Expected: PASS (7 tests)

**Step 5: Commit**

```bash
cd /c/Lucid-L2 && git add offchain/packages/engine/src/payment/
git commit -m "feat(payment): add FacilitatorRegistry with default selection"
```

---

## Task 4: Database Migration

**Files:**
- Create: `infrastructure/migrations/20260308_payment_system.sql`

**Step 1: Write migration**

```sql
-- infrastructure/migrations/20260308_payment_system.sql
-- x402 Universal Payment System tables

BEGIN;

-- Asset pricing configuration
CREATE TABLE IF NOT EXISTS asset_pricing (
  passport_id TEXT PRIMARY KEY,
  price_per_call BIGINT,                              -- smallest token unit
  price_per_token BIGINT,                             -- per LLM token, nullable
  price_subscription_hour BIGINT,                     -- hourly subscription, nullable
  accepted_tokens TEXT[] DEFAULT ARRAY['USDC'],
  accepted_chains TEXT[] DEFAULT ARRAY['base'],
  payout_address TEXT NOT NULL,
  custom_split_bps JSONB,                             -- override default splits
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Revenue tracking per asset per run
CREATE TABLE IF NOT EXISTS asset_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  amount BIGINT NOT NULL,
  token TEXT NOT NULL DEFAULT 'USDC',
  chain TEXT NOT NULL DEFAULT 'base',
  role TEXT NOT NULL CHECK (role IN ('compute', 'model', 'protocol', 'orchestrator')),
  tx_hash TEXT,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'withdrawn')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_revenue_passport ON asset_revenue(passport_id);
CREATE INDEX IF NOT EXISTS idx_asset_revenue_status ON asset_revenue(passport_id, status);
CREATE INDEX IF NOT EXISTS idx_asset_revenue_run ON asset_revenue(run_id);

-- Payout splits (replaces in-memory payoutStore)
CREATE TABLE IF NOT EXISTS payout_splits (
  run_id TEXT PRIMARY KEY,
  total_amount BIGINT NOT NULL,
  token TEXT NOT NULL DEFAULT 'USDC',
  chain TEXT NOT NULL DEFAULT 'base',
  split_config JSONB NOT NULL,
  recipients JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Payout execution tracking (replaces in-memory executionStore)
CREATE TABLE IF NOT EXISTS payout_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  chain TEXT NOT NULL,
  tx_hash TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payout_exec_run ON payout_executions(run_id);
CREATE INDEX IF NOT EXISTS idx_payout_exec_status ON payout_executions(status);

-- x402 spent proofs (backup for Redis — optional fallback)
CREATE TABLE IF NOT EXISTS x402_spent_proofs (
  tx_hash TEXT PRIMARY KEY,
  chain TEXT NOT NULL,
  amount BIGINT NOT NULL,
  verified_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '1 hour')
);

CREATE INDEX IF NOT EXISTS idx_spent_proofs_expires ON x402_spent_proofs(expires_at);

COMMIT;
```

**Step 2: Verify migration syntax**

Run: `cd /c/Lucid-L2 && cat infrastructure/migrations/20260308_payment_system.sql | head -5`
Expected: Shows BEGIN and first CREATE TABLE

**Step 3: Commit**

```bash
cd /c/Lucid-L2 && git add infrastructure/migrations/20260308_payment_system.sql
git commit -m "feat(payment): add migration for asset_pricing, revenue, payout tables"
```

---

## Task 5: spentProofs Redis Migration

**Files:**
- Create: `offchain/packages/engine/src/payment/spentProofsStore.ts`
- Test: `offchain/packages/engine/src/__tests__/payment/spent-proofs-store.test.ts`

**Step 1: Write the failing test**

```typescript
// offchain/packages/engine/src/__tests__/payment/spent-proofs-store.test.ts
import { SpentProofsStore } from '../../payment/spentProofsStore';

describe('SpentProofsStore', () => {
  describe('InMemorySpentProofsStore (fallback)', () => {
    let store: SpentProofsStore;

    beforeEach(() => {
      store = SpentProofsStore.createInMemory();
    });

    it('should report unspent proof as not spent', async () => {
      expect(await store.isSpent('0xabc')).toBe(false);
    });

    it('should mark proof as spent', async () => {
      await store.markSpent('0xabc', 300);
      expect(await store.isSpent('0xabc')).toBe(true);
    });

    it('should normalize hash to lowercase', async () => {
      await store.markSpent('0xABC', 300);
      expect(await store.isSpent('0xabc')).toBe(true);
    });

    it('should return count', async () => {
      await store.markSpent('0x1', 300);
      await store.markSpent('0x2', 300);
      expect(await store.count()).toBe(2);
    });
  });

  describe('RedisSpentProofsStore', () => {
    // Integration test — requires REDIS_URL. Skipped in CI.
    const redisUrl = process.env.REDIS_URL;

    (redisUrl ? describe : describe.skip)('with Redis connection', () => {
      let store: SpentProofsStore;

      beforeEach(async () => {
        store = await SpentProofsStore.createRedis(redisUrl!);
      });

      afterEach(async () => {
        await store.close?.();
      });

      it('should mark and check spent proof via Redis', async () => {
        const hash = `0xtest_${Date.now()}`;
        expect(await store.isSpent(hash)).toBe(false);
        await store.markSpent(hash, 60);
        expect(await store.isSpent(hash)).toBe(true);
      });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern='spent-proofs-store' --no-coverage`
Expected: FAIL

**Step 3: Write SpentProofsStore with Redis + in-memory fallback**

```typescript
// offchain/packages/engine/src/payment/spentProofsStore.ts
import Redis from 'ioredis';

export interface SpentProofsStore {
  isSpent(txHash: string): Promise<boolean>;
  markSpent(txHash: string, ttlSeconds: number): Promise<void>;
  count(): Promise<number>;
  close?(): Promise<void>;
}

const KEY_PREFIX = 'lucid:x402:spent:';

class RedisSpentProofsStore implements SpentProofsStore {
  constructor(private redis: Redis) {}

  async isSpent(txHash: string): Promise<boolean> {
    const exists = await this.redis.exists(KEY_PREFIX + txHash.toLowerCase());
    return exists === 1;
  }

  async markSpent(txHash: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(KEY_PREFIX + txHash.toLowerCase(), '1', 'EX', ttlSeconds);
  }

  async count(): Promise<number> {
    const keys = await this.redis.keys(KEY_PREFIX + '*');
    return keys.length;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

class InMemorySpentProofsStore implements SpentProofsStore {
  private spent = new Set<string>();

  async isSpent(txHash: string): Promise<boolean> {
    return this.spent.has(txHash.toLowerCase());
  }

  async markSpent(txHash: string, _ttlSeconds: number): Promise<void> {
    this.spent.add(txHash.toLowerCase());
  }

  async count(): Promise<number> {
    return this.spent.size;
  }
}

export const SpentProofsStore = {
  async createRedis(redisUrl: string): Promise<SpentProofsStore> {
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
    await redis.connect();
    return new RedisSpentProofsStore(redis);
  },

  createInMemory(): SpentProofsStore {
    return new InMemorySpentProofsStore();
  },

  async create(): Promise<SpentProofsStore> {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        return await SpentProofsStore.createRedis(redisUrl);
      } catch (err) {
        console.warn('Failed to connect to Redis for spentProofs, falling back to in-memory:', err);
        return SpentProofsStore.createInMemory();
      }
    }
    return SpentProofsStore.createInMemory();
  },
};
```

**Step 4: Run test to verify it passes**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern='spent-proofs-store' --no-coverage`
Expected: PASS (4 in-memory tests pass, Redis tests skipped without REDIS_URL)

**Step 5: Commit**

```bash
cd /c/Lucid-L2 && git add offchain/packages/engine/src/payment/spentProofsStore.ts offchain/packages/engine/src/__tests__/payment/
git commit -m "feat(payment): add SpentProofsStore with Redis + in-memory fallback"
```

---

## Task 6: PricingService (DB-Backed)

**Files:**
- Create: `offchain/packages/engine/src/payment/pricingService.ts`
- Test: `offchain/packages/engine/src/__tests__/payment/pricing-service.test.ts`

**Step 1: Write the failing test**

```typescript
// offchain/packages/engine/src/__tests__/payment/pricing-service.test.ts
import { PricingService } from '../../payment/pricingService';

// Mock the DB pool
jest.mock('../../db/pool', () => ({
  getClient: jest.fn(),
}));

import { getClient } from '../../db/pool';

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

describe('PricingService', () => {
  let service: PricingService;

  beforeEach(() => {
    jest.clearAllMocks();
    (getClient as jest.Mock).mockResolvedValue(mockClient);
    service = new PricingService();
  });

  describe('getPricing', () => {
    it('should return pricing for existing passport', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          passport_id: 'model-abc',
          price_per_call: '30000',
          payout_address: '0xOwner',
          accepted_tokens: ['USDC'],
          accepted_chains: ['base'],
        }],
      });

      const pricing = await service.getPricing('model-abc');
      expect(pricing).not.toBeNull();
      expect(pricing!.passport_id).toBe('model-abc');
      expect(pricing!.price_per_call).toBe(30000n);
    });

    it('should return null for non-existent passport', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const pricing = await service.getPricing('nonexistent');
      expect(pricing).toBeNull();
    });
  });

  describe('setPricing', () => {
    it('should upsert pricing config', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ passport_id: 'model-abc' }] });

      await service.setPricing({
        passport_id: 'model-abc',
        price_per_call: 30000n,
        payout_address: '0xOwner',
        accepted_tokens: ['USDC'],
        accepted_chains: ['base'],
      });

      expect(mockClient.query).toHaveBeenCalledTimes(1);
      const sql = mockClient.query.mock.calls[0][0];
      expect(sql).toContain('INSERT INTO asset_pricing');
      expect(sql).toContain('ON CONFLICT');
    });
  });

  describe('deletePricing', () => {
    it('should delete pricing config', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 1 });

      const deleted = await service.deletePricing('model-abc');
      expect(deleted).toBe(true);
      expect(mockClient.query.mock.calls[0][0]).toContain('DELETE FROM asset_pricing');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern='pricing-service' --no-coverage`
Expected: FAIL

**Step 3: Write PricingService**

```typescript
// offchain/packages/engine/src/payment/pricingService.ts
import { getClient } from '../db/pool';

export interface AssetPricing {
  passport_id: string;
  price_per_call: bigint | null;
  price_per_token: bigint | null;
  price_subscription_hour: bigint | null;
  accepted_tokens: string[];
  accepted_chains: string[];
  payout_address: string;
  custom_split_bps: Record<string, number> | null;
  updated_at?: Date;
}

export interface SetPricingParams {
  passport_id: string;
  price_per_call?: bigint;
  price_per_token?: bigint;
  price_subscription_hour?: bigint;
  accepted_tokens?: string[];
  accepted_chains?: string[];
  payout_address: string;
  custom_split_bps?: Record<string, number>;
}

export class PricingService {
  async getPricing(passportId: string): Promise<AssetPricing | null> {
    const client = await getClient();
    try {
      const result = await client.query(
        'SELECT * FROM asset_pricing WHERE passport_id = $1',
        [passportId],
      );
      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        passport_id: row.passport_id,
        price_per_call: row.price_per_call ? BigInt(row.price_per_call) : null,
        price_per_token: row.price_per_token ? BigInt(row.price_per_token) : null,
        price_subscription_hour: row.price_subscription_hour ? BigInt(row.price_subscription_hour) : null,
        accepted_tokens: row.accepted_tokens || ['USDC'],
        accepted_chains: row.accepted_chains || ['base'],
        payout_address: row.payout_address,
        custom_split_bps: row.custom_split_bps,
        updated_at: row.updated_at,
      };
    } finally {
      client.release();
    }
  }

  async setPricing(params: SetPricingParams): Promise<void> {
    const client = await getClient();
    try {
      await client.query(
        `INSERT INTO asset_pricing (passport_id, price_per_call, price_per_token, price_subscription_hour,
         accepted_tokens, accepted_chains, payout_address, custom_split_bps, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (passport_id) DO UPDATE SET
           price_per_call = EXCLUDED.price_per_call,
           price_per_token = EXCLUDED.price_per_token,
           price_subscription_hour = EXCLUDED.price_subscription_hour,
           accepted_tokens = EXCLUDED.accepted_tokens,
           accepted_chains = EXCLUDED.accepted_chains,
           payout_address = EXCLUDED.payout_address,
           custom_split_bps = EXCLUDED.custom_split_bps,
           updated_at = now()`,
        [
          params.passport_id,
          params.price_per_call?.toString() ?? null,
          params.price_per_token?.toString() ?? null,
          params.price_subscription_hour?.toString() ?? null,
          params.accepted_tokens ?? ['USDC'],
          params.accepted_chains ?? ['base'],
          params.payout_address,
          params.custom_split_bps ? JSON.stringify(params.custom_split_bps) : null,
        ],
      );
    } finally {
      client.release();
    }
  }

  async deletePricing(passportId: string): Promise<boolean> {
    const client = await getClient();
    try {
      const result = await client.query(
        'DELETE FROM asset_pricing WHERE passport_id = $1',
        [passportId],
      );
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern='pricing-service' --no-coverage`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
cd /c/Lucid-L2 && git add offchain/packages/engine/src/payment/pricingService.ts offchain/packages/engine/src/__tests__/payment/
git commit -m "feat(payment): add PricingService with DB-backed asset pricing CRUD"
```

---

## Task 7: SplitResolver

**Files:**
- Create: `offchain/packages/engine/src/payment/splitResolver.ts`
- Test: `offchain/packages/engine/src/__tests__/payment/split-resolver.test.ts`

**Step 1: Write the failing test**

```typescript
// offchain/packages/engine/src/__tests__/payment/split-resolver.test.ts
import { SplitResolver } from '../../payment/splitResolver';
import { PricingService } from '../../payment/pricingService';
import { DEFAULT_SPLIT_CONFIG } from '../../finance/payoutService';

jest.mock('../../payment/pricingService');

describe('SplitResolver', () => {
  let resolver: SplitResolver;
  let mockPricingService: jest.Mocked<PricingService>;

  beforeEach(() => {
    mockPricingService = new PricingService() as jest.Mocked<PricingService>;
    resolver = new SplitResolver(mockPricingService, {
      protocolTreasuryAddress: '0xProtocol',
      defaultSplitterAddress: '0xSplitter',
    });
  });

  it('should resolve single-recipient (compute only)', async () => {
    mockPricingService.getPricing = jest.fn()
      .mockResolvedValueOnce({
        passport_id: 'compute-1',
        price_per_call: 30000n,
        payout_address: '0xCompute',
        accepted_tokens: ['USDC'],
        accepted_chains: ['base'],
      });

    const result = await resolver.resolve({
      computePassportId: 'compute-1',
    });

    expect(result.useSplitter).toBe(false);
    expect(result.recipients).toHaveLength(1);
    expect(result.recipients[0].walletAddress).toBe('0xCompute');
    expect(result.recipients[0].bps).toBe(10000);
    expect(result.totalAmount).toBe(30000n);
  });

  it('should resolve multi-recipient (model + compute)', async () => {
    mockPricingService.getPricing = jest.fn()
      .mockResolvedValueOnce({
        passport_id: 'model-1',
        price_per_call: 20000n,
        payout_address: '0xModel',
        accepted_tokens: ['USDC'],
        accepted_chains: ['base'],
      })
      .mockResolvedValueOnce({
        passport_id: 'compute-1',
        price_per_call: 10000n,
        payout_address: '0xCompute',
        accepted_tokens: ['USDC'],
        accepted_chains: ['base'],
      });

    const result = await resolver.resolve({
      modelPassportId: 'model-1',
      computePassportId: 'compute-1',
    });

    expect(result.useSplitter).toBe(true);
    expect(result.splitterAddress).toBe('0xSplitter');
    expect(result.recipients).toHaveLength(3); // model + compute + protocol
    expect(result.recipients.find(r => r.role === 'protocol')).toBeDefined();
  });

  it('should return default price when asset has no pricing', async () => {
    mockPricingService.getPricing = jest.fn().mockResolvedValue(null);

    const result = await resolver.resolve({
      computePassportId: 'compute-1',
    });

    // Falls back to default pricing
    expect(result.totalAmount).toBeGreaterThan(0n);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern='split-resolver' --no-coverage`
Expected: FAIL

**Step 3: Write SplitResolver**

```typescript
// offchain/packages/engine/src/payment/splitResolver.ts
import { PricingService } from './pricingService';
import type { SplitResolution, SplitRecipient, TokenConfig } from './types';

const DEFAULT_PRICE_PER_CALL = 10000n; // $0.01 USDC (6 decimals)

const DEFAULT_USDC_BASE: TokenConfig = {
  symbol: 'USDC',
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  decimals: 6,
  chain: 'base',
};

export interface SplitResolverConfig {
  protocolTreasuryAddress: string;
  defaultSplitterAddress: string;
  defaultToken?: TokenConfig;
  defaultChain?: string;
}

export interface ResolveParams {
  modelPassportId?: string;
  computePassportId?: string;
  orchestratorPassportId?: string;
}

export class SplitResolver {
  constructor(
    private pricingService: PricingService,
    private config: SplitResolverConfig,
  ) {}

  async resolve(params: ResolveParams): Promise<SplitResolution> {
    const participants: Array<{ role: SplitRecipient['role']; passportId: string }> = [];

    if (params.modelPassportId) participants.push({ role: 'model', passportId: params.modelPassportId });
    if (params.computePassportId) participants.push({ role: 'compute', passportId: params.computePassportId });
    if (params.orchestratorPassportId) participants.push({ role: 'orchestrator', passportId: params.orchestratorPassportId });

    // Fetch pricing for all participants
    const pricings = await Promise.all(
      participants.map(async (p) => ({
        ...p,
        pricing: await this.pricingService.getPricing(p.passportId),
      })),
    );

    // Calculate total price (sum of all participants, or default)
    let totalAmount = 0n;
    for (const p of pricings) {
      totalAmount += p.pricing?.price_per_call ?? DEFAULT_PRICE_PER_CALL;
    }
    if (totalAmount === 0n) totalAmount = DEFAULT_PRICE_PER_CALL;

    // Single participant → direct payment, no splitter
    if (pricings.length <= 1) {
      const single = pricings[0];
      const walletAddress = single?.pricing?.payout_address ?? this.config.protocolTreasuryAddress;

      return {
        recipients: [{
          role: single?.role ?? 'protocol',
          passportId: single?.passportId,
          walletAddress,
          bps: 10000,
        }],
        useSplitter: false,
        totalAmount,
        token: this.config.defaultToken ?? DEFAULT_USDC_BASE,
        chain: this.config.defaultChain ?? 'base',
      };
    }

    // Multiple participants → splitter contract
    const recipients: SplitRecipient[] = [];
    const defaultBps = this.getDefaultBps(pricings.length, pricings.some(p => p.role === 'orchestrator'));

    for (const p of pricings) {
      recipients.push({
        role: p.role,
        passportId: p.passportId,
        walletAddress: p.pricing?.payout_address ?? this.config.protocolTreasuryAddress,
        bps: defaultBps[p.role] ?? 0,
      });
    }

    // Always add protocol if not already present
    if (!recipients.some(r => r.role === 'protocol')) {
      recipients.push({
        role: 'protocol',
        walletAddress: this.config.protocolTreasuryAddress,
        bps: defaultBps.protocol,
      });
    }

    return {
      recipients,
      useSplitter: true,
      splitterAddress: this.config.defaultSplitterAddress,
      totalAmount,
      token: this.config.defaultToken ?? DEFAULT_USDC_BASE,
      chain: this.config.defaultChain ?? 'base',
    };
  }

  private getDefaultBps(
    participantCount: number,
    hasOrchestrator: boolean,
  ): Record<string, number> {
    if (hasOrchestrator) {
      return { compute: 6000, model: 1500, orchestrator: 1500, protocol: 1000 };
    }
    return { compute: 7000, model: 2000, protocol: 1000 };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern='split-resolver' --no-coverage`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
cd /c/Lucid-L2 && git add offchain/packages/engine/src/payment/splitResolver.ts offchain/packages/engine/src/__tests__/payment/
git commit -m "feat(payment): add SplitResolver for dynamic recipient resolution"
```

---

## Task 8: Rewrite x402 Middleware (Facilitator-Agnostic, v2)

**Files:**
- Modify: `offchain/packages/gateway-lite/src/middleware/x402.ts` (full rewrite, preserve exports)
- Test: `offchain/packages/gateway-lite/src/__tests__/middleware/x402.test.ts`

**Step 1: Write the failing test**

```typescript
// offchain/packages/gateway-lite/src/__tests__/middleware/x402.test.ts
import express from 'express';
import request from 'supertest';

// Mock facilitator registry
const mockVerify = jest.fn();
const mockFacilitator = {
  name: 'mock',
  supportedChains: [{ name: 'base', chainId: 8453, rpcUrl: '' }],
  supportedTokens: [{ symbol: 'USDC', address: '0xUSDC', decimals: 6, chain: 'base' }],
  verify: mockVerify,
  instructions: jest.fn().mockReturnValue({
    chain: 'base', token: 'USDC', tokenAddress: '0xUSDC',
    amount: '30000', recipient: '0xRecipient', facilitator: 'mock',
  }),
};

jest.mock('@lucid-l2/engine', () => ({
  ...jest.requireActual('@lucid-l2/engine'),
}));

// We'll test the requirePayment middleware directly
import { requirePayment, setX402Config, resetSpentProofs } from '../../middleware/x402';

describe('x402 middleware (v2)', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    resetSpentProofs();
    app = express();
    app.use(express.json());
  });

  describe('when disabled', () => {
    beforeEach(() => {
      setX402Config({ enabled: false });
    });

    it('should pass through without checking payment', async () => {
      app.get('/test', requirePayment('0.01'), (req, res) => res.json({ ok: true }));
      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });
  });

  describe('backward compatibility', () => {
    it('should accept string price argument (v1 API)', () => {
      const middleware = requirePayment('0.01');
      expect(typeof middleware).toBe('function');
    });

    it('should accept options object (v2 API)', () => {
      const middleware = requirePayment({ priceUSDC: '0.01' });
      expect(typeof middleware).toBe('function');
    });

    it('should accept no arguments', () => {
      const middleware = requirePayment();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('when enabled with no proof', () => {
    beforeEach(() => {
      setX402Config({ enabled: true, paymentAddress: '0xRecipient' });
    });

    it('should return 402 with payment instructions', async () => {
      app.get('/test', requirePayment('0.03'), (req, res) => res.json({ ok: true }));
      const response = await request(app).get('/test');
      expect(response.status).toBe(402);
      expect(response.body.x402).toBeDefined();
      expect(response.body.x402.version).toBe('2');
      expect(response.body.x402.payment).toBeDefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern='middleware/x402' --no-coverage`
Expected: FAIL (version '2' assertion fails against current v1)

**Step 3: Rewrite x402.ts — preserve all existing exports, add v2 response**

Read the existing x402.ts fully, then rewrite preserving `requirePayment(priceUSDC?: string)` signature, `setX402Config()`, `getX402Config()`, `isProofSpent()`, `getSpentProofsCount()`, `parseUSDCAmount()`, `resetSpentProofs()`.

The rewrite:
- Accepts `string | RequirePaymentOptions` in `requirePayment()`
- Returns v2 response format (with `version: '2'`, `alternatives`, `splits`)
- Uses `SpentProofsStore` instead of in-memory Set
- Delegates verification to facilitator from registry (falls back to built-in DirectFacilitator if no registry)
- All old env vars (`X402_ENABLED`, `X402_PAYMENT_ADDRESS`, etc.) still work

**Key backward-compat contract:**
```typescript
// These must continue to work exactly as before:
requirePayment()                    // no args → default price
requirePayment('0.01')              // string → fixed USDC price
setX402Config({ enabled: false })   // disable
getX402Config()                     // read config
isProofSpent('0x...')               // check spent
resetSpentProofs()                  // clear (testing)
parseUSDCAmount('0.01')             // utility
```

This is the largest single task. The full implementation should:
1. Keep all existing exports with same signatures
2. Add `RequirePaymentOptions` as optional input type
3. Change 402 response to v2 format
4. Replace `spentProofs` Set with `SpentProofsStore` (async init)
5. Optionally use `FacilitatorRegistry` if available, otherwise fall back to built-in verification

**Step 4: Run test to verify it passes**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern='middleware/x402' --no-coverage`
Expected: PASS

**Step 5: Run existing tests to verify no regressions**

Run: `cd /c/Lucid-L2/offchain && npx jest --no-coverage`
Expected: All existing tests pass

**Step 6: Commit**

```bash
cd /c/Lucid-L2 && git add offchain/packages/gateway-lite/src/middleware/x402.ts offchain/packages/gateway-lite/src/__tests__/
git commit -m "feat(payment): rewrite x402 middleware with facilitator-agnostic v2 response"
```

---

## Task 9: RevenueService

**Files:**
- Create: `offchain/packages/engine/src/payment/revenueService.ts`
- Test: `offchain/packages/engine/src/__tests__/payment/revenue-service.test.ts`

**Step 1: Write the failing test**

```typescript
// offchain/packages/engine/src/__tests__/payment/revenue-service.test.ts
import { RevenueService } from '../../payment/revenueService';

jest.mock('../../db/pool', () => ({
  getClient: jest.fn(),
}));

import { getClient } from '../../db/pool';

const mockClient = { query: jest.fn(), release: jest.fn() };

describe('RevenueService', () => {
  let service: RevenueService;

  beforeEach(() => {
    jest.clearAllMocks();
    (getClient as jest.Mock).mockResolvedValue(mockClient);
    service = new RevenueService();
  });

  describe('recordRevenue', () => {
    it('should insert revenue record', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'uuid-1' }] });

      await service.recordRevenue({
        passport_id: 'model-1',
        run_id: 'run-1',
        amount: 20000n,
        token: 'USDC',
        chain: 'base',
        role: 'model',
        tx_hash: '0xabc',
      });

      expect(mockClient.query).toHaveBeenCalledTimes(1);
      expect(mockClient.query.mock.calls[0][0]).toContain('INSERT INTO asset_revenue');
    });
  });

  describe('getRevenue', () => {
    it('should return aggregated revenue for passport', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          total: '142500000',
          pending: '3200000',
        }],
      });

      const revenue = await service.getRevenue('model-1');
      expect(revenue.total).toBe(142500000n);
      expect(revenue.pending).toBe(3200000n);
    });
  });

  describe('withdraw', () => {
    it('should mark confirmed revenue as withdrawn and return amount', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ total: '50000000' }] }) // SUM query
        .mockResolvedValueOnce({ rowCount: 5 }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await service.withdraw('model-1');
      expect(result.amount).toBe(50000000n);
    });
  });
});
```

**Step 2: Run test, Step 3: Implement, Step 4: Verify, Step 5: Commit**

```bash
git commit -m "feat(payment): add RevenueService with recording, aggregation, withdrawal"
```

---

## Task 10: Payment Module Index & Engine Re-exports

**Files:**
- Create: `offchain/packages/engine/src/payment/index.ts`
- Modify: `offchain/packages/engine/src/finance/index.ts` (add payment re-exports)

**Step 1: Write payment module index**

```typescript
// offchain/packages/engine/src/payment/index.ts
export { FacilitatorRegistry, DirectFacilitator } from './facilitators';
export type { X402Facilitator, DirectFacilitatorConfig } from './facilitators';
export { SpentProofsStore } from './spentProofsStore';
export { PricingService } from './pricingService';
export type { AssetPricing, SetPricingParams } from './pricingService';
export { SplitResolver } from './splitResolver';
export type { SplitResolverConfig, ResolveParams } from './splitResolver';
export { RevenueService } from './revenueService';
export * from './types';
```

**Step 2: Add re-export in finance/index.ts**

Add to bottom of `offchain/packages/engine/src/finance/index.ts`:
```typescript
// Payment system (x402 universal)
export * from '../payment';
```

**Step 3: Verify build**

Run: `cd /c/Lucid-L2/offchain && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
cd /c/Lucid-L2 && git add offchain/packages/engine/src/payment/index.ts offchain/packages/engine/src/finance/index.ts
git commit -m "feat(payment): add payment module index and engine re-exports"
```

---

## Task 11: Asset Payment Routes

**Files:**
- Create: `offchain/packages/gateway-lite/src/routes/assetPaymentRoutes.ts`
- Test: `offchain/packages/gateway-lite/src/routes/__tests__/assetPaymentRoutes.test.ts`
- Modify: `offchain/packages/gateway-lite/src/index.ts` (mount router)

**Step 1: Write the failing test**

```typescript
// offchain/packages/gateway-lite/src/routes/__tests__/assetPaymentRoutes.test.ts
import request from 'supertest';
import express from 'express';
import { createAssetPaymentRouter } from '../assetPaymentRoutes';

jest.mock('@lucid-l2/engine', () => ({
  PricingService: jest.fn().mockImplementation(() => ({
    getPricing: jest.fn().mockResolvedValue({
      passport_id: 'model-1',
      price_per_call: 30000n,
      payout_address: '0xOwner',
      accepted_tokens: ['USDC'],
      accepted_chains: ['base'],
    }),
    setPricing: jest.fn().mockResolvedValue(undefined),
    deletePricing: jest.fn().mockResolvedValue(true),
  })),
  RevenueService: jest.fn().mockImplementation(() => ({
    getRevenue: jest.fn().mockResolvedValue({ total: 100000n, pending: 5000n }),
    withdraw: jest.fn().mockResolvedValue({ amount: 95000n, txHash: '0xabc' }),
  })),
}));

describe('Asset Payment Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/v1/assets', createAssetPaymentRouter());
  });

  it('GET /:passportId/pricing should return pricing', async () => {
    const res = await request(app).get('/v1/assets/model-1/pricing');
    expect(res.status).toBe(200);
    expect(res.body.passport_id).toBe('model-1');
  });

  it('PUT /:passportId/pricing should set pricing', async () => {
    const res = await request(app)
      .put('/v1/assets/model-1/pricing')
      .send({ price_per_call: '30000', payout_address: '0xOwner' });
    expect(res.status).toBe(200);
  });

  it('GET /:passportId/revenue should return revenue', async () => {
    const res = await request(app).get('/v1/assets/model-1/revenue');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeDefined();
  });

  it('POST /:passportId/withdraw should withdraw', async () => {
    const res = await request(app).post('/v1/assets/model-1/withdraw');
    expect(res.status).toBe(200);
    expect(res.body.amount).toBeDefined();
  });
});
```

**Step 2-4: Implement router, run tests, verify**

**Step 5: Mount in index.ts**

Add to `offchain/packages/gateway-lite/src/index.ts` near line 225 (after other route mounts):
```typescript
import { createAssetPaymentRouter } from './routes/assetPaymentRoutes';
// ...
app.use('/v1/assets', createAssetPaymentRouter());
```

**Step 6: Commit**

```bash
git commit -m "feat(payment): add asset pricing, revenue, and withdrawal routes"
```

---

## Task 12: Wire requirePayment() to Inference Routes

**Files:**
- Modify: `offchain/packages/gateway-lite/src/api.ts` (add middleware to paid endpoints)

**Step 1: Identify routes to gate**

Search in `api.ts` for these routes:
- `POST /v1/chat/completions`
- `POST /v1/embeddings`
- `POST /v1/match`
- `POST /v1/tools/execute` (if exists in api.ts)

**Step 2: Add requirePayment() middleware**

For each route, add `requirePayment({ dynamic: true })` as a middleware in the handler chain. Example:

```typescript
// Before:
router.post('/v1/chat/completions', async (req, res) => { ... });

// After:
import { requirePayment } from '../middleware/x402';
router.post('/v1/chat/completions', requirePayment({ dynamic: true }), async (req, res) => { ... });
```

`dynamic: true` means the middleware resolves price from the matched model/compute passport pricing in DB, not a hardcoded price.

When `X402_ENABLED=false` (default), the middleware is a no-op — zero behavior change for existing deployments.

**Step 3: Verify existing tests still pass**

Run: `cd /c/Lucid-L2/offchain && npx jest --no-coverage`
Expected: All tests pass (middleware is disabled by default)

**Step 4: Commit**

```bash
git commit -m "feat(payment): wire requirePayment() to inference and tool routes"
```

---

## Task 13: CoinbaseFacilitator

**Files:**
- Create: `offchain/packages/engine/src/payment/facilitators/coinbase.ts`
- Test: `offchain/packages/engine/src/__tests__/payment/coinbase-facilitator.test.ts`

**Step 1: Write the failing test**

```typescript
// offchain/packages/engine/src/__tests__/payment/coinbase-facilitator.test.ts
import { CoinbaseFacilitator } from '../../payment/facilitators/coinbase';

describe('CoinbaseFacilitator', () => {
  it('should have name "coinbase"', () => {
    const f = new CoinbaseFacilitator({ apiUrl: 'https://api.developer.coinbase.com/x402' });
    expect(f.name).toBe('coinbase');
  });

  it('should support base chain', () => {
    const f = new CoinbaseFacilitator({ apiUrl: 'https://api.developer.coinbase.com/x402' });
    expect(f.supportedChains.some(c => c.name === 'base')).toBe(true);
  });

  it('should generate EIP-3009 scheme instructions', () => {
    const f = new CoinbaseFacilitator({ apiUrl: 'https://api.developer.coinbase.com/x402' });
    const instr = f.instructions({
      amount: 30000n,
      token: { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, chain: 'base' },
      chain: 'base',
      recipient: '0xR',
    });
    expect(instr.scheme).toBe('eip-3009');
    expect(instr.facilitator).toBe('coinbase');
    expect(instr.facilitatorUrl).toContain('coinbase');
  });
});
```

**Step 2-4: Implement, run tests, verify**

The CoinbaseFacilitator delegates `verify()` to Coinbase's x402 API endpoint. Implementation details depend on Coinbase's API contract — read their docs at `https://docs.cdp.coinbase.com/x402` for the exact verify endpoint.

**Step 5: Commit**

```bash
git commit -m "feat(payment): add CoinbaseFacilitator for Coinbase x402 API"
```

---

## Task 14: PayAIFacilitator

**Files:**
- Create: `offchain/packages/engine/src/payment/facilitators/payai.ts`
- Test: `offchain/packages/engine/src/__tests__/payment/payai-facilitator.test.ts`

**Step 1: Write the failing test**

```typescript
// offchain/packages/engine/src/__tests__/payment/payai-facilitator.test.ts
import { PayAIFacilitator } from '../../payment/facilitators/payai';

describe('PayAIFacilitator', () => {
  it('should have name "payai"', () => {
    const f = new PayAIFacilitator({ apiUrl: 'https://facilitator.payai.network' });
    expect(f.name).toBe('payai');
  });

  it('should support solana and base chains', () => {
    const f = new PayAIFacilitator({ apiUrl: 'https://facilitator.payai.network' });
    expect(f.supportedChains.some(c => c.name === 'solana')).toBe(true);
    expect(f.supportedChains.some(c => c.name === 'base')).toBe(true);
  });

  it('should generate payment instructions', () => {
    const f = new PayAIFacilitator({ apiUrl: 'https://facilitator.payai.network' });
    const instr = f.instructions({
      amount: 30000n,
      token: { symbol: 'USDC', address: '0xUSDC', decimals: 6, chain: 'base' },
      chain: 'base',
      recipient: '0xR',
    });
    expect(instr.facilitator).toBe('payai');
    expect(instr.facilitatorUrl).toContain('payai');
  });
});
```

**Step 2-4: Implement, run tests, verify**

The PayAIFacilitator delegates `verify()` to PayAI's facilitator endpoint. Read their docs at `https://docs.payai.network/x402/facilitators/introduction` for the exact API contract.

**Step 5: Commit**

```bash
git commit -m "feat(payment): add PayAIFacilitator for PayAI x402 API"
```

---

## Task 15: Persist payoutStore to DB

**Files:**
- Modify: `offchain/packages/engine/src/finance/payoutService.ts` (replace in-memory Maps with DB queries)
- Test: Update `offchain/src/__tests__/payoutService.test.ts`

**Step 1: Identify in-memory stores**

In `payoutService.ts`, find:
- `payoutStore` Map (stores PayoutSplit by run_id)
- `executionStore` Map (stores PayoutExecution by run_id)

**Step 2: Replace with DB functions**

Replace `storePayout()` → `INSERT INTO payout_splits`
Replace `getPayout()` → `SELECT FROM payout_splits WHERE run_id = $1`
Replace execution tracking → `INSERT/UPDATE payout_executions`

Keep `calculatePayoutSplit()` and `validateSplitConfig()` as pure functions (no DB, unchanged).

**Step 3: Run existing payoutService tests**

Run: `cd /c/Lucid-L2/offchain && npx jest --testPathPattern='payoutService' --no-coverage`
Expected: Pure function tests pass. Storage tests need mock updates.

**Step 4: Commit**

```bash
git commit -m "feat(payment): persist payoutStore and executionStore to PostgreSQL"
```

---

## Task 16: Subscription Route (/v1/access/subscribe)

**Files:**
- Create: `offchain/packages/gateway-lite/src/routes/subscriptionRoutes.ts`
- Test: `offchain/packages/gateway-lite/src/routes/__tests__/subscriptionRoutes.test.ts`
- Modify: `offchain/packages/gateway-lite/src/index.ts` (mount router)

This route is x402-gated. When an agent pays via x402, the handler internally calls `paymentGateService.payForAccess()` to create an on-chain AccessReceipt. Subsequent requests from the same agent bypass x402 via the `skipIf` check.

**Step 1-4: Write test, implement, verify**

**Step 5: Commit**

```bash
git commit -m "feat(payment): add /v1/access/subscribe route with x402-gated subscription"
```

---

## Task 17: Payment Config Routes

**Files:**
- Create: `offchain/packages/gateway-lite/src/routes/paymentConfigRoutes.ts`
- Modify: `offchain/packages/gateway-lite/src/index.ts` (mount router)

Endpoints:
- `GET /v1/config/payment` — returns current payment config (facilitator, chains, tokens)
- `PUT /v1/config/facilitator` — change active facilitator (admin auth required)
- `GET /v1/config/chains` — list supported chains and tokens

**Step 1-4: Write test, implement, verify**

**Step 5: Commit**

```bash
git commit -m "feat(payment): add payment config routes"
```

---

## Task 18: Final Integration Test & Full Suite Run

**Files:**
- Create: `offchain/packages/engine/src/__tests__/payment/integration.test.ts`

**Step 1: Write integration test**

```typescript
// offchain/packages/engine/src/__tests__/payment/integration.test.ts
import { FacilitatorRegistry, DirectFacilitator } from '../../payment/facilitators';
import { PricingService } from '../../payment/pricingService';
import { SplitResolver } from '../../payment/splitResolver';
import { SpentProofsStore } from '../../payment/spentProofsStore';

describe('Payment System Integration', () => {
  it('should initialize full payment stack', async () => {
    // Registry
    const registry = new FacilitatorRegistry();
    const direct = new DirectFacilitator({
      chains: [{ name: 'base', chainId: 8453, rpcUrl: 'https://mainnet.base.org' }],
      tokens: [{ symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, chain: 'base' }],
    });
    registry.register(direct);

    expect(registry.getDefault().name).toBe('direct');

    // SpentProofs (in-memory fallback)
    const spentProofs = SpentProofsStore.createInMemory();
    expect(await spentProofs.isSpent('0xtest')).toBe(false);
    await spentProofs.markSpent('0xtest', 300);
    expect(await spentProofs.isSpent('0xtest')).toBe(true);

    // Instructions generation
    const instructions = direct.instructions({
      amount: 30000n,
      token: { symbol: 'USDC', address: '0xUSDC', decimals: 6, chain: 'base' },
      chain: 'base',
      recipient: '0xSplitter',
    });
    expect(instructions.facilitator).toBe('direct');
    expect(instructions.amount).toBe('30000');
  });
});
```

**Step 2: Run ALL tests**

Run: `cd /c/Lucid-L2/offchain && npx jest --no-coverage`
Expected: ALL tests pass (existing + new)

**Step 3: Commit**

```bash
git commit -m "test(payment): add integration test for full payment stack"
```

---

## Execution Order & Dependencies

```
Task 1 (types + interface)
  └→ Task 2 (DirectFacilitator)
      └→ Task 3 (FacilitatorRegistry)
Task 4 (DB migration) — independent, can run in parallel with 1-3
Task 5 (spentProofs Redis) — depends on Task 1 (types)
Task 6 (PricingService) — depends on Task 4 (migration)
Task 7 (SplitResolver) — depends on Task 6
Task 8 (x402 middleware rewrite) — depends on Tasks 3, 5, 7
Task 9 (RevenueService) — depends on Task 4
Task 10 (payment module index) — depends on Tasks 1-9
Task 11 (asset payment routes) — depends on Tasks 6, 9, 10
Task 12 (wire requirePayment) — depends on Task 8
Task 13 (CoinbaseFacilitator) — depends on Task 3
Task 14 (PayAIFacilitator) — depends on Task 3
Task 15 (persist payoutStore) — depends on Task 4
Task 16 (subscription route) — depends on Tasks 8, 12
Task 17 (payment config routes) — depends on Task 3
Task 18 (integration test) — depends on all
```

**Parallelizable groups:**
- Group A: Tasks 1 → 2 → 3 (facilitator core)
- Group B: Task 4 (migration) — independent
- Group C: Tasks 13, 14 (external facilitators) — after Task 3
- Group D: Task 5 (Redis) — after Task 1

**Critical path:** 1 → 2 → 3 → 5 → 7 → 8 → 12 → 18
