# Codebase Reorganization — Separate Non-Settlement Features

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move non-settlement integrations (n8n, HF, OAuth, Hyperliquid, Privy) into a `contrib/` folder within gateway-lite, organize the flat 36-route directory into grouped subdirectories, and update all imports — without breaking any functionality.

**Architecture:** Gateway-lite IS the settlement HTTP server. Non-settlement features (workflow engines, DeFi trading, OAuth credential management, external auth providers) move to `contrib/` but stay in the repo. Routes get grouped by domain (core, agent, chain, system, contrib). The barrel export (`routes/index.ts`) and server entry (`index.ts`) get updated to use new paths.

**Tech Stack:** TypeScript, Express, relative import path updates, no new dependencies.

---

## File Structure

### Current (flat, mixed concerns)
```
gateway-lite/src/
├── integrations/          ← Mixed: settlement (zkml, mcp) + non-settlement (n8n, hf, oauth, hyperliquid)
├── routes/                ← 36 flat files, no grouping
├── protocols/adapters/    ← Mixed: settlement (solana) + non-settlement (privy, hyperliquid)
├── providers/             ← LLM providers (non-settlement)
├── inference/             ← Execution gateway (settlement — generates receipts)
├── agent/                 ← Agent orchestrator (uses flowspec — mixed)
├── compute/               ← Matching engine (settlement)
├── reputation/            ← Algorithms (settlement)
├── middleware/             ← Auth + payment (settlement)
└── services/              ← Legacy (rewardService, sessionSigner)
```

### Target (grouped by concern)
```
gateway-lite/src/
├── routes/
│   ├── core/              ← receipt, epoch, passport, payout, share, matching, inference, computeNode, subscription, lucidLayer
│   ├── agent/             ← deploy, wallet, revenue, marketplace, a2a, mirror
│   ├── chain/             ← crossChain, escrow, dispute, erc7579, tba, paymaster, bridge, solana, identityBridge, zkml, reputationMarketplace
│   ├── system/            ← health, paymentConfig, wallet (legacy)
│   └── contrib/           ← hyperliquid, oauth, oauthResources, reward
│   └── index.ts           ← Updated barrel re-exports from subdirs
├── contrib/               ← NON-SETTLEMENT (kept in repo, clearly separated)
│   ├── integrations/
│   │   ├── n8n/           ← Moved from integrations/n8n/
│   │   ├── flowspec/      ← Moved from integrations/flowspec/
│   │   ├── hf/            ← Moved from integrations/hf/
│   │   ├── oauth/         ← Moved from integrations/oauth/
│   │   └── hyperliquid/   ← Moved from integrations/hyperliquid/
│   ├── protocols/
│   │   ├── privy/         ← Moved from protocols/adapters/privy/
│   │   └── hyperliquid/   ← Moved from protocols/adapters/hyperliquid/
│   └── providers/         ← Moved from providers/ (LLM routing)
├── integrations/          ← SETTLEMENT ONLY (stays)
│   ├── mcp/               ← Tool registry (settlement — tool passports)
│   ├── mcp-server/        ← Tool serving (settlement — MCP protocol)
│   └── zkml/              ← zkML verification (settlement — proof system)
├── inference/             ← STAYS (settlement — generates receipts)
├── agent/                 ← STAYS (settlement — agent orchestration)
├── compute/               ← STAYS (settlement — matching engine)
├── reputation/            ← STAYS (settlement — scoring from traffic)
├── middleware/             ← STAYS (settlement — auth + x402)
├── lib/                   ← STAYS (observability, auth)
├── services/              ← STAYS (session signer; rewardService is legacy)
├── index.ts               ← Updated imports from new paths
└── api.ts                 ← Updated imports from new paths
```

---

## Chunk 1: Create contrib/ directory and move zero-dependency integrations

These directories have NO reverse imports — they can be moved with zero code changes elsewhere.

### Task 1: Create contrib/ directory structure

**Files:**
- Create: `gateway-lite/src/contrib/integrations/n8n/` (move from `integrations/n8n/`)
- Create: `gateway-lite/src/contrib/integrations/hf/` (move from `integrations/hf/`)
- Create: `gateway-lite/src/contrib/integrations/mcp-server/` (move from `integrations/mcp-server/`)
- Create: `gateway-lite/src/contrib/providers/` (move from `providers/`)

- [ ] **Step 1: Create the contrib directory structure**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain/packages/gateway-lite/src
mkdir -p contrib/integrations contrib/protocols contrib/providers
```

- [ ] **Step 2: Move n8n (zero dependencies — no files import from it)**

```bash
git mv integrations/n8n contrib/integrations/n8n
```

- [ ] **Step 3: Move hf (zero dependencies — no files import from it)**

```bash
git mv integrations/hf contrib/integrations/hf
```

- [ ] **Step 4: Move mcp-server (zero dependencies — no files import from it)**

```bash
git mv integrations/mcp-server contrib/integrations/mcp-server
```

- [ ] **Step 5: Move providers (zero static imports found)**

```bash
git mv providers contrib/providers
```

- [ ] **Step 6: Run type-check to verify nothing broke**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain && npm run type-check
```

Expected: PASS (zero external references to these directories)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor: move zero-dependency non-settlement features to contrib/"
```

---

### Task 2: Move flowspec (4 reverse dependencies in agent/)

**Files:**
- Move: `integrations/flowspec/` → `contrib/integrations/flowspec/`
- Modify: `agent/agentOrchestrator.ts` (line 10)
- Modify: `agent/agentPlanner.ts` (line 6)
- Modify: `agent/executorRouter.ts` (lines 8-9)
- Modify: `api.ts` (lines 13-14)

- [ ] **Step 1: Move flowspec directory**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain/packages/gateway-lite/src
git mv integrations/flowspec contrib/integrations/flowspec
```

- [ ] **Step 2: Update import in agentOrchestrator.ts**

Change `'../integrations/flowspec/types'` → `'../contrib/integrations/flowspec/types'`

- [ ] **Step 3: Update import in agentPlanner.ts**

Change `'../integrations/flowspec/types'` → `'../contrib/integrations/flowspec/types'`

- [ ] **Step 4: Update imports in executorRouter.ts**

Change `'../integrations/flowspec/types'` → `'../contrib/integrations/flowspec/types'`
Change `'../integrations/flowspec/flowspecService'` → `'../contrib/integrations/flowspec/flowspecService'`

- [ ] **Step 5: Update imports in api.ts**

Change `'./integrations/flowspec/flowspecService'` → `'./contrib/integrations/flowspec/flowspecService'`
Change `'./integrations/flowspec/types'` → `'./contrib/integrations/flowspec/types'`

- [ ] **Step 6: Run type-check**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain && npm run type-check
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor: move flowspec to contrib/, update 4 import paths"
```

---

### Task 3: Move oauth (2 reverse dependencies in routes)

**Files:**
- Move: `integrations/oauth/` → `contrib/integrations/oauth/`
- Modify: `routes/oauthRoutes.ts` (line 2)
- Modify: `routes/oauthResourcesRoutes.ts` (line 4)

- [ ] **Step 1: Move oauth directory**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain/packages/gateway-lite/src
git mv integrations/oauth contrib/integrations/oauth
```

- [ ] **Step 2: Update import in oauthRoutes.ts**

Change `'../integrations/oauth/nangoService'` → `'../contrib/integrations/oauth/nangoService'`

- [ ] **Step 3: Update import in oauthResourcesRoutes.ts**

Change `'../integrations/oauth/nangoService'` → `'../contrib/integrations/oauth/nangoService'`

- [ ] **Step 4: Run type-check**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain && npm run type-check
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: move oauth to contrib/, update 2 import paths"
```

---

### Task 4: Move hyperliquid integration + protocol adapter (1 + 1 reverse dependencies)

**Files:**
- Move: `integrations/hyperliquid/` → `contrib/integrations/hyperliquid/`
- Move: `protocols/adapters/hyperliquid/` → `contrib/protocols/hyperliquid/`
- Move: `protocols/adapters/privy/` → `contrib/protocols/privy/`
- Modify: `routes/hyperliquidRoutes.ts` (line 9)
- Modify: `protocols/adapters/index.ts` (import for HyperliquidAdapter + PrivyAdapter)

- [ ] **Step 1: Move hyperliquid integration**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain/packages/gateway-lite/src
git mv integrations/hyperliquid contrib/integrations/hyperliquid
```

- [ ] **Step 2: Move privy and hyperliquid protocol adapters**

```bash
git mv protocols/adapters/privy contrib/protocols/privy
git mv protocols/adapters/hyperliquid contrib/protocols/hyperliquid
```

- [ ] **Step 3: Update import in hyperliquidRoutes.ts**

Change `'../integrations/hyperliquid/tradingService'` → `'../contrib/integrations/hyperliquid/tradingService'`

- [ ] **Step 4: Update imports in protocols/adapters/index.ts**

Change `'./hyperliquid'` → `'../../contrib/protocols/hyperliquid'`
Change `'./privy'` → `'../../contrib/protocols/privy'`

- [ ] **Step 5: Run type-check**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain && npm run type-check
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: move hyperliquid + privy to contrib/, update import paths"
```

---

## Chunk 2: Organize routes into subdirectories

### Task 5: Create route subdirectories and move core routes

**Files:**
- Create: `routes/core/`, `routes/agent/`, `routes/chain/`, `routes/system/`, `routes/contrib/`
- Move: 10 core route files → `routes/core/`
- Modify: `routes/index.ts` (update barrel exports)
- Modify: `index.ts` (update route imports)

Core routes (settlement pipeline):
- `receiptRoutes.ts` → `routes/core/`
- `epochRoutes.ts` → `routes/core/`
- `passportRoutes.ts` → `routes/core/`
- `payoutRoutes.ts` → `routes/core/`
- `shareRoutes.ts` → `routes/core/`
- `matchingRoutes.ts` → `routes/core/`
- `inferenceRoutes.ts` → `routes/core/`
- `computeNodeRoutes.ts` → `routes/core/`
- `subscriptionRoutes.ts` → `routes/core/`
- `lucidLayerRoutes.ts` → `routes/core/`
- `assetPaymentRoutes.ts` → `routes/core/`
- `paymentConfigRoutes.ts` → `routes/core/`

- [ ] **Step 1: Create subdirectories**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain/packages/gateway-lite/src/routes
mkdir -p core agent chain system contrib
```

- [ ] **Step 2: Move core route files**

```bash
git mv receiptRoutes.ts core/
git mv epochRoutes.ts core/
git mv passportRoutes.ts core/
git mv payoutRoutes.ts core/
git mv shareRoutes.ts core/
git mv matchingRoutes.ts core/
git mv inferenceRoutes.ts core/
git mv computeNodeRoutes.ts core/
git mv subscriptionRoutes.ts core/
git mv lucidLayerRoutes.ts core/
git mv assetPaymentRoutes.ts core/
git mv paymentConfigRoutes.ts core/
```

- [ ] **Step 3: Fix relative imports INSIDE moved core route files**

Each moved file's relative imports go one level deeper. For example in `core/receiptRoutes.ts`:
- `'../middleware/adminAuth'` → `'../../middleware/adminAuth'`
- `'../../../engine/src/...'` → `'../../../../engine/src/...'`
- `'../integrations/...'` → `'../../integrations/...'`
- `'../compute/...'` → `'../../compute/...'`
- `'../inference/...'` → `'../../inference/...'`

Must be done for ALL 12 moved core route files. Each file needs its internal relative imports updated by adding one `../` level.

- [ ] **Step 4: Fix lucidLayerRoutes.ts internal route references**

`lucidLayerRoutes.ts` imports other routes by relative path (e.g., `'./receiptRoutes'`). Since it's now in `core/`, these become `'./receiptRoutes'` (same dir) for routes also in core, or `'../agent/agentDeployRoutes'` etc. for routes in other subdirs.

- [ ] **Step 5: Run type-check**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain && npm run type-check
```

Expected: FAIL (barrel exports and server index not yet updated — that's next)

---

### Task 6: Move agent routes

**Files:**
- Move: 6 agent route files → `routes/agent/`

Agent routes:
- `agentDeployRoutes.ts` → `routes/agent/`
- `agentMarketplaceRoutes.ts` → `routes/agent/`
- `agentWalletRoutes.ts` → `routes/agent/`
- `agentRevenueRoutes.ts` → `routes/agent/`
- `a2aRoutes.ts` → `routes/agent/`
- `agentMirrorRoutes.ts` → `routes/agent/`

- [ ] **Step 1: Move agent route files**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain/packages/gateway-lite/src/routes
git mv agentDeployRoutes.ts agent/
git mv agentMarketplaceRoutes.ts agent/
git mv agentWalletRoutes.ts agent/
git mv agentRevenueRoutes.ts agent/
git mv a2aRoutes.ts agent/
git mv agentMirrorRoutes.ts agent/
```

- [ ] **Step 2: Fix relative imports inside all 6 moved agent route files**

Same pattern: add one `../` level to all relative imports.

---

### Task 7: Move chain routes

**Files:**
- Move: 11 chain route files → `routes/chain/`

Chain routes:
- `crossChainRoutes.ts` → `routes/chain/`
- `escrowRoutes.ts` → `routes/chain/`
- `disputeRoutes.ts` → `routes/chain/`
- `erc7579Routes.ts` → `routes/chain/`
- `tbaRoutes.ts` → `routes/chain/`
- `paymasterRoutes.ts` → `routes/chain/`
- `bridgeRoutes.ts` → `routes/chain/`
- `solanaRoutes.ts` → `routes/chain/`
- `identityBridgeRoutes.ts` → `routes/chain/`
- `zkmlRoutes.ts` → `routes/chain/`
- `reputationMarketplaceRoutes.ts` → `routes/chain/`

- [ ] **Step 1: Move chain route files**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain/packages/gateway-lite/src/routes
git mv crossChainRoutes.ts chain/
git mv escrowRoutes.ts chain/
git mv disputeRoutes.ts chain/
git mv erc7579Routes.ts chain/
git mv tbaRoutes.ts chain/
git mv paymasterRoutes.ts chain/
git mv bridgeRoutes.ts chain/
git mv solanaRoutes.ts chain/
git mv identityBridgeRoutes.ts chain/
git mv zkmlRoutes.ts chain/
git mv reputationMarketplaceRoutes.ts chain/
```

- [ ] **Step 2: Fix relative imports inside all 11 moved chain route files**

Same pattern: add one `../` level to all relative imports.

---

### Task 8: Move system and contrib routes

**Files:**
- Move: `healthRoutes.ts` → `routes/system/`
- Move: `walletRoutes.ts` → `routes/system/`
- Move: `hyperliquidRoutes.ts` → `routes/contrib/`
- Move: `oauthRoutes.ts` → `routes/contrib/`
- Move: `oauthResourcesRoutes.ts` → `routes/contrib/`
- Move: `rewardRoutes.ts` → `routes/contrib/`

- [ ] **Step 1: Move system route files**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain/packages/gateway-lite/src/routes
git mv healthRoutes.ts system/
git mv walletRoutes.ts system/
```

- [ ] **Step 2: Move contrib route files**

```bash
git mv hyperliquidRoutes.ts contrib/
git mv oauthRoutes.ts contrib/
git mv oauthResourcesRoutes.ts contrib/
git mv rewardRoutes.ts contrib/
```

- [ ] **Step 3: Fix relative imports inside all 6 moved files**

Same pattern: add one `../` level to all relative imports. For contrib routes, also update integration import paths since those moved in Chunk 1 (e.g., `'../../contrib/integrations/oauth/nangoService'` stays valid since route is now at `routes/contrib/` and integration is at `contrib/integrations/`).

---

### Task 9: Update barrel export and server entry

**Files:**
- Modify: `routes/index.ts` (update all 36 export paths)
- Modify: `index.ts` (update all ~40 route imports)

- [ ] **Step 1: Rewrite routes/index.ts with new paths**

```typescript
// Routes barrel — grouped by domain

// Core settlement routes
export { lucidLayerRouter } from './core/lucidLayerRoutes';
export { passportRouter } from './core/passportRoutes';
export { shareRouter } from './core/shareRoutes';
export { receiptRouter } from './core/receiptRoutes';
export { epochRouter } from './core/epochRoutes';
export { matchingRouter } from './core/matchingRoutes';
export { computeNodeRouter } from './core/computeNodeRoutes';
export { payoutRouter } from './core/payoutRoutes';
export { inferenceRouter } from './core/inferenceRoutes';
export { createAssetPaymentRouter } from './core/assetPaymentRoutes';
export { createPaymentConfigRouter } from './core/paymentConfigRoutes';
export { createSubscriptionRouter } from './core/subscriptionRoutes';

// Agent routes
export { agentDeployRouter } from './agent/agentDeployRoutes';
export { agentMarketplaceRouter } from './agent/agentMarketplaceRoutes';
export { a2aRouter } from './agent/a2aRoutes';
export { agentWalletRouter } from './agent/agentWalletRoutes';
export { agentRevenueRouter } from './agent/agentRevenueRoutes';
export { agentMirrorRouter } from './agent/agentMirrorRoutes';

// Chain & identity routes
export { crossChainRouter } from './chain/crossChainRoutes';
export { escrowRouter } from './chain/escrowRoutes';
export { disputeRouter } from './chain/disputeRoutes';
export { erc7579Router } from './chain/erc7579Routes';
export { tbaRouter } from './chain/tbaRoutes';
export { paymasterRouter } from './chain/paymasterRoutes';
export { bridgeRouter } from './chain/bridgeRoutes';
export { solanaRouter } from './chain/solanaRoutes';
export { identityBridgeRouter } from './chain/identityBridgeRoutes';
export { zkmlRouter } from './chain/zkmlRoutes';
export { reputationMarketplaceRouter } from './chain/reputationMarketplaceRoutes';

// System routes
export { healthRouter } from './system/healthRoutes';
export { walletRouter } from './system/walletRoutes';

// Contrib routes (non-settlement integrations)
export { hyperliquidRouter } from './contrib/hyperliquidRoutes';
export { oauthRouter } from './contrib/oauthRoutes';
export { oauthResourcesRouter } from './contrib/oauthResourcesRoutes';
export { rewardRouter } from './contrib/rewardRoutes';
```

- [ ] **Step 2: Update index.ts route imports**

Update all ~40 individual route imports in `index.ts` to use new subdir paths:
- `'./routes/oauthRoutes'` → `'./routes/contrib/oauthRoutes'`
- `'./routes/healthRoutes'` → `'./routes/system/healthRoutes'`
- `'./routes/hyperliquidRoutes'` → `'./routes/contrib/hyperliquidRoutes'`
- `'./routes/passportRoutes'` → `'./routes/core/passportRoutes'`
- `'./routes/agentDeployRoutes'` → `'./routes/agent/agentDeployRoutes'`
- etc. for all routes

- [ ] **Step 3: Update api.ts if it imports any route files**

Check and update any route imports in the 2553-line legacy file.

- [ ] **Step 4: Update route test imports**

Check `routes/__tests__/` for any imports that reference moved route files.

- [ ] **Step 5: Run type-check**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain && npm run type-check
```

Expected: PASS

- [ ] **Step 6: Run full test suite**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain && npm test
```

Expected: All 1166 tests pass

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor: organize routes into core/agent/chain/system/contrib subdirectories"
```

---

## Chunk 3: Cleanup and verification

### Task 10: Verify empty integrations/ directory is clean

**Files:**
- Check: `integrations/` should only contain settlement features (mcp/, zkml/)

- [ ] **Step 1: Verify integrations/ only has settlement features**

```bash
ls /home/debian/Lucid/Lucid-L2/offchain/packages/gateway-lite/src/integrations/
```

Expected: `mcp/  zkml/` only (n8n, hf, oauth, hyperliquid, mcp-server, flowspec all moved)

- [ ] **Step 2: Verify protocols/adapters/ only has settlement adapters**

```bash
ls /home/debian/Lucid/Lucid-L2/offchain/packages/gateway-lite/src/protocols/adapters/
```

Expected: `solana/  index.ts` (privy and hyperliquid moved to contrib)

- [ ] **Step 3: Verify no dangling imports with grep**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain/packages/gateway-lite/src
grep -r "integrations/n8n" --include="*.ts" .
grep -r "integrations/hf" --include="*.ts" .
grep -r "integrations/oauth" --include="*.ts" .
grep -r "integrations/hyperliquid" --include="*.ts" .
grep -r "integrations/flowspec" --include="*.ts" .
grep -r "integrations/mcp-server" --include="*.ts" .
grep -r "adapters/privy" --include="*.ts" .
grep -r "adapters/hyperliquid" --include="*.ts" .
grep -r "'/providers/" --include="*.ts" .
```

Expected: ZERO matches (all old paths should be updated)

- [ ] **Step 4: Run full test suite one final time**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain && npm test
```

Expected: All tests pass

- [ ] **Step 5: Final commit if any cleanup was needed**

```bash
git add -A && git commit -m "refactor: cleanup dangling imports after reorganization"
```

---

### Task 11: Update CLAUDE.md to reflect new structure

**Files:**
- Modify: `/home/debian/Lucid/Lucid-L2/CLAUDE.md` (Offchain Codebase Structure section)

- [ ] **Step 1: Update the directory tree in CLAUDE.md**

Replace the gateway-lite section of the directory tree with the new structure showing `contrib/`, `routes/core/`, `routes/agent/`, `routes/chain/`, `routes/system/`, `routes/contrib/`.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md && git commit -m "docs: update CLAUDE.md with reorganized gateway-lite structure"
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Broken imports after move | Type-check after every task; grep for old paths in Task 10 |
| `api.ts` has hidden references | Search for all old import paths in the 2553-line file |
| Side-effect import for protocol adapters (`import './protocols/adapters'`) | Keep `protocols/adapters/index.ts` in place, only move subdirectories |
| Dynamic imports we didn't find | Full test suite catches runtime failures |
| `hfBridgeService.ts` imports from `inference/contentService` | Both move together (hf → contrib, inference stays — path changes) |
| Route tests reference old paths | Check `routes/__tests__/` in Task 9 Step 4 |
