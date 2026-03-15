# Feature-Domain Codebase Reorganization

**Date:** 2026-03-15
**Status:** Design
**Author:** Kevin Wayne + Claude

## Core Principle

> Organize by feature domain, not technical layer. Each feature owns its services, stores, types, and tests. Shared infrastructure stays separate. Engine/gateway-lite boundary preserved.

## Context

The `engine/src/` package is organized by technical concern (crypto, storage, chains, passport, identity, assets, agent, payment, finance, receipt). The 7 product features are scattered across multiple directories — Identity spans 6 dirs, Payment spans 4, Epoch and Receipt share one folder.

`memory/` and `anchoring/` are already feature-first and serve as the model for the reorganization.

### What is NOT in scope

- Gateway-lite reorganization — routes stay in `gateway-lite/src/routes/`
- Logic changes — pure file moves + import updates
- Inference move — stays in gateway-lite for now
- New features or refactoring of internals

---

## Section 1: Target Structure

```
engine/src/
  identity/                 # Passport, NFT, wallet, TBA, bridge, shares
    passport/               # passportManager, passportService, passportSyncService
    nft/                    # INFTProvider, Token2022, MetaplexCore, EVM, Mock, factory
      solana/               # SolanaPassportClient (Token-2022 specific)
    wallet/                 # IAgentWalletProvider, Solana, ERC6551, Crossmint
    shares/                 # ITokenLauncher, DirectMint, Genesis, Mock
    bridge/                 # identityBridgeService, caip10, crossChainBridge
    tba/                    # tbaService, ABIs
    registries/             # ERC-8004 Identity/Validation/Reputation clients
    erc7579/                # module clients
    paymaster/              # paymaster client
    stores/                 # passportStore, identityStore (feature-specific persistence)
    types/                  # passport types, wallet types
    __tests__/              # identity tests
    index.ts                # public API

  memory/                   # Already clean — NO CHANGES
    ...

  epoch/                    # Epoch lifecycle, anchoring, MMR
    services/               # epochService, anchoringService, mmrService
    types/                  # epoch types
    __tests__/              # epoch tests
    index.ts

  receipt/                  # Receipt creation, signing, verification ONLY
    services/               # receiptService
    types/                  # receipt types
    __tests__/              # receipt tests
    index.ts

  payment/                  # x402, pricing, splits, escrow, facilitators, airdrop, disputes
    facilitators/           # DirectFacilitator, CoinbaseFacilitator, PayAI
    services/               # pricingService, revenueService, splitResolver, payoutService
    escrow/                 # escrowService, disputeService
    settlement/             # paymentEpochService, paymentEventService, paymentGrant
    stores/                 # spentProofsStore, paymentGateService
    airdrop/                # revenueAirdrop
    types/                  # payment types
    __tests__/              # payment tests
    index.ts

  compute/                  # Deploy, runtime, agent descriptors
    deploy/                 # 6 deployers, ImageBuilder, factory
    runtime/                # OpenClawAdapter, runtime adapters
    agent/                  # agentDeploymentService, agentDescriptor
    types/                  # compute types, deployment types
    __tests__/              # compute tests
    index.ts

  anchoring/                # Already clean — NO CHANGES
    ...

  shared/                   # Cross-cutting infrastructure
    crypto/                 # hash, signing, canonicalJson, merkle, mmr, schemaValidator
    db/                     # pool singleton
    config/                 # config.ts, paths.ts
    lib/                    # logger
    chains/                 # BlockchainAdapterFactory, EVMAdapter, SolanaAdapter
    depin/                  # IDepinStorage, Arweave, Lighthouse, Mock (moved from storage/depin/)
    types/                  # Anchor IDL types ONLY (fluidCompute, lucid_passports)
    jobs/                   # anchoringJob, receiptConsumer, agentMirrorConsumer, mmrCheckpoint, epochArchiver, agentHealthMonitor
```

### Key decisions

- **Feature-specific stores inside features** — `passportStore` goes in `identity/stores/`, not `shared/storage/`. Only truly generic infrastructure goes in `shared/`.
- **`shared/types/` is minimal** — only Anchor IDL types that don't belong to any feature. Feature types live in their feature's `types/` folder.
- **`compute/agent/` is deployment-scoped** — agent descriptors and deployment service. NOT a dumping ground for all agent code. Identity concerns (wallet) stay in `identity/`.
- **`inference/` not created yet** — stays in gateway-lite. Move when business logic needs to live in engine.
- **`shared/jobs/`** — background workers that span features stay here (anchoring job, receipt consumer, etc.). Feature-specific jobs (like `revenueAirdrop`) move to their feature (`payment/airdrop/`).

---

## Section 2: Migration Map

### Step 1: Identity (highest value — 6 dirs → 1)

| Current | Target |
|---------|--------|
| `passport/passportManager.ts` | `identity/passport/passportManager.ts` |
| `passport/passportService.ts` | `identity/passport/passportService.ts` |
| `passport/passportSyncService.ts` | `identity/passport/passportSyncService.ts` |
| `passport/nft/` | `identity/nft/solana/` |
| `assets/nft/INFTProvider.ts` | `identity/nft/INFTProvider.ts` |
| `assets/nft/Token2022Provider.ts` | `identity/nft/Token2022Provider.ts` |
| `assets/nft/MetaplexCoreProvider.ts` | `identity/nft/MetaplexCoreProvider.ts` |
| `assets/nft/EVMNFTProvider.ts` | `identity/nft/EVMNFTProvider.ts` |
| `assets/nft/MockNFTProvider.ts` | `identity/nft/MockNFTProvider.ts` |
| `assets/nft/index.ts` | `identity/nft/index.ts` |
| `assets/shares/` | `identity/shares/` |
| `identity/identityBridgeService.ts` | `identity/bridge/identityBridgeService.ts` |
| `identity/caip10.ts` | `identity/bridge/caip10.ts` |
| `identity/crossChainBridge.ts` | `identity/bridge/crossChainBridge.ts` |
| `identity/tba/` | `identity/tba/` (stays, just moves up one level) |
| `identity/registries/` | `identity/registries/` (stays) |
| `identity/erc7579/` | `identity/erc7579/` (stays) |
| `identity/paymaster/` | `identity/paymaster/` (stays) |
| `agent/wallet/` | `identity/wallet/` |
| `storage/passportStore.ts` | `identity/stores/passportStore.ts` |
| `storage/identityStore.ts` | `identity/stores/identityStore.ts` |

Barrel re-export at old locations until all consumers updated.

### Step 2: Epoch (split from receipt/)

| Current | Target |
|---------|--------|
| `receipt/epochService.ts` | `epoch/services/epochService.ts` |
| `receipt/anchoringService.ts` | `epoch/services/anchoringService.ts` |
| `receipt/mmrService.ts` | `epoch/services/mmrService.ts` |

`receipt/` keeps only `receiptService.ts` and receipt-specific types.

### Step 3: Payment (merge finance/ + payment/)

| Current | Target |
|---------|--------|
| `payment/pricingService.ts` | `payment/services/pricingService.ts` |
| `payment/revenueService.ts` | `payment/services/revenueService.ts` |
| `payment/splitResolver.ts` | `payment/services/splitResolver.ts` |
| `payment/spentProofsStore.ts` | `payment/stores/spentProofsStore.ts` |
| `payment/facilitators/` | `payment/facilitators/` |
| `finance/payoutService.ts` | `payment/services/payoutService.ts` |
| `finance/escrowService.ts` | `payment/escrow/escrowService.ts` |
| `finance/disputeService.ts` | `payment/escrow/disputeService.ts` |
| `finance/paymentGateService.ts` | `payment/stores/paymentGateService.ts` |
| `finance/paymentGrant.ts` | `payment/settlement/paymentGrant.ts` |
| `finance/paymentEpochService.ts` | `payment/settlement/paymentEpochService.ts` |
| `finance/paymentEventService.ts` | `payment/settlement/paymentEventService.ts` |
| `jobs/revenueAirdrop.ts` | `payment/airdrop/revenueAirdrop.ts` |

### Step 4: Compute (consolidate deploy/ + runtime/ + agent/)

| Current | Target |
|---------|--------|
| `deploy/` | `compute/deploy/` |
| `runtime/` | `compute/runtime/` |
| `agent/agentDeploymentService.ts` | `compute/agent/agentDeploymentService.ts` |
| `agent/agentDescriptor.ts` | `compute/agent/agentDescriptor.ts` |

Note: `agent/wallet/` already moved to `identity/wallet/` in Step 1.

### Step 5: Shared (move infra dirs)

| Current | Target |
|---------|--------|
| `crypto/` | `shared/crypto/` |
| `db/` | `shared/db/` |
| `config/` | `shared/config/` |
| `lib/` | `shared/lib/` |
| `chains/` | `shared/chains/` |
| `storage/depin/` | `shared/depin/` |
| `types/` | `shared/types/` |
| `jobs/` (remaining) | `shared/jobs/` |
| `storage/searchQueryBuilder.ts` | `shared/storage/searchQueryBuilder.ts` |

---

## Section 3: Migration Protocol

For each step:

1. **Create target directories** — `mkdir -p` new folder structure
2. **`git mv` files** — preserves git history
3. **Add barrel re-exports at old locations** — temporary, prevents breakage:
   ```typescript
   // old: engine/src/passport/passportManager.ts
   export * from '../identity/passport/passportManager';
   ```
4. **Update direct imports in gateway-lite** — routes import from new paths
5. **Run tests** — must be green before commit
6. **Commit** — one commit per feature move
7. **Remove barrel re-exports** — separate commit after all consumers updated
8. **Remove empty old directories** — cleanup

### Import update strategy

Most imports come from barrel `index.ts` files. After moving, update the barrel to re-export from new paths. Consumers don't need to change immediately.

For direct imports (gateway-lite routes → engine files), update the import path in the same commit as the move.

---

## Section 4: What Stays Untouched

| Module | Reason |
|--------|--------|
| `memory/` | Already feature-first |
| `anchoring/` | Already feature-first |
| `gateway-lite/src/routes/` | Thin HTTP handlers, correct location |
| `gateway-lite/src/middleware/` | Cross-cutting, correct location |
| `gateway-lite/src/compute/` | Stays for now (matching engine logic can move later) |
| `gateway-lite/src/inference/` | Stays (not moving to engine yet) |
| `gateway-lite/src/reputation/` | Stays |
| `_wip/` and `_archive/` | Delete during cleanup |

---

## Section 5: Internal Structure Guideline

Each feature folder should follow this consistent pattern (not mandatory, but preferred):

```
feature/
  services/       # business logic (service classes/functions)
  stores/         # persistence (if feature-specific, NOT in shared/)
  types/          # interfaces, type definitions
  __tests__/      # colocated tests
  index.ts        # public API (barrel export)
```

Sub-domains within a feature use their own subfolder:
```
payment/
  facilitators/   # sub-domain
  escrow/         # sub-domain
  settlement/     # sub-domain
  services/       # top-level payment services
  stores/         # payment-specific persistence
```

---

## Section 6: Verification

After each step:
- `cd offchain && npx jest --no-coverage` — all tests pass
- `cd offchain && npm run type-check 2>&1 | grep -v 'node_modules/ox'` — no new errors
- No runtime breakage — barrel re-exports maintain backward compat

After all 5 steps:
- No old directories remain (except temporary barrels)
- Every feature accessible in 1 hop from `engine/src/`
- `_wip/` and `_archive/` deleted
- CLAUDE.md updated with new structure
