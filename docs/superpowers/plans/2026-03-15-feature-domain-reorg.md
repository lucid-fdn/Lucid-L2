# Feature-Domain Reorganization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `engine/src/` from technical-layer folders to feature-domain folders. Pure file moves + import updates — no logic changes.

**Architecture:** 5 sequential migrations (Identity → Epoch → Payment → Compute → Shared), each with `git mv` + barrel re-exports + import updates + test verification. Feature-by-feature, not big-bang.

**Tech Stack:** TypeScript, git mv, Jest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-03-15-feature-domain-reorg-design.md`

**Baseline:** 21 test suites (engine + anchoring), 286 tests passing.

**Hard rules:**
- Every step ends with green tests. Never commit broken imports.
- Barrel re-exports are TEMPORARY — marked with `// TRANSITIONAL: remove after all consumers updated` comment.
- `git mv` preserves history. Never copy+delete.
- Delete `_wip/` and `_archive/` in a separate cleanup commit, not mixed with feature moves.
- No logic changes. If you're tempted to refactor something while moving it — don't.

---

## Chunk 1: Identity Migration

### Task 1: Create identity/ directory structure + move passport/

**Files:**
- Move: `offchain/packages/engine/src/passport/*` → `offchain/packages/engine/src/identity/passport/`
- Create: barrel re-export at old `passport/` location

- [ ] **Step 1: Create target directories**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain/packages/engine/src
mkdir -p identity/passport identity/nft/solana identity/wallet identity/shares identity/bridge identity/tba identity/registries identity/erc7579 identity/paymaster identity/stores identity/types
```

- [ ] **Step 2: Move passport files**

```bash
git mv passport/passportManager.ts identity/passport/passportManager.ts
git mv passport/passportService.ts identity/passport/passportService.ts
git mv passport/passportSyncService.ts identity/passport/passportSyncService.ts
git mv passport/nft/solana-token2022.ts identity/nft/solana/solana-token2022.ts
git mv passport/nft/index.ts identity/nft/solana/index.ts
```

- [ ] **Step 3: Create barrel re-export at old passport/ location**

Write `passport/index.ts`:
```typescript
// TRANSITIONAL: remove after all consumers updated
export * from '../identity/passport/passportManager';
export * from '../identity/passport/passportService';
export * from '../identity/passport/passportSyncService';
```

Write `passport/nft/index.ts`:
```typescript
// TRANSITIONAL: remove after all consumers updated
export * from '../../identity/nft/solana';
```

- [ ] **Step 4: Run tests**

Run: `cd offchain && npx jest --no-coverage 2>&1 | tail -5`
Expected: All tests pass (barrel re-exports maintain backward compat).

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(reorg): move passport/ → identity/passport/"
```

---

### Task 2: Move assets/nft/ + assets/shares/ → identity/

**Files:**
- Move: `offchain/packages/engine/src/assets/nft/*` → `offchain/packages/engine/src/identity/nft/`
- Move: `offchain/packages/engine/src/assets/shares/*` → `offchain/packages/engine/src/identity/shares/`

- [ ] **Step 1: Move NFT provider files**

```bash
git mv assets/nft/INFTProvider.ts identity/nft/INFTProvider.ts
git mv assets/nft/Token2022Provider.ts identity/nft/Token2022Provider.ts
git mv assets/nft/MetaplexCoreProvider.ts identity/nft/MetaplexCoreProvider.ts
git mv assets/nft/EVMNFTProvider.ts identity/nft/EVMNFTProvider.ts
git mv assets/nft/MockNFTProvider.ts identity/nft/MockNFTProvider.ts
git mv assets/nft/index.ts identity/nft/index.ts
```

- [ ] **Step 2: Move shares files**

```bash
git mv assets/shares/ITokenLauncher.ts identity/shares/ITokenLauncher.ts
git mv assets/shares/DirectMintLauncher.ts identity/shares/DirectMintLauncher.ts
git mv assets/shares/GenesisLauncher.ts identity/shares/GenesisLauncher.ts
git mv assets/shares/MockTokenLauncher.ts identity/shares/MockTokenLauncher.ts
git mv assets/shares/index.ts identity/shares/index.ts
```

- [ ] **Step 3: Create barrel re-exports at old locations**

Write `assets/nft/index.ts`:
```typescript
// TRANSITIONAL: remove after all consumers updated
export * from '../../identity/nft';
```

Write `assets/shares/index.ts`:
```typescript
// TRANSITIONAL: remove after all consumers updated
export * from '../../identity/shares';
```

- [ ] **Step 4: Update internal imports in moved files**

NFT files may import from `../shares/` or `../../storage/depin/`. Update these relative paths to work from the new location.

- [ ] **Step 5: Run tests + commit**

```bash
cd offchain && npx jest --no-coverage 2>&1 | tail -5
git commit -m "refactor(reorg): move assets/nft/ + assets/shares/ → identity/"
```

---

### Task 3: Move identity/ subdirs + agent/wallet/ + storage stores

**Files:**
- Move: existing `identity/` files → `identity/bridge/`, keep `tba/`, `registries/`, `erc7579/`, `paymaster/`
- Move: `agent/wallet/*` → `identity/wallet/`
- Move: `storage/passportStore.ts` + `storage/identityStore.ts` → `identity/stores/`

- [ ] **Step 1: Move identity bridge files**

```bash
git mv identity/identityBridgeService.ts identity/bridge/identityBridgeService.ts
git mv identity/caip10.ts identity/bridge/caip10.ts
```

Note: `identity/tba/`, `identity/registries/`, `identity/erc7579/`, `identity/paymaster/` are already in subdirs within identity/ — they just need to be moved into the NEW identity/ parent. Check paths carefully since old `identity/` and new `identity/` may overlap.

- [ ] **Step 2: Move wallet providers**

```bash
git mv agent/wallet/IAgentWalletProvider.ts identity/wallet/IAgentWalletProvider.ts
git mv agent/wallet/SolanaWalletProvider.ts identity/wallet/SolanaWalletProvider.ts
git mv agent/wallet/ERC6551WalletProvider.ts identity/wallet/ERC6551WalletProvider.ts
git mv agent/wallet/CrossmintWalletProvider.ts identity/wallet/CrossmintWalletProvider.ts
git mv agent/wallet/MockWalletProvider.ts identity/wallet/MockWalletProvider.ts
git mv agent/wallet/index.ts identity/wallet/index.ts
```

- [ ] **Step 3: Move feature-specific stores**

```bash
git mv storage/passportStore.ts identity/stores/passportStore.ts
git mv storage/identityStore.ts identity/stores/identityStore.ts
```

- [ ] **Step 4: Create barrel re-exports at old locations**

Write `agent/wallet/index.ts`:
```typescript
// TRANSITIONAL: remove after all consumers updated
export * from '../../identity/wallet';
```

Update `storage/` barrel (if exists) to re-export from new locations.

- [ ] **Step 5: Update gateway-lite imports**

Update these files to import from new paths:
- `gateway-lite/src/routes/core/passportRoutes.ts` — passport imports
- `gateway-lite/src/routes/core/shareRoutes.ts` — passport + token launcher imports
- `gateway-lite/src/routes/chain/identityBridgeRoutes.ts` — bridge imports
- `gateway-lite/src/routes/chain/erc7579Routes.ts` — erc7579 imports
- `gateway-lite/src/routes/chain/paymasterRoutes.ts` — paymaster imports

- [ ] **Step 6: Create identity/index.ts barrel**

```typescript
// Identity — passport, NFT, wallet, shares, bridge, TBA, registries
export * from './passport/passportManager';
export * from './passport/passportService';
export * from './passport/passportSyncService';
export * from './nft';
export * from './shares';
export * from './wallet';
export * from './bridge/identityBridgeService';
```

- [ ] **Step 7: Run tests + commit**

```bash
cd offchain && npx jest --no-coverage 2>&1 | tail -5
git commit -m "refactor(reorg): consolidate identity/ — wallet, stores, bridge + gateway-lite imports"
```

---

## Chunk 2: Epoch Split + Payment Merge

### Task 4: Split epoch/ from receipt/

**Files:**
- Move: `receipt/epochService.ts`, `receipt/anchoringService.ts`, `receipt/mmrService.ts` → `epoch/services/`
- Keep: `receipt/receiptService.ts` stays in `receipt/`

- [ ] **Step 1: Create epoch directory**

```bash
mkdir -p epoch/services
```

- [ ] **Step 2: Move epoch files**

```bash
git mv receipt/epochService.ts epoch/services/epochService.ts
git mv receipt/anchoringService.ts epoch/services/anchoringService.ts
git mv receipt/mmrService.ts epoch/services/mmrService.ts
```

- [ ] **Step 3: Update receipt/index.ts**

Remove epoch exports, keep only receipt exports. Add barrel re-exports for epoch files:

```typescript
// TRANSITIONAL: remove after all consumers updated
export { getCurrentEpoch, getEpochByNumber, /* ... */ } from '../epoch/services/epochService';
export { commitEpochRoot, verifyEpochAnchor, /* ... */ } from '../epoch/services/anchoringService';
export { getMMRService } from '../epoch/services/mmrService';
```

- [ ] **Step 4: Create epoch/index.ts**

```typescript
export * from './services/epochService';
export * from './services/anchoringService';
export * from './services/mmrService';
```

- [ ] **Step 5: Update internal imports in moved files**

`anchoringService.ts` imports from `./epochService` — update to `./epochService` (same dir, no change needed). Check for imports to `../crypto/`, `../db/`, etc. — these now need `../../crypto/`, `../../db/`.

- [ ] **Step 6: Update gateway-lite imports**

These files import epoch/receipt functions:
- `gateway-lite/src/routes/core/epochRoutes.ts`
- `gateway-lite/src/routes/core/receiptRoutes.ts`
- `gateway-lite/src/routes/api/systemApiRoutes.ts`
- `gateway-lite/src/routes/api/agentOrchestratorRoutes.ts`
- `gateway-lite/src/routes/agent/agentMirrorRoutes.ts`
- `gateway-lite/src/routes/chain/crossChainRoutes.ts`

- [ ] **Step 7: Run tests + commit**

```bash
cd offchain && npx jest --no-coverage 2>&1 | tail -5
git commit -m "refactor(reorg): split epoch/ from receipt/ — epoch, anchoring, mmr"
```

---

### Task 5: Merge finance/ into payment/

**Files:**
- Move: all `finance/*` → `payment/` subdirectories
- Move: `jobs/revenueAirdrop.ts` → `payment/airdrop/`

- [ ] **Step 1: Create payment subdirectories**

```bash
mkdir -p payment/services payment/escrow payment/settlement payment/stores payment/airdrop
```

- [ ] **Step 2: Move finance files**

```bash
git mv finance/payoutService.ts payment/services/payoutService.ts
git mv finance/escrowService.ts payment/escrow/escrowService.ts
git mv finance/escrowTypes.ts payment/escrow/escrowTypes.ts
git mv finance/disputeService.ts payment/escrow/disputeService.ts
git mv finance/disputeTypes.ts payment/escrow/disputeTypes.ts
git mv finance/paymentGateService.ts payment/stores/paymentGateService.ts
git mv finance/paymentGrant.ts payment/settlement/paymentGrant.ts
git mv finance/paymentEpochService.ts payment/settlement/paymentEpochService.ts
git mv finance/paymentEventService.ts payment/settlement/paymentEventService.ts
```

- [ ] **Step 3: Move existing payment files into services/**

```bash
git mv payment/pricingService.ts payment/services/pricingService.ts
git mv payment/revenueService.ts payment/services/revenueService.ts
git mv payment/splitResolver.ts payment/services/splitResolver.ts
git mv payment/spentProofsStore.ts payment/stores/spentProofsStore.ts
git mv payment/types.ts payment/types/index.ts
```

- [ ] **Step 4: Move revenue airdrop**

```bash
git mv jobs/revenueAirdrop.ts payment/airdrop/revenueAirdrop.ts
```

- [ ] **Step 5: Create barrel re-exports**

Write `finance/index.ts`:
```typescript
// TRANSITIONAL: remove after all consumers updated
export * from '../payment/escrow/escrowService';
export * from '../payment/escrow/disputeService';
export * from '../payment/services/payoutService';
export * from '../payment/stores/paymentGateService';
export * from '../payment/settlement/paymentGrant';
export * from '../payment/settlement/paymentEpochService';
export * from '../payment/settlement/paymentEventService';
```

- [ ] **Step 6: Update gateway-lite imports**

Update these files:
- `gateway-lite/src/routes/chain/escrowRoutes.ts`
- `gateway-lite/src/routes/chain/disputeRoutes.ts`
- `gateway-lite/src/routes/chain/crossChainRoutes.ts`
- `gateway-lite/src/routes/core/paymentConfigRoutes.ts`
- `gateway-lite/src/routes/core/payoutRoutes.ts`
- `gateway-lite/src/routes/core/assetPaymentRoutes.ts`

- [ ] **Step 7: Update payment/index.ts**

```typescript
// Payment — x402, pricing, splits, escrow, facilitators, airdrop
export * from './services/pricingService';
export * from './services/revenueService';
export * from './services/splitResolver';
export * from './services/payoutService';
export * from './facilitators';
export * from './escrow/escrowService';
export * from './escrow/disputeService';
export * from './stores/spentProofsStore';
export * from './stores/paymentGateService';
export * from './settlement/paymentGrant';
export * from './settlement/paymentEpochService';
export * from './settlement/paymentEventService';
export * from './airdrop/revenueAirdrop';
```

- [ ] **Step 8: Run tests + commit**

```bash
cd offchain && npx jest --no-coverage 2>&1 | tail -5
git commit -m "refactor(reorg): merge finance/ into payment/ + move revenueAirdrop"
```

---

## Chunk 3: Compute + Shared + Cleanup

### Task 6: Consolidate compute/

**Files:**
- Move: `deploy/*` → `compute/deploy/`
- Move: `runtime/*` → `compute/runtime/`
- Move: `agent/agentDeploymentService.ts`, `agent/agentDescriptor.ts` → `compute/agent/`

- [ ] **Step 1: Create compute directories + move**

```bash
mkdir -p compute/deploy compute/runtime compute/agent
git mv deploy/*.ts compute/deploy/
git mv runtime/*.ts compute/runtime/
git mv agent/agentDeploymentService.ts compute/agent/agentDeploymentService.ts
git mv agent/agentDescriptor.ts compute/agent/agentDescriptor.ts
```

- [ ] **Step 2: Move remaining agent files (a2a, revenue)**

```bash
mkdir -p compute/agent/a2a
git mv agent/a2a/*.ts compute/agent/a2a/
git mv agent/agentRevenueService.ts compute/agent/agentRevenueService.ts
```

- [ ] **Step 3: Create barrel re-exports**

Write `deploy/index.ts`, `runtime/index.ts`, `agent/index.ts` as transitional re-exports.

- [ ] **Step 4: Update internal imports in moved files**

`agentDeploymentService.ts` imports from `../deploy/`, `../runtime/`, `../storage/depin/`, etc. Update all relative paths.

- [ ] **Step 5: Run tests + commit**

```bash
cd offchain && npx jest --no-coverage 2>&1 | tail -5
git commit -m "refactor(reorg): consolidate compute/ — deploy, runtime, agent"
```

---

### Task 7: Move shared infrastructure

**Files:**
- Move: `crypto/` → `shared/crypto/`
- Move: `db/` → `shared/db/`
- Move: `config/` → `shared/config/`
- Move: `lib/` → `shared/lib/`
- Move: `chains/` → `shared/chains/`
- Move: `storage/depin/` → `shared/depin/`
- Move: `types/` → `shared/types/`
- Move: remaining `jobs/` → `shared/jobs/`
- Move: `storage/searchQueryBuilder.ts` → `shared/storage/`

- [ ] **Step 1: Create shared directories**

```bash
mkdir -p shared/crypto shared/db shared/config shared/lib shared/chains shared/depin shared/types shared/jobs shared/storage
```

- [ ] **Step 2: Move all shared dirs**

```bash
git mv crypto/*.ts shared/crypto/
git mv db/*.ts shared/db/
git mv config/*.ts shared/config/
git mv lib/*.ts shared/lib/
git mv chains/ shared/chains/  # move entire directory
git mv storage/depin/ shared/depin/  # move entire directory
git mv types/*.ts shared/types/
git mv storage/searchQueryBuilder.ts shared/storage/searchQueryBuilder.ts
```

- [ ] **Step 3: Move remaining jobs**

```bash
git mv jobs/anchoringJob.ts shared/jobs/anchoringJob.ts
git mv jobs/receiptConsumer.ts shared/jobs/receiptConsumer.ts
git mv jobs/agentMirrorConsumer.ts shared/jobs/agentMirrorConsumer.ts
git mv jobs/mmrCheckpoint.ts shared/jobs/mmrCheckpoint.ts
git mv jobs/epochArchiver.ts shared/jobs/epochArchiver.ts
git mv jobs/agentHealthMonitor.ts shared/jobs/agentHealthMonitor.ts
git mv jobs/epochAnchoredOutbox.ts shared/jobs/epochAnchoredOutbox.ts
```

- [ ] **Step 4: Create barrel re-exports at ALL old locations**

This is the largest step — every old dir needs a re-export pointing to `shared/`. Write barrels for: `crypto/index.ts`, `db/index.ts`, `config/index.ts`, `lib/index.ts`, `chains/index.ts`, `storage/depin/index.ts`, `types/index.ts`, `jobs/index.ts`.

- [ ] **Step 5: Update ALL internal imports**

Every file in `identity/`, `epoch/`, `payment/`, `compute/`, `memory/`, `anchoring/`, and `receipt/` that imports from `../crypto/`, `../db/`, `../config/`, `../chains/`, `../storage/depin/`, etc. must be updated to `../shared/crypto/`, `../shared/db/`, etc.

This is the most import-heavy step. Use find-and-replace across the codebase.

- [ ] **Step 6: Run tests**

```bash
cd offchain && npx jest --no-coverage 2>&1 | tail -5
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git commit -m "refactor(reorg): move infrastructure to shared/ — crypto, db, config, chains, depin, jobs"
```

---

### Task 8: Cleanup — delete archive, remove transitional barrels, update CLAUDE.md

- [ ] **Step 1: Delete dead code**

```bash
rm -rf _archive/ _wip/
git add -A
git commit -m "chore: delete _archive/ and _wip/ dead code"
```

- [ ] **Step 2: Remove transitional barrel re-exports**

Delete all files marked `// TRANSITIONAL` in old locations. Run tests after each removal to catch any remaining consumers.

```bash
# Remove old passport/, assets/, agent/wallet/, finance/, deploy/, runtime/, etc.
# that now only contain barrel re-exports
git rm passport/index.ts passport/nft/index.ts
git rm assets/nft/index.ts assets/shares/index.ts
git rm agent/wallet/index.ts agent/index.ts
git rm finance/index.ts
git rm deploy/index.ts runtime/index.ts
git rm crypto/index.ts db/index.ts config/index.ts lib/index.ts
# etc. — remove all transitional barrels
```

Run tests between each batch to catch stragglers.

- [ ] **Step 3: Remove empty directories**

```bash
find . -type d -empty -delete
```

- [ ] **Step 4: Run final test suite**

```bash
cd offchain && npx jest --no-coverage
cd offchain && npm run type-check 2>&1 | grep -v 'node_modules/ox'
```

Expected: All tests pass, no new type errors.

- [ ] **Step 5: Update CLAUDE.md**

Replace the "Offchain Codebase Structure" section with the new feature-domain layout:

```
engine/src/
  identity/     # Passport, NFT, wallet, TBA, bridge, shares, registries
  memory/       # 6 memory types, vector search, compaction, archive, projection
  epoch/        # Epoch lifecycle, anchoring, MMR
  receipt/      # Receipt creation, signing, verification
  payment/      # x402, pricing, splits, escrow, facilitators, airdrop
  compute/      # Deploy (6 targets), runtime adapters, agent descriptors
  anchoring/    # Unified DePIN interface — dispatcher, registry, verifier
  reputation/   # Provider + syncer interfaces, on-chain + off-chain
  shared/       # crypto, db, config, chains, depin, jobs, logger
```

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(reorg): remove transitional barrels + update CLAUDE.md

Feature-domain reorganization complete. 7 features + anchoring + shared.
All tests passing, no logic changes."
```

---

## Verification Checklist

After all 8 tasks:

- [ ] `cd offchain && npx jest --no-coverage` — all suites pass
- [ ] `cd offchain && npm run type-check 2>&1 | grep -v 'node_modules/ox'` — no new errors
- [ ] No old directories remain (passport/, assets/, agent/, finance/, deploy/, runtime/ etc.)
- [ ] Every feature accessible in 1 hop from `engine/src/`
- [ ] `_wip/` and `_archive/` deleted
- [ ] CLAUDE.md reflects new structure
- [ ] No transitional barrel re-exports remain
