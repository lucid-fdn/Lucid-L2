# System Patterns: Lucid Architecture

## High-Level Architecture

```
                         Lucid-L2 (Open Source)
                    ┌─────────────────────────────┐
                    │                             │
  API Request ──────▶  Gateway-Lite (Express)     │
                    │    │                        │
                    │    ├── Passport matching     │
                    │    ├── Compute matching      │
                    │    ├── Inference execution   │
                    │    ├── Receipt signing       │
                    │    └── MMR append            │
                    │                             │
                    │  Engine (@lucid-l2/engine)   │
                    │    ├── Crypto (hash, sign)   │
                    │    ├── Receipt + Epoch       │
                    │    ├── Chains (Solana, EVM)  │
                    │    ├── Assets (NFT, Shares)  │
                    │    ├── Finance (payouts)     │
                    │    ├── Reputation            │
                    │    ├── Identity (bridge)     │
                    │    └── Deploy (6 deployers)  │
                    │                             │
                    │  Solana Programs (6)         │
                    │    ├── thought_epoch         │
                    │    ├── lucid_passports       │
                    │    ├── gas_utils             │
                    │    ├── lucid_agent_wallet    │
                    │    ├── lucid_zkml_verifier   │
                    │    └── lucid_reputation      │
                    └─────────────────────────────┘

                    Platform-Core (Proprietary)
                    ┌─────────────────────────────┐
                    │  TrustGate (API Gateway)     │
                    │  MCPGate (MCP Tool Proxy)    │
                    │  Control-Plane (Admin)       │
                    │  Oracle (Intelligence Feeds) │
                    └─────────────────────────────┘
```

## Offchain Monorepo Structure

Two-package monorepo: `@lucid-l2/engine` (truth library, no HTTP) + `@lucid-l2/gateway-lite` (thin Express server).

**Dependency rule:** gateway-lite --> engine (OK), engine --> gateway-lite (FORBIDDEN, ESLint-enforced).

## Chain Parity (Solana + EVM)

### Multi-Chain Epoch Anchoring
```
Receipt created --> MMR append --> Epoch finalized
  --> anchoringService fans out to all ANCHORING_CHAINS
  --> IEpochAdapter.anchorEpoch(root, receipts)
    --> SolanaEpochAdapter: commit_epoch_v2 instruction
    --> EVMEpochAdapter: contract.anchorEpoch(root, count)
```

Env: `ANCHORING_CHAINS=solana-devnet,base` (comma-separated chain IDs).

### Adapter Interfaces
| Interface | Solana | EVM |
|-----------|--------|-----|
| `IEpochAdapter` | commit_epoch_v2 via Anchor | anchorEpoch() on EpochAnchor contract |
| `IPassportAdapter` | Token-2022 NFT mint | ERC-721 mint + ERC-6551 TBA |
| `IAgentWalletAdapter` | PDA wallets (policy, escrow, sessions) | — (Solana only for now) |

### Normalization Layer
`canonicalJson()` — RFC 8785 JSON Canonicalization Scheme. Used for:
- Receipt hashing: `SHA-256(JCS(receipt))`
- Cross-chain consistency: same receipt produces same hash on any chain
- Ed25519 signing: sign the canonical bytes

## Receipt Flow

```
1. Client sends inference request
2. Gateway matches passport + compute
3. Inference executes (vLLM/TGI/OpenAI/etc)
4. Receipt created with:
   - run_id (generated at edge)
   - model passport_id
   - compute passport_id
   - input/output hashes
   - latency, token counts
5. Receipt signed (Ed25519)
6. Receipt hash = SHA-256(JCS(receipt))
7. Hash appended to MMR
8. When epoch triggers (>100 receipts OR >1 hour):
   - MMR root finalized
   - Root anchored to all configured chains
   - Epoch record stored in DB
```

## Reputation System

### On-Chain (lucid_reputation program)
- **PDAs:** `["stats", passport_id]`, `["feedback", passport_id, index]`, `["validation", passport_id, receipt_hash]`
- **Instructions:** init_stats, submit_feedback, submit_validation, revoke_feedback
- Receipt-backed: feedback must reference a real receipt hash
- Asset-type agnostic: works for models, agents, tools, compute, datasets

### Off-Chain Reputation Layer
```
IReputationProvider (strategy)
  ├── LucidDBProvider       (PostgreSQL scores)
  └── LucidOnChainProvider  (Solana program queries)

IReputationSyncer (bidirectional bridge)
  ├── Solana8004Syncer      (ERC-8004 on Solana)
  ├── EVM8004Syncer         (ERC-8004 on EVM)
  ├── SATISyncer            (SATI trust protocol)
  └── SAIDSyncer            (SAID identity)

ReputationService = Provider + [Syncer, Syncer, ...]
```

### Metaplex Integration
`MetaplexCoreProvider.syncReputationPlugin()` writes reputation data to MIP #52 plugin slots. This means:
- Metaplex handles identity (the NFT itself)
- Lucid writes reputation INTO the Metaplex asset via plugin
- External consumers read reputation from the same NFT

## Agent Deployment System

### 6 Deployers (engine/src/deploy/)
| Deployer | API | Image Source | Notes |
|----------|-----|-------------|-------|
| DockerDeployer | Local Docker | docker-compose.yml | Dev/self-host |
| RailwayDeployer | GraphQL API | Docker image | Domain generation, status polling |
| AkashDeployer | Console Managed Wallet | SDL v2.0 | Auto-bid acceptance, manifest |
| PhalaDeployer | Phala Cloud API | Docker image | Two-phase CVM provisioning |
| IoNetDeployer | CaaS REST API | Docker image | Hardware discovery, secrets |
| NosanaDeployer | REST API | Docker image | INFINITE strategy for GPU |

### ImageBuilder Pipeline
```
RuntimeArtifact --> Dockerfile generation --> docker build
  --> push to ghcr.io/raijinlabs/lucid-agents/{passport_id}:{tag}
  --> deploy to target platform
```

## Payment System

### x402 Payment Flow
```
1. Client calls API without payment header
2. Middleware returns 402 with PaymentGrant requirements
3. Client signs grant (amount, recipient, expiry)
4. Client retries with X-Payment-Grant header
5. Middleware verifies signature + budget
6. Request proceeds
7. PaymentEpochService batches settlements
```

### Revenue Splits
Default: 70% compute / 20% model / 10% protocol (basis points, configurable per passport).

### Agent Revenue
- `AgentRevenueService`: Receipt --> payout split --> per-agent revenue pool
- Auto-airdrop trigger when pool >= threshold + share token exists
- Share token holders get proportional SOL transfer

## DePIN Storage Layer

Swappable via `IDepinStorage` interface:
| Provider | Use Case |
|----------|----------|
| ArweaveStorage | Permanent metadata (via Irys SDK) |
| LighthouseStorage | Evolving data (Filecoin+IPFS) |
| MockStorage | Dev/test |

## NFT Provider Layer

Swappable via `INFTProvider` interface:
| Provider | Chain |
|----------|-------|
| Token2022Provider | Solana |
| MetaplexCoreProvider | Solana (MIP #52) |
| EVMNFTProvider | EVM (ERC-721 + TBA) |
| MockNFTProvider | Dev/test |

## Share Tokens (Fractional Ownership)

Token IS the share. Swappable launcher via `ITokenLauncher`:
| Provider | Mechanism |
|----------|-----------|
| DirectMintLauncher | SPL Token-2022 direct mint |
| GenesisLauncher | Metaplex Genesis TGE |
| MockTokenLauncher | Dev/test |

## Key Algorithms

- **MMR**: SHA-256, right-to-left peak bagging. Epoch trigger: >100 receipts OR >1 hour
- **Receipt hash**: `SHA-256(JCS(receipt))` — RFC 8785 canonical JSON
- **Signing**: Ed25519 via tweetnacl (`LUCID_ORCHESTRATOR_SECRET_KEY`)
- **Gas**: iGas (1 LUCID/call) + mGas (5 LUCID/root). Batch: 2+5=7 total
- **Compute matching**: Runtime compat --> hardware check --> policy eval --> score --> select
