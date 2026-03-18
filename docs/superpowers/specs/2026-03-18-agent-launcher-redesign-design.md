# Agent Launcher Redesign — SDK-First, Image-Based Deployment

**Date:** 2026-03-18
**Status:** Draft (architect-reviewed)
**Goal:** Replace code-generation agent launcher with three industry-standard paths: SDK wrapper, bring-your-own-image deployment, and pre-built base runtime. Position Lucid as the unavoidable verification layer for AI execution — not just a deploy tool.

---

## Strategic Principle

> **Deployment is an entry point, not the product.**
>
> Lucid's moat is receipts, reputation, routing intelligence, and the identity-payment graph.
> Deployment exists to funnel agents into the verification network.
> Every design decision must enforce: if you use Lucid, you automatically produce receipts.

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

### Three Activation Paths

**Naming: `lucid launch` not `lucid deploy`** — we are activating agents in a verified network, not deploying containers.

```
Path A: SDK Wrapper (developers with existing agents)
  npm install @lucid/sdk → add 2 lines → receipts + memory + identity flow
  lucid launch --image ghcr.io/myorg/my-agent:latest --target railway

Path B: Base Runtime (no-code users)
  lucid launch --runtime base --model gpt-4o --prompt "..." --target docker
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
  │            TrustGate (mandatory LLM routing)             │
  │     All inference → receipts → MMR → on-chain            │
  └──────────────────────────────────────────────────────────┘
          │
          ▼
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

## Critical Design Rules (from architect review)

### Rule 1: TrustGate Routing is Default and Hardwired

All LLM calls MUST route through TrustGate by default. If agents bypass TrustGate:
- No receipts
- No traffic data
- No reputation
- No moat

**In base runtime:**
```typescript
const model = createOpenAI({
  baseURL: process.env.TRUSTGATE_URL,  // always TrustGate, never direct provider
  apiKey: process.env.TRUSTGATE_API_KEY,
});
// Direct provider calls blocked unless LUCID_ALLOW_DIRECT_PROVIDER=true
```

**In SDK:**
```typescript
const lucid = new Lucid({ apiKey: 'lk_...' })
// lucid.run() always routes through TrustGate
// lucid.run({ directProvider: true }) only if explicitly opted out
```

### Rule 2: SDK Makes Receipts Unavoidable

If you use Lucid, you automatically produce receipts. No extra work.

```typescript
const lucid = new Lucid({ apiKey: 'lk_...' })
const result = await lucid.run({
  model: "gpt-4o",
  input: "Review this code..."
})
// Behind the scenes (automatic, zero config):
// 1. Routed through TrustGate
// 2. Receipt created (SHA-256 + Ed25519)
// 3. MMR append
// 4. Memory optionally stored
// 5. Identity attached to receipt
```

Receipt creation is not opt-in. It's the default. `LUCID_RECEIPTS_ENABLED=false` exists as kill switch but is NOT documented in quickstart.

### Rule 3: BYOI Verification Modes

Not all BYOI users will integrate the SDK. Support graduated verification:

```bash
lucid launch --image my-agent --target railway --verification full    # default
lucid launch --image my-agent --target railway --verification minimal
```

| Mode | What's verified | How |
|---|---|---|
| `full` | Receipts + memory + payments | Agent integrates `@lucid/sdk`, calls TrustGate |
| `minimal` | Health + metadata + existence | Lucid pings health endpoint, tracks uptime. No receipts. |

`full` is the default. `minimal` is the onboarding ramp — gets agents into the network with basic reputation, incentivizes SDK integration for full reputation scores.

### Rule 4: Base Runtime is the Trojan Horse

The base runtime is not just convenience — it's the distribution engine for the entire ecosystem. It must be:
- Insanely easy (one command)
- Opinionated toward Lucid flows (TrustGate hardwired, receipts automatic)
- Feature-rich out of the box

**Built-in behaviors (all automatic, zero config):**
- Auto receipts on every inference call
- Auto memory lanes (episodic per session, semantic extracted)
- Auto payment hooks (x402 if pricing configured on passport)
- Auto tool gateway integration (MCPGate)
- Auto identity propagation (passport ID in every response header)
- Auto health reporting to deployment control plane

### Rule 5: Version Pinning Tied to Reputation

Reputation scores are tied to:
- Agent passport ID
- Runtime version (base runtime tag)
- Config hash (model + prompt + tools)

This enables:
- "v2 of this agent performs worse than v1"
- "This runtime version has stability issues"
- Reputation continuity across redeploys (same config = same reputation lineage)

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

**Add new launch-by-image endpoint:**
- `POST /v1/agents/launch` — accepts `{ image, target, owner, verification, config }` instead of requiring generated code

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
  verification: 'full' | 'minimal';  // verification mode
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

**New method: `launchImage()`** (separate from existing `deployAgent()`):
```typescript
interface LaunchImageInput {
  image: string;                    // Docker image ref
  target: DeploymentTargetType;     // docker, railway, akash, etc.
  owner: string;                    // wallet address
  name: string;                     // agent name
  passport_id?: string;             // use existing passport, or create new
  port?: number;                    // container port (default 3100)
  env_vars?: Record<string, string>; // additional env vars
  verification?: 'full' | 'minimal'; // default: full
  registry_auth?: { username: string; password: string };
}
```

**Flow for `launchImage()` (BYOI):**
```
1. Validate input (image URL, target, owner)
2. Create agent passport if not provided (type: agent, target: self_hosted or target)
3. Create wallet (if enabled)
4. Create deployment record (pending, runtime_adapter='user-image')
5. Build ImageDeployInput with Lucid env vars injected:
   - LUCID_API_URL, LUCID_PASSPORT_ID, LUCID_API_KEY
   - TRUSTGATE_URL (for SDK-integrated agents)
   - LUCID_VERIFICATION_MODE=full|minimal
   - Plus user's additional env_vars
6. Call deployer.deploy(imageInput)
7. Transition to running/failed
8. If verification=full: schedule health + receipt verification check after 5 min
```

**Flow for `launchBaseRuntime()` (no-code):**
```
1. Validate input (model, prompt, tools)
2. Create agent passport
3. Create deployment record (pending, runtime_adapter='base-runtime')
4. Compute config_hash = SHA-256(model + prompt + tools) for reputation lineage
5. Build ImageDeployInput:
   - image = ghcr.io/lucid-fdn/agent-runtime:v{pinned} (version from CLI)
   - env vars: LUCID_MODEL, LUCID_PROMPT, LUCID_TOOLS
   - env vars: LUCID_API_URL, LUCID_PASSPORT_ID, LUCID_API_KEY
   - env vars: TRUSTGATE_URL (hardwired, non-optional)
   - LUCID_VERIFICATION_MODE=full (always full for base runtime)
6. Call deployer.deploy(imageInput)
7. Transition to running/failed
```

**Existing `deployAgent()` stays** (backward compat) but is deprecated. New CLI flags route to the new methods.

### 4. CLI Update

**Rename `deploy` → `launch`** (activating agents in a verified network, not deploying containers):

```bash
# Path A: Launch your own image
lucid launch --image ghcr.io/myorg/my-agent:latest \
  --target railway \
  --owner 0x1234... \
  --verification full       # default

# Path A with minimal verification (onboarding ramp)
lucid launch --image ghcr.io/myorg/my-agent:latest \
  --target docker \
  --verification minimal

# Path B: No-code with base runtime (always full verification)
lucid launch --runtime base \
  --model gpt-4o \
  --prompt "You are a code review specialist" \
  --tools web-search,code-exec \
  --target docker

# Status/management commands
lucid status <passportId>
lucid logs <passportId> [--tail 100]
lucid list [--status running] [--target docker]
lucid terminate <passportId>
lucid targets                               # List available providers
lucid update <passportId>                   # Explicit runtime version update
```

**`deploy` kept as alias** for backward compat but docs use `launch`.

### 5. Base Runtime Image (The Trojan Horse)

**One pre-built, maintained, versioned Docker image:**

`ghcr.io/lucid-fdn/agent-runtime:v1.0.0`

**What's inside:**
- Node.js 20 slim
- Express server with standard endpoints:
  - `GET /health` — health check (reports to deployment control plane)
  - `POST /run` — single inference (receipt auto-created)
  - `POST /v1/chat/completions` — OpenAI-compatible (receipt auto-created)
  - `GET /.well-known/agent.json` — A2A discovery (if enabled)
- AI SDK v6 for LLM orchestration
- **TrustGate routing hardwired** — all LLM calls go through TrustGate, direct provider calls blocked by default
- `@lucid/sdk` pre-integrated with automatic behaviors:
  - Auto receipts on every inference (SHA-256 + Ed25519 + MMR append)
  - Auto memory lanes (episodic per session, semantic extraction)
  - Auto payment hooks (x402 if pricing configured on passport)
  - Auto tool gateway integration (MCPGate for registered tools)
  - Auto identity propagation (X-Lucid-Passport-Id header on every response)
  - Auto health reporting to deployment control plane
- MCP tool bridge (calls MCPGate for registered tools)

**Configured entirely via env vars:**
- `LUCID_MODEL` — model passport ID or model string
- `LUCID_PROMPT` — system prompt
- `LUCID_TOOLS` — comma-separated tool passport IDs
- `LUCID_API_URL` — Lucid API endpoint
- `LUCID_PASSPORT_ID` — auto-injected by deployer
- `LUCID_API_KEY` — auto-injected by deployer
- `TRUSTGATE_URL` — LLM gateway (hardwired, not optional)
- `TRUSTGATE_API_KEY` — auto-injected by deployer
- `MCPGATE_URL` — tool gateway
- `PORT` — server port (default 3100)
- `LUCID_ALLOW_DIRECT_PROVIDER` — escape hatch, default `false`, not documented in quickstart
- `LUCID_MEMORY_ENABLED` — default `true`
- `LUCID_MEMORY_LANES` — default `episodic,semantic`

**Versioning:** Semantic versioning. Tags: `latest`, `v1`, `v1.0.0`.
- CLI launches with pinned version by default (e.g., `ghcr.io/lucid-fdn/agent-runtime:v1.0.0`).
- The version is stored in `descriptor_snapshot` in the deployment record.
- `lucid update <passportId>` explicitly pulls newer version (opt-in, not automatic).
- No auto-update via reconciler — runtime image changes are explicit and intentional.
- `--runtime base:latest` available for users who want latest (at their own risk).

**Reputation lineage:** `config_hash = SHA-256(model + prompt + tools + runtime_version)` stored in deployment record. Same config = same reputation lineage across redeploys. Version changes start new lineage branch.

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

## The Flywheel

```
Agents use @lucid/sdk or base runtime
  → All inference routes through TrustGate (hardwired)
    → Every call produces a cryptographic receipt (unavoidable)
      → Receipts feed into reputation oracle (Lucid Cloud)
        → Better reputation data → better routing intelligence
          → More agents join because Lucid-verified agents are more trusted
            → Network effect compounds
              → Lucid Cloud revenue grows from traffic data
```

**Deployment is the entry point. Verification is the product. Traffic data is the moat.**

---

## Implementation Phases

### Phase 1: OpenAPI + SDK (1-2 days)
- Add 14 missing endpoints to openapi.yaml
- Add `POST /v1/agents/launch` (image-based)
- Regenerate SDK with Speakeasy
- Update SDK examples

### Phase 2: Deployer Refactor (2-3 days)
- Add ImageDeployInput type with verification mode
- Fix DockerDeployer (full image-ref implementation)
- Fix AkashDeployer (check user image before imageBuilder)
- Fix io.net/Nosana entrypoint override
- Refactor agentDeploymentService (add launchImage + launchBaseRuntime)
- Update CLI: `lucid launch` + `--image` + `--runtime` + `--verification`
- Move code-gen adapters to examples/

### Phase 3: Base Runtime Image (2-3 days)
- Build `lucid-agent-runtime` Docker image
- Express server + AI SDK + Lucid SDK pre-integrated
- TrustGate hardwired, receipts automatic, memory lanes automatic
- Env-var configuration
- Health check, /run, /chat/completions endpoints
- Push to GHCR
- Test end-to-end: CLI → deployer → running agent → receipts flowing

### Phase 4: Documentation + Polish (1 day)
- Update CLAUDE.md
- Competitive advantage doc (done)
- SDK quickstart guide
- Migration guide (old code-gen → new image-based)
- Rename deploy → launch across docs

---

## Test Plan

- [ ] `lucid launch --image nginx:latest --target docker` → container runs, health check passes
- [ ] `lucid launch --image nginx:latest --target docker --verification minimal` → minimal mode works
- [ ] `lucid launch --runtime base --model test --prompt "hello" --target docker` → base runtime starts
- [ ] `lucid launch --image my-agent --target railway` → Railway service created, URL returned
- [ ] SDK: `lucid.agents.launch({ image: "...", target: "akash" })` → works via Speakeasy SDK
- [ ] Existing tests still pass (deployers, control plane, state machine)
- [ ] Path C still works (self-hosted passport + endpoints)
- [ ] Base runtime: POST /run → TrustGate called → receipt created → MMR updated
- [ ] Base runtime: memory persists across requests (episodic lane)
- [ ] Base runtime: LUCID_ALLOW_DIRECT_PROVIDER=false blocks direct LLM calls
- [ ] Base runtime: X-Lucid-Passport-Id header present on all responses
- [ ] Verification mode: full agent checked for receipt emission after 5 min
- [ ] Reputation: config_hash stored in deployment, same config = same lineage
