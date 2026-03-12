# Lucid L2

Verifiable AI execution layer. Blockchain-anchored infrastructure giving AI assets — models, agents, tools, compute, datasets — provable identity, cryptographic receipts, and reputation backed by real traffic data.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-1272%20passing-brightgreen)]()
[![Solana](https://img.shields.io/badge/Solana-devnet-purple)]()

## Quick Start

### Docker (recommended)

```bash
cp offchain/.env.example offchain/.env
# Edit offchain/.env with your values

docker compose up
# API running on http://localhost:3001
```

### From source

```bash
cd offchain
npm install
cp .env.example .env
npm start          # API on :3001
```

### Solana programs (local development)

```bash
solana-test-validator --reset --quiet &
anchor build
anchor test
```

## What It Does

```
Request → Passport matching → AI execution → Receipt (Ed25519 signed)
  → MMR append → Epoch finalization → On-chain anchor (Solana / EVM)
  → Verifiable Merkle proof available for any receipt
```

Every AI interaction gets a cryptographic receipt. Receipts are batched into epochs, committed on-chain as MMR roots, and provable forever.

## Architecture

```
offchain/packages/
  engine/         @lucid-l2/engine       — Truth library (crypto, receipts, chains, assets, reputation, deploy)
  gateway-lite/   @lucid-l2/gateway-lite — Express API server (AGPL-3.0)
  sdk/            @lucid-l2/sdk          — Developer SDK
```

Dependency rule: `gateway-lite → engine` (OK), `engine → gateway-lite` (forbidden).

### 6 Solana Programs

| Program | Purpose |
|---------|---------|
| `thought_epoch` | MMR root commitment (single/batch/v2) |
| `lucid_passports` | AI asset registry + x402 payment gating |
| `gas_utils` | Token burn/split CPI |
| `lucid_agent_wallet` | PDA wallets, policy, escrow, splits, sessions |
| `lucid_zkml_verifier` | Groth16 zkML proof verification |
| `lucid_reputation` | On-chain reputation (feedback, validation, revocation) |

### EVM Contracts

EpochRegistry, LucidPassportRegistry, LucidEscrow, LucidTBA (ERC-6551), ZkMLVerifier, LucidPaymaster (ERC-4337), and ERC-7579 modules (Policy, Payout, Receipt).

### Chain Parity

Full parity on: epoch anchoring, passport registry, agent wallets, session keys, revenue splits, reputation, receipt validation, NFT minting. Multi-chain epoch anchoring via `ANCHORING_CHAINS` env.

## API

111 endpoints documented in `offchain/openapi.yaml`. Key routes:

```
POST /v1/chat/completions    OpenAI-compatible inference
GET  /v1/models              Model listing (?available=true|false)
POST /v1/passports           AI asset registration (model/compute/tool/agent/dataset)
POST /v1/receipts            Create + verify cryptographic receipts
GET  /v1/epochs              Epoch management and anchoring
POST /v1/match               Policy-based compute matching
GET  /health                 Health check
```

### x402 Payment Protocol

HTTP 402 flow — server returns payment instructions, agent pays USDC on-chain, retries with `X-Payment-Proof` header. Facilitator-agnostic. Dynamic pricing per-asset.

## Key Systems

**Receipts & Proofs** — Ed25519-signed receipts, SHA-256 over RFC 8785 canonical JSON, MMR Merkle inclusion proofs, epoch auto-finalization (>100 receipts or >1 hour).

**Reputation** — On-chain (Solana program) + off-chain (DB provider), ERC-8004 sync, scoring algorithms with composite weighted scoring.

**Agent Deployment** — 6 deployers: Docker, Railway, Akash, Phala, io.net, Nosana. ImageBuilder pushes to GHCR. CLI: `npm run cli deploy <passport_id> <target>`.

**Identity** — CAIP-10 identity bridge, ERC-6551 TBA, Metaplex Core NFT minting, Token-2022 share tokens.

## SDK

```typescript
import { Lucid } from '@lucid-l2/sdk';

const lucid = Lucid.fromEnv();

// Create a passport
const passport = await lucid.passport.create({ type: 'model', meta: { ... } });

// Create a receipt
const receipt = await lucid.receipt.create({ passport_id: passport.id, ... });

// Verify with Merkle proof
const proof = await lucid.receipt.prove(receipt.id);
```

## Testing

```bash
cd offchain && npm test              # 73 suites, 1272 tests
cd offchain && npm run type-check    # TypeScript compilation
anchor test                          # Solana program tests (Mocha)
```

## Project Structure

```
offchain/                  Offchain monorepo (engine + gateway-lite + SDK)
programs/                  6 Solana Anchor programs
contracts/                 EVM smart contracts (Hardhat)
schemas/                   JSON schemas (ModelMeta, ComputeMeta, ToolMeta, AgentMeta)
infrastructure/            SQL migrations, docker configs
examples/                  SDK usage examples
tests/                     On-chain test suites
internal/                  Legacy code and historical documentation
```

## Environment

Copy `offchain/.env.example` for the full variable reference. Key variables:

| Variable | Purpose |
|----------|---------|
| `POSTGRES_*` | Database connection |
| `LUCID_ORCHESTRATOR_SECRET_KEY` | Ed25519 signing key |
| `ANCHORING_CHAINS` | Chain targets (e.g. `solana-devnet,base`) |
| `NFT_PROVIDER` | NFT backend (`token2022`, `metaplex-core`, `evm-erc721`, `mock`) |
| `REPUTATION_PROVIDER` | Reputation backend (`db`, `onchain`) |
| `DEPLOY_TARGET` | Default deployer (`docker`, `railway`, `akash`, `phala`, `ionet`, `nosana`) |
| `TRUSTGATE_URL` | TrustGate inference gateway |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

- **Engine & programs**: [Apache 2.0](LICENSE)
- **Gateway-lite**: [AGPL-3.0](offchain/packages/gateway-lite/LICENSE)

Copyright 2024-2026 Raijin Labs.
