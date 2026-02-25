# Lucid L2 Project Map

**Last Updated:** 2026-02-10

This is a **navigation index**, not a design document. For detailed architecture, see linked guides below.

## High-Level Architecture

```
Lucid L2: Blockchain Thought Commitment System
┌─────────────────────────────────────────────┐
│ Text → AI Processing → Blockchain → Memory │
└─────────────────────────────────────────────┘

On-Chain (Solana)
├── Rust programs (thought commitment)
├── Dual-gas metering
└── MMR proof-of-contribution

Off-Chain
├── Backend API (Node.js)
├── AI Agent services
└── OAuth authentication

Frontend
├── Next.js web app
├── Browser extension
└── Auth frontend
```

## Module Boundaries

### Core Services

| Module | Path | Purpose | Tech Stack |
|--------|------|---------|------------|
| **On-Chain Programs** | `programs/` | Solana smart contracts | Rust, Anchor |
| **Off-Chain API** | `offchain/` | Backend API server | Node.js, Express |
| **Frontend** | `frontend/` | Web interface | Next.js, React |
| **Agent Services** | `agent-services/` | AI agent processing | Node.js |
| **OAuth API** | `oauth-api/` | Authentication service | Node.js |
| **Auth Frontend** | `auth-frontend/` | Auth UI | Next.js |

### Supporting Packages

| Module | Path | Purpose |
|--------|------|---------|
| **SDK** | `sdk/` | Client library for integration |
| **Browser Extension** | `browser-extension/` | Chrome/Firefox extension |
| **Packages** | `packages/` | Shared libraries |
| **Schemas** | `schemas/` | Data schemas & types |
| **Infrastructure** | `infrastructure/` | Deployment configs |

### Development

| Module | Path | Purpose |
|--------|------|---------|
| **Examples** | `examples/` | Usage examples |
| **Simple Program** | `simple-program/` | Minimal working example |
| **Tests** | `tests/` | Integration tests |
| **Data** | `data/` | Test data & fixtures |

## Development Phases (Completed)

✅ **Phase 1**: On-chain program (Solana smart contracts)
✅ **Phase 2**: Off-chain API (backend services)
✅ **Phase 3a**: Frontend (web interface)
✅ **Phase 3c**: Dual-gas metering
✅ **Phase 4**: Clean architecture
✅ **Phase 5**: MMR proof-of-contribution system
✅ **Phase 6**: AI Agent API

## Key Flows

### Thought Commitment Flow
1. User enters text → Frontend (`frontend/`)
2. Text sent to API → Off-chain (`offchain/`)
3. AI processing → Agent services (`agent-services/`)
4. Commitment to blockchain → On-chain program (`programs/`)
5. MMR proof generated → Proof-of-contribution
6. Result returned to user

### Authentication Flow
1. User initiates auth → Auth frontend (`auth-frontend/`)
2. OAuth flow → OAuth API (`oauth-api/`)
3. Wallet connection → Solana wallet (Phantom, Solflare)
4. Session established → Frontend receives token

## Where to Change Common Things

| Task | Location | Guide |
|------|----------|-------|
| **Modify on-chain logic** | `programs/` | Rust, Anchor framework |
| **Add API endpoint** | `offchain/` | Express routes |
| **Update frontend** | `frontend/` | Next.js pages/components |
| **Add AI agent** | `agent-services/` | Node.js services |
| **Change auth flow** | `oauth-api/` + `auth-frontend/` | OAuth patterns |
| **Extend SDK** | `sdk/` | Client library |
| **Add browser feature** | `browser-extension/` | Chrome/Firefox APIs |
| **Deploy infrastructure** | `infrastructure/` | Deployment configs |

## Critical Patterns

### On-Chain Development
```bash
# Build programs
cd programs
cargo build-bpf

# Deploy to devnet
solana program deploy target/deploy/program.so

# Start local validator
solana-test-validator --reset --quiet
```

### Off-Chain Development
```bash
# Start backend API
cd offchain
npm install
npm start  # http://localhost:3001

# Use CLI interface
npm run cli run "Hello Lucid!"
npm run cli mmr demo
```

### Frontend Development
```bash
# Start web interface
cd frontend
npm install
npm run dev  # http://localhost:3000
```

## Tech Stack Summary

**Blockchain:**
- Solana (Rust, Anchor framework)
- Dual-gas metering
- MMR (Merkle Mountain Range)

**Backend:**
- Node.js, Express
- AI processing
- OAuth 2.0

**Frontend:**
- Next.js, React
- Wallet integration (Phantom, Solflare)
- Browser extension support

## Important Docs

- **Clean Architecture** → `CLEAN-STRUCTURE-GUIDE.md`
- **Dual-Gas System** → `DUAL-GAS-GUIDE.md`
- **Phase 3A (Frontend)** → `PHASE-3A-GUIDE.md`
- **MMR Integration** → `MMR-INTEGRATION-GUIDE.md`
- **AI Agent API** → `AI-AGENT-API-GUIDE.md`
- **Main README** → `README.md`

## Quick Start

```bash
# 1. Start blockchain
solana-test-validator --reset --quiet &

# 2. Start backend
cd offchain && npm install && npm start

# 3. Start frontend
cd frontend && npm install && npm run dev

# 4. Visit http://localhost:3000
```

## Glossary

| Term | Definition |
|------|------------|
| **Thought Commitment** | Storing text on-chain with cryptographic proof |
| **Dual-Gas** | Two-layer gas metering system |
| **MMR** | Merkle Mountain Range (proof-of-contribution) |
| **Off-Chain** | Backend services (not on blockchain) |
| **On-Chain** | Smart contracts on Solana |

---

**This is a monorepo. Each package has its own README. Refer to individual package docs for detailed information.**