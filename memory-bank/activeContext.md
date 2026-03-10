# Active Context (as of 2026-03-07)

## Current State

The `feat/chain-parity` branch (35 commits) has been merged to master and pushed. This was the major implementation push covering:

1. **Multi-chain epoch anchoring** — Solana + EVM via `ANCHORING_CHAINS` env
2. **Chain adapter interfaces** — `IEpochAdapter`, `IPassportAdapter`, `IAgentWalletAdapter`
3. **Normalization layer** — `canonicalJson()` for cross-chain receipt consistency
4. **Payment system** — PaymentGrant middleware (402 flow), grant signing, settlement batching
5. **Agent deployment** — 6 deployers (Docker, Railway, Akash, Phala, io.net, Nosana) + ImageBuilder
6. **Reputation system** — `lucid_reputation` on-chain program + off-chain `IReputationProvider` + `IReputationSyncer`
7. **Integration wiring** — AgentRevenueService, receiptConsumer, agentHealthMonitor, deploy CLI
8. **Metaplex MIP #52** — `syncReputationPlugin()` on MetaplexCoreProvider

## Strategic Direction

**Partner with Metaplex for identity. Build our own reputation/validation.**

- Identity (NFT standard) = Metaplex Core / MIP #52 -- they own this
- Reputation (traffic-backed scores) = Lucid -- gateway data is the moat
- Validation (cryptographic proofs) = Lucid -- receipts + MMR
- Asset scope: Lucid extends Metaplex beyond agents to models, compute, tools, datasets
- Bidirectional reputation mesh: consume 8004/SATI/SAID AND feed them back

## What Was Just Completed

### Chain Parity (35 commits)
- `IEpochAdapter` Solana + EVM implementations
- `IPassportAdapter` Solana + EVM implementations
- `IAgentWalletAdapter` Solana PDA wallets
- Multi-chain anchoring via `anchoringService`
- `canonicalJson()` normalization

### Agent Deployment System
- 6 deployers fully implemented with real APIs
- ImageBuilder pipeline (Dockerfile generation + GHCR push)
- Deployer factory: `getDeployer(target)`, `listDeployerTargets()`
- `lucid deploy` CLI commands (deploy, status, logs, list, terminate, targets)
- agentHealthMonitor job (5-min interval, auto-extend io.net/Nosana)

### Payment System
- PaymentGrant middleware (402 flow)
- Grant signing/verification
- payment_events + grant_budgets + payment_epochs tables
- PaymentEpochService for async settlement batching

### Reputation System
- `lucid_reputation` Solana program (6th program) — 11 anchor tests passing
- `IReputationProvider` (LucidDBProvider, LucidOnChainProvider)
- `IReputationSyncer` (Solana8004Syncer, EVM8004Syncer, SATISyncer, SAIDSyncer)
- `ReputationService` orchestrator
- `MetaplexCoreProvider.syncReputationPlugin()` for MIP #52
- 76 tests across 4 test files

### Integration
- AgentRevenueService: receipt --> payout split --> revenue pool --> airdrop
- SolanaWalletProvider wrapping SolanaAdapter PDA wallet
- receiptConsumer wired to agentRevenueService + marketplace.trackUsage()
- Reverse signaling: epoch_anchored_events outbox
- Share token auto-launch in agentDeploymentService

## Remaining Work

### Platform-Core Gaps (separate repo, separate chat)
- Control-plane agent budget CRUD endpoints
- Usage-persister agent_passport_id correlation
- Oracle API agent_passport_id capture

### Frontend (separate task)
- Deploy dashboard UI
- Provider recommendation wizard

## Recent Decisions
- Same passport_id in both DBs -- no cross-reference columns
- Identity from API key only -- X-Lucid-Agent header is debug-only
- run_id generated at gateway edge -- mandatory, returned as X-Lucid-Run-Id
- Canonical JSON hashing: sha256(sortedKeys(json)) for tool args/results
