# Lucid Layer — Offchain

Two-package monorepo powering the Lucid Layer API and truth engine.

## Packages

| Package | Purpose |
|---------|---------|
| `packages/engine/` | Core truth library — identity, memory, receipts, epochs, payments, compute, deployment, anchoring, reputation. No HTTP. |
| `packages/gateway-lite/` | Express API server — thin route handlers, middleware, providers. |
| `packages/contrib/` | External integrations — LLM providers, n8n, HuggingFace, OAuth, MCP, FlowSpec. |

**Dependency rule:** `gateway-lite → engine` (OK). `engine → gateway-lite` (forbidden).

## Quick Start

```bash
npm install
cp .env.example .env    # Edit with your values
npm start               # API on :3001
npm test                # 102 suites, 1,654 tests
```

## Structure

```
offchain/
  package.json           Workspace root
  src/                   App layer (server boot, CLI, workers)
  packages/
    engine/              @lucid-l2/engine
    gateway-lite/        @lucid-l2/gateway-lite
    contrib/             External integrations
  local-packages/        @lucid-fdn/passport (shared with Lucid Cloud)
```

## Commands

```bash
npm start                # Start API server
npm test                 # Run Jest (102 suites)
npm run type-check       # TypeScript compilation
npm run cli deploy ...   # Agent deployment CLI
```
