# Contributing to Lucid Layer

Thank you for your interest in contributing to Lucid — the autonomous AI infrastructure layer. Whether you're fixing a bug, adding a feature, improving docs, or writing tests, your contribution matters.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [Code Standards](#code-standards)
- [Commit Conventions](#commit-conventions)
- [Testing](#testing)
- [Working with Solana Programs](#working-with-solana-programs)
- [Working with EVM Contracts](#working-with-evm-contracts)
- [Working with the Offchain Engine](#working-with-the-offchain-engine)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)
- [Architecture Guidelines](#architecture-guidelines)
- [License](#license)

---

## Getting Started

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/Lucid-L2.git
cd Lucid-L2

# 2. Install offchain dependencies
cd offchain && npm install

# 3. Copy environment config
cp .env.example .env

# 4. Verify everything works
npm test                  # 103 suites, 1,683 tests
npm run type-check        # TypeScript compilation
```

### Prerequisites

| Tool | Version | Required for |
|------|---------|-------------|
| Node.js | 20+ | Offchain engine + API |
| npm | 9+ | Package management |
| Rust + Cargo | Latest stable | Solana programs |
| Solana CLI | 1.18+ | On-chain development |
| Anchor | 0.30+ | Solana program framework |
| Docker | 24+ | Local deployment testing |

---

## Development Workflow

```bash
# 1. Create a feature branch from master
git checkout -b feat/your-feature

# 2. Make changes

# 3. Run all checks
cd offchain
npm run type-check        # Must pass — no new type errors
npm test                  # Must pass — no regressions
npm run lint              # Must pass — no lint violations

# 4. Commit (see conventions below)
git commit -m "feat(memory): add temporal decay to semantic recall"

# 5. Push and open a PR
git push origin feat/your-feature
```

---

## Project Structure

```
Lucid-L2/
├── programs/              6 Solana Anchor programs (Rust)
├── contracts/             17 EVM contracts (Solidity)
├── offchain/
│   └── packages/
│       ├── engine/        Truth library — no HTTP, no Express
│       │   └── src/
│       │       ├── identity/       Passports, wallets, NFT, shares
│       │       ├── memory/         6 memory types, recall, compaction
│       │       ├── epoch/          Epoch lifecycle, MMR
│       │       ├── receipt/        Cryptographic receipts
│       │       ├── payment/        x402, pricing, splits, escrow
│       │       ├── compute/        Deployers, runtime adapters, agents
│       │       ├── deployment/     Control plane (state, reconciler, rollout)
│       │       ├── anchoring/      Unified DePIN dispatcher
│       │       ├── reputation/     On/off-chain reputation
│       │       └── shared/         Crypto, DB, config, chains, jobs
│       ├── gateway-lite/  Express API — thin route handlers
│       └── sdk/           Developer SDK
├── schemas/               14 JSON validation schemas
├── tests/                 Solana program tests (Mocha)
├── examples/              Quickstart guides (JS, Python, TS)
└── docs/                  Design specs + implementation plans
```

**Critical dependency rule:**
- `gateway-lite` may import from `engine`
- `engine` must NEVER import from `gateway-lite` (ESLint-enforced)

---

## Code Standards

### TypeScript

- **Strict mode** — all new code must compile under `strict: true`
- **No `any`** — use proper types. `unknown` + type guards when truly dynamic.
- **No `import type`** in test files — babel/jest doesn't support it. Use regular `import`.
- **Feature-domain organization** — code lives in its domain folder (memory, payment, deployment), not grouped by technical layer
- **Interface-first** — new features should define an `I*` interface, then implement (e.g., `IDeploymentStore` → `PostgresDeploymentStore` + `InMemoryDeploymentStore`)
- **Factory pattern** — use `getXxx()` singletons with `resetXxx()` for test teardown

### Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Files | camelCase | `agentDeploymentService.ts` |
| Interfaces | `I` prefix | `IDeploymentStore` |
| Types/Enums | PascalCase | `ActualState`, `DeploymentEventType` |
| Constants | UPPER_SNAKE | `VALID_TRANSITIONS` |
| Functions | camelCase | `getDeploymentStore()` |
| Test files | `*.test.ts` | `control-plane.test.ts` |

### What NOT to do

- Don't add comments to code you didn't change
- Don't add error handling for scenarios that can't happen
- Don't create abstractions for one-time operations
- Don't add backward-compatibility shims — just change the code
- Don't introduce circular dependencies between packages

---

## Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

Co-Authored-By: Your Name <your@email.com>
```

### Types

| Type | When |
|------|------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructuring (no behavior change) |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Build, CI, tooling, dependencies |

### Scopes

Use the domain: `memory`, `deployment`, `payment`, `receipt`, `epoch`, `identity`, `anchoring`, `reputation`, `compute`, `db`.

### Examples

```
feat(deployment): add blue-green rollout with slot promotion
fix(memory): prevent hash chain break on concurrent writes
refactor(anchoring): unify DePIN dispatch into single interface
test(deployment): 15 rollout tests — promote, rollback, cancel
docs: update README with autonomous stack overview
```

---

## Testing

### Running tests

```bash
cd offchain

# Full suite
npm test                                          # 103 suites, 1,683 tests

# Single file
npx jest packages/engine/src/deployment/__tests__/rollout.test.ts --no-coverage

# Pattern match
npx jest --testPathPattern="memory" --no-coverage

# Type check only
npm run type-check
```

### Writing tests

- **Every new feature needs tests.** No exceptions.
- **Use `InMemory*` stores** for unit tests (fast, deterministic)
- **Mock external dependencies** — deployers, providers, LLMs
- **Follow existing patterns** — look at nearby `__tests__/` folders
- **Test the contract, not the implementation** — test via the interface, not internal methods

```typescript
// Good: test through the interface
const store = new InMemoryDeploymentStore();
const deployment = await store.create({ agent_passport_id: 'agent-001', ... });
expect(deployment.actual_state).toBe('pending');

// Bad: test internal Map directly
expect(store['deployments'].size).toBe(1);
```

### Test structure

```
engine/src/<domain>/__tests__/<domain>.test.ts
```

Each domain has its own `__tests__/` folder next to the source code.

---

## Working with Solana Programs

```bash
# Build all 6 programs
anchor build

# Run tests (requires local validator)
solana-test-validator --reset --quiet &
cd tests && npm test

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Test specific program
cd tests && npm run test:passports
```

### Program layout

Each program lives in `programs/<name>/src/lib.rs` with Anchor macros. PDAs follow the pattern `["seed", key.as_ref()]`.

---

## Working with EVM Contracts

```bash
cd contracts
npx hardhat test
npx hardhat deploy --network base    # Deploy to Base
```

17 contracts in `contracts/src/` — full parity with Solana programs where applicable.

---

## Working with the Offchain Engine

### Adding a new feature

1. **Define the interface** in `engine/src/<domain>/`
2. **Implement** InMemory (tests) + Postgres (production) versions
3. **Add factory** in `index.ts` with `getXxx()` / `resetXxx()`
4. **Write tests** in `__tests__/` using the InMemory implementation
5. **Add routes** in `gateway-lite/src/routes/` (thin handlers, delegate to engine)
6. **Update OpenAPI** in `openapi.yaml`

### Key patterns to follow

| Pattern | Where to look |
|---------|--------------|
| Interface + InMemory + Postgres | `deployment/control-plane/store.ts` |
| Factory + singleton + reset | `deployment/control-plane/index.ts` |
| Status machine + transitions | `deployment/control-plane/state-machine.ts` |
| Optimistic locking | `deployment/control-plane/in-memory-store.ts` |
| DePIN dispatch | `anchoring/dispatcher.ts` |
| Memory type managers | `memory/managers/` |
| Route handlers (thin) | `gateway-lite/src/routes/` |

---

## Pull Request Process

1. **Branch from `master`** — use `feat/`, `fix/`, `refactor/` prefixes
2. **All checks must pass** — type-check + tests + lint
3. **No regressions** — test count should stay the same or increase
4. **One concern per PR** — don't mix features with refactors
5. **Describe the why** — PR description should explain motivation, not just list changes
6. **Update docs if needed** — CLAUDE.md, OpenAPI, README

### PR template

```markdown
## Summary
- What this PR does and why

## Changes
- List of key changes

## Test plan
- [ ] New tests added
- [ ] Existing tests pass
- [ ] Type check passes
```

---

## Reporting Issues

Open a GitHub issue with:

- **What you expected** to happen
- **What actually happened** (include error messages, logs)
- **Steps to reproduce** (minimal, specific)
- **Environment** — OS, Node.js version, Solana CLI version, relevant env vars

For security vulnerabilities, email security@raijinlabs.io instead of opening a public issue.

---

## Architecture Guidelines

Before making significant changes, understand the core principles:

1. **Lucid is the control plane, not the execution authority.** Agents run on decentralized providers. Lucid coordinates — it doesn't own.

2. **Local truth, global supervision.** Agent memory is agent-owned (SQLite). Deployment state is fleet-wide (Supabase). Never mix these.

3. **Interface-first, swap later.** Every external dependency (`IDepinStorage`, `INFTProvider`, `IDeploymentStore`, `ISecretsResolver`) is behind a swappable interface.

4. **Events, not coupling.** State changes emit events. Consumers react. Don't create direct cross-domain function calls.

5. **L3 is operational, not canonical.** Supabase stores operational projections. Chain + DePIN are the source of truth. If Supabase is lost, rebuild from L1+L2.

Read [CLAUDE.md](CLAUDE.md) for the full architecture reference.

---

## License

By contributing, you agree that your contributions will be licensed under:
- **Engine & programs:** [Apache License 2.0](LICENSE)
- **Gateway-lite:** [AGPL-3.0](offchain/packages/gateway-lite/LICENSE)
