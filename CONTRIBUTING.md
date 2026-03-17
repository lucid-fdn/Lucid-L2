# Contributing to Lucid Layer

Thank you for your interest in contributing to Lucid. This document covers the process for contributing to this repository.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/Lucid-L2.git`
3. Install dependencies:
   ```bash
   cd Lucid-L2/offchain
   npm install
   ```
4. Copy environment config: `cp .env.example .env`
5. Run tests: `npm test`

## Development Workflow

1. Create a branch from `master`: `git checkout -b feat/your-feature`
2. Make your changes
3. Run the checks:
   ```bash
   npm run type-check   # TypeScript compilation
   npm test             # Jest test suite
   npm run lint         # ESLint
   ```
4. Commit with a clear message describing _why_, not just _what_
5. Push and open a Pull Request

## Project Structure

```
offchain/packages/
  engine/       # Core truth library (crypto, receipts, chains, storage)
  gateway-lite/ # Express API server (routes, middleware, inference)
  sdk/          # Developer SDK
programs/       # 6 Solana Anchor programs
contracts/      # EVM smart contracts (Hardhat)
```

**Dependency rule:** `gateway-lite` may import from `engine`. `engine` must never import from `gateway-lite`.

## Code Standards

- TypeScript strict mode
- No `any` types in new code (existing `any` is being cleaned up)
- Tests required for new features and bug fixes
- Follow existing patterns in the codebase

## Solana Programs

```bash
anchor build
anchor test   # Requires solana-test-validator running
```

## EVM Contracts

```bash
cd contracts
npx hardhat test
```

## Reporting Issues

Open an issue on GitHub with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Environment (OS, Node version, Solana CLI version)

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
