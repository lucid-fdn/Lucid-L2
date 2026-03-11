# Adapter Bypass Migration — Design Spec

**Date:** 2026-03-11
**Status:** Approved
**Goal:** Eliminate direct chain calls from business logic. Make `IBlockchainAdapter` the single entry point for all chain interactions before first production ship.

## Problem

13 services make direct `@solana/web3.js` or `viem` calls instead of going through the adapter layer. This means:

- Adding a third chain requires touching every bypassing service
- No centralized retry/circuit-breaker possible
- Duplicated connection and keypair management
- Business logic is coupled to chain internals

## Architecture (Post-Migration)

```
Business Logic (chain-agnostic)
        |
        v
 IBlockchainAdapter  <-- single entry point
   |-- epochs()       -> IEpochAdapter
   |-- escrow()       -> IEscrowAdapter
   |-- passports()    -> IPassportAdapter
   |-- agentWallet()  -> IAgentWalletAdapter
   |-- gas()          -> IGasAdapter
   |-- identity()     -> IIdentityAdapter       <-- NEW
   |-- validation()   -> IValidationAdapter      <-- NEW
   |-- bridge()       -> ICrossChainAdapter      <-- NEW
        |
        v
 SolanaAdapter / EVMAdapter
   (delegates to internal services:
    passportSyncService, paymentGateService, etc.)
        |
        v
 Chain RPCs (@solana/web3.js, viem)
```

Domain interfaces (`INFTProvider`, `ITokenLauncher`, `IReputationProvider`, `IPaymentFacilitator`) remain separate abstractions. Their chain-specific implementations are strategy objects, not adapter bypasses.

## Deprecation: Top-Level Identity Methods

`IBlockchainAdapter` currently has top-level `registerAgent()` and `queryAgent()` methods. These overlap with the new `identity().register()` and `identity().query()`. Migration plan:

1. Mark `registerAgent()` and `queryAgent()` as `@deprecated` with pointer to `identity()` equivalents
2. Keep them working during migration (they delegate to the same underlying code)
3. Remove in a follow-up cleanup PR after all callers have migrated

## 3 New Sub-Interfaces

### IIdentityAdapter

Covers ERC-721 identity registry, ERC-6551 TBA, and ERC-7579 module management. These are all identity-layer concerns on EVM.

```typescript
export interface IIdentityAdapter {
  /** Register an agent identity (ERC-721 mint). EVMAdapter wraps the raw tx hash with receipt confirmation. */
  register(metadataURI: string, to: string): Promise<TxReceipt>;

  /** Query agent by token ID */
  query(tokenId: string): Promise<AgentIdentity | null>;

  /**
   * Create a Token Bound Account for an agent.
   * chainId and salt are derived from adapter config — callers don't need to supply them.
   */
  createTBA(tokenContract: string, tokenId: string): Promise<{ address: string; hash: string }>;

  /** Get deterministic TBA address */
  getTBA(tokenContract: string, tokenId: string): Promise<string>;

  /** Check if TBA is deployed */
  isTBADeployed(address: string): Promise<boolean>;

  /**
   * Install an ERC-7579 module on an account.
   * chainId is sourced from adapter state — callers don't supply it.
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
   * Known limitation: current ERC7579Service only applies policyHashes[0] — array support
   * to be added when PolicyModule contract is upgraded.
   */
  configurePolicy(accountAddress: string, policyHashes: string[]): Promise<TxReceipt>;

  /** Configure payout module splits */
  configurePayout(
    accountAddress: string,
    recipients: Array<{ address: string; bps: number }>,
  ): Promise<TxReceipt>;
}
```

SolanaAdapter: throws `ChainFeatureUnavailable` (EVM-only concepts).
EVMAdapter: delegates to existing `IdentityRegistryClient`, `ERC6551RegistryClient`, `erc7579Service`. For methods that return raw `Hash`, the adapter wraps with receipt confirmation (same pattern as existing `registerAgent()` implementation).

### IValidationAdapter

Covers on-chain validation requests and LucidValidator proof verification.

```typescript
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

SolanaAdapter: throws `ChainFeatureUnavailable` (no on-chain validation contract on Solana — uses off-chain `lucid_reputation` program via `IReputationProvider`).
EVMAdapter: delegates to existing `ValidationRegistryClient`. For methods returning raw `Hash`, adapter wraps with receipt confirmation.

### ICrossChainAdapter

Covers LayerZero OFT token bridging.

```typescript
export interface ICrossChainAdapter {
  /** Bridge tokens to another chain */
  bridgeTokens(params: {
    destChainId: number;
    recipient: string;
    amount: string;
    minAmount: string;
  }): Promise<TxReceipt>;

  /** Get a bridge quote (nativeFee + lzTokenFee from LayerZero) */
  getQuote(destChainId: number, amount: string): Promise<BridgeQuote>;

  /**
   * Get bridge transaction status.
   * sourceChainId defaults to the adapter's own chainId.
   */
  getBridgeStatus(txHash: string, sourceChainId?: string): Promise<{ completed: boolean; destTxHash?: string }>;
}
```

SolanaAdapter: throws `ChainFeatureUnavailable` (LayerZero OFT is EVM-only for now).
EVMAdapter: delegates to existing `crossChainBridgeService`. `getQuote()` returns the existing `BridgeQuote` type from the service.

## New ChainCapabilities Flags

```typescript
export interface ChainCapabilities {
  epoch: boolean;
  passport: boolean;
  escrow: boolean;
  verifyAnchor: boolean;
  sessionKeys: boolean;
  zkml: boolean;
  paymaster: boolean;
  identity: boolean;    // NEW — ERC-721 + TBA + ERC-7579
  validation: boolean;  // NEW — on-chain validation registry
  bridge: boolean;      // NEW — cross-chain token bridging
}
```

SolanaAdapter: `identity: false`, `validation: false`, `bridge: false`.
EVMAdapter: `identity: true`, `validation: true`, `bridge: !!config.oftContract`.

## Service Classification

### Tier 1: Redirect Callers (3 services)

These services are already the adapter's internal implementation. Migration = make all callers use the adapter instead of importing the service directly.

| Service | Adapter method it backs | Migration |
|---------|------------------------|-----------|
| passportSyncService | `adapter.passports().anchorPassport()`, `.updatePassportStatus()` | Find all `import { getPassportSyncService }` in business logic, replace with adapter calls |
| paymentGateService | `adapter.passports().setPaymentGate()`, `.payForAccess()`, `.checkAccess()`, `.withdrawRevenue()` | Find all `import { paymentGateService }` in business logic, replace with adapter calls |
| anchoringService | `adapter.epochs().commitEpoch()` | Remove the direct Solana path, keep only the adapter path it already has |

### Tier 2: New Sub-Interfaces (7 services)

These services need new adapter methods. Migration = define interface, implement on EVMAdapter (delegating to existing service), stub on SolanaAdapter, redirect callers.

| Service | New interface method | Implementation |
|---------|---------------------|----------------|
| evm-identity (IdentityRegistryClient) | `identity().register()`, `.query()` | EVMAdapter delegates to IdentityRegistryClient |
| evm-registry-client (ERC6551RegistryClient) | `identity().createTBA()`, `.getTBA()`, `.isTBADeployed()` | EVMAdapter delegates to ERC6551RegistryClient |
| erc7579Service | `identity().installModule()`, `.configurePolicy()`, `.configurePayout()` | EVMAdapter delegates to erc7579Service |
| evm-validation (ValidationRegistryClient) | `validation().*` | EVMAdapter delegates to ValidationRegistryClient |
| crossChainBridgeService | `bridge().*` | EVMAdapter delegates to crossChainBridgeService |
| escrowService | Already exists: `adapter.escrow()` | Redirect callers that encode calldata manually to use adapter.escrow().createEscrow() etc. |
| SolanaWalletProvider | Already exists: `adapter.agentWallet()` | Redirect getBalance() to adapter.agentWallet().getBalance() |

### Tier 3: Transport Centralization (3 services)

These services build chain-specific instructions (which is correct) but manage their own Connection/keypair (which is duplicated). Migration = use adapter's transport.

| Service | Change |
|---------|--------|
| Token2022Provider | Stop creating own `new Connection()` and loading own keypair. Get from adapter via `getConnection()` / `getSigner()`. |
| DirectMintLauncher | Same |
| revenueAirdrop | Same |

Requires adding transport accessor methods to adapter interface:

```typescript
// On IBlockchainAdapter

/**
 * Access the underlying chain connection (for chain-specific domain providers).
 * Solana: returns Connection. EVM: returns PublicClient.
 * Callers must cast to the expected chain type.
 * WARNING: Only for use by chain-specific domain providers (INFTProvider, ITokenLauncher).
 * Business logic should use typed sub-interface methods instead.
 */
getConnection(): unknown;

/**
 * Access the signer/keypair (for chain-specific domain providers).
 * Solana: returns Keypair. EVM: returns WalletClient.
 * WARNING: Same usage restriction as getConnection().
 */
getSigner(): unknown;
```

### Not Changed (correctly abstracted)

| Service | Why unchanged |
|---------|---------------|
| MetaplexCoreProvider | UMI SDK manages its own connection ecosystem. Wrapping adds complexity for zero benefit. |
| LucidOnChainProvider | Anchor Program manages its own provider. Same reasoning. |
| evm-reputation | Correctly implements `IReputationProvider` interface. |
| EVMNFTProvider | Already delegates to adapter. |
| DirectFacilitator | Correctly implements `IPaymentFacilitator` interface. |

Multi-chain for these is solved by their own factory + interface pattern (e.g., `NFT_PROVIDER=token2022` for Solana, `NFT_PROVIDER=evm-erc721` for EVM). Adding a new chain = implement the interface + register in factory.

### Intentionally Excluded from Verification Gate

These files import `@solana/web3.js` or `viem` for type-only usage (e.g., `PublicKey` for PDA derivation in config) or are adapter-internal implementations:

- `config/config.ts` — uses `PublicKey` for mint addresses (type-level, no RPC calls)
- `passport/passportSyncService.ts` — adapter internal implementation (SolanaAdapter delegates to it)
- `finance/paymentGateService.ts` — adapter internal implementation (SolanaAdapter delegates to it)
- `receipt/anchoringService.ts` — adapter internal implementation (after Tier 1 migration, direct path removed)
- `passport/nft/solana-token2022.ts` — low-level NFT client (Token2022Provider delegates to it)
- `reputation/providers/LucidOnChainProvider.ts` — Anchor Program, own provider management
- `identity/registries/*` — adapter internal implementations (EVMAdapter delegates to them)
- `identity/tba/*` — adapter internal implementation (EVMAdapter delegates to it)
- `identity/erc7579Service.ts` — adapter internal implementation
- `identity/crossChainBridgeService.ts` — adapter internal implementation

## Execution Order

1. Define 3 new sub-interfaces + transport accessors in `domain-interfaces.ts`
2. Update `adapter-interface.ts` with new optional methods + deprecate `registerAgent()`/`queryAgent()`
3. Implement on EVMAdapter (delegate to existing services)
4. Stub on SolanaAdapter (`ChainFeatureUnavailable` for EVM-only)
5. Update `ChainCapabilities` with `identity`, `validation`, `bridge` flags
6. Tier 1 migration (redirect callers — 3 services, ~10 files)
7. Tier 2 migration (rewire callers to new sub-interfaces — 7 services, ~15 files)
8. Tier 3 migration (transport centralization — 3 services, ~3 files)
9. Verification gate

## Verification Gate

After migration, check that no business logic file creates its own chain connections:

```bash
# Should return zero results (no direct Connection/PublicClient creation in business logic)
grep -rn "new Connection(" packages/engine/src/ \
  --include="*.ts" \
  | grep -v "chains/" \
  | grep -v "chain/" \
  | grep -v "passport/passportSyncService" \
  | grep -v "finance/paymentGateService" \
  | grep -v "identity/" \
  | grep -v "reputation/providers/" \
  | grep -v "__tests__/"

grep -rn "createPublicClient(" packages/engine/src/ \
  --include="*.ts" \
  | grep -v "chains/" \
  | grep -v "identity/" \
  | grep -v "payment/facilitators/" \
  | grep -v "__tests__/"
```

This checks for connection *creation* (the actual problem) rather than library imports (which may be type-only).

## Rollback Strategy

Migration is done in 3 per-tier PRs. Each PR compiles independently and passes all tests. If a tier causes issues:

- **Tier 1 PR**: Revert — callers go back to importing services directly
- **Tier 2 PR**: Revert — callers go back to using service clients directly. New interfaces remain (no harm, unused)
- **Tier 3 PR**: Revert — services go back to creating own connections

No feature flag needed — the adapter interface is additive (new optional methods). Reverting a caller PR doesn't break the interface.

## Success Criteria

- `IBlockchainAdapter` is the single entry point for chain interactions from business logic
- 3 new sub-interfaces defined and implemented
- `registerAgent()`/`queryAgent()` deprecated with `@deprecated` annotation
- 13 services migrated (no direct chain connection creation in business logic)
- All existing tests pass
- Type check passes (zero new errors)
- Adding a new chain requires only implementing `IBlockchainAdapter` + registering in factory
