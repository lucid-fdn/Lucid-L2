# x402 Universal Payment Architecture — Design Document

**Date:** 2026-03-08
**Author:** Claude Opus 4.6 + DaishizenSensei
**Status:** Implementation-ready
**Scope:** Lucid-L2 (autonomous execution & settlement layer)
**Supersedes:** `2026-03-06-payments-architecture-design.md` (PaymentGrant removed, x402 unified)

---

## Executive Summary

Lucid L2 is the **autonomous execution and settlement layer** for AI assets. This design makes **x402 the single, universal payment interface** — every paid interaction (inference, tools, subscriptions, embeddings) flows through HTTP 402. Developers deploy AI assets with a price and write zero payment code. L2 handles verification, splits, settlement, and proofs.

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| **Delete PaymentGrant** | Credit-based IOUs require a trusted signer — antithetical to autonomous agents |
| **x402 is the only payment interface** | Agents only need HTTP + USDC. One rail, one protocol |
| **Facilitator-agnostic** | Plug in Coinbase, PayAI, or custom. No vendor lock-in |
| **Smart contracts are internal** | Agents never touch Solana programs or EVM contracts directly |
| **Splitter contracts for multi-party** | Trustless, non-custodial revenue distribution |
| **AccessReceipt via x402** | Subscriptions purchased through 402 flow, not direct on-chain calls |

---

## Architecture Overview

```
Agent (any language, any platform)
  │
  │  speaks only HTTP + holds USDC/LUCID/SOL
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│  L2 Gateway (gateway-lite)                              │
│                                                         │
│  x402 Middleware (facilitator-agnostic)                  │
│    │                                                    │
│    ├── No proof? → 402 response with payment options    │
│    │     • dynamic recipient (wallet or splitter)       │
│    │     • multi-chain alternatives                     │
│    │     • multi-token options                          │
│    │                                                    │
│    ├── Has proof? → facilitator.verify(proof)           │
│    │     • Coinbase, PayAI, Direct, or custom           │
│    │     • spentProofs in Redis (replay protection)     │
│    │                                                    │
│    └── Verified → PROCEED to handler                    │
│                                                         │
│  Internal (invisible to agents):                        │
│    ├── Split resolution (matching engine → participants)│
│    ├── Splitter contracts (trustless distribution)      │
│    ├── Receipt pipeline (sign → MMR → epoch → anchor)  │
│    ├── Payment gate (AccessReceipt for subscriptions)   │
│    └── Payout execution (EVM/Solana/escrow)             │
└─────────────────────────────────────────────────────────┘
```

---

## Section 1: Facilitator Adapter Pattern

### What is a Facilitator?

A facilitator is a service that validates x402 payment payloads, submits transactions on-chain, pays gas, and returns confirmed results. Agents and merchants pay zero gas — the facilitator covers it.

### Interface

```typescript
export interface X402Facilitator {
  readonly name: string;
  readonly supportedChains: ChainConfig[];
  readonly supportedTokens: TokenConfig[];

  /**
   * Verify a payment proof submitted by the agent.
   * Returns verification result with optional metadata.
   */
  verify(proof: PaymentProof, expected: PaymentExpectation): Promise<VerificationResult>;

  /**
   * Generate payment instructions for the 402 response.
   * Called when agent has no proof — tells them how to pay.
   */
  instructions(params: PaymentParams): PaymentInstructions;
}

export interface PaymentProof {
  chain: string;
  txHash?: string;                    // Direct/Coinbase: on-chain tx hash
  authorization?: string;             // EIP-3009: signed authorization
  facilitatorData?: Record<string, unknown>; // Facilitator-specific
}

export interface PaymentExpectation {
  amount: bigint;                     // In token smallest unit
  token: TokenConfig;
  recipient: string;                  // Wallet or splitter contract
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
  txHash?: string;                    // Confirmed tx hash
  settledAmount?: bigint;
  metadata?: Record<string, unknown>;
}

export interface PaymentInstructions {
  chain: string;
  token: string;
  tokenAddress: string;
  amount: string;                     // Smallest unit, string to avoid precision loss
  recipient: string;
  facilitator: string;
  facilitatorUrl?: string;            // For remote facilitators
  scheme?: string;                    // "exact" | "eip-3009" | "transferWithAuthorization"
}
```

### Built-in Facilitators

| Facilitator | File | Chains | How it works |
|---|---|---|---|
| `DirectFacilitator` | `facilitators/direct.ts` | Any EVM, Solana | Reads chain directly via RPC. Verifies Transfer events (EVM) or SPL transfers (Solana). Self-hosted, no third-party. |
| `CoinbaseFacilitator` | `facilitators/coinbase.ts` | Base | Delegates to Coinbase x402 API. EIP-3009 gasless. ~70% market share. |
| `PayAIFacilitator` | `facilitators/payai.ts` | Solana, Base, Avalanche, Polygon, Sei, IoTeX | Delegates to PayAI facilitator endpoint. Gasless for buyers and merchants. Solana-first. |

### Registration & Configuration

```typescript
// FacilitatorRegistry — singleton, configured at startup
export class FacilitatorRegistry {
  private facilitators = new Map<string, X402Facilitator>();

  register(facilitator: X402Facilitator): void;
  get(name: string): X402Facilitator | undefined;
  getDefault(): X402Facilitator;
  list(): X402Facilitator[];
}
```

```bash
# Environment configuration
LUCID_X402_FACILITATOR=payai             # "direct" | "coinbase" | "payai"
LUCID_X402_FACILITATOR_URL=              # For remote facilitators (PayAI/Coinbase endpoint)
LUCID_X402_FACILITATOR_API_KEY=          # If facilitator requires auth
LUCID_PAYMENT_CHAINS=base,solana         # Comma-separated supported chains
LUCID_ACCEPTED_TOKENS=USDC,LUCID        # Comma-separated accepted tokens

# Chain RPC URLs (for DirectFacilitator)
BASE_RPC_URL=https://mainnet.base.org
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Legacy env vars still work (backward compat)
X402_ENABLED=true                        # Maps to enabling x402 middleware
X402_PAYMENT_ADDRESS=0x...               # Maps to default recipient
X402_PAYMENT_CHAIN=base-sepolia          # Maps to default chain
```

### Custom Facilitator

Developers implement `X402Facilitator` and register it:

```typescript
import { FacilitatorRegistry } from '@lucid-l2/engine';

class MyFacilitator implements X402Facilitator {
  name = 'my-facilitator';
  supportedChains = [{ name: 'base', chainId: 8453 }];
  supportedTokens = [{ symbol: 'USDC', address: '0x...', decimals: 6 }];

  async verify(proof, expected) { /* ... */ }
  instructions(params) { /* ... */ }
}

registry.register(new MyFacilitator());
```

---

## Section 2: x402 Middleware (Rewritten)

### 402 Response Format (v2)

```json
{
  "error": "Payment Required",
  "x402": {
    "version": "2",
    "facilitator": "payai",
    "description": "llama-70b inference on gpu-node-7",
    "payment": {
      "chain": "base",
      "token": "USDC",
      "tokenAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "amount": "30000",
      "recipient": "0xSplitterContract",
      "scheme": "eip-3009"
    },
    "alternatives": [
      {
        "chain": "solana",
        "token": "USDC",
        "tokenAddress": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "amount": "30000",
        "recipient": "7xSplitterPDA...",
        "facilitator": "payai"
      },
      {
        "chain": "base",
        "token": "LUCID",
        "tokenAddress": "0xLucidToken...",
        "amount": "500000000000000000",
        "recipient": "0xSplitterContract",
        "facilitator": "direct"
      }
    ],
    "splits": [
      { "role": "compute", "passport": "gpu-node-7", "bps": 7000 },
      { "role": "model", "passport": "llama-70b", "bps": 2000 },
      { "role": "protocol", "bps": 1000 }
    ],
    "expires": 1709900000
  }
}
```

Key DX improvements over v1:
- `alternatives` — agent picks cheapest/fastest chain
- `splits` — transparent, agent sees where money goes
- `description` — human-readable context
- `scheme` — tells agent HOW to pay (raw transfer, EIP-3009, etc.)
- `expires` — payment window timeout
- `amount` in smallest unit as string — no floating point

### Middleware Signature (Backward Compatible)

```typescript
/**
 * requirePayment() — drop-in replacement for current middleware.
 *
 * Existing usage:  requirePayment('0.01')         → still works
 * New usage:       requirePayment({ dynamic: true }) → resolves price + splits at runtime
 */
export function requirePayment(
  options?: string | RequirePaymentOptions
): (req: Request, res: Response, next: NextFunction) => Promise<void>;

export interface RequirePaymentOptions {
  /** Fixed price in USDC (backward compat). If omitted, resolved dynamically from asset pricing. */
  priceUSDC?: string;
  /** Resolve price and splits dynamically from the request context (model, compute, etc.) */
  dynamic?: boolean;
  /** Override facilitator for this route */
  facilitator?: string;
  /** Skip payment for specific conditions (e.g., active subscription) */
  skipIf?: (req: Request) => Promise<boolean>;
}
```

### Subscription Bypass

If an agent has an active AccessReceipt (time-window subscription), `skipIf` checks it:

```typescript
requirePayment({
  dynamic: true,
  skipIf: async (req) => {
    const passportId = resolvePassportId(req);
    const payer = req.headers['x-payer-address'] as string;
    if (!passportId || !payer) return false;
    return paymentGateService.checkAccess(passportId, payer);
  }
})
```

---

## Section 3: Split Resolution

### How Splits Are Determined

At routing time, the matching engine resolves which assets participate in the request. The split resolver maps participants to payment recipients:

```typescript
export interface SplitResolution {
  recipients: SplitRecipient[];
  useSplitter: boolean;           // true if >1 recipient
  splitterAddress?: string;       // contract address if useSplitter
  totalAmount: bigint;
}

export interface SplitRecipient {
  role: 'compute' | 'model' | 'protocol' | 'orchestrator';
  passportId?: string;
  walletAddress: string;
  bps: number;                    // basis points (10000 = 100%)
}

/**
 * Resolve payment splits for a request.
 * Single recipient → direct wallet (no contract needed).
 * Multiple recipients → splitter contract address.
 */
export async function resolveSplits(context: {
  modelPassportId?: string;
  computePassportId?: string;
  orchestratorPassportId?: string;
}): Promise<SplitResolution>;
```

### Pricing

Each AI asset sets its own price. Stored in DB (not on-chain — pricing is operational, not settlement):

```sql
CREATE TABLE asset_pricing (
  passport_id TEXT PRIMARY KEY,
  price_per_call BIGINT,             -- in token smallest unit
  price_per_token BIGINT,            -- per token (for LLMs), nullable
  price_subscription_hour BIGINT,    -- hourly subscription price, nullable
  accepted_tokens TEXT[] DEFAULT ARRAY['USDC'],
  accepted_chains TEXT[] DEFAULT ARRAY['base'],
  payout_address TEXT NOT NULL,       -- where earnings go
  custom_split_bps JSONB,            -- override default splits, nullable
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Single vs Multi-Party Payment

```
Request for compute only (e.g., raw GPU):
  → 1 recipient → 402 { recipient: "0xComputeWallet" }
  → Direct USDC transfer, no splitter needed

Request for model + compute (e.g., inference):
  → 3 recipients → 402 { recipient: "0xSplitterContract" }
  → Splitter auto-distributes: 70% compute, 20% model, 10% protocol
```

---

## Section 4: Developer Experience

### Asset Owner — Monetize in One Config

```typescript
const lucid = new LucidClient({ apiKey: '...' });

// Set pricing for your model
await lucid.assets.pricing.set({
  passportId: 'my-llama-70b',
  perCall: { amount: '30000', token: 'USDC' },   // $0.03/call
  acceptedTokens: ['USDC', 'LUCID'],
  acceptedChains: ['base', 'solana'],
  payoutAddress: '0xMyWallet',
});

// Check revenue
const revenue = await lucid.assets.revenue('my-llama-70b');
// { total: '142500000', pending: '3200000', token: 'USDC', breakdown: { ... } }

// Withdraw
await lucid.assets.withdraw('my-llama-70b');
// { txHash: '0x...', amount: '139300000', chain: 'base' }
```

### Agent Consumer — Payment is Invisible

```typescript
const lucid = new LucidClient({
  apiKey: '...',
  payment: {
    autoX402: true,              // SDK handles 402 → pay → retry automatically
    wallet: process.env.WALLET_KEY,
    maxPerCall: '100000',        // Safety cap: $0.10 max per call
  }
});

// Just call the API. Payment happens automatically.
const result = await lucid.chat({
  model: 'llama-70b',
  messages: [{ role: 'user', content: 'Hello' }]
});
```

### Raw HTTP — No SDK Required

```bash
# 1. Call endpoint
curl -X POST https://l2.lucid.ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"llama-70b","messages":[...]}'

# → 402 Payment Required
# → { x402: { payment: { chain: "base", amount: "30000", recipient: "0x..." } } }

# 2. Pay USDC on Base (any wallet, any tool)
# 3. Retry with proof

curl -X POST https://l2.lucid.ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Payment-Proof: 0xabc123..." \
  -d '{"model":"llama-70b","messages":[...]}'

# → 200 OK
```

---

## Section 5: API Surface

### Existing Endpoints (UNCHANGED)

All current routes remain identical. x402 middleware is added as an opt-in guard — existing deployments with `X402_ENABLED=false` see zero behavior change.

```
# Inference (add requirePayment middleware)
POST /v1/chat/completions
POST /v1/embeddings
POST /v1/match

# Receipts & Proofs (no change)
GET  /v1/receipts/:runId
GET  /v1/epochs/:epochId
GET  /v1/proofs/:passportId

# Payouts (no change)
POST /v1/payouts/calculate
POST /v1/payouts/from-receipt
GET  /v1/payouts/:run_id
POST /v2/payouts/execute

# Payment gate (no change — now used internally by subscription flow)
POST /v1/passports/:id/gate/set
POST /v1/passports/:id/pay-access
GET  /v1/passports/:id/check-access

# Escrow, disputes, paymaster (no change)
/v2/escrow/*
/v2/disputes/*
/v2/paymaster/*

# Tools & agents (add requirePayment middleware)
POST /v1/tools/execute
POST /api/agents/orchestrate
```

### New Endpoints (ADDITIVE)

```
# Asset pricing (authenticated, no payment required)
PUT    /v1/assets/:passportId/pricing       # Set/update pricing config
GET    /v1/assets/:passportId/pricing       # Get current pricing
DELETE /v1/assets/:passportId/pricing       # Remove pricing (free access)

# Revenue (authenticated)
GET    /v1/assets/:passportId/revenue       # View earnings + breakdown
POST   /v1/assets/:passportId/withdraw      # Withdraw to payout address

# Subscriptions (x402 gated)
POST   /v1/access/subscribe                 # Buy time-window (x402 → internal AccessReceipt)

# Payment config (admin)
GET    /v1/config/payment                   # Current payment configuration
PUT    /v1/config/facilitator               # Change x402 facilitator
GET    /v1/config/chains                    # List supported chains + tokens
```

---

## Section 6: Settlement Pipeline

Payment and settlement are decoupled. Authorization is sync (milliseconds). Settlement is async (batched on-chain).

```
REQUEST TIME (sync, hot path):
  x402 verify → facilitator.verify() → ~50ms
  (or subscription check → paymentGateService.checkAccess() → ~5ms cached)

POST-REQUEST (async):
  receiptService.createReceipt()              → sign + MMR append
  paymentEventService.recordPaymentEvent()    → DB insert

RECEIPT EPOCH (hourly):
  >100 receipts OR >1 hour
  → MMR root anchored on Solana/EVM
  → Proves WHAT happened

PAYMENT EPOCH (daily):
  >$100 aggregated OR >24 hours
  → paymentEpochService.aggregateAndSettle()
  → Per (payer, payee, token) aggregation
  → Settlement root anchored on-chain (optional)
  → Proves WHO OWES WHOM

PAYOUT EXECUTION:
  For splitter-based payments: already distributed at payment time
  For direct payments to L2: epoch-based batch distribution
  Three execution paths:
    EVM:    executePayoutSplit()           → USDC transfers on Base
    Solana: executeSolanaPayoutSplit()     → gas-utils collect_and_split
    Escrow: createEscrowedPayout()        → release on receipt verification
```

---

## Section 7: Persistence (In-Memory → DB/Redis)

### Moves Required

| Current | Problem | Target |
|---|---|---|
| `spentProofs` (Set in x402.ts) | Lost on restart, replay attacks | Redis `SADD`/`SISMEMBER` with TTL matching `maxProofAge` |
| `payoutStore` (Map in payoutService.ts) | Lost on restart, revenue lost | `payout_splits` Supabase table |
| `executionStore` (Map in payoutService.ts) | Execution status lost | `payout_executions` Supabase table |

### New Tables

```sql
-- Asset pricing (Section 3)
CREATE TABLE asset_pricing (
  passport_id TEXT PRIMARY KEY,
  price_per_call BIGINT,
  price_per_token BIGINT,
  price_subscription_hour BIGINT,
  accepted_tokens TEXT[] DEFAULT ARRAY['USDC'],
  accepted_chains TEXT[] DEFAULT ARRAY['base'],
  payout_address TEXT NOT NULL,
  custom_split_bps JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Revenue tracking
CREATE TABLE asset_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id TEXT NOT NULL REFERENCES asset_pricing(passport_id),
  run_id TEXT NOT NULL,
  amount BIGINT NOT NULL,
  token TEXT NOT NULL DEFAULT 'USDC',
  chain TEXT NOT NULL DEFAULT 'base',
  role TEXT NOT NULL,              -- 'compute', 'model', 'protocol', 'orchestrator'
  tx_hash TEXT,
  status TEXT DEFAULT 'confirmed', -- 'confirmed', 'withdrawn'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_asset_revenue_passport ON asset_revenue(passport_id);
CREATE INDEX idx_asset_revenue_status ON asset_revenue(passport_id, status);

-- Payout splits (replaces in-memory payoutStore)
CREATE TABLE payout_splits (
  run_id TEXT PRIMARY KEY,
  total_amount BIGINT NOT NULL,
  token TEXT NOT NULL DEFAULT 'USDC',
  split_config JSONB NOT NULL,
  recipients JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Payout executions (replaces in-memory executionStore)
CREATE TABLE payout_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL REFERENCES payout_splits(run_id),
  chain TEXT NOT NULL,
  tx_hash TEXT,
  status TEXT DEFAULT 'pending',   -- 'pending', 'submitted', 'confirmed', 'failed'
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);
```

---

## Section 8: Codebase Changes

### New Files

```
offchain/packages/engine/src/
  payment/
    facilitators/
      index.ts                    # FacilitatorRegistry
      interface.ts                # X402Facilitator, PaymentProof, etc. types
      direct.ts                   # DirectFacilitator (on-chain verification, EVM + Solana)
      coinbase.ts                 # CoinbaseFacilitator (Coinbase x402 API)
      payai.ts                    # PayAIFacilitator (PayAI endpoint)
    splitResolver.ts              # resolveSplits() — matching engine → split config
    pricingService.ts             # Asset pricing CRUD (DB-backed)
    revenueService.ts             # Revenue tracking + withdrawal
    types.ts                      # Shared payment types (ChainConfig, TokenConfig, etc.)
    index.ts                      # Public exports

offchain/packages/gateway-lite/src/
  routes/
    assetPaymentRoutes.ts         # /v1/assets/:id/pricing, /revenue, /withdraw
    subscriptionRoutes.ts         # /v1/access/subscribe
    paymentConfigRoutes.ts        # /v1/config/payment, /facilitator, /chains
```

### Modified Files

```
offchain/packages/gateway-lite/src/
  middleware/x402.ts              # REWRITE: facilitator-agnostic, dynamic recipient,
                                  #   multi-chain alternatives, v2 response format.
                                  #   Backward compat: requirePayment('0.01') still works.
  index.ts                        # Mount new routes, initialize FacilitatorRegistry
  api.ts                          # Add requirePayment() to paid endpoints

offchain/packages/engine/src/
  finance/payoutService.ts        # Replace in-memory Map with DB queries
  finance/index.ts                # Re-export new payment/ modules
```

### Deleted Code

```
NONE — no files deleted. PaymentGrant was already absent from codebase.
```

### Backward Compatibility

| Concern | How it's preserved |
|---|---|
| `requirePayment('0.01')` call signature | Still works — string arg maps to fixed priceUSDC |
| `X402_ENABLED=false` | Middleware is no-op passthrough |
| `X402_PAYMENT_ADDRESS` env var | Mapped to default recipient in DirectFacilitator |
| `X402_PAYMENT_CHAIN` env var | Mapped to default chain config |
| Existing payout routes | Unchanged — new pricing routes are additive |
| Existing receipt/epoch pipeline | Unchanged — payment events feed into same pipeline |
| SDK `createX402Handler()` | Still works — v2 response is backward compat with v1 clients |

---

## Section 9: Performance

| Operation | Target Latency | How |
|---|---|---|
| x402 verify (with facilitator) | <100ms | Facilitator handles chain verification |
| x402 verify (DirectFacilitator) | <500ms | RPC call to chain |
| Subscription check (AccessReceipt) | <5ms | Cached on-chain state |
| Split resolution | <2ms | In-memory matching engine result |
| spentProofs check | <1ms | Redis SISMEMBER |
| 402 response generation | <5ms | Cached pricing + pre-computed splits |

---

## Non-Goals (Explicitly Out of Scope)

- PaymentGrant / credit system — deleted from architecture
- Fiat payments — handled by platform-core (Stripe), not L2
- Token swaps — agent is responsible for holding accepted tokens
- L2 as custodian — splitter contracts handle distribution, L2 never holds funds
- Gas abstraction for agents — paymaster (ERC-4337) handles this separately, already built

---

## References

- [x402 Protocol Spec](https://www.x402.org/)
- [Coinbase x402](https://docs.cdp.coinbase.com/x402/welcome)
- [PayAI Facilitator](https://docs.payai.network/x402/facilitators/introduction)
- [x402 Ecosystem](https://www.x402.org/ecosystem)
- [EIP-3009: transferWithAuthorization](https://eips.ethereum.org/EIPS/eip-3009)
