# Technical Context: Lucid Stack

## On-Chain (Solana / Anchor)

### 6 Programs
| Program | Devnet ID | Purpose |
|---------|-----------|---------|
| `thought_epoch` | `8QXiFjguJT4PLVzH6BYNMHXZ3eLRaoF8cwx23EBc44Q6` | MMR root commitment (single/batch/v2) |
| `lucid_passports` | `38yaXUezrbLyLDnAQ5jqFXPiFurr8qhw19gYnE6H9VsW` | AI asset registry + x402 payment gating |
| `gas_utils` | `EzuUhxtNAz1eRfAPypm6eAepe8fRQBrBPSo4Qcp1w3hm` | Token burn/split CPI + on-chain distribution |
| `lucid_agent_wallet` | `AJGpTWXbhvdYMxSah6GAKzykvfkYo2ViQpWGMbimQsph` | PDA wallets, policy, escrow, splits, sessions |
| `lucid_zkml_verifier` | `69cJRFGWijD1FdapQ2vz7VP6x2jcXRQyBws9VzzPpqAN` | Groth16 zkML proof verification + bloom dedup |
| `lucid_reputation` | `4FWEH1XQb7p1pU9r8Ap8xomDYVxdSdwk6fFT8XD63G3A` | On-chain reputation (feedback, validation) |

### EVM Contracts
- `EpochAnchor` — mirror of thought_epoch for EVM chains
- `LucidPassportRegistry` — passport anchor + payment gate
- ERC-6551 TBA for passport-owned wallets
- ERC-8004 Identity/Validation/Reputation registries

## Offchain Stack

### Runtime
- **Node.js** + **TypeScript** (strict mode)
- **Express.js** — API server on port 3001
- **PostgreSQL** — via Supabase (eu-north-1)
- **npm workspaces** — monorepo (`packages/engine`, `packages/gateway-lite`)

### Key Dependencies
- `@coral-xyz/anchor` — Solana program interaction
- `@solana/web3.js`, `@solana/spl-token` — Solana primitives
- `ethers` — EVM interaction
- `tweetnacl` — Ed25519 signing
- `@metaplex-foundation/mpl-core` — Metaplex Core NFTs (MIP #52)
- `@irys/sdk` — Arweave permanent storage
- `lighthouse-web3` — Filecoin/IPFS storage
- `8004-solana` (v0.8.0) — ERC-8004 reputation protocol
- `jest` — testing (21+ test files)

### Frontend
- **Next.js 15** + **React 19** + **Tailwind CSS 4**
- Solana Wallet Adapter
- App directory structure

### Agent Deployment
- Docker (local), Railway, Akash, Phala, io.net, Nosana
- ImageBuilder: Dockerfile generation + GHCR push (`ghcr.io/raijinlabs/lucid-agents/`)

## Codebase Structure

```
offchain/
  packages/
    engine/src/           # @lucid-l2/engine (truth library, no HTTP)
      config/             # config.ts, paths.ts
      crypto/             # hash, signing, canonicalJson, mmr, merkleTree
      db/                 # pool.ts (PostgreSQL)
      receipt/            # receiptService, epochService, anchoringService
      storage/            # passportStore, identityStore, searchQueryBuilder
        depin/            # IDepinStorage (Arweave, Lighthouse, Mock)
      chains/             # adapter layer
        factory.ts        # getChainAdapter()
        evm/              # EVMAdapter
        solana/           # SolanaAdapter, client, gas, keypair
      assets/
        nft/              # INFTProvider (Token2022, MetaplexCore, EVM, Mock)
        shares/           # ITokenLauncher (DirectMint, Genesis, Mock)
      passport/           # passportManager, passportService
      finance/            # payoutService, paymentGateService, escrowService
      identity/           # identityBridgeService, caip10, crossChainBridge
        tba/              # ERC-6551 TBA client
        registries/       # ERC-8004 clients
      reputation/         # IReputationProvider, IReputationSyncer, ReputationService
      deploy/             # 6 deployers + ImageBuilder
      agent/              # agentDeploymentService, agentRevenueService
      jobs/               # anchoringJob, receiptConsumer, revenueAirdrop, agentHealthMonitor
    gateway-lite/src/     # @lucid-l2/gateway-lite (Express server)
      index.ts            # Server entry point
      api.ts              # Main router
      compute/            # computeRegistry, policyEngine, matchingEngine
      inference/          # executionGateway, computeClient
      agent/              # agentOrchestrator, agentPlanner
      reputation/         # IReputationAlgorithm, algorithms/, aggregator
      routes/             # 27 route files
      middleware/         # adminAuth, hmacAuth, privyAuth, x402
      integrations/       # hf, n8n, oauth, mcp, zkml, flowspec, hyperliquid
  src/                    # Re-export proxies (backward compat, will be removed)

programs/
  thought-epoch/          # Anchor: commit_epoch, commit_epochs, commit_epoch_v2
  lucid-passports/        # Anchor: passport registry + payment gates
  gas-utils/              # Anchor: token burn/split
  lucid-agent-wallet/     # Anchor: PDA wallets, policy, escrow
  lucid-zkml-verifier/    # Anchor: Groth16 verification
  lucid-reputation/       # Anchor: reputation feedback + validation

frontend/                 # Next.js 15 web UI
schemas/                  # JSON schemas (ModelMeta, ComputeMeta, ToolMeta, AgentMeta)
sdk/                      # Auto-generated TypeScript + Python SDKs
infrastructure/migrations/ # Supabase SQL migrations
```

## Environment Variables (Key)

| Var | Purpose |
|-----|---------|
| `ANCHORING_CHAINS` | Comma-separated chain IDs for epoch anchoring |
| `NFT_PROVIDER` | `mock`, `token2022`, `metaplex-core`, `evm-erc721` |
| `TOKEN_LAUNCHER` | `mock`, `direct-mint`, `genesis` |
| `DEPIN_PERMANENT_PROVIDER` | `mock`, `arweave`, `lighthouse` |
| `REPUTATION_PROVIDER` | `db`, `onchain` |
| `REPUTATION_SYNCERS` | `8004,sati,said,evm` |
| `DEPLOY_TARGET` | `docker`, `railway`, `akash`, `phala`, `ionet`, `nosana` |
| `LUCID_ORCHESTRATOR_SECRET_KEY` | Ed25519 key for receipt signing |
| `TRUSTGATE_URL` | Platform-core gateway URL |
| `DATABASE_URL` | PostgreSQL connection |

## Network Configuration

| Environment | Solana RPC | EVM |
|-------------|-----------|-----|
| Local | `http://127.0.0.1:8899` | Hardhat/Anvil |
| Devnet | `https://api.devnet.solana.com` | Base Sepolia |
| Mainnet | `https://api.mainnet-beta.solana.com` | Base |

## Cross-Repo Bridge

- `@raijinlabs/passport` — shared npm package (passport types + store)
- Same `passport_id` in both DBs (no cross-reference columns)
- Identity from API key only (X-Lucid-Agent header is debug-only)
- `run_id` generated at gateway edge, returned as X-Lucid-Run-Id header
- receipt_events consumed by platform-core for billing
- epoch_anchored_events outbox for reverse signaling (L2 --> platform-core)
