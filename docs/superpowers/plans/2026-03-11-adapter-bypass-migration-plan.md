# Adapter Bypass Migration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate 13 services from direct chain calls to `IBlockchainAdapter` sub-interfaces, making the adapter the single entry point for all chain interactions.

**Architecture:** 3 new sub-interfaces (`IIdentityAdapter`, `IValidationAdapter`, `ICrossChainAdapter`) + transport accessors (`getConnection()`, `getSigner()`). EVMAdapter delegates to existing service classes. SolanaAdapter stubs EVM-only features with `ChainFeatureUnavailable`. Callers migrate from importing services directly to using the adapter factory.

**Tech Stack:** TypeScript, @solana/web3.js, viem, @coral-xyz/anchor, Jest

**Spec:** `docs/superpowers/specs/2026-03-11-adapter-bypass-migration-design.md`

---

## Chunk 1: Foundation — New Interfaces + Adapter Updates

### Task 1: Define 3 new sub-interfaces in domain-interfaces.ts

**Files:**
- Modify: `offchain/packages/engine/src/chains/domain-interfaces.ts:217` (insert after IGasAdapter, before ChainCapabilities)
- Reference: `offchain/packages/engine/src/identity/registries/types.ts` (ValidationRecord)
- Reference: `offchain/packages/engine/src/identity/crossChainBridgeTypes.ts` (BridgeQuote)

- [ ] **Step 1: Write failing test — new interfaces are importable**

Create: `offchain/packages/engine/src/__tests__/adapterInterfaces.test.ts`

```typescript
import type {
  IIdentityAdapter,
  IValidationAdapter,
  ICrossChainAdapter,
} from '../chains/domain-interfaces';

describe('New adapter sub-interfaces', () => {
  it('IIdentityAdapter has required methods', () => {
    const adapter: IIdentityAdapter = {
      register: async () => ({ hash: '', chainId: '', success: true }),
      query: async () => null,
      createTBA: async () => ({ address: '', hash: '' }),
      getTBA: async () => '',
      isTBADeployed: async () => false,
      installModule: async () => ({ hash: '', chainId: '', success: true }),
      uninstallModule: async () => ({ hash: '', chainId: '', success: true }),
      configurePolicy: async () => ({ hash: '', chainId: '', success: true }),
      configurePayout: async () => ({ hash: '', chainId: '', success: true }),
    };
    expect(adapter).toBeDefined();
  });

  it('IValidationAdapter has required methods', () => {
    const adapter: IValidationAdapter = {
      requestValidation: async () => ({ hash: '', chainId: '', success: true }),
      submitResult: async () => ({ hash: '', chainId: '', success: true }),
      getValidation: async () => null,
      getValidationCount: async () => 0n,
      verifyMMRProof: async () => false,
    };
    expect(adapter).toBeDefined();
  });

  it('ICrossChainAdapter has required methods', () => {
    const adapter: ICrossChainAdapter = {
      bridgeTokens: async () => ({ hash: '', chainId: '', success: true }),
      getQuote: async () => ({ sourceChainId: '', destChainId: '', amount: '', estimatedFee: '', estimatedDeliveryMs: 0 }),
      getBridgeStatus: async () => ({ completed: false }),
    };
    expect(adapter).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd offchain && npx jest --testPathPattern="adapterInterfaces" --no-coverage 2>&1 | tail -5`
Expected: FAIL — `IIdentityAdapter` not exported from domain-interfaces

- [ ] **Step 3: Add IIdentityAdapter interface**

In `offchain/packages/engine/src/chains/domain-interfaces.ts`, insert after line 217 (end of `IGasAdapter`):

```typescript
// =============================================================================
// IIdentityAdapter
// =============================================================================

export interface IIdentityAdapter {
  /** Register an agent identity (ERC-721 mint). EVMAdapter wraps raw tx hash with receipt confirmation. */
  register(metadataURI: string, to: string): Promise<TxReceipt>;

  /** Query agent by token ID */
  query(tokenId: string): Promise<AgentIdentity | null>;

  /**
   * Create a Token Bound Account for an agent.
   * chainId and salt are derived from adapter config.
   */
  createTBA(tokenContract: string, tokenId: string): Promise<{ address: string; hash: string }>;

  /** Get deterministic TBA address */
  getTBA(tokenContract: string, tokenId: string): Promise<string>;

  /** Check if TBA is deployed */
  isTBADeployed(address: string): Promise<boolean>;

  /**
   * Install an ERC-7579 module on an account.
   * chainId is sourced from adapter state.
   */
  installModule(
    accountAddress: string,
    moduleType: number,
    moduleAddress: string,
    initData: string,
  ): Promise<TxReceipt>;

  /** Uninstall an ERC-7579 module */
  uninstallModule(
    accountAddress: string,
    moduleType: number,
    moduleAddress: string,
  ): Promise<TxReceipt>;

  /**
   * Configure policy module constraints.
   * Known limitation: current ERC7579Service only applies policyHashes[0].
   */
  configurePolicy(accountAddress: string, policyHashes: string[]): Promise<TxReceipt>;

  /** Configure payout module splits */
  configurePayout(
    accountAddress: string,
    recipients: Array<{ address: string; bps: number }>,
  ): Promise<TxReceipt>;
}
```

Need to add `AgentIdentity` import at top of file:
```typescript
import type { AgentIdentity } from './types';
```

- [ ] **Step 4: Add IValidationAdapter interface**

Insert after IIdentityAdapter:

```typescript
// =============================================================================
// IValidationAdapter
// =============================================================================

export interface IValidationAdapter {
  /** Request validation for an agent's receipt */
  requestValidation(agentTokenId: string, receiptHash: string, metadata?: string): Promise<TxReceipt>;

  /** Submit validation result */
  submitResult(
    agentTokenId: string,
    receiptHash: string,
    valid: boolean,
  ): Promise<TxReceipt>;

  /** Get a validation record */
  getValidation(validationId: string): Promise<ValidationRecord | null>;

  /** Get validation count for an agent */
  getValidationCount(agentTokenId: string): Promise<bigint>;

  /** Verify an MMR proof on-chain */
  verifyMMRProof(
    leafHash: string,
    siblings: string[],
    peaks: string[],
    leafIndex: number,
    expectedRoot: string,
  ): Promise<boolean>;
}
```

Need to add `ValidationRecord` import:
```typescript
import type { ValidationRecord } from '../identity/registries/types';
```

- [ ] **Step 5: Add ICrossChainAdapter interface**

Insert after IValidationAdapter:

```typescript
// =============================================================================
// ICrossChainAdapter
// =============================================================================

export interface ICrossChainAdapter {
  /** Bridge tokens to another chain */
  bridgeTokens(params: {
    destChainId: number;
    recipient: string;
    amount: string;
    minAmount: string;
  }): Promise<TxReceipt>;

  /** Get a bridge quote */
  getQuote(destChainId: number, amount: string): Promise<BridgeQuote>;

  /**
   * Get bridge transaction status.
   * sourceChainId defaults to the adapter's own chainId.
   */
  getBridgeStatus(txHash: string, sourceChainId?: string): Promise<{ completed: boolean; destTxHash?: string }>;
}
```

Need to add `BridgeQuote` import:
```typescript
import type { BridgeQuote } from '../identity/crossChainBridgeTypes';
```

- [ ] **Step 6: Update ChainCapabilities with new flags**

In the same file, update the `ChainCapabilities` interface to add:

```typescript
  identity: boolean;    // ERC-721 + TBA + ERC-7579
  validation: boolean;  // On-chain validation registry
  bridge: boolean;      // Cross-chain token bridging
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd offchain && npx jest --testPathPattern="adapterInterfaces" --no-coverage 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 8: Run type check**

Run: `cd offchain && npm run type-check 2>&1 | grep -c "domain-interfaces"`
Expected: 0 (no errors in domain-interfaces.ts)

Note: ChainCapabilities change will cause errors in SolanaAdapter and EVMAdapter `capabilities()` — those are fixed in Task 3 and 4.

- [ ] **Step 9: Commit**

```bash
git add offchain/packages/engine/src/chains/domain-interfaces.ts offchain/packages/engine/src/__tests__/adapterInterfaces.test.ts
git commit -m "feat(chains): add IIdentityAdapter, IValidationAdapter, ICrossChainAdapter sub-interfaces"
```

---

### Task 2: Update adapter-interface.ts with new methods + deprecations

**Files:**
- Modify: `offchain/packages/engine/src/chains/adapter-interface.ts:86-93` (add new optional methods)

- [ ] **Step 1: Add imports for new interfaces**

At line 24 of `adapter-interface.ts`, update the import to include new interfaces:

```typescript
import type {
  IEpochAdapter,
  IEscrowAdapter,
  IPassportAdapter,
  IAgentWalletAdapter,
  IGasAdapter,
  IIdentityAdapter,
  IValidationAdapter,
  ICrossChainAdapter,
  ChainCapabilities,
} from './domain-interfaces';
```

- [ ] **Step 2: Deprecate registerAgent and queryAgent**

Add `@deprecated` JSDoc to lines 57-61:

```typescript
  /**
   * @deprecated Use `identity().register()` instead. Will be removed in a future release.
   */
  registerAgent(metadata: AgentRegistration): Promise<TxReceipt>;

  /**
   * @deprecated Use `identity().query()` instead. Will be removed in a future release.
   */
  queryAgent(agentId: string): Promise<AgentIdentity | null>;
```

- [ ] **Step 3: Add new sub-adapter methods and transport accessors**

After `gas?(): IGasAdapter;` (line 90), add:

```typescript
  /** Identity registry: ERC-721, TBA, ERC-7579 modules (optional — EVM only) */
  identity?(): IIdentityAdapter;

  /** Validation registry: on-chain validation requests and MMR proof verification (optional — EVM only) */
  validation?(): IValidationAdapter;

  /** Cross-chain bridge: LayerZero OFT token bridging (optional — EVM only) */
  bridge?(): ICrossChainAdapter;

  /**
   * Access the underlying chain connection (for chain-specific domain providers).
   * Solana: returns Connection. EVM: returns PublicClient.
   * WARNING: Only for use by chain-specific domain providers (INFTProvider, ITokenLauncher).
   * Business logic should use typed sub-interface methods instead.
   */
  getConnection(): unknown;

  /**
   * Access the signer/keypair (for chain-specific domain providers).
   * Solana: returns Keypair | null. EVM: returns WalletClient | null.
   * WARNING: Same usage restriction as getConnection().
   */
  getSigner(): unknown;
```

- [ ] **Step 4: Run type check**

Run: `cd offchain && npm run type-check 2>&1 | grep "adapter-interface"`
Expected: 0 errors in adapter-interface.ts itself. Note: SolanaAdapter and EVMAdapter will error on missing `getConnection()`, `getSigner()`, and new `ChainCapabilities` fields — fixed in Tasks 3 and 4. Do NOT commit until Tasks 3-4 are also done (or temporarily mark `getConnection` and `getSigner` as optional with `?`).

- [ ] **Step 5: Commit**

```bash
git add offchain/packages/engine/src/chains/adapter-interface.ts
git commit -m "feat(chains): add identity/validation/bridge to IBlockchainAdapter, deprecate registerAgent/queryAgent"
```

---

### Task 3: Implement on SolanaAdapter — stubs + transport + capabilities

**Files:**
- Modify: `offchain/packages/engine/src/chains/solana/adapter.ts`

- [ ] **Step 1: Add IGasAdapter, IIdentityAdapter, IValidationAdapter, ICrossChainAdapter imports**

Update the import at line 32:

```typescript
import type { IEpochAdapter, IEscrowAdapter, IPassportAdapter, IAgentWalletAdapter, IGasAdapter, IIdentityAdapter, IValidationAdapter, ICrossChainAdapter, ChainCapabilities } from '../domain-interfaces';
```

- [ ] **Step 2: Add identity() stub**

Insert before the `// Helpers` comment (before `gas()` method or after `agentWallet()` — find the right location after `gas()` method):

```typescript
  identity(): IIdentityAdapter {
    const chainId = this._chainId;
    return {
      async register() { throw new ChainFeatureUnavailable('identity.register (EVM-only: ERC-721)', chainId); },
      async query() { throw new ChainFeatureUnavailable('identity.query (EVM-only: ERC-721)', chainId); },
      async createTBA() { throw new ChainFeatureUnavailable('identity.createTBA (EVM-only: ERC-6551)', chainId); },
      async getTBA() { throw new ChainFeatureUnavailable('identity.getTBA (EVM-only: ERC-6551)', chainId); },
      async isTBADeployed() { throw new ChainFeatureUnavailable('identity.isTBADeployed (EVM-only: ERC-6551)', chainId); },
      async installModule() { throw new ChainFeatureUnavailable('identity.installModule (EVM-only: ERC-7579)', chainId); },
      async uninstallModule() { throw new ChainFeatureUnavailable('identity.uninstallModule (EVM-only: ERC-7579)', chainId); },
      async configurePolicy() { throw new ChainFeatureUnavailable('identity.configurePolicy (EVM-only: ERC-7579)', chainId); },
      async configurePayout() { throw new ChainFeatureUnavailable('identity.configurePayout (EVM-only: ERC-7579)', chainId); },
    };
  }

  validation(): IValidationAdapter {
    const chainId = this._chainId;
    return {
      async requestValidation() { throw new ChainFeatureUnavailable('validation.requestValidation (EVM-only)', chainId); },
      async submitResult() { throw new ChainFeatureUnavailable('validation.submitResult (EVM-only)', chainId); },
      async getValidation() { throw new ChainFeatureUnavailable('validation.getValidation (EVM-only)', chainId); },
      async getValidationCount() { throw new ChainFeatureUnavailable('validation.getValidationCount (EVM-only)', chainId); },
      async verifyMMRProof() { throw new ChainFeatureUnavailable('validation.verifyMMRProof (EVM-only)', chainId); },
    };
  }

  bridge(): ICrossChainAdapter {
    const chainId = this._chainId;
    return {
      async bridgeTokens() { throw new ChainFeatureUnavailable('bridge.bridgeTokens (EVM-only: LayerZero OFT)', chainId); },
      async getQuote() { throw new ChainFeatureUnavailable('bridge.getQuote (EVM-only: LayerZero OFT)', chainId); },
      async getBridgeStatus() { throw new ChainFeatureUnavailable('bridge.getBridgeStatus (EVM-only: LayerZero OFT)', chainId); },
    };
  }
```

- [ ] **Step 3: Add getConnection() and getSigner() transport accessors**

```typescript
  getConnection(): unknown {
    this.ensureConnected();
    return this._connection;
  }

  getSigner(): unknown {
    return this.loadKeypair();
  }
```

- [ ] **Step 4: Update capabilities() with new flags**

In the `capabilities()` method (around line 1295), add the 3 new fields:

```typescript
  capabilities(): ChainCapabilities {
    return {
      epoch: true,
      passport: true,
      escrow: !!this._config?.agentWalletProgram,
      verifyAnchor: true,
      sessionKeys: !!this._config?.agentWalletProgram,
      zkml: false,
      paymaster: false,
      identity: false,
      validation: false,
      bridge: false,
    };
  }
```

- [ ] **Step 5: Run type check**

Run: `cd offchain && npm run type-check 2>&1 | grep "solana/adapter"`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add offchain/packages/engine/src/chains/solana/adapter.ts
git commit -m "feat(solana): add identity/validation/bridge stubs + transport accessors to SolanaAdapter"
```

---

### Task 4: Implement on EVMAdapter — delegate to existing services + capabilities

**Files:**
- Modify: `offchain/packages/engine/src/chains/evm/adapter.ts`
- Reference: `offchain/packages/engine/src/identity/registries/evm-identity.ts`
- Reference: `offchain/packages/engine/src/identity/tba/evm-registry-client.ts`
- Reference: `offchain/packages/engine/src/identity/erc7579Service.ts`
- Reference: `offchain/packages/engine/src/identity/registries/evm-validation.ts`
- Reference: `offchain/packages/engine/src/identity/crossChainBridgeService.ts`

- [ ] **Step 1: Add new interface imports**

Update the domain-interfaces import to include new types:

```typescript
import type { IEpochAdapter, IEscrowAdapter, IPassportAdapter, IAgentWalletAdapter, IGasAdapter, IIdentityAdapter, IValidationAdapter, ICrossChainAdapter, ChainCapabilities } from '../domain-interfaces';
```

- [ ] **Step 2: Add identity() method**

Insert after the `agentWallet()` method (around line 986). This delegates to existing `_identityRegistry`, TBA service, and ERC7579 service:

```typescript
  identity(): IIdentityAdapter {
    const adapter = this;
    const chainId = this._chainId;

    return {
      async register(metadataURI, to) {
        if (!adapter._identityRegistry) throw new Error(`No IdentityRegistry configured on ${chainId}`);
        const hash = await adapter._identityRegistry.register(metadataURI, to);
        return { hash: hash as string, chainId, success: true };
      },

      async query(tokenId) {
        if (!adapter._identityRegistry) throw new Error(`No IdentityRegistry configured on ${chainId}`);
        return adapter._identityRegistry.getAgent(tokenId, chainId);
      },

      async createTBA(tokenContract, tokenId) {
        const { getTBAService } = await import('../../identity/tbaService');
        const tbaService = getTBAService();
        const result = await tbaService.createTBA(chainId, tokenContract, tokenId);
        return { address: result.address, hash: result.txHash };
      },

      async getTBA(tokenContract, tokenId) {
        const { getTBAService } = await import('../../identity/tbaService');
        const tbaService = getTBAService();
        const result = await tbaService.getTBA(chainId, tokenContract, tokenId);
        return result.address;
      },

      async isTBADeployed(address) {
        const { getTBAService } = await import('../../identity/tbaService');
        const tbaService = getTBAService();
        const result = await tbaService.getTBA(chainId, '', '');
        // TBAService doesn't expose isDeployed directly — use ERC6551RegistryClient
        const { getERC6551Client } = await import('../../identity/tba/evm-registry-client');
        const client = getERC6551Client();
        return client.isDeployed(address);
      },

      async installModule(accountAddress, moduleType, moduleAddress, initData) {
        const { getERC7579Service } = await import('../../identity/erc7579Service');
        const svc = getERC7579Service();
        const result = await svc.installModule(chainId, accountAddress, moduleType, moduleAddress, initData);
        return { hash: result.txHash as string, chainId, success: true };
      },

      async uninstallModule(accountAddress, moduleType, moduleAddress) {
        const { getERC7579Service } = await import('../../identity/erc7579Service');
        const svc = getERC7579Service();
        const result = await svc.uninstallModule(chainId, accountAddress, moduleType, moduleAddress);
        return { hash: result.txHash as string, chainId, success: true };
      },

      async configurePolicy(accountAddress, policyHashes) {
        const { getERC7579Service } = await import('../../identity/erc7579Service');
        const svc = getERC7579Service();
        const result = await svc.configurePolicyModule(chainId, accountAddress, policyHashes);
        return { hash: result.txHash as string, chainId, success: true };
      },

      async configurePayout(accountAddress, recipients) {
        const { getERC7579Service } = await import('../../identity/erc7579Service');
        const svc = getERC7579Service();
        const addrs = recipients.map(r => r.address);
        const bps = recipients.map(r => r.bps);
        const result = await svc.configurePayoutModule(chainId, accountAddress, addrs, bps);
        return { hash: result.txHash as string, chainId, success: true };
      },
    };
  }
```

- [ ] **Step 3: Add validation() method**

```typescript
  validation(): IValidationAdapter {
    const adapter = this;
    const chainId = this._chainId;

    return {
      async requestValidation(agentTokenId, receiptHash, metadata) {
        if (!adapter._validationRegistry) throw new Error(`No ValidationRegistry configured on ${chainId}`);
        const hash = await adapter._validationRegistry.requestValidation(agentTokenId, receiptHash, metadata);
        return { hash: hash as string, chainId, success: true };
      },

      async submitResult(agentTokenId, receiptHash, valid) {
        if (!adapter._validationRegistry) throw new Error(`No ValidationRegistry configured on ${chainId}`);
        const hash = await adapter._validationRegistry.submitResult(agentTokenId, receiptHash, valid);
        return { hash: hash as string, chainId, success: true };
      },

      async getValidation(validationId) {
        if (!adapter._validationRegistry) throw new Error(`No ValidationRegistry configured on ${chainId}`);
        return adapter._validationRegistry.getValidation(validationId);
      },

      async getValidationCount(agentTokenId) {
        if (!adapter._validationRegistry) throw new Error(`No ValidationRegistry configured on ${chainId}`);
        return adapter._validationRegistry.getValidationCount(agentTokenId);
      },

      async verifyMMRProof(leafHash, siblings, peaks, leafIndex, expectedRoot) {
        if (!adapter._validationRegistry) throw new Error(`No ValidationRegistry configured on ${chainId}`);
        return adapter._validationRegistry.verifyMMRProof(leafHash, siblings, peaks, leafIndex, expectedRoot);
      },
    };
  }
```

- [ ] **Step 4: Add bridge() method**

```typescript
  bridge(): ICrossChainAdapter {
    const adapter = this;
    const chainId = this._chainId;

    return {
      async bridgeTokens(params) {
        const { getCrossChainBridgeService } = await import('../../identity/crossChainBridgeService');
        const svc = getCrossChainBridgeService();
        const result = await svc.bridgeTokens({
          sourceChainId: chainId,
          destChainId: String(params.destChainId),
          amount: params.amount,
          recipientAddress: params.recipient,
        });
        return { hash: result.txHash, chainId, success: true };
      },

      async getQuote(destChainId, amount) {
        const { getCrossChainBridgeService } = await import('../../identity/crossChainBridgeService');
        const svc = getCrossChainBridgeService();
        return svc.getQuote(chainId, String(destChainId), amount);
      },

      async getBridgeStatus(txHash, sourceChainId) {
        const { getCrossChainBridgeService } = await import('../../identity/crossChainBridgeService');
        const svc = getCrossChainBridgeService();
        const status = await svc.getBridgeStatus(txHash, sourceChainId ?? chainId);
        return { completed: status.status === 'delivered', destTxHash: status.destTxHash };
      },
    };
  }
```

- [ ] **Step 5: Add getConnection() and getSigner() transport accessors**

```typescript
  getConnection(): unknown {
    this.ensureConnected();
    return this._publicClient;
  }

  getSigner(): unknown {
    return this._walletClient ?? null;
  }
```

- [ ] **Step 6: Update capabilities() with new flags**

In the `capabilities()` method (around line 1036), add ONLY the 3 new flags. Keep existing values unchanged:

```typescript
      // ... keep existing flags as-is (epoch, passport, escrow, etc.) ...
      identity: !!this._identityRegistry,
      validation: !!this._validationRegistry,
      bridge: !!this._config?.lucidTokenAddress,
```

- [ ] **Step 7: Run type check**

Run: `cd offchain && npm run type-check 2>&1 | grep "evm/adapter"`
Expected: 0 errors (may have a few from return type mismatches — adjust casts as needed)

- [ ] **Step 8: Run tests**

Run: `cd offchain && npx jest --no-coverage 2>&1 | tail -5`
Expected: All existing tests pass

- [ ] **Step 9: Commit**

```bash
git add offchain/packages/engine/src/chains/evm/adapter.ts
git commit -m "feat(evm): implement identity/validation/bridge sub-adapters + transport accessors on EVMAdapter"
```

---

## Chunk 2: Tier 1 Migration — Redirect Callers

### Task 5: Redirect passportSyncService callers

**Files:**
- Modify: `offchain/packages/contrib/integrations/hf/deprecationDetector.ts` (imports getPassportSyncService)
- Reference: `offchain/packages/engine/src/chains/factory.ts` (BlockchainAdapterFactory)

- [ ] **Step 1: Find all callers**

Run:
```bash
cd offchain && grep -rn "getPassportSyncService\|passportSyncService" packages/ --include="*.ts" \
  | grep -v "chains/" | grep -v "__tests__/" | grep -v "passportSyncService.ts" | grep -v "node_modules"
```

Review each match. Callers that use `syncToChain()` or `updatePassportStatus()` should switch to `adapter.passports().anchorPassport()` or `adapter.passports().updatePassportStatus()`.

Note: Files that only re-export (e.g., `engine/src/index.ts`, `passport/index.ts`) keep the re-export for now — internal services still need it.

- [ ] **Step 2: Migrate each business logic caller**

For each caller found:
1. Replace `import { getPassportSyncService } from '...'` with `import { blockchainAdapterFactory } from '...'`
2. Replace `getPassportSyncService().syncToChain(passport)` with `blockchainAdapterFactory.getAdapter('solana-devnet').passports().anchorPassport(passport.passport_id, contentHash, passport.owner)`
3. Replace `getPassportSyncService().updatePassportStatus(pda, status)` with `adapter.passports().updatePassportStatus(passportId, statusString)`

- [ ] **Step 3: Run type check**

Run: `cd offchain && npm run type-check 2>&1 | grep -v "ox/" | grep -v "node_modules" | grep -c "error"`

- [ ] **Step 4: Run tests**

Run: `cd offchain && npx jest --no-coverage 2>&1 | tail -5`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "refactor: redirect passportSyncService callers through adapter.passports()"
```

---

### Task 6: Redirect paymentGateService callers

**Files:**
- Modify: `offchain/packages/gateway-lite/src/routes/core/subscriptionRoutes.ts`
- Modify: `offchain/packages/gateway-lite/src/api.ts`
- Reference: `offchain/packages/engine/src/chains/factory.ts`

- [ ] **Step 1: Find all callers**

Run:
```bash
cd offchain && grep -rn "paymentGateService\|PaymentGateService\|getPaymentGateService" packages/ --include="*.ts" \
  | grep -v "chains/" | grep -v "__tests__/" | grep -v "paymentGateService.ts" | grep -v "node_modules" | grep -v "finance/index.ts" | grep -v "engine/src/index.ts"
```

- [ ] **Step 2: Migrate each caller**

Replace direct service calls with adapter equivalents:
- `paymentGateService.setPaymentGate(...)` → `adapter.passports().setPaymentGate(...)`
- `paymentGateService.payForAccess(...)` → `adapter.passports().payForAccess(...)`
- `paymentGateService.checkAccess(...)` → `adapter.passports().checkAccess(...)`
- `paymentGateService.withdrawRevenue(...)` → `adapter.passports().withdrawRevenue(...)`

- [ ] **Step 3: Run type check + tests**

Run: `cd offchain && npm run type-check 2>&1 | grep -c "error"` (pre-existing only)
Run: `cd offchain && npx jest --no-coverage 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "refactor: redirect paymentGateService callers through adapter.passports()"
```

---

### Task 7: Remove direct Solana path from anchoringService

**Files:**
- Modify: `offchain/packages/engine/src/receipt/anchoringService.ts:74` (remove `new Connection()`)

- [ ] **Step 1: Identify the direct Solana path**

Read `anchoringService.ts` and find the code path that creates `new Connection(rpcUrl, ...)` directly. This is the bypass path.

- [ ] **Step 2: Refactor to use adapter only**

Replace the direct Connection path with the adapter path. The service already has a multi-chain fallback that uses `blockchainAdapterFactory.getAdapter()` and `adapter.epochs()` — make this the ONLY path.

Remove:
- `import { Connection, ... } from '@solana/web3.js'` (if no longer needed after refactor)
- `new Connection(rpcUrl, ...)` — the direct instantiation
- Any instruction-building code that duplicates `adapter.epochs().commitEpoch()`

Keep:
- The adapter-based path (`adapter.epochs().commitEpoch()`, `adapter.epochs().verifyEpoch()`)

- [ ] **Step 3: Run type check + tests**

Run: `cd offchain && npm run type-check 2>&1 | grep "anchoringService"`
Run: `cd offchain && npx jest --testPathPattern="anchoring" --no-coverage 2>&1 | tail -10`

- [ ] **Step 4: Commit**

```bash
git add offchain/packages/engine/src/receipt/anchoringService.ts
git commit -m "refactor: remove direct Solana path from anchoringService, use adapter.epochs() only"
```

---

## Chunk 3: Tier 2 Migration — Rewire Callers to New Sub-Interfaces

### Task 8: Redirect TBA callers through adapter.identity()

**Files:**
- Modify: `offchain/packages/gateway-lite/src/routes/chain/tbaRoutes.ts`
- Modify: `offchain/packages/engine/src/finance/payoutService.ts`

- [ ] **Step 1: Find all getTBAService callers outside adapter**

Run:
```bash
cd offchain && grep -rn "getTBAService\|tbaService\|TBAService" packages/ --include="*.ts" \
  | grep -v "chains/" | grep -v "__tests__/" | grep -v "tba/" | grep -v "node_modules"
```

- [ ] **Step 2: Migrate callers**

Replace:
- `getTBAService().createTBA(chainId, contract, tokenId)` → `adapter.identity().createTBA(contract, tokenId)`
- `getTBAService().getAccountAddress(chainId, contract, tokenId)` → `adapter.identity().getTBA(contract, tokenId)`
- `getTBAService().isDeployed(address)` → `adapter.identity().isTBADeployed(address)`

- [ ] **Step 3: Run type check + tests**

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "refactor: redirect TBA callers through adapter.identity()"
```

---

### Task 9: Redirect ERC-7579 callers through adapter.identity()

**Files:**
- Modify: `offchain/packages/gateway-lite/src/routes/chain/erc7579Routes.ts`

- [ ] **Step 1: Find all ERC7579Service callers outside adapter**

Run:
```bash
cd offchain && grep -rn "getERC7579Service\|ERC7579Service\|erc7579" packages/ --include="*.ts" \
  | grep -v "chains/" | grep -v "__tests__/" | grep -v "identity/" | grep -v "node_modules"
```

- [ ] **Step 2: Migrate callers**

Replace direct `getERC7579Service()` calls with `adapter.identity()` methods.

- [ ] **Step 3: Run type check + tests, commit**

```bash
git add -u
git commit -m "refactor: redirect ERC-7579 callers through adapter.identity()"
```

---

### Task 10: Redirect validation callers through adapter.validation()

**Files:**
- Modify: `offchain/packages/reputation/syncers/EVM8004Syncer.ts` (if it uses ValidationRegistryClient directly)

- [ ] **Step 1: Find all ValidationRegistryClient callers outside adapter**

Run:
```bash
cd offchain && grep -rn "ValidationRegistryClient\|validationRegistry" packages/ --include="*.ts" \
  | grep -v "chains/" | grep -v "__tests__/" | grep -v "identity/registries/" | grep -v "node_modules"
```

- [ ] **Step 2: Migrate callers to adapter.validation().\***

- [ ] **Step 3: Run type check + tests, commit**

```bash
git add -u
git commit -m "refactor: redirect validation callers through adapter.validation()"
```

---

### Task 11: Redirect bridge callers through adapter.bridge()

**Files:**
- Modify: `offchain/packages/gateway-lite/src/routes/chain/bridgeRoutes.ts`

- [ ] **Step 1: Find all CrossChainBridgeService callers outside adapter**

Run:
```bash
cd offchain && grep -rn "getCrossChainBridgeService\|CrossChainBridgeService\|crossChainBridge" packages/ --include="*.ts" \
  | grep -v "chains/" | grep -v "__tests__/" | grep -v "identity/" | grep -v "node_modules"
```

- [ ] **Step 2: Migrate callers to adapter.bridge().\***

- [ ] **Step 3: Run type check + tests, commit**

```bash
git add -u
git commit -m "refactor: redirect bridge callers through adapter.bridge()"
```

---

### Task 12: Redirect escrowService callers to adapter.escrow()

**Files:**
- Modify: `offchain/packages/engine/src/finance/escrowService.ts` (remove direct `encodeFunctionData` usage)
- Modify: Any callers that use escrowService directly instead of adapter

- [ ] **Step 1: Find callers that bypass adapter.escrow()**

Run:
```bash
cd offchain && grep -rn "escrowService\|encodeFunctionData.*escrow\|EscrowService" packages/ --include="*.ts" \
  | grep -v "chains/" | grep -v "__tests__/" | grep -v "node_modules"
```

- [ ] **Step 2: Migrate callers to use adapter.escrow().createEscrow() etc.**

- [ ] **Step 3: Run type check + tests, commit**

```bash
git add -u
git commit -m "refactor: redirect escrow callers through adapter.escrow()"
```

---

### Task 13: Redirect SolanaWalletProvider to use adapter.agentWallet()

**Files:**
- Modify: `offchain/packages/engine/src/agent/wallet/SolanaWalletProvider.ts:52` (remove `new Connection()`)

- [ ] **Step 1: Refactor getBalance() to use adapter**

Replace line 52 (`const connection = new Connection(rpcUrl);`) with:

```typescript
const { blockchainAdapterFactory } = await import('../../chains/factory');
const adapter = blockchainAdapterFactory.getAdapter('solana-devnet');
const wallet = adapter.agentWallet!();
const result = await wallet.getBalance(passportId);
return result.balance;
```

Remove the direct `@solana/web3.js` imports that are no longer needed.

- [ ] **Step 2: Run type check + tests**

- [ ] **Step 3: Commit**

```bash
git add offchain/packages/engine/src/agent/wallet/SolanaWalletProvider.ts
git commit -m "refactor: redirect SolanaWalletProvider.getBalance() through adapter.agentWallet()"
```

---

## Chunk 4: Tier 3 Migration — Transport Centralization + Verification

### Task 14: Centralize Token2022Provider transport

**Files:**
- Modify: `offchain/packages/engine/src/assets/nft/Token2022Provider.ts:23`

- [ ] **Step 1: Replace `new Connection()` with adapter transport**

In the `getClient()` method (around line 23), replace:
```typescript
const connection = new Connection(rpcUrl, 'confirmed');
```
with:
```typescript
const { blockchainAdapterFactory } = await import('../../chains/factory');
const adapter = blockchainAdapterFactory.getAdapter('solana-devnet');
const connection = adapter.getConnection() as Connection;
```

Remove standalone `Connection` import from `@solana/web3.js` if no longer needed (keep `PublicKey` etc. if still used for type construction).

- [ ] **Step 2: Run type check + tests, commit**

```bash
git add offchain/packages/engine/src/assets/nft/Token2022Provider.ts
git commit -m "refactor: Token2022Provider uses adapter transport instead of own Connection"
```

---

### Task 15: Centralize DirectMintLauncher transport

**Files:**
- Modify: `offchain/packages/engine/src/assets/shares/DirectMintLauncher.ts:25`

- [ ] **Step 1: Replace constructor Connection with adapter transport**

Replace `this.connection = new Connection(rpcUrl, 'confirmed');` with lazy adapter access:

```typescript
private async getConnection(): Promise<Connection> {
  const { blockchainAdapterFactory } = await import('../../chains/factory');
  const adapter = blockchainAdapterFactory.getAdapter('solana-devnet');
  return adapter.getConnection() as Connection;
}
```

Update all `this.connection` usages to `await this.getConnection()`.

Similarly for keypair loading — use `adapter.getSigner() as Keypair` instead of loading directly.

- [ ] **Step 2: Run type check + tests, commit**

```bash
git add offchain/packages/engine/src/assets/shares/DirectMintLauncher.ts
git commit -m "refactor: DirectMintLauncher uses adapter transport instead of own Connection"
```

---

### Task 16: Centralize revenueAirdrop transport

**Files:**
- Modify: `offchain/packages/engine/src/jobs/revenueAirdrop.ts:40`

- [ ] **Step 1: Replace `new Connection()` with adapter transport**

Replace `const connection = new Connection(rpcUrl, 'confirmed');` with:
```typescript
const { blockchainAdapterFactory } = await import('../../chains/factory');
const adapter = blockchainAdapterFactory.getAdapter('solana-devnet');
const connection = adapter.getConnection() as Connection;
```

- [ ] **Step 2: Run type check + tests, commit**

```bash
git add offchain/packages/engine/src/jobs/revenueAirdrop.ts
git commit -m "refactor: revenueAirdrop uses adapter transport instead of own Connection"
```

---

### Task 17: Run verification gate

- [ ] **Step 1: Check for direct Connection creation in business logic**

Run:
```bash
cd offchain && grep -rn "new Connection(" packages/engine/src/ \
  --include="*.ts" \
  | grep -v "chains/" \
  | grep -v "chain/" \
  | grep -v "passport/passportSyncService" \
  | grep -v "finance/paymentGateService" \
  | grep -v "identity/" \
  | grep -v "reputation/providers/" \
  | grep -v "__tests__/"
```

Expected: 0 results

- [ ] **Step 2: Check for direct PublicClient creation in business logic**

Run:
```bash
cd offchain && grep -rn "createPublicClient(" packages/engine/src/ \
  --include="*.ts" \
  | grep -v "chains/" \
  | grep -v "identity/" \
  | grep -v "payment/facilitators/" \
  | grep -v "__tests__/"
```

Expected: 0 results

- [ ] **Step 3: Full type check**

Run: `cd offchain && npm run type-check 2>&1 | grep -v "ox/" | grep -v "node_modules" | grep -c "error"`
Expected: Same count as pre-existing errors (hfBridgeService: 5, ValidationRegistryClient: 1, epochAnchoredOutbox: 1, keypair: 2 = 9 pre-existing)

- [ ] **Step 4: Full test suite**

Run: `cd offchain && npx jest --no-coverage 2>&1 | tail -5`
Expected: 65+ suites pass, 1150+ tests pass, 0 new failures

- [ ] **Step 5: Final commit**

```bash
git add -u
git commit -m "chore: adapter bypass migration complete — verification gate passes"
```
