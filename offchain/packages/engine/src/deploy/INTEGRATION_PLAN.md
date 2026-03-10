# Agent System Full Integration Plan

> Companion to `DEPLOYMENT_PLAN.md`. This document covers integrating the agent system
> with ALL existing Lucid-L2 features for a complete product.

---

## Integration Gap Analysis

### Current Agent Integration Map

| Module | Agent-Aware? | Evidence |
|--------|-------------|----------|
| `receipt/epochService` | YES | `agent_passport_id` on epochs, `addReceiptToEpoch()` |
| `jobs/receiptConsumer` | YES | Routes agent receipts to per-agent epochs |
| `jobs/agentMirrorConsumer` | YES | Polls platform-core outbox, upserts passports |
| `agent/agentDeploymentService` | YES | Full pipeline: passport + adapter + wallet + deploy + A2A + marketplace |
| `agent/wallet/IAgentWalletProvider` | YES | Interface with Crossmint, ERC6551, Mock implementations |
| `agent/marketplace/marketplaceService` | YES | Listings, reviews, usage tracking (in-memory) |
| `agent/a2a/agentCard` | YES | Generates A2A Agent Cards from passport metadata |
| `routes/agentMirrorRoutes` | YES | GET /v1/agents/:id/proof, receipts, epoch |
| `routes/a2aRoutes` | YES | Agent-to-agent task routing |
| `passport/passportManager` | YES | Creates agent passports (type='agent') |
| `runtime/*` | YES | 7 framework adapters for code generation |

### NOT Connected (Critical Gaps)

| Module | What It Does | Gap Description |
|--------|-------------|-----------------|
| **`finance/payoutService`** | Revenue splits (70/20/10 basis points), EVM USDC transfers, Solana distribution | Zero agent references. Splits use `run_id` but never `agent_passport_id`. No per-agent revenue tracking. |
| **`finance/escrowService`** | EVM escrow with receipt-hash verification | No agent identity. Can't create agent-specific escrows. |
| **`finance/disputeService`** | On-chain arbitration with MMR proof evidence | No agent identity. Disputes not linked to agent runs. |
| **`finance/paymentGateService`** | Solana payment gates (x402) | No agent-aware payment gating. |
| **`assets/shares/ITokenLauncher`** | Share tokens (SPL Token-2022, Genesis TGE) | Zero agent references. Agents can't be tokenized as investable assets. |
| **`assets/nft/INFTProvider`** | NFT minting (Token2022, MetaplexCore, EVM) | Works with passports generically, but no agent-specific NFT features. |
| **`jobs/revenueAirdrop`** | Snapshot holders, proportional SOL distribution | Not connected to agent revenue. Airdrops only from manual trigger. |
| **`storage/depin/IDepinStorage`** | Arweave/Lighthouse permanent storage | Not agent-aware. Agent artifacts not stored permanently. |
| **`identity/` (TBA, registries)** | ERC-6551 Token Bound Accounts, ERC-8004 registries | `payoutService` has `resolvePayoutRecipient()` using TBA, but not wired to agent payouts. |
| **`reputation/`** | Cross-chain reputation via ERC-8004 events | Uses `agentTokenId` but NOT linked to `agent_passport_id`. Separate identity space. |
| **`compute/` (matching, registry)** | Compute node matching, heartbeat registry | Zero agent references. Agents don't register as compute providers. |
| **`inference/`** | LLM execution gateway | Zero agent references. No agent-specific routing or tracking. |
| **On-chain `lucid_agent_wallet`** | Solana program: PDA wallets, policy, splits, sessions, escrow | SolanaAdapter has stub methods (mock returns). NO actual on-chain transactions. |
| **@lucid/agent-sdk** | SDK for building agents | Only exposes: chat, tools, oracle, receipts, prove(). Missing: deploy(), wallet(), marketplace(), a2a(). |

---

## Integration Architecture

```
Agent Lifecycle (Complete Product)

1. REGISTER    POST /v1/agents → passport + API key + agent_created_events outbox
                                → L2 mirror consumer upserts passport
                                → NFT minted for agent passport (optional)

2. TOKENIZE    POST /v1/passports/:id/token/launch → share token created
                                → Agent becomes investable asset
                                → Revenue flows to token holders

3. DEPLOY      agent.deploy({ target: 'nosana' })
                → ImageBuilder → push to GHCR
                → Deployer → live URL
                → agent_deployments table
                → On-chain wallet created (lucid_agent_wallet PDA)
                → Policy set (daily limits, allowed programs)
                → Revenue split configured (agent owner + token holders + protocol)
                → Receipt emitted (deploy action)

4. OPERATE     Every call → receipt with agent_passport_id + run_id
                → Per-agent epoch → MMR root → Solana anchoring
                → Payout triggered: compute/model/protocol/agent-owner split
                → Usage tracked in marketplace
                → Reputation updated from feedback

5. EARN        Receipts → calculate payout → execute split
                → Agent owner share → on-chain wallet or TBA
                → Token holder share → revenue airdrop pool
                → Periodic airdrop to share token holders

6. PROVE       agent.receipts.getProof(runId)
                → MMR proof + Solana chain_tx + attestation
                → Disputes use MMR proof as evidence
```

### Platform-Core Bridge Gaps (from deep analysis)

| Gap | Impact | Fix Location |
|-----|--------|-------------|
| **No reverse signaling (L2 → PC)** | Platform-core can't know when epochs are Solana-anchored without polling L2 | New: `epoch_anchored_events` outbox in L2 + consumer in PC |
| **Oracle API doesn't capture agent_passport_id** | Agent oracle usage not tracked in receipts → missing from reputation feeds | `oracle-api/src/routes/v1.ts` — emit receipt with `agent_passport_id` |
| **Control-plane lacks agent budget CRUD** | Admins can't manage per-agent budgets after creation | `control-plane/src/routes/` — new agent budget endpoints |
| **Usage-persister ignores agent_passport_id** | Oracle usage stats not agent-correlated | `usage-persister.ts` — add agent field |

---

## Implementation Steps

### Step I1: Finance Module Agent Integration

**Files to modify:**

#### `engine/src/finance/payoutService.ts`

Add `agent_passport_id` to `PayoutSplit` and `createPayoutFromReceipt`:

```typescript
export interface PayoutSplit {
  run_id: string;
  agent_passport_id?: string;  // NEW
  total_amount_lamports: bigint;
  recipients: PayoutRecipient[];
  split_config: SplitConfig;
  created_at: number;
}

// NEW: Agent-aware payout creation
export function createAgentPayout(params: {
  run_id: string;
  agent_passport_id: string;
  tokens_in: number;
  tokens_out: number;
  price_per_1k_tokens_lamports: bigint;
  compute_wallet: string;
  model_wallet?: string;
  agent_owner_wallet: string;
  config?: SplitConfig;
}): PayoutSplit {
  // Agent owner replaces "orchestrator" in the split
  const agentConfig = params.config || {
    compute_provider_bp: 6000,  // 60%
    model_provider_bp: 1500,    // 15%
    protocol_treasury_bp: 1000, // 10%
    orchestrator_bp: 1500,      // 15% → agent owner
  };
  return createPayoutFromReceipt({ ...params, orchestrator_wallet: params.agent_owner_wallet, config: agentConfig });
}
```

#### `engine/src/finance/escrowService.ts`

Add agent-scoped escrow creation:

```typescript
// NEW: Create escrow bound to agent receipt
export async function createAgentEscrow(params: {
  agent_passport_id: string;
  run_id: string;
  // ... existing escrow params
}): Promise<{ escrowId: string; txHash: string }> {
  // Uses receipt hash from the agent's run as expectedReceiptHash
}
```

#### `engine/src/finance/disputeService.ts`

Add agent context to disputes:

```typescript
// NEW: Open dispute with agent context
export async function openAgentDispute(params: {
  agent_passport_id: string;
  escrow_id: string;
  run_id: string;
  reason: string;
}): Promise<{ disputeId: string }> {
  // Auto-fetches MMR proof from agent's epoch for evidence
}
```

---

### Step I2: Share Token Integration (Agents as Investable Assets)

**Concept:** Any agent passport can launch a share token. Token holders earn proportional revenue from the agent's operations.

**Files to modify:**

#### `engine/src/assets/shares/ITokenLauncher.ts`

No interface change needed — `TokenLaunchParams.passportId` already works for agents.

#### NEW: `engine/src/agent/agentRevenueService.ts`

```typescript
/**
 * Agent Revenue Service
 *
 * Connects agent receipts → payout calculation → revenue pool → airdrop.
 *
 * Flow:
 * 1. receiptConsumer processes agent receipt
 * 2. Calculate payout split (agent owner gets orchestrator share)
 * 3. Accumulate agent owner's share in revenue pool
 * 4. If agent has share token: distribute to token holders via airdrop
 * 5. If no share token: direct to agent owner wallet
 */

export interface AgentRevenuePool {
  agent_passport_id: string;
  accumulated_lamports: bigint;
  last_airdrop_at: number;
  total_distributed_lamports: bigint;
}

export async function processAgentRevenue(receipt: {
  agent_passport_id: string;
  run_id: string;
  tokens_in: number;
  tokens_out: number;
  model: string;
}): Promise<void> {
  // 1. Look up agent passport → get owner wallet + share token mint
  // 2. Calculate payout split
  // 3. Add agent owner's share to revenue pool
  // 4. If pool > threshold → trigger airdrop to token holders
}

export async function triggerAgentAirdrop(agentPassportId: string): Promise<AirdropResult> {
  // 1. Get agent's share token mint
  // 2. Get accumulated revenue
  // 3. Call runRevenueAirdrop() with the accumulated amount
  // 4. Reset pool
}
```

#### `jobs/revenueAirdrop.ts`

No change needed — already generic. `agentRevenueService` calls it with the agent's token mint.

---

### Step I3: On-Chain lucid_agent_wallet Bridge

The on-chain program has rich capabilities (policy, splits, sessions, escrow) but the SolanaAdapter methods are stubs. This is the highest-value integration.

**Files to modify:**

#### `engine/src/chains/solana/adapter.ts`

Replace stub methods with real Anchor CPI calls:

```typescript
// createAgentWallet: build actual create_wallet instruction
async createAgentWallet(passportMint: string): Promise<{ walletPda: string; txHash: string }> {
  const program = await this.getAgentWalletProgram();
  const mintPubkey = new PublicKey(passportMint);
  const [walletPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('agent_wallet'), mintPubkey.toBuffer()],
    program.programId,
  );

  const tx = await program.methods.createWallet()
    .accounts({
      wallet: walletPda,
      passportMint: mintPubkey,
      authority: this.provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { walletPda: walletPda.toBase58(), txHash: tx };
}

// setPolicy: build actual set_policy instruction
// configureSplit: build actual configure_split instruction
// createSession: build actual create_session instruction
// createEscrow: build actual create_escrow instruction
// releaseEscrow: build actual release_escrow instruction
```

#### NEW: `engine/src/agent/wallet/SolanaWalletProvider.ts`

New `IAgentWalletProvider` implementation that uses the on-chain program:

```typescript
export class SolanaAgentWalletProvider implements IAgentWalletProvider {
  readonly providerName = 'solana-native';
  readonly chain = 'solana';

  async createWallet(agentPassportId: string): Promise<AgentWallet> {
    // 1. Get passport's NFT mint address
    // 2. Call SolanaAdapter.createAgentWallet(mint)
    // 3. Set default policy from descriptor
    // 4. Configure revenue split from descriptor.monetization
    return { address: walletPda, chain: 'solana', provider: 'solana-native', agent_passport_id: agentPassportId, created_at: Date.now() };
  }

  async executeTransaction(walletAddress: string, tx: TransactionRequest): Promise<TransactionResult> {
    // Calls the on-chain execute instruction (policy-gated)
  }

  async setSpendingLimits(walletAddress: string, limits: SpendingLimits): Promise<void> {
    // Calls on-chain set_policy instruction
  }
}
```

#### `engine/src/agent/wallet/index.ts`

Add `'solana-native'` to factory:

```typescript
case 'solana-native':
  return new SolanaAgentWalletProvider();
```

---

### Step I4: Reputation ↔ Agent Passport Linkage

**Problem:** `reputationAggregator` uses `agentTokenId` (ERC-8004 NFT token ID) which is a different identity space from `agent_passport_id`.

**Fix:**

#### `gateway-lite/src/reputation/reputationAggregator.ts`

Add passport-to-tokenId mapping:

```typescript
// NEW: Resolve agent passport to ERC-8004 token IDs across chains
async function resolveAgentTokenIds(agentPassportId: string): Promise<Map<string, string>> {
  // Query identity bridge: passport_id → chain-specific NFT token IDs
  // Returns: { 'base': '42', 'apechain': '17', ... }
}

// NEW: Get unified reputation for an agent passport
export async function getAgentReputation(agentPassportId: string): Promise<UnifiedReputationScore> {
  const tokenIds = await resolveAgentTokenIds(agentPassportId);
  // Aggregate across all chains where this agent has identity
}
```

#### Feed into marketplace:

```typescript
// In marketplaceService.ts — update listing.avg_rating from on-chain reputation
async function syncReputationToMarketplace(agentPassportId: string): Promise<void> {
  const rep = await getAgentReputation(agentPassportId);
  const listing = this.listings.get(agentPassportId);
  if (listing) {
    listing.avg_rating = rep.unifiedScore;
    listing.review_count = rep.totalFeedbackCount;
  }
}
```

---

### Step I5: DePIN Storage for Agent Artifacts

**Concept:** Store agent deployment artifacts (code, configs, proofs) permanently on Arweave/Lighthouse.

#### `engine/src/agent/agentDeploymentService.ts`

After successful deployment:

```typescript
// Store deployment artifact permanently
if (process.env.DEPIN_UPLOAD_ENABLED !== 'false') {
  const depinStorage = getPermanentStorage();
  await depinStorage.upload({
    data: JSON.stringify({
      passport_id: passportId,
      descriptor: input.descriptor,
      deployment_target: target,
      deployment_url: deployResult.url,
      adapter: adapterName,
      deployed_at: new Date().toISOString(),
    }),
    tags: { type: 'agent-deployment', passport_id: passportId },
  });
}
```

---

### Step I6: SDK Extensions

**File:** `lucid-platform-core/packages/agent-sdk/src/index.ts`

Add new sub-clients:

```typescript
export interface LucidAgent {
  chat: ChatClient
  tools: ToolsClient
  oracle: OracleClient
  receipts: ReceiptsClient
  prove: (fn: (ctx: LucidAgent) => Promise<void>) => Promise<{ runId: string; proof: RunProof }>

  // NEW sub-clients
  deploy: DeployClient           // agent.deploy({ target: 'nosana' })
  wallet: WalletClient           // agent.wallet.balance(), agent.wallet.send()
  marketplace: MarketplaceClient // agent.marketplace.list(), agent.marketplace.usage()
}
```

#### NEW: `agent-sdk/src/deploy.ts`

```typescript
export class DeployClient {
  async deploy(params: { target: string; gpu?: string; env?: Record<string, string> }): Promise<DeployResult> {
    return this.http.post(`/v1/agents/${this.passportId}/deploy`, params)
  }
  async status(deploymentId: string): Promise<DeploymentStatus> { ... }
  async logs(deploymentId: string): Promise<string> { ... }
  async scale(deploymentId: string, replicas: number): Promise<void> { ... }
  async terminate(deploymentId: string): Promise<void> { ... }
}
```

#### NEW: `agent-sdk/src/wallet.ts`

```typescript
export class WalletClient {
  async balance(): Promise<WalletBalance> {
    return this.http.get(`/v1/agents/${this.passportId}/wallet/balance`)
  }
  async send(params: { to: string; amount: string; token?: string }): Promise<TransactionResult> {
    return this.http.post(`/v1/agents/${this.passportId}/wallet/send`, params)
  }
  async setLimits(limits: SpendingLimits): Promise<void> {
    return this.http.put(`/v1/agents/${this.passportId}/wallet/limits`, limits)
  }
}
```

#### NEW: `agent-sdk/src/marketplace.ts`

```typescript
export class MarketplaceClient {
  async list(params?: { category?: string; featured?: boolean }): Promise<MarketplaceListing[]> {
    return this.http.get('/v1/marketplace/agents', params)
  }
  async getUsage(): Promise<AgentUsageRecord[]> {
    return this.http.get(`/v1/agents/${this.passportId}/usage`)
  }
  async getRevenue(): Promise<AgentRevenuePool> {
    return this.http.get(`/v1/agents/${this.passportId}/revenue`)
  }
}
```

---

### Step I7: Agent-Aware Payout Pipeline (receiptConsumer → payoutService)

**The glue step.** When `receiptConsumer` processes an agent receipt, trigger the payout pipeline.

#### `engine/src/jobs/receiptConsumer.ts`

After adding receipt to agent epoch:

```typescript
// After: epochService.addReceiptToEpoch(receipt, agentPassportId)
if (receipt.agent_passport_id) {
  // Trigger agent revenue processing
  const { processAgentRevenue } = await import('../agent/agentRevenueService');
  await processAgentRevenue({
    agent_passport_id: receipt.agent_passport_id,
    run_id: receipt.run_id,
    tokens_in: receipt.tokens_in,
    tokens_out: receipt.tokens_out,
    model: receipt.model,
  });
}
```

---

### Step I8: Marketplace ↔ Receipt Data Feed

**Problem:** `MarketplaceService` tracks usage in-memory with zero real data.

#### `engine/src/agent/marketplace/marketplaceService.ts`

Add method to ingest real receipt data:

```typescript
// NEW: Feed real receipt data into marketplace usage tracking
async ingestReceipt(receipt: {
  agent_passport_id: string;
  run_id: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number;
  status: string;
  caller_tenant_id?: string;
}): Promise<void> {
  // Update listing.total_calls++
  // Update listing.total_revenue_usd += receipt.cost_usd
  // Add usage record
}
```

Called from `receiptConsumer` alongside `processAgentRevenue`.

---

### Step I9: New API Routes

#### NEW: `gateway-lite/src/routes/agentWalletRoutes.ts`

```
GET  /v1/agents/:id/wallet/balance    — Agent wallet balance
POST /v1/agents/:id/wallet/send       — Send from agent wallet (policy-gated)
PUT  /v1/agents/:id/wallet/limits     — Set spending limits
GET  /v1/agents/:id/wallet/policy     — Get current policy
```

#### NEW: `gateway-lite/src/routes/agentRevenueRoutes.ts`

```
GET  /v1/agents/:id/revenue           — Revenue pool status
POST /v1/agents/:id/revenue/airdrop   — Trigger airdrop to token holders
GET  /v1/agents/:id/revenue/history   — Payout history
```

#### NEW: `gateway-lite/src/routes/agentDeployRoutes.ts`

```
POST   /v1/agents/:id/deploy          — One-click deploy
GET    /v1/agents/:id/deployment       — Deployment status
GET    /v1/agents/:id/deployment/logs  — Deployment logs
POST   /v1/agents/:id/deployment/scale — Scale replicas
DELETE /v1/agents/:id/deployment       — Terminate
```

#### EXTEND: `gateway-lite/src/routes/marketplaceRoutes.ts`

```
GET  /v1/marketplace/agents            — Browse agent listings (with filters)
GET  /v1/marketplace/agents/:id        — Agent detail + reviews + usage stats
POST /v1/marketplace/agents/:id/review — Submit review
```

---

### Step I10: Reverse Signaling (L2 → Platform-Core)

**Problem:** Platform-core has no way to know when an agent's epoch is anchored to Solana. The proof proxy works (MCPGate polls L2), but there's no push notification.

#### NEW: `engine/src/jobs/epochAnchoredOutbox.ts`

After `anchoringJob` commits an epoch to Solana:

```typescript
// Write to outbox table for platform-core consumption
await db.query(`
  INSERT INTO epoch_anchored_events (epoch_id, agent_passport_id, mmr_root, chain_tx, anchored_at)
  VALUES ($1, $2, $3, $4, now())
`, [epoch.epoch_id, epoch.agent_passport_id, epoch.mmr_root, epoch.chain_tx]);
```

Platform-core consumer polls this table → can update agent status, trigger webhooks, etc.

#### Platform-core: Oracle API agent_passport_id capture

**File:** `oracle-api/src/routes/v1.ts`

Add `agent_passport_id` from resolved context to all oracle receipt emissions:

```typescript
// In decision-pack and other oracle endpoints:
await emitReceiptEvent({
  ...existing,
  agent_passport_id: context.agentPassportId,
  call_type: 'oracle',
  run_id: resolveRunId(request.headers),
});
```

---

### Step I11: Agent Descriptor Extension

#### `engine/src/agent/agentDescriptor.ts`

Add `nosana` to `DeploymentTargetType`:

```typescript
export type DeploymentTargetType = 'railway' | 'akash' | 'phala' | 'ionet' | 'nosana' | 'docker';
```

Add revenue config to `MonetizationConfig`:

```typescript
export interface MonetizationConfig {
  // existing fields...
  share_token?: {
    symbol: string;
    total_supply: number;
    auto_launch: boolean;
  };
  revenue_split?: {
    owner_bp: number;       // e.g. 1500 (15%)
    token_holders_bp: number; // e.g. 1500 (15%) — from owner's share
  };
}
```

---

## Implementation Phases

### Phase I-A: Finance + Revenue (Week 1)
- `agentRevenueService.ts` (new)
- `payoutService.ts` — add `createAgentPayout()`
- `receiptConsumer.ts` — wire agent receipts to payout pipeline
- `marketplaceService.ts` — add `ingestReceipt()`
- `agentRevenueRoutes.ts` (new)

### Phase I-B: On-Chain Wallet Bridge (Week 2)
- `SolanaAdapter` — replace stubs with real Anchor CPI
- `SolanaAgentWalletProvider.ts` (new)
- `agentWalletRoutes.ts` (new)
- `agentDeploymentService.ts` — wire wallet creation to on-chain program during deploy

### Phase I-C: Share Tokens + Airdrop (Week 3)
- `agentRevenueService.ts` — add airdrop trigger
- `agentDescriptor.ts` — add `share_token` config to `MonetizationConfig`
- `agentDeploymentService.ts` — auto-launch share token if `auto_launch: true`
- Wire `revenueAirdrop.ts` to agent revenue pool

### Phase I-D: Reputation + Marketplace (Week 4)
- `reputationAggregator.ts` — add passport-to-tokenId mapping
- `marketplaceService.ts` — sync reputation scores
- `marketplaceRoutes.ts` (new/extended)
- DePIN storage for agent artifacts

### Phase I-E: SDK + Polish (Week 5)
- `deploy.ts`, `wallet.ts`, `marketplace.ts` in agent-sdk (new)
- `agentDescriptor.ts` — add `nosana` target
- `agentDeployRoutes.ts` (new)
- Integration tests

---

## Complete Agent DX (After Both Plans)

```typescript
import { createLucidAgent } from '@lucid/agent-sdk'

const agent = createLucidAgent({
  apiKey: process.env.LUCID_API_KEY!,
  agentPassportId: process.env.AGENT_PASSPORT_ID,
})

// 1. Deploy to Nosana GPU
const deployment = await agent.deploy({
  target: 'nosana',
  gpu: 'rtx-4090',
})
console.log(deployment.url)  // https://abc.node.k8s.prd.nos.ci

// 2. Chat with provable receipts
const { runId, proof } = await agent.prove(async (ctx) => {
  await ctx.chat.complete({ messages: [{ role: 'user', content: 'Analyze SOL' }] })
  await ctx.tools.call('builtin:coingecko', 'get_price', { symbol: 'SOL' })
  const pack = await ctx.oracle.getDecisionPack({ symbols: ['SOL'] })
})

// 3. Check wallet + revenue
const balance = await agent.wallet.balance()
const revenue = await agent.marketplace.getRevenue()

// 4. Trigger airdrop to share token holders
await agent.marketplace.triggerAirdrop()

// 5. Verify proof on-chain
console.log(proof.verified)   // true
console.log(proof.chain_tx)   // Solana transaction hash
```

---

## Verification Checklist

1. Agent receipt → `payoutService.createAgentPayout()` called with correct split
2. Agent revenue accumulates in pool → threshold triggers airdrop
3. Share token launch → `getTokenInfo()` returns mint for agent passport
4. On-chain `createAgentWallet()` → real PDA created, real tx hash
5. `setPolicy()` → on-chain policy enforced on `execute()`
6. `configure_split()` → on-chain revenue distribution configured
7. Reputation aggregator resolves passport → token IDs → unified score
8. Marketplace listing shows real `total_calls`, `total_revenue_usd` from receipts
9. SDK `agent.deploy()` → image built, pushed, deployed, URL returned
10. SDK `agent.wallet.balance()` → real on-chain balance
11. SDK `agent.marketplace.getRevenue()` → accumulated revenue from receipts
12. Dispute → auto-fetches MMR proof from agent's epoch as evidence
13. DePIN storage → agent deployment artifact stored permanently
14. `DeploymentTargetType` includes `'nosana'`
15. `epoch_anchored_events` outbox written after Solana commit
16. Oracle API emits receipts with `agent_passport_id` for oracle calls

---

## Critical Path

```
DEPLOYMENT_PLAN Phase A (Image Build)
        │
        ├──→ INTEGRATION_PLAN Phase I-A (Finance + Revenue)
        │         │
        │         └──→ Phase I-C (Share Tokens + Airdrop)
        │
        ├──→ Phase I-B (On-Chain Wallet Bridge)  [independent]
        │
        └──→ DEPLOYMENT_PLAN Phases B-D (Provider Rewrites)
                  │
                  └──→ Phase I-E (SDK + Polish)
                            │
                            └──→ Phase I-D (Reputation + Marketplace)
```

Phases I-A, I-B, and DEPLOYMENT_PLAN Phase A can run in parallel.
Phase I-E depends on everything else being done.
