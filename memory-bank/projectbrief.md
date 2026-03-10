# Project Brief: Lucid

## What Lucid Is

Lucid is a **verifiable AI execution layer** — blockchain-anchored infrastructure that gives AI assets (models, agents, tools, compute, datasets) provable identity, cryptographic receipts, and reputation backed by real traffic data.

## Two-Repo Architecture

| Repo | Purpose | License |
|------|---------|---------|
| **Lucid-L2** (this repo) | Open-source truth layer — Solana programs, offchain engine, Next.js frontend | Open source |
| **lucid-plateform-core** | Proprietary gateway — TrustGate, MCPGate, Control-Plane, Oracle | Private |

Bridge: `@raijinlabs/passport` shared npm package + receipt_events consumed via DB.

## Core Thesis

Every AI interaction produces a verifiable receipt. Those receipts become the foundation for reputation, payment, and governance — not self-reported metrics or synthetic benchmarks, but real traffic data flowing through the gateway.

## Strategic Position: Metaplex Partnership

**Partner with Metaplex for identity. Build our own reputation/validation.**

| Layer | Owner | Why |
|-------|-------|-----|
| **Identity** (who you are) | Metaplex Core / MIP #52 | They're the Solana NFT standard. Don't fight it. |
| **Reputation** (are you trustworthy) | Lucid | Gateway traffic data is our moat. No one else has it. |
| **Validation** (can you prove it) | Lucid | Cryptographic receipts + MMR proofs + on-chain anchoring. |

### What Lucid Adds Beyond Metaplex

Metaplex handles agents. Lucid extends identity to **all AI assets**:

- **Models** — inference passports with provider routing
- **Compute** — GPU/CPU nodes with heartbeat + health monitoring
- **Tools** — MCP tools with schema validation
- **Datasets** — provenance tracking
- **Agents** — orchestration + deployment to 6 platforms

### Bidirectional Reputation Mesh

Lucid doesn't just consume external reputation — it feeds back:

```
External Providers  <-->  Lucid Reputation Engine
  ERC-8004 (Solana)  <-->  Pull scores + Push validated scores
  ERC-8004 (EVM)     <-->  Pull scores + Push validated scores
  SATI               <-->  Pull trust + Push traffic-backed trust
  SAID               <-->  Pull identity + Push verified identity
```

**The pitch to Metaplex:** MIP #52 gives agents identity. Lucid gives ALL AI assets identity + proven reputation backed by real traffic data.

## On-Chain Programs (6 Solana Programs)

1. `thought_epoch` — MMR root commitment (single/batch/v2)
2. `lucid_passports` — AI asset registry + x402 payment gating
3. `gas_utils` — Token burn/split CPI + on-chain distribution
4. `lucid_agent_wallet` — PDA wallets, policy, escrow, splits, sessions
5. `lucid_zkml_verifier` — Groth16 proof verification + bloom dedup
6. `lucid_reputation` — On-chain reputation (feedback, validation, revocation)
