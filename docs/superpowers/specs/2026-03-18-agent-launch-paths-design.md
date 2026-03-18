# Agent Launch Paths — 5 Ways to Deploy

**Date:** 2026-03-18
**Status:** Draft (architect-reviewed)
**Goal:** Define all 5 launch paths for Lucid agents with industry-standard DX, scalable image management, and a marketplace for pre-built agents.

**Architect corrections applied:**
1. Marketplace (Path E) is a separate product surface, not just another launch path
2. Path D must not force Lucid-owned GHCR — respect self-hosted autonomy
3. Marketplace needs trust tiers from day 1 (official / verified / community)
4. All 5 paths converge into one canonical `LaunchSpec` internally
5. Provider compatibility matrix must be explicit
6. Marketplace deployments store full provenance (slug, version, digest, trust tier)

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

## Canonical Internal Model (LaunchSpec)

All 5 paths converge into one normalized object. Deployers consume this — they don't care where input came from.

```typescript
interface LaunchSpec {
  source_type: 'image' | 'source' | 'catalog' | 'runtime' | 'external';
  source_ref: string;           // image URL, source path, catalog slug, or endpoint URL
  resolved_image?: string;      // final Docker image after build/resolution
  manifest?: AgentManifest;     // for catalog agents
  target: DeploymentTargetType;
  verification_mode: 'full' | 'minimal';
  env_vars: Record<string, string>;
  port?: number;
  metadata: {
    marketplace_slug?: string;
    marketplace_version?: string;
    manifest_hash?: string;
    image_digest?: string;
    publisher?: string;
    trust_tier?: 'official' | 'verified' | 'community';
    source_hash?: string;
  };
}
```

CLI flags map to `source_type`:

| Flag | `source_type` |
|---|---|
| `--image` | `image` |
| `--runtime` | `runtime` |
| `--path` | `source` |
| `--agent` | `catalog` |
| API register | `external` |

---

## Provider Compatibility Matrix

| Path | Docker | Railway | Akash | Phala | io.net | Nosana |
|---|---|---|---|---|---|---|
| `--image` | Yes | Yes | Yes | Yes | Yes | Yes |
| `--runtime` | Yes | Yes | Yes | Yes | Yes | Yes |
| `--path` (Dockerfile) | Yes | Yes | Yes | Yes | Yes | Yes |
| `--path` (no Dockerfile) | Local build required | Nixpacks | No | No | No | No |
| `--agent` | Yes | Yes | Yes | Yes | Yes | Yes |

If `--path` without Dockerfile targets a provider that doesn't support source builds → clear error with instructions to add a Dockerfile.

---

## Image Registry Strategy

**Path D (from source) must NOT force Lucid-owned GHCR for Layer users.**

| Mode | Registry | Who decides |
|---|---|---|
| Layer + `--target docker` | Local only (no push needed) | User |
| Layer + `--target railway` | User's registry (configured in `~/.lucid/`) or Railway source deploy | User |
| Layer + `--target akash/phala/etc` | User's registry (must be accessible) | User |
| Cloud (any target) | `ghcr.io/lucid-fdn/agents/<passport-id>` | Lucid manages |

Config in `~/.lucid/credentials.json`:
```json
{
  "registry": {
    "url": "ghcr.io/myorg",
    "username": "...",
    "token": "..."
  }
}
```

If no registry configured for Layer + remote target → error: "Configure a registry: `lucid registry set ghcr.io/myorg`"

---

## Marketplace Trust Tiers

| Tier | Badge | Who | Requirements |
|---|---|---|---|
| **Official** | Lucid-maintained | Lucid team | In `official/` dir, built by Lucid CI |
| **Verified** | Audited publisher | Verified org (KYC/reputation) | Signed manifest, security scan passed |
| **Community** | Unverified | Anyone (PR-based) | PR reviewed, manifest valid, image builds |

Trust tier stored in deployment record for provenance:
```typescript
deployment.metadata.trust_tier = 'official' | 'verified' | 'community';
deployment.metadata.marketplace_slug = 'trading-analyst';
deployment.metadata.marketplace_version = '1.0.0';
deployment.metadata.image_digest = 'sha256:1f6810715...';
deployment.metadata.manifest_hash = 'sha256:abc123...';
```

---

## Marketplace = Separate Product Surface

Marketplace (Path E) is NOT just another launch flag. It introduces:
- Manifest schema + validation
- Trust tiers + governance
- Publisher identity + verification
- Image build CI/CD pipeline
- Version lifecycle management
- Discovery + ranking + reputation
- Abuse handling
- Legal/licensing

**Treat as its own workstream** built on top of launch infrastructure, not embedded in it.

---

## What Goes Where

| Component | Repo | Purpose |
|---|---|---|
| `lucid launch --path` | Lucid Layer | Build from source + deploy |
| `lucid launch --agent` | Lucid Layer | Fetch manifest → resolve image → deploy |
| `lucid marketplace list/search` | Lucid Layer | CLI catalog browser |
| `lucid registry set` | Lucid Layer | Configure user's image registry |
| `LaunchSpec` normalization | Lucid Layer | All paths → one internal model |
| Agent manifests + Dockerfiles | `lucid-fdn/lucid-agents` (new repo) | Catalog source of truth |
| GitHub Actions (build + publish) | `lucid-fdn/lucid-agents` | CI/CD for agent images |
| `GET /v1/marketplace/agents` | Lucid Cloud | Marketplace API + search |
| `POST /v1/marketplace/publish` | Lucid Cloud | Community publish |
| Trust tier management | Lucid Cloud | Verification + governance |
| Catalog sync | Lucid Cloud | Pulls from lucid-agents repo |

---

## Implementation Order

### Phase 1: From Source (Lucid Layer) — ship now
1. `lucid launch --path` — detect Dockerfile, build, deploy
2. Local Docker target: build locally, no registry needed
3. Remote target: build + push to user's configured registry
4. Fallback: push source to Railway (Nixpacks) when no Docker/Dockerfile
5. `lucid registry set` — configure user's registry

### Phase 2: LaunchSpec Normalization (Lucid Layer) — ship now
6. All 5 paths produce a `LaunchSpec`
7. Deployers consume `LaunchSpec` only
8. Provider compatibility check before deploy

### Phase 3: Catalog Repo — next sprint
9. Create `lucid-fdn/lucid-agents` repo
10. Define manifest schema (`manifest.yaml`)
11. Add 3-5 official agent images
12. GitHub Action: build on merge, generate `catalog.json`

### Phase 4: Marketplace (separate workstream)
13. Trust tiers (official / verified / community)
14. Marketplace CLI (`lucid marketplace list/search`)
15. Marketplace API (`GET /v1/marketplace/agents`)
16. Community publish flow
17. Provenance tracking in deployment records

---

## Test Plan

- [ ] `lucid launch --path ./test-agent` with Dockerfile + `--target docker` → builds locally, runs
- [ ] `lucid launch --path ./test-agent` with Dockerfile + `--target railway` → builds, pushes to user registry, deploys
- [ ] `lucid launch --path ./test-agent` without Docker + `--target railway` → Nixpacks source deploy
- [ ] `lucid launch --path ./test-agent --target akash` without Dockerfile → clear error
- [ ] `lucid registry set ghcr.io/myorg` → saves to credentials
- [ ] `LaunchSpec` produced by all 5 paths has consistent shape
- [ ] Provider compatibility matrix enforced (error for unsupported combos)
- [ ] `lucid marketplace list` → shows official + verified + community tiers
- [ ] `lucid launch --agent trading-analyst` → stores provenance (slug, version, digest, trust tier)
- [ ] Manifest validation → rejects malformed manifests
- [ ] Trust tier badge shown in marketplace list output
