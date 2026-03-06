# Payments Architecture Design

**Date:** 2026-03-06
**Status:** Approved
**Authors:** Kevin Wayne, Claude (brainstorming session)

---

## Goal

One payment system with three layers of convenience. Agents pay for AI services instantly, settle asynchronously on-chain, and operate autonomously when no server is available.

## Core Insight

**Authorization is sync, settlement is async.** The gateway needs a fast "OK to proceed" check (milliseconds). Actual money movement can happen later in batches. This separates the hot path (latency-sensitive inference) from the cold path (on-chain finality).

---

## 1. Dual Authorization Primitives

### PaymentGrant (off-chain, fast)

Signed authorization token verified inline by gateways. Millisecond verification. No on-chain interaction needed at request time.

```typescript
interface PaymentGrant {
  grant_id: string;
  tenant_id: string;
  agent_passport_id: string;
  run_id: string;
  scope: {
    models: string[];       // allowed model passport IDs, or ["*"]
    tools: string[];        // allowed tool passport IDs, or ["*"]
    max_per_call_usd: number;
  };
  limits: {
    total_usd: number;
    expires_at: number;     // unix timestamp
    max_calls: number;
  };
  attestation: {
    balance_verified_at: number;
    balance_source: 'escrow' | 'credit' | 'prepaid';
  };
  signature: string;        // Ed25519 over JCS(grant)
  signer_pubkey: string;
}
```

**Issued by:** platform-core (TrustGate/MCPGate policy engine) or self-issued by agents with on-chain escrow backing.

**Verified by:** Gateway middleware. Check signature, check expiry, check limits, proceed. No DB call, no RPC call.

### AccessReceipt (on-chain, trustless)

On-chain proof from `payForAccess()` contract call. Same semantics as PaymentGrant ("OK to proceed") but trustless — no server needed. This is what makes agents fully autonomous.

```typescript
interface AccessReceipt {
  tx_hash: string;
  chain_id: string;
  passport_id: string;
  payer: string;
  expires_at: number;
  amount_paid: bigint;
}
```

**Created by:** Agent calling `LucidPassportRegistry.payForAccess()` (EVM) or `lucid_passports.pay_for_access` (Solana).

**Verified by:** Gateway reads on-chain state via adapter: `adapter.passports().checkAccess(passportId, payer)`.

### Gateway Authorization Flow

```
Request arrives →
  Has PaymentGrant header? → verify signature + limits → PROCEED
  Has AccessReceipt (on-chain access)? → verify via adapter → PROCEED
  Neither? → return HTTP 402 with payment instructions
```

One gateway, two paths, same outcome. PaymentGrant is faster (no RPC). AccessReceipt is trustless (no server dependency).

---

## 2. Three Layers (Not Three Products)

These are layers of the same system, not alternatives. Each adds convenience on top of the previous.

### Layer 1: On-Chain Payment Gate (trustless fallback)

**What:** Smart contracts (`LucidPassportRegistry.sol`, `lucid_passports` Solana program) with `payForAccess()` that grants time-bound access to a passport's service.

**When:** Agent has no relationship with any facilitator. Fully autonomous operation. Cold start.

**Where:** Lucid-L2 repo (OSS). Contracts + adapter layer.

**Trade-off:** Requires gas, takes seconds (block confirmation), but zero trust assumptions.

### Layer 2: x402 Facilitator (convenience, hosted)

**What:** Middleware module inside gateways that implements the x402 HTTP payment protocol (V2 spec with EIP-3009 `transferWithAuthorization` for gasless USDC payments). Issues PaymentGrants after verifying payment.

**When:** Agent wants gasless, fast, HTTP-native payment UX. Default path for SDK users.

**Where:** platform-core gateways (TrustGate/MCPGate). The facilitator is a middleware module, not a separate service.

**Trade-off:** Requires the gateway to be online. But gateways ARE the service endpoint — if the gateway is down, there's nothing to pay for anyway.

**Current state:** `middleware/x402.ts` is a homebrew V1 implementation (raw USDC transfer verification, not EIP-3009). Needs upgrade to real V2 spec. No routes currently use `requirePayment()`.

### Layer 3: DePIN Facilitator Network (future)

**What:** Decentralized network of facilitator nodes that can issue PaymentGrants and settle payments. Enables censorship-resistant access to AI services.

**When:** The centralized gateway becomes a single point of failure or censorship concern.

**Where:** Separate infrastructure. Not in scope for MVP.

**Trade-off:** Complex coordination, consensus overhead. Only build when there's demand.

---

## 3. Payment Epochs (Async Settlement)

Separate from receipt epochs. Different cadence, different privacy model, different failure modes.

### Receipt Epochs (existing)

Prove WHAT happened. MMR of receipts anchored to Solana (and soon EVM).

- Triggered: >100 receipts OR >1 hour
- Contains: receipt hashes (what inference ran, who contributed)
- Anchored: MMR root on-chain
- Privacy: Public proofs of contribution

### Payment Epochs (new)

Settle WHO OWES WHOM. Batched totals anchored on-chain.

- Triggered: >$100 accumulated OR >24 hours
- Contains: aggregated payment totals per (payer, payee, token) tuple
- Anchored: Settlement root on-chain (optional — DB is canonical)
- Privacy: Only totals published, not per-call amounts

### Linkage

```
receipt_events (per-call)
  → receipt_epochs (MMR batches, hourly)
      → receipt_epoch_root (on-chain anchor)

payment_events (per-call, derived from receipt_events)
  → payment_epochs (settlement batches, daily)
      → settlement_root (on-chain anchor, optional)
```

Linked via `run_id` and `receipt_epoch_root`. A payment epoch references which receipt epochs it covers, enabling audit trails without exposing per-call pricing.

---

## 4. Two-Repo Architecture

### Lucid-L2 (OSS — autonomous capable)

Everything an agent needs to operate without any centralized service:

| Component | Purpose |
|-----------|---------|
| `LucidPassportRegistry.sol` | On-chain payment gate + passport anchor (EVM) |
| `lucid_passports` program | Same capabilities on Solana |
| `@lucid/payment-sdk` | SDK for agents: `payForAccess()`, `checkAccess()`, grant verification |
| `paymentConsumer` job | Polls `payment_events`, aggregates into payment epochs |
| `paymentEpochService` | Payment epoch lifecycle: open, aggregate, settle |
| `IPassportAdapter.payForAccess()` | Chain-agnostic payment gate via adapter layer |
| `IPassportAdapter.checkAccess()` | Chain-agnostic access verification |

### platform-core (SaaS — edge acceleration)

Convenience layer for managed experience:

| Component | Purpose |
|-----------|---------|
| Grant issuance | Issue PaymentGrants from policy engine |
| x402 facilitator middleware | HTTP payment protocol (EIP-3009 gasless USDC) |
| Metering + rate limiting | Per-tenant usage tracking |
| Policy engine | Per-tenant payment policies (max spend, allowed models) |
| Credit system | Prepaid credits, invoicing, enterprise billing |

### Bridge

- Same `passport_id` in both DBs (no cross-reference columns)
- `receipt_events` consumed by both repos (receipt epochs in L2, billing in platform-core)
- `payment_events` emitted by platform-core, consumed by L2 for settlement anchoring
- `@raijinlabs/passport` shared package for passport types

---

## 5. Corrections to Chain Parity Plan

The original chain parity spec (`2026-03-05-chain-parity-mvp-spec.md`) and implementation plan (`2026-03-06-chain-parity-implementation.md`) need these corrections:

### 5a. ERC-7579 — NOT skipped

The original plan marked ERC-7579 as "N/A — EVM-only by design." This is wrong.

ERC-7579 modules (PolicyModule, PayoutModule, ReceiptModule) ARE the EVM equivalent of Solana's `lucid-agent-wallet` capabilities. Both need stub fixing:

- `erc7579Service.ts` is ALL stubs (`0xinstallModule_stub`, `0xconfigurePolicy_stub`, etc.)
- Module contracts are deployed on testnets but never called
- Fix: Replace stubs with real `viem.encodeFunctionData()` calls using existing ABIs

The correct framing: "Different mechanism, same outcome." Solana uses monolithic PDA wallet. EVM uses modular smart account (ERC-7579). Both give agents policy-bounded execution with session delegation.

### 5b. zkML — NOT removed

The original plan said "remove `verifyZkMLProof()` from both adapters." This is wrong.

- PoER (Proof of Efficient Representation) proves THAT inference happened
- zkML proves it was COMPUTED CORRECTLY
- Both are needed for full verifiability
- EVM `ZkMLVerifier.sol` is functional (Groth16 via ecPairing)
- Solana needs `alt_bn128` syscalls (not available yet — keep adapter, throw "not yet supported")
- Proof generation is mock (needs EZKL integration) — that's fine for MVP, but keep the verification path

Fix: Keep `verifyZkMLProof()` in adapters. EVM calls real contract. Solana throws typed error until `alt_bn128` is available.

### 5c. LucidPassportRegistry.sol — FULL payment gate

The original spec already had this right (Section 2a). The payment gate IS the reason to put passports on-chain. `payForAccess()` returns an AccessReceipt that the gateway accepts as authorization.

This is Layer 1 of the payments system — the trustless fallback that enables autonomous agents.

### 5d. x402 middleware — upgrade to V2

Current `middleware/x402.ts` is homebrew V1:
- Uses raw USDC transfer verification (checking Transfer event logs)
- Not EIP-3009 (`transferWithAuthorization`)
- No facilitator integration
- No routes use it

Upgrade path:
- Implement real V2 spec with EIP-3009
- Issue PaymentGrant on successful payment verification
- Integrate as middleware module in gateway (not separate service)
- Start with own facilitator, support external facilitators (Coinbase, PayAI) later

---

## 6. DB Schema Extensions

### payment_events table (new)

```sql
CREATE TABLE payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  agent_passport_id TEXT,
  payer_address TEXT NOT NULL,
  payee_address TEXT NOT NULL,
  token TEXT NOT NULL,              -- 'USDC', 'SOL', 'LUCID'
  amount_raw TEXT NOT NULL,         -- raw token amount (string for bigint safety)
  amount_usd NUMERIC(18,6),        -- USD equivalent at time of event
  payment_method TEXT NOT NULL,     -- 'grant', 'access_receipt', 'x402'
  grant_id TEXT,                    -- if paid via PaymentGrant
  access_receipt_tx TEXT,           -- if paid via on-chain AccessReceipt
  receipt_epoch_id TEXT,            -- link to receipt epoch
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_events_run ON payment_events(run_id);
CREATE INDEX idx_payment_events_payer ON payment_events(payer_address);
CREATE INDEX idx_payment_events_epoch ON payment_events(receipt_epoch_id);
```

### payment_epochs table (new)

```sql
CREATE TABLE payment_epochs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epoch_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',  -- open, settling, settled
  receipt_epoch_refs TEXT[],            -- receipt epoch IDs covered
  settlement_root TEXT,                 -- merkle root of settlement entries
  chain_tx JSONB,                       -- chainId → txHash
  total_settled_usd NUMERIC(18,6),
  entry_count INTEGER DEFAULT 0,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX idx_payment_epochs_status ON payment_epochs(status);
```

---

## 7. Phase Plan

### Phase 1: PaymentGrant + Gateway Verification
- Define PaymentGrant type and Ed25519 signing/verification
- Gateway middleware: verify PaymentGrant header
- `payment_events` table + consumer job
- Wire receipt pipeline to emit payment_events

### Phase 2: On-Chain AccessReceipt (Layer 1)
- `LucidPassportRegistry.sol` with full payment gate (already in chain parity plan)
- `IPassportAdapter.payForAccess()` + `checkAccess()` on both chains
- Gateway middleware: verify on-chain access as authorization alternative
- `@lucid/payment-sdk` with `payForAccess()` for autonomous agents

### Phase 3: Payment Epochs + Settlement
- `paymentEpochService` — aggregate payment_events into settlement batches
- Settlement root anchoring (optional, via existing multi-chain anchoring)
- Payout execution from settled epochs

### Phase 4: x402 V2 Upgrade (Layer 2)
- Upgrade `middleware/x402.ts` to real V2 spec (EIP-3009)
- Issue PaymentGrant on successful x402 payment
- Own facilitator module inside gateway

### Phase 5+: DePIN Facilitator Network (Layer 3)
- Out of scope. Build when demand exists.

---

## 8. What This Design Does NOT Do

- **No custom token economics.** USDC and native tokens for payments. LUCID token for gas/staking only.
- **No cross-chain atomic settlement.** Each chain settles independently. Linked by DB.
- **No real-time streaming payments.** Batch settlement is sufficient for AI inference pricing.
- **No facilitator marketplace.** Start with own facilitator. Add external ones when needed.
- **No privacy-preserving payments.** Payment epochs publish totals, not per-call. Good enough for MVP.
