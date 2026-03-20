# Public Documentation Site — Design Spec

**Date:** 2026-03-20
**Status:** Approved
**Repo:** `lucid-fdn/lucid-docs` (existing Mintlify site, needs restructure)
**URL:** docs.lucid.foundation
**Audiences:** Developers (primary), investors/partners (secondary)

---

## Current State

The `lucid-docs` repo has **50 existing pages** on Mintlify (Aspen theme, auto-deploy on push). But the content is outdated:
- Positioning: "verifiable AI inference protocol" → should be "coordination & settlement layer"
- Missing: agent deployment, Telegram, DePIN, memory, reputation, x402 payments
- SDK: references old `raijin-labs-lucid-ai` → should reference Speakeasy `@lucid/gateway`
- OpenAPI: points to old spec → should use current `openapi.yaml`

**Action:** Restructure and rewrite, not rebuild from scratch.

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
│   ├── REST API (OpenAPI — auto-rendered)
│   ├── SDKs (Speakeasy — auto-generated)
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

## Three Automation Systems

### 1. AI Doc Pipeline (tools/docs/ → lucid-docs)

**What it does:** Extracts TypeScript domain exports from `Lucid-L2/offchain/packages/engine/src/`, enriches with AI (via TrustGate), outputs `.mdx` pages.

**Covers:** Core Concepts (9 deep dives), Solana Programs (6), EVM Contracts (10), reference tables, llms.txt.

**Current gap:** Pipeline outputs to `Lucid-L2/docs/` internally. Needs to also push to `lucid-fdn/lucid-docs`.

**Fix: GitHub Action in Lucid-L2:**
```yaml
name: Sync Docs
on:
  push:
    branches: [master]
    paths:
      - 'offchain/packages/engine/src/**'
      - 'programs/**'
      - 'contracts/**'

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd tools/docs && npm ci
      - run: cd tools/docs && TRUSTGATE_API_KEY=${{ secrets.TRUSTGATE_API_KEY }} npx tsx src/generate.ts
      - name: Push to lucid-docs
        run: |
          git clone https://x-access-token:${{ secrets.DOCS_DEPLOY_TOKEN }}@github.com/lucid-fdn/lucid-docs.git /tmp/docs
          cp docs/modules/*.md /tmp/docs/concepts/  # with .md → .mdx conversion
          cp docs/reference/*.md /tmp/docs/reference/
          cd /tmp/docs && git add -A
          git diff --cached --quiet || git commit -m "docs: auto-sync from Lucid-L2" && git push
```

**Trigger:** On every push to master that touches engine source, programs, or contracts.

### 2. Speakeasy SDK Generation (openapi.yaml → SDK docs)

**What it does:** Speakeasy generates `@lucid/gateway` TypeScript SDK from `openapi.yaml`. The SDK includes per-service README docs (inference, agents, billing, etc.).

**Already exists at:** `lucid-plateform-core/sdk/lucid-gateway-typescript/docs/sdks/` (20+ service READMEs)

**Fix: GitHub Action in lucid-plateform-core:**
```yaml
name: Regenerate SDK
on:
  push:
    paths: ['openapi.yaml', 'openapi-spec.yaml']

jobs:
  sdk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: speakeasy-api/sdk-generation-action@v15
        with:
          speakeasy_api_key: ${{ secrets.SPEAKEASY_API_KEY }}
          docs_dir: docs/sdks
      - name: Push SDK docs to lucid-docs
        run: |
          # Copy generated SDK READMEs to lucid-docs/sdks/
          ...
```

**Trigger:** On every push that changes `openapi.yaml`.

### 3. Mintlify OpenAPI Auto-Render (openapi.yaml → API Reference)

**What it does:** Mintlify natively renders interactive API reference pages from an OpenAPI spec. No code generation needed — just point `docs.json` at the spec.

**Config in docs.json:**
```json
{
  "openapi": "https://raw.githubusercontent.com/lucid-fdn/Lucid-L2/master/openapi.yaml",
  "api": {
    "baseUrl": "https://api.lucid.foundation"
  }
}
```

**Trigger:** Automatic — Mintlify re-fetches the spec on every deploy.

---

## Content Source Mapping

### New writing needed (~10 pages)

| Page | Priority | Notes |
|------|----------|-------|
| What is Lucid | P0 | Positioning: coordination + settlement layer |
| Quick Start | P0 | 2-5 min deploy via Telegram or CLI |
| Install an Agent | P0 | Telegram-first walkthrough |
| Architecture Overview | P0 | 3-layer diagram (execution / coordination / settlement) |
| From Telegram | P1 | The Telegram bot flow |
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

### AI-generated (~25 pages, auto-updated)

| Pages | Source | Pipeline |
|-------|--------|----------|
| 9 Core Concept deep dives | engine domain barrels | tools/docs → AI enrichment |
| 6 Solana Program pages | Anchor IDL + source | tools/docs → AI enrichment |
| 10 EVM Contract pages | Solidity source | tools/docs → AI enrichment |

### Auto-rendered (zero maintenance)

| Pages | Source | Tool |
|-------|--------|------|
| REST API reference | openapi.yaml | Mintlify OpenAPI renderer |
| SDK docs (20+ services) | openapi.yaml | Speakeasy generation |

---

## What Gets Deleted from Current Site

These pages from the existing `lucid-docs` are stale and will be replaced:

| Current Page | Action |
|-------------|--------|
| `index.mdx` (old positioning) | Rewrite |
| `quickstart.mdx` (old SDK) | Rewrite |
| `authentication.mdx` | Rewrite (new key system) |
| `sdk-installation.mdx` (old SDK) | Replace with Speakeasy |
| `concepts/inference.mdx` | Merge into How Lucid Works |
| `concepts/epochs.mdx` | Merge into Anchoring |
| `concepts/mmr.mdx` | Merge into Receipts deep dive |
| `concepts/session-signer.mdx` | Move to Advanced |
| `concepts/depin-storage.mdx` | Move to Anchoring |
| `concepts/nft-passports.mdx` | Merge into Passports |
| `concepts/fractional-ownership.mdx` | Merge into Passports |
| `guides/first-inference.mdx` | Replace with Quick Start |
| `guides/hf-passport-sync.mdx` | Remove (internal) |
| `guides/n8n-integration.mdx` | Move to Advanced |
| `guides/nango-oauth.mdx` | Move to Advanced |
| `guides/crewai-integration.mdx` | Move to Advanced |
| `platform/*.mdx` (8 pages) | Merge into Gateway section |
| `sdks/*.mdx` (8 pages) | Replace with Speakeasy output |

---

## Section Roles (no overlap)

| Section | Role | Audience | Updates |
|---------|------|----------|---------|
| Get Started | Onboarding | Everyone | Manual (narrative) |
| Build & Deploy | Action — how to use | Developers | Manual + extract |
| How Lucid Works | Mental model — 3 layers | Everyone | Manual (narrative) |
| Core Concepts | Deep understanding | Developers + architects | **AI pipeline (auto)** |
| Gateway | Product infrastructure | Lucid Cloud users | Manual + extract |
| API & SDK | Integration | Developers | **Speakeasy + Mintlify (auto)** |
| On-Chain | Trust layer | Blockchain devs | **AI pipeline (auto)** |
| Self-Hosting | Run it yourself | Advanced devs | Extract |
| Advanced | Extend and contribute | Power users | Manual |

---

## Implementation Plan

### Phase 1: Restructure (Day 1)
1. Clone `lucid-fdn/lucid-docs`
2. Rewrite `docs.json` with new nav structure
3. Write P0 pages: What is Lucid, Quick Start, Install an Agent, Architecture
4. Update `openapi` config to point to current spec

### Phase 2: Content Migration (Day 1-2)
5. Run AI pipeline: `tools/docs → generate --artifact mintlify`
6. Copy generated Core Concepts → `lucid-docs/concepts/`
7. Copy Solana/EVM docs → `lucid-docs/on-chain/`
8. Extract Build & Deploy pages from CLAUDE.md
9. Extract Gateway pages from platform-core CLAUDE.md
10. Write remaining P1/P2 pages

### Phase 3: Automation (Day 2)
11. GitHub Action in Lucid-L2: auto-sync engine docs on push
12. GitHub Action in platform-core: Speakeasy SDK regen on openapi.yaml change
13. Configure Mintlify OpenAPI auto-render
14. Test end-to-end: code change → pipeline → PR → docs update

### Phase 4: Polish (Day 3)
15. Review all pages for consistency
16. Add diagrams (architecture, 3-layer, data flow)
17. Delete stale pages
18. DNS: docs.lucid.foundation → Mintlify

---

## Key Narrative (for "What is Lucid" page)

Lucid is the coordination and settlement layer for autonomous agents.

It's not just where agents run — it's where they interact, transact, and prove their behavior.

**The 3 layers:**

1. **Execution** — Agents run on any compute (cloud or DePIN), using any model. No lock-in.
2. **Coordination** — Agents call tools, delegate to other agents, route intelligence through gateways.
3. **Settlement** — Everything is verifiable: payments, receipts, on-chain anchoring, reputation over time.

**One sentence:** "Lucid is to AI agents what Ethereum is to smart contracts — the infrastructure for an economy of agents."
