# AI Documentation Pipeline — Design Spec

**Date:** 2026-03-18
**Status:** Design
**Author:** Kevin Wayne
**Depends on:** ts-morph, OpenAI SDK (existing dep), Anchor CLI, Solidity compiler

## Core Principle

> Compiler extracts facts. AI writes narrative. Templates enforce consistency. One command, incremental-ready in Phase 1, incremental execution enabled in Phase 2 via `--changed`.

## Context

Lucid L2 has 52K+ LOC across 9 TypeScript domains, 6 Solana programs, and 15 EVM contracts (10 concrete + 2 interfaces + 3 modules; excludes 2 test mocks). Documentation is manual: 1,384 JSDoc blocks, a comprehensive CLAUDE.md, design specs in `docs/`, and a 312KB OpenAPI spec. There is no automated documentation generation.

Developer onboarding requires reading raw source code to understand domain architecture, data flows, and cross-domain relationships. This pipeline automates generation of two documentation tiers:

1. **Module overviews** — AI-generated narrative explaining purpose, architecture, data flow, and gotchas per domain
2. **Interface reference** — Deterministic rendering of exported interfaces, functions, and types from compiler output

Secondary artifacts (CLAUDE.md sync, changelog, llms.txt) are generated from the same extraction pipeline.

### What is NOT in scope

- Mintlify integration (separate effort, consumes these docs as input)
- Interactive API playground
- Auto-generated code examples
- Documentation hosting / site generation
- Frontend component documentation (no React components in this repo)

---

## Architecture

### Pipeline Overview

```
source files
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  EXTRACTOR                                                   │
│  TypeScript: ts-morph (exported symbols, types, imports)     │
│  Solana: anchor idl build (instructions, accounts, types)    │
│  EVM: solc ABI output (functions, events, errors)            │
│                                                              │
│  Output: DomainSnapshot (in-memory, not persisted)           │
│  Cache key: contentHash (selected source file contents)      │
│             apiHash (sorted exported signatures)             │
└──────────────┬──────────────────────────────────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌──────────────┐ ┌──────────────────────────────────────────┐
│  RENDERER    │ │  ENRICHER (AI)                            │
│  Deterministic│ │  Receives: DomainSnapshot + source files  │
│  No AI       │ │  Generates: narrative sections only        │
│              │ │  Post-check: symbol guard                  │
│  Outputs:    │ │                                            │
│  - Reference │ │  Outputs:                                  │
│  - Key Ifaces│ │  - Purpose                                 │
│  - Cross-deps│ │  - Architecture                            │
│  - llms.txt  │ │  - Data Flow                               │
└──────────────┘ │  - Patterns & Gotchas                      │
                 └──────────────────────────────────────────┘
       │               │
       └───────┬───────┘
               ▼
┌─────────────────────────────────────────────────────────────┐
│  ASSEMBLER                                                   │
│  Merges deterministic + AI sections into final docs          │
│  Stamps: <!-- generated: commit {sha}, {timestamp} -->       │
│  Writes: docs/modules/*.md, docs/reference/*.md              │
│  Optionally: CLAUDE.md sections, CHANGELOG.md, llms.txt     │
└─────────────────────────────────────────────────────────────┘
```

### Key Constraints

| Rule | Rationale |
|------|-----------|
| AI never generates signatures, params, types, or defaults | Compiler is source of truth for structural facts |
| AI receives DomainSnapshot as structured context | Grounds narrative in real extracted code |
| DomainSnapshot is in-memory, not persisted as JSON | No IR schema to design, version, or maintain |
| Key Interfaces and Cross-Domain Dependencies are deterministic | Factual sections must not hallucinate |
| Post-generation symbol guard scans AI output | Catches hallucinated identifiers before commit |
| Extractor/Renderer/Enricher are internal functions, not CLI commands | One entrypoint: `docs:generate` |
| Non-TS extraction uses build artifacts (IDL, ABI), not regex | Compiler-authoritative, not pattern-fragile |

### File Structure

```
tools/docs/
  generate.ts              # CLI entrypoint: pnpm docs:generate
  check.ts                 # CI entrypoint: pnpm docs:check
  extract/
    extractor.ts           # ts-morph domain scanner
    anchor-extractor.ts    # Anchor IDL parser
    solidity-extractor.ts  # Solc ABI parser
    types.ts               # DomainSnapshot, InterfaceInfo, FunctionInfo, etc.
  render/
    reference.ts           # Deterministic interface/function docs
    module.ts              # AI narrative: prompt construction + enrichment
    claude-md.ts           # CLAUDE.md sentinel-based section sync
    changelog.ts           # Conventional commit parser + AI summary
    llms-txt.ts            # Deterministic llms.txt assembler
  templates/
    module.hbs             # Module doc layout (deterministic + AI sections)
    reference.hbs          # Interface reference layout
  cache/
    hashes.json            # { domain: { apiHash, contentHash } }

docs/
  modules/
    memory.md              # AI narrative overview
    payment.md
    identity.md
    compute.md
    deployment.md
    epoch.md
    receipt.md
    anchoring.md
    reputation.md
    programs/              # Phase 3: Solana program docs
      thought-epoch.md
      lucid-passports.md
      ...
    contracts/             # Phase 3: EVM contract docs
      ...
  reference/
    memory.md              # Deterministic interface reference
    payment.md
    identity.md
    ...
```

---

## DomainSnapshot Type

```typescript
interface DomainSnapshot {
  domain: string                      // e.g. "memory", "payment"
  sourcePath: string                  // e.g. "offchain/packages/engine/src/memory"
  interfaces: InterfaceInfo[]         // exported I* interfaces
  functions: FunctionInfo[]           // exported functions
  types: TypeInfo[]                   // exported type aliases & enums
  imports: DependencyEdge[]           // cross-domain import graph
  apiHash: string                     // SHA-256 of sorted canonical signatures
  contentHash: string                 // SHA-256 of selected source file contents
}

interface InterfaceInfo {
  name: string
  filePath: string                    // relative to domain root
  jsDoc: string | null
  properties: PropertyInfo[]
  methods: MethodInfo[]
  extends: string[]
}

interface FunctionInfo {
  name: string
  filePath: string
  jsDoc: string | null
  params: ParamInfo[]
  returnType: string
  isAsync: boolean
}

interface TypeInfo {
  name: string
  filePath: string
  jsDoc: string | null
  kind: 'alias' | 'enum'
  definition: string                  // one-level expansion
}

interface DependencyEdge {
  fromDomain: string
  toDomain: string
  importedSymbols: string[]
}

interface PropertyInfo {
  name: string
  type: string
  jsDoc: string | null
  optional: boolean
}

interface MethodInfo {
  name: string
  params: ParamInfo[]
  returnType: string
  jsDoc: string | null
}

interface ParamInfo {
  name: string
  type: string
  optional: boolean
  defaultValue: string | null
}
```

### Anchor Program Snapshot (Phase 3)

```typescript
interface AnchorProgramSnapshot {
  programName: string
  programId: string
  sourcePath: string
  instructions: AnchorInstruction[]
  accounts: AnchorAccountStruct[]
  types: AnchorType[]
  events: AnchorEvent[]
  contentHash: string
}

interface AnchorInstruction {
  name: string
  args: { name: string; type: string }[]
  accounts: { name: string; isMut: boolean; isSigner: boolean }[]
}
```

### Solidity Contract Snapshot (Phase 3)

```typescript
interface SolidityContractSnapshot {
  contractName: string
  sourcePath: string
  functions: SolidityFunction[]
  events: SolidityEvent[]
  errors: SolidityError[]
  modifiers: string[]
  inheritance: string[]
  contentHash: string
}

interface SolidityFunction {
  name: string
  visibility: 'public' | 'external'
  stateMutability: string
  inputs: { name: string; type: string }[]
  outputs: { name: string; type: string }[]
}
```

---

## Deterministic File Selection

Source files fed to the AI enricher are selected deterministically per domain:

```
1. index.ts or barrel file (entry point)
2. Top 5 files by exported symbol count
3. Top 2 files by cross-domain import count
4. Files matching *Service.ts, *Manager.ts, *Store.ts (orchestrators)
5. Dedup, cap total at 25K tokens
```

If the 25K cap is hit, drop files from rule 4 first (orchestrators are often large), then from rule 2 (cross-domain imports are supplementary). Rules 1 and 3 are always included.

---

## AI Prompt Strategy

### Module Overview Prompt

```
System: You are a senior engineer writing internal architecture documentation
for the Lucid L2 platform. You write for experienced developers who are new
to this specific codebase. Be precise, technical, and concise.

Rules:
- NEVER invent function signatures, types, or parameter names
- Reference ONLY interfaces and functions listed in EXTRACTED FACTS
- Explain WHY design decisions were made, not just WHAT exists
- Describe data flows with concrete file paths (file → function → store)
- Note gotchas and non-obvious patterns
- Use backtick formatting for code identifiers

User:
## Domain: {domain}
## Source path: {sourcePath}

### EXTRACTED FACTS (compiler output — treat as ground truth)
{serialized DomainSnapshot: interfaces, functions, types, imports}

### SOURCE EXCERPTS (selected files, deterministic)
{file contents up to 25K tokens}

### TASK
Generate documentation with EXACTLY these 4 sections:

1. **Purpose** — What this domain does and why it exists (2-3 sentences)
2. **Architecture** — Key components, how they relate, file paths
3. **Data Flow** — How data moves through the domain (concrete paths)
4. **Patterns & Gotchas** — Non-obvious design decisions, common mistakes,
   things a new developer would get wrong

Do NOT generate interface tables, function signatures, or dependency lists.
Those are rendered separately from compiler output.
```

### Changelog Prompt

```
System: You are writing release notes for the Lucid L2 platform.
Be concise. Focus on what changed and why it matters, not commit-level detail.

User:
### Commits grouped by scope:
{deterministic grouping from conventional commits}

### Breaking changes:
{extracted from BREAKING CHANGE: footers and ! markers}

### TASK
Generate:
1. A one-paragraph release summary (what changed, why it matters)
2. Per-scope narrative (2-3 sentences per scope, grouping related commits)
3. Migration notes for each breaking change (what to change, why)
```

### Post-Generation Symbol Guard

After AI writes prose, scan for:
1. Backticked identifiers (`` `FooBar` ``)
2. PascalCase words not in common English (likely type/interface names)

Cross-reference against DomainSnapshot symbol names. Flag any not found:

```
<!-- WARNING: unverified identifiers: FooBar, BazService -->
```

**Important:** Only scan AI-authored sections (Purpose, Architecture, Data Flow, Patterns & Gotchas). Do NOT scan deterministic tables (Key Interfaces, Cross-Domain Dependencies) or copied JSDoc — these are compiler-sourced and will contain identifiers the guard doesn't need to verify. This reduces noise and keeps warnings trustworthy.

Does NOT fail the build. Logged for human review.

---

## Phase 1: Prove Value (1-2 days)

### Goal
One command → 9 immediately useful module overview docs for developer onboarding.

### Scope

| Included | Excluded |
|----------|----------|
| ts-morph extractor for 9 engine domains | Interface reference docs (Phase 2) |
| DomainSnapshot type + extraction | CLAUDE.md auto-update (Phase 2) |
| Deterministic file selection | `docs:check` CI gate (Phase 2) |
| AI enrichment (4 narrative sections) | `--changed` flag (Phase 2) |
| Deterministic Key Interfaces section | Changelog (Phase 3) |
| Deterministic Cross-Domain Dependencies section | llms.txt (Phase 3) |
| Post-generation symbol guard | Rust/Solidity docs (Phase 3) |
| `contentHash` caching per domain | |
| `--domain` and `--force` CLI flags | |

### CLI

```bash
pnpm docs:generate                    # All 9 module docs
pnpm docs:generate --domain memory    # Single domain
pnpm docs:generate --force            # Bypass cache, regenerate all
```

### Module Doc Output Format

Each module doc combines deterministic and AI sections:

```markdown
<!-- generated: commit {sha}, {timestamp} -->
# {Domain Name}

## Purpose
{AI-generated: 2-3 sentences}

## Architecture
{AI-generated: components, relationships, file paths}

## Data Flow
{AI-generated: concrete paths through the domain}

## Key Interfaces

| Interface | File | Role |
|-----------|------|------|
| `IMemoryStore` | `store/interface.ts` | {jsDoc first line or "Storage backend contract"} |
| `RecallRequest` | `types.ts` | {jsDoc first line or "Semantic recall query parameters"} |
...

{Deterministic: rendered from DomainSnapshot.interfaces}

## Cross-Domain Dependencies

| Direction | Domain | Symbols | Purpose |
|-----------|--------|---------|---------|
| imports | shared/crypto | `sha256`, `canonicalJson` | Hash chain computation |
| imports | receipt | `createReceipt` | Memory write receipts |
| exports to | anchoring | `ArchivePipeline` | DePIN snapshot dispatch |
...

{Deterministic: "imports" rows from this domain's DomainSnapshot.imports.
"exports to" rows require inverting the import graph — the renderer must
have access to ALL domains' snapshots to compute reverse edges.}

## Patterns & Gotchas
{AI-generated: non-obvious decisions, common mistakes}
```

### Domain Discovery

Domains are defined by an explicit allowlist in the tool config, not dynamically discovered. The engine source root (`offchain/packages/engine/src/`) contains directories that are NOT documentation targets (`shared/`, `chain/`, `utils/`, `__tests__/`). These are excluded by the allowlist, not by heuristic filtering.

**Allowlist (9 domains):**

| Domain | Full Path | Approx LOC |
|--------|-----------|------------|
| identity | `offchain/packages/engine/src/identity/` | ~6,000 |
| memory | `offchain/packages/engine/src/memory/` | ~12,000 |
| receipt | `offchain/packages/engine/src/receipt/` | ~3,000 |
| epoch | `offchain/packages/engine/src/epoch/` | ~2,000 |
| payment | `offchain/packages/engine/src/payment/` | ~5,000 |
| compute | `offchain/packages/engine/src/compute/` | ~8,000 |
| deployment | `offchain/packages/engine/src/deployment/` | ~4,000 |
| anchoring | `offchain/packages/engine/src/anchoring/` | ~500 |
| reputation | `offchain/packages/engine/src/reputation/` | ~1,500 |

**Excluded directories:** `shared/`, `chain/`, `utils/`, `__tests__/` — these are cross-cutting infrastructure, not feature domains. Adding a new domain requires adding it to the allowlist.

**Path convention:** Throughout this spec, `engine/src/` is shorthand for `offchain/packages/engine/src/`. The extractor uses full monorepo-relative paths internally.

### Caching

`tools/docs/cache/hashes.json` (committed to repo):

```json
{
  "memory": {
    "apiHash": "a1b2c3...",
    "contentHash": "d4e5f6..."
  },
  "payment": {
    "apiHash": "g7h8i9...",
    "contentHash": "j1k2l3..."
  }
}
```

- `apiHash`: SHA-256 of sorted `name:kind:signature` strings (exported symbols only). Computed and stored in Phase 1 but only used for reference freshness checks in Phase 2.
- `contentHash`: SHA-256 of concatenated selected source files (deterministic file set). Used for module doc freshness.
- Phase 1 behavior: always regenerates all domains (no implicit skipping). Hashes are computed and stored for future comparison but not used for cache skipping until `--changed` is added in Phase 2.
- `--force` bypasses cache entirely (meaningful from Phase 2 onward).

---

## Phase 2: Solidify (2-3 days)

### Goal
Add deterministic interface reference, CI freshness gate, CLAUDE.md sync, and incremental generation.

### Scope

| Included | Excluded |
|----------|----------|
| Deterministic reference renderer | Changelog (Phase 3) |
| `docs:check` CI gate (symbol coverage) | llms.txt (Phase 3) |
| CLAUDE.md sentinel-based sync | Rust/Solidity (Phase 3) |
| `--artifact` flag (modules, reference, claude-md) | |
| `--changed` flag (skip unchanged domains) | |
| `apiHash` for reference freshness | |

### Reference Doc Output Format

`docs/reference/{domain}.md`:

```markdown
<!-- generated: commit {sha}, {timestamp} -->
# {Domain} — Interface Reference

## Interfaces

### IMemoryStore
> `store/interface.ts:14`

{jsDoc description, verbatim from source}

| Property | Type | Description |
|----------|------|-------------|
| `store` | `(entry: MemoryEntry) => Promise<StoredMemory>` | {jsDoc @description or —} |
| `recall` | `(query: RecallQuery) => Promise<MemoryEntry[]>` | {jsDoc @description or —} |

**Extends:** —
**Implemented by:** `SqliteMemoryStore`, `PostgresMemoryStore`, `InMemoryStore` (best-effort)

---

## Functions

### createReceipt
> `receiptService.ts:42`

{jsDoc description}

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `body` | `ReceiptBody` | no | — |
| `signerKey` | `Uint8Array` | no | — |

**Returns:** `Promise<SignedReceipt>`
**Async:** yes

---

## Types

### MemoryLane
> `types.ts:8`

```typescript
type MemoryLane = 'self' | 'user' | 'shared' | 'market'
```

---

## Enums

### CompactionMode
> `types.ts:22`

| Value | Description |
|-------|-------------|
| `warm` | Archive episodics past hot boundary |
| `cold` | Hard-prune archived past retention |
| `full` | Both warm + cold |
```

### Rendering Rules

- JSDoc `@description` → Description column
- JSDoc `@param` → preserved in function param tables
- Properties and methods sorted alphabetically
- "Implemented by" resolved from ts-morph class declarations (best-effort — factories may be missed)
- Type aliases expanded one level deep (no recursive expansion)
- Enums render as value tables

### CLAUDE.md Sentinel Sync

CLAUDE.md sections marked with sentinels are auto-updated:

```markdown
## Memory
<!-- docs:auto:start domain=memory -->
Portable, provable agent memory in `engine/src/memory/`. Three layers:
Store layer (`IMemoryStore` — SQLite, Postgres, in-memory), Manager layer
(per-type validation, hash chain), Recall layer (two-stage vector + rerank).
6 memory types: episodic, semantic, procedural, entity, trust-weighted, temporal.
Local-first (SQLite per-agent), async projection to Postgres for fleet queries.

Key interfaces: `IMemoryStore`, `IRecallEngine`, `CompactionConfig`, `MemoryLane`.
Cross-domain: imports shared/crypto (hashing), receipt (write receipts);
exports to anchoring (snapshot dispatch).
<!-- docs:auto:end domain=memory -->
```

**Rules:**
- Only content between `docs:auto:start` and `docs:auto:end` is replaced
- Hand-written content outside sentinels is never touched
- Content derived from module doc Purpose + Architecture + Key Interfaces (condensed to ~15 lines)
- Sentinels must be manually added to CLAUDE.md once; the tool updates content within them

### CI Check (`pnpm docs:check`)

**Hard failures (block PR):**
- Exported symbol exists in source but not in reference doc
- Reference doc mentions a symbol that no longer exists in source
- `apiHash` mismatch between cache and current extraction (reference docs stale)
- Parse failure in a domain (in CI mode only — local mode warns)

**Warnings (non-blocking):**
- Module overview exists but `contentHash` has changed (narrative may be stale)
- Cross-domain dependency exists in import graph but not mentioned in module overview
- New domain directory detected with no docs generated

**Not checked:**
- Prose quality (human review)
- AI narrative accuracy (cannot be automated reliably)

### Incremental CLI

```bash
pnpm docs:generate --changed              # Only domains where contentHash differs
pnpm docs:generate --artifact modules      # Module overviews only (AI)
pnpm docs:generate --artifact reference    # Reference docs only (deterministic, fast)
pnpm docs:generate --artifact claude-md    # CLAUDE.md sync only
```

---

## Phase 3: Expand (2-3 days)

### Goal
Changelog from conventional commits, llms.txt, and Rust/Solidity documentation using build artifacts.

### 3A: Changelog Generation

**Input:** Git log between two refs, filtered to conventional commits.

```bash
pnpm docs:generate --artifact changelog [--from v1.2.0] [--to HEAD]
```

**Pipeline:**
1. Parse git log with conventional commit format
2. Support `type(scope): description`, `BREAKING CHANGE:` footer, `!` marker, `BREAKING-CHANGE` synonym
3. Handle `revert` as special type (not grouped with features)
4. Group by scope; fallback "Other" bucket for commits with no scope. Expected non-domain scopes include: `infra`, `repo`, `devops`, `ci`, `deps`, `docs` — these go to "Other" intentionally, not as uncategorized leftovers
5. Deterministic skeleton: commit type, scope, description, hash, breaking changes
6. AI generates: release summary paragraph, per-scope narrative, migration notes
7. Output: prepend entry to CHANGELOG.md

**Example:**

```markdown
## v1.3.0 — 2026-03-18

Deployment control plane gains blue-green rollouts with automatic drift
reconciliation. Memory system switches to local-first SQLite as default
backend, with async projection to Postgres for fleet queries.

### Deployment
- **feat(deployment):** blue-green rollout with canary percentage — `a1b2c3`
- **feat(deployment):** reconciler drift detection at 60s interval — `d4e5f6`
- **fix(deployment):** lease auto-extend race condition on Akash — `g7h8i9`

Blue-green rollouts replace the previous stop-then-deploy pattern. The
reconciler now polls every 60s and triggers automatic corrective actions
when deployed state diverges from desired state.

### Breaking Changes
- `IMemoryStore.init()` now requires `agentId` parameter — migration:
  pass the agent's passport ID from the calling context.
```

### 3B: llms.txt Generation

**Fully deterministic — zero AI.** Assembled from existing artifacts.

```bash
pnpm docs:generate --artifact llms-txt
```

Output at repo root as `llms.txt`:

```
# Lucid L2
> Autonomous AI infrastructure layer with verifiable identity, memory,
> compute, and payments on Solana + EVM.

## Docs
- [Memory System](docs/modules/memory.md)
- [Payment System](docs/modules/payment.md)
- [Identity & Passports](docs/modules/identity.md)
...

## API Reference
- [OpenAPI Spec](openapi.yaml): 171 endpoints
- [Memory Interfaces](docs/reference/memory.md)
...

## Key Interfaces
- IMemoryStore: Storage backend contract for 6 memory types
- IDeployer: Deployment target contract (6 providers)
- IRecallEngine: Two-stage semantic search
...

## Stack
- TypeScript 5.0, Node.js 20+, Express 4.18
- Solana (Anchor 0.31), EVM (ethers 6, viem 2)
- Supabase PostgreSQL, SQLite (per-agent), Redis
```

### 3C: Solana Program Documentation

**Extraction:** `anchor idl build` → IDL JSON (instructions, accounts, types, events).

```bash
pnpm docs:generate --artifact programs
```

**Output:** `docs/modules/programs/{program-name}.md`

**Same doc structure as TypeScript modules:**
- Purpose, Architecture, Data Flow, Patterns & Gotchas (AI from source + IDL)
- Instructions table (deterministic from IDL)
- Account structs (deterministic from IDL)
- Events (deterministic from IDL)

**6 programs:** thought-epoch, lucid-passports, gas-utils, lucid-agent-wallet, lucid-zkml-verifier, lucid-reputation.

### 3D: EVM Contract Documentation

**Extraction:** `solc --abi` or hardhat/foundry compile artifacts → ABI JSON.

```bash
pnpm docs:generate --artifact contracts
```

**Output:** `docs/modules/contracts/{contract-name}.md`

**Same doc structure:**
- Purpose, Architecture, Patterns & Gotchas (AI from source + ABI)
- Functions table (deterministic from ABI)
- Events table (deterministic from ABI)
- Errors (deterministic from ABI)
- Inheritance chain (deterministic from ABI)

**15 contracts** (10 concrete + 2 interfaces + 3 modules; test mocks excluded) across EVM targets.

---

## Error Handling

### Extraction Failures

| Failure | Local (`docs:generate`) | CI (`docs:check`) |
|---------|------------------------|-------------------|
| ts-morph can't parse a file | Skip file, warn with path + error | Fail that domain's check (only for allowlisted domains, not unrelated folders) |
| Barrel export resolves to missing file | Skip export, warn | Fail that domain's check (only for allowlisted domains) |
| Domain directory doesn't exist | Skip domain, warn | Warning only |
| Zero exported symbols | Write "No public API surface" stub | Warning only |
| `anchor idl build` fails | Skip program, warn | Fail that program's check |
| `solc` ABI output fails | Skip contract, warn | Fail that contract's check |

### AI Failures

| Failure | Handling |
|---------|----------|
| LLM API timeout / rate limit | Retry 2x with exponential backoff. After 3 failures, write deterministic-only doc (note "AI enrichment pending"). |
| LLM returns empty / too short (< 100 chars) | Retry once. If still bad, write deterministic-only doc. |
| Symbol guard flags unknown identifiers | Log warnings. Add `<!-- WARNING: unverified identifiers: X, Y -->` comment. Do not fail. |
| Token budget exceeded for a domain | Drop files from rule 4 (orchestrators), then rule 2 (cross-domain imports). Log dropped files. |

### CI Edge Cases

| Case | Handling |
|------|----------|
| New domain directory, no docs | Warning: "New domain `x/` detected, no docs yet." Initially non-blocking; promote to blocking after rollout. |
| Domain deleted, docs still exist | Warning: "Docs exist for removed domain `x/`." Do not auto-delete. |
| `cache/hashes.json` missing/corrupted | Treat as full regeneration needed. Rebuild hashes. |
| Shared code changes affect domain docs | Content hashing catches this (selected files include imports). CI always computes fresh hashes regardless of paths changed. |

---

## Cost Estimation (illustrative, model-configurable)

| Artifact | Input tokens (approx) | Output tokens (approx) | Frequency |
|----------|-----------------------|------------------------|-----------|
| 1 module doc (AI sections) | ~25K | ~1.5K | Per domain change |
| All 9 module docs | ~225K | ~13K | Full regeneration |
| Changelog (typical release) | ~3K | ~1K | Per release |
| Reference docs | 0 (deterministic) | 0 | Always free |
| llms.txt | 0 (deterministic) | 0 | Always free |
| 6 Solana programs | ~15K | ~5K | Per program change |
| 17 EVM contracts | ~35K | ~10K | Per contract change |

Incremental runs (1-2 changed domains) are negligible. Full pipeline runs are infrequent.

Model is configurable via environment variable. Default: whatever is wired through the existing `openai` SDK dep.

---

## CLI Reference (all phases)

```bash
# Phase 1
pnpm docs:generate                              # All 9 module docs
pnpm docs:generate --domain memory              # Single domain
pnpm docs:generate --force                      # Bypass cache
pnpm docs:generate --debug                      # Dump DomainSnapshot to stdout for inspection

# Phase 2
pnpm docs:generate --changed                    # Only stale domains
pnpm docs:generate --artifact modules            # Module overviews only
pnpm docs:generate --artifact reference          # Reference docs only (no AI)
pnpm docs:generate --artifact claude-md          # CLAUDE.md sync only
pnpm docs:generate --domain memory --artifact reference  # Combinable
pnpm docs:check                                  # CI freshness gate

# Phase 3
pnpm docs:generate --artifact changelog --from v1.2.0
pnpm docs:generate --artifact llms-txt
pnpm docs:generate --artifact programs           # Solana programs
pnpm docs:generate --artifact contracts          # EVM contracts
```

**Flag combinations:** `--domain` and `--artifact` can be combined (e.g., `--domain memory --artifact reference` generates only the reference doc for the memory domain). `--changed` applies to whichever artifact type is selected. `--debug` dumps the raw `DomainSnapshot` JSON to stdout without generating docs — useful for debugging extraction issues.

---

## Phase Summary

| | Phase 1 (1-2 days) | Phase 2 (2-3 days) | Phase 3 (2-3 days) |
|---|---|---|---|
| **Module overviews** | 9 docs: 4 AI sections + 2 deterministic sections | — | Solana programs + EVM contracts |
| **Reference docs** | — | Deterministic interface/function/type per domain | — |
| **CLAUDE.md** | — | Sentinel-based domain section sync | — |
| **Changelog** | — | — | Conventional commits → AI summary |
| **llms.txt** | — | — | Deterministic from existing artifacts |
| **CI** | — | `docs:check` (hard: symbol coverage; warn: narrative staleness) | Extend to programs/contracts |
| **CLI** | `--domain`, `--force` | `--artifact`, `--changed` | `--artifact changelog\|llms-txt\|programs\|contracts` |
| **Cache** | `contentHash` per domain | Add `apiHash` for reference | Extend to Anchor IDL / Solc ABI |

---

## Dependencies

### Phase 1
- `ts-morph` — TypeScript AST analysis (new dev dependency)
- `openai` — Already in deps at 5.10.1
- Template rendering uses TypeScript template literals (no Handlebars needed)

### Phase 2
- No new dependencies

### Phase 3
- `anchor` CLI — Already available in dev environment
- `solc` or hardhat/foundry — Already available for contract compilation
- No new npm dependencies

---

## Open Questions

1. **Model choice for AI enrichment:** Use existing `openai` dep or switch to Claude for better technical prose quality? Model is configurable either way.
2. **CLAUDE.md sentinel placement:** Should sentinels be added to all 9 domain sections now, or incrementally as docs are generated?
3. **CI strictness timeline:** When should `docs:check` promote from warning-only to blocking for new-domain detection?
