<p align="center">
  <h1 align="center">Lucid L2</h1>
  <p align="center">
    <strong>The verifiable AI execution layer.</strong>
    <br />
    Blockchain-anchored infrastructure giving AI assets — models, agents, tools, compute, datasets — provable identity, cryptographic receipts, and reputation backed by real traffic data.
  </p>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License" /></a>
  <a href="#testing"><img src="https://img.shields.io/badge/tests-1,683%20passing-brightgreen" alt="Tests" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Solana-devnet-purple" alt="Solana" /></a>
  <a href="#"><img src="https://img.shields.io/badge/EVM-Base%20%7C%20Ethereum-blue" alt="EVM" /></a>
  <a href="#"><img src="https://img.shields.io/badge/TypeScript-527%20files-blue" alt="TypeScript" /></a>
</p>

---

## Why Lucid Exists

AI agents are making real decisions, spending real money, and operating autonomously. But there's no way to verify what they did, prove who they are, or trust their track record.

Lucid fixes this. Every AI interaction gets a **cryptographic receipt**, batched into **epochs**, committed **on-chain**, and provable **forever**. AI assets get **verifiable identity** (passports), **earned reputation** (from real traffic), and **portable memory** (agent-owned, not platform-owned).

```
Request → Passport matching → AI execution → Receipt (Ed25519 signed)
  → MMR append → Epoch finalization → On-chain anchor (Solana + EVM)
  → Verifiable Merkle proof available for any receipt, any time
```

**The result:** A trust layer for AI that works across chains, across providers, across frameworks.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [On-Chain Programs](#on-chain-programs)
- [Deployment Control Plane](#deployment-control-plane)
- [Agent Memory (MemoryMap v3)](#agent-memory-memorymap-v3)
- [Anchoring & DePIN](#anchoring--depin)
- [API Reference](#api-reference)
- [SDK](#sdk)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Contributing](#contributing)
- [License](#license)

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
| **L4 Product** | Platform Core | Dashboards, APIs, UX |

**Key rule:** L3 is operational state, never canonical truth. Rebuild from L1+L2 if needed.

</td>
</tr>
</table>

### Decentralization Principle

> **Lucid is the control plane — not the execution authority.** Agents run on decentralized providers (Akash, Phala, io.net, Nosana). Agent memory is local-first (SQLite, agent-owned). Agent identity is on-chain (passport). Lucid coordinates agents — it does not own them.

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

## API Reference

171 endpoints documented in [`openapi.yaml`](openapi.yaml). Key groups:

| Group | Endpoints | Purpose |
|-------|-----------|---------|
| **Inference** | `/v1/chat/completions`, `/v1/models` | OpenAI-compatible AI execution |
| **Passports** | `/v1/passports/*` | AI asset identity (model, agent, tool, compute, dataset) |
| **Receipts** | `/v1/receipts/*` | Cryptographic receipt creation + verification |
| **Epochs** | `/v1/epochs/*` | Epoch management + multi-chain anchoring |
| **Memory** | `/v1/memory/*` | 6 memory types + recall + compaction + snapshots |
| **Anchoring** | `/v1/anchors/*` | DePIN registry + lineage + verification |
| **Deployment** | `/v1/agents/*` | Agent lifecycle (deploy, blue-green, rollback) |
| **Payment** | `/v1/assets/*/pricing`, `/v1/payouts` | x402 protocol + revenue splits |
| **Compute** | `/v1/compute/nodes/*`, `/v1/match` | Heartbeat + policy-based matching |
| **Reputation** | Chain routes | On-chain + off-chain reputation queries |
| **Webhooks** | `/v1/webhooks/:provider` | Provider callback ingestion |

### x402 Payment Protocol

HTTP 402 flow — server returns payment instructions, agent pays USDC on-chain, retries with `X-Payment-Proof`. Three facilitators (Direct, Coinbase, PayAI). Dynamic per-asset pricing. Replay protection via spent proof dedup.

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
