<p align="center">
  <h1 align="center">Lucid Layer - Internet of AI</h1>
  <p align="center">
    <strong>Autonomous AI Infrastructure.</strong>
    <br />
    Everything an AI agent needs to exist, think, act, earn, and prove — without human intervention.
    <br />
    Identity. Memory. Compute. Deployment. Payments. Reputation. Verification.
    <br />
    All on-chain. All autonomous. All open.
  </p>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License" /></a>
  <a href="#testing"><img src="https://img.shields.io/badge/tests-1,683%20passing-brightgreen" alt="Tests" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Solana-devnet-purple" alt="Solana" /></a>
  <a href="#"><img src="https://img.shields.io/badge/EVM-Base%20%7C%20Ethereum-blue" alt="EVM" /></a>
  <a href="#"><img src="https://img.shields.io/badge/DePIN-Akash%20%7C%20Phala%20%7C%20io.net%20%7C%20Nosana-orange" alt="DePIN" /></a>
</p>

---

## Why Lucid Exists

AI agents are becoming autonomous economic actors. They make decisions, call APIs, spend money, hire other agents, and operate 24/7. But today, they can't:

- **Prove who they are** — no verifiable identity
- **Remember what they learned** — memory locked in platforms
- **Choose where to run** — tied to a single cloud provider
- **Earn and spend** — no wallet, no payment rails
- **Build a reputation** — no track record from real usage
- **Deploy themselves** — dependent on human operators

**Lucid gives agents the full stack to operate autonomously.**

```
Agent creates passport (on-chain identity)
  → Selects its own runtime (CrewAI, LangGraph, Vercel AI, OpenAI Agents...)
  → Auto-deploys to DePIN (Akash, Phala, io.net, Nosana)
  → Owns its memory (local-first SQLite, portable, provable)
  → Earns revenue (x402 payments, revenue splits, share tokens)
  → Builds reputation (from real traffic, synced on-chain)
  → Every action gets a cryptographic receipt → batched into epochs → anchored on-chain
  → Fully verifiable. Fully autonomous. No human in the loop.
```

**The vision:** AI agents that don't need human interaction anymore. Lucid is the infrastructure that makes that possible.

### The Internet of AI

The internet has two layers: **protocols** (TCP/IP, DNS, HTTP) and **edge infrastructure** (Cloudflare, AWS, Akamai). AI needs the same.

| Internet | Lucid | What it does |
|----------|-------|-------------|
| TCP/IP | **Lucid Layer** (this repo) | The open protocol. The complete autonomous AI infrastructure — identity, memory, compute, deployment, payments, reputation, verification. Everything an agent needs to exist and operate independently. Runs anywhere. No vendor lock-in. |
| Cloudflare | **Lucid Cloud** (managed service) | The fully managed, performant, accelerated edge layer on top of Lucid Layer. Not just dashboards — it runs every protocol operation faster, at scale, globally. |

**Lucid Layer** is the open-source engine — the protocol specification and reference implementation. It defines how AI assets get identity, how agents store memory, how compute is matched, how payments flow, and how every action is cryptographically verified. It's designed to run independently, on any infrastructure, without depending on any centralized service.

**Lucid Cloud** is the fully managed acceleration layer for Lucid Layer — the Cloudflare of AI. Just as Cloudflare doesn't replace HTTP but makes it faster, cached, secured, and globally distributed, Lucid Cloud takes everything the protocol does and runs it at production scale: accelerated inference routing (TrustGate), edge tool dispatch (MCPGate), managed deployment orchestration, fleet-wide observability, real-time reputation scoring, automated billing and settlement, and enterprise-grade security. It's the entire Lucid Layer protocol, fully managed, globally performant, with zero operational overhead.

**Lucid Oracle** is the intelligence layer — real-time feeds derived from live agent traffic flowing through Lucid Cloud: Model Intelligence, Tool Health, Agent Reputation, Capability Index, and Safety Signals. Data that only exists because of the network.

Together, they form the **Internet of AI**: an open protocol anyone can build on, managed infrastructure that makes it production-ready, and live intelligence feeds that make agents smarter.

### Progressive Decentralization

Every layer of this stack is designed to become fully decentralized. Identity and verification are already on-chain. Memory is already agent-owned. Compute already runs on DePIN. Progressively — through R&D and partnerships with DePIN networks, chain infrastructure teams, and the open-source community — the remaining coordination logic moves from centralized services to trustless on-chain execution.

---

## Status

Lucid Layer is in active development. Some features are production-ready, others are being built in the open.

| Feature | Status | Notes |
|---------|--------|-------|
| Identity (passports, NFT, wallets) | **Production** | Solana + EVM, Metaplex Core, ERC-6551 TBA |
| Receipts + epochs + MMR proofs | **Production** | Ed25519 signing, multi-chain anchoring |
| Agent memory (6 types, semantic recall) | **Production** | Local-first SQLite, hash-chained, DePIN snapshots |
| Deployment control plane (3 phases) | **Production** | 6 deployers, reconciler, blue-green, rollback |
| Payments (x402, revenue splits, escrow) | **Production** | 3 facilitators, dynamic pricing, share tokens |
| Reputation (on-chain + off-chain) | **Production** | ERC-8004 sync, composite scoring |
| Anchoring / DePIN (7 artifact types) | **Production** | Arweave + Lighthouse, unified dispatcher |
| Solana programs (6) | **Devnet** | Deployed, tested, auditing in progress |
| EVM contracts (17) | **Testnet** | Base Sepolia, Hardhat tests passing |
| Solana ↔ EVM full parity | **In progress** | Session keys + escrow adapter gaps remaining |
| zkML on-chain verification | **Partial** | EVM full, Solana off-chain only (no alt_bn128) |
| Lucid Cloud | **Private beta** | TrustGate, MCPGate, fleet orchestration |

See [CLAUDE.md](CLAUDE.md) for detailed architecture and chain parity breakdown.

---

## Table of Contents

- [The Internet of AI](#the-internet-of-ai)
- [Status](#status)
- [The Autonomous Stack](#the-autonomous-stack)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [On-Chain Programs](#on-chain-programs)
- [Deployment Control Plane](#deployment-control-plane)
- [Agent Memory (MemoryMap v3)](#agent-memory-memorymap-v3)
- [Payments & Economics](#payments--economics)
- [Anchoring & DePIN](#anchoring--depin)
- [API Reference](#api-reference)
- [SDK](#sdk)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Contributing](#contributing)
- [License](#license)

---

## The Autonomous Stack

Every capability an AI agent needs to operate end-to-end without human intervention:

| Layer | What | How | Routes |
|-------|------|-----|--------|
| **Identity** | Verifiable passport for any AI asset | On-chain registry (Solana + EVM), Metaplex NFT, CAIP-10 | `/v1/passports/*` |
| **Inference** | OpenAI-compatible execution | Policy-based compute matching, heartbeat registry | `/v1/chat/completions`, `/v1/models` |
| **Memory** | Agent-owned, portable, provable | Local-first SQLite, 6 memory types, semantic recall, hash-chained | `/v1/memory/*` |
| **Compute** | Self-selected runtime + provider | 7 adapters (CrewAI, LangGraph, Vercel AI...) + 6 DePIN deployers | `/v1/compute/*`, `/v1/match` |
| **Deployment** | Auto-deploy to decentralized infra | Blue-green rollout, reconciler, lease manager, webhook ingestion | `/v1/agents/*` |
| **Payments** | Earn and spend autonomously | x402 protocol, revenue splits, share tokens, escrow | `/v1/assets/*/pricing`, `/v1/payouts` |
| **Reputation** | Trust score from real traffic | On-chain + off-chain, ERC-8004 sync, composite scoring | Chain routes |
| **Verification** | Cryptographic proof of every action | Ed25519 receipts, MMR epochs, multi-chain anchoring | `/v1/receipts/*`, `/v1/epochs/*` |
| **Storage** | Permanent decentralized archival | Arweave (permanent) + Lighthouse (evolving), unified CID registry | `/v1/anchors/*` |

**171 API endpoints.** One SDK. Full agent autonomy.

---

## Quick Start

### Docker (recommended)

```bash
cp offchain/.env.example offchain/.env
# Edit offchain/.env with your values

docker compose up
# API running on http://localhost:3001
```

### From source

```bash
cd offchain && npm install
cp .env.example .env
npm start              # API on :3001
npm test               # 103 suites, 1,683 tests
```

### Solana programs

```bash
solana-test-validator --reset --quiet &
anchor build
anchor test            # 6 programs, Mocha
```

---

## Architecture

<table>
<tr>
<td width="50%">

### Two-Package Monorepo

```
offchain/packages/
  engine/         Truth library (crypto, receipts,
                  chains, memory, deploy, reputation)
  gateway-lite/   Express API server (thin routes)
  sdk/            Developer SDK
```

**Dependency rule:** `gateway-lite → engine` (OK). `engine → gateway-lite` (forbidden, ESLint-enforced).

</td>
<td width="50%">

### 4-Layer Architecture

| Layer | Where | Stores |
|-------|-------|--------|
| **L1 Commitment** | Solana / EVM | Roots, proofs, anchors |
| **L2 Data Availability** | Arweave / Lighthouse | Payloads, bundles, snapshots |
| **L3 Operational** | Supabase | Index, jobs, projections |
| **L4 Product** | Lucid Cloud | Dashboards, APIs, UX |

**Key rule:** L3 is operational state, never canonical truth. Rebuild from L1+L2 if needed.

</td>
</tr>
</table>

### Decentralization Principle

> **Lucid Layer is the protocol — not the execution authority.** Agents run on decentralized providers. Memory is agent-owned. Identity is on-chain. Lucid coordinates — it doesn't own.

Every design decision supports [progressive decentralization](#progressive-decentralization). Interfaces are swappable. State is rebuildable from chain + DePIN. Centralized components can be replaced without rewriting the system.

| Layer | Today | Trajectory |
|-------|-------|-----------|
| **Identity** | On-chain (Solana + EVM) | Done |
| **Memory** | Agent-owned SQLite | Agent-owned + decentralized storage |
| **Compute** | DePIN (Akash, Phala, io.net, Nosana) | Fully decentralized marketplace |
| **Verification** | Receipts + epochs on-chain | Done |
| **Matching** | Centralized policy engine | On-chain matching protocol |
| **Settlement** | Centralized batch settlement | On-chain automated settlement |
| **Reputation** | Hybrid (on-chain + off-chain) | Fully on-chain reputation mesh |
| **Routing** | Centralized gateway (Lucid Cloud) | Decentralized routing network |

---

## On-Chain Programs

### Solana (6 Anchor programs)

| Program | Devnet ID | Purpose |
|---------|-----------|---------|
| `thought_epoch` | `8QXiFjgu...` | MMR root commitment (single/batch/v2) |
| `lucid_passports` | `38yaXUez...` | AI asset registry + x402 payment gating |
| `gas_utils` | `EzuUhxtn...` | Token burn/split CPI + on-chain distribution |
| `lucid_agent_wallet` | `AJGpTWXb...` | PDA wallets, policy, escrow, splits, sessions |
| `lucid_zkml_verifier` | `69cJRFGW...` | Groth16 zkML proof verification + bloom dedup |
| `lucid_reputation` | `4FWEH1XQ...` | On-chain reputation (feedback, validation, revocation) |

### EVM (17 Solidity contracts)

Full chain parity with Solana: `EpochRegistry`, `LucidPassportRegistry`, `LucidEscrow`, `LucidTBA` (ERC-6551), `ZkMLVerifier`, `LucidPaymaster` (ERC-4337), `LucidSessionManager` (ERC-6909), and 3 ERC-7579 modules (Policy, Payout, Receipt).

Multi-chain epoch anchoring via `ANCHORING_CHAINS` env (e.g., `solana-devnet,base`).

---

## Deployment Control Plane

Production-grade lifecycle management for AI agents across 6 cloud providers.

### 6 Deployers

| Target | Type | GPU | Scale | Lease |
|--------|------|-----|-------|-------|
| **Railway** | Managed PaaS | No | Partial | Unlimited |
| **Akash** | DePIN | Yes (6 types) | Yes | Deposit-based |
| **Phala** | TEE (Confidential) | Yes | No | Unlimited |
| **io.net** | DePIN GPU | Yes (6 types) | Yes | 24h (auto-extend) |
| **Nosana** | Solana GPU | Yes (6 markets) | Yes | INFINITE |
| **Docker** | Local | No | No | N/A |

### 7 Runtime Adapters

Vercel AI SDK, CrewAI, LangGraph, OpenAI Agents, OpenClaw, Google ADK, Docker.

### Control Plane (3 phases, shipped)

| Phase | What | Status |
|-------|------|--------|
| **Phase 1** | Durable state (`deployments` + `deployment_events`), status machine, optimistic locking | Shipped |
| **Phase 2** | Reconciler (60s polling, drift detection), LeaseManager, Webhook ingestion (5 providers) | Shipped |
| **Phase 3** | Blue-green rollout (slot promotion), rollback, secrets abstraction (`ISecretsResolver`) | Shipped |

```
Deploy flow:
  create record (pending) → transition (deploying) → call provider
  → success: transition (running) + events
  → failure: transition (failed) + events
  → reconciler detects drift → auto-repair
```

**Routes:**
```
POST /v1/agents/deploy                    Deploy agent
POST /v1/agents/:id/deploy/blue-green     Blue-green deploy
POST /v1/agents/:id/promote               Promote blue → primary
POST /v1/agents/:id/rollback              Rollback to previous
POST /v1/agents/:id/terminate             Terminate
GET  /v1/agents/:id/status                Live status
GET  /v1/agents/:id/events                Deployment audit trail
POST /v1/webhooks/:provider               Provider callbacks
```

**CLI:**
```bash
npm run cli deploy <passport_id> <target>
npm run cli deploy status <passport_id>
npm run cli deploy logs <passport_id>
npm run cli deploy list
npm run cli deploy terminate <passport_id>
```

---

## Agent Memory (MemoryMap v3)

Local-first, portable, provable agent memory. Each agent owns its data in SQLite — not the platform.

### 6 Memory Types

| Type | Purpose | Key Fields |
|------|---------|------------|
| **Episodic** | Conversation turns | session_id, role, turn_index, tokens |
| **Semantic** | Extracted facts | fact, confidence, source_memory_ids |
| **Procedural** | Learned rules | rule, trigger, priority |
| **Entity** | Knowledge graph | entity_name, entity_type, relationships |
| **Trust-Weighted** | Cross-agent trust | source_agent, trust_score, decay_factor |
| **Temporal** | Time-bounded facts | valid_from, valid_to |

### Key Capabilities

- **3 store backends:** SQLite (per-agent, default), Postgres (fleet), InMemory (test)
- **Semantic recall:** Two-stage vector search + metadata reranking
- **Hash-chained:** Every write is SHA-256 chained per `(agent, namespace)`
- **4 memory lanes:** self, user, shared, market
- **Tiered compaction:** hot → warm → cold with lane-aware policies
- **DePIN snapshots:** Export/restore via Arweave/Lighthouse
- **Async embeddings:** Background worker (hybrid event + polling)

### Routes

```
POST /v1/memory/episodic              Add episodic memory
POST /v1/memory/semantic              Add semantic memory
POST /v1/memory/recall                Two-stage semantic recall
POST /v1/memory/compact               Trigger compaction
POST /v1/memory/snapshots             Create DePIN snapshot
POST /v1/memory/snapshots/restore     Restore (replace/merge/fork)
POST /v1/memory/verify                Hash chain integrity check
GET  /v1/memory/health                Store diagnostics
```

---

## Anchoring & DePIN

Unified interface for permanent storage of cryptographic artifacts. No feature touches DePIN directly — everything goes through the Anchoring Control Plane.

```
Any feature → AnchorDispatcher.dispatch() → IDepinStorage → AnchorRegistry
```

### 7 Artifact Types

| Producer | Artifact | Storage |
|----------|----------|---------|
| Epoch archiver | `epoch_bundle` | Arweave (permanent) |
| Anchoring service | `epoch_proof` | Arweave (permanent) |
| Memory archive | `memory_snapshot` | Lighthouse (evolving) |
| Agent deploy | `deploy_artifact` | Arweave (permanent) |
| Passport sync | `passport_metadata` | Arweave (permanent) |
| Passport manager | `nft_metadata` | Arweave (permanent) |
| MMR checkpoint | `mmr_checkpoint` | Lighthouse (evolving) |

Content-addressed (SHA-256), deduplicated, with parent lineage tracking.

---

## Payments & Economics

Agents earn, spend, and manage revenue autonomously.

### x402 Payment Protocol

```
Agent calls paid API → Server returns HTTP 402 + payment instructions
  → Agent pays USDC on-chain → Retries with X-Payment-Proof header
  → Server verifies → Access granted
```

Three facilitators (Direct, Coinbase, PayAI). Dynamic per-asset pricing. Replay protection via spent proof dedup.

### Revenue Splits

Default: 70% compute / 20% model / 10% protocol (configurable per-asset in basis points). Settled via `PaymentEpochService` batch settlement.

### Share Tokens (Fractional Ownership)

Any AI asset can launch a share token. Revenue airdrops proportionally to holders. Launchers: DirectMint (SPL Token-2022), Genesis (Metaplex TGE), Mock.

### Agent Wallets

PDA wallets on Solana, ERC-6551 TBA on EVM. Policy-constrained spending limits, escrow, multi-sig. Agents can hold, send, and receive tokens autonomously.

---

## API Reference

171 endpoints. Full spec in [`openapi.yaml`](openapi.yaml).

| Group | Endpoints | What agents use it for |
|-------|-----------|----------------------|
| **Identity** | `/v1/passports/*` | Register as a verifiable AI asset |
| **Inference** | `/v1/chat/completions`, `/v1/models` | Execute AI workloads |
| **Memory** | `/v1/memory/*` | Store, recall, compact, snapshot memories |
| **Deployment** | `/v1/agents/*` | Self-deploy, blue-green, rollback, terminate |
| **Payments** | `/v1/assets/*/pricing`, `/v1/payouts` | Set pricing, earn revenue, split payouts |
| **Compute** | `/v1/compute/nodes/*`, `/v1/match` | Heartbeat, discover compute, policy matching |
| **Receipts** | `/v1/receipts/*` | Create cryptographic proofs of actions |
| **Epochs** | `/v1/epochs/*` | Batch receipts, anchor on-chain |
| **Anchoring** | `/v1/anchors/*` | Permanent DePIN storage + verification |
| **Reputation** | Chain routes | Query on-chain + off-chain trust scores |
| **Webhooks** | `/v1/webhooks/:provider` | Receive provider lifecycle callbacks |

---

## SDK

```typescript
import { Lucid } from '@lucid-l2/sdk';

const lucid = Lucid.fromEnv();

// Create an AI asset passport
const passport = await lucid.passport.create({
  type: 'agent',
  meta: { name: 'MyAgent', capabilities: ['chat', 'code'] }
});

// Deploy to Akash with GPU
await lucid.deploy.create(passport.id, {
  target: 'akash',
  gpu: 'a100',
  adapter: 'vercel-ai'
});

// Store agent memory
await lucid.memory.addEpisodic(passport.id, {
  content: 'User asked about pricing',
  role: 'user',
  session_id: 'session-001'
});

// Two-stage semantic recall
const memories = await lucid.memory.recall(passport.id, {
  query: 'What did the user ask about?',
  top_k: 5
});

// Create and verify receipts
const receipt = await lucid.receipt.create({ passport_id: passport.id });
const proof = await lucid.receipt.prove(receipt.id);
```

---

## Testing

```bash
cd offchain && npm test              # 103 suites, 1,683 tests
cd offchain && npm run type-check    # TypeScript compilation
anchor test                          # 6 Solana programs (Mocha)
```

| Suite | Tests | Coverage |
|-------|-------|----------|
| Engine (control plane, memory, anchoring, receipts) | ~1,400 | Core logic |
| Gateway-lite (routes, middleware) | ~280 | API layer |
| Solana programs | 11+ | On-chain integration |

**CI/CD:** GitHub Actions on every push + PR — type-check + full test suite.

---

## Project Structure

```
Lucid-L2/
├── programs/              6 Solana Anchor programs (Rust)
├── contracts/             17 EVM contracts (Solidity)
├── offchain/
│   └── packages/
│       ├── engine/        Truth library — identity, memory, receipts,
│       │                  epochs, payments, compute, deployment,
│       │                  anchoring, reputation, shared infra
│       ├── gateway-lite/  Express API — 54 route files, middleware,
│       │                  providers, protocols, integrations
│       └── sdk/           Developer SDK
├── schemas/               14 JSON validation schemas
├── frontend/              Next.js dashboard
├── tests/                 Solana program test suites
├── examples/              Quickstart guides (JS, Python, TypeScript)
├── docs/                  Design specs + implementation plans
├── openapi.yaml           171-endpoint API specification
└── docker-compose.yml     One-command local development
```

---

## Environment Variables

Copy `offchain/.env.example` for the full reference. Key variables:

| Variable | Purpose | Default |
|----------|---------|---------|
| `POSTGRES_*` | Database connection | — |
| `LUCID_ORCHESTRATOR_SECRET_KEY` | Ed25519 signing key | — |
| `ANCHORING_CHAINS` | Chain targets | `solana-devnet` |
| `NFT_PROVIDER` | NFT backend | `mock` |
| `MEMORY_STORE` | Memory backend | `sqlite` |
| `DEPLOYMENT_STORE` | Deployment backend | `postgres` |
| `DEPLOY_TARGET` | Default deployer | `docker` |
| `DEPIN_PERMANENT_PROVIDER` | Permanent storage | `mock` |
| `DEPIN_EVOLVING_PROVIDER` | Evolving storage | `mock` |
| `REPUTATION_PROVIDER` | Reputation backend | `db` |
| `SECRETS_PROVIDER` | Secrets resolver | `env` |
| `TRUSTGATE_URL` | Inference gateway | — |

---

## Codebase Metrics

| Metric | Count |
|--------|-------|
| Solana programs | 6 |
| EVM contracts | 17 |
| TypeScript files | 527 |
| API endpoints | 171 |
| Test suites | 103 |
| Passing tests | 1,683 |
| Deployers | 6 |
| Runtime adapters | 7 |
| Memory types | 6 |
| DePIN artifact types | 7 |
| JSON schemas | 14 |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, commit conventions, and development workflow.

---

## License

- **Engine & programs:** [Apache 2.0](LICENSE)
- **Gateway-lite:** [AGPL-3.0](offchain/packages/gateway-lite/LICENSE)

Copyright 2024-2026 Raijin Labs.
