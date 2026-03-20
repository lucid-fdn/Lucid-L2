# Docs Pipeline Extension — Multi-Source Ingestion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `tools/docs/` to generate public doc pages from CLAUDE.md sections, READMEs, and .env files — reducing hand-written pages from ~40 to 7.

**Architecture:** Pluggable source adapters alongside existing ts-morph extractor. Each adapter outputs a `PageSource` → AI enrichment → Mintlify .mdx. Cache invalidation by source file hash.

**Tech Stack:** TypeScript, ts-morph (existing), TrustGate API (AI enrichment), Mintlify MDX

**Spec:** `docs/superpowers/specs/2026-03-20-docs-pipeline-extension-design.md`

---

### Task 1: Define PageSource + SourceAdapter interfaces

**Files:**
- Create: `tools/docs/src/adapters/types.ts`

- [ ] **Step 1: Write the interfaces**

```typescript
export interface PageSource {
  pagePath: string          // e.g. "deploy/from-telegram"
  title: string
  description: string
  rawContent: string        // extracted markdown
  sourceFile: string        // for cache invalidation
  sourceSection?: string    // heading within source file
  needsEnrichment: boolean  // false = use rawContent as-is
}

export interface SourceAdapter {
  name: string
  extract(): Promise<PageSource[]>
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add tools/docs/src/adapters/types.ts
git commit -m "docs(pipeline): add PageSource + SourceAdapter interfaces"
```

---

### Task 2: Build ClaudeMdAdapter

**Files:**
- Create: `tools/docs/src/adapters/claudeMdAdapter.ts`
- Create: `tools/docs/src/adapters/claudeMdMappings.ts`

- [ ] **Step 1: Write the mappings config**

File `claudeMdMappings.ts` — maps CLAUDE.md heading paths to target doc pages. Two source files:
- `/home/debian/Lucid/Lucid-L2/CLAUDE.md` (21 section→page mappings)
- `/home/debian/lucid-plateform-core/CLAUDE.md` (10 section→page mappings)

Each mapping: `{ heading: string, pagePath: string, title: string, description: string, extractSubsection?: string }`

Use the exact heading text from the spec's mapping table. The adapter must handle both `##` and `###` level headings.

- [ ] **Step 2: Write the adapter**

File `claudeMdAdapter.ts`:
1. Read CLAUDE.md file
2. Split by markdown headings using regex: `/^(#{2,4})\s+(.+)$/gm`
3. Build a heading tree (level → content map)
4. For each configured mapping, find the heading and extract content until next heading of same or higher level
5. If `extractSubsection` is set, find a sub-heading within the extracted content and narrow further
6. Return array of `PageSource` objects with `needsEnrichment: true`

Handle edge cases:
- Heading not found → warn and skip (don't fail)
- Multiple matches → use first
- Content between heading and next heading may contain sub-headings → include them
- The CLAUDE.md path for platform-core can be overridden via `PLATFORM_CORE_CLAUDE_MD` env var (for CI cross-repo)

- [ ] **Step 3: Write tests**

Test file: `tools/docs/src/adapters/__tests__/claudeMdAdapter.test.ts`
- Test heading extraction from a sample markdown string
- Test subsection extraction
- Test missing heading produces warning, not error
- Test env var override for platform-core path

- [ ] **Step 4: Run tests**

```bash
cd /home/debian/Lucid/Lucid-L2/tools/docs
npx jest src/adapters/__tests__/claudeMdAdapter.test.ts --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add tools/docs/src/adapters/
git commit -m "docs(pipeline): add ClaudeMdAdapter — parse CLAUDE.md sections into pages"
```

---

### Task 3: Build ReadmeAdapter

**Files:**
- Create: `tools/docs/src/adapters/readmeAdapter.ts`

- [ ] **Step 1: Write the adapter**

Configuration embedded in file — maps README paths to pages:
- `offchain/packages/agent-runtime/README.md` → `how/execution-runtime`
- `offchain/README.md` (section "## Quick Start") → `advanced/self-hosting`
- `CONTRIBUTING.md` → `advanced/contributing` (needsEnrichment: false)
- Platform-core `packages/pay/README.md` → supplements `concepts/payments`

Logic:
1. Read README file
2. If `extractSection` specified, extract that section only
3. Return PageSource with content

- [ ] **Step 2: Write tests**

- Test full README extraction
- Test section extraction
- Test missing file → warning, not error

- [ ] **Step 3: Commit**

```bash
git add tools/docs/src/adapters/readmeAdapter.ts
git commit -m "docs(pipeline): add ReadmeAdapter — parse READMEs into pages"
```

---

### Task 4: Build EnvAdapter

**Files:**
- Create: `tools/docs/src/adapters/envAdapter.ts`

- [ ] **Step 1: Write the adapter**

Parses `offchain/.env.example`:
1. Read file line by line
2. Comments (`#`) above a `KEY=value` line become the description
3. Group by comment blocks (blank line = new group)
4. Output as markdown table: | Variable | Required | Default | Description |
5. Return as PageSource for `advanced/configuration`

- [ ] **Step 2: Commit**

```bash
git add tools/docs/src/adapters/envAdapter.ts
git commit -m "docs(pipeline): add EnvAdapter — parse .env.example into config page"
```

---

### Task 5: Build adapter registry

**Files:**
- Create: `tools/docs/src/adapters/registry.ts`
- Create: `tools/docs/src/adapters/index.ts`

- [ ] **Step 1: Write the registry**

```typescript
import { ClaudeMdAdapter } from './claudeMdAdapter'
import { ReadmeAdapter } from './readmeAdapter'
import { EnvAdapter } from './envAdapter'
import type { SourceAdapter, PageSource } from './types'

const adapters: SourceAdapter[] = [
  new ClaudeMdAdapter(),
  new ReadmeAdapter(),
  new EnvAdapter(),
]

export async function extractAllPages(adapterFilter?: string): Promise<PageSource[]> {
  const sources = adapterFilter
    ? adapters.filter(a => a.name === adapterFilter)
    : adapters
  const results: PageSource[] = []
  for (const adapter of sources) {
    const pages = await adapter.extract()
    results.push(...pages)
  }
  return results
}

export function getAdapter(name: string): SourceAdapter | undefined {
  return adapters.find(a => a.name === name)
}
```

- [ ] **Step 2: Barrel export**

```typescript
// index.ts
export { extractAllPages, getAdapter } from './registry'
export type { PageSource, SourceAdapter } from './types'
```

- [ ] **Step 3: Commit**

```bash
git add tools/docs/src/adapters/
git commit -m "docs(pipeline): add adapter registry"
```

---

### Task 6: Build page renderer

**Files:**
- Create: `tools/docs/src/render/pageRenderer.ts`

- [ ] **Step 1: Write the renderer**

Takes a `PageSource` and outputs Mintlify `.mdx`:

```typescript
export function renderPage(source: PageSource, enrichedContent?: string): string {
  const content = enrichedContent || source.rawContent
  return [
    '---',
    `title: "${source.title}"`,
    `description: "${source.description}"`,
    '---',
    '',
    content,
  ].join('\n')
}
```

For pages with `needsEnrichment: true`, call AI enrichment first (next task), then pass result here.

- [ ] **Step 2: Commit**

```bash
git add tools/docs/src/render/pageRenderer.ts
git commit -m "docs(pipeline): add page renderer — PageSource → .mdx"
```

---

### Task 7: Add AI enrichment for page sources

**Files:**
- Create: `tools/docs/src/render/pageEnricher.ts`

- [ ] **Step 1: Write the enricher**

Uses existing TrustGate AI call pattern from `tools/docs/src/render/moduleRenderer.ts`:

```typescript
export async function enrichPage(source: PageSource): Promise<string> {
  if (!source.needsEnrichment) return source.rawContent

  const prompt = `You are converting internal developer documentation into a public-facing doc page for docs.lucid.foundation (Mintlify).

Source content (from ${source.sourceFile}):
---
${source.rawContent}
---

Target page: "${source.title}"
Description: "${source.description}"
Target audience: developers building on Lucid

Rules:
- Rewrite for a developer who has never seen Lucid before
- Remove internal file paths and implementation details
- Keep code examples, CLI commands, and API examples
- Keep tables — they're useful
- Add context where the source assumes knowledge
- Use Mintlify MDX components where helpful: Steps, CodeGroup, Tip, Warning, Card, CardGroup
- Do NOT add import statements for Mintlify components (Mintlify handles this)
- Tone: clear, direct, practical
- Do NOT include frontmatter (the renderer adds it)
- Output ONLY the page body content as MDX`

  // Call TrustGate (same pattern as moduleRenderer.ts)
  const response = await callTrustGate(prompt)
  return response
}
```

Reuse the existing `callTrustGate()` helper from the module renderer (or extract it as a shared utility if it's not already shared).

- [ ] **Step 2: Commit**

```bash
git add tools/docs/src/render/pageEnricher.ts
git commit -m "docs(pipeline): add AI page enricher — rewrite internal docs for public audience"
```

---

### Task 8: Wire into generate.ts

**Files:**
- Modify: `tools/docs/src/generate.ts`

- [ ] **Step 1: Add --artifact pages and --adapter flag**

Add to the CLI argument parsing:
- `--artifact pages` — generate public doc pages from all adapters
- `--adapter <name>` — filter to specific adapter (claude-md, readme, env)
- `--page <path>` — generate a single page (e.g. `deploy/from-telegram`)

- [ ] **Step 2: Add the pages generation logic**

```typescript
if (artifactType === 'pages' || !artifactType) {
  const { extractAllPages } = await import('./adapters')
  const { enrichPage } = await import('./render/pageEnricher')
  const { renderPage } = await import('./render/pageRenderer')

  const pages = await extractAllPages(adapterFilter)

  for (const page of pages) {
    // Cache check: skip if source file hash unchanged
    if (isCached(page.sourceFile, page.pagePath)) continue

    // AI enrichment
    const enriched = await enrichPage(page)

    // Render to .mdx
    const mdx = renderPage(page, enriched)

    // Write to output directory (lucid-docs path or local output/)
    const outputPath = path.join(outputDir, `${page.pagePath}.mdx`)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, mdx)
    console.log(`  Written: ${outputPath}`)

    // Update cache
    updateCache(page.sourceFile, page.pagePath)
  }
}
```

- [ ] **Step 3: Add output directory config**

Default output: `tools/docs/output/` (local). Override via `--output /path/to/lucid-docs`.

- [ ] **Step 4: Commit**

```bash
git add tools/docs/src/generate.ts
git commit -m "docs(pipeline): wire --artifact pages into generate.ts"
```

---

### Task 9: Test end-to-end — generate all pages

**Files:**
- None (testing only)

- [ ] **Step 1: Run the full generation**

```bash
cd /home/debian/Lucid/Lucid-L2/tools/docs
TRUSTGATE_API_KEY=lk_... TRUSTGATE_URL=https://trustgate-api-production.up.railway.app \
  npx tsx src/generate.ts --artifact pages --output /home/debian/Lucid/lucid-docs
```

- [ ] **Step 2: Verify output**

Check that generated .mdx files:
- Have correct frontmatter (title, description)
- Have readable content (not raw CLAUDE.md format)
- Don't contain internal file paths
- Replace all 35 stub "Coming soon" pages

```bash
cd /home/debian/Lucid/lucid-docs
grep -rl "Coming soon" . --include='*.mdx' | wc -l
# Should be 0 or near 0
```

- [ ] **Step 3: Commit generated pages to lucid-docs**

```bash
cd /home/debian/Lucid/lucid-docs
git add -A
git commit -m "docs: auto-generate ~35 pages from CLAUDE.md + READMEs"
git push origin main
```

---

### Task 10: Add GitHub Actions for auto-sync

**Files:**
- Create: `/home/debian/Lucid/Lucid-L2/.github/workflows/sync-docs.yml`

- [ ] **Step 1: Write the Lucid-L2 sync action**

Triggers on push to master when CLAUDE.md, engine source, programs, contracts, .env.example, or READMEs change. Runs the pipeline, pushes to lucid-docs.

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
      - 'tools/docs/**'

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: tools/docs/package-lock.json

      - name: Install docs pipeline
        working-directory: tools/docs
        run: npm ci

      - name: Generate pages
        working-directory: tools/docs
        run: npx tsx src/generate.ts --artifact pages --artifact reference --output /tmp/docs-output
        env:
          TRUSTGATE_API_KEY: ${{ secrets.TRUSTGATE_API_KEY }}
          TRUSTGATE_URL: https://trustgate-api-production.up.railway.app

      - name: Push to lucid-docs
        run: |
          git clone https://x-access-token:${{ secrets.DOCS_DEPLOY_TOKEN }}@github.com/lucid-fdn/lucid-docs.git /tmp/lucid-docs
          rsync -av --include='*.mdx' /tmp/docs-output/ /tmp/lucid-docs/
          cd /tmp/lucid-docs
          git config user.name "Lucid Docs Bot"
          git config user.email "docs@lucid.foundation"
          git add -A
          git diff --cached --quiet || (git commit -m "docs: auto-sync from Lucid-L2 $(date +%Y-%m-%d)" && git push)
```

- [ ] **Step 2: Add secrets**

Add to GitHub repo settings (lucid-fdn/Lucid-L2):
- `TRUSTGATE_API_KEY` — for AI enrichment
- `DOCS_DEPLOY_TOKEN` — GitHub PAT with write access to lucid-fdn/lucid-docs

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/sync-docs.yml
git commit -m "ci: add auto-sync docs workflow — generates + pushes to lucid-docs"
git push origin master
```

---

### Task 11: Run existing tests to verify nothing broke

**Files:**
- None (testing only)

- [ ] **Step 1: Run docs pipeline tests**

```bash
cd /home/debian/Lucid/Lucid-L2/tools/docs
npx jest --no-coverage --ci --forceExit
```

Expected: 361+ tests pass (existing + new adapter tests).

- [ ] **Step 2: Run docs check**

```bash
npx tsx src/check.ts
```

Expected: All 7 domains [OK].

- [ ] **Step 3: Commit any fixes**

---

## Outcome

After implementation:
- `npx tsx src/generate.ts --artifact pages` generates ~48 pages from 3 source types
- Only 7 pages remain hand-written
- GitHub Action auto-syncs on every push that touches source files
- All generated pages have proper Mintlify formatting and public-audience tone
- Cache prevents unnecessary AI calls when source hasn't changed
