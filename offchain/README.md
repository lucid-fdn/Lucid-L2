# Offchain Engine

The offchain engine of Lucid Layer — a TypeScript implementation of the protocol's core logic: identity, memory, receipts, epochs, payments, deployment, anchoring, and reputation.

This engine is designed to be progressively decentralized. Today some parts run as centralized services. Tomorrow, through R&D and ecosystem partnerships, its coordination logic moves on-chain and into trustless protocols. 

For the fully managed, globally accelerated version, see **Lucid Cloud**.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Packages](#packages)
- [App Layer](#app-layer)
- [Engine Domains](#engine-domains)
- [Gateway Routes](#gateway-routes)
- [Deployment CLI](#deployment-cli)
- [Testing](#testing)
- [Configuration](#configuration)

---

## Quick Start

```bash
npm install
cp .env.example .env       # Edit with your values
npm start                  # API on :3001
npm test                   # 104 suites, 1,622 tests
npm run type-check         # TypeScript compilation
```

---

## Architecture

```
src/                    App layer (boots server, CLI, GPU workers)
  ↓ imports
packages/
  engine/               Truth library — pure logic, no HTTP
  gateway-lite/         Express API — thin routes, middleware
  contrib/              External integrations (LLM, n8n, HF, OAuth, MCP)
local-packages/
  passport/             @lucid-fdn/passport (shared with Lucid Cloud)
```

**Dependency rule:** `gateway-lite → engine` (OK). `engine → gateway-lite` (forbidden, ESLint-enforced).

---

## Packages

| Package | Scope | Lines | Purpose |
|---------|-------|-------|---------|
| `packages/engine/` | `@lucid-l2/engine` | ~53K | Core truth library — no HTTP, no Express. Pure domain logic. |
| `packages/gateway-lite/` | `@lucid-l2/gateway-lite` | ~29K | Express API server — thin route handlers delegating to engine. |
| `packages/contrib/` | — | ~5K | LLM providers, n8n gateway, HuggingFace sync, OAuth, MCP server, FlowSpec. |

---

## App Layer

`src/` is the application entry point — it boots the server, CLI, and workers on top of the library packages.

| File | What it does |
|------|-------------|
| `src/index.ts` | Boots Express server (delegates to gateway-lite) |
| `src/cli.ts` | Full CLI: launch, deploy, auth, providers, marketplace, skills, registry |
| `src/cli/` | CLI modules: auth, credentials, launch-resolver, agent-launch-ui, agent-setup, skill-oauth, register-skills |
| `src/commands/` | CLI subcommands (batch, mmr, run) |
| `src/workers/worker-gpu-vllm/` | GPU inference worker (vLLM backend) |
| `src/workers/worker-sim-hf/` | HuggingFace simulation worker |
| `src/utils/` | Token counter, inference helper, environment validator |

---

## Engine Domains

The engine is organized by **7 feature domains**, each mapping to a stage in the autonomous AI agent lifecycle.

| Domain | Lifecycle Stage | What it owns |
|--------|----------------|-------------|
| **Identity** | Who you are | Passports, wallets, NFT (Token2022, Metaplex, EVM), shares, TBA, CAIP-10 bridge |
| **Compute** | Where you run | 6 deployers (Docker, Railway, Akash, Phala, io.net, Nosana), launch service, deployment control plane, reconciler |
| **Memory** | What you remember | 6 memory types, 3 store backends (SQLite, Postgres, InMemory), semantic recall, compaction, DePIN snapshots |
| **Receipt** | What you can prove | Receipt creation, Ed25519 signing, verification, MMR proofs |
| **Anchoring** | When and where it's permanent | Epoch lifecycle, MMR, DePIN dispatcher, anchor registry, CID verifier |
| **Payment** | How you get paid | x402 protocol, pricing, revenue splits, escrow, facilitators, share token airdrop |
| **Reputation** | How trusted you are | On-chain + off-chain reputation, ERC-8004 sync, scoring algorithms |

Plus `shared/` for cross-cutting infrastructure (crypto, DB, config, chain adapters, DePIN storage, background jobs).

```
engine/src/
  identity/       ← passports, NFT, wallet, shares
  compute/        ← where agents run (2 folders, industry standard)
    providers/    ← 6 deployer adapters (Docker, Railway, Akash, Phala, io.net, Nosana)
    control-plane/ ← state machine, reconciler, launch, descriptors, webhooks
  memory/         ← 6 types, vector search, compaction
  receipt/        ← creation, signing, verification
  anchoring/      ← DePIN dispatch + epoch lifecycle
    epoch/        ← epochService, anchoringService, mmrService
  payment/        ← x402, splits, escrow, airdrop
  reputation/     ← on-chain + off-chain + Oracle
  shared/         ← crypto, DB, config, chains, DePIN, jobs
```

---

## Gateway Routes

54 route files organized by domain. All routes are thin handlers — business logic lives in engine.

| Group | Routes | Key endpoints |
|-------|--------|--------------|
| **Core** | 15 files | `/v1/passports/*`, `/v1/receipts/*`, `/v1/epochs/*`, `/v1/memory/*`, `/v1/anchors/*`, `/v1/match` |
| **Agent** | 6 files | `/v1/agents/deploy`, `/v1/agents/:id/status`, `/v1/agents/:id/promote`, `/v1/webhooks/:provider` |
| **Chain** | 10 files | Solana + EVM adapters, escrow, dispute, identity bridge, TBA, zkML, reputation |
| **API** | 7 files | Orchestrator, agent planner, FlowSpec, MMR, passport search |
| **Contrib** | 3 files | OAuth, Hyperliquid, rewards |
| **System** | 2 files | `/health`, wallet |

**171 total endpoints** documented in [`openapi.yaml`](../openapi.yaml).

---

## CLI

### Launch (5 paths)

```bash
lucid launch --image <image> --target <target>     # Path A: BYOI
lucid launch --runtime base --model <m> --prompt   # Path B: Base runtime
lucid launch --path ./my-agent --target railway    # Path C: Build from source
lucid launch --agent openclaw --target docker      # Path D: Marketplace catalog
lucid launch --agent openclaw --env KEY=VALUE      # Path D: pre-filled env
lucid launch --agent openclaw --config ./my.env    # Path D: CI mode
# Path E: External registration via POST /v1/passports
```

### Auth & Providers

```bash
lucid login                                        # Browser OAuth (or --token for CI)
lucid logout                                       # Clear auth
lucid whoami                                       # Show auth state
lucid provider add <name>                          # Connect provider
lucid provider list                                # List connected providers
lucid provider remove <name>                       # Disconnect provider
```

### Registry & Marketplace

```bash
lucid registry set ghcr.io/myorg                   # Set Docker registry for Path C
lucid registry get                                  # Show configured registry
lucid marketplace list                              # List available agents
lucid marketplace search <query>                    # Search agents
```

### Agent Skills

```bash
lucid agent skills register <slug>                  # Register skills as tool passports
lucid agent skills register <slug> --dry-run        # Preview
lucid agent skills list <slug>                      # List registered tool passports
```

### Legacy Deploy

```bash
npm run cli deploy <passport_id> <target>     # Deploy agent (deprecated, use launch)
npm run cli deploy status <passport_id>       # Check status
npm run cli deploy logs <passport_id>         # View logs
npm run cli deploy list                       # List all deployments
npm run cli deploy terminate <passport_id>    # Terminate
npm run cli deploy targets                    # Available targets
```

**Targets:** `docker`, `railway`, `akash`, `phala`, `ionet`, `nosana`

**Runtime adapters:** Vercel AI SDK, CrewAI, LangGraph, OpenAI Agents, OpenClaw, Google ADK, Docker

---

## Testing

```bash
npm test                                       # Full suite (104 suites, 1,622 tests)
npx jest packages/engine/src/memory/ --no-coverage   # Single domain
npx jest --testPathPattern="deployment"        # Pattern match
npm run type-check                             # TypeScript compilation
```

| Suite | Tests | Coverage |
|-------|-------|----------|
| Engine (control plane, memory, anchoring, receipts, reputation, payment) | ~1,350 | Core domain logic |
| Gateway-lite (routes, middleware) | ~270 | API layer |

Tests use `InMemory*` store implementations — fast, deterministic, no DB required.

---

## Configuration

Copy `.env.example` and configure. Key variables:

| Variable | Purpose | Default |
|----------|---------|---------|
| `POSTGRES_*` | Database connection | — |
| `LUCID_ORCHESTRATOR_SECRET_KEY` | Ed25519 signing key | — |
| `MEMORY_STORE` | Memory backend | `sqlite` |
| `DEPLOYMENT_STORE` | Deployment backend | `postgres` |
| `DEPLOY_TARGET` | Default deployer | `docker` |
| `NFT_PROVIDER` | NFT backend | `mock` |
| `DEPIN_PERMANENT_PROVIDER` | Permanent DePIN storage | `mock` |
| `DEPIN_EVOLVING_PROVIDER` | Evolving DePIN storage | `mock` |
| `SECRETS_PROVIDER` | Secrets resolver | `env` |
| `TRUSTGATE_URL` | Inference gateway | — |

See `.env.example` for the full reference.
