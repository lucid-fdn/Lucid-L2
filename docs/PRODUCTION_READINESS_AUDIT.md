# Lucid-L2 Production Readiness Audit

**Date:** 2026-03-12
**Scope:** Core truth layer (engine + gateway-lite + SDK + on-chain programs)
**Out of scope:** `packages/contrib/`, `agent-services/`, frontend (separate audit)

---

## Scope Boundaries

### In Scope (Ship-Blocking)

Everything under these paths is part of the core product:

```
offchain/packages/engine/src/       # Truth library
offchain/packages/gateway-lite/src/ # Express API server
offchain/packages/sdk/src/          # Developer SDK
programs/                           # 6 Solana Anchor programs
contracts/src/                      # EVM smart contracts
infrastructure/migrations/          # SQL migrations
```

### Out of Scope (Contrib / Experimental)

`packages/contrib/` contains third-party integrations that are **not part of the core product**. They are optional, behind interfaces, and can be enabled/disabled independently. Do not block ship on these.

```
packages/contrib/
  integrations/
    flowspec/        # Visual workflow → n8n compiler (stub)
    hf/              # HuggingFace model sync
    hyperliquid/     # DeFi trading integration
    mcp-server/      # MCP tool server
    n8n/             # n8n workflow gateway
    oauth/           # Nango OAuth management
  protocols/
    hyperliquid/     # Hyperliquid protocol adapter
    privy/           # Privy auth protocol adapter
  providers/
    llm.ts           # LLM provider routing
    mock.ts          # Mock provider (test)
    openai.ts        # OpenAI provider
    router.ts        # Provider router
```

Also out of scope:

- `packages/engine/src/runtime/` — Runtime adapters (CrewAI, LangGraph, Docker, Vercel AI, Google ADK, OpenClaw, OpenAI Agents) are behind `IRuntimeAdapter` interface, used by the agent orchestrator. Experimental — the orchestrator itself is not ship-blocking.
- `packages/gateway-lite/src/agent/` — Agent planner/orchestrator (CrewAI integration). Experimental.
- `frontend/` — Separate audit needed; currently no tests, `any` types in API layer.
- `agent-services/` — Standalone microservices, not part of core API.

---

## Overall Score: ~70% Production-Ready

---

## Feature Status Matrix

### 1. Core Truth Layer

| Component | Status | Gaps |
|-----------|--------|------|
| Receipt creation + Ed25519 signing | **PROD** | `updateReceiptsWithAnchor()` stub — receipts don't track their anchor TX |
| Receipt verification + Merkle proofs | **PROD** | None |
| Epoch lifecycle (open → anchored) | **PROD** | No distributed lock for multi-instance |
| Epoch anchoring (multi-chain) | **PROD** | No compensation if one chain fails |
| MMR / Merkle tree | **PROD** | None |
| Crypto (hash, sign, canonical JSON) | **PROD** | Keys in env (no HSM), no rotation API |
| Schema validation (AJV) | **PROD** | None |
| Database pool + retry | **PROD** | Pool size hardcoded (10) |

### 2. Chain Adapters — Solana vs EVM Parity

| Capability | Solana | EVM | Notes |
|-----------|--------|-----|-------|
| Epoch commitment | ✅ FULL | ✅ FULL | Parity |
| Passport registry | ✅ FULL | ✅ FULL | Parity |
| Escrow | ⚠️ CONFIG-GATED | ⚠️ CONFIG-GATED | Both require program/contract config |
| Agent wallet | ⚠️ CONFIG-GATED (PDA) | ⚠️ CONFIG-GATED (TBA) | Different paradigms, same capabilities |
| Session keys | ⚠️ CONFIG-GATED | ⚠️ CONFIG-GATED | Both implemented |
| Gas/burn | ✅ gas_utils CPI | N/A | Solana-only concept |
| zkML verification | ❌ NONE (no alt_bn128) | ✅ FULL (ecPairing) | Hardware limitation |
| ERC-4337 paymaster | N/A | ✅ FULL | EVM-only concept |
| Identity registry | ❌ STUB (throws) | ⚠️ CONFIG-GATED | Phase 3 |
| Validation registry | ❌ STUB (throws) | ⚠️ CONFIG-GATED | Phase 3 — see note below |
| NFT mint | ✅ Token2022 + Metaplex | ✅ ERC-721 + TBA | Parity |
| NFT burn / updateMetadata | ❌ THROWS (Token2022) / ✅ Metaplex | ❌ THROWS | Gap on both (except Metaplex) |

**Note on Validation:** The proof/validation *system* is complete end-to-end:
- `receiptService` creates + signs + verifies receipts with Merkle inclusion proofs
- `LucidDBProvider` and `LucidOnChainProvider` both implement `submitValidation()`
- `POST /v2/validate` endpoint wired and working
- `IValidationAdapter` on EVM is the on-chain ERC-8004 contract wrapper (Phase 3 extra, not a blocker)

### 3. Payment & Financial System

| Component | Status | Gaps |
|-----------|--------|------|
| x402 middleware (402 flow) | **PROD** | Sync spent cache process-local (restart = replay window) |
| DirectFacilitator (on-chain verify) | **PROD** | None |
| CoinbaseFacilitator | **STUB** | No real API endpoint |
| PayAIFacilitator | **STUB** | No real API endpoint |
| Spent proofs store (Redis/memory) | **PROD** | Fail-closed ✓ |
| Pricing service (DB-backed) | **PROD** | No payout_address format validation |
| Split resolver (70/20/10) | **PROD** | Hardcoded Base USDC address |
| Payment grants (Ed25519 signed) | **PROD** | Grant budget enforcement not wired to middleware |
| Payment epoch service | **PROD** | `parseFloat()` precision loss on large sums |
| Revenue service | **PROD** | No settlement trigger |
| **Payout execution** | **STUB** | Treasury address placeholder, EVM decimal mismatch |
| **Escrow service** | **STUB** | No on-chain TX submission |
| **Dispute service** | **STUB** | Fully stubbed, in-memory only |
| Revenue airdrop | **PARTIAL** | Solana-only; float rounding in share calc |
| Share token (DirectMint) | **PROD** | Token-2022 working |
| Share token (Genesis) | **STUB** | Metaplex Genesis API doesn't exist |

### 4. Identity & NFT

| Component | Status | Gaps |
|-----------|--------|------|
| Identity bridge (CAIP-10) | **PROD** | Working |
| TBA service (ERC-6551) | **PROD** | No cache TTL |
| ERC-7579 modules | **PARTIAL** | Module state in-memory only |
| Paymaster service | **STUB** | Exchange rate hardcoded, balance returns '0' |
| NFT mint (all providers) | **PROD** | Working across Token2022, Metaplex, EVM |
| NFT burn / updateMetadata | ❌ | Only Metaplex Core supports it |
| Metaplex reputation plugin | **PREP** | Code exists, never called — awaiting MIP #52 |

### 5. Reputation

| Component | Status | Gaps |
|-----------|--------|------|
| DB provider | **PROD** | 76 tests |
| On-chain provider (Solana) | **PROD** | 11 anchor tests |
| Solana 8004 syncer | **PROD** | Agents only |
| EVM 8004 syncer | **PARTIAL** | Untested against real contracts |
| SATI syncer | **STUB** | Awaiting partner API |
| SAID syncer | **STUB** | Awaiting partner API |
| Reputation aggregator | **PARTIAL** | In-memory store, native merge flaky |
| Scoring algorithms (3) | **PARTIAL** | No route to select/switch |

### 6. Agent Deployment

| Deployer | Status | Retry | Timeout | Logs |
|----------|--------|-------|---------|------|
| Docker | **PROD** | N/A | N/A | ✅ |
| Railway | **PARTIAL** | ❌ | ✅ 5min | ❌ stub |
| Akash | **PARTIAL** | ❌ | ✅ | ❌ stub |
| Phala | **PARTIAL** | ❌ | ❌ | ❌ stub |
| io.net | **PARTIAL** | ❌ | ❌ | ❌ stub |
| Nosana | **PARTIAL** | ⚠️ polling | ❌ | ❌ stub |
| ImageBuilder | **PROD** | N/A | N/A | N/A |

**Cross-cutting gap:** No retry/backoff, no error classification, no timeout guards on 4/6 deployers.

### 7. Gateway Middleware & Routes

| Component | Status | Gaps |
|-----------|--------|------|
| Admin auth (API key + IP) | **PROD** | Rate limit in-memory; no RBAC |
| HMAC auth | **PROD** | Nonce dedup in-memory |
| Inference pipeline | **PARTIAL** | Receipt fire-and-forget (lost on crash) |
| Compute registry | **PARTIAL** | In-memory 30s TTL, no persistence |
| Matching engine | **PROD** | Scoring weights hardcoded |
| Policy engine | **PROD** | Tested, deterministic |
| A2A protocol | **PARTIAL** | Agent card + discovery work, task routing incomplete |

### 8. SDK

| Namespace | Status |
|-----------|--------|
| passport | **PROD** |
| receipt | **PROD** |
| epoch | **PROD** |
| agent (deploy, wallet, a2a) | **PROD** |
| payment | **PROD** |
| deploy | **PROD** |
| crypto | **PROD** |
| chain | **PROD** |
| identity | **PROD** |
| reputation | **PROD** |
| marketplace | **WIP** (excluded, needs DB persistence) |

### 9. Test Coverage

| Area | Tests | Status |
|------|-------|--------|
| Offchain (engine + gateway) | 73 suites, 1272 tests | ✅ All passing |
| Solana programs | 5/6 have Anchor tests | ⚠️ `lucid_reputation` missing Anchor tests |
| EVM contracts | 11 Hardhat test files | ✅ |
| Frontend | 0 tests | ❌ |
| SDK | 29 tests | ✅ |

### 10. Infrastructure

| Area | Status | Gaps |
|------|--------|------|
| CI/CD (GitHub Actions) | **PARTIAL** | Type-check + test + lint; no deploy jobs |
| SQL migrations | **PROD** | All tables covered |
| OpenAPI spec | **PROD** | 104 endpoints documented |
| Environment docs | **PROD** | `.env.example` complete |

---

## Production Blockers (Must Fix Before Ship)

| # | Issue | Severity | File |
|---|-------|----------|------|
| 1 | Payout treasury address is placeholder string | 🔴 CRITICAL | `payoutService.ts:46` |
| 2 | Escrow + Dispute services fully stubbed | 🔴 CRITICAL | `escrowService.ts`, `disputeService.ts` |
| 3 | EVM payout decimal mismatch (lamports ≠ USDC) | 🔴 CRITICAL | `payoutService.ts:409` |
| 4 | No retry/circuit-breaker on deployers | 🟡 HIGH | All 5 cloud deployers |
| 5 | Receipt fire-and-forget (lost on crash) | 🟡 HIGH | `executionGateway.ts` |
| 6 | No distributed locks (epoch race conditions) | 🟡 HIGH | `epochService.ts` |
| 7 | Grant budget not enforced in middleware | 🟡 HIGH | `paymentAuth.ts` ↔ `paymentEventService.ts` |

---

## Decided Removals

| Component | Reason | Date |
|-----------|--------|------|
| Cross-chain bridge (LayerZero OFT) | Incomplete: hardcoded quotes, in-memory receipts, no dest chain confirmation | 2026-03-12 |
| MarketplaceService | Moved to `_wip/` — needs DB persistence | 2026-03-12 |

---

## Chain Parity Summary

```
                        Solana          EVM
                        ──────          ───
Epoch anchoring         ✅ FULL         ✅ FULL
Passport registry       ✅ FULL         ✅ FULL
Agent wallet            ✅ PDA          ✅ TBA (ERC-6551)
Session keys            ✅ FULL         ✅ FULL
Escrow lifecycle        ⚠️  GATED       ⚠️  GATED
Revenue splits          ✅ gas_utils    ✅ PayoutModule
Reputation on-chain     ✅ FULL         ✅ ERC-8004
Receipt validation      ✅ FULL         ✅ FULL
NFT minting             ✅ FULL         ✅ FULL
NFT burn/update         ❌ Token2022    ❌ EVM          (Metaplex ✅)
Identity registry       ❌ STUB         ⚠️  GATED       (Phase 3)
zkML verification       ❌ HW LIMIT     ✅ FULL
Paymaster (ERC-4337)    N/A             ✅ FULL
ERC-7579 modules        N/A             ✅ PARTIAL
Payout execution        ❌ STUB         ❌ STUB         (gap on BOTH)
```

**Solana-only gaps:** Identity registry (Phase 3), zkML (hardware)
**Both-chain gaps:** NFT burn/update, payout execution
**EVM-only features:** Paymaster, ERC-7579 (by design)
