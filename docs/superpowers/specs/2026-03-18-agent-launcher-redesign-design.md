# Agent Launcher Redesign — SDK-First, Image-Based Deployment

**Date:** 2026-03-18
**Status:** Draft
**Goal:** Replace code-generation agent launcher with three industry-standard paths: SDK wrapper, bring-your-own-image deployment, and pre-built base runtime. Position Lucid 300% ahead of competition.

---

## Problem Statement

The current agent deployment pipeline generates throwaway source code from templates (7 "runtime adapters" that write agent.ts/agent.py files), then deploys that generated code. This is:

- **Not industry standard** — no competitor generates code. OpenClaw, Dify, AgentOps, Phala all use pre-built images or SDK wrappers.
- **Untestable** — generated code is fresh each deploy, never tested.
- **Framework lock-in** — templates hardcode specific frameworks instead of being agnostic.
- **Wrong abstraction** — Lucid's value is identity + verification + memory + payment, not Express server templates.

Meanwhile, the Speakeasy-generated SDK (`raijin-labs-lucid-ai`) and 171-endpoint OpenAPI already exist. The deployers (Railway, Akash, Phala, io.net, Nosana) make real API calls. The pieces are there — they're just connected wrong.

---

## Design

### Three Deployment Paths

```
Path A: SDK Wrapper (developers with existing agents)
  npm install @lucid/sdk → add 2 lines → receipts + memory + identity flow
  lucid deploy --image ghcr.io/myorg/my-agent:latest --target railway

Path B: Base Runtime (no-code users)
  lucid deploy --runtime base --model gpt-4o --prompt "..." --target docker
  → Pre-built image configured via env vars. No code generation.

Path C: External Registration (already running agents)
  POST /v1/passports { target: { type: "self_hosted" } }
  PATCH /v1/passports/:id/endpoints { invoke_url: "https://..." }
  → Already operational today. No changes needed.
```

### Architecture After Redesign

```
                    ┌─────────────────────────┐
                    │   openapi.yaml (source)  │
                    │   171+ endpoints         │
                    └────────────┬────────────┘
                                 │ Speakeasy generates
                    ┌────────────▼────────────┐
                    │  @lucid/sdk (TypeScript) │
                    │  @lucid/sdk-python       │
                    └────────────┬────────────┘
                                 │ used by
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
  ┌───────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
  │ User's agent   │   │ Base runtime    │   │ External agent  │
  │ (any framework)│   │ (pre-built img) │   │ (self-hosted)   │
  │ + @lucid/sdk   │   │ + SDK built-in  │   │ calls API       │
  └───────┬────────┘   └────────┬────────┘   └────────┬────────┘
          │                      │                      │
          ▼                      ▼                      ▼
  ┌──────────────────────────────────────────────────────────┐
  │              Deployers (unchanged — real APIs)            │
  │  Docker │ Railway │ Akash │ Phala │ io.net │ Nosana      │
  └──────────────────────────────────────────────────────────┘
          │
          ▼
  ┌──────────────────────────────────────────────────────────┐
  │           Deployment Control Plane (unchanged)           │
  │  IDeploymentStore │ Reconciler │ LeaseManager │ Webhooks │
  └──────────────────────────────────────────────────────────┘
```

---

## Changes Required

### 1. OpenAPI Update + SDK Regeneration

**Add 14 missing v1 endpoints to openapi.yaml:**

Memory (7):
- `GET /v1/memory/entries/{id}` — read single entry
- `GET /v1/memory/entries` — list entries with filters
- `POST /v1/memory/sessions/{id}/close` — close session
- `GET /v1/memory/sessions/{id}/context` — session context
- `GET /v1/memory/provenance/{agent_id}/{namespace}` — provenance chain
- `GET /v1/memory/provenance/entry/{id}` — single entry provenance
- `GET /v1/memory/stats/{agent_id}` — memory diagnostics

Deployment (5):
- `POST /v1/agents/{passportId}/deploy/blue-green` — initiate blue-green
- `POST /v1/agents/{passportId}/promote` — promote blue→primary
- `POST /v1/agents/{passportId}/rollback` — rollback
- `GET /v1/agents/{passportId}/blue` — blue status
- `POST /v1/agents/{passportId}/blue/cancel` — cancel blue

Other (2):
- `DELETE /v1/a2a/{passportId}/tasks/{taskId}` — A2A task cleanup
- `POST /v1/webhooks/{provider}` — provider webhooks

**Add new deploy-by-image endpoint:**
- `POST /v1/agents/deploy` — accepts `{ image, target, owner, config }` instead of requiring generated code

Then: `speakeasy generate` → updated SDK.

**SDK naming clarification:**
- `raijin-labs-lucid-ai` — current Speakeasy-generated npm package (to be renamed `@lucid/sdk`)
- `@lucid-l2/sdk` — internal engine SDK (different, lives in offchain/packages/sdk/)
- The Speakeasy SDK is the public-facing one. The base runtime image includes this SDK.
- Python SDK: `speakeasy generate --lang python` → `lucid-sdk` on PyPI.

### 2. Deployer Refactor — Accept Docker Image References

**Current state (per-deployer audit):**
- Railway, Phala, io.net, Nosana: already check `config.target.image_ref` or `artifact.env_vars.AGENT_IMAGE_REF` — image-ref path partially works
- Docker: **no image-ref support** — always does `build: .` from generated files
- Akash: `resolveImageRef()` ignores user-supplied image, falls back to `node:20-slim`

**New: formalize ImageDeployInput type:**
```typescript
interface ImageDeployInput {
  image: string;          // e.g., "ghcr.io/myorg/my-agent:latest"
  env_vars: Record<string, string>;
  port?: number;          // default 3100, user-configurable for BYOI
  entrypoint?: string[];  // override only if user specifies (null = use image's CMD)
  registry_auth?: {       // for private registries
    username: string;
    password: string;      // or token
  };
}

// Extended deployer interface
deploy(input: RuntimeArtifact | ImageDeployInput, config: DeploymentConfig, passportId: string): Promise<DeploymentResult>
```

**Per-deployer changes needed:**

| Deployer | Current State | Work Needed |
|---|---|---|
| **Docker** | No image-ref support (always `build: .`) | **Full implementation**: generate `docker-compose.yml` with `image:` directive instead of `build: .`; pass env vars; use user's port |
| **Railway** | Checks `config.target.image_ref` ✓ | Minor: formalize via `ImageDeployInput` type |
| **Akash** | `resolveImageRef()` ignores user image | **Fix**: check `ImageDeployInput.image` first, before falling back to imageBuilder |
| **Phala** | Checks image ref ✓ | Minor: formalize type. **Security debt**: env var "encryption" is base64, not real encryption. Fix with `app_env_encrypt_pubkey` before claiming TEE security. |
| **io.net** | Checks image ref ✓ | **Fix entrypoint**: don't override image's CMD when using BYOI (only set entrypoint when user explicitly provides one) |
| **Nosana** | Checks image ref ✓ | **Fix entrypoint**: same issue as io.net — don't override image's CMD for BYOI |

**Port handling for BYOI:** User's image may listen on any port. `ImageDeployInput.port` specifies the container port. Deployers map this to the health check and routing config. Default 3100 for base runtime; required field for BYOI if not 3100.

### 3. agentDeploymentService Refactor

**Coupling issues to address:**
- `runtime_adapter` field in Deployment record — required by store schema. For image-based deploys, set to `'user-image'` or `'base-runtime'` (not an adapter name).
- `previewAgent()` method calls `adapter.generate()` — keep working for legacy/examples, but don't require for image-based path.
- `files` in `DeployAgentResult` — return empty `{}` for image-based deploys.
- `DeployAgentInput.descriptor` — still required for base runtime (provides model, prompt, tools). For BYOI, make optional.

**New method: `deployImage()`** (separate from existing `deployAgent()`):
```typescript
interface DeployImageInput {
  image: string;                    // Docker image ref
  target: DeploymentTargetType;     // docker, railway, akash, etc.
  owner: string;                    // wallet address
  name: string;                     // agent name
  passport_id?: string;             // use existing passport, or create new
  port?: number;                    // container port (default 3100)
  env_vars?: Record<string, string>; // additional env vars
  registry_auth?: { username: string; password: string };
}
```

**Flow for `deployImage()` (BYOI):**
```
1. Validate input (image URL, target, owner)
2. Create agent passport if not provided (type: agent, target: self_hosted or target)
3. Create wallet (if enabled)
4. Create deployment record (pending, runtime_adapter='user-image')
5. Build ImageDeployInput with Lucid env vars injected:
   - LUCID_API_URL, LUCID_PASSPORT_ID, LUCID_API_KEY
   - Plus user's additional env_vars
6. Call deployer.deploy(imageInput)
7. Transition to running/failed
```

**Flow for `deployBaseRuntime()` (no-code):**
```
1. Validate input (model, prompt, tools)
2. Create agent passport
3. Create deployment record (pending, runtime_adapter='base-runtime')
4. Build ImageDeployInput:
   - image = ghcr.io/lucid-fdn/agent-runtime:latest (or pinned version)
   - env vars: LUCID_MODEL, LUCID_PROMPT, LUCID_TOOLS, LUCID_API_URL, etc.
5. Call deployer.deploy(imageInput)
6. Transition to running/failed
```

**Existing `deployAgent()` stays** (backward compat) but is deprecated. New CLI flags route to the new methods.

### 4. CLI Update

```bash
# Path A: Deploy your own image
lucid deploy --image ghcr.io/myorg/my-agent:latest \
  --target railway \
  --owner 0x1234...

# Path B: No-code with base runtime
lucid deploy --runtime base \
  --model gpt-4o \
  --prompt "You are a helpful code review agent" \
  --tools web-search,code-exec \
  --target docker

# Existing commands (unchanged)
lucid deploy:status <passportId>
lucid deploy:logs <passportId>
lucid deploy:list
lucid deploy:terminate <passportId>
lucid deploy:targets
```

### 5. Base Runtime Image

**One pre-built, maintained, versioned Docker image:**

`ghcr.io/lucid-fdn/agent-runtime:latest`

**What's inside:**
- Node.js 20 slim
- Express server with standard endpoints:
  - `GET /health` — health check
  - `POST /run` — single inference
  - `POST /v1/chat/completions` — OpenAI-compatible
  - `GET /.well-known/agent.json` — A2A discovery (if enabled)
- AI SDK v6 for LLM orchestration (routes through TrustGate)
- `@lucid/sdk` pre-integrated (receipts auto-emit, memory auto-persist)
- MCP tool bridge (calls MCPGate for registered tools)

**Configured entirely via env vars:**
- `LUCID_MODEL` — model passport ID or model string
- `LUCID_PROMPT` — system prompt
- `LUCID_TOOLS` — comma-separated tool passport IDs
- `LUCID_API_URL` — Lucid API endpoint
- `LUCID_PASSPORT_ID` — auto-injected by deployer
- `LUCID_API_KEY` — auto-injected by deployer
- `TRUSTGATE_URL` — LLM gateway
- `MCPGATE_URL` — tool gateway
- `PORT` — server port (default 3100)

**Versioning:** Semantic versioning. Tags: `latest`, `v1`, `v1.2.3`.
- CLI deploys with pinned version by default (e.g., `ghcr.io/lucid-fdn/agent-runtime:v1.2.3`).
- The version is stored in `descriptor_snapshot` in the deployment record.
- `lucid deploy:update <passportId>` explicitly pulls newer version (opt-in, not automatic).
- No auto-update via reconciler — runtime image changes are explicit and intentional.
- `--runtime base:latest` available for users who want latest (at their own risk).

### 6. Code to Move to examples/

Move to `examples/adapters/` (not delete — useful as reference):
- `VercelAIAdapter.ts`
- `OpenClawAdapter.ts`
- `OpenAIAgentsAdapter.ts`
- `LangGraphAdapter.ts`
- `CrewAIAdapter.ts`
- `GoogleADKAdapter.ts`
- `DockerAdapter.ts`
- `imageBuilder.ts`
- `descriptorBuilder.ts`
- `runtimeAdapters.test.ts`

Each becomes a documented example: "How to build a Lucid agent with [framework]".

---

## What Doesn't Change

- **6 deployers** — real API integrations, keep as-is (minor refactor to accept ImageRef)
- **Deployment control plane** — IDeploymentStore, reconciler, lease manager, webhooks
- **Passport system** — identity, NFT, share tokens
- **Receipt pipeline** — signing, MMR, anchoring
- **Memory system** — local-first SQLite, DePIN snapshots, projection
- **Payment system** — x402, splits, escrow
- **Reputation system** — on-chain + off-chain + Oracle
- **Path C (self-hosted)** — already works, no changes needed

---

## Competitive Advantage (300% Ahead)

### What We Have That Nobody Else Does

| Capability | AgentOps | Dify | Phala | OpenClaw | Mastra | **Lucid** |
|---|---|---|---|---|---|---|
| Multi-provider DePIN deploy | - | - | Phala only | Local only | Vercel | **6 providers** |
| Cryptographic receipts | - | - | TEE attestation | - | - | **Every call → MMR → on-chain** |
| Portable agent memory | - | DB-locked | - | Local files | - | **Local-first + DePIN + portable** |
| Built-in payment rails | - | - | - | - | - | **x402 + splits + share tokens** |
| Reputation from real traffic | - | - | - | - | - | **Oracle → on-chain** |
| On-chain identity | - | - | - | - | - | **Passports on Solana + EVM** |
| Framework agnostic SDK | CrewAI/LC | Dify only | Any container | OC only | TS only | **Any framework, any language** |
| Verifiable execution proofs | - | - | TEE only | - | - | **Cryptographic, cross-chain** |

### The Moat

1. **Network effect**: Every agent using `@lucid/sdk` feeds receipts into the system → reputation oracle improves → more agents join
2. **Traffic data**: Real usage data is proprietary (Lucid Cloud / Oracle). Nobody else has proof-backed reputation from actual inference traffic.
3. **Protocol layer**: Lucid is TCP/IP for AI — identity + verification + routing. Not locked to one runtime or one cloud.
4. **Progressive decentralization**: Identity on-chain today. Memory agent-owned today. Matching and settlement moving on-chain. Full autonomy path.

### Developer Experience Comparison

```bash
# AgentOps (monitoring only)
import agentops; agentops.init()
# → dashboards, cost tracking. No identity, no receipts, no payment.

# Dify (locked to Dify runtime)
docker compose up  # Dify platform
# → visual builder, but locked to Dify. No DePIN. No verification.

# Phala (raw compute, no agent awareness)
phala deploy --image my-agent
# → runs in TEE. No receipts, no memory, no payment rails.

# Lucid (full stack)
npm install @lucid/sdk
# Add 2 lines to your agent
lucid deploy --image my-agent --target akash
# → identity + receipts + memory + payment + reputation + DePIN deploy
# → verifiable execution proofs anchored on Solana + EVM
# → portable memory backed by Arweave/Lighthouse
# → revenue splits + share tokens + x402 payment gates
```

---

## Implementation Phases

### Phase 1: OpenAPI + SDK (1-2 days)
- Add 14 missing endpoints to openapi.yaml
- Add `POST /v1/agents/deploy` (image-based)
- Regenerate SDK with Speakeasy
- Update SDK examples

### Phase 2: Deployer Refactor (2-3 days)
- Add ImageDeployInput type
- Update 6 deployers to accept image refs
- Refactor agentDeploymentService (remove code-gen steps)
- Update CLI with `--image` and `--runtime` flags
- Move code-gen adapters to examples/

### Phase 3: Base Runtime Image (2-3 days)
- Build `lucid-agent-runtime` Docker image
- Express server + AI SDK + Lucid SDK pre-integrated
- Env-var configuration
- Health check, /run, /chat/completions endpoints
- Push to GHCR
- Test end-to-end: CLI → deployer → running agent → receipts flowing

### Phase 4: Documentation + Polish (1 day)
- Update CLAUDE.md
- Competitive advantage doc
- SDK quickstart guide
- Migration guide (old code-gen → new image-based)

---

## Test Plan

- [ ] `lucid deploy --image nginx:latest --target docker` → container runs, health check passes
- [ ] `lucid deploy --runtime base --model test --prompt "hello" --target docker` → base runtime starts
- [ ] `lucid deploy --image my-agent --target railway` → Railway service created, URL returned
- [ ] SDK: `lucid.agents.deploy({ image: "...", target: "akash" })` → works via Speakeasy SDK
- [ ] Existing tests still pass (deployers, control plane, state machine)
- [ ] Path C still works (self-hosted passport + endpoints)
- [ ] Base runtime: POST /run → receipt created → MMR updated
- [ ] Base runtime: memory persists across requests
