# Docs Pipeline Extension — Multi-Source Ingestion

**Date:** 2026-03-20
**Status:** Draft
**Depends on:** Existing `tools/docs/` pipeline (ts-morph + AI enrichment)
**Goal:** Extend the docs pipeline to generate public doc pages from CLAUDE.md, READMEs, and .env files — not just TypeScript barrels. Eliminate manual page writing for ~35 stub pages.

---

## Problem

The current pipeline only ingests TypeScript barrel exports via ts-morph. This covers Core Concepts and On-Chain pages (~17 pages). But 35+ pages in Build & Deploy, How Lucid Works, Gateway, and Advanced are "stubs" that require manual extraction from CLAUDE.md files and READMEs.

These source files are already well-structured — headers, tables, code blocks, env var lists. They're just not wired into the pipeline.

---

## Solution: Source Adapters

Add pluggable source adapters alongside the existing ts-morph extractor. Each adapter reads a different source format and outputs a normalized `PageSource` object that the AI enrichment layer can process.

```
Source Adapters (new)
  ├── TypeScriptAdapter     ← existing (ts-morph barrel extraction)
  ├── ClaudeMdAdapter       ← NEW: parse CLAUDE.md sections by heading
  ├── ReadmeAdapter         ← NEW: parse README.md files
  ├── EnvAdapter            ← NEW: parse .env.example into env var tables
  └── CliAdapter            ← NEW: parse CLI --help output

All adapters → PageSource → AI Enrichment → Mintlify .mdx
```

---

## Source Adapter Interface

```typescript
interface PageSource {
  /** Target page path in lucid-docs (e.g. "deploy/from-telegram") */
  pagePath: string
  /** Mintlify frontmatter title */
  title: string
  /** Mintlify frontmatter description */
  description: string
  /** Raw content extracted from source (markdown) */
  rawContent: string
  /** Source file path (for cache invalidation) */
  sourceFile: string
  /** Section identifier within source file (for CLAUDE.md sections) */
  sourceSection?: string
  /** Whether AI enrichment is needed or raw content is sufficient */
  needsEnrichment: boolean
}

interface SourceAdapter {
  /** Unique adapter name */
  name: string
  /** Extract page sources from the configured files */
  extract(): Promise<PageSource[]>
}
```

---

## Adapter 1: ClaudeMdAdapter

**Parses:** CLAUDE.md files from both repos by heading sections.

**Configuration:**
```typescript
const CLAUDE_MD_MAPPINGS: ClaudeMdMapping[] = [
  // Lucid-L2 CLAUDE.md
  {
    sourceFile: '/home/debian/Lucid/Lucid-L2/CLAUDE.md',
    sections: [
      {
        heading: '### Agent Activation (5 Paths)',
        pages: [
          { pagePath: 'deploy/from-cli', title: 'Deploy from CLI', extractSubsection: 'Path A' },
          { pagePath: 'deploy/from-source', title: 'Deploy from Source', extractSubsection: 'Path C' },
          { pagePath: 'deploy/from-image', title: 'Deploy from Image (BYOI)', extractSubsection: 'Path A' },
          { pagePath: 'deploy/from-catalog', title: 'Deploy from Catalog', extractSubsection: 'Path D' },
        ],
      },
      {
        heading: '### Launch UI',
        pages: [
          { pagePath: 'deploy/setup-wizard', title: 'Interactive Setup' },
        ],
      },
      {
        heading: '### Base Runtime',
        pages: [
          { pagePath: 'how/execution-runtime', title: 'Agent Runtime' },
        ],
      },
      {
        heading: '### Key Algorithms',
        pages: [
          { pagePath: 'how/settlement-receipts', title: 'Receipts & Proofs' },
        ],
      },
      {
        heading: '### DePIN & Anchoring',
        pages: [
          { pagePath: 'how/settlement-anchoring', title: 'Anchoring' },
          { pagePath: 'deploy/depin', title: 'DePIN Providers' },
        ],
      },
      {
        heading: '### MemoryMap',
        pages: [
          { pagePath: 'concepts/memory', title: 'Portable Memory' },
        ],
      },
      {
        heading: '### Compute Heartbeat System',
        pages: [
          { pagePath: 'deploy/compute-selection', title: 'Compute Selection' },
        ],
      },
      {
        heading: '### NFT Provider Layer',
        pages: [
          { pagePath: 'how/settlement-identity', title: 'Identity (Passports)' },
        ],
      },
      {
        heading: '### Share Tokens',
        pages: [
          { pagePath: 'how/settlement-payments', title: 'Payments & Ownership' },
        ],
      },
      {
        heading: '### Deployment Control Plane',
        pages: [
          { pagePath: 'concepts/agent-deployment', title: 'Agent Deployment Lifecycle' },
        ],
      },
    ],
  },

  // Platform-core CLAUDE.md
  {
    sourceFile: '/home/debian/lucid-plateform-core/CLAUDE.md',
    sections: [
      {
        heading: '### TrustGate Flow',
        pages: [
          { pagePath: 'gateway/trustgate', title: 'TrustGate (LLM Gateway)' },
          { pagePath: 'how/coordination-gateway', title: 'Gateway (TrustGate)' },
        ],
      },
      {
        heading: '### MCPGate Flow',
        pages: [
          { pagePath: 'gateway/mcpgate', title: 'MCPGate (Tool Gateway)' },
          { pagePath: 'how/coordination-mcp', title: 'Tool Access (MCP)' },
        ],
      },
      {
        heading: '## Control-Plane Admin API',
        pages: [
          { pagePath: 'gateway/control-plane', title: 'Control Plane' },
        ],
      },
      {
        heading: '## x402 Payment System',
        pages: [
          { pagePath: 'concepts/payments', title: 'Payments (x402)' },
          { pagePath: 'how/settlement-payments', title: 'Payments (x402)' },
        ],
      },
      {
        heading: '## Telegram Bot',
        pages: [
          { pagePath: 'deploy/from-telegram', title: 'Deploy from Telegram' },
          { pagePath: 'gateway/channels', title: 'Managed Channels' },
          { pagePath: 'how/coordination-channels', title: 'Channels & Routing' },
        ],
      },
      {
        heading: '## Credential Adapter System',
        pages: [
          { pagePath: 'deploy/secrets', title: 'Secrets & API Keys' },
        ],
      },
    ],
  },
]
```

**Extraction logic:**
1. Read CLAUDE.md file
2. Split by markdown headings (`##`, `###`)
3. For each configured heading, extract the content until the next heading of same or higher level
4. If `extractSubsection` is set, further narrow to that subsection
5. Output as `PageSource` with `needsEnrichment: true`

**AI enrichment prompt:**
```
You are converting internal developer documentation into a public-facing doc page.

Source content (from CLAUDE.md):
{rawContent}

Target page: {title}
Target audience: developers building on Lucid

Rules:
- Rewrite for a developer who has never seen Lucid before
- Remove internal references (file paths, env vars unless relevant)
- Keep code examples and tables
- Add Mintlify components (Steps, CodeGroup, Tip, Warning) where appropriate
- Use frontmatter: title, description
- Tone: clear, direct, practical
```

---

## Adapter 2: ReadmeAdapter

**Parses:** README.md files from specific packages.

**Configuration:**
```typescript
const README_MAPPINGS: ReadmeMapping[] = [
  {
    sourceFile: 'offchain/packages/agent-runtime/README.md',
    pagePath: 'how/execution-runtime',
    title: 'Agent Runtime',
  },
  {
    sourceFile: 'offchain/README.md',
    pagePath: 'advanced/self-hosting',
    title: 'Self-Hosting',
    extractSection: '## Quick Start',
  },
  {
    sourceFile: 'CONTRIBUTING.md',
    pagePath: 'advanced/contributing',
    title: 'Contributing',
    needsEnrichment: false, // Use as-is
  },
  {
    sourceFile: 'packages/pay/README.md',
    repoPath: '/home/debian/lucid-plateform-core',
    pagePath: 'concepts/payments',
    title: 'Payments (x402)',
  },
]
```

---

## Adapter 3: EnvAdapter

**Parses:** `.env.example` files into env var reference tables.

**Configuration:**
```typescript
const ENV_MAPPINGS: EnvMapping[] = [
  {
    sourceFile: 'offchain/.env.example',
    pagePath: 'advanced/configuration',
    title: 'Configuration',
  },
]
```

**Output:** Generates a table with columns: Variable, Required, Default, Description. Parses comments above each variable as descriptions.

**AI enrichment:** Groups env vars by category (Database, Solana, DePIN, Inference, etc.) and adds explanatory text.

---

## Adapter 4: CliAdapter

**Parses:** CLI help output.

**Not needed for Phase 2** — the CLI commands are already documented in CLAUDE.md. This adapter would be a future enhancement that runs `lucid --help` and parses the output.

---

## Pipeline Integration

### New artifact type: `--artifact pages`

```bash
# Generate all public doc pages from all sources
npx tsx src/generate.ts --artifact pages

# Generate from a specific adapter
npx tsx src/generate.ts --artifact pages --adapter claude-md

# Generate a specific page
npx tsx src/generate.ts --artifact pages --page deploy/from-telegram
```

### Cache invalidation

Each `PageSource` includes `sourceFile`. The cache stores a content hash per source file. On regeneration:
- If source file hash hasn't changed → skip
- If changed → re-extract, re-enrich, re-render

### Output

For each `PageSource`, the pipeline:
1. Extracts raw content via the adapter
2. If `needsEnrichment: true`, sends to AI (TrustGate) with the enrichment prompt
3. Renders as Mintlify `.mdx` with frontmatter
4. Writes to `lucid-docs/{pagePath}.mdx`

---

## CI Integration

### GitHub Action in Lucid-L2

```yaml
name: Sync Public Docs
on:
  push:
    branches: [master]
    paths:
      - 'CLAUDE.md'
      - 'CONTRIBUTING.md'
      - 'offchain/packages/engine/src/**'
      - 'offchain/packages/agent-runtime/**'
      - 'offchain/.env.example'
      - 'programs/**'
      - 'contracts/**'

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd tools/docs && npm ci
      - run: |
          cd tools/docs
          TRUSTGATE_API_KEY=${{ secrets.TRUSTGATE_API_KEY }} \
          npx tsx src/generate.ts --artifact pages --artifact reference --artifact mintlify
      - name: Push to lucid-docs
        run: |
          git clone https://x-access-token:${{ secrets.DOCS_TOKEN }}@github.com/lucid-fdn/lucid-docs.git /tmp/docs
          # Copy generated pages
          rsync -av --include='*.mdx' output/ /tmp/docs/
          cd /tmp/docs
          git add -A
          git diff --cached --quiet || (git commit -m "docs: auto-sync from Lucid-L2" && git push)
```

### GitHub Action in lucid-plateform-core

```yaml
name: Sync Gateway Docs
on:
  push:
    branches: [main]
    paths:
      - 'CLAUDE.md'

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Cross-repo: check out Lucid-L2 tools
      - uses: actions/checkout@v4
        with:
          repository: lucid-fdn/Lucid-L2
          path: lucid-l2
      - run: cd lucid-l2/tools/docs && npm ci
      - run: |
          cd lucid-l2/tools/docs
          TRUSTGATE_API_KEY=${{ secrets.TRUSTGATE_API_KEY }} \
          PLATFORM_CORE_CLAUDE_MD=${{ github.workspace }}/CLAUDE.md \
          npx tsx src/generate.ts --artifact pages --adapter claude-md
      - name: Push to lucid-docs
        run: |
          git clone https://x-access-token:${{ secrets.DOCS_TOKEN }}@github.com/lucid-fdn/lucid-docs.git /tmp/docs
          rsync -av --include='*.mdx' output/ /tmp/docs/
          cd /tmp/docs
          git add -A
          git diff --cached --quiet || (git commit -m "docs: auto-sync gateway docs" && git push)
```

---

## Page Coverage After Extension

| Method | Pages | What |
|--------|-------|------|
| 🤖 AI Pipeline (TypeScript) | 17 | Core Concepts + On-Chain |
| 🤖 AI Pipeline (CLAUDE.md) | ~25 | Build & Deploy + How Lucid Works + Gateway + Advanced |
| 🤖 AI Pipeline (README) | ~5 | Runtime, Self-Hosting, Contributing, Payments |
| 🤖 AI Pipeline (.env) | 1 | Configuration |
| ⚙️ Mintlify OpenAPI | ~175 | API endpoints (auto-render) |
| ✅ Hand-written | 4 | Get Started (index, quickstart, install-agent, architecture) |
| ✅ Kept from old site | 3 | API intro, errors, rate limits |

**Total: ~55 pages, only 7 hand-written. Everything else auto-generated and auto-updated.**

---

## File Structure (new files in tools/docs/)

```
tools/docs/src/
  adapters/
    types.ts              # PageSource, SourceAdapter interfaces
    claudeMdAdapter.ts    # Parse CLAUDE.md sections
    readmeAdapter.ts      # Parse README.md files
    envAdapter.ts         # Parse .env.example
    registry.ts           # Adapter registry + dispatch
  extract/
    extractor.ts          # Existing ts-morph extractor (unchanged)
  render/
    pageRenderer.ts       # NEW: render PageSource → .mdx
    mintlifySync.ts       # Existing (unchanged)
  generate.ts             # Extended: --artifact pages, --adapter flag
  config.ts               # Extended: CLAUDE_MD_MAPPINGS, README_MAPPINGS
```

---

## Implementation Effort

| Task | Effort |
|------|--------|
| Define PageSource + SourceAdapter interface | 30 min |
| ClaudeMdAdapter (heading parser + section extraction) | 2 hr |
| ReadmeAdapter | 1 hr |
| EnvAdapter | 30 min |
| AI enrichment prompt for page conversion | 30 min |
| Page renderer (.mdx with frontmatter) | 1 hr |
| Wire into generate.ts (--artifact pages) | 1 hr |
| Cache integration | 30 min |
| GitHub Actions (both repos) | 1 hr |
| Test + validate all ~30 generated pages | 2 hr |

**Total: ~10 hours**

---

## Success Criteria

1. `npx tsx src/generate.ts --artifact pages` generates all ~48 non-hand-written pages
2. Each page has correct Mintlify frontmatter, readable content, proper formatting
3. Cache prevents re-generation when source files haven't changed
4. GitHub Action auto-syncs on push to lucid-docs
5. Only 7 pages remain hand-written (4 Get Started + 3 API reference)
