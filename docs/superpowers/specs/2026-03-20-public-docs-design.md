# Public Documentation Site — Design Spec

**Date:** 2026-03-20
**Status:** Approved
**Platform:** Mintlify at docs.lucid.foundation
**Audiences:** Developers (primary), investors/partners (secondary)

---

## Positioning

Lucid is the **coordination and settlement layer for autonomous agents** — not just where they run, but where they interact, transact, and prove their behavior.

### Category: Agent Coordination & Settlement Layer

| Layer | What Lucid Does | What Others Do |
|-------|----------------|----------------|
| Model | Provider-agnostic (OpenAI, Anthropic, open-source) | OpenAI, Anthropic own theirs |
| Framework | Framework-agnostic (CrewAI, LangGraph, Vercel AI) | LangChain, CrewAI own theirs |
| Hosting | Provider-agnostic (Railway, Akash, Phala, io.net) | Railway, Vercel own theirs |
| Coordination + Settlement | **Lucid** | No one |

---

## Site Structure

```
docs.lucid.foundation

├── Get Started
│   ├── What is Lucid
│   ├── Quick Start (2-5 min agent launch)
│   ├── Install an Agent (Telegram-first UX)
│   └── Architecture Overview (3-layer: execution / coordination / settlement)
│
├── Build & Deploy
│   ├── Launch an Agent
│   │   ├── From Telegram
│   │   ├── From CLI
│   │   ├── From Source (--path)
│   │   ├── From Image (BYOI)
│   │   └── From Catalog
│   │
│   ├── Configure an Agent
│   │   ├── Interactive Setup (env wizard)
│   │   ├── Secrets & API Keys
│   │   ├── Channels (Telegram, Discord, Slack)
│   │   └── Runtime Configuration
│   │
│   ├── Deploy a Model
│   │   ├── Use hosted models (OpenAI, Anthropic)
│   │   ├── Bring your own model
│   │   └── Model routing
│   │
│   ├── Deploy on DePIN
│   │   ├── Akash
│   │   ├── io.net
│   │   ├── Nosana
│   │   └── Phala
│   │
│   └── Compute Providers
│       ├── How compute selection works
│       └── GPU vs CPU routing
│
├── How Lucid Works
│   ├── Execution Layer
│   │   ├── Compute
│   │   ├── Models
│   │   └── Runtime
│   │
│   ├── Coordination Layer
│   │   ├── Agent Orchestration (A2A)
│   │   ├── Tool Access (MCP)
│   │   ├── Gateway (TrustGate)
│   │   └── Channels & Routing
│   │
│   └── Settlement Layer
│       ├── Identity (Passports)
│       ├── Payments (x402)
│       ├── Receipts (Proofs)
│       ├── Anchoring (Solana / EVM)
│       └── Reputation
│
├── Core Concepts (deep dives)
│   ├── Passports (Identity)
│   ├── Portable Memory
│   ├── Compute & Models
│   ├── Agent Deployment Lifecycle
│   ├── Agent Orchestration
│   ├── Payments (x402)
│   ├── Receipts & Verification
│   ├── Anchoring
│   └── Reputation
│
├── Gateway (Lucid Cloud)
│   ├── TrustGate (LLM Gateway)
│   ├── MCPGate (Tool Gateway)
│   ├── Control Plane
│   └── Managed Channels
│
├── API & SDK
│   ├── REST API (OpenAPI)
│   ├── SDKs (Speakeasy)
│   └── Examples
│
├── On-Chain
│   ├── Solana Programs
│   └── EVM Contracts
│
├── Self-Hosting
│   ├── Run Lucid Layer locally
│   └── Configuration & env vars
│
└── Advanced
    ├── Custom Agents
    ├── Extending Runtime
    └── Contributing
```

---

## Content Source Mapping

### New writing needed (~10 pages)

| Page | Priority | Notes |
|------|----------|-------|
| What is Lucid | P0 | Positioning narrative — execution + coordination + settlement |
| Quick Start | P0 | 2-5 min deploy via Telegram or CLI |
| Install an Agent | P0 | Telegram-first walkthrough |
| Architecture Overview | P0 | 3-layer diagram |
| From Telegram | P1 | The flow we built this session |
| Deploy a Model (3 pages) | P1 | Hosted, BYOI, routing |
| Custom Agents | P2 | Path A/C guide |
| Extending Runtime | P2 | How to add capabilities |

### Extract + edit from existing content (~15 pages)

| Page | Source |
|------|--------|
| From CLI / Source / Image / Catalog | CLAUDE.md "Agent Activation (5 Paths)" |
| Configure an Agent (4 pages) | CLAUDE.md + .env.example |
| Base Runtime | offchain/packages/agent-runtime/README.md |
| OpenClaw Integration | lucid-agents manifests |
| Deploy on DePIN (4 pages) | CLAUDE.md deployer docs |
| Compute Providers | CLAUDE.md + matchingEngine |
| How Lucid Works (3 sections) | README.md + CLAUDE.md |
| TrustGate | platform-core CLAUDE.md |
| MCPGate | platform-core CLAUDE.md |
| Control Plane | platform-core CLAUDE.md |
| Self-Hosting | offchain/README.md |
| Configuration | .env.example |
| Contributing | CONTRIBUTING.md |

### Already generated (~25 pages)

| Pages | Source |
|-------|--------|
| 9 Core Concept deep dives | docs/modules/*.md (AI-generated from engine domains) |
| 6 Solana Program pages | docs/modules/programs/ |
| 10 EVM Contract pages | docs/modules/contracts/ |

### Auto-rendered

| Page | Source |
|------|--------|
| REST API | openapi.yaml (Mintlify OpenAPI renderer) |
| SDKs | Speakeasy SDK READMEs |

---

## Section Roles (no overlap)

| Section | Role | Audience |
|---------|------|----------|
| Get Started | Onboarding | Everyone |
| Build & Deploy | Action — how to use | Developers |
| How Lucid Works | Mental model — 3 layers | Everyone |
| Core Concepts | Deep understanding | Developers + architects |
| Gateway | Product infrastructure | Developers using Lucid Cloud |
| API & SDK | Integration | Developers |
| On-Chain | Trust layer | Blockchain developers |
| Self-Hosting | Run it yourself | Advanced developers |
| Advanced | Extend and contribute | Power users |

---

## Implementation Approach

1. **Set up Mintlify** — create project, configure `mint.json`, connect to repo
2. **Run pipeline** — `npx tsx src/generate.ts --artifact mintlify` to sync generated content
3. **Write P0 pages** — What is Lucid, Quick Start, Install an Agent, Architecture
4. **Extract P1 pages** — from CLAUDE.md and READMEs
5. **Connect OpenAPI** — Mintlify auto-renders API reference from openapi.yaml
6. **Deploy** — docs.lucid.foundation

---

## Key Narrative (for "What is Lucid" page)

Lucid is the coordination and settlement layer for autonomous agents.

It's not just where agents run — it's where they interact, transact, and prove their behavior.

**The 3 layers:**

1. **Execution** — Agents run on any compute (cloud or DePIN), using any model. No lock-in.
2. **Coordination** — Agents call tools, delegate to other agents, route intelligence through gateways.
3. **Settlement** — Everything is verifiable: payments, receipts, on-chain anchoring, reputation over time.

**One sentence:** "Lucid is to AI agents what Ethereum is to smart contracts — the infrastructure for an economy of agents."
