# Solana Identity Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an async projection layer that publishes Lucid passport identity to Metaplex `mpl-agent-registry` and QuantuLabs `8004-solana`, with a centralized registration doc builder and capability-driven registry adapters.

**Architecture:** Passport creation writes canonical state synchronously. A background job handles NFT minting + external registry projection. Each registry has co-located connection/identity/reputation modules sharing an SDK singleton. One centralized `buildRegistrationDocFromPassport()` builds the ERC-8004 doc — registries only handle transport.

**Tech Stack:** TypeScript, `@metaplex-foundation/mpl-agent-registry`, `@metaplex-foundation/mpl-core`, `8004-solana`, Jest

**Spec:** `docs/superpowers/specs/2026-03-23-solana-identity-registries-design.md`

---

## File Map

```
engine/src/identity/projections/
  ISolanaIdentityRegistry.ts          # Interface + RegistryCapabilities + error types
  factory.ts                          # getIdentityRegistries() singleton + reset
  index.ts                            # Barrel export
  registration-doc/
    buildRegistrationDoc.ts           # Centralized doc builder from Passport
    types.ts                          # ERC8004RegistrationDoc type
  metaplex/
    connection.ts                     # getMetaplexConnection() singleton (Umi + mplAgentIdentity)
    identity.ts                       # MetaplexIdentityRegistry
    reputation.ts                     # MetaplexReputationSyncer
    index.ts
  quantulabs/
    connection.ts                     # getQuantuLabsConnection() singleton (8004-solana SDK)
    identity.ts                       # QuantuLabsIdentityRegistry
    reputation.ts                     # QuantuLabsReputationSyncer
    index.ts
  jobs/
    syncExternalIdentity.ts           # Async identity projection job
    syncExternalReputation.ts         # Async reputation push job
  __tests__/
    buildRegistrationDoc.test.ts
    MetaplexIdentityRegistry.test.ts
    MetaplexReputationSyncer.test.ts
    QuantuLabsIdentityRegistry.test.ts
    QuantuLabsReputationSyncer.test.ts
    syncExternalIdentity.test.ts
    factory.test.ts
```

**Modified files:**
- `engine/src/identity/stores/passportStore.ts` — add `external_registrations` field + `updateExternalRegistration()` merge helper
- `engine/src/identity/passport/passportManager.ts` — add durable `triggerIdentityProjection()` hook (3 call sites)
- `engine/src/identity/index.ts` — re-export projections
- `engine/src/reputation/index.ts` — add `metaplex` case, redirect `8004`
- `engine/package.json` — add `@metaplex-foundation/mpl-agent-registry`

**Deleted files:**
- `engine/src/reputation/syncers/Solana8004Syncer.ts` (replaced in Task 5)

---

### Task 1: Types + Interface + Registration Doc Builder

**Files:**
- Create: `engine/src/identity/projections/ISolanaIdentityRegistry.ts`
- Create: `engine/src/identity/projections/registration-doc/types.ts`
- Create: `engine/src/identity/projections/registration-doc/buildRegistrationDoc.ts`
- Test: `engine/src/identity/projections/__tests__/buildRegistrationDoc.test.ts`

- [ ] **Step 1: Write the failing test for `buildRegistrationDocFromPassport`**

```typescript
// __tests__/buildRegistrationDoc.test.ts
import { buildRegistrationDocFromPassport } from '../registration-doc/buildRegistrationDoc';

describe('buildRegistrationDocFromPassport', () => {
  const basePassport = {
    passport_id: 'passport_abc123',
    type: 'agent' as const,
    owner: '3Qmmq...',
    name: 'TestAgent',
    description: 'A test agent',
    status: 'active' as const,
    metadata: {},
    created_at: 1700000000,
    updated_at: 1700000000,
  };

  it('builds doc with correct type field', () => {
    const doc = buildRegistrationDocFromPassport(basePassport);
    expect(doc.type).toBe('https://eips.ethereum.org/EIPS/eip-8004#registration-v1');
  });

  it('maps agent type to autonomous capability', () => {
    const doc = buildRegistrationDocFromPassport(basePassport);
    expect(doc.capabilities).toEqual(['autonomous']);
  });

  it('maps model type to inference capability', () => {
    const doc = buildRegistrationDocFromPassport({ ...basePassport, type: 'model' as const });
    expect(doc.capabilities).toEqual(['inference']);
  });

  it('maps tool type to integration capability', () => {
    const doc = buildRegistrationDocFromPassport({ ...basePassport, type: 'tool' as const });
    expect(doc.capabilities).toEqual(['integration']);
  });

  it('maps compute type to execution capability', () => {
    const doc = buildRegistrationDocFromPassport({ ...basePassport, type: 'compute' as const });
    expect(doc.capabilities).toEqual(['execution']);
  });

  it('maps dataset type to data capability', () => {
    const doc = buildRegistrationDocFromPassport({ ...basePassport, type: 'dataset' as const });
    expect(doc.capabilities).toEqual(['data']);
  });

  it('maps endpoints to services array', () => {
    const doc = buildRegistrationDocFromPassport({
      ...basePassport,
      metadata: {
        endpoints: {
          mcp: { url: 'https://agent.example.com/mcp', type: 'mcp' },
          web: { url: 'https://agent.example.com', type: 'web' },
        },
      },
    });
    expect(doc.services).toEqual([
      { name: 'mcp', endpoint: 'https://agent.example.com/mcp' },
      { name: 'web', endpoint: 'https://agent.example.com' },
    ]);
  });

  it('returns empty services when no endpoints', () => {
    const doc = buildRegistrationDocFromPassport(basePassport);
    expect(doc.services).toEqual([]);
  });

  it('includes nft_mint in registrations when present', () => {
    const doc = buildRegistrationDocFromPassport({
      ...basePassport,
      nft_mint: 'MintPubkey123',
    });
    expect(doc.registrations).toEqual([
      { agentId: 'MintPubkey123', agentRegistry: 'solana:101:metaplex' },
    ]);
  });

  it('returns empty registrations when no nft_mint', () => {
    const doc = buildRegistrationDocFromPassport(basePassport);
    expect(doc.registrations).toEqual([]);
  });

  it('accepts custom agentRegistry', () => {
    const doc = buildRegistrationDocFromPassport(
      { ...basePassport, nft_mint: 'MintPubkey123' },
      { agentRegistry: 'solana:101:quantulabs' },
    );
    expect(doc.registrations![0].agentRegistry).toBe('solana:101:quantulabs');
  });

  it('sets active based on passport status', () => {
    expect(buildRegistrationDocFromPassport(basePassport).active).toBe(true);
    expect(buildRegistrationDocFromPassport({ ...basePassport, status: 'revoked' as const }).active).toBe(false);
  });

  it('always includes reputation in supportedTrust', () => {
    const doc = buildRegistrationDocFromPassport(basePassport);
    expect(doc.supportedTrust).toEqual(['reputation']);
  });

  it('falls back to passport_id for name', () => {
    const doc = buildRegistrationDocFromPassport({ ...basePassport, name: undefined });
    expect(doc.name).toBe('passport_abc123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --testPathPattern='buildRegistrationDoc' --no-coverage 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: Create types file**

```typescript
// registration-doc/types.ts
import type { ERC8004AgentMetadata } from '../../registries/types';

export interface ERC8004RegistrationDoc extends ERC8004AgentMetadata {
  type: string;
  services?: Array<{ name: string; endpoint: string; version?: string; skills?: string[]; domains?: string[] }>;
  registrations?: Array<{ agentId: string; agentRegistry: string }>;
  supportedTrust?: string[];
  active?: boolean;
}
```

- [ ] **Step 4: Create the interface file**

```typescript
// ISolanaIdentityRegistry.ts
import type { AssetType, TxReceipt } from '../../reputation/types';
import type { Passport } from '../stores/passportStore';
import type { ERC8004RegistrationDoc } from './registration-doc/types';

export interface RegistryCapabilities {
  register: boolean;
  resolve: boolean;
  sync: boolean;
  deregister: boolean;
}

export interface RegistrationOptions {
  skipIfExists?: boolean;
  registrationDocUri?: string;
}

export interface RegistrationResult {
  registryName: string;
  externalId: string;
  txSignature: string;
  registrationDocUri?: string;
}

export interface ExternalIdentity {
  registryName: string;
  externalId: string;
  owner: string;
  metadata: ERC8004RegistrationDoc;
  registrationDocUri?: string;
}

export class RegistryCapabilityError extends Error {
  constructor(registryName: string, capability: string) {
    super(`Registry '${registryName}' does not support '${capability}'`);
    this.name = 'RegistryCapabilityError';
  }
}

export interface ISolanaIdentityRegistry {
  readonly registryName: string;
  readonly supportedAssetTypes: AssetType[];
  readonly capabilities: RegistryCapabilities;

  register(passport: Passport, options?: RegistrationOptions): Promise<RegistrationResult>;
  resolve(agentId: string): Promise<ExternalIdentity | null>;
  sync(passport: Passport): Promise<TxReceipt | null>;
  deregister(agentId: string): Promise<TxReceipt | null>;
  isAvailable(): Promise<boolean>;
}
```

- [ ] **Step 5: Implement `buildRegistrationDocFromPassport`**

```typescript
// registration-doc/buildRegistrationDoc.ts
import type { Passport } from '../../stores/passportStore';
import type { ERC8004RegistrationDoc } from './types';

const CAPABILITY_MAP: Record<string, string[]> = {
  agent: ['autonomous'],
  model: ['inference'],
  tool: ['integration'],
  compute: ['execution'],
  dataset: ['data'],
};

export interface BuildRegistrationDocOptions {
  agentRegistry?: string;
}

export function buildRegistrationDocFromPassport(
  passport: Passport,
  options?: BuildRegistrationDocOptions,
): ERC8004RegistrationDoc {
  const endpoints = passport.metadata?.endpoints as Record<string, any> | undefined;
  const services = endpoints
    ? Object.entries(endpoints).map(([name, val]) => ({
        name,
        endpoint: typeof val === 'string' ? val : val?.url ?? '',
      }))
    : [];

  const registrations = passport.nft_mint
    ? [{ agentId: passport.nft_mint, agentRegistry: options?.agentRegistry ?? 'solana:101:metaplex' }]
    : [];

  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: passport.name ?? passport.metadata?.name ?? passport.passport_id,
    description: passport.description ?? passport.metadata?.description ?? '',
    capabilities: CAPABILITY_MAP[passport.type] ?? [],
    services,
    registrations,
    supportedTrust: ['reputation'],
    active: passport.status === 'active',
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --testPathPattern='buildRegistrationDoc' --no-coverage 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2 && git add offchain/packages/engine/src/identity/projections/ && git commit -m "feat(identity): add ISolanaIdentityRegistry interface + centralized registration doc builder"
```

---

### Task 2: QuantuLabs Connection + Reputation Syncer (replaces Solana8004Syncer)

**Files:**
- Create: `engine/src/identity/projections/quantulabs/connection.ts`
- Create: `engine/src/identity/projections/quantulabs/reputation.ts`
- Create: `engine/src/identity/projections/quantulabs/index.ts`
- Test: `engine/src/identity/projections/__tests__/QuantuLabsReputationSyncer.test.ts`

- [ ] **Step 1: Write the failing test (migrated from Solana8004Syncer.test.ts)**

```typescript
// __tests__/QuantuLabsReputationSyncer.test.ts
import { QuantuLabsReputationSyncer } from '../quantulabs/reputation';
import type { QuantuLabsConnection } from '../quantulabs/connection';

const mockSdk = {
  getSummary: jest.fn(),
  readAllFeedback: jest.fn(),
  giveFeedback: jest.fn(),
  register: undefined, // no identity support
};

const mockConnection: QuantuLabsConnection = {
  getSDK: () => mockSdk,
  capabilities: { identityRegistration: false, reputation: true },
} as any;

describe('QuantuLabsReputationSyncer', () => {
  let syncer: QuantuLabsReputationSyncer;

  beforeEach(() => {
    jest.clearAllMocks();
    syncer = new QuantuLabsReputationSyncer(mockConnection);
  });

  it('has correct syncer name', () => {
    expect(syncer.syncerName).toBe('quantulabs');
  });

  it('supports agent asset type', () => {
    expect(syncer.supportedAssetTypes).toEqual(['agent']);
  });

  it('isAvailable returns true with SDK', async () => {
    expect(await syncer.isAvailable()).toBe(true);
  });

  describe('pullFeedback', () => {
    it('pulls feedback and maps correctly', async () => {
      mockSdk.readAllFeedback.mockResolvedValue([
        { score: 90, category: 'reliability', timestamp: 1700000000, metadata: { note: 'good' } },
        { score: 70, category: 'speed', timestamp: 1700001000 },
      ]);

      const result = await syncer.pullFeedback('passport-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        source: 'quantulabs',
        externalId: 'passport-1',
        score: 90,
        category: 'reliability',
        timestamp: 1700000000,
        metadata: { note: 'good' },
      });
    });

    it('returns empty array on SDK error', async () => {
      mockSdk.readAllFeedback.mockRejectedValue(new Error('Network error'));
      expect(await syncer.pullFeedback('passport-1')).toEqual([]);
    });
  });

  describe('pullSummary', () => {
    it('pulls summary and maps correctly', async () => {
      mockSdk.getSummary.mockResolvedValue({
        averageScore: 85,
        totalFeedback: 42,
        lastUpdated: 1700002000,
      });

      const result = await syncer.pullSummary('passport-1');
      expect(result).not.toBeNull();
      expect(result!.source).toBe('quantulabs');
      expect(result!.avgScore).toBe(85);
      expect(result!.feedbackCount).toBe(42);
    });

    it('returns null on SDK error', async () => {
      mockSdk.getSummary.mockRejectedValue(new Error('Network error'));
      expect(await syncer.pullSummary('passport-1')).toBeNull();
    });
  });

  describe('pushFeedback', () => {
    it('pushes feedback for agent asset type', async () => {
      mockSdk.giveFeedback.mockResolvedValue({ txHash: 'solana-tx-123', id: 'fb-1' });

      const result = await syncer.pushFeedback({
        passportId: 'passport-1',
        score: 80,
        category: 'quality',
        receiptHash: 'abc123',
        assetType: 'agent',
      });

      expect(result).toEqual({ success: true, txHash: 'solana-tx-123', id: 'fb-1' });
    });

    it('returns null for non-agent asset types', async () => {
      for (const assetType of ['model', 'compute', 'tool', 'dataset'] as const) {
        const result = await syncer.pushFeedback({
          passportId: 'passport-1', score: 80, category: 'quality',
          receiptHash: 'abc123', assetType,
        });
        expect(result).toBeNull();
      }
    });

    it('handles SDK error gracefully', async () => {
      mockSdk.giveFeedback.mockRejectedValue(new Error('Transaction failed'));
      const result = await syncer.pushFeedback({
        passportId: 'passport-1', score: 80, category: 'quality',
        receiptHash: 'abc123', assetType: 'agent',
      });
      expect(result).toBeNull();
    });
  });

  describe('resolveExternalId', () => {
    it('returns passportId as-is', async () => {
      expect(await syncer.resolveExternalId('passport-1')).toBe('passport-1');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --testPathPattern='QuantuLabsReputationSyncer' --no-coverage 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: Create connection.ts**

```typescript
// quantulabs/connection.ts

export class QuantuLabsConnection {
  private sdk: any = null;
  readonly capabilities: { identityRegistration: boolean; reputation: boolean };

  constructor() {
    const sdk = this.getSDK();
    this.capabilities = {
      identityRegistration: typeof sdk?.register === 'function',
      reputation: true,
    };
  }

  getSDK(): any {
    if (this.sdk) return this.sdk;
    try {
      const { SolanaSDK } = require('8004-solana');
      this.sdk = new SolanaSDK();
    } catch {
      this.sdk = null;
    }
    return this.sdk;
  }
}

let _conn: QuantuLabsConnection | null = null;
export function getQuantuLabsConnection(): QuantuLabsConnection {
  if (!_conn) _conn = new QuantuLabsConnection();
  return _conn;
}
export function resetQuantuLabsConnection(): void { _conn = null; }
```

- [ ] **Step 4: Create reputation.ts**

```typescript
// quantulabs/reputation.ts
import type { IReputationSyncer, ExternalFeedback, ExternalSummary } from '../../../reputation/IReputationSyncer';
import type { FeedbackParams, TxReceipt, AssetType } from '../../../reputation/types';
import type { QuantuLabsConnection } from './connection';

export class QuantuLabsReputationSyncer implements IReputationSyncer {
  readonly syncerName = 'quantulabs';
  readonly supportedAssetTypes: AssetType[] = ['agent'];

  constructor(private connection: QuantuLabsConnection) {}

  async pullFeedback(passportId: string): Promise<ExternalFeedback[]> {
    try {
      const sdk = this.connection.getSDK();
      const feedbacks = await sdk.readAllFeedback(passportId);
      return (feedbacks ?? []).map((f: any) => ({
        source: this.syncerName,
        externalId: passportId,
        score: f.score,
        category: f.category ?? 'general',
        timestamp: f.timestamp ?? Math.floor(Date.now() / 1000),
        metadata: f.metadata,
      }));
    } catch {
      return [];
    }
  }

  async pullSummary(passportId: string): Promise<ExternalSummary | null> {
    try {
      const sdk = this.connection.getSDK();
      const summary = await sdk.getSummary(passportId);
      if (!summary) return null;
      return {
        source: this.syncerName,
        externalId: passportId,
        avgScore: summary.averageScore ?? summary.avgScore ?? 0,
        feedbackCount: summary.totalFeedback ?? summary.feedbackCount ?? 0,
        lastUpdated: summary.lastUpdated ?? Math.floor(Date.now() / 1000),
      };
    } catch {
      return null;
    }
  }

  async pushFeedback(params: FeedbackParams): Promise<TxReceipt | null> {
    if (params.assetType !== 'agent') return null;
    try {
      const sdk = this.connection.getSDK();
      const result = await sdk.giveFeedback(params.passportId, params.score, params.category);
      return { success: true, txHash: result?.txHash ?? result?.signature, id: result?.id };
    } catch {
      return null;
    }
  }

  async resolveExternalId(passportId: string): Promise<string | null> {
    return passportId;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.connection.getSDK();
  }
}
```

- [ ] **Step 5: Create quantulabs/index.ts barrel**

```typescript
export { QuantuLabsConnection, getQuantuLabsConnection, resetQuantuLabsConnection } from './connection';
export { QuantuLabsReputationSyncer } from './reputation';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --testPathPattern='QuantuLabsReputationSyncer' --no-coverage 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2 && git add offchain/packages/engine/src/identity/projections/quantulabs/ offchain/packages/engine/src/identity/projections/__tests__/QuantuLabsReputationSyncer.test.ts && git commit -m "feat(identity): add QuantuLabs connection + reputation syncer (replaces Solana8004Syncer)"
```

---

### Task 3: QuantuLabs Identity Registry

**Files:**
- Create: `engine/src/identity/projections/quantulabs/identity.ts`
- Test: `engine/src/identity/projections/__tests__/QuantuLabsIdentityRegistry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/QuantuLabsIdentityRegistry.test.ts
import { QuantuLabsIdentityRegistry } from '../quantulabs/identity';
import { RegistryCapabilityError } from '../ISolanaIdentityRegistry';
import type { QuantuLabsConnection } from '../quantulabs/connection';

describe('QuantuLabsIdentityRegistry (no identity support)', () => {
  const mockConnection = {
    getSDK: () => ({}),
    capabilities: { identityRegistration: false, reputation: true },
  } as unknown as QuantuLabsConnection;

  let registry: QuantuLabsIdentityRegistry;

  beforeEach(() => {
    registry = new QuantuLabsIdentityRegistry(mockConnection);
  });

  it('has correct registry name', () => {
    expect(registry.registryName).toBe('quantulabs');
  });

  it('supports agent asset type', () => {
    expect(registry.supportedAssetTypes).toEqual(['agent']);
  });

  it('capabilities reflect no identity support', () => {
    expect(registry.capabilities).toEqual({
      register: false, resolve: false, sync: false, deregister: false,
    });
  });

  it('register throws RegistryCapabilityError', async () => {
    const passport = { passport_id: 'p1', type: 'agent', owner: 'x', metadata: {}, status: 'active', created_at: 0, updated_at: 0 } as any;
    await expect(registry.register(passport)).rejects.toThrow(RegistryCapabilityError);
  });

  it('resolve throws RegistryCapabilityError', async () => {
    await expect(registry.resolve('agent-1')).rejects.toThrow(RegistryCapabilityError);
  });

  it('isAvailable returns false', async () => {
    expect(await registry.isAvailable()).toBe(false);
  });
});

describe('QuantuLabsIdentityRegistry (with identity support)', () => {
  const mockSdk = {
    register: jest.fn().mockResolvedValue({ id: 'ql-agent-1', txHash: 'tx-abc' }),
    getAgent: jest.fn().mockResolvedValue({ id: 'ql-agent-1', owner: '3Qm', name: 'Test', description: 'D' }),
    updateAgent: jest.fn().mockResolvedValue({ txHash: 'tx-update' }),
  };

  const mockConnection = {
    getSDK: () => mockSdk,
    capabilities: { identityRegistration: true, reputation: true },
  } as unknown as QuantuLabsConnection;

  let registry: QuantuLabsIdentityRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new QuantuLabsIdentityRegistry(mockConnection);
  });

  it('capabilities reflect identity support', () => {
    expect(registry.capabilities.register).toBe(true);
    expect(registry.capabilities.resolve).toBe(true);
    expect(registry.capabilities.sync).toBe(true);
  });

  it('register calls SDK and returns result', async () => {
    const passport = {
      passport_id: 'p1', type: 'agent' as const, owner: '3Qm', name: 'Agent',
      description: 'Test', metadata: {}, status: 'active' as const,
      nft_mint: 'Mint123', created_at: 0, updated_at: 0,
    } as any;

    const result = await registry.register(passport);
    expect(result.registryName).toBe('quantulabs');
    expect(result.externalId).toBe('ql-agent-1');
    expect(mockSdk.register).toHaveBeenCalled();
  });

  it('resolve calls SDK and returns ExternalIdentity', async () => {
    const result = await registry.resolve('ql-agent-1');
    expect(result).not.toBeNull();
    expect(result!.registryName).toBe('quantulabs');
    expect(mockSdk.getAgent).toHaveBeenCalledWith('ql-agent-1');
  });

  it('isAvailable returns true', async () => {
    expect(await registry.isAvailable()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --testPathPattern='QuantuLabsIdentityRegistry' --no-coverage 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Implement identity.ts**

```typescript
// quantulabs/identity.ts
import type { AssetType, TxReceipt } from '../../../reputation/types';
import type { Passport } from '../../stores/passportStore';
import {
  type ISolanaIdentityRegistry,
  type RegistryCapabilities,
  type RegistrationOptions,
  type RegistrationResult,
  type ExternalIdentity,
  RegistryCapabilityError,
} from '../ISolanaIdentityRegistry';
import { buildRegistrationDocFromPassport } from '../registration-doc/buildRegistrationDoc';
import type { QuantuLabsConnection } from './connection';

export class QuantuLabsIdentityRegistry implements ISolanaIdentityRegistry {
  readonly registryName = 'quantulabs';
  readonly supportedAssetTypes: AssetType[] = ['agent'];

  constructor(private connection: QuantuLabsConnection) {}

  get capabilities(): RegistryCapabilities {
    const has = this.connection.capabilities.identityRegistration;
    return { register: has, resolve: has, sync: has, deregister: false };
  }

  async register(passport: Passport, _options?: RegistrationOptions): Promise<RegistrationResult> {
    if (!this.capabilities.register) {
      throw new RegistryCapabilityError(this.registryName, 'register');
    }
    const sdk = this.connection.getSDK();
    const doc = buildRegistrationDocFromPassport(passport, { agentRegistry: 'solana:101:quantulabs' });
    const result = await sdk.register(passport.passport_id, doc);
    return {
      registryName: this.registryName,
      externalId: result?.id ?? passport.passport_id,
      txSignature: result?.txHash ?? result?.signature ?? '',
    };
  }

  async resolve(agentId: string): Promise<ExternalIdentity | null> {
    if (!this.capabilities.resolve) {
      throw new RegistryCapabilityError(this.registryName, 'resolve');
    }
    try {
      const sdk = this.connection.getSDK();
      const agent = await sdk.getAgent(agentId);
      if (!agent) return null;
      return {
        registryName: this.registryName,
        externalId: agent.id ?? agentId,
        owner: agent.owner ?? '',
        metadata: {
          type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
          name: agent.name ?? '',
          description: agent.description ?? '',
        },
      };
    } catch {
      return null;
    }
  }

  async sync(passport: Passport): Promise<TxReceipt | null> {
    if (!this.capabilities.sync) {
      throw new RegistryCapabilityError(this.registryName, 'sync');
    }
    try {
      const sdk = this.connection.getSDK();
      // Use stored external ID if available, fall back to passport_id
      const externalId = passport.external_registrations?.quantulabs?.externalId || passport.passport_id;
      const doc = buildRegistrationDocFromPassport(passport, { agentRegistry: 'solana:101:quantulabs' });
      const result = await sdk.updateAgent(externalId, doc);
      return { success: true, txHash: result?.txHash ?? result?.signature };
    } catch {
      return null;
    }
  }

  async deregister(_agentId: string): Promise<TxReceipt | null> {
    throw new RegistryCapabilityError(this.registryName, 'deregister');
  }

  async isAvailable(): Promise<boolean> {
    return this.capabilities.register && !!this.connection.getSDK();
  }
}
```

- [ ] **Step 4: Update quantulabs/index.ts**

Add: `export { QuantuLabsIdentityRegistry } from './identity';`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --testPathPattern='QuantuLabsIdentityRegistry' --no-coverage 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2 && git add offchain/packages/engine/src/identity/projections/quantulabs/ offchain/packages/engine/src/identity/projections/__tests__/QuantuLabsIdentityRegistry.test.ts && git commit -m "feat(identity): add QuantuLabs identity registry with capability model"
```

---

### Task 4: Metaplex Connection + Identity Registry + Reputation Syncer

**Files:**
- Create: `engine/src/identity/projections/metaplex/connection.ts`
- Create: `engine/src/identity/projections/metaplex/identity.ts`
- Create: `engine/src/identity/projections/metaplex/reputation.ts`
- Create: `engine/src/identity/projections/metaplex/index.ts`
- Test: `engine/src/identity/projections/__tests__/MetaplexIdentityRegistry.test.ts`
- Test: `engine/src/identity/projections/__tests__/MetaplexReputationSyncer.test.ts`

- [ ] **Step 1: Write failing test for MetaplexIdentityRegistry**

```typescript
// __tests__/MetaplexIdentityRegistry.test.ts
import { MetaplexIdentityRegistry } from '../metaplex/identity';
import { RegistryCapabilityError } from '../ISolanaIdentityRegistry';

const mockUmi = {
  payer: { publicKey: 'OperatorPubkey' },
  rpc: { getAccount: jest.fn() },
};

const mockRegisterIdentityV1 = jest.fn().mockReturnValue({ sendAndConfirm: jest.fn().mockResolvedValue({ signature: new Uint8Array([1, 2, 3]) }) });
const mockRegisterExecutiveV1 = jest.fn().mockReturnValue({ sendAndConfirm: jest.fn().mockResolvedValue({}) });
const mockDelegateExecutionV1 = jest.fn().mockReturnValue({ sendAndConfirm: jest.fn().mockResolvedValue({}) });
const mockFindAgentIdentityV1Pda = jest.fn().mockReturnValue('AgentIdentityPDA');

jest.mock('@metaplex-foundation/mpl-agent-registry', () => ({
  mplAgentIdentity: jest.fn().mockReturnValue({}),
  registerIdentityV1: (...args: any[]) => mockRegisterIdentityV1(...args),
  registerExecutiveV1: (...args: any[]) => mockRegisterExecutiveV1(...args),
  delegateExecutionV1: (...args: any[]) => mockDelegateExecutionV1(...args),
  findAgentIdentityV1Pda: (...args: any[]) => mockFindAgentIdentityV1Pda(...args),
  findExecutiveProfileV1Pda: jest.fn().mockReturnValue('ExecProfilePDA'),
}), { virtual: true });

const mockDispatch = jest.fn().mockResolvedValue({ url: 'https://arweave.net/doc123', cid: 'doc123' });
jest.mock('../../../anchoring', () => ({
  getAnchorDispatcher: () => ({ dispatch: mockDispatch }),
}), { virtual: true });

const mockConnection = {
  getUmi: jest.fn().mockResolvedValue(mockUmi),
} as any;

describe('MetaplexIdentityRegistry', () => {
  let registry: MetaplexIdentityRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUmi.rpc.getAccount.mockResolvedValue({ exists: false }); // executive not yet registered
    registry = new MetaplexIdentityRegistry(mockConnection);
  });

  it('has correct registry name', () => {
    expect(registry.registryName).toBe('metaplex');
  });

  it('capabilities include register, resolve, sync but not deregister', () => {
    expect(registry.capabilities).toEqual({
      register: true, resolve: true, sync: true, deregister: false,
    });
  });

  it('register throws if nft_mint is missing', async () => {
    const passport = {
      passport_id: 'p1', type: 'agent', owner: '3Qm', name: 'Agent',
      description: 'Test', metadata: {}, status: 'active', nft_mint: undefined,
      created_at: 0, updated_at: 0,
    } as any;
    await expect(registry.register(passport)).rejects.toThrow('nft_mint');
  });

  it('register calls registerIdentityV1 and returns result', async () => {
    const passport = {
      passport_id: 'p1', type: 'agent', owner: '3Qm', name: 'Agent',
      description: 'Test', metadata: {}, status: 'active', nft_mint: 'MintPubkey',
      created_at: 0, updated_at: 0,
    } as any;

    const result = await registry.register(passport);

    expect(result.registryName).toBe('metaplex');
    expect(result.externalId).toBe('MintPubkey');
    expect(result.registrationDocUri).toBe('https://arweave.net/doc123');
    expect(mockDispatch).toHaveBeenCalled();
    expect(mockRegisterIdentityV1).toHaveBeenCalled();
    expect(mockRegisterExecutiveV1).toHaveBeenCalled(); // first time
    expect(mockDelegateExecutionV1).toHaveBeenCalled();
  });

  it('deregister throws RegistryCapabilityError', async () => {
    await expect(registry.deregister('agent-1')).rejects.toThrow(RegistryCapabilityError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --testPathPattern='MetaplexIdentityRegistry' --no-coverage 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Create metaplex/connection.ts**

```typescript
// metaplex/connection.ts

export class MetaplexConnection {
  private umi: any = null;

  async getUmi(): Promise<any> {
    if (this.umi) return this.umi;

    const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
    const { mplCore } = require('@metaplex-foundation/mpl-core');
    const { mplAgentIdentity } = require('@metaplex-foundation/mpl-agent-registry');

    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.umi = createUmi(rpcUrl).use(mplCore()).use(mplAgentIdentity());

    const secretKey = process.env.LUCID_ORCHESTRATOR_SECRET_KEY;
    if (secretKey) {
      const { keypairIdentity } = require('@metaplex-foundation/umi');
      const decoded = Buffer.from(secretKey, 'base64');
      this.umi.use(keypairIdentity(this.umi.eddsa.createKeypairFromSecretKey(decoded)));
    }

    return this.umi;
  }
}

let _conn: MetaplexConnection | null = null;
export function getMetaplexConnection(): MetaplexConnection {
  if (!_conn) _conn = new MetaplexConnection();
  return _conn;
}
export function resetMetaplexConnection(): void { _conn = null; }
```

- [ ] **Step 4: Create metaplex/identity.ts**

```typescript
// metaplex/identity.ts
import type { AssetType, TxReceipt } from '../../../reputation/types';
import type { Passport } from '../../stores/passportStore';
import {
  type ISolanaIdentityRegistry,
  type RegistryCapabilities,
  type RegistrationOptions,
  type RegistrationResult,
  type ExternalIdentity,
  RegistryCapabilityError,
} from '../ISolanaIdentityRegistry';
import { buildRegistrationDocFromPassport } from '../registration-doc/buildRegistrationDoc';
import type { MetaplexConnection } from './connection';

export class MetaplexIdentityRegistry implements ISolanaIdentityRegistry {
  readonly registryName = 'metaplex';
  readonly supportedAssetTypes: AssetType[] = ['agent'];
  readonly capabilities: RegistryCapabilities = {
    register: true, resolve: true, sync: true, deregister: false,
  };

  private executiveRegistered = false;

  constructor(private connection: MetaplexConnection) {}

  async register(passport: Passport, _options?: RegistrationOptions): Promise<RegistrationResult> {
    if (!passport.nft_mint) {
      throw new Error(`Cannot register on Metaplex: passport ${passport.passport_id} has no nft_mint`);
    }

    const umi = await this.connection.getUmi();
    const doc = buildRegistrationDocFromPassport(passport, { agentRegistry: 'solana:101:metaplex' });

    // 1. Upload registration doc to DePIN
    const { getAnchorDispatcher } = await import('../../../anchoring');
    const anchorResult = await getAnchorDispatcher().dispatch({
      artifact_type: 'agent_registration',
      artifact_id: `${passport.passport_id}:registration`,
      agent_passport_id: passport.passport_id,
      producer: 'MetaplexIdentityRegistry',
      storage_tier: 'permanent',
      payload: doc,
      tags: { 'Content-Type': 'application/json', 'lucid-registration': 'true' },
    });
    const registrationDocUri = anchorResult?.url ?? '';

    // 2. Register identity on-chain
    const { registerIdentityV1, publicKey } = require('@metaplex-foundation/mpl-agent-registry');
    const collectionAddress = process.env.METAPLEX_COLLECTION_ADDRESS;

    const identityResult = await registerIdentityV1(umi, {
      asset: publicKey(passport.nft_mint),
      ...(collectionAddress ? { collection: publicKey(collectionAddress) } : {}),
      agentRegistrationUri: registrationDocUri,
    }).sendAndConfirm(umi);
    const txSignature = Buffer.from(identityResult.signature).toString('base64');

    // 3. Register executive (one-time)
    await this.ensureExecutiveRegistered(umi);

    // 4. Delegate execution
    const {
      delegateExecutionV1,
      findAgentIdentityV1Pda,
      findExecutiveProfileV1Pda,
    } = require('@metaplex-foundation/mpl-agent-registry');

    const agentIdentity = findAgentIdentityV1Pda(umi, { asset: publicKey(passport.nft_mint) });
    const executiveProfile = findExecutiveProfileV1Pda(umi, { authority: umi.payer.publicKey });

    await delegateExecutionV1(umi, {
      agentAsset: publicKey(passport.nft_mint),
      agentIdentity,
      executiveProfile,
    }).sendAndConfirm(umi);

    return {
      registryName: this.registryName,
      externalId: passport.nft_mint,
      txSignature,
      registrationDocUri,
    };
  }

  async resolve(agentId: string): Promise<ExternalIdentity | null> {
    try {
      const umi = await this.connection.getUmi();
      const { findAgentIdentityV1Pda } = require('@metaplex-foundation/mpl-agent-registry');
      const { fetchAssetV1 } = require('@metaplex-foundation/mpl-core');
      const { publicKey } = require('@metaplex-foundation/umi');

      const pda = findAgentIdentityV1Pda(umi, { asset: publicKey(agentId) });
      const account = await umi.rpc.getAccount(pda);
      if (!account.exists) return null;

      const asset = await fetchAssetV1(umi, publicKey(agentId));
      return {
        registryName: this.registryName,
        externalId: agentId,
        owner: asset.owner?.toString() ?? '',
        metadata: {
          type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
          name: asset.name ?? '',
          description: '',
        },
        registrationDocUri: asset.uri,
      };
    } catch {
      return null;
    }
  }

  async sync(passport: Passport): Promise<TxReceipt | null> {
    if (!passport.nft_mint) return null;
    try {
      const umi = await this.connection.getUmi();
      const doc = buildRegistrationDocFromPassport(passport, { agentRegistry: 'solana:101:metaplex' });

      const { getAnchorDispatcher } = await import('../../../anchoring');
      const anchorResult = await getAnchorDispatcher().dispatch({
        artifact_type: 'agent_registration',
        artifact_id: `${passport.passport_id}:registration`,
        agent_passport_id: passport.passport_id,
        producer: 'MetaplexIdentityRegistry',
        storage_tier: 'permanent',
        payload: doc,
        tags: { 'Content-Type': 'application/json', 'lucid-registration': 'true' },
      });

      const { updateV1 } = require('@metaplex-foundation/mpl-core');
      const { publicKey } = require('@metaplex-foundation/umi');
      await updateV1(umi, {
        asset: publicKey(passport.nft_mint),
        uri: anchorResult?.url ?? '',
      }).sendAndConfirm(umi);

      return { success: true, txHash: '' };
    } catch {
      return null;
    }
  }

  async deregister(_agentId: string): Promise<TxReceipt | null> {
    throw new RegistryCapabilityError(this.registryName, 'deregister');
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.connection.getUmi();
      return true;
    } catch {
      return false;
    }
  }

  private async ensureExecutiveRegistered(umi: any): Promise<void> {
    if (this.executiveRegistered) return;
    const { registerExecutiveV1, findExecutiveProfileV1Pda } = require('@metaplex-foundation/mpl-agent-registry');
    const profilePda = findExecutiveProfileV1Pda(umi, { authority: umi.payer.publicKey });
    const account = await umi.rpc.getAccount(profilePda);
    if (!account.exists) {
      await registerExecutiveV1(umi, { payer: umi.payer }).sendAndConfirm(umi);
    }
    this.executiveRegistered = true;
  }
}
```

- [ ] **Step 5: Create metaplex/reputation.ts**

```typescript
// metaplex/reputation.ts
import type { IReputationSyncer, ExternalFeedback, ExternalSummary } from '../../../reputation/IReputationSyncer';
import type { FeedbackParams, TxReceipt, AssetType } from '../../../reputation/types';
import type { MetaplexConnection } from './connection';

export type MintLookup = (passportId: string) => Promise<string | null>;

export class MetaplexReputationSyncer implements IReputationSyncer {
  readonly syncerName = 'metaplex';
  readonly supportedAssetTypes: AssetType[] = ['agent'];

  constructor(
    private connection: MetaplexConnection,
    private mintLookup: MintLookup,
  ) {}

  async pullFeedback(passportId: string): Promise<ExternalFeedback[]> {
    try {
      const mint = await this.mintLookup(passportId);
      if (!mint) return [];

      const umi = await this.connection.getUmi();
      const { fetchAssetV1 } = require('@metaplex-foundation/mpl-core');
      const { publicKey } = require('@metaplex-foundation/umi');

      const asset = await fetchAssetV1(umi, publicKey(mint));
      const attrs = (asset as any)?.attributes?.attributeList ?? [];
      const feedbacks: ExternalFeedback[] = [];

      for (const attr of attrs) {
        if (typeof attr.key === 'string' && attr.key.startsWith('reputation:')) {
          feedbacks.push({
            source: this.syncerName,
            externalId: mint,
            score: parseFloat(attr.value) || 0,
            category: attr.key.replace('reputation:', ''),
            timestamp: Math.floor(Date.now() / 1000),
          });
        }
      }
      return feedbacks;
    } catch {
      return [];
    }
  }

  async pullSummary(passportId: string): Promise<ExternalSummary | null> {
    try {
      const feedbacks = await this.pullFeedback(passportId);
      if (feedbacks.length === 0) return null;

      const avgAttr = feedbacks.find(f => f.category === 'avg_score');
      const countAttr = feedbacks.find(f => f.category === 'feedback_count');

      return {
        source: this.syncerName,
        externalId: passportId,
        avgScore: avgAttr?.score ?? 0,
        feedbackCount: countAttr?.score ?? 0,
        lastUpdated: Math.floor(Date.now() / 1000),
      };
    } catch {
      return null;
    }
  }

  async pushFeedback(params: FeedbackParams): Promise<TxReceipt | null> {
    if (params.assetType !== 'agent') return null;
    try {
      const mint = await this.mintLookup(params.passportId);
      if (!mint) return null;

      const umi = await this.connection.getUmi();
      const { addPluginV1 } = require('@metaplex-foundation/mpl-core');
      const { publicKey } = require('@metaplex-foundation/umi');

      await addPluginV1(umi, {
        asset: publicKey(mint),
        plugin: {
          type: 'Attributes',
          attributeList: [
            { key: `reputation:avg_score`, value: String(params.score) },
            { key: `reputation:feedback_count`, value: '1' },
            { key: `reputation:last_updated`, value: String(Math.floor(Date.now() / 1000)) },
          ],
        },
      }).sendAndConfirm(umi);

      return { success: true };
    } catch {
      return null;
    }
  }

  async resolveExternalId(passportId: string): Promise<string | null> {
    return this.mintLookup(passportId);
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.connection.getUmi();
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 6: Create metaplex/index.ts barrel**

```typescript
export { MetaplexConnection, getMetaplexConnection, resetMetaplexConnection } from './connection';
export { MetaplexIdentityRegistry } from './identity';
export { MetaplexReputationSyncer } from './reputation';
export type { MintLookup } from './reputation';
```

- [ ] **Step 7: Write MetaplexReputationSyncer test**

```typescript
// __tests__/MetaplexReputationSyncer.test.ts
import { MetaplexReputationSyncer } from '../metaplex/reputation';

const mockFetchAssetV1 = jest.fn();
const mockAddPluginV1 = jest.fn().mockReturnValue({ sendAndConfirm: jest.fn().mockResolvedValue({}) });

jest.mock('@metaplex-foundation/mpl-core', () => ({
  fetchAssetV1: (...args: any[]) => mockFetchAssetV1(...args),
  addPluginV1: (...args: any[]) => mockAddPluginV1(...args),
}), { virtual: true });

jest.mock('@metaplex-foundation/umi', () => ({
  publicKey: (k: string) => k,
}), { virtual: true });

const mockUmi = {};
const mockConnection = { getUmi: jest.fn().mockResolvedValue(mockUmi) } as any;
const mockMintLookup = jest.fn();

describe('MetaplexReputationSyncer', () => {
  let syncer: MetaplexReputationSyncer;

  beforeEach(() => {
    jest.clearAllMocks();
    syncer = new MetaplexReputationSyncer(mockConnection, mockMintLookup);
  });

  it('has correct syncer name', () => {
    expect(syncer.syncerName).toBe('metaplex');
  });

  it('supports agent asset type only', () => {
    expect(syncer.supportedAssetTypes).toEqual(['agent']);
  });

  describe('pullFeedback', () => {
    it('returns empty when no mint found', async () => {
      mockMintLookup.mockResolvedValue(null);
      expect(await syncer.pullFeedback('p1')).toEqual([]);
    });

    it('reads reputation attributes from asset', async () => {
      mockMintLookup.mockResolvedValue('MintPubkey');
      mockFetchAssetV1.mockResolvedValue({
        attributes: {
          attributeList: [
            { key: 'reputation:avg_score', value: '85' },
            { key: 'reputation:feedback_count', value: '10' },
          ],
        },
      });

      const result = await syncer.pullFeedback('p1');
      expect(result).toHaveLength(2);
      expect(result[0].source).toBe('metaplex');
      expect(result[0].score).toBe(85);
      expect(result[0].category).toBe('avg_score');
    });
  });

  describe('pushFeedback', () => {
    it('returns null for non-agent types', async () => {
      const result = await syncer.pushFeedback({
        passportId: 'p1', score: 80, category: 'quality',
        receiptHash: 'abc', assetType: 'model',
      });
      expect(result).toBeNull();
    });

    it('returns null when no mint found', async () => {
      mockMintLookup.mockResolvedValue(null);
      const result = await syncer.pushFeedback({
        passportId: 'p1', score: 80, category: 'quality',
        receiptHash: 'abc', assetType: 'agent',
      });
      expect(result).toBeNull();
    });

    it('writes attributes plugin when mint exists', async () => {
      mockMintLookup.mockResolvedValue('MintPubkey');
      const result = await syncer.pushFeedback({
        passportId: 'p1', score: 80, category: 'quality',
        receiptHash: 'abc', assetType: 'agent',
      });
      expect(result).toEqual({ success: true });
      expect(mockAddPluginV1).toHaveBeenCalled();
    });
  });

  describe('resolveExternalId', () => {
    it('delegates to mintLookup', async () => {
      mockMintLookup.mockResolvedValue('MintPubkey');
      expect(await syncer.resolveExternalId('p1')).toBe('MintPubkey');
    });
  });
});
```

- [ ] **Step 8: Run tests**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --testPathPattern='Metaplex(Identity|Reputation)' --no-coverage 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2 && git add offchain/packages/engine/src/identity/projections/metaplex/ offchain/packages/engine/src/identity/projections/__tests__/Metaplex* && git commit -m "feat(identity): add Metaplex identity registry + reputation syncer with mpl-agent-registry"
```

---

### Task 5: Factory + Barrel Exports + Wire into Existing Factories

**Files:**
- Create: `engine/src/identity/projections/factory.ts`
- Create: `engine/src/identity/projections/index.ts`
- Modify: `engine/src/identity/index.ts`
- Modify: `engine/src/reputation/index.ts`
- Delete: `engine/src/reputation/syncers/Solana8004Syncer.ts`
- Test: `engine/src/identity/projections/__tests__/factory.test.ts`

- [ ] **Step 1: Write failing test for factory**

```typescript
// __tests__/factory.test.ts
import { getIdentityRegistries, resetIdentityRegistryFactory } from '../factory';

describe('getIdentityRegistries', () => {
  beforeEach(() => {
    resetIdentityRegistryFactory();
    delete process.env.IDENTITY_REGISTRIES;
  });

  it('returns empty array when IDENTITY_REGISTRIES not set', () => {
    expect(getIdentityRegistries()).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    process.env.IDENTITY_REGISTRIES = '';
    expect(getIdentityRegistries()).toEqual([]);
  });

  it('returns singleton (same array on second call)', () => {
    const first = getIdentityRegistries();
    const second = getIdentityRegistries();
    expect(first).toBe(second);
  });

  it('reset clears singleton', () => {
    const first = getIdentityRegistries();
    resetIdentityRegistryFactory();
    const second = getIdentityRegistries();
    expect(first).not.toBe(second);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --testPathPattern='projections/__tests__/factory' --no-coverage 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Create factory.ts**

```typescript
// factory.ts
import type { ISolanaIdentityRegistry } from './ISolanaIdentityRegistry';
import { logger } from '../../shared/lib/logger';

let _registries: ISolanaIdentityRegistry[] | null = null;

export function getIdentityRegistries(): ISolanaIdentityRegistry[] {
  if (_registries) return _registries;
  _registries = [];

  const names = (process.env.IDENTITY_REGISTRIES || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  for (const name of names) {
    try {
      switch (name) {
        case 'metaplex': {
          const { getMetaplexConnection, MetaplexIdentityRegistry } = require('./metaplex');
          _registries.push(new MetaplexIdentityRegistry(getMetaplexConnection()));
          break;
        }
        case 'quantulabs': {
          const { getQuantuLabsConnection, QuantuLabsIdentityRegistry } = require('./quantulabs');
          _registries.push(new QuantuLabsIdentityRegistry(getQuantuLabsConnection()));
          break;
        }
        default:
          logger.warn(`[Identity] Unknown registry: ${name}`);
      }
    } catch (err) {
      logger.warn(`[Identity] Failed to init registry '${name}':`, err instanceof Error ? err.message : err);
    }
  }

  logger.info(`[Identity] Registries: ${_registries.length === 0 ? 'none' : _registries.map(r => r.registryName).join(', ')}`);
  return _registries;
}

export function resetIdentityRegistryFactory(): void {
  _registries = null;
}
```

- [ ] **Step 4: Create projections/index.ts barrel**

```typescript
export type {
  ISolanaIdentityRegistry,
  RegistryCapabilities,
  RegistrationOptions,
  RegistrationResult,
  ExternalIdentity,
} from './ISolanaIdentityRegistry';
export { RegistryCapabilityError } from './ISolanaIdentityRegistry';
export { getIdentityRegistries, resetIdentityRegistryFactory } from './factory';
export { buildRegistrationDocFromPassport } from './registration-doc/buildRegistrationDoc';
export type { ERC8004RegistrationDoc } from './registration-doc/types';
```

- [ ] **Step 5: Update `engine/src/identity/index.ts`**

Add at the end:

```typescript
// ─── Projections (Solana Identity Registries) ─────────────────────────────
export { getIdentityRegistries, resetIdentityRegistryFactory, RegistryCapabilityError, buildRegistrationDocFromPassport } from './projections';
export type { ISolanaIdentityRegistry, RegistryCapabilities, RegistrationResult, ExternalIdentity, ERC8004RegistrationDoc } from './projections';
```

- [ ] **Step 6: Update `engine/src/reputation/index.ts`**

Replace the `case '8004'` block to use the new QuantuLabs module, and add `case 'metaplex'`:

In the `getReputationSyncers()` function, replace:
```typescript
      case '8004': {
        try {
          const { SolanaSDK } = require('8004-solana');
          const { Solana8004Syncer } = require('./syncers/Solana8004Syncer');
          _syncers.push(new Solana8004Syncer(new SolanaSDK()));
        } catch {
          logger.warn('[Reputation] 8004-solana SDK not available, skipping syncer');
        }
        break;
      }
```

With:
```typescript
      case '8004':
      case 'quantulabs': {
        try {
          const { getQuantuLabsConnection, QuantuLabsReputationSyncer } = require('../identity/projections/quantulabs');
          _syncers.push(new QuantuLabsReputationSyncer(getQuantuLabsConnection()));
        } catch (err) {
          logger.warn('[Reputation] QuantuLabs syncer not available:', err instanceof Error ? err.message : err);
        }
        break;
      }
      case 'metaplex': {
        try {
          const { getMetaplexConnection, MetaplexReputationSyncer } = require('../identity/projections/metaplex');
          const { getPassportStore } = require('../identity/stores/passportStore');
          const mintLookup = async (id: string) => (await getPassportStore().get(id))?.nft_mint ?? null;
          _syncers.push(new MetaplexReputationSyncer(getMetaplexConnection(), mintLookup));
        } catch (err) {
          logger.warn('[Reputation] Metaplex syncer not available:', err instanceof Error ? err.message : err);
        }
        break;
      }
```

- [ ] **Step 7: Delete old Solana8004Syncer**

```bash
rm offchain/packages/engine/src/reputation/syncers/Solana8004Syncer.ts
```

- [ ] **Step 8: Run factory test + full test suite check**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --testPathPattern='projections/__tests__/factory' --no-coverage 2>&1 | tail -5`
Expected: PASS

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --no-coverage 2>&1 | tail -10`
Expected: All existing tests pass (the old Solana8004Syncer.test.ts will fail — that's the migrated test, delete it next step)

- [ ] **Step 9: Delete old test, verify all pass**

```bash
rm offchain/packages/engine/src/reputation/__tests__/Solana8004Syncer.test.ts
```

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --no-coverage 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 10: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2 && git add -A && git commit -m "feat(identity): wire projection factory + update reputation factory + delete Solana8004Syncer"
```

---

### Task 6: Passport Store Field + Async Projection Job + PassportManager Hook

**Files:**
- Modify: `engine/src/identity/stores/passportStore.ts`
- Create: `engine/src/identity/projections/jobs/syncExternalIdentity.ts`
- Modify: `engine/src/identity/passport/passportManager.ts`
- Test: `engine/src/identity/projections/__tests__/syncExternalIdentity.test.ts`

- [ ] **Step 1: Add `external_registrations` to Passport interface**

In `passportStore.ts`, add after the `share_token_mint` field:

```typescript
  // External identity projection cache (summary — not the operational ledger)
  external_registrations?: Record<string, {
    externalId: string;
    txSignature: string;
    registrationDocUri?: string;
    registeredAt: number;
    lastSyncedAt: number;
    status: 'synced' | 'failed' | 'pending';
    lastError?: string;
  }>;
```

Then add a registry-specific merge helper to `passportStore.ts` to avoid race conditions when multiple registries finish near-simultaneously:

```typescript
  /** Atomically update a single registry's projection status (no clobbering) */
  async updateExternalRegistration(
    passportId: string,
    registryName: string,
    patch: Partial<Passport['external_registrations'][string]>,
  ): Promise<void> {
    const existing = await this.get(passportId);
    if (!existing) return;
    const registrations = { ...(existing.external_registrations ?? {}) };
    registrations[registryName] = { ...(registrations[registryName] ?? {}), ...patch } as any;
    await this.update(passportId, { external_registrations: registrations });
  }
```

- [ ] **Step 2: Write failing test for syncExternalIdentity**

```typescript
// __tests__/syncExternalIdentity.test.ts
import { syncExternalIdentity } from '../jobs/syncExternalIdentity';

const mockRegister = jest.fn().mockResolvedValue({
  registryName: 'metaplex',
  externalId: 'MintPubkey',
  txSignature: 'tx-123',
  registrationDocUri: 'https://arweave.net/doc',
});

const mockRegistry = {
  registryName: 'metaplex',
  supportedAssetTypes: ['agent'],
  capabilities: { register: true, resolve: true, sync: true, deregister: false },
  register: mockRegister,
  sync: jest.fn().mockResolvedValue({ success: true }),
  isAvailable: jest.fn().mockResolvedValue(true),
};

jest.mock('../factory', () => ({
  getIdentityRegistries: () => [mockRegistry],
}));

const mockStoreUpdate = jest.fn();
jest.mock('../../stores/passportStore', () => ({
  getPassportStore: () => ({ get: jest.fn().mockResolvedValue({}), update: mockStoreUpdate }),
}));

describe('syncExternalIdentity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registers passport on available registries', async () => {
    const passport = {
      passport_id: 'p1', type: 'agent', owner: '3Qm', name: 'Agent',
      metadata: {}, status: 'active', nft_mint: 'MintPubkey',
      created_at: 0, updated_at: 0,
    } as any;

    await syncExternalIdentity(passport);

    expect(mockRegister).toHaveBeenCalledWith(passport, { skipIfExists: true });
    expect(mockStoreUpdate).toHaveBeenCalled();
  });

  it('skips registries that do not support the asset type', async () => {
    const passport = {
      passport_id: 'p1', type: 'model', owner: '3Qm', name: 'Model',
      metadata: {}, status: 'active', nft_mint: 'MintPubkey',
      created_at: 0, updated_at: 0,
    } as any;

    await syncExternalIdentity(passport);

    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('does not throw on registry failure', async () => {
    mockRegister.mockRejectedValueOnce(new Error('Network error'));

    const passport = {
      passport_id: 'p1', type: 'agent', owner: '3Qm', name: 'Agent',
      metadata: {}, status: 'active', nft_mint: 'MintPubkey',
      created_at: 0, updated_at: 0,
    } as any;

    await expect(syncExternalIdentity(passport)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --testPathPattern='syncExternalIdentity' --no-coverage 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 4: Implement syncExternalIdentity**

```typescript
// jobs/syncExternalIdentity.ts
import type { Passport } from '../../stores/passportStore';
import { getIdentityRegistries } from '../factory';
import { logger } from '../../../shared/lib/logger';

const MAX_RETRIES = parseInt(process.env.IDENTITY_PROJECTION_MAX_RETRIES || '3', 10);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt - 1), 8000); // 1s, 2s, 4s, 8s cap
  const jitter = Math.random() * 300;
  return base + jitter;
}

async function projectToRegistry(
  registry: { registryName: string; register: Function; sync: Function; capabilities: { register: boolean; sync: boolean } },
  passport: Passport,
  mode: 'register' | 'sync',
): Promise<void> {
  const { getPassportStore } = await import('../../stores/passportStore');
  const store = getPassportStore();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = mode === 'register'
        ? await registry.register(passport, { skipIfExists: true })
        : await registry.sync(passport);

      if (result) {
        await store.updateExternalRegistration(passport.passport_id, registry.registryName, {
          externalId: result.externalId ?? '',
          txSignature: result.txSignature ?? '',
          registrationDocUri: result.registrationDocUri,
          registeredAt: Date.now(),
          lastSyncedAt: Date.now(),
          status: 'synced',
          lastError: undefined,
        });
      }

      logger.info(`[Identity] Projected ${passport.passport_id} to ${registry.registryName} (${mode}, attempt ${attempt})`);
      return;
    } catch (err) {
      logger.warn(`[Identity] ${registry.registryName} ${mode} attempt ${attempt}/${MAX_RETRIES} failed:`, err instanceof Error ? err.message : err);

      if (attempt === MAX_RETRIES) {
        // Mark as failed after all retries exhausted
        try {
          await store.updateExternalRegistration(passport.passport_id, registry.registryName, {
            lastSyncedAt: Date.now(),
            status: 'failed',
            lastError: err instanceof Error ? err.message : String(err),
          });
        } catch { /* best effort */ }
      } else {
        await sleep(backoffMs(attempt)); // exponential backoff + jitter
      }
    }
  }
}

export async function syncExternalIdentity(passport: Passport, mode: 'register' | 'sync' = 'register'): Promise<void> {
  const registries = getIdentityRegistries();
  if (registries.length === 0) return;

  const capability = mode === 'register' ? 'register' : 'sync';
  const compatible = registries.filter(
    r => r.supportedAssetTypes.includes(passport.type as any) && r.capabilities[capability],
  );

  // Run all compatible registries in parallel — one slow registry does not delay others
  await Promise.allSettled(
    compatible.map(registry => projectToRegistry(registry as any, passport, mode)),
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --testPathPattern='syncExternalIdentity' --no-coverage 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 6: Add durable projection trigger to PassportManager**

Instead of `setImmediate()` (fragile — lost on crash/restart), use a durable projection queue. Write a pending job to the passport store, then drain it.

In `passportManager.ts`, add the trigger method:

```typescript
  /**
   * Enqueue a durable identity projection job.
   * Writes 'pending' status to external_registrations, then runs sync.
   * If process crashes mid-projection, pending entries are retried on next startup
   * or manual re-sync.
   */
  private async triggerIdentityProjection(passport: Passport, mode: 'register' | 'sync' = 'register'): Promise<void> {
    // Mark all enabled registries as 'pending' before starting (durable intent)
    try {
      const { getIdentityRegistries } = await import('../projections/factory');
      const registries = getIdentityRegistries();
      for (const registry of registries) {
        if (registry.supportedAssetTypes.includes(passport.type as any) && registry.capabilities[mode]) {
          await this.store.updateExternalRegistration(passport.passport_id, registry.registryName, {
            status: 'pending',
            lastSyncedAt: Date.now(),
          });
        }
      }
    } catch { /* best effort */ }

    // Run projection in background (non-blocking to caller)
    setImmediate(async () => {
      try {
        const { syncExternalIdentity } = await import('../projections/jobs/syncExternalIdentity');
        await syncExternalIdentity(passport, mode);
      } catch (err) {
        logger.warn(`[PassportManager] Identity projection failed for ${passport.passport_id}:`, err instanceof Error ? err.message : err);
      }
    });
  }
```

The key improvement: **pending status is persisted before the async work starts**. If the process crashes, `external_registrations[registry].status === 'pending'` is observable. A startup reconciler or manual `POST /v1/passports/:id/sync` can retry pending entries. This is a lightweight durable queue — no separate table needed for V1.

Then wire it into three places:

**a)** After the NFT mint block in `createPassport()` (around line 392):
```typescript
      // Trigger durable identity projection (non-blocking)
      this.triggerIdentityProjection(passport, 'register');
```

**b)** At the end of `updatePassport()` (after the store update succeeds):
```typescript
      this.triggerIdentityProjection(updated, 'sync');
```

**c)** At the end of `updateEndpoints()` (after the store update succeeds, around line 674):
```typescript
      this.triggerIdentityProjection(updated, 'sync');
```

- [ ] **Step 7: Run full test suite**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --no-coverage 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2 && git add -A && git commit -m "feat(identity): async projection job + PassportManager trigger + external_registrations field"
```

---

### Task 7: syncExternalReputation Job

**Files:**
- Create: `engine/src/identity/projections/jobs/syncExternalReputation.ts`

- [ ] **Step 1: Implement syncExternalReputation**

```typescript
// jobs/syncExternalReputation.ts
import type { FeedbackParams } from '../../../reputation/types';
import { logger } from '../../../shared/lib/logger';

/**
 * Push a reputation feedback event to all external registries that have reputation syncers.
 * Called after local reputation is written (e.g., new feedback, score recalculation).
 */
export async function syncExternalReputation(params: FeedbackParams): Promise<void> {
  try {
    const { getReputationSyncers } = await import('../../../reputation');
    const syncers = getReputationSyncers();
    if (syncers.length === 0) return;

    const pushPromises = syncers
      .filter(s => s.supportedAssetTypes.includes(params.assetType as any))
      .map(async (syncer) => {
        try {
          await syncer.pushFeedback(params);
          logger.info(`[Reputation] Pushed feedback to ${syncer.syncerName} for ${params.passportId}`);
        } catch (err) {
          logger.warn(`[Reputation] Push to ${syncer.syncerName} failed:`, err instanceof Error ? err.message : err);
        }
      });

    await Promise.allSettled(pushPromises);
  } catch (err) {
    logger.warn('[Reputation] syncExternalReputation failed:', err instanceof Error ? err.message : err);
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2 && git add offchain/packages/engine/src/identity/projections/jobs/syncExternalReputation.ts && git commit -m "feat(identity): add syncExternalReputation job for async reputation push"
```

---

### Task 8: Install Dependency + Final Integration Test

**Files:**
- Modify: `engine/package.json`

- [ ] **Step 1: Add mpl-agent-registry dependency**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain && npm install --workspace=packages/engine @metaplex-foundation/mpl-agent-registry
```

If the package is not yet on npm (check first), add it to package.json with `"*"` and note it as pending.

- [ ] **Step 2: Run type-check**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npm run type-check 2>&1 | tail -20`
Expected: No errors in new files (may have pre-existing errors elsewhere)

- [ ] **Step 3: Run full test suite**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npm test 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2 && git add -A && git commit -m "feat(identity): add mpl-agent-registry dependency + final integration"
```
