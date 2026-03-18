# Lucid Layer

## What This Is
Verifiable AI execution layer — Solana on-chain programs (Anchor/Rust) + Express offchain API. Blockchain-anchored infrastructure giving AI assets (models, agents, tools, compute, datasets) provable identity, cryptographic receipts, and reputation backed by real traffic data.

## Quick Start
```bash
# Backend API
cd offchain && npm install && npm start     # Port 3001

# Solana programs
anchor build
anchor deploy --provider.cluster devnet

# Tests
cd tests && npm test                        # Mocha on-chain (6 programs)
cd offchain && npm test                     # Jest API (103 suites, 1683 tests)
```

## Architecture

```
Client → /v1/chat/completions → Passport matching → LLM execution
  → Receipt signing (Ed25519) → MMR append → Epoch finalization
  → commit_epoch on Solana → Verifiable proof available
```

### Six Solana Programs
| Program | Devnet ID | Purpose |
|---------|-----------|---------|
| `thought_epoch` | `8QXiFjguJT4PLVzH6BYNMHXZ3eLRaoF8cwx23EBc44Q6` | MMR root commitment (single/batch/v2) |
| `lucid_passports` | `38yaXUezrbLyLDnAQ5jqFXPiFurr8qhw19gYnE6H9VsW` | AI asset registry + x402 payment gating |
| `gas_utils` | `EzuUhxtNAz1eRfAPypm6eAepe8fRQBrBPSo4Qcp1w3hm` | Token burn/split CPI + on-chain distribution |
| `lucid_agent_wallet` | `AJGpTWXbhvdYMxSah6GAKzykvfkYo2ViQpWGMbimQsph` | PDA wallets, policy, escrow, splits, sessions |
| `lucid_zkml_verifier` | `69cJRFGWijD1FdapQ2vz7VP6x2jcXRQyBws9VzzPpqAN` | Groth16 zkML proof verification + bloom filter dedup |
| `lucid_reputation` | `4FWEH1XQb7p1pU9r8Ap8xomDYVxdSdwk6fFT8XD63G3A` | On-chain reputation (feedback, validation, revocation) |

### Offchain API (Express, port 3001)

**Identity:**
- `/v1/passports` — CRUD for model/compute/tool/agent/dataset passports
- `/v1/passports/:id/token/launch` — Launch share token
- `/v1/passports/:id/token/airdrop` — Revenue airdrop

**Inference:**
- `/v1/chat/completions` — OpenAI-compatible inference
- `/v1/models` — Model listing (`?available=true|false` tri-state filter)
- `/v1/match` — Policy-based compute matching
- `/v1/compute/nodes/heartbeat` — Compute heartbeat (POST, 30s TTL)

**Receipt & Epoch:**
- `/v1/receipts` — Create, verify, prove cryptographic receipts
- `/v1/epochs` — Epoch management and multi-chain anchoring

**Memory (v3 — local-first):**
- `/v1/memory/episodic` — Episodic memory (POST)
- `/v1/memory/semantic` — Semantic memory (POST)
- `/v1/memory/procedural` — Procedural memory (POST)
- `/v1/memory/entity` — Entity memory (POST)
- `/v1/memory/trust-weighted` — Trust-weighted memory (POST)
- `/v1/memory/temporal` — Temporal memory (POST)
- `/v1/memory/recall` — Two-stage semantic recall (POST)
- `/v1/memory/compact` — Tiered compaction (POST)
- `/v1/memory/sessions` — Session CRUD
- `/v1/memory/snapshots` — DePIN snapshot/restore
- `/v1/memory/verify` — Hash chain integrity
- `/v1/memory/health` — Store diagnostics

**Anchoring (unified DePIN):**
- `/v1/anchors` — Query anchor registry
- `/v1/anchors/:id` — Single record
- `/v1/anchors/:id/lineage` — Parent chain walk
- `/v1/anchors/:id/verify` — CID verification
- `/v1/anchors/cid/:cid` — Reverse CID lookup

**Payment:**
- `/v1/assets/:passportId/pricing` — Asset pricing CRUD
- `/v1/assets/:passportId/revenue` — Revenue summary
- `/v1/payouts` — Revenue splits
- `/v1/config/payment` — x402 config
- `/v1/access/subscribe` — x402-gated subscription

**System:**
- `/health` — Health check (DB, Redis, Nango)
- `/api/oauth` — Nango OAuth
- `/api/hyperliquid`, `/api/solana` — DeFi integrations

### Model Availability Filter (`?available=true|false`)
Tri-state filter (industry standard):
- `?available=true` → only models that can serve inference now
- `?available=false` → only models missing compute (useful for debugging)
- Omitted → all models regardless of availability

Availability check per model:
- **`format=api`** → always available (routed through TrustGate, no compute needed)
- **`format=safetensors`/`gguf`** → requires at least one healthy compute node with:
  1. Compatible runtime (`runtimeCompatible()`)
  2. Sufficient hardware — VRAM, context length (`hardwareCompatible()`)
  3. Recent heartbeat within 30s (`ComputeRegistry.isHealthy()`)

Implementation: `hasAvailableCompute()` in `matchingEngine.ts` — short-circuits on first match.

### Compute Heartbeat System
In-memory registry with 30s TTL. Compute nodes send periodic heartbeats to stay alive.

- **POST** `/v1/compute/nodes/heartbeat` — body: `{ compute_passport_id, status: "healthy"|"degraded"|"down", queue_depth?, p95_ms_estimate? }`
- **GET** `/v1/compute/nodes/:id/health` — returns live state or 503 if expired
- Registry: `ComputeRegistry` singleton in `computeRegistry.ts` (in-memory Map, no DB)
- Used by: `/v1/match`, `/v1/route`, and `?available=true|false` model filtering
- MCP tool: `lucid_heartbeat` in `mcpServer.ts` (alternative to REST endpoint)

### Key Algorithms
- **MMR**: SHA-256, right-to-left peak bagging. Epoch finalization: >100 receipts OR >1 hour
- **Receipt hash**: `SHA-256(JCS(receipt))` — RFC 8785 canonical JSON
- **Signing**: Ed25519 via tweetnacl (`LUCID_ORCHESTRATOR_SECRET_KEY`)
- **Gas**: iGas (1 LUCID/call) + mGas (5 LUCID/root). Batch: 2+5=7 LUCID total
- **Revenue split**: Default 70% compute / 20% model / 10% protocol (basis points)
- **x402 payment**: HTTP 402 protocol — server returns payment instructions, agent pays USDC on-chain, retries with `X-Payment-Proof` header. Facilitator-agnostic (DirectFacilitator, CoinbaseFacilitator, PayAIFacilitator). Dynamic pricing resolved per-asset from `asset_pricing` table. SpentProofsStore (Redis/in-memory) prevents replay.
- **Compute matching**: Runtime compat → hardware check → policy eval → score → select

### DePIN & Anchoring (Unified)

**Rule: No feature touches `IDepinStorage` directly.** All DePIN uploads go through the Anchoring Control Plane.

```
Any feature → AnchorDispatcher.dispatch() → IDepinStorage → AnchorRegistry
```

**Storage Providers** (`IDepinStorage` interface, swappable):

| Provider | Env Value | Tier | Use Case |
|----------|-----------|------|----------|
| `ArweaveStorage` | `arweave` | Permanent | Immutable artifacts (epochs, passports, deploys) |
| `LighthouseStorage` | `lighthouse` | Evolving | Mutable/supersedable (memory snapshots, MMR checkpoints) |
| `MockStorage` | `mock` | Either | Dev/test (local SHA-256 files) |

**Anchoring Control Plane** (`engine/src/anchoring/`):

All 7 producers use `getAnchorDispatcher().dispatch()`:

| Producer | Artifact Type | Storage Tier |
|----------|--------------|-------------|
| `epochArchiver` | `epoch_bundle` | permanent |
| `anchoringService` | `epoch_proof` | permanent |
| `archivePipeline` | `memory_snapshot` | evolving |
| `agentDeploymentService` | `deploy_artifact` | permanent |
| `passportSyncService` | `passport_metadata` | permanent |
| `passportManager` | `nft_metadata` | permanent |
| `mmrCheckpoint` | `mmr_checkpoint` | evolving |

**Key behaviors:**
- `dispatch()` returns `AnchorResult | null` — null when `DEPIN_UPLOAD_ENABLED=false`. All callers MUST null-guard.
- Content hash: SHA-256 of `canonicalJson(payload)` — always populated, never null.
- Dedup: UNIQUE constraint on `(artifact_type, artifact_id, content_hash)`. Same payload uploaded twice → returns existing record.
- Lineage: `parent_anchor_id` for cross-reference (e.g., snapshot supersedes prior snapshot).
- Registry is L3 projection — rebuildable from on-chain + DePIN.

**Components:**

| Component | File | Purpose |
|-----------|------|---------|
| `AnchorDispatcher` | `dispatcher.ts` | Upload to DePIN + write registry record |
| `IAnchorRegistry` | `registry.ts` | CRUD for `anchor_records` (InMemory + Postgres) |
| `AnchorVerifier` | `verifier.ts` | Check CID existence on provider |
| Factory | `index.ts` | `getAnchorDispatcher()`, `getAnchorRegistry()`, `getAnchorVerifier()` |

**Routes:**
- `GET /v1/anchors?agent_passport_id=X&artifact_type=Y` — query registry
- `GET /v1/anchors/:id` — single record
- `GET /v1/anchors/:id/lineage` — walk parent chain
- `GET /v1/anchors/cid/:cid` — reverse CID lookup
- `POST /v1/anchors/:id/verify` — check CID still exists on provider

**Env:** `DEPIN_PERMANENT_PROVIDER`, `DEPIN_EVOLVING_PROVIDER` (default: `mock`). `DEPIN_UPLOAD_ENABLED=false` (kill switch). `ANCHOR_REGISTRY_STORE=postgres|memory`.

### Agent Activation (3 Paths)

Three ways to activate an agent in the Lucid verified network. No code generation. Deployment is the entry point — verification is the product.

**Strategic principle:** All inference routes through TrustGate by default. Every call produces a cryptographic receipt. Receipts are unavoidable, not opt-in.

**Path A: Bring Your Own Image (developers)**
```bash
lucid launch --image ghcr.io/myorg/my-agent:latest --target railway --owner 0x...
```
Lucid deploys your Docker image to the target provider. Injects `LUCID_API_URL`, `LUCID_PASSPORT_ID`, `LUCID_API_KEY`, `TRUSTGATE_URL` as env vars. Your agent calls the Lucid API via `@lucid/sdk` for receipts, memory, payment. Supports `--verification full|minimal` (default: full).

**Path B: Base Runtime (no-code, Trojan horse)**
```bash
lucid launch --runtime base --model gpt-4o --prompt "You are a helpful agent" --target docker
```
Deploys pre-built `ghcr.io/lucid-fdn/agent-runtime:v{pinned}` image. TrustGate hardwired (non-optional), receipts automatic, memory lanes automatic, payment hooks automatic. Configured via env vars (`LUCID_MODEL`, `LUCID_PROMPT`, `LUCID_TOOLS`). Always full verification.

**Path C: External Registration (self-hosted, already operational)**
```bash
POST /v1/passports { type: "agent", deployment_config: { target: { type: "self_hosted" } } }
PATCH /v1/passports/:id/endpoints { invoke_url: "https://my-agent.com/run" }
```
No deployment. Just identity + reputation for an already-running agent.

**6 Deployers** (`engine/src/compute/deploy/`):
| Deployer | API | What it does |
|----------|-----|-------------|
| Docker | Local | Writes docker-compose.yml, runs `docker compose up` |
| Railway | GraphQL API | Creates service, sets env vars, generates domain, polls status |
| Akash | REST API | Generates SDL v2.0, auto-accepts bids, sends manifest |
| Phala | REST API | Two-phase CVM provisioning, encrypted env vars, TEE |
| io.net | REST API | Hardware discovery, container deploy, polls for URL |
| Nosana | REST API | INFINITE strategy for persistent GPU services |

All deployers accept either a Docker image reference or a RuntimeArtifact.

**SDK** (`@lucid/sdk`): Auto-generated from `openapi.yaml` via Speakeasy. Covers passports, receipts, memory, launch, anchoring, reputation, epochs. TypeScript + Python.

**CLI commands:**
```bash
lucid launch --image <image> --target <target>     # Path A
lucid launch --runtime base --model <m> --prompt   # Path B
lucid status <passportId>
lucid logs <passportId> [--tail 100]
lucid list [--status running] [--target docker]
lucid terminate <passportId>
lucid targets                                       # List available providers
lucid update <passportId>                           # Explicit runtime version update
```

### Deployment Control Plane
Durable deployment state in Supabase (`deployments` + `deployment_events` tables).
Status machine: `pending -> deploying -> running -> stopped -> terminated` (+ `failed` path).
Desired state vs actual state. Provider status tracked separately (`provider_status` column).
Optimistic locking via `version` column. Deployment revision via `revision` column.
`deployment_slot` supports blue/green in Phase 3 (default: 'primary').
Events: append-only audit log (`created`, `succeeded`, `failed`, `terminated`, `health_changed`, etc.).
`IDeploymentStore` interface with Postgres (production) + InMemory (tests) implementations.
Route: `GET /v1/agents/:passportId/events` — deployment event history.
Env: `DEPLOYMENT_STORE=postgres|memory` (default: postgres).
Files: `engine/src/deployment/control-plane/` (types, state-machine, store, postgres-store, in-memory-store).
Phase 2: Reconciler (polling every 60s, drift detection, stuck repair), LeaseManager (io.net extension),
WebhookHandler (`POST /v1/webhooks/:provider`). Provider status mapped through `mapProviderStatus()`.
Provider capabilities: `supportsStop/Resume/Extend/Status/Scale/Logs` per provider.
Drift repair rules: running+stopped->redeploy, terminated+running->terminate, failed+terminated->terminated.
Stuck repair: check provider, transition to running/failed, retry with backoff.
Files: `engine/src/deployment/reconciler/` (service, policies, provider-sync),
`engine/src/deployment/lease-manager/` (service, policies),
`engine/src/deployment/webhooks/` (handler, types, normalizers for railway/akash/phala/ionet/nosana),
`engine/src/deployment/boot.ts` (start/stop control plane).
Env: `DEPLOYMENT_CONTROL_PLANE=false` (disable), `RECONCILER_POLL_MS`, `RECONCILER_STUCK_TIMEOUT_MS`,
`RECONCILER_STALENESS_MS`, `RECONCILER_LEASE_WARNING_MS`, `RECONCILER_MAX_RETRIES`, `LEASE_EXTENSION_HOURS`.
Phase 3: Blue-green rollout, rollback, secrets abstraction.
RolloutManager (`engine/src/deployment/rollout/`) owns blue-green + rollback + promotion. Separate from Reconciler.
Secrets: `ISecretsResolver` interface (`engine/src/deployment/secrets/`) — resolve at deploy time, never stored.
Implementations: `EnvSecretsResolver` (process.env), `MockSecretsResolver` (tests). Factory: `getSecretsResolver()`.
Store extensions: `promoteBlue()` (atomic blue->primary swap), `getBySlot()` (slot-based lookup).
Routes: `POST .../deploy/blue-green`, `POST .../promote`, `POST .../rollback`, `GET .../blue`, `POST .../blue/cancel`.
Env: `SECRETS_PROVIDER=env|mock`, `ROLLOUT_HEALTH_GATE_MS=30000`, `ROLLOUT_AUTO_PROMOTE=false`, `ROLLOUT_AUTO_ROLLBACK=false`.

### NFT Provider Layer (Chain-Agnostic)
NFT minting behind `INFTProvider` interface. String-based addresses work for both Solana base58 and EVM 0x.

| Provider | Env Value | Chain |
|----------|-----------|-------|
| `Token2022Provider` | `token2022` | Solana |
| `MetaplexCoreProvider` | `metaplex-core` | Solana |
| `EVMNFTProvider` | `evm-erc721` | EVM (wraps EVMAdapter + TBA) |
| `MockNFTProvider` | `mock` | Dev/test |

Env: `NFT_PROVIDER` (default: `mock`), `NFT_CHAINS` (multi-chain: `solana-devnet,base`), `NFT_MINT_ON_CREATE=true`.

### Share Tokens (Fractional Ownership)
Token IS the share — no custom Anchor program. Swappable launcher behind `ITokenLauncher`.

| Provider | Env Value | Use Case |
|----------|-----------|----------|
| `DirectMintLauncher` | `direct-mint` | SPL Token-2022 direct mint |
| `GenesisLauncher` | `genesis` | Metaplex Genesis TGE |
| `MockTokenLauncher` | `mock` | Dev/test |

Env: `TOKEN_LAUNCHER` (default: `mock`). Revenue: off-chain airdrop via `revenueAirdrop.ts` (snapshot holders, proportional SOL transfer).

### Schema Validation
ToolMeta and AgentMeta schemas wired into passport creation. `TYPE_SCHEMA_MAP` in `passportManager.ts`:
- `model` → `ModelMeta.schema.json`, `compute` → `ComputeMeta.schema.json`
- `tool` → `ToolMeta.schema.json`, `agent` → `AgentMeta.schema.json`
- `dataset` → no schema (basic validation only)

### MemoryMap (Agent Memory System)
Portable, provable agent memory in `engine/src/memory/`. Three layers:
- **Layer 1**: `IMemoryStore` (Postgres/in-memory) + type managers (6 types) + query engine + vector search
- **Layer 2**: `MemoryService` orchestrator + LLM extraction + SHA-256 hash chain + receipt linkage + ACL + archive/compaction pipelines
- **Layer 3**: REST `/v1/memory/*` routes + MCP tools + SDK `lucid.memory.*`

**6 Memory Types**: episodic (conversation turns), semantic (extracted facts), procedural (learned rules), entity (knowledge graph nodes), trust_weighted (cross-agent trust), temporal (time-bounded facts).
Every write is hash-chained per `(agent_passport_id, namespace)`, linked to receipt MMR, and anchored on-chain.
Portable via `.lmf` (Lucid Memory File) — signed, hash-chained snapshots on DePIN storage.

**Semantic Recall** (two-stage retrieval):
1. Top-K vector candidates via pgvector `nearestByEmbedding()` (`<=>` cosine distance, `::vector` cast)
2. Metadata-aware reranking: `0.55×similarity + 0.20×recency + 0.15×type_bonus + 0.10×quality`
3. Intent classifier with priority: episodic > procedural > semantic
4. Overfitting guard: `effectiveTypeBonus = Math.min(rawTypeBonus, similarity)`
- Files: `recall/intentClassifier.ts`, `recall/reranker.ts`

**Memory Lanes**: `self | user | shared | market` — semantic partitions with per-lane compaction policies.

**Tiered Compaction** (`CompactionPipeline`):
- Hot: recent episodics within turn/time window (kept active)
- Warm: archive episodics beyond hot boundary, optionally trigger extraction
- Cold: hard-prune archived entries past retention (requires snapshot safety gate)
- Lane-aware boundaries, delete provenance before hard-delete, watermark idempotency

**Extraction Hardening**: schema_version validation, categorized errors (429→backoff, 401/403→disable), `ValidatedExtractionResult` with warnings.

**Snapshot/Restore**: `ArchivePipeline.createSnapshot()` with namespace filter, `restoreSnapshot()` with identity verification (cross-agent rejection, `__admin__` bypass).

API endpoints:
- `POST /v1/memory/episodic` — Episodic memory (conversation turns)
- `POST /v1/memory/semantic` — Semantic memory (extracted facts)
- `POST /v1/memory/procedural` — Procedural memory (learned rules)
- `POST /v1/memory/entity` — Entity memory (knowledge graph nodes)
- `POST /v1/memory/trust-weighted` — Trust-weighted memory (cross-agent trust)
- `POST /v1/memory/temporal` — Temporal memory (time-bounded facts)
- `POST /v1/memory/recall` — Two-stage semantic recall (vector + reranking)
- `POST /v1/memory/compact` — Trigger compaction (warm/cold/full modes)
- `POST /v1/memory/snapshots` — Create DePIN snapshot
- `POST /v1/memory/snapshots/restore` — Restore from snapshot (replace/merge/fork)
- `POST /v1/memory/verify` — Verify hash chain integrity

Key files:
```
engine/src/memory/
  types.ts              # All type definitions, configs, defaults
  service.ts            # MemoryService orchestrator (6 add methods + recall)
  store/interface.ts    # IMemoryStore contract
  store/in-memory.ts    # InMemory implementation
  store/postgres.ts     # Postgres + pgvector implementation
  store/sqlite/         # SQLite per-agent store (store.ts, schema.ts, db.ts, rowMappers.ts, queries.ts)
  managers/             # 6 type validators (episodic, semantic, procedural, entity, trustWeighted, temporal)
  recall/               # intentClassifier.ts + reranker.ts
  embedding/            # IEmbeddingProvider interface, MockEmbeddingProvider, EmbeddingWorker
  events/               # memoryEvents.ts — 9-event bus with resetMemoryEventBus()
  projection/           # MemoryProjectionService, ISink interface
  extraction.ts         # LLM extraction with hardening
  compactionPipeline.ts # Tiered compaction (hot/warm/cold)
  archivePipeline.ts    # Snapshot/restore via DePIN
  commitments.ts        # SHA-256 hash chain
  acl.ts                # Permission engine
  query.ts              # Query builder
```

Env: `MEMORY_ENABLED`, `MEMORY_STORE` (postgres|memory), `MEMORY_EXTRACTION_ENABLED`, `MEMORY_EMBEDDING_ENABLED`, `MEMORY_RECEIPTS_ENABLED`

**v3 — Local Truth, Global Projection (2026-03-14):**
- SQLite per-agent canonical store (`MEMORY_STORE=sqlite`), WAL mode, schema V3
- Per-agent store registry: `getStoreForAgent(agentPassportId)` — SQLite gives each agent its own DB file at `./data/agents/{passport}/memory.db`
- Async embedding pipeline: `IEmbeddingProvider` (openai|mock|none), `EmbeddingWorker` (hybrid event+polling)
- Memory event bus: 9 event types, resetable for test isolation
- Outbox-based projection plane: atomic write+outbox, `MemoryProjectionService` reads outbox, publishes to sinks
- Store capabilities model: persistent, vectorSearch, crossAgentQuery, transactions, localFirst
- Store health diagnostics: `GET /v1/memory/health`
- Self-healing memory limits before hard fail

New env vars: `MEMORY_STORE` (sqlite|postgres|memory), `MEMORY_DB_PATH`, `MEMORY_EMBEDDING_PROVIDER` (openai|mock|none), `MEMORY_PROJECTION_ENABLED`

## Offchain Codebase Structure (monorepo, feature-domain reorg 2026-03-15)

Two-package monorepo: `@lucid-l2/engine` (truth library, no HTTP) + `@lucid-l2/gateway-lite` (thin Express server). Dependency direction: gateway-lite -> engine (OK), engine -> gateway-lite (FORBIDDEN, ESLint-enforced). Transitional barrel re-exports at old locations ensure backward compatibility during migration.

```
offchain/
  package.json                        # npm workspaces: ["packages/*"]
  tsconfig.base.json                  # Shared compiler options
  packages/
    engine/src/                       # @lucid-l2/engine — truth library
      identity/                       # Passport, NFT, wallet, TBA, bridge, shares, registries
        passport/                     # passportManager, passportService, passportSyncService
        nft/                          # INFTProvider -> Token2022, MetaplexCore, EVM, Mock
        wallet/                       # IAgentWalletProvider -> Crossmint, ERC6551, Solana, Mock
        shares/                       # ITokenLauncher -> DirectMint, Genesis, Mock
        tba/                          # ERC-6551 TBA client + ABIs
        registries/                   # ERC-8004 Identity/Validation/Reputation clients + ABIs
        erc7579, paymaster, bridge
      memory/                         # 6 memory types, vector search, compaction, archive, projection
      epoch/                          # Epoch lifecycle, anchoring, MMR
        services/                     # epochService, anchoringService, mmrService
      receipt/                        # Receipt creation, signing, verification
      payment/                        # x402, pricing, splits, escrow, facilitators, airdrop
        facilitators/                 # Direct, Coinbase, PayAI
        services/                     # payoutService, pricingService, revenueService, splitResolver
        escrow/                       # escrowService, disputeService
        stores/                       # paymentGateService, spentProofsStore
        airdrop/                      # revenueAirdrop
      compute/                        # Deploy (6 targets), agent orchestration
        deploy/                       # IDeployer -> Docker, Railway, Akash, Phala, io.net, Nosana
        runtime/                      # IRuntimeAdapter interface + factory (adapters moved to examples/)
        agent/                        # agentDeploymentService, agentDescriptor, agentRevenueService
          a2a/                        # A2A protocol client/server/agentCard
      anchoring/                      # Unified DePIN interface — dispatcher, registry, verifier
      reputation/                     # Provider + syncer interfaces, on-chain + off-chain
      shared/                         # Cross-cutting infrastructure
        crypto/                       # hash, signing, canonicalJson, mmr, merkleTree, schemaValidator
        db/                           # pool.ts (PostgreSQL singleton)
        config/                       # config.ts, paths.ts
        lib/                          # logger
        chains/                       # Adapter layer: Solana + EVM adapters, factory, configs
        depin/                        # IDepinStorage -> Arweave, Lighthouse, Mock
        jobs/                         # anchoringJob, receiptConsumer, agentHealthMonitor, etc.
        types/                        # fluidCompute, lucid_passports
        storage/                      # searchQueryBuilder
    gateway-lite/src/                 # @lucid-l2/gateway-lite — Express server
      index.ts                        # Server entry point (Express app, startup sequence)
      api.ts                          # /api router
      compute/                        # computeRegistry, policyEngine, matchingEngine, modelCatalog
      inference/                      # executionGateway, computeClient, contentService
      agent/                          # agentOrchestrator, agentPlanner, executorRouter
      reputation/                     # IReputationAlgorithm, algorithms/, aggregator
      routes/                         # 27 route files (receipt, epoch, matching, passport, etc.)
      middleware/                     # adminAuth, hmacAuth, privyAuth, x402
      providers/                      # llm, mock, openai, router
      protocols/                      # BaseProtocolAdapter, ProtocolRegistry, adapters/
      integrations/                   # hf, n8n, oauth, mcp, zkml, flowspec, hyperliquid
      services/                       # rewardService, sessionSignerService
      lib/                            # auth, observability
  src/                                # Re-export proxies (backward compat, will be removed)
```

## Key Files
```
programs/thought-epoch/         # Anchor program: commit_epoch, commit_epochs, commit_epoch_v2
programs/lucid-passports/       # Anchor program: passport registry + payment gates
programs/gas-utils/             # Anchor program: token burn/split
schemas/                        # JSON schemas (ModelMeta, ComputeMeta, ToolMeta, AgentMeta, etc.)
infrastructure/migrations/      # Supabase SQL migrations
sdk/                            # Auto-generated TypeScript + Python SDKs
agent-services/                 # CrewAI + LangGraph microservices
```

## Database
Supabase (eu-north-1, project `kwihlcnapmkaivijyiif`):
- **Core:** `credentials`, `user_wallets`, `session_signers`, `users`, `rewards`, `conversations`
- **Receipts/Epochs:** `receipts`, `epochs`, `epoch_receipts`, `mmr_state`
- **Memory:** `memory_entries`, `memory_sessions`, `memory_provenance`, `memory_snapshots`, `memory_outbox`
- **Anchoring:** `anchor_records` (unified CID registry)
- **Payment:** `asset_pricing`, `payment_events`, `grant_budgets`, `payment_epochs`
- **Deployment:** `deployments`, `deployment_events` (durable deployment state + audit log)

**4-Layer Architecture:**
- L1 (Commitment): Solana/EVM — roots, proofs, anchors
- L2 (Data Availability): Arweave/Lighthouse — payloads, bundles, snapshots
- L3 (Operational): Supabase — index, jobs, projections (rebuildable from L1+L2)
- L4 (Product): Lucid Cloud — dashboards, APIs, UX

**Key rule:** Supabase is operational state, never canonical truth. If Supabase is lost, rebuild from chain + DePIN.

**Decentralization principle:** Lucid Core is the control plane — not the execution authority. It stores desired state, observes actual state, and coordinates transitions. It does NOT execute workloads. Agents run outside Lucid on decentralized providers (Akash, Phala, io.net, Nosana). Agent memory is local-first (SQLite, agent-owned). Agent identity is on-chain (passport). Lucid coordinates agents — it does not own them.

### SDK (`@lucid-l2/sdk` + `raijin-labs-lucid-ai`)

**Internal SDK** (`offchain/packages/sdk/`):
- `lucid.passport.*` — Passport CRUD
- `lucid.receipt.*` — Receipt operations
- `lucid.epoch.*` — Epoch management
- `lucid.memory.*` — Memory v3 (addEpisodic, addSemantic, addProcedural, addEntity, addTrustWeighted, addTemporal, recall, compact, exportMemoryFile, health)
- `lucid.anchor.*` — Anchor registry (list, get, lineage, verify, getByCID)
- `lucid.deploy.*` — Agent deployment
- `lucid.chain.*` — Multi-chain adapters

**Auto-generated SDK** (`raijin-labs-lucid-ai`):
- Generated by Speakeasy from `openapi.yaml`
- Custom entry point `src/ai.ts`: Vercel AI SDK provider (`createLucidProvider()`)
- Build: `cd sdk/raijin-labs-lucid-ai-typescript && npm run build`

## Cross-Dependencies
- `@lucid-fdn/passport` npm package (shared with lucid-plateform-core)
- Calls **TrustGate** (`TRUSTGATE_URL`) for model catalog validation
- Uses **n8n** for workflow execution, **CrewAI/LangGraph** for agent planning
- `raijin-labs-lucid-ai` SDK auto-generated from `openapi.yaml`
- Receipt events consumed by **lucid-plateform-core** for billing
- `better-sqlite3` + `sqlite-vec` (optional deps for `MEMORY_STORE=sqlite`)

## Testing
- **103 test suites, 1683 tests** (offchain)
- On-chain: `anchor test` (Mocha, 6 programs)
- Type check: `cd offchain && npm run type-check`
- E2E: start server (`npm start`) + curl endpoints

## Remote
`github.com/lucid-fdn/Lucid-L2.git` — branches: master
