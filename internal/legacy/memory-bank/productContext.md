# Product Context: Lucid

## Why This Project Exists

AI is becoming infrastructure. Models serve inference, agents execute tasks, tools get composed, compute gets rented. But none of it is verifiable. You can't prove which model ran, what it produced, whether the agent actually did what it claimed, or if the compute node was healthy when it served your request.

Lucid fixes this by creating a **verifiable execution layer** where every AI interaction produces a cryptographic receipt anchored to blockchain. These receipts become the foundation for reputation, payment, and governance.

## The Two Products

### 1. Lucid-L2 (Open Source Truth Layer)
The engine that makes AI verifiable:
- **Passport system** — registry for models, agents, tools, compute, datasets
- **Receipt signing** — Ed25519 signatures on canonical JSON receipts
- **MMR anchoring** — Merkle Mountain Range roots committed to Solana (and EVM)
- **Reputation system** — on-chain feedback, validation, and scoring
- **Agent deployment** — build, push, deploy agents to 6 platforms
- **Payment system** — x402 payment gates, grant signing, settlement batching

### 2. Platform-Core (Proprietary Gateway)
The "Cloudflare of AI" — inference routing with built-in trust:
- **TrustGate** — multi-tenant API gateway with rate limiting and quotas
- **MCPGate** — MCP tool proxy with tool-call receipts
- **Control-Plane** — tenant management, API keys, billing
- **Oracle** — Agent Intelligence Oracle built from real gateway traffic

## Strategic Position

### Identity: Metaplex (Partner)
Metaplex Core / MIP #52 is the Solana NFT standard. Lucid uses it for AI asset identity (passport NFTs). Don't rebuild what Metaplex does well.

### Reputation: Lucid (Own)
Gateway traffic data is the moat. No one else has real-world usage data for AI assets. Lucid builds reputation from actual inference receipts, not self-reported benchmarks.

### Validation: Lucid (Own)
Cryptographic receipts + MMR proofs + on-chain anchoring. Verifiable end-to-end.

### Asset Scope: Lucid Extends Metaplex
Metaplex focuses on agents. Lucid brings identity + reputation to ALL AI assets:
- Models (inference passports, provider routing)
- Compute (GPU/CPU nodes, heartbeat monitoring)
- Tools (MCP tools, schema validation)
- Datasets (provenance tracking)
- Agents (orchestration, deployment, revenue splits)

### Bidirectional Reputation Mesh
Lucid is not an island. It consumes reputation from external providers AND feeds validated scores back:

| Provider | Direction | What |
|----------|-----------|------|
| ERC-8004 (Solana) | Pull + Push | Reputation scores |
| ERC-8004 (EVM) | Pull + Push | Reputation scores |
| SATI | Pull + Push | Trust signals |
| SAID | Pull + Push | Identity verification |

This creates a **reputation mesh** where Lucid is a first-class participant, not just a consumer.

## How It Works (User Perspective)

### For AI Developers
1. Register your model/agent/tool as a passport
2. Deploy to any supported platform (Docker, Railway, Akash, Phala, io.net, Nosana)
3. Earn revenue through inference (70% compute / 20% model / 10% protocol)
4. Build reputation from real usage data
5. Optionally launch share tokens for fractional ownership

### For AI Consumers
1. Get an API key from Control-Plane
2. Call `/v1/chat/completions` (OpenAI-compatible)
3. Get verifiable receipts for every interaction
4. Verify any receipt on-chain via MMR proofs
5. Choose providers based on real reputation data

## Success Criteria

- Every AI interaction produces a verifiable receipt
- Reputation reflects real-world usage, not synthetic benchmarks
- Multi-chain anchoring (Solana + EVM) for maximum reach
- Revenue flows automatically to asset creators
- Gateway handles production traffic with TrustGate quotas
