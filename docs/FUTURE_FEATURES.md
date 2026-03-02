# Future Features — Deferred from Phase 3

These features were designed and prototyped as offchain services (with 559 passing tests) but the corresponding Solidity contracts are deferred. They add value only when the ecosystem has real demand for trustless, on-chain enforcement.

## Why Deferred

The core Lucid product works without these. The offchain backend already handles escrow, disputes, paymaster, identity, TBA, modules, and zkML via REST APIs. The Solidity contracts would replace the backend as the trust authority — useful for decentralization, but premature without an active agent economy.

## Features

### 1. Agent Escrow Protocol (LucidEscrow.sol)

**What it does:** Time-locked fund holding for agent-to-agent jobs. Deposits tokens, releases on receipt verification via LucidValidator, refunds on timeout.

**When to build:** When agents are autonomously transacting with each other and need trustless payment guarantees.

**Offchain service:** `escrowService.ts` — exists, tested, encodes calldata via EVMAdapter.

---

### 2. Automated Dispute Resolution (LucidArbitration.sol)

**What it does:** Multi-phase arbitration when escrows are contested. Evidence submission, automated ruling (receipt verification + MMR proof), optional appeal with $LUCID stake.

**When to build:** When escrow disputes actually happen. Depends on escrow having real users.

**Offchain service:** `disputeService.ts` — exists, tested.

---

### 3. ERC-4337 Paymaster (LucidPaymaster.sol)

**What it does:** Sponsors gas for ERC-4337 UserOperations, deducting $LUCID from the agent's wallet instead of ETH. Includes exchange rate oracle and max cost limits.

**When to build:** When $LUCID token is live and agents are submitting on-chain transactions frequently enough that gas costs in ETH are a friction point.

**Offchain service:** `paymasterService.ts` — exists, tested.

---

### 4. ERC-7579 Smart Account Modules

**What they do:** Three installable modules for ERC-7579 compatible wallets (Safe, Kernel, Biconomy):

| Module | Type | Purpose |
|--------|------|---------|
| LucidPolicyModule | Validator | Restrict operations to allowed policy hashes |
| LucidPayoutModule | Executor | Automatic revenue splits across recipients |
| LucidReceiptModule | Executor | Emit structured receipt events on-chain |

**When to build:** When ERC-4337 smart account adoption is widespread enough that users want Lucid capabilities as installable wallet plugins.

**Offchain service:** `erc7579Service.ts` — exists, tested.

---

### 5. zkML Proof Integration (ZkMLVerifier.sol)

**What it does:** On-chain Groth16 verifier for model inference proofs. Registers model circuits (verifying keys), verifies proofs that a specific model produced a specific output. Uses the ecPairing precompile.

**When to build:** When real zkML circuits exist (via EZKL or similar). The current offchain service is a mock — it generates placeholder proofs, not real cryptographic proofs. Building the on-chain verifier without real circuits to verify is pointless.

**Offchain service:** `zkmlService.ts` — exists, tested, but mock proof generation.

---

## What's Needed First

Before any of these contracts matter:

1. **Active agent economy** — Agents autonomously transacting (escrow, disputes)
2. **$LUCID token live** — On mainnet with real liquidity (paymaster)
3. **Smart account adoption** — Users on ERC-4337 wallets (modules)
4. **Real zkML circuits** — EZKL integration producing actual Groth16 proofs (zkML)
5. **Demand signal** — Users asking for trustless on-chain enforcement vs. trusting the backend

## Original Plan Reference

The full design for these features is in `docs/plans/` and the active plan file. The offchain implementations are in:
- `offchain/packages/engine/src/finance/` (escrow, disputes)
- `offchain/packages/engine/src/identity/paymaster/` (paymaster)
- `offchain/packages/engine/src/identity/erc7579/` (modules)
- `offchain/packages/gateway-lite/src/integrations/zkml/` (zkML)
