# AI Documentation Pipeline — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the docs pipeline production-grade: deterministic reference docs, CI freshness gate, CLAUDE.md auto-sync, and incremental `--changed` / `--artifact` flags.

**Architecture:** Adds a reference renderer that produces full interface/function/type docs from DomainSnapshot (zero AI). Adds a `docs:check` script that compares current apiHash against cached hashes to detect drift. Adds sentinel-based CLAUDE.md section sync. Modifies `generate.ts` to support `--changed` (skip unchanged domains) and `--artifact` (generate only a specific artifact type).

**Tech Stack:** TypeScript, ts-morph (existing), Jest (existing)

**Spec:** `docs/superpowers/specs/2026-03-18-ai-documentation-pipeline-design.md` (Phase 2 section)

**Depends on:** Phase 1 complete (tools/docs/ with extractor, renderers, enricher, assembler, cache)

---

## File Map

### New files

```
tools/docs/
  src/
    render/
      reference.ts               # Deterministic interface/function/type reference renderer
      claudeMd.ts                # CLAUDE.md sentinel-based section sync
    check.ts                     # CI entrypoint: pnpm docs:check
  __tests__/
    render/
      reference.test.ts
      claudeMd.test.ts
    check.test.ts

docs/
  reference/                     # Generated reference docs (9 domains)
    memory.md
    payment.md
    identity.md
    ...
```

### Modified files

```
tools/docs/
  src/
    generate.ts                  # Add --changed, --artifact flags + reference/claude-md generation
    config.ts                    # Add DOCS_REFERENCE_DIR, CLAUDE_MD_PATH constants
  package.json                   # Add "check" script
```

---

## Task 1: Config Constants

**Files:**
- Modify: `tools/docs/src/config.ts`

- [ ] **Step 1: Add reference and CLAUDE.md path constants**

Add to `config.ts`:
```typescript
export const DOCS_REFERENCE_DIR = path.join(REPO_ROOT, 'docs', 'reference');
export const CLAUDE_MD_PATH = path.join(REPO_ROOT, 'CLAUDE.md');
```

- [ ] **Step 2: Add check script to package.json**

Add to `tools/docs/package.json` scripts:
```json
"check": "tsx src/check.ts"
```

- [ ] **Step 3: Verify compilation**

Run: `cd /c/Lucid-L2/tools/docs && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add tools/docs/src/config.ts tools/docs/package.json
git commit -m "feat(docs): add reference dir and CLAUDE.md path constants"
```

---

## Task 2: Reference Renderer

**Files:**
- Create: `tools/docs/src/render/reference.ts`
- Create: `tools/docs/__tests__/render/reference.test.ts`

This is the biggest task — renders a full interface/function/type/enum reference doc from DomainSnapshot. Pure deterministic, zero AI.

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/render/reference.test.ts
import { renderReference } from '../../src/render/reference';
import { DomainSnapshot } from '../../src/extract/types';

const snapshot: DomainSnapshot = {
  domain: 'memory',
  sourcePath: '/fake/memory',
  interfaces: [
    {
      name: 'IMemoryStore',
      filePath: 'store/interface.ts',
      jsDoc: 'Storage backend contract.\nHandles all memory CRUD.',
      properties: [
        { name: 'capabilities', type: 'StoreCapabilities', jsDoc: 'Supported features', optional: false },
      ],
      methods: [
        {
          name: 'write',
          params: [
            { name: 'entry', type: 'MemoryEntry', optional: false, defaultValue: null },
            { name: 'opts', type: 'WriteOptions', optional: true, defaultValue: null },
          ],
          returnType: 'Promise<WriteResult>',
          jsDoc: 'Persist a memory entry',
        },
        {
          name: 'read',
          params: [{ name: 'id', type: 'string', optional: false, defaultValue: null }],
          returnType: 'Promise<MemoryEntry | null>',
          jsDoc: null,
        },
      ],
      extends: ['Disposable'],
    },
  ],
  functions: [
    {
      name: 'getMemoryStore',
      filePath: 'store/index.ts',
      jsDoc: 'Factory for the configured memory store.',
      params: [],
      returnType: 'IMemoryStore',
      isAsync: false,
    },
    {
      name: 'createEntry',
      filePath: 'service.ts',
      jsDoc: null,
      params: [
        { name: 'store', type: 'IMemoryStore', optional: false, defaultValue: null },
        { name: 'data', type: 'unknown', optional: false, defaultValue: null },
        { name: 'opts', type: 'EntryOptions', optional: true, defaultValue: "'default'" },
      ],
      returnType: 'Promise<MemoryEntry>',
      isAsync: true,
    },
  ],
  types: [
    { name: 'MemoryLane', filePath: 'types.ts', jsDoc: 'Semantic memory partition', kind: 'alias', definition: "'self' | 'user' | 'shared' | 'market'" },
  ],
  imports: [],
  apiHash: '',
  contentHash: '',
};

describe('renderReference', () => {
  const md = renderReference('memory', snapshot, 'abc123');

  it('includes generation comment', () => {
    expect(md).toContain('<!-- generated: commit abc123');
  });

  it('has domain title', () => {
    expect(md).toContain('# Memory — Interface Reference');
  });

  // --- Interfaces ---
  it('renders interface heading with file path', () => {
    expect(md).toContain('### IMemoryStore');
    expect(md).toContain('> `store/interface.ts`');
  });

  it('renders interface JSDoc description', () => {
    expect(md).toContain('Storage backend contract.');
  });

  it('renders properties table sorted alphabetically', () => {
    expect(md).toContain('| `capabilities` |');
    expect(md).toContain('StoreCapabilities');
  });

  it('renders methods table sorted alphabetically', () => {
    expect(md).toContain('| `read` |');
    expect(md).toContain('| `write` |');
    // read before write (alphabetical)
    expect(md.indexOf('`read`')).toBeLessThan(md.indexOf('`write`'));
  });

  it('renders method params', () => {
    expect(md).toContain('`entry`');
    expect(md).toContain('MemoryEntry');
  });

  it('renders optional params', () => {
    expect(md).toContain('`opts`');
    // opts is optional
    expect(md).toMatch(/opts.*yes/i);
  });

  it('renders extends', () => {
    expect(md).toContain('**Extends:** `Disposable`');
  });

  it('shows dash for no extends', () => {
    const snap2 = { ...snapshot, interfaces: [{ ...snapshot.interfaces[0], extends: [] }] };
    const md2 = renderReference('test', snap2, 'x');
    expect(md2).toContain('**Extends:** —');
  });

  // --- Functions ---
  it('renders function heading with file path', () => {
    expect(md).toContain('### getMemoryStore');
    expect(md).toContain('> `store/index.ts`');
  });

  it('renders function JSDoc', () => {
    expect(md).toContain('Factory for the configured memory store.');
  });

  it('renders function params table', () => {
    expect(md).toContain('| `store` |');
    expect(md).toContain('IMemoryStore');
  });

  it('renders default values', () => {
    expect(md).toContain("'default'");
  });

  it('renders return type and async flag', () => {
    expect(md).toContain('**Returns:** `Promise<MemoryEntry>`');
    expect(md).toContain('**Async:** yes');
  });

  it('renders non-async functions', () => {
    expect(md).toContain('**Async:** no');
  });

  // --- Types ---
  it('renders type aliases', () => {
    expect(md).toContain('### MemoryLane');
    expect(md).toContain("'self' | 'user' | 'shared' | 'market'");
  });

  it('renders type JSDoc', () => {
    expect(md).toContain('Semantic memory partition');
  });

  // --- Structure ---
  it('has section headings in correct order', () => {
    const iIdx = md.indexOf('## Interfaces');
    const fIdx = md.indexOf('## Functions');
    const tIdx = md.indexOf('## Types');
    expect(iIdx).toBeLessThan(fIdx);
    expect(fIdx).toBeLessThan(tIdx);
  });

  it('omits empty sections', () => {
    const emptySnap: DomainSnapshot = {
      ...snapshot, interfaces: [], functions: [], types: [],
    };
    const md2 = renderReference('empty', emptySnap, 'x');
    expect(md2).not.toContain('## Interfaces');
    expect(md2).not.toContain('## Functions');
    expect(md2).not.toContain('## Types');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/render/reference.test.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement reference.ts**

Read the existing `tools/docs/src/extract/types.ts` for exact type shapes before implementing.

```typescript
// tools/docs/src/render/reference.ts
import { DomainSnapshot, InterfaceInfo, FunctionInfo, TypeInfo } from '../extract/types';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function jsDocDescription(jsDoc: string | null): string {
  return jsDoc?.split('\n')[0]?.trim() || '—';
}

function renderInterfaceSection(iface: InterfaceInfo): string {
  const lines: string[] = [];
  lines.push(`### ${iface.name}`);
  lines.push(`> \`${iface.filePath}\``);
  lines.push('');
  if (iface.jsDoc) lines.push(iface.jsDoc.split('\n')[0].trim());
  lines.push('');

  // Properties
  const props = [...iface.properties].sort((a, b) => a.name.localeCompare(b.name));
  if (props.length > 0) {
    lines.push('**Properties:**');
    lines.push('');
    lines.push('| Property | Type | Optional | Description |');
    lines.push('|----------|------|----------|-------------|');
    for (const p of props) {
      lines.push(`| \`${p.name}\` | \`${p.type}\` | ${p.optional ? 'yes' : 'no'} | ${jsDocDescription(p.jsDoc)} |`);
    }
    lines.push('');
  }

  // Methods
  const methods = [...iface.methods].sort((a, b) => a.name.localeCompare(b.name));
  if (methods.length > 0) {
    lines.push('**Methods:**');
    lines.push('');
    lines.push('| Method | Params | Return Type | Description |');
    lines.push('|--------|--------|-------------|-------------|');
    for (const m of methods) {
      const params = m.params
        .map(p => `\`${p.name}\`${p.optional ? '?' : ''}: \`${p.type}\``)
        .join(', ');
      lines.push(`| \`${m.name}\` | ${params || '—'} | \`${m.returnType}\` | ${jsDocDescription(m.jsDoc)} |`);
    }
    lines.push('');
  }

  // Extends
  const ext = iface.extends.length > 0
    ? iface.extends.map(e => `\`${e}\``).join(', ')
    : '—';
  lines.push(`**Extends:** ${ext}`);

  // "Implemented by" — resolved from snapshot classes (best-effort, per spec)
  // NOTE: The extractor does not currently capture class declarations.
  // This field will be populated when class extraction is added.
  // For now, omit the row rather than showing empty.
  lines.push('');
  lines.push('---');
  return lines.join('\n');
}

function renderFunctionSection(func: FunctionInfo): string {
  const lines: string[] = [];
  lines.push(`### ${func.name}`);
  lines.push(`> \`${func.filePath}\``);
  lines.push('');
  if (func.jsDoc) lines.push(func.jsDoc.split('\n')[0].trim());
  lines.push('');

  if (func.params.length > 0) {
    lines.push('| Param | Type | Optional | Default |');
    lines.push('|-------|------|----------|---------|');
    for (const p of func.params) {
      lines.push(`| \`${p.name}\` | \`${p.type}\` | ${p.optional ? 'yes' : 'no'} | ${p.defaultValue ?? '—'} |`);
    }
    lines.push('');
  }

  lines.push(`**Returns:** \`${func.returnType}\``);
  lines.push(`**Async:** ${func.isAsync ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('---');
  return lines.join('\n');
}

function renderTypeAliasSection(type: TypeInfo): string {
  const lines: string[] = [];
  lines.push(`### ${type.name}`);
  lines.push(`> \`${type.filePath}\``);
  lines.push('');
  if (type.jsDoc) lines.push(type.jsDoc.split('\n')[0].trim());
  lines.push('');
  lines.push('```typescript');
  lines.push(`type ${type.name} = ${type.definition}`);
  lines.push('```');
  lines.push('');
  lines.push('---');
  return lines.join('\n');
}

function renderEnumSection(type: TypeInfo): string {
  const lines: string[] = [];
  lines.push(`### ${type.name}`);
  lines.push(`> \`${type.filePath}\``);
  lines.push('');
  if (type.jsDoc) lines.push(type.jsDoc.split('\n')[0].trim());
  lines.push('');
  lines.push('| Value | Description |');
  lines.push('|-------|-------------|');
  for (const member of type.definition.split(', ')) {
    lines.push(`| \`${member.trim()}\` | — |`);
  }
  lines.push('');
  lines.push('---');
  return lines.join('\n');
}

export function renderReference(
  domain: string,
  snapshot: DomainSnapshot,
  commitSha: string,
): string {
  const timestamp = new Date().toISOString();
  const lines: string[] = [];

  lines.push(`<!-- generated: commit ${commitSha}, ${timestamp} -->`);
  lines.push(`# ${capitalize(domain)} — Interface Reference`);
  lines.push('');

  // Interfaces
  const ifaces = [...snapshot.interfaces].sort((a, b) => a.name.localeCompare(b.name));
  if (ifaces.length > 0) {
    lines.push('## Interfaces');
    lines.push('');
    for (const iface of ifaces) {
      lines.push(renderInterfaceSection(iface));
      lines.push('');
    }
  }

  // Functions
  const funcs = [...snapshot.functions].sort((a, b) => a.name.localeCompare(b.name));
  if (funcs.length > 0) {
    lines.push('## Functions');
    lines.push('');
    for (const func of funcs) {
      lines.push(renderFunctionSection(func));
      lines.push('');
    }
  }

  // Type aliases
  const aliases = [...snapshot.types].filter(t => t.kind === 'alias').sort((a, b) => a.name.localeCompare(b.name));
  if (aliases.length > 0) {
    lines.push('## Types');
    lines.push('');
    for (const type of aliases) {
      lines.push(renderTypeAliasSection(type));
      lines.push('');
    }
  }

  // Enums (value tables per spec)
  const enums = [...snapshot.types].filter(t => t.kind === 'enum').sort((a, b) => a.name.localeCompare(b.name));
  if (enums.length > 0) {
    lines.push('## Enums');
    lines.push('');
    for (const en of enums) {
      lines.push(renderEnumSection(en));
      lines.push('');
    }
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/render/reference.test.ts -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tools/docs/src/render/reference.ts tools/docs/__tests__/render/reference.test.ts
git commit -m "feat(docs): deterministic interface/function/type reference renderer"
```

---

## Task 3: CLAUDE.md Sentinel Sync

**Files:**
- Create: `tools/docs/src/render/claudeMd.ts`
- Create: `tools/docs/__tests__/render/claudeMd.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/render/claudeMd.test.ts
import { updateClaudeMdSections, generateDomainSummary } from '../../src/render/claudeMd';

describe('generateDomainSummary', () => {
  it('generates condensed summary from module doc', () => {
    const moduleDoc = `# Memory

## Purpose
Memory system for agents.

## Architecture
Three layers: store, manager, recall.

## Key Interfaces

| Interface | File | Role |
|---|---|---|
| \`IMemoryStore\` | \`store.ts\` | Storage contract |

## Cross-Domain Dependencies

| Direction | Domain | Symbols | Purpose |
|---|---|---|---|
| imports | shared | \`sha256\` | — |
`;
    const summary = generateDomainSummary(moduleDoc);
    expect(summary).toContain('Memory system');
    expect(summary).toContain('IMemoryStore');
    expect(summary.length).toBeLessThan(2000); // condensed
  });
});

describe('updateClaudeMdSections', () => {
  it('replaces content between sentinels', () => {
    const original = `# Lucid

## Memory
<!-- docs:auto:start domain=memory -->
Old content here.
<!-- docs:auto:end domain=memory -->

## Other Section
Untouched.`;

    const result = updateClaudeMdSections(original, { memory: 'New memory summary.' });
    expect(result).toContain('New memory summary.');
    expect(result).not.toContain('Old content here.');
    expect(result).toContain('Untouched.');
  });

  it('preserves content outside sentinels', () => {
    const original = `Before sentinel
<!-- docs:auto:start domain=payment -->
Old payment.
<!-- docs:auto:end domain=payment -->
After sentinel`;

    const result = updateClaudeMdSections(original, { payment: 'New payment.' });
    expect(result).toContain('Before sentinel');
    expect(result).toContain('After sentinel');
    expect(result).toContain('New payment.');
  });

  it('handles multiple domain sentinels', () => {
    const original = `<!-- docs:auto:start domain=memory -->
Old memory.
<!-- docs:auto:end domain=memory -->
Middle text.
<!-- docs:auto:start domain=payment -->
Old payment.
<!-- docs:auto:end domain=payment -->`;

    const result = updateClaudeMdSections(original, {
      memory: 'New memory.',
      payment: 'New payment.',
    });
    expect(result).toContain('New memory.');
    expect(result).toContain('New payment.');
    expect(result).toContain('Middle text.');
  });

  it('skips domains with no sentinel in CLAUDE.md', () => {
    const original = `No sentinels here.`;
    const result = updateClaudeMdSections(original, { memory: 'New memory.' });
    expect(result).toBe(original); // unchanged
  });

  it('preserves sentinel markers themselves', () => {
    const original = `<!-- docs:auto:start domain=memory -->
Old.
<!-- docs:auto:end domain=memory -->`;
    const result = updateClaudeMdSections(original, { memory: 'New.' });
    expect(result).toContain('<!-- docs:auto:start domain=memory -->');
    expect(result).toContain('<!-- docs:auto:end domain=memory -->');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/render/claudeMd.test.ts -v`

- [ ] **Step 3: Implement claudeMd.ts**

```typescript
// tools/docs/src/render/claudeMd.ts

/**
 * Generate a condensed domain summary from a module overview doc.
 * Extracts Purpose + Architecture sections, plus interface names from Key Interfaces.
 */
export function generateDomainSummary(moduleDoc: string): string {
  const lines: string[] = [];

  // Extract Purpose
  const purposeMatch = moduleDoc.match(/## Purpose\n([\s\S]*?)(?=\n## |$)/);
  if (purposeMatch) lines.push(purposeMatch[1].trim());

  // Extract Architecture (first paragraph only)
  const archMatch = moduleDoc.match(/## Architecture\n([\s\S]*?)(?=\n## |$)/);
  if (archMatch) {
    const firstPara = archMatch[1].trim().split('\n\n')[0];
    lines.push(firstPara);
  }

  // Extract interface names from Key Interfaces table
  const ifaceNames: string[] = [];
  const ifaceRegex = /\| `([^`]+)` \|/g;
  const keyIfacesMatch = moduleDoc.match(/## Key Interfaces\n([\s\S]*?)(?=\n## )/);
  if (keyIfacesMatch) {
    let m: RegExpExecArray | null;
    while ((m = ifaceRegex.exec(keyIfacesMatch[1])) !== null) {
      ifaceNames.push(m[1]);
    }
  }
  if (ifaceNames.length > 0) {
    lines.push(`Key interfaces: ${ifaceNames.map(n => `\`${n}\``).join(', ')}.`);
  }

  // Extract cross-domain deps summary
  const depsMatch = moduleDoc.match(/## Cross-Domain Dependencies\n([\s\S]*?)(?=\n## |$)/);
  if (depsMatch && !depsMatch[1].includes('No cross-domain')) {
    const domains: string[] = [];
    const domainRegex = /\| (?:imports|exports to) \| (\S+)/g;
    let dm: RegExpExecArray | null;
    while ((dm = domainRegex.exec(depsMatch[1])) !== null) {
      if (!domains.includes(dm[1])) domains.push(dm[1]);
    }
    if (domains.length > 0) {
      lines.push(`Cross-domain: ${domains.join(', ')}.`);
    }
  }

  return lines.join('\n');
}

/**
 * Replace content between sentinel markers in CLAUDE.md.
 * Only touches content between `<!-- docs:auto:start domain=X -->` and
 * `<!-- docs:auto:end domain=X -->`. Everything else is preserved.
 */
export function updateClaudeMdSections(
  claudeMd: string,
  summaries: Record<string, string>,
): string {
  let result = claudeMd;
  for (const [domain, summary] of Object.entries(summaries)) {
    const startMarker = `<!-- docs:auto:start domain=${domain} -->`;
    const endMarker = `<!-- docs:auto:end domain=${domain} -->`;
    const regex = new RegExp(
      `(${escapeRegex(startMarker)})\n[\\s\\S]*?\n(${escapeRegex(endMarker)})`,
    );
    if (regex.test(result)) {
      result = result.replace(regex, `$1\n${summary}\n$2`);
    }
  }
  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/render/claudeMd.test.ts -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tools/docs/src/render/claudeMd.ts tools/docs/__tests__/render/claudeMd.test.ts
git commit -m "feat(docs): CLAUDE.md sentinel-based section sync"
```

---

## Task 4: CI Check Script

**Files:**
- Create: `tools/docs/src/check.ts`
- Create: `tools/docs/__tests__/check.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/check.test.ts
import { checkDomain, CheckResult } from '../src/check';
import type { DomainSnapshot, CacheData } from '../src/extract/types';

describe('checkDomain', () => {
  const baseSnapshot: DomainSnapshot = {
    domain: 'test',
    sourcePath: '/fake',
    interfaces: [
      { name: 'IFoo', filePath: 'foo.ts', jsDoc: null, properties: [], methods: [], extends: [] },
    ],
    functions: [
      { name: 'getFoo', filePath: 'index.ts', jsDoc: null, params: [], returnType: 'IFoo', isAsync: false },
    ],
    types: [],
    imports: [],
    apiHash: 'hash_a',
    contentHash: 'hash_c',
  };

  const referenceDoc = `# Test — Interface Reference

## Interfaces

### IFoo
> \`foo.ts\`

## Functions

### getFoo
> \`index.ts\`
`;

  it('passes when reference doc matches snapshot', () => {
    const cache: CacheData = { test: { apiHash: 'hash_a', contentHash: 'hash_c' } };
    const result = checkDomain('test', baseSnapshot, referenceDoc, cache);
    expect(result.errors).toHaveLength(0);
  });

  it('errors when apiHash differs from cache', () => {
    const cache: CacheData = { test: { apiHash: 'old_hash', contentHash: 'hash_c' } };
    const result = checkDomain('test', baseSnapshot, referenceDoc, cache);
    expect(result.errors.some(e => e.includes('apiHash'))).toBe(true);
  });

  it('errors when exported symbol missing from reference doc', () => {
    const snapWithExtra = {
      ...baseSnapshot,
      interfaces: [
        ...baseSnapshot.interfaces,
        { name: 'IBar', filePath: 'bar.ts', jsDoc: null, properties: [], methods: [], extends: [] },
      ],
    };
    const result = checkDomain('test', snapWithExtra, referenceDoc, {});
    expect(result.errors.some(e => e.includes('IBar'))).toBe(true);
  });

  it('errors when reference doc mentions removed symbol', () => {
    const snapWithout = { ...baseSnapshot, interfaces: [] };
    const result = checkDomain('test', snapWithout, referenceDoc, {});
    expect(result.errors.some(e => e.includes('IFoo'))).toBe(true);
  });

  it('warns when contentHash differs', () => {
    const cache: CacheData = { test: { apiHash: 'hash_a', contentHash: 'old_content' } };
    const result = checkDomain('test', baseSnapshot, referenceDoc, cache);
    expect(result.warnings.some(w => w.includes('contentHash'))).toBe(true);
  });

  it('warns when no cache entry exists for domain', () => {
    const result = checkDomain('test', baseSnapshot, referenceDoc, {});
    // no apiHash error because there's nothing to compare against
    expect(result.errors.filter(e => e.includes('apiHash'))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/check.test.ts -v`

- [ ] **Step 3: Implement check.ts**

Export the `checkDomain` function (used by tests) and the CLI entrypoint.

```typescript
// tools/docs/src/check.ts
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import {
  DOMAIN_ALLOWLIST,
  DOCS_REFERENCE_DIR,
  CACHE_FILE,
  getDomainPath,
} from './config';
import type { DomainName } from './config';
import { extractDomainSnapshot } from './extract/extractor';
import { selectFiles } from './extract/fileSelector';
import { computeApiHash, computeContentHash } from './extract/hasher';
import { readCache } from './cache/cacheManager';
import type { DomainSnapshot, CacheData } from './extract/types';

export interface CheckResult {
  domain: string;
  errors: string[];   // hard failures
  warnings: string[]; // non-blocking
}

/**
 * Check a single domain's docs for freshness.
 * Exported for unit testing.
 */
export function checkDomain(
  domain: string,
  snapshot: DomainSnapshot,
  referenceDoc: string,
  cache: CacheData,
): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. apiHash mismatch (reference docs stale)
  const cached = cache[domain];
  if (cached && cached.apiHash !== snapshot.apiHash) {
    errors.push(`apiHash mismatch for ${domain}: cached=${cached.apiHash.slice(0, 8)}… current=${snapshot.apiHash.slice(0, 8)}… — reference docs are stale`);
  }

  // 2. contentHash mismatch (module overview may be stale)
  if (cached && cached.contentHash !== snapshot.contentHash) {
    warnings.push(`contentHash changed for ${domain} — module overview may be stale`);
  }

  // 3 + 4. Compare exported symbols against reference doc headings (### Name)
  // Use heading-based matching to avoid substring false positives
  const allSymbols = new Set([
    ...snapshot.interfaces.map(i => i.name),
    ...snapshot.functions.map(f => f.name),
    ...snapshot.types.map(t => t.name),
  ]);

  const docSymbols = new Set<string>();
  const headingRegex = /^### (\w+)/gm;
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(referenceDoc)) !== null) {
    docSymbols.add(match[1]);
  }

  // Exported symbols missing from reference doc
  for (const sym of allSymbols) {
    if (!docSymbols.has(sym)) {
      errors.push(`${domain}: exported symbol \`${sym}\` not found in reference doc`);
    }
  }

  // Reference doc mentions symbols that no longer exist
  for (const sym of docSymbols) {
    if (!allSymbols.has(sym)) {
      errors.push(`${domain}: reference doc mentions \`${sym}\` which no longer exists in source`);
    }
  }

  return { domain, errors, warnings };
}

// CLI entrypoint — only runs when executed directly
async function main(): Promise<void> {
  const program = new Command();
  program
    .name('docs:check')
    .description('Check documentation freshness against source code')
    .parse(process.argv);

  const cache = readCache(CACHE_FILE);
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const domain of DOMAIN_ALLOWLIST) {
    const domainPath = getDomainPath(domain);
    if (!fs.existsSync(domainPath)) continue;

    // Extract current state — parse failure is a hard error in CI
    let snapshot: DomainSnapshot;
    try {
      snapshot = extractDomainSnapshot(domainPath);
      const files = selectFiles(domainPath, []);
      snapshot.apiHash = computeApiHash(snapshot);
      snapshot.contentHash = computeContentHash(files);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ ${domain}: extraction failed — ${msg}`);
      totalErrors++;
      continue;
    }

    // Read reference doc
    const refPath = path.join(DOCS_REFERENCE_DIR, `${domain}.md`);
    const referenceDoc = fs.existsSync(refPath) ? fs.readFileSync(refPath, 'utf-8') : '';

    if (!referenceDoc) {
      console.warn(`⚠ ${domain}: no reference doc found at ${refPath}`);
      totalWarnings++;
      continue;
    }

    const result = checkDomain(domain, snapshot, referenceDoc, cache);

    for (const err of result.errors) {
      console.error(`❌ ${err}`);
      totalErrors++;
    }
    for (const warn of result.warnings) {
      console.warn(`⚠ ${warn}`);
      totalWarnings++;
    }
  }

  console.log(`\nCheck complete: ${totalErrors} error(s), ${totalWarnings} warning(s)`);

  if (totalErrors > 0) {
    console.error('\nRun `pnpm docs:generate --artifact reference` to update reference docs.');
    process.exit(1);
  }
}

// Only run CLI when this file is the entrypoint
if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/check.test.ts -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tools/docs/src/check.ts tools/docs/__tests__/check.test.ts
git commit -m "feat(docs): CI docs:check — freshness gate for reference docs"
```

---

## Task 5: Add --changed and --artifact to generate.ts

**Files:**
- Modify: `tools/docs/src/generate.ts`

This is the integration task — adds `--changed`, `--artifact`, reference generation, and CLAUDE.md sync to the existing CLI.

- [ ] **Step 1: Read current generate.ts**

Read `tools/docs/src/generate.ts` to understand exact current structure before modifying.

- [ ] **Step 2: Add new imports and flags**

Add imports at top of generate.ts:
```typescript
import { renderReference } from './render/reference';
import { generateDomainSummary, updateClaudeMdSections } from './render/claudeMd';
import { DOCS_REFERENCE_DIR, CLAUDE_MD_PATH } from './config';
```

Add new CLI flags after existing `.option('--dry-run', ...)`:
```typescript
.option('--changed', 'Only process domains where hashes differ from cache')
.option('--artifact <type>', 'Generate specific artifact: modules, reference, claude-md')
```

Also update the `opts` type annotation (around line 78) to include the new fields:
```typescript
const opts = program.opts<{
  domain: string;
  force: boolean | undefined;
  debug: boolean | undefined;
  dryRun: boolean | undefined;
  changed: boolean | undefined;     // NEW
  artifact: string | undefined;     // NEW
}>();
```

Note: `DOCS_MODULES_DIR` is already imported from `./config` — do NOT re-import it.

- [ ] **Step 3: Add --changed logic after Step 3 (hash computation)**

After the hash computation loop (after line ~134), add:
```typescript
  // -------------------------------------------------------------------------
  // Step 3b: --changed — filter to domains with changed hashes
  // -------------------------------------------------------------------------
  if (opts.changed && !opts.force) {
    const cache = readCache(CACHE_FILE);
    const before = snapshots.size;
    for (const [d, snapshot] of snapshots) {
      const cached = cache[d];
      if (cached) {
        const artifactType = opts.artifact;
        let unchanged: boolean;
        if (artifactType === 'reference') {
          unchanged = cached.apiHash === snapshot.apiHash;
        } else if (artifactType === 'modules' || artifactType === 'claude-md') {
          unchanged = cached.contentHash === snapshot.contentHash;
        } else {
          // No --artifact: skip only if BOTH hashes match
          unchanged = cached.apiHash === snapshot.apiHash && cached.contentHash === snapshot.contentHash;
        }
        if (unchanged) snapshots.delete(d);
      }
    }
    const after = snapshots.size;
    if (before !== after) {
      process.stderr.write(`--changed: ${before - after} domain(s) unchanged, ${after} to process\n`);
    }
    if (snapshots.size === 0) {
      process.stderr.write('All domains up to date. Nothing to generate.\n');
      process.exit(0);
    }
  }
```

- [ ] **Step 4: Add artifact-type routing in the per-domain loop**

Replace the existing per-domain processing block (Step 7) with artifact-aware logic:
```typescript
  const artifactType = opts.artifact as string | undefined;

  for (const [d, snapshot] of snapshots) {
    process.stderr.write(`Processing ${d}...\n`);
    const domainPath = getDomainPath(d);

    // --- Reference docs (deterministic, no AI) ---
    if (!artifactType || artifactType === 'reference') {
      const refMd = renderReference(d, snapshot, commitSha);
      if (isDryRun) {
        process.stdout.write(`\n=== reference: ${d}.md ===\n${refMd}\n`);
      } else {
        fs.mkdirSync(DOCS_REFERENCE_DIR, { recursive: true });
        const refPath = path.join(DOCS_REFERENCE_DIR, `${d}.md`);
        fs.writeFileSync(refPath, refMd, 'utf-8');
        process.stderr.write(`  Written: ${refPath}\n`);
      }
    }

    // --- Module overviews (AI-enriched) ---
    // IMPORTANT: Wrap the EXISTING AI enrichment code (lines ~188-241 in generate.ts)
    // inside this `if` block. Do NOT delete or replace it. The existing code handles:
    // selectFiles → buildModulePrompt → enrichDomain → checkSymbols → renderKeyInterfaces
    // → renderCrossDeps → assembleModuleDoc → write/print.
    // Just add the `if` wrapper around it:
    if (!artifactType || artifactType === 'modules') {
      // ... all existing AI enrichment + assembly code stays here unchanged ...
    }

    // Update cache entry (always, regardless of artifact type)
    if (!isDryRun) {
      updatedCache[d] = { apiHash: snapshot.apiHash, contentHash: snapshot.contentHash };
    }
  }

  // --- CLAUDE.md sync ---
  if (!artifactType || artifactType === 'claude-md') {
    if (fs.existsSync(CLAUDE_MD_PATH)) {
      const claudeMd = fs.readFileSync(CLAUDE_MD_PATH, 'utf-8');
      const summaries: Record<string, string> = {};
      for (const [d] of snapshots) {
        const moduleDocPath = path.join(DOCS_MODULES_DIR, `${d}.md`);
        if (fs.existsSync(moduleDocPath)) {
          const moduleDoc = fs.readFileSync(moduleDocPath, 'utf-8');
          summaries[d] = generateDomainSummary(moduleDoc);
        }
      }
      if (Object.keys(summaries).length > 0) {
        const updated = updateClaudeMdSections(claudeMd, summaries);
        if (updated !== claudeMd) {
          if (isDryRun) {
            process.stdout.write('\n=== CLAUDE.md changes ===\n');
            process.stdout.write(updated.slice(0, 500) + '...\n');
          } else {
            fs.writeFileSync(CLAUDE_MD_PATH, updated, 'utf-8');
            process.stderr.write(`  Updated: ${CLAUDE_MD_PATH}\n`);
          }
        } else {
          process.stderr.write('  CLAUDE.md: no sentinel sections found to update\n');
        }
      }
    }
  }
```

- [ ] **Step 5: Verify compilation**

Run: `cd /c/Lucid-L2/tools/docs && npx tsc --noEmit`

- [ ] **Step 6: Run all tests**

Run: `cd /c/Lucid-L2/tools/docs && npx jest -v`
Expected: All tests PASS (existing + new)

- [ ] **Step 7: Commit**

```bash
git add tools/docs/src/generate.ts
git commit -m "feat(docs): add --changed, --artifact flags + reference generation + CLAUDE.md sync"
```

---

## Task 6: Integration Test — Reference + Check

**Files:**
- Create: `tools/docs/__tests__/integration/phase2.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// __tests__/integration/phase2.test.ts
import path from 'path';
import { extractDomainSnapshot } from '../../src/extract/extractor';
import { selectFiles } from '../../src/extract/fileSelector';
import { computeApiHash, computeContentHash } from '../../src/extract/hasher';
import { renderReference } from '../../src/render/reference';
import { checkDomain } from '../../src/check';

const ENGINE_SRC = path.resolve(__dirname, '..', '..', '..', '..', 'offchain', 'packages', 'engine', 'src');
const ANCHORING = path.join(ENGINE_SRC, 'anchoring');

describe('Phase 2 Integration: anchoring domain', () => {
  let snapshot: ReturnType<typeof extractDomainSnapshot>;
  let refDoc: string;

  beforeAll(() => {
    snapshot = extractDomainSnapshot(ANCHORING);
    const files = selectFiles(ANCHORING, []);
    snapshot.apiHash = computeApiHash(snapshot);
    snapshot.contentHash = computeContentHash(files);
    refDoc = renderReference('anchoring', snapshot, 'test123');
  });

  it('generates reference doc with all exported interfaces', () => {
    expect(refDoc).toContain('# Anchoring — Interface Reference');
    for (const iface of snapshot.interfaces) {
      expect(refDoc).toContain(`### ${iface.name}`);
    }
  });

  it('generates reference doc with all exported functions', () => {
    for (const func of snapshot.functions) {
      expect(refDoc).toContain(`### ${func.name}`);
    }
  });

  it('passes docs:check when reference doc matches snapshot', () => {
    const cache = { anchoring: { apiHash: snapshot.apiHash, contentHash: snapshot.contentHash } };
    const result = checkDomain('anchoring', snapshot, refDoc, cache);
    expect(result.errors).toHaveLength(0);
  });

  it('fails docs:check when apiHash is stale', () => {
    const cache = { anchoring: { apiHash: 'stale', contentHash: snapshot.contentHash } };
    const result = checkDomain('anchoring', snapshot, refDoc, cache);
    expect(result.errors.some(e => e.includes('apiHash'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/integration/phase2.test.ts -v --testTimeout=30000`
Expected: All PASS

- [ ] **Step 3: Run full test suite**

Run: `cd /c/Lucid-L2/tools/docs && npx jest -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add tools/docs/__tests__/integration/phase2.test.ts
git commit -m "test(docs): Phase 2 integration test — reference renderer + docs:check"
```

---

## Task 7: Generate Reference Docs for All 9 Domains

- [ ] **Step 1: Generate reference docs**

Run: `cd /c/Lucid-L2/tools/docs && npx tsx src/generate.ts --artifact reference`
Expected: 9 files created in `docs/reference/`

- [ ] **Step 2: Run docs:check**

Run: `cd /c/Lucid-L2/tools/docs && npx tsx src/check.ts`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add docs/reference/*.md tools/docs/cache/hashes.json
git commit -m "docs: generate reference docs for all 9 engine domains"
```

---

## Completion Checklist

- [ ] `npx jest -v` — all tests pass (Phase 1 + Phase 2)
- [ ] `npx tsx src/generate.ts --artifact reference` — generates 9 reference docs
- [ ] `npx tsx src/generate.ts --artifact claude-md` — syncs CLAUDE.md (if sentinels added)
- [ ] `npx tsx src/generate.ts --changed` — skips unchanged domains
- [ ] `npx tsx src/check.ts` — 0 errors, 0 hard failures
- [ ] `--artifact modules` still generates AI-enriched overviews as before
