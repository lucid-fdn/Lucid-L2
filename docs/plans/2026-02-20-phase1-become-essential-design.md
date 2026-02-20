# Phase 1: "Become Essential" -- Design Document

**Date:** 2026-02-20
**Scope:** 5 deliverables (excluding ElizaOS/Virtuals plugins)
**Foundation:** Phase 0 commit `0dc0739`

---

## Deliverables

### 1. Cross-Chain Reputation Aggregator

Polls ERC-8004 Reputation Registry events across all configured chains via viem, builds unified reputation scores per agent.

**New file:** `offchain/src/services/reputationAggregator.ts`

- `ReputationAggregator` singleton class
- `startIndexing(intervalMs=60000)` -- periodic polling loop per chain
- `indexChain(chainId)` -- reads `FeedbackSubmitted` events via viem `getLogs` from last-indexed block
- `getUnifiedScore(agentId)` -- weighted average across chains (weight = feedbackCount per chain)
- `getCrossChainReputation(agentId)` -- per-chain breakdown with scores, counts, last-updated
- In-memory `Map<string, Map<string, ChainReputationData>>` (agentId -> chainId -> data)
- Tracks `lastIndexedBlock` per chain to avoid re-scanning

**New v2 endpoints in `lucidLayerRoutes.ts`:**
- `GET /v2/reputation/:agentId` -- unified cross-chain score
- `GET /v2/reputation/:agentId/breakdown` -- per-chain detail with individual feedbacks

### 2. Receipt-Based Reputation Model

Computes objective, Sybil-resistant reputation from verified receipts rather than subjective votes.

**New file:** `offchain/src/services/receiptReputationService.ts`

- `computeReceiptReputation(agentId)` -- scans receipt store for agent's receipts as compute or model provider
- Score components (weights):
  - Volume: receipt count (0.25)
  - Reliability: validation pass rate (0.35)
  - Performance: normalized TTFT + tokens throughput (0.25)
  - Consistency: 1 - coefficient of variation of latencies (0.15)
- `ReceiptReputationScore` type: `{ overall, components, receiptCount, validatedCount, avgTtftMs, p95TtftMs, periodDays }`
- `submitReceiptReputation(chainId, agentTokenId)` -- pushes computed score to on-chain Reputation Registry via EVMAdapter
- `getReceiptReputation(agentId)` -- returns cached score

**New v2 endpoint:**
- `GET /v2/reputation/:agentId/receipt-based` -- receipt-derived reputation

### 3. Multi-Party Payout Splits via x402

Extends payout calculation to execute actual USDC transfers on EVM chains.

**Modified:** `offchain/src/services/payoutService.ts`
- Add `executePayoutSplit(runId, chainId)` -- reads calculated split, creates ERC-20 USDC transfer txs via EVMAdapter, submits batch
- Add `PayoutExecution` type with tx hashes per recipient

**Modified:** `offchain/src/middleware/x402.ts`
- Add `spentProofs: Set<string>` for replay protection
- Reject already-used tx hashes

**New v2 endpoint:**
- `POST /v2/payouts/execute` -- triggers on-chain USDC settlement for a run_id on a given chain

### 4. Multi-Chain Deploy Configuration

Hardhat deploy scripts for LucidValidator across all 13 ERC-8004 chains.

**New files:**
- `contracts/scripts/deploy.ts` -- single-chain deploy with constructor args
- `contracts/scripts/deploy-all.ts` -- iterate all chains, deploy + verify + output addresses

**Modified:** `contracts/hardhat.config.ts`
- Add remaining networks: arbitrum, avalanche, polygon, monad, megaeth + testnets

### 5. @lucid/8004-sdk TypeScript SDK

Developer-facing SDK wrapping all Lucid APIs. Zero dependencies beyond fetch.

**New package:** `sdk/lucid-8004-sdk/`

```
package.json
tsconfig.json
src/
  index.ts          -- LucidLayer class (main entry, re-exports)
  client.ts         -- HTTP client (fetch-based, browser + node)
  types.ts          -- Public SDK types
  x402.ts           -- Auto-payment helper (detects 402, pays, retries)
  routing.ts        -- route() + match() wrappers
  validation.ts     -- validate() + verify() wrappers
  reputation.ts     -- reputation() + breakdown() wrappers
  payouts.ts        -- payout calculate/execute wrappers
```

**Public API:**
```typescript
const lucid = new LucidLayer({
  baseUrl: 'https://api.lucidlayer.com',
  chainId: 'apechain',
  apiKey?: string,
  x402?: { privateKey, autoPayment: true }
});

// Routing
const route = await lucid.route({ model, policy });
const match = await lucid.match({ modelMeta, computeCatalog, policy });

// Validation
const result = await lucid.validate({ receiptHash?, runId? });
const proof = await lucid.getProof(runId);

// Reputation
const score = await lucid.reputation(agentId);
const breakdown = await lucid.reputationBreakdown(agentId);

// Payouts
const split = await lucid.payouts.calculate({ computeWallet, totalAmount, ... });
const execution = await lucid.payouts.execute(runId, chainId);

// Inference (with auto-receipt)
const result = await lucid.infer({ endpoint, messages });

// Chat completions (OpenAI-compatible)
const completion = await lucid.chat({ model, messages });
```

---

## Wiring Changes

**`offchain/src/index.ts`:**
- Import and initialize `ReputationAggregator`
- Start indexing on server boot if `REPUTATION_INDEXING_ENABLED=true`

**`offchain/src/routes/lucidLayerRoutes.ts`:**
- Add reputation aggregator endpoints
- Add receipt-based reputation endpoint
- Add payout execution endpoint
