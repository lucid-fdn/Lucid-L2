# Lucid-L2

## What This Is
Blockchain execution layer for the Lucid platform — Solana on-chain programs (Anchor/Rust) + Express offchain API + Next.js web UI. Handles verifiable AI inference with MMR proofs, dual-gas metering, passport-based model routing, and cryptographic receipt anchoring.

## Quick Start
```bash
# Backend API
cd offchain && npm install && npm start     # Port 3001

# Frontend
cd frontend && npm install && npm run dev   # Port 3000

# Solana programs
anchor build
anchor deploy --provider.cluster devnet

# Tests
cd tests && npm test                        # Mocha on-chain
cd offchain && npm test                     # Jest API (21 test files)
```

## Architecture

```
Client → /v1/chat/completions → Passport matching → LLM execution
  → Receipt signing (Ed25519) → MMR append → Epoch finalization
  → commit_epoch on Solana → Verifiable proof available
```

### Five Solana Programs
| Program | Devnet ID | Purpose |
|---------|-----------|---------|
| `thought_epoch` | `8QXiFjguJT4PLVzH6BYNMHXZ3eLRaoF8cwx23EBc44Q6` | MMR root commitment (single/batch/v2) |
| `lucid_passports` | `38yaXUezrbLyLDnAQ5jqFXPiFurr8qhw19gYnE6H9VsW` | AI asset registry + x402 payment gating |
| `gas_utils` | `EzuUhxtNAz1eRfAPypm6eAepe8fRQBrBPSo4Qcp1w3hm` | Token burn/split CPI + on-chain distribution |
| `lucid_agent_wallet` | `AJGpTWXbhvdYMxSah6GAKzykvfkYo2ViQpWGMbimQsph` | PDA wallets, policy, escrow, splits, sessions |
| `lucid_zkml_verifier` | `69cJRFGWijD1FdapQ2vz7VP6x2jcXRQyBws9VzzPpqAN` | Groth16 zkML proof verification + bloom filter dedup |

### Offchain API (Express, port 3001)
- `/v1/chat/completions` — OpenAI-compatible inference
- `/v1/models` — Model passport listing (supports `?available=true|false` tri-state filter)
- `/v1/compute/nodes/heartbeat` — Compute node heartbeat (POST, 30s TTL)
- `/v1/compute/nodes/:id/health` — Compute node health check (GET)
- `/v1/passports` — CRUD for model/compute/tool/agent passports
- `/v1/receipts` — Create, verify, prove cryptographic receipts
- `/v1/epochs` — Epoch management and Solana anchoring
- `/v1/match` — Policy-based compute matching
- `/v1/payouts` — Revenue split (basis points)
- `/api/agents` — MMR-based agent orchestration
- `/api/oauth` — Nango OAuth management
- `/v1/passports/:id/token/launch` — Launch share token for passport
- `/v1/passports/:id/token` — Get share token info
- `/v1/passports/:id/token/airdrop` — Trigger revenue airdrop
- `/v1/assets/:passportId/pricing` — Asset pricing CRUD (GET public, PUT/DELETE admin)
- `/v1/assets/:passportId/revenue` — Revenue summary (GET)
- `/v1/assets/:passportId/withdraw` — Revenue withdrawal (POST, admin)
- `/v1/config/payment` — x402 payment config (GET)
- `/v1/config/facilitator` — Set default facilitator (PUT, admin)
- `/v1/config/chains` — Supported payment chains (GET)
- `/v1/access/subscribe` — x402-gated subscription (POST)
- `/v1/memory/*` — Agent memory CRUD (episodic, semantic, procedural, recall, sessions, verify, snapshots)
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

### DePIN Storage Layer (Swappable)
Decentralized storage behind `IDepinStorage` interface. Factory: `getPermanentStorage()` / `getEvolvingStorage()`.

| Provider | Env Value | Use Case |
|----------|-----------|----------|
| `ArweaveStorage` | `arweave` | Permanent metadata (via Irys SDK) |
| `LighthouseStorage` | `lighthouse` | Evolving data (Filecoin+IPFS) |
| `MockStorage` | `mock` | Dev/test (local SHA-256 files) |

Env: `DEPIN_PERMANENT_PROVIDER`, `DEPIN_EVOLVING_PROVIDER` (default: `mock`). Kill switch: `DEPIN_UPLOAD_ENABLED=false`.

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
  managers/             # 6 type validators (episodic, semantic, procedural, entity, trustWeighted, temporal)
  recall/               # intentClassifier.ts + reranker.ts
  extraction.ts         # LLM extraction with hardening
  compactionPipeline.ts # Tiered compaction (hot/warm/cold)
  archivePipeline.ts    # Snapshot/restore via DePIN
  commitments.ts        # SHA-256 hash chain
  acl.ts                # Permission engine
  query.ts              # Query builder
```

Env: `MEMORY_ENABLED`, `MEMORY_STORE` (postgres|memory), `MEMORY_EXTRACTION_ENABLED`, `MEMORY_EMBEDDING_ENABLED`, `MEMORY_RECEIPTS_ENABLED`

## Offchain Codebase Structure (monorepo, restructured 2026-03-01)

Two-package monorepo: `@lucid-l2/engine` (truth library, no HTTP) + `@lucid-l2/gateway-lite` (thin Express server). Dependency direction: gateway-lite → engine (OK), engine → gateway-lite (FORBIDDEN, ESLint-enforced). Re-export proxy files in `src/` ensure backward compatibility during migration.

```
offchain/
  package.json                        # npm workspaces: ["packages/*"]
  tsconfig.base.json                  # Shared compiler options
  packages/
    engine/src/                       # @lucid-l2/engine — truth library
      config/                         # config.ts, paths.ts (PATHS helper)
      crypto/                         # hash, signing, canonicalJson, mmr, merkleTree, schemaValidator
      db/                             # pool.ts (PostgreSQL singleton)
      receipt/                        # receiptService, epochService, anchoringService, mmrService
      storage/                        # passportStore, identityStore, searchQueryBuilder
        depin/                        # IDepinStorage → Arweave, Lighthouse, Mock
      chains/                         # THIN adapter layer (feature-first, chain code in features)
        factory.ts, adapter-interface.ts, configs.ts, types.ts
        evm/                          # EVMAdapter (generic blockchain ops only)
        solana/                       # SolanaAdapter, client, gas, keypair
      assets/
        nft/                          # INFTProvider → Token2022, MetaplexCore, EVM, Mock
        shares/                       # ITokenLauncher → DirectMint, Genesis, Mock
      passport/                       # passportManager, passportService, passportSyncService
        nft/                          # SolanaPassportClient (Token-2022 NFT minting)
      payment/                        # x402 payment engine (facilitators, pricingService, revenueService, splitResolver, spentProofsStore)
      finance/                        # payoutService, paymentGateService, escrowService, disputeService
      identity/                       # identityBridgeService, caip10, crossChainBridge
        tba/                          # ERC-6551 TBA client + ABIs
        registries/                   # ERC-8004 Identity/Validation/Reputation clients + ABIs
        erc7579, paymaster
      memory/                         # MemoryMap: types, store (in-memory/postgres), service, commitments, managers, query, extraction, archive
      jobs/                           # anchoringJob, receiptConsumer, revenueAirdrop
      types/                          # fluidCompute, lucid_passports
      chain/                          # Re-export proxies (backward compat → chains/)
    gateway-lite/src/                 # @lucid-l2/gateway-lite — Express server (105 files)
      index.ts                        # Server entry point (Express app, startup sequence)
      api.ts                          # /api router (2553 lines, will be split later)
      compute/                        # computeRegistry, policyEngine, matchingEngine, modelCatalog
      inference/                      # executionGateway, computeClient, contentService
      agent/                          # agentOrchestrator, agentPlanner, executorRouter
      reputation/                     # IReputationAlgorithm, algorithms/, aggregator
      routes/                         # 27 route files (receipt, epoch, matching, passport, etc.)
      middleware/                     # adminAuth, hmacAuth, privyAuth, x402
      providers/                      # llm, mock, openai, router
      protocols/                      # BaseProtocolAdapter, ProtocolRegistry, adapters/
      integrations/
        hf/                           # hfBridgeService, hfSyncOrchestrator, deprecationDetector
        n8n/                          # n8nNodeIndexer, elasticsearchService, n8nGateway
        oauth/                        # nangoService, providerProfileService
        mcp/                          # mcpRegistry, mcpTypes
        mcp-server/                   # mcpServer (MCP tool server)
        zkml/                         # zkmlService, zkmlTypes
        flowspec/                     # flowspecService, n8nCompiler
        hyperliquid/                  # tradingService
      services/                       # rewardService, sessionSignerService
      lib/auth/                       # sessionService
      lib/observability/              # sentry, tracing
  src/                                # Re-export proxies (backward compat, will be removed)
    index.ts                          # Delegates to packages/gateway-lite/src/index.ts
    utils/, services/, routes/, ...   # Proxy files: export * from '../../packages/...'
    _archive/                         # Dead code quarantine
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
Supabase (eu-north-1): `credentials`, `user_wallets`, `session_signers`, `signer_audit_log`, `users`, `rewards`, `conversations`, `reward_transactions`, `oauth_states`, `user_oauth_connections`

### SDK (`raijin-labs-lucid-ai`)
- Auto-generated by Speakeasy from `openapi.yaml` — `src/sdk/`, `src/funcs/`, `src/models/` are generated code
- **Custom entry point** `src/ai.ts` (safe from re-gen): Vercel AI SDK provider using `@ai-sdk/openai-compatible`
  - Import as `raijin-labs-lucid-ai/ai` → `createLucidProvider()` for chat + embeddings
- `@ai-sdk/openai-compatible@2.x` — must stay in sync with consumers' `ai` package major version
- `searchModels({ available: 'true' })` — SDK method for filtered model listing (`'true'`=available, `'false'`=unavailable, omit=all)
- Build: `cd sdk/raijin-labs-lucid-ai-typescript && npm run build` (uses `tshy` for dual CJS/ESM)

## Cross-Dependencies
- `@raijinlabs/passport` npm package (shared with lucid-plateform-core)
- Calls **TrustGate** (`TRUSTGATE_URL`) for model catalog validation
- Uses **n8n** for workflow execution, **CrewAI/LangGraph** for agent planning
- `raijin-labs-lucid-ai` SDK auto-generated from `openapi.yaml`
- Receipt events consumed by **lucid-plateform-core** for billing

## Remote
`github.com/raijinlabs/Lucid-L2.git` — branches: master, main, Phase-2
