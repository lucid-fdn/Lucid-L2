# Agent Launch Paths — 5 Ways to Deploy

**Date:** 2026-03-18
**Status:** Draft
**Goal:** Define all 5 launch paths for Lucid agents with industry-standard DX, scalable image management, and a marketplace for pre-built agents.

---

## The 5 Paths

```
lucid launch --image ghcr.io/me/agent:v1           # Path A: BYOI
lucid launch --runtime base --model gpt-4o          # Path B: Base Runtime
POST /v1/passports { target: "self_hosted" }        # Path C: External Registration
lucid launch --path ./my-agent                      # Path D: From Source
lucid launch --agent trading-analyst                 # Path E: Marketplace
```

| Path | User provides | Lucid does | Target audience |
|---|---|---|---|
| **A: BYOI** | Docker image URL | Deploy + passport + receipts | Developers with existing agents |
| **B: Base Runtime** | Model + prompt + tools | Deploy pre-built image with config | No-code users |
| **C: External** | Running agent URL | Register for identity + reputation | Already-deployed agents |
| **D: From Source** | Dockerfile or code directory | Build + push + deploy | Developers without Docker knowledge |
| **E: Marketplace** | Agent name from catalog | Deploy pre-built community/official agent | Everyone |

---

## Path A: BYOI (Implemented)

```bash
lucid launch --image ghcr.io/myorg/my-agent:v1 --target railway
```

Already built and E2E tested. User pushes image to any public registry, Lucid deploys it.

## Path B: Base Runtime (Implemented)

```bash
lucid launch --runtime base --model gpt-4o --prompt "You are a trading analyst"
```

Already built. Deploys `ghcr.io/lucid-fdn/agent-runtime:v1.0.0` configured via env vars.

## Path C: External Registration (Implemented)

```bash
curl -X POST https://api.lucid.foundation/v1/passports \
  -d '{ "type": "agent", "owner": "0x...", "metadata": { "deployment_config": { "target": { "type": "self_hosted" } } } }'
curl -X PATCH https://api.lucid.foundation/v1/passports/$ID/endpoints \
  -d '{ "invoke_url": "https://my-agent.com/run" }'
```

Already operational. No deployment — just identity + reputation for running agents.

---

## Path D: From Source (New)

```bash
lucid launch --path ./my-agent --target railway
```

**User has code + Dockerfile but no built image.** Lucid builds, pushes, and deploys.

### Flow

```
lucid launch --path ./my-agent
  1. Detect Dockerfile in ./my-agent/
  2. Check: is Docker available locally?
     → Yes: docker build + docker push to ghcr.io/lucid-fdn/agents/<passport-id>:latest
     → No: push source to provider (Railway accepts source directly via GitHub)
  3. Create passport
  4. Deploy image/source to target
  5. Return URL
```

### Auto-detection

```
./my-agent/
  Dockerfile           → Docker build path
  package.json         → Node.js (Nixpacks on Railway)
  requirements.txt     → Python (Nixpacks on Railway)
  go.mod               → Go (Nixpacks on Railway)
```

If Dockerfile exists → always use it.
If no Dockerfile → provider's buildpack (Railway Nixpacks, Akash needs Dockerfile).

### Image registry

Built images pushed to: `ghcr.io/lucid-fdn/agents/<passport-id>:<tag>`

- Lucid's GHCR org hosts all built images
- Tagged by passport ID for traceability
- Immutable tags (`:v1`, `:v2`) + `:latest` for convenience

### CLI

```bash
lucid launch --path ./my-agent                        # Auto-detect target
lucid launch --path ./my-agent --target railway       # Explicit target
lucid launch --path ./my-agent --target akash --gpu   # GPU target
lucid launch --path . --name "My Agent"               # Current directory
```

---

## Path E: Marketplace (New)

```bash
lucid launch --agent trading-analyst
```

**User picks a pre-built agent from the catalog.** One command, zero code.

### Architecture

```
lucid-fdn/lucid-agents (new repo)          ← Catalog source of truth
  official/                                  ← Lucid-maintained
  community/                                 ← PR-based contributions
  catalog.json                               ← Auto-generated index

Lucid Cloud (platform-core)                  ← Marketplace API
  GET  /v1/marketplace/agents                ← Browse catalog
  GET  /v1/marketplace/agents/:slug          ← Agent details
  POST /v1/marketplace/agents                ← Publish (community)

CLI
  lucid marketplace list                     ← Browse from terminal
  lucid marketplace search "trading"         ← Search
  lucid launch --agent trading-analyst       ← Deploy from catalog
```

### Agent Manifest (`manifest.yaml`)

Each agent in the catalog has a manifest:

```yaml
# lucid-agents/official/trading-analyst/manifest.yaml
name: trading-analyst
display_name: "Trading Analyst"
description: "AI agent that analyzes market data and provides trading insights"
version: "1.0.0"
author: "Lucid Foundation"
license: "Apache-2.0"
verified: true

# Image source (pre-built)
image: ghcr.io/lucid-fdn/lucid-agents/trading-analyst:v1.0.0

# Or source build
source:
  dockerfile: ./Dockerfile

# Default configuration
defaults:
  model: gpt-4o
  prompt: "You are a financial trading analyst specializing in crypto markets..."
  tools:
    - market-data
    - price-alerts
  port: 3100

# Required env vars (user must provide)
required_env:
  - name: EXCHANGE_API_KEY
    description: "API key for exchange data access"

# Optional env vars
optional_env:
  - name: RISK_TOLERANCE
    description: "Risk level (conservative|moderate|aggressive)"
    default: "moderate"

# Resource requirements
resources:
  gpu: false
  memory: "512Mi"

# Categories for discovery
categories:
  - finance
  - trading
  - analytics

# Reputation (auto-populated from Lucid network)
stats:
  deployments: 0
  avg_reputation: 0
```

### Catalog types

**Official agents** (maintained by Lucid):

| Agent | Description | Image |
|---|---|---|
| `base-runtime` | Configurable LLM agent | `ghcr.io/lucid-fdn/agent-runtime:v1.0.0` |
| `trading-analyst` | Market analysis | `ghcr.io/lucid-fdn/lucid-agents/trading-analyst:v1` |
| `code-reviewer` | Code review specialist | `ghcr.io/lucid-fdn/lucid-agents/code-reviewer:v1` |
| `research-agent` | Web research + summarization | `ghcr.io/lucid-fdn/lucid-agents/research-agent:v1` |
| `customer-support` | Support ticket handling | `ghcr.io/lucid-fdn/lucid-agents/customer-support:v1` |

**Community agents** (contributed via PR):

Anyone can submit a PR to `lucid-fdn/lucid-agents` with:
- `community/<agent-name>/manifest.yaml`
- `community/<agent-name>/Dockerfile`
- `community/<agent-name>/README.md`

Lucid team reviews, merges, auto-builds image, publishes to catalog.

### CLI flow for marketplace

```bash
# Browse
$ lucid marketplace list
  Official:
    trading-analyst    Trading Analyst (v1.0.0) — finance, trading
    code-reviewer      Code Review Specialist (v1.0.0) — development
    research-agent     Research Agent (v1.0.0) — research
  Community:
    seo-optimizer      SEO Content Optimizer (v0.3.0) — marketing
    discord-bot        Discord Community Bot (v1.2.0) — social

# Search
$ lucid marketplace search "trading"
  trading-analyst    Trading Analyst (v1.0.0) ★4.8 — 128 deployments

# Deploy
$ lucid launch --agent trading-analyst
  ✓ Passport created: passport_abc123
  ✓ Deploying trading-analyst (v1.0.0)...
  ✓ Live at https://passport-abc123.lucid.run
  ✓ Receipts: enabled

# Deploy with overrides
$ lucid launch --agent trading-analyst \
    --env EXCHANGE_API_KEY=xxx \
    --env RISK_TOLERANCE=aggressive
```

### Catalog sync

```
lucid-agents repo (GitHub)
  → GitHub Action on merge: build images, push to GHCR
  → GitHub Action: generate catalog.json
  → Lucid Cloud syncs catalog.json periodically
  → CLI fetches catalog from Cloud API or directly from GitHub raw
```

---

## Image Management Strategy

### Where images live

| Image type | Registry | Who pushes | Who pulls |
|---|---|---|---|
| Base runtime | `ghcr.io/lucid-fdn/agent-runtime` | Lucid CI | Deployers |
| Official agents | `ghcr.io/lucid-fdn/lucid-agents/<name>` | Lucid CI | Deployers |
| Community agents | `ghcr.io/lucid-fdn/lucid-agents/<name>` | Lucid CI (after PR merge) | Deployers |
| User BYOI | `ghcr.io/<user>/<name>` or any registry | User | Deployers |
| User from-source | `ghcr.io/lucid-fdn/agents/<passport-id>` | `lucid launch --path` | Deployers |

### Versioning

- Semantic versioning: `v1.0.0`, `v1.1.0`, `v2.0.0`
- `:latest` always points to newest stable
- Immutable digests for production deployments
- Catalog tracks which versions are available

### Security

- Official images: signed, scanned by GitHub security
- Community images: reviewed in PR, built by Lucid CI (not user-supplied binaries)
- User BYOI: user's responsibility
- From-source builds: Dockerfile audited at build time, runs in isolated build context

---

## What Goes Where

| Component | Repo | Purpose |
|---|---|---|
| `lucid launch --path` (build from source) | Lucid Layer | Docker build + push + deploy |
| `lucid launch --agent` (marketplace deploy) | Lucid Layer | Fetch manifest + deploy image |
| `lucid marketplace list/search` | Lucid Layer | CLI catalog browser |
| Agent manifests + Dockerfiles | lucid-agents (new repo) | Catalog source of truth |
| GitHub Actions (build + publish) | lucid-agents (new repo) | CI/CD for agent images |
| `GET /v1/marketplace/agents` | Lucid Cloud | Marketplace API |
| `POST /v1/marketplace/agents` | Lucid Cloud | Community publish API |
| Catalog sync | Lucid Cloud | Pulls from lucid-agents repo |

---

## Implementation Order

### Phase 1: From Source (Lucid Layer)
1. `lucid launch --path` — detect Dockerfile, build, push to GHCR, deploy
2. Fallback: push source to Railway (Nixpacks) when no Docker available
3. Image tagged as `ghcr.io/lucid-fdn/agents/<passport-id>:latest`

### Phase 2: Catalog Repo (lucid-agents)
4. Create `lucid-fdn/lucid-agents` repo
5. Define manifest schema (`manifest.yaml`)
6. Add 3-5 official agent templates
7. GitHub Action: build images on merge, generate `catalog.json`

### Phase 3: Marketplace CLI (Lucid Layer)
8. `lucid marketplace list` — fetch catalog
9. `lucid marketplace search` — filter
10. `lucid launch --agent <slug>` — resolve manifest → deploy image

### Phase 4: Marketplace API (Lucid Cloud)
11. `GET /v1/marketplace/agents` — browse
12. `GET /v1/marketplace/agents/:slug` — details + stats
13. `POST /v1/marketplace/agents` — community publish
14. Catalog sync from GitHub repo

---

## Test Plan

- [ ] `lucid launch --path ./test-agent` with Dockerfile → builds, pushes to GHCR, deploys
- [ ] `lucid launch --path ./test-agent` without Docker → pushes source to Railway
- [ ] `lucid launch --path ./test-agent --target akash` → error if no Dockerfile (Akash needs images)
- [ ] `lucid marketplace list` → shows official agents
- [ ] `lucid marketplace search "trading"` → filters results
- [ ] `lucid launch --agent trading-analyst` → deploys from catalog
- [ ] `lucid launch --agent trading-analyst --env KEY=val` → env overrides work
- [ ] Community PR merged → GitHub Action builds image → appears in catalog
- [ ] Manifest validation → rejects malformed manifests
- [ ] Image versioning → `:v1.0.0` and `:latest` both work
