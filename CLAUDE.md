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
cd offchain && npm test                     # Jest API (18 test files)
```

## Architecture

```
Client → /v1/chat/completions → Passport matching → LLM execution
  → Receipt signing (Ed25519) → MMR append → Epoch finalization
  → commit_epoch on Solana → Verifiable proof available
```

### Three Solana Programs
| Program | Devnet ID | Purpose |
|---------|-----------|---------|
| `thought_epoch` | `8QXiFjguJT4PLVzH6BYNMHXZ3eLRaoF8cwx23EBc44Q6` | MMR root commitment (single/batch/v2) |
| `lucid_passports` | `38yaXUezrbLyLDnAQ5jqFXPiFurr8qhw19gYnE6H9VsW` | AI asset registry + x402 payment gating |
| `gas_utils` | Not deployed | Token burn/split CPI utility |

### Offchain API (Express, port 3001)
- `/v1/chat/completions` — OpenAI-compatible inference
- `/v1/passports` — CRUD for model/compute/tool/agent passports
- `/v1/receipts` — Create, verify, prove cryptographic receipts
- `/v1/epochs` — Epoch management and Solana anchoring
- `/v1/match` — Policy-based compute matching
- `/v1/payouts` — Revenue split (basis points)
- `/api/agents` — MMR-based agent orchestration
- `/api/oauth` — Nango OAuth management
- `/api/hyperliquid`, `/api/solana` — DeFi integrations

### Key Algorithms
- **MMR**: SHA-256, right-to-left peak bagging. Epoch finalization: >100 receipts OR >1 hour
- **Receipt hash**: `SHA-256(JCS(receipt))` — RFC 8785 canonical JSON
- **Signing**: Ed25519 via tweetnacl (`LUCID_ORCHESTRATOR_SECRET_KEY`)
- **Gas**: iGas (1 LUCID/call) + mGas (5 LUCID/root). Batch: 2+5=7 LUCID total
- **Revenue split**: Default 70% compute / 20% model / 10% protocol (basis points)
- **Compute matching**: Runtime compat → hardware check → policy eval → score → select

## Key Files
```
programs/thought-epoch/         # Anchor program: commit_epoch, commit_epochs, commit_epoch_v2
programs/lucid-passports/       # Anchor program: passport registry + payment gates
programs/gas-utils/             # Anchor program: token burn/split
offchain/src/index.ts           # Express server entry
offchain/src/utils/mmr.ts       # MerkleTree + AgentMMR classes
offchain/src/solana/gas.ts      # Dual-gas transaction building
offchain/src/utils/config.ts    # Gas rates, program IDs, network config
infrastructure/migrations/      # Supabase SQL migrations
sdk/                            # Auto-generated TypeScript + Python SDKs
agent-services/                 # CrewAI + LangGraph microservices
```

## Database
Supabase (eu-north-1): `credentials`, `user_wallets`, `session_signers`, `signer_audit_log`, `users`, `rewards`, `conversations`, `reward_transactions`, `oauth_states`, `user_oauth_connections`

## Cross-Dependencies
- `@raijinlabs/passport` npm package (shared with lucid-plateform-core)
- Calls **TrustGate** (`TRUSTGATE_URL`) for model catalog validation
- Uses **n8n** for workflow execution, **CrewAI/LangGraph** for agent planning
- `raijin-labs-lucid-ai` SDK auto-generated from `openapi.yaml`
- Receipt events consumed by **lucid-plateform-core** for billing

## Remote
`github.com/raijinlabs/Lucid-L2.git` — branches: master, main, Phase-2
