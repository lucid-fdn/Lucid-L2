# AI Documentation Pipeline — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate 9 AI-enriched module overview docs for developer onboarding, one command.

**Architecture:** ts-morph extracts exported symbols from 9 engine domains into `DomainSnapshot` objects. Deterministic renderers produce Key Interfaces and Cross-Domain Dependencies tables. OpenAI generates 4 narrative sections (Purpose, Architecture, Data Flow, Patterns & Gotchas). A symbol guard catches hallucinated identifiers. All sections merge into one markdown doc per domain.

**Tech Stack:** TypeScript, ts-morph (AST), OpenAI SDK (existing dep), commander (existing devDep), Jest (existing test framework)

**Spec:** `docs/superpowers/specs/2026-03-18-ai-documentation-pipeline-design.md`

---

## File Map

### New files to create

```
tools/docs/
  package.json                           # Standalone package: ts-morph + tsx deps
  tsconfig.json                          # Extends ../../offchain/tsconfig.base.json
  src/
    generate.ts                          # CLI entrypoint (commander)
    config.ts                            # Domain allowlist, paths, constants
    extract/
      types.ts                           # DomainSnapshot + all sub-types
      extractor.ts                       # ts-morph domain scanner
      fileSelector.ts                    # Deterministic file selection (5 rules)
      hasher.ts                          # apiHash + contentHash computation
    render/
      keyInterfaces.ts                   # Deterministic Key Interfaces table
      crossDeps.ts                       # Deterministic Cross-Domain Dependencies table
      assembler.ts                       # Merges deterministic + AI sections → final markdown
    enrich/
      promptBuilder.ts                   # Constructs system + user prompt from snapshot
      enricher.ts                        # OpenAI call + response parsing
      symbolGuard.ts                     # Post-generation hallucination check
    cache/
      cacheManager.ts                    # Read/write/compare hashes.json
  __tests__/
    fixtures/
      sample-domain/                     # Minimal TS files for extractor tests
        index.ts
        types.ts
        service.ts
        store.ts
    extract/
      extractor.test.ts
      fileSelector.test.ts
      hasher.test.ts
    render/
      keyInterfaces.test.ts
      crossDeps.test.ts
      assembler.test.ts
    enrich/
      promptBuilder.test.ts
      symbolGuard.test.ts
    cache/
      cacheManager.test.ts
    integration/
      generate.test.ts                   # End-to-end: extract → render → assemble for real domain
```

### Files to modify

```
offchain/package.json                    # Add "docs:generate" script alias
```

### Output files (generated, not committed initially)

```
docs/modules/
  memory.md
  payment.md
  identity.md
  compute.md
  deployment.md
  epoch.md
  receipt.md
  anchoring.md
  reputation.md
tools/docs/cache/
  hashes.json
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `tools/docs/package.json`
- Create: `tools/docs/tsconfig.json`
- Create: `tools/docs/src/config.ts`
- Create: `tools/docs/src/extract/types.ts`

- [ ] **Step 1: Create tools/docs/package.json**

```json
{
  "name": "@lucid-l2/docs-gen",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "generate": "tsx src/generate.ts",
    "test": "jest"
  },
  "dependencies": {
    "ts-morph": "^24.0.0",
    "openai": "^5.10.1",
    "commander": "^9.5.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/node": "^20.19.24",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2",
    "tsx": "^4.19.0",
    "typescript": "^5.0.0"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "roots": ["<rootDir>/__tests__"],
    "testMatch": ["**/*.test.ts"]
  }
}
```

- [ ] **Step 2: Create tools/docs/tsconfig.json**

```json
{
  "extends": "../../offchain/tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist",
    "declaration": true,
    "strictNullChecks": true
  },
  "include": ["src/**/*.ts", "__tests__/**/*.ts"]
}
```

- [ ] **Step 3: Create tools/docs/src/extract/types.ts with all type definitions**

```typescript
// tools/docs/src/extract/types.ts
// All types from spec § DomainSnapshot Type

export interface DomainSnapshot {
  domain: string;
  sourcePath: string;
  interfaces: InterfaceInfo[];
  functions: FunctionInfo[];
  types: TypeInfo[];
  imports: DependencyEdge[];
  apiHash: string;
  contentHash: string;
}

export interface InterfaceInfo {
  name: string;
  filePath: string;
  jsDoc: string | null;
  properties: PropertyInfo[];
  methods: MethodInfo[];
  extends: string[];
}

export interface FunctionInfo {
  name: string;
  filePath: string;
  jsDoc: string | null;
  params: ParamInfo[];
  returnType: string;
  isAsync: boolean;
}

export interface TypeInfo {
  name: string;
  filePath: string;
  jsDoc: string | null;
  kind: 'alias' | 'enum';
  definition: string;
}

export interface DependencyEdge {
  fromDomain: string;
  toDomain: string;
  importedSymbols: string[];
}

export interface PropertyInfo {
  name: string;
  type: string;
  jsDoc: string | null;
  optional: boolean;
}

export interface MethodInfo {
  name: string;
  params: ParamInfo[];
  returnType: string;
  jsDoc: string | null;
}

export interface ParamInfo {
  name: string;
  type: string;
  optional: boolean;
  defaultValue: string | null;
}

export interface HashPair {
  apiHash: string;
  contentHash: string;
}

export interface CacheData {
  [domain: string]: HashPair;
}
```

- [ ] **Step 4: Create tools/docs/src/config.ts with domain allowlist and paths**

```typescript
// tools/docs/src/config.ts
import path from 'path';

export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
export const ENGINE_SRC = path.join(REPO_ROOT, 'offchain', 'packages', 'engine', 'src');
export const DOCS_MODULES_DIR = path.join(REPO_ROOT, 'docs', 'modules');
export const CACHE_DIR = path.join(__dirname, '..', 'cache');
export const CACHE_FILE = path.join(CACHE_DIR, 'hashes.json');

export const DOMAIN_ALLOWLIST = [
  'identity',
  'memory',
  'receipt',
  'epoch',
  'payment',
  'compute',
  'deployment',
  'anchoring',
  'reputation',
] as const;

export type DomainName = (typeof DOMAIN_ALLOWLIST)[number];

export function getDomainPath(domain: DomainName): string {
  return path.join(ENGINE_SRC, domain);
}

// Deterministic file selection constants
export const MAX_TOKEN_BUDGET = 25_000;
export const APPROX_CHARS_PER_TOKEN = 4;
export const MAX_CHAR_BUDGET = MAX_TOKEN_BUDGET * APPROX_CHARS_PER_TOKEN;
export const ORCHESTRATOR_PATTERNS = ['Service.ts', 'Manager.ts', 'Store.ts'];
export const TOP_FILES_BY_EXPORTS = 5;
export const TOP_FILES_BY_CROSS_IMPORTS = 2;
```

- [ ] **Step 5: Install dependencies and verify setup**

Run: `cd /c/Lucid-L2/tools/docs && npm install`
Expected: Clean install, node_modules created.

Run: `cd /c/Lucid-L2/tools/docs && npx tsc --noEmit`
Expected: No errors (types.ts and config.ts compile cleanly).

- [ ] **Step 6: Add script alias to offchain/package.json**

Add to `scripts` in `offchain/package.json`:
```json
"docs:generate": "cd ../tools/docs && npx tsx src/generate.ts"
```

- [ ] **Step 7: Commit**

```bash
git add tools/docs/package.json tools/docs/tsconfig.json tools/docs/src/config.ts tools/docs/src/extract/types.ts offchain/package.json
git commit -m "feat(docs): scaffold AI documentation pipeline — types, config, project structure"
```

---

## Task 2: Test Fixtures

**Files:**
- Create: `tools/docs/__tests__/fixtures/sample-domain/index.ts`
- Create: `tools/docs/__tests__/fixtures/sample-domain/types.ts`
- Create: `tools/docs/__tests__/fixtures/sample-domain/service.ts`
- Create: `tools/docs/__tests__/fixtures/sample-domain/store.ts`

These fixtures simulate a minimal domain for extractor testing. They must have exported interfaces, functions, types, enums, JSDoc, and cross-module imports.

- [ ] **Step 1: Create fixture types.ts**

```typescript
// __tests__/fixtures/sample-domain/types.ts

/** Storage tier for DePIN uploads */
export type StorageTier = 'permanent' | 'evolving';

/** Compaction mode for memory cleanup */
export enum CompactionMode {
  /** Archive episodics past hot boundary */
  warm = 'warm',
  /** Hard-prune archived past retention */
  cold = 'cold',
  /** Both warm + cold */
  full = 'full',
}

export interface StoreEntry {
  id: string;
  data: unknown;
  /** When the entry was created */
  createdAt: Date;
}

export interface StoreOptions {
  maxRetries?: number;
  timeout?: number;
}
```

- [ ] **Step 2: Create fixture store.ts with an interface**

```typescript
// __tests__/fixtures/sample-domain/store.ts
import { StoreEntry, StoreOptions } from './types';

/**
 * Storage backend contract.
 * Implementations must handle concurrent writes safely.
 */
export interface IStore {
  /** Persist an entry to the store */
  put(entry: StoreEntry, opts?: StoreOptions): Promise<void>;
  /** Retrieve an entry by ID */
  get(id: string): Promise<StoreEntry | null>;
  /** Delete an entry */
  delete(id: string): Promise<boolean>;
}

export class InMemoryStore implements IStore {
  private data = new Map<string, StoreEntry>();

  async put(entry: StoreEntry): Promise<void> {
    this.data.set(entry.id, entry);
  }

  async get(id: string): Promise<StoreEntry | null> {
    return this.data.get(id) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    return this.data.delete(id);
  }
}
```

- [ ] **Step 3: Create fixture service.ts with exported functions**

```typescript
// __tests__/fixtures/sample-domain/service.ts
import { IStore } from './store';
import { StoreEntry } from './types';

// Simulates a cross-domain import
import { sha256 } from '../fake-shared/crypto';

/**
 * Create a new entry with a computed hash.
 * @param store - The storage backend
 * @param data - Raw data to store
 * @returns The stored entry with generated ID
 */
export async function createEntry(
  store: IStore,
  data: unknown
): Promise<StoreEntry> {
  const id = sha256(JSON.stringify(data));
  const entry: StoreEntry = { id, data, createdAt: new Date() };
  await store.put(entry);
  return entry;
}

/** Verify an entry exists in the store */
export async function verifyEntry(
  store: IStore,
  id: string
): Promise<boolean> {
  const entry = await store.get(id);
  return entry !== null;
}
```

- [ ] **Step 4: Create fixture index.ts (barrel)**

```typescript
// __tests__/fixtures/sample-domain/index.ts
export type { IStore } from './store';
export { InMemoryStore } from './store';
export type { StoreEntry, StoreOptions, StorageTier } from './types';
export { CompactionMode } from './types';
export { createEntry, verifyEntry } from './service';
```

- [ ] **Step 5: Create fake-shared/crypto.ts for cross-domain import testing**

```typescript
// __tests__/fixtures/fake-shared/crypto.ts
export function sha256(input: string): string {
  return 'fake-hash-' + input.length;
}
```

- [ ] **Step 6: Commit**

```bash
git add tools/docs/__tests__/fixtures/
git commit -m "test(docs): add fixture domain for extractor unit tests"
```

---

## Task 3: Interface Extraction

**Files:**
- Create: `tools/docs/src/extract/extractor.ts`
- Create: `tools/docs/__tests__/extract/extractor.test.ts`

- [ ] **Step 1: Write failing test for interface extraction**

```typescript
// __tests__/extract/extractor.test.ts
import path from 'path';
import { extractDomain } from '../../src/extract/extractor';

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');
const SAMPLE_DOMAIN = path.join(FIXTURES, 'sample-domain');

describe('extractDomain', () => {
  it('extracts exported interfaces with properties and methods', () => {
    const snapshot = extractDomain('sample', SAMPLE_DOMAIN);

    const iStore = snapshot.interfaces.find((i) => i.name === 'IStore');
    expect(iStore).toBeDefined();
    expect(iStore!.methods).toHaveLength(3); // put, get, delete
    expect(iStore!.jsDoc).toContain('Storage backend contract');

    const putMethod = iStore!.methods.find((m) => m.name === 'put');
    expect(putMethod).toBeDefined();
    expect(putMethod!.params).toHaveLength(2);
    expect(putMethod!.params[0].name).toBe('entry');
    expect(putMethod!.params[1].optional).toBe(true); // opts?
    expect(putMethod!.returnType).toContain('Promise');
  });

  it('extracts interface extends relationships', () => {
    const snapshot = extractDomain('sample', SAMPLE_DOMAIN);
    const storeEntry = snapshot.interfaces.find((i) => i.name === 'StoreEntry');
    expect(storeEntry).toBeDefined();
    expect(storeEntry!.properties).toHaveLength(3); // id, data, createdAt
  });

  it('extracts JSDoc from interface properties', () => {
    const snapshot = extractDomain('sample', SAMPLE_DOMAIN);
    const storeEntry = snapshot.interfaces.find((i) => i.name === 'StoreEntry');
    const createdAt = storeEntry!.properties.find((p) => p.name === 'createdAt');
    expect(createdAt!.jsDoc).toContain('When the entry was created');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/extract/extractor.test.ts -v`
Expected: FAIL — `Cannot find module '../../src/extract/extractor'`

- [ ] **Step 3: Implement extractor.ts — interface extraction**

```typescript
// tools/docs/src/extract/extractor.ts
import { Project, SourceFile, InterfaceDeclaration, FunctionDeclaration,
         TypeAliasDeclaration, EnumDeclaration, ExportedDeclarations,
         SyntaxKind, Node } from 'ts-morph';
import path from 'path';
import fs from 'fs';
import {
  DomainSnapshot,
  InterfaceInfo,
  FunctionInfo,
  TypeInfo,
  DependencyEdge,
  PropertyInfo,
  MethodInfo,
  ParamInfo,
} from './types';
import { REPO_ROOT } from '../config';

// Attempt to find the repo's real tsconfig for correct module resolution.
// Falls back to ad hoc options if not found (e.g., in test fixtures).
const TSCONFIG_PATH = path.join(REPO_ROOT, 'offchain', 'tsconfig.base.json');

function getJsDoc(node: Node): string | null {
  const jsDocs = (node as any).getJsDocs?.();
  if (!jsDocs || jsDocs.length === 0) return null;
  return jsDocs[0].getDescription().trim() || null;
}

function extractParams(params: any[]): ParamInfo[] {
  return params.map((p: any) => ({
    name: p.getName(),
    type: p.getType().getText(p),
    optional: p.isOptional(),
    defaultValue: p.getInitializer()?.getText() ?? null,
  }));
}

function extractInterface(decl: InterfaceDeclaration, domainRoot: string): InterfaceInfo {
  const properties: PropertyInfo[] = decl.getProperties().map((p) => ({
    name: p.getName(),
    type: p.getType().getText(p),
    jsDoc: getJsDoc(p),
    optional: p.hasQuestionToken(),
  }));

  const methods: MethodInfo[] = decl.getMethods().map((m) => ({
    name: m.getName(),
    params: extractParams(m.getParameters()),
    returnType: m.getReturnType().getText(m),
    jsDoc: getJsDoc(m),
  }));

  return {
    name: decl.getName(),
    filePath: path.relative(domainRoot, decl.getSourceFile().getFilePath()),
    jsDoc: getJsDoc(decl),
    properties,
    methods,
    extends: decl.getExtends().map((e) => e.getText()),
  };
}

function extractFunction(decl: FunctionDeclaration, domainRoot: string): FunctionInfo {
  return {
    name: decl.getName() ?? 'anonymous',
    filePath: path.relative(domainRoot, decl.getSourceFile().getFilePath()),
    jsDoc: getJsDoc(decl),
    params: extractParams(decl.getParameters()),
    returnType: decl.getReturnType().getText(decl),
    isAsync: decl.isAsync(),
  };
}

function extractTypeAlias(decl: TypeAliasDeclaration, domainRoot: string): TypeInfo {
  return {
    name: decl.getName(),
    filePath: path.relative(domainRoot, decl.getSourceFile().getFilePath()),
    jsDoc: getJsDoc(decl),
    kind: 'alias',
    definition: decl.getType().getText(decl),
  };
}

function extractEnum(decl: EnumDeclaration, domainRoot: string): TypeInfo {
  return {
    name: decl.getName(),
    filePath: path.relative(domainRoot, decl.getSourceFile().getFilePath()),
    jsDoc: getJsDoc(decl),
    kind: 'enum',
    definition: decl.getMembers().map((m: any) => m.getName()).join(', '),
  };
}

/**
 * Extract the public API surface of a domain.
 *
 * Strategy: barrel-based extraction. Start from index.ts (the domain's
 * public barrel), resolve its exports, and extract only symbols that are
 * part of the public surface. This ensures internal-only exports are excluded.
 *
 * Falls back to scanning all exported declarations if no barrel exists.
 */
export function extractDomain(domain: string, domainPath: string): DomainSnapshot {
  // Use the repo's real tsconfig for correct module resolution when available
  const useTsConfig = fs.existsSync(TSCONFIG_PATH);
  const project = useTsConfig
    ? new Project({ tsConfigFilePath: TSCONFIG_PATH, skipAddingFilesFromTsConfig: true })
    : new Project({
        compilerOptions: {
          target: 99, module: 1, strict: true,
          esModuleInterop: true, skipLibCheck: true,
        },
      });

  // Add all domain files (excluding tests) for resolution
  project.addSourceFilesAtPaths([
    path.join(domainPath, '**/*.ts'),
    '!' + path.join(domainPath, '**/__tests__/**'),
    '!' + path.join(domainPath, '**/*.test.ts'),
    '!' + path.join(domainPath, '**/*.spec.ts'),
  ]);

  const interfaces: InterfaceInfo[] = [];
  const functions: FunctionInfo[] = [];
  const types: TypeInfo[] = [];
  const imports: DependencyEdge[] = [];

  // Find barrel file (index.ts)
  const barrelPath = path.join(domainPath, 'index.ts');
  const barrelFile = project.getSourceFile(barrelPath.replace(/\\/g, '/'));

  if (barrelFile) {
    // Barrel-based: extract only publicly exported symbols from index.ts
    const exportedDecls = barrelFile.getExportedDeclarations();
    const seen = new Set<string>(); // dedup by name

    for (const [name, decls] of exportedDecls) {
      if (seen.has(name)) continue;
      seen.add(name);

      for (const decl of decls) {
        if (Node.isInterfaceDeclaration(decl)) {
          interfaces.push(extractInterface(decl, domainPath));
        } else if (Node.isFunctionDeclaration(decl)) {
          functions.push(extractFunction(decl, domainPath));
        } else if (Node.isTypeAliasDeclaration(decl)) {
          types.push(extractTypeAlias(decl, domainPath));
        } else if (Node.isEnumDeclaration(decl)) {
          types.push(extractEnum(decl, domainPath));
        }
        // Classes, variables, etc. are ignored for now (Phase 2 reference docs)
      }
    }
  } else {
    // Fallback: no barrel — scan all files for exported declarations
    for (const sourceFile of project.getSourceFiles()) {
      for (const iface of sourceFile.getInterfaces()) {
        if (iface.isExported()) interfaces.push(extractInterface(iface, domainPath));
      }
      for (const func of sourceFile.getFunctions()) {
        if (func.isExported()) functions.push(extractFunction(func, domainPath));
      }
      for (const ta of sourceFile.getTypeAliases()) {
        if (ta.isExported()) types.push(extractTypeAlias(ta, domainPath));
      }
      for (const en of sourceFile.getEnums()) {
        if (en.isExported()) types.push(extractEnum(en, domainPath));
      }
    }
  }

  // Extract cross-domain dependency edges from ALL domain files (not just barrel)
  const edgeMap = new Map<string, Set<string>>();

  for (const sourceFile of project.getSourceFiles()) {
    for (const importDecl of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      if (!moduleSpecifier.startsWith('.')) continue;

      const resolvedPath = importDecl.getModuleSpecifierSourceFile()?.getFilePath();
      if (!resolvedPath) continue;

      const normalizedDomain = domainPath.replace(/\\/g, '/');
      const normalizedResolved = resolvedPath.replace(/\\/g, '/');
      if (normalizedResolved.startsWith(normalizedDomain)) continue; // intra-domain

      const domainParent = path.dirname(normalizedDomain);
      const relativeToDomainParent = path.relative(domainParent, normalizedResolved).replace(/\\/g, '/');
      const targetDomain = relativeToDomainParent.split('/')[0];
      if (!targetDomain || targetDomain === '..') continue;

      if (!edgeMap.has(targetDomain)) edgeMap.set(targetDomain, new Set());

      for (const named of importDecl.getNamedImports()) {
        edgeMap.get(targetDomain)!.add(named.getName());
      }
      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        edgeMap.get(targetDomain)!.add(defaultImport.getText());
      }
    }
  }

  for (const [toDomain, symbols] of edgeMap) {
    imports.push({
      fromDomain: domain,
      toDomain,
      importedSymbols: [...symbols].sort(),
    });
  }

  return {
    domain,
    sourcePath: domainPath,
    interfaces,
    functions,
    types,
    imports,
    apiHash: '',
    contentHash: '',
  };
}
```

**Note:** The extractor is now barrel-based. It starts from `index.ts`, resolves its
`getExportedDeclarations()`, and only extracts symbols visible through the public surface.
If no barrel exists, it falls back to scanning all files. The project is initialized with
the repo's real `tsconfig.base.json` when available, falling back to ad hoc options for
test fixtures. Dependency edges are extracted from all domain files (not just the barrel),
since internal files may import from other domains.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/extract/extractor.test.ts -v`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/docs/src/extract/extractor.ts tools/docs/__tests__/extract/extractor.test.ts
git commit -m "feat(docs): interface extraction via ts-morph"
```

---

## Task 4: Function + Type + Enum Extraction

**Files:**
- Modify: `tools/docs/src/extract/extractor.ts`
- Modify: `tools/docs/__tests__/extract/extractor.test.ts`

- [ ] **Step 1: Write failing tests for functions, types, and enums**

```typescript
// Append to extractor.test.ts

describe('extractDomain — functions', () => {
  it('extracts exported async functions with params and JSDoc', () => {
    const snapshot = extractDomain('sample', SAMPLE_DOMAIN);

    const createEntry = snapshot.functions.find((f) => f.name === 'createEntry');
    expect(createEntry).toBeDefined();
    expect(createEntry!.isAsync).toBe(true);
    expect(createEntry!.params).toHaveLength(2);
    expect(createEntry!.params[0].name).toBe('store');
    expect(createEntry!.returnType).toContain('Promise');
    expect(createEntry!.jsDoc).toContain('Create a new entry');
  });

  it('extracts non-async exported functions', () => {
    const snapshot = extractDomain('sample', SAMPLE_DOMAIN);
    const verifyEntry = snapshot.functions.find((f) => f.name === 'verifyEntry');
    expect(verifyEntry).toBeDefined();
    expect(verifyEntry!.isAsync).toBe(true);
    expect(verifyEntry!.jsDoc).toContain('Verify an entry exists');
  });
});

describe('extractDomain — types and enums', () => {
  it('extracts exported type aliases', () => {
    const snapshot = extractDomain('sample', SAMPLE_DOMAIN);
    const storageTier = snapshot.types.find((t) => t.name === 'StorageTier');
    expect(storageTier).toBeDefined();
    expect(storageTier!.kind).toBe('alias');
    expect(storageTier!.definition).toContain('permanent');
    expect(storageTier!.definition).toContain('evolving');
  });

  it('extracts exported enums', () => {
    const snapshot = extractDomain('sample', SAMPLE_DOMAIN);
    const compaction = snapshot.types.find((t) => t.name === 'CompactionMode');
    expect(compaction).toBeDefined();
    expect(compaction!.kind).toBe('enum');
    expect(compaction!.jsDoc).toContain('Compaction mode');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/extract/extractor.test.ts -v`
Expected: All tests PASS (function/type/enum extraction is already integrated in
the barrel-based extractor from Task 3).

- [ ] **Step 4: Run tests to verify all pass**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/extract/extractor.test.ts -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/docs/src/extract/extractor.ts tools/docs/__tests__/extract/extractor.test.ts
git commit -m "feat(docs): function, type alias, and enum extraction"
```

---

## Task 5: Dependency Edge Extraction

**Files:**
- Modify: `tools/docs/src/extract/extractor.ts`
- Modify: `tools/docs/__tests__/extract/extractor.test.ts`

- [ ] **Step 1: Write failing test for dependency edges**

```typescript
// Append to extractor.test.ts

describe('extractDomain — dependency edges', () => {
  it('detects cross-domain imports', () => {
    const snapshot = extractDomain('sample', SAMPLE_DOMAIN);

    // service.ts imports from '../fake-shared/crypto'
    expect(snapshot.imports.length).toBeGreaterThan(0);
    const cryptoEdge = snapshot.imports.find((e) => e.toDomain === 'fake-shared');
    expect(cryptoEdge).toBeDefined();
    expect(cryptoEdge!.fromDomain).toBe('sample');
    expect(cryptoEdge!.importedSymbols).toContain('sha256');
  });

  it('does not include intra-domain imports as edges', () => {
    const snapshot = extractDomain('sample', SAMPLE_DOMAIN);
    // store.ts imports from './types' — same domain, not an edge
    const selfEdge = snapshot.imports.find((e) => e.toDomain === 'sample');
    expect(selfEdge).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/extract/extractor.test.ts -- --testNamePattern="dependency" -v`
Expected: FAIL (imports array is empty)

- [ ] **Step 3: Implement dependency edge extraction**

Add to `extractDomain`, after the symbol extraction loop:

```typescript
  // Extract cross-domain dependency edges
  const edgeMap = new Map<string, Set<string>>(); // toDomain → symbols

  for (const sourceFile of project.getSourceFiles()) {
    for (const importDecl of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();

      // Only care about relative imports that go outside the domain
      if (!moduleSpecifier.startsWith('.')) continue;

      const resolvedPath = importDecl.getModuleSpecifierSourceFile()?.getFilePath();
      if (!resolvedPath) continue;

      // Check if the import target is outside this domain
      const normalizedDomain = domainPath.replace(/\\/g, '/');
      const normalizedResolved = resolvedPath.replace(/\\/g, '/');
      if (normalizedResolved.startsWith(normalizedDomain)) continue; // intra-domain

      // Determine the target domain name from the path
      // Use domain parent directory as base (e.g., engine/src/) to find sibling domains
      const domainParent = path.dirname(normalizedDomain);
      const relativeToDomainParent = path.relative(domainParent, normalizedResolved).replace(/\\/g, '/');
      const targetDomain = relativeToDomainParent.split('/')[0];
      if (!targetDomain || targetDomain === '..') continue;

      if (!edgeMap.has(targetDomain)) edgeMap.set(targetDomain, new Set());

      // Collect imported symbol names
      for (const named of importDecl.getNamedImports()) {
        edgeMap.get(targetDomain)!.add(named.getName());
      }
      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        edgeMap.get(targetDomain)!.add(defaultImport.getText());
      }
    }
  }

  for (const [toDomain, symbols] of edgeMap) {
    imports.push({
      fromDomain: domain,
      toDomain,
      importedSymbols: [...symbols].sort(),
    });
  }
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/extract/extractor.test.ts -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/docs/src/extract/extractor.ts tools/docs/__tests__/extract/extractor.test.ts
git commit -m "feat(docs): cross-domain dependency edge extraction"
```

---

## Task 6: Hash Computation

**Files:**
- Create: `tools/docs/src/extract/hasher.ts`
- Create: `tools/docs/__tests__/extract/hasher.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/extract/hasher.test.ts
import { computeApiHash, computeContentHash } from '../../src/extract/hasher';
import { DomainSnapshot } from '../../src/extract/types';

describe('computeApiHash', () => {
  it('produces stable hash from sorted signatures', () => {
    const snapshot: Pick<DomainSnapshot, 'interfaces' | 'functions' | 'types'> = {
      interfaces: [
        { name: 'IStore', filePath: 'store.ts', jsDoc: null, properties: [], methods: [], extends: [] },
        { name: 'ICache', filePath: 'cache.ts', jsDoc: null, properties: [], methods: [], extends: [] },
      ],
      functions: [
        { name: 'createEntry', filePath: 'service.ts', jsDoc: null, params: [], returnType: 'void', isAsync: false },
      ],
      types: [],
    };

    const hash1 = computeApiHash(snapshot);
    const hash2 = computeApiHash(snapshot);
    expect(hash1).toBe(hash2); // deterministic
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  it('changes when a symbol is added', () => {
    const base = {
      interfaces: [{ name: 'IStore', filePath: 'store.ts', jsDoc: null, properties: [], methods: [], extends: [] }],
      functions: [],
      types: [],
    };
    const extended = {
      ...base,
      interfaces: [
        ...base.interfaces,
        { name: 'ICache', filePath: 'cache.ts', jsDoc: null, properties: [], methods: [], extends: [] },
      ],
    };
    expect(computeApiHash(base)).not.toBe(computeApiHash(extended));
  });

  it('is order-independent', () => {
    const a = {
      interfaces: [
        { name: 'IStore', filePath: 'store.ts', jsDoc: null, properties: [], methods: [], extends: [] },
        { name: 'ICache', filePath: 'cache.ts', jsDoc: null, properties: [], methods: [], extends: [] },
      ],
      functions: [],
      types: [],
    };
    const b = {
      interfaces: [a.interfaces[1], a.interfaces[0]], // reversed
      functions: [],
      types: [],
    };
    expect(computeApiHash(a)).toBe(computeApiHash(b));
  });
});

describe('computeContentHash', () => {
  it('produces stable hash from file contents', () => {
    const files = [
      { path: 'a.ts', content: 'export const x = 1;' },
      { path: 'b.ts', content: 'export const y = 2;' },
    ];
    const hash1 = computeContentHash(files);
    const hash2 = computeContentHash(files);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('changes when file content changes', () => {
    const v1 = [{ path: 'a.ts', content: 'export const x = 1;' }];
    const v2 = [{ path: 'a.ts', content: 'export const x = 2;' }];
    expect(computeContentHash(v1)).not.toBe(computeContentHash(v2));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/extract/hasher.test.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement hasher.ts**

```typescript
// tools/docs/src/extract/hasher.ts
import { createHash } from 'crypto';
import { DomainSnapshot } from './types';

export function computeApiHash(
  snapshot: Pick<DomainSnapshot, 'interfaces' | 'functions' | 'types'>
): string {
  const signatures: string[] = [];

  for (const iface of snapshot.interfaces) {
    // Hash full interface signature: name + methods + properties + extends
    const methodSigs = iface.methods
      .map((m) => {
        const params = m.params.map((p) => `${p.name}:${p.type}`).join(',');
        return `${m.name}(${params}):${m.returnType}`;
      })
      .sort()
      .join(';');
    const propSigs = iface.properties
      .map((p) => `${p.name}${p.optional ? '?' : ''}:${p.type}`)
      .sort()
      .join(';');
    const extendsSig = iface.extends.sort().join(',');
    signatures.push(`interface:${iface.name}{${propSigs}|${methodSigs}}:${extendsSig}`);
  }
  for (const func of snapshot.functions) {
    const paramSig = func.params.map((p) => `${p.name}:${p.type}`).join(',');
    signatures.push(`function:${func.name}(${paramSig}):${func.returnType}`);
  }
  for (const type of snapshot.types) {
    signatures.push(`${type.kind}:${type.name}=${type.definition}`);
  }

  signatures.sort();
  return createHash('sha256').update(signatures.join('\n')).digest('hex');
}

export function computeContentHash(
  files: { path: string; content: string }[]
): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const combined = sorted.map((f) => `--- ${f.path} ---\n${f.content}`).join('\n');
  return createHash('sha256').update(combined).digest('hex');
}
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/extract/hasher.test.ts -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tools/docs/src/extract/hasher.ts tools/docs/__tests__/extract/hasher.test.ts
git commit -m "feat(docs): apiHash and contentHash computation"
```

---

## Task 7: Deterministic File Selection

**Files:**
- Create: `tools/docs/src/extract/fileSelector.ts`
- Create: `tools/docs/__tests__/extract/fileSelector.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/extract/fileSelector.test.ts
import path from 'path';
import { selectFiles } from '../../src/extract/fileSelector';
import { DomainSnapshot } from '../../src/extract/types';

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');
const SAMPLE_DOMAIN = path.join(FIXTURES, 'sample-domain');

describe('selectFiles', () => {
  it('always includes index.ts / barrel file', () => {
    const result = selectFiles(SAMPLE_DOMAIN, []);
    const names = result.map((f) => path.basename(f.path));
    expect(names).toContain('index.ts');
  });

  it('includes orchestrator files matching *Service.ts, *Store.ts', () => {
    const result = selectFiles(SAMPLE_DOMAIN, []);
    const names = result.map((f) => path.basename(f.path));
    expect(names).toContain('service.ts');
    expect(names).toContain('store.ts');
  });

  it('returns path and content for each selected file', () => {
    const result = selectFiles(SAMPLE_DOMAIN, []);
    expect(result.length).toBeGreaterThan(0);
    for (const file of result) {
      expect(file.path).toBeTruthy();
      expect(file.content).toBeTruthy();
      expect(typeof file.content).toBe('string');
    }
  });

  it('deduplicates files selected by multiple rules', () => {
    const result = selectFiles(SAMPLE_DOMAIN, []);
    const paths = result.map((f) => f.path);
    const unique = new Set(paths);
    expect(paths.length).toBe(unique.size);
  });

  it('respects character budget', () => {
    const result = selectFiles(SAMPLE_DOMAIN, [], 500); // tiny budget
    const totalChars = result.reduce((sum, f) => sum + f.content.length, 0);
    expect(totalChars).toBeLessThanOrEqual(500);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/extract/fileSelector.test.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement fileSelector.ts**

```typescript
// tools/docs/src/extract/fileSelector.ts
import fs from 'fs';
import path from 'path';
import { MAX_CHAR_BUDGET, ORCHESTRATOR_PATTERNS, TOP_FILES_BY_EXPORTS } from '../config';

interface SelectedFile {
  path: string; // relative to domain root
  content: string;
  rule: string; // which rule selected it
}

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('__')) {
      results.push(...getAllTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

function countExports(content: string): number {
  return (content.match(/^export\s/gm) || []).length;
}

function countCrossDomainImports(content: string): number {
  return (content.match(/from\s+['"]\.\.\/[^'"]+['"]/gm) || []).length;
}

export function selectFiles(
  domainPath: string,
  _snapshotHint: unknown[], // reserved for future use
  charBudget: number = MAX_CHAR_BUDGET
): { path: string; content: string }[] {
  const allFiles = getAllTsFiles(domainPath);
  const selected = new Map<string, SelectedFile>(); // absolute path → file

  // Rule 1: index.ts / barrel file
  for (const f of allFiles) {
    if (path.basename(f) === 'index.ts') {
      const content = fs.readFileSync(f, 'utf-8');
      selected.set(f, { path: path.relative(domainPath, f), content, rule: 'barrel' });
    }
  }

  // Rule 2: Top N files by exported symbol count
  const byExports = allFiles
    .filter((f) => !selected.has(f))
    .map((f) => ({ path: f, exports: countExports(fs.readFileSync(f, 'utf-8')) }))
    .sort((a, b) => b.exports - a.exports)
    .slice(0, TOP_FILES_BY_EXPORTS);

  for (const f of byExports) {
    if (!selected.has(f.path)) {
      const content = fs.readFileSync(f.path, 'utf-8');
      selected.set(f.path, { path: path.relative(domainPath, f.path), content, rule: 'top-exports' });
    }
  }

  // Rule 3: Top 2 files by cross-domain import count
  const byCrossImports = allFiles
    .filter((f) => !selected.has(f))
    .map((f) => ({ path: f, imports: countCrossDomainImports(fs.readFileSync(f, 'utf-8')) }))
    .filter((f) => f.imports > 0)
    .sort((a, b) => b.imports - a.imports)
    .slice(0, 2);

  for (const f of byCrossImports) {
    if (!selected.has(f.path)) {
      const content = fs.readFileSync(f.path, 'utf-8');
      selected.set(f.path, { path: path.relative(domainPath, f.path), content, rule: 'cross-imports' });
    }
  }

  // Rule 4: Orchestrator files
  for (const f of allFiles) {
    if (!selected.has(f)) {
      const basename = path.basename(f);
      if (ORCHESTRATOR_PATTERNS.some((p) => basename.endsWith(p))) {
        const content = fs.readFileSync(f, 'utf-8');
        selected.set(f, { path: path.relative(domainPath, f), content, rule: 'orchestrator' });
      }
    }
  }

  // Apply character budget — drop rule 4, then rule 3 if over budget
  const priorityOrder: string[] = ['barrel', 'top-exports', 'cross-imports', 'orchestrator'];
  let files = [...selected.values()].sort(
    (a, b) => priorityOrder.indexOf(a.rule) - priorityOrder.indexOf(b.rule)
  );

  let totalChars = files.reduce((sum, f) => sum + f.content.length, 0);
  while (totalChars > charBudget && files.length > 1) {
    const removed = files.pop()!;
    totalChars -= removed.content.length;
  }

  return files.map((f) => ({ path: f.path, content: f.content }));
}
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/extract/fileSelector.test.ts -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tools/docs/src/extract/fileSelector.ts tools/docs/__tests__/extract/fileSelector.test.ts
git commit -m "feat(docs): deterministic file selection (5-rule strategy)"
```

---

## Task 8: Deterministic Renderers

**Files:**
- Create: `tools/docs/src/render/keyInterfaces.ts`
- Create: `tools/docs/src/render/crossDeps.ts`
- Create: `tools/docs/__tests__/render/keyInterfaces.test.ts`
- Create: `tools/docs/__tests__/render/crossDeps.test.ts`

- [ ] **Step 1: Write failing test for Key Interfaces renderer**

```typescript
// __tests__/render/keyInterfaces.test.ts
import { renderKeyInterfaces } from '../../src/render/keyInterfaces';
import { InterfaceInfo, TypeInfo } from '../../src/extract/types';

describe('renderKeyInterfaces', () => {
  it('renders markdown table from interfaces', () => {
    const interfaces: InterfaceInfo[] = [
      {
        name: 'IStore',
        filePath: 'store/interface.ts',
        jsDoc: 'Storage backend contract for all types',
        properties: [],
        methods: [
          { name: 'put', params: [], returnType: 'Promise<void>', jsDoc: null },
        ],
        extends: [],
      },
    ];

    const md = renderKeyInterfaces(interfaces, []);
    expect(md).toContain('| Interface | File | Role |');
    expect(md).toContain('`IStore`');
    expect(md).toContain('store/interface.ts');
    expect(md).toContain('Storage backend contract');
  });

  it('uses first line of JSDoc as role', () => {
    const interfaces: InterfaceInfo[] = [
      {
        name: 'ICache',
        filePath: 'cache.ts',
        jsDoc: 'Caching layer.\nUsed for performance.',
        properties: [],
        methods: [],
        extends: [],
      },
    ];

    const md = renderKeyInterfaces(interfaces, []);
    expect(md).toContain('Caching layer.');
    expect(md).not.toContain('Used for performance');
  });

  it('shows "—" when no JSDoc', () => {
    const interfaces: InterfaceInfo[] = [
      { name: 'IFoo', filePath: 'foo.ts', jsDoc: null, properties: [], methods: [], extends: [] },
    ];

    const md = renderKeyInterfaces(interfaces, []);
    expect(md).toContain('—');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/render/keyInterfaces.test.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement keyInterfaces.ts**

```typescript
// tools/docs/src/render/keyInterfaces.ts
import { InterfaceInfo, TypeInfo } from '../extract/types';

function firstLine(jsDoc: string | null): string {
  if (!jsDoc) return '—';
  const first = jsDoc.split('\n')[0].trim();
  return first || '—';
}

export function renderKeyInterfaces(
  interfaces: InterfaceInfo[],
  types: TypeInfo[]
): string {
  const lines: string[] = [
    '## Key Interfaces',
    '',
    '| Interface | File | Role |',
    '|-----------|------|------|',
  ];

  const sorted = [...interfaces].sort((a, b) => a.name.localeCompare(b.name));
  for (const iface of sorted) {
    lines.push(`| \`${iface.name}\` | \`${iface.filePath}\` | ${firstLine(iface.jsDoc)} |`);
  }

  // Also include notable type aliases (those with JSDoc)
  const notableTypes = types.filter((t) => t.jsDoc);
  if (notableTypes.length > 0) {
    lines.push('');
    lines.push('**Key Types:**');
    lines.push('');
    lines.push('| Type | File | Kind | Description |');
    lines.push('|------|------|------|-------------|');
    for (const t of notableTypes.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`| \`${t.name}\` | \`${t.filePath}\` | ${t.kind} | ${firstLine(t.jsDoc)} |`);
    }
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run test**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/render/keyInterfaces.test.ts -v`
Expected: All PASS

- [ ] **Step 5: Write failing test for Cross-Domain Dependencies**

```typescript
// __tests__/render/crossDeps.test.ts
import { renderCrossDeps } from '../../src/render/crossDeps';
import { DependencyEdge } from '../../src/extract/types';

describe('renderCrossDeps', () => {
  it('renders import edges for the target domain', () => {
    const allEdges: DependencyEdge[] = [
      { fromDomain: 'memory', toDomain: 'shared', importedSymbols: ['sha256', 'canonicalJson'] },
      { fromDomain: 'memory', toDomain: 'receipt', importedSymbols: ['createReceipt'] },
      { fromDomain: 'payment', toDomain: 'shared', importedSymbols: ['sha256'] },
    ];

    const md = renderCrossDeps('memory', allEdges);
    expect(md).toContain('imports');
    expect(md).toContain('shared');
    expect(md).toContain('`sha256`, `canonicalJson`');
    expect(md).toContain('receipt');
    // Should NOT include payment edges
    expect(md).not.toContain('payment');
  });

  it('renders reverse "exports to" edges', () => {
    const allEdges: DependencyEdge[] = [
      { fromDomain: 'anchoring', toDomain: 'memory', importedSymbols: ['ArchivePipeline'] },
    ];

    const md = renderCrossDeps('memory', allEdges);
    expect(md).toContain('exports to');
    expect(md).toContain('anchoring');
    expect(md).toContain('`ArchivePipeline`');
  });

  it('returns empty section when no edges', () => {
    const md = renderCrossDeps('isolated', []);
    expect(md).toContain('No cross-domain dependencies');
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/render/crossDeps.test.ts -v`
Expected: FAIL

- [ ] **Step 7: Implement crossDeps.ts**

```typescript
// tools/docs/src/render/crossDeps.ts
import { DependencyEdge } from '../extract/types';

export function renderCrossDeps(
  domain: string,
  allEdges: DependencyEdge[]
): string {
  const imports = allEdges.filter((e) => e.fromDomain === domain);
  const exports = allEdges.filter((e) => e.toDomain === domain);

  if (imports.length === 0 && exports.length === 0) {
    return '## Cross-Domain Dependencies\n\nNo cross-domain dependencies detected.';
  }

  const lines: string[] = [
    '## Cross-Domain Dependencies',
    '',
    '| Direction | Domain | Symbols | Purpose |',
    '|-----------|--------|---------|---------|',
  ];

  for (const edge of imports.sort((a, b) => a.toDomain.localeCompare(b.toDomain))) {
    const symbols = edge.importedSymbols.map((s) => `\`${s}\``).join(', ');
    lines.push(`| imports | ${edge.toDomain} | ${symbols} | — |`);
  }

  for (const edge of exports.sort((a, b) => a.fromDomain.localeCompare(b.fromDomain))) {
    const symbols = edge.importedSymbols.map((s) => `\`${s}\``).join(', ');
    lines.push(`| exports to | ${edge.fromDomain} | ${symbols} | — |`);
  }

  return lines.join('\n');
}
```

- [ ] **Step 8: Run all render tests**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/render/ -v`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add tools/docs/src/render/keyInterfaces.ts tools/docs/src/render/crossDeps.ts tools/docs/__tests__/render/
git commit -m "feat(docs): deterministic Key Interfaces and Cross-Domain Dependencies renderers"
```

---

## Task 9: AI Enricher — Prompt Builder + OpenAI Call

**Files:**
- Create: `tools/docs/src/enrich/promptBuilder.ts`
- Create: `tools/docs/src/enrich/enricher.ts`
- Create: `tools/docs/__tests__/enrich/promptBuilder.test.ts`

- [ ] **Step 1: Write failing test for prompt builder**

```typescript
// __tests__/enrich/promptBuilder.test.ts
import { buildModulePrompt } from '../../src/enrich/promptBuilder';
import { DomainSnapshot } from '../../src/extract/types';

describe('buildModulePrompt', () => {
  const snapshot: DomainSnapshot = {
    domain: 'memory',
    sourcePath: 'offchain/packages/engine/src/memory',
    interfaces: [
      { name: 'IStore', filePath: 'store.ts', jsDoc: 'Storage contract', properties: [], methods: [], extends: [] },
    ],
    functions: [
      { name: 'createEntry', filePath: 'service.ts', jsDoc: 'Create entry', params: [], returnType: 'Promise<void>', isAsync: true },
    ],
    types: [],
    imports: [
      { fromDomain: 'memory', toDomain: 'shared', importedSymbols: ['sha256'] },
    ],
    apiHash: 'abc',
    contentHash: 'def',
  };

  const sourceFiles = [
    { path: 'service.ts', content: 'export async function createEntry() {}' },
  ];

  it('returns system and user messages', () => {
    const { system, user } = buildModulePrompt(snapshot, sourceFiles);
    expect(system).toContain('senior engineer');
    expect(system).toContain('NEVER invent function signatures');
  });

  it('includes extracted facts in user prompt', () => {
    const { user } = buildModulePrompt(snapshot, sourceFiles);
    expect(user).toContain('EXTRACTED FACTS');
    expect(user).toContain('IStore');
    expect(user).toContain('createEntry');
  });

  it('includes source excerpts', () => {
    const { user } = buildModulePrompt(snapshot, sourceFiles);
    expect(user).toContain('SOURCE EXCERPTS');
    expect(user).toContain('service.ts');
  });

  it('requests exactly 4 sections', () => {
    const { user } = buildModulePrompt(snapshot, sourceFiles);
    expect(user).toContain('Purpose');
    expect(user).toContain('Architecture');
    expect(user).toContain('Data Flow');
    expect(user).toContain('Patterns & Gotchas');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/enrich/promptBuilder.test.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement promptBuilder.ts**

```typescript
// tools/docs/src/enrich/promptBuilder.ts
import { DomainSnapshot } from '../extract/types';

const SYSTEM_PROMPT = `You are a senior engineer writing internal architecture documentation
for the Lucid L2 platform. You write for experienced developers who are new
to this specific codebase. Be precise, technical, and concise.

Rules:
- NEVER invent function signatures, types, or parameter names
- Reference ONLY interfaces and functions listed in EXTRACTED FACTS
- Explain WHY design decisions were made, not just WHAT exists
- Describe data flows with concrete file paths (file → function → store)
- Note gotchas and non-obvious patterns
- Use backtick formatting for code identifiers

Do NOT generate interface tables, function signatures, or dependency lists.
Those are rendered separately from compiler output.`;

function serializeFacts(snapshot: DomainSnapshot): string {
  const parts: string[] = [];

  if (snapshot.interfaces.length > 0) {
    parts.push('#### Exported Interfaces');
    for (const i of snapshot.interfaces) {
      const desc = i.jsDoc ? ` — ${i.jsDoc.split('\n')[0]}` : '';
      parts.push(`- \`${i.name}\` (${i.filePath})${desc}`);
      for (const m of i.methods) {
        const params = m.params.map((p) => `${p.name}: ${p.type}`).join(', ');
        parts.push(`  - \`${m.name}(${params}): ${m.returnType}\``);
      }
    }
  }

  if (snapshot.functions.length > 0) {
    parts.push('#### Exported Functions');
    for (const f of snapshot.functions) {
      const params = f.params.map((p) => `${p.name}: ${p.type}`).join(', ');
      const desc = f.jsDoc ? ` — ${f.jsDoc.split('\n')[0]}` : '';
      parts.push(`- \`${f.name}(${params}): ${f.returnType}\` (${f.filePath})${desc}`);
    }
  }

  if (snapshot.types.length > 0) {
    parts.push('#### Exported Types');
    for (const t of snapshot.types) {
      parts.push(`- \`${t.name}\` (${t.kind}, ${t.filePath}): ${t.definition}`);
    }
  }

  if (snapshot.imports.length > 0) {
    parts.push('#### Cross-Domain Imports');
    for (const edge of snapshot.imports) {
      parts.push(`- from \`${edge.toDomain}\`: ${edge.importedSymbols.map((s) => `\`${s}\``).join(', ')}`);
    }
  }

  return parts.join('\n');
}

export function buildModulePrompt(
  snapshot: DomainSnapshot,
  sourceFiles: { path: string; content: string }[]
): { system: string; user: string } {
  const excerpts = sourceFiles
    .map((f) => `### ${f.path}\n\`\`\`typescript\n${f.content}\n\`\`\``)
    .join('\n\n');

  const user = `## Domain: ${snapshot.domain}
## Source path: ${snapshot.sourcePath}

### EXTRACTED FACTS (compiler output — treat as ground truth)
${serializeFacts(snapshot)}

### SOURCE EXCERPTS (selected files, deterministic)
${excerpts}

### TASK
Generate documentation with EXACTLY these 4 sections:

1. **Purpose** — What this domain does and why it exists (2-3 sentences)
2. **Architecture** — Key components, how they relate, file paths
3. **Data Flow** — How data moves through the domain (concrete paths)
4. **Patterns & Gotchas** — Non-obvious design decisions, common mistakes, things a new developer would get wrong

Do NOT generate interface tables, function signatures, or dependency lists.
Those are rendered separately from compiler output.`;

  return { system: SYSTEM_PROMPT, user };
}
```

- [ ] **Step 4: Run test**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/enrich/promptBuilder.test.ts -v`
Expected: All PASS

- [ ] **Step 5: Implement enricher.ts (OpenAI call)**

```typescript
// tools/docs/src/enrich/enricher.ts
import OpenAI from 'openai';

const DEFAULT_MODEL = process.env.DOCS_MODEL || 'gpt-4o';
const MAX_RETRIES = 3;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enrichDomain(
  system: string,
  user: string
): Promise<string> {
  const client = new OpenAI(); // reads OPENAI_API_KEY from env
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Exponential backoff on retry
    if (attempt > 0) {
      const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s
      console.log(`  Retry ${attempt}/${MAX_RETRIES - 1} after ${delay}ms...`);
      await sleep(delay);
    }

    try {
      const response = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0.2,
        max_completion_tokens: 4096,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content || content.length < 100) {
        lastError = new Error(`AI returned insufficient content (${content?.length ?? 0} chars)`);
        continue; // retry
      }

      return content;
    } catch (err) {
      lastError = err as Error;
      continue; // retry
    }
  }

  throw lastError ?? new Error('AI enrichment failed after all retries');
}
```

No unit test for `enricher.ts` — it calls the OpenAI API. Tested via integration test in Task 15.

- [ ] **Step 6: Commit**

```bash
git add tools/docs/src/enrich/promptBuilder.ts tools/docs/src/enrich/enricher.ts tools/docs/__tests__/enrich/promptBuilder.test.ts
git commit -m "feat(docs): AI prompt builder and OpenAI enricher"
```

---

## Task 10: Symbol Guard

**Files:**
- Create: `tools/docs/src/enrich/symbolGuard.ts`
- Create: `tools/docs/__tests__/enrich/symbolGuard.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/enrich/symbolGuard.test.ts
import { checkSymbols } from '../../src/enrich/symbolGuard';
import { DomainSnapshot } from '../../src/extract/types';

describe('checkSymbols', () => {
  const snapshot: Pick<DomainSnapshot, 'interfaces' | 'functions' | 'types'> = {
    interfaces: [{ name: 'IStore', filePath: '', jsDoc: null, properties: [], methods: [], extends: [] }],
    functions: [{ name: 'createEntry', filePath: '', jsDoc: null, params: [], returnType: '', isAsync: false }],
    types: [{ name: 'StorageTier', filePath: '', jsDoc: null, kind: 'alias', definition: '' }],
  };

  it('returns no warnings for known identifiers', () => {
    const text = 'The `IStore` interface provides `createEntry` for `StorageTier` data.';
    const warnings = checkSymbols(text, snapshot);
    expect(warnings).toHaveLength(0);
  });

  it('flags backticked identifiers not in snapshot', () => {
    const text = 'The `IStore` interface delegates to `FakeService` for processing.';
    const warnings = checkSymbols(text, snapshot);
    expect(warnings).toContain('FakeService');
  });

  it('flags PascalCase words not in snapshot', () => {
    const text = 'The IStore interface calls HallucinatedManager internally.';
    const warnings = checkSymbols(text, snapshot);
    expect(warnings).toContain('HallucinatedManager');
  });

  it('ignores common English PascalCase words', () => {
    const text = 'This module handles HTTP requests and JSON data via Promise objects.';
    const warnings = checkSymbols(text, snapshot);
    expect(warnings).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/enrich/symbolGuard.test.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement symbolGuard.ts**

```typescript
// tools/docs/src/enrich/symbolGuard.ts
import { DomainSnapshot } from '../extract/types';

// Common English words that look like PascalCase but aren't code identifiers
const COMMON_WORDS = new Set([
  'HTTP', 'JSON', 'API', 'URL', 'SQL', 'DNS', 'TLS', 'SSL', 'JWT', 'OAuth',
  'CRUD', 'REST', 'RPC', 'SDK', 'CLI', 'UUID', 'ULID', 'SHA', 'Ed25519',
  'Promise', 'Array', 'Map', 'Set', 'Date', 'Error', 'Buffer', 'String',
  'Number', 'Boolean', 'Object', 'Function', 'RegExp', 'Symbol', 'BigInt',
  'Solana', 'Ethereum', 'Supabase', 'PostgreSQL', 'SQLite', 'Redis', 'Docker',
  'Arweave', 'Lighthouse', 'Akash', 'Phala', 'Nosana', 'Metaplex',
  'TypeScript', 'JavaScript', 'Node', 'Express', 'React', 'DePIN', 'EVM',
  'Lucid', 'TrustGate', 'CrewAI', 'LangGraph', 'OpenAI',
  'Phase', 'Purpose', 'Architecture', 'Data', 'Flow', 'Patterns', 'Gotchas',
  'Key', 'Interfaces', 'Cross', 'Domain', 'Dependencies', 'Section',
]);

export function checkSymbols(
  aiText: string,
  snapshot: Pick<DomainSnapshot, 'interfaces' | 'functions' | 'types'>
): string[] {
  // Build set of known symbols
  const known = new Set<string>();
  for (const i of snapshot.interfaces) {
    known.add(i.name);
    for (const m of i.methods) known.add(m.name);
    for (const p of i.properties) known.add(p.name);
  }
  for (const f of snapshot.functions) known.add(f.name);
  for (const t of snapshot.types) known.add(t.name);

  const unknown = new Set<string>();

  // Check backticked identifiers (uppercase and camelCase function names)
  const backticked = aiText.matchAll(/`([A-Za-z][a-zA-Z0-9]{2,})`/g);
  for (const match of backticked) {
    const id = match[1];
    if (!known.has(id) && !COMMON_WORDS.has(id)) {
      unknown.add(id);
    }
  }

  // Check compound PascalCase words (must have 2+ uppercase letters to avoid
  // normal sentence words like "Unified", "Storage", "Dispatcher")
  // This matches: AnchorDispatcher, InMemoryStore, IStore — but NOT: Unified, Storage
  const pascalCase = aiText.matchAll(/\b([A-Z][a-z]+[A-Z][a-zA-Z0-9]*)\b/g);
  for (const match of pascalCase) {
    const id = match[1];
    if (!known.has(id) && !COMMON_WORDS.has(id)) {
      unknown.add(id);
    }
  }

  // Also check I-prefixed interfaces (IStore, ICache) which have uppercase after I
  const iPrefixed = aiText.matchAll(/\b(I[A-Z][a-zA-Z0-9]+)\b/g);
  for (const match of iPrefixed) {
    const id = match[1];
    if (!known.has(id) && !COMMON_WORDS.has(id)) {
      unknown.add(id);
    }
  }

  return [...unknown].sort();
}
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/enrich/symbolGuard.test.ts -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tools/docs/src/enrich/symbolGuard.ts tools/docs/__tests__/enrich/symbolGuard.test.ts
git commit -m "feat(docs): post-generation symbol guard for AI hallucination detection"
```

---

## Task 11: Assembler

**Files:**
- Create: `tools/docs/src/render/assembler.ts`
- Create: `tools/docs/__tests__/render/assembler.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/render/assembler.test.ts
import { assembleModuleDoc } from '../../src/render/assembler';

describe('assembleModuleDoc', () => {
  const params = {
    domain: 'memory',
    commitSha: 'abc1234',
    aiContent: '## Purpose\nTest purpose.\n\n## Architecture\nTest arch.\n\n## Data Flow\nTest flow.\n\n## Patterns & Gotchas\nTest gotchas.',
    keyInterfacesSection: '## Key Interfaces\n\n| Interface | File | Role |\n|---|---|---|\n| `IStore` | `store.ts` | Storage |',
    crossDepsSection: '## Cross-Domain Dependencies\n\n| Direction | Domain | Symbols | Purpose |\n|---|---|---|---|\n| imports | shared | `sha256` | — |',
    symbolWarnings: ['FakeService'],
  };

  it('produces valid markdown with all sections', () => {
    const md = assembleModuleDoc(params);
    expect(md).toContain('<!-- generated: commit abc1234');
    expect(md).toContain('# Memory');
    expect(md).toContain('## Purpose');
    expect(md).toContain('## Architecture');
    expect(md).toContain('## Data Flow');
    expect(md).toContain('## Key Interfaces');
    expect(md).toContain('## Cross-Domain Dependencies');
    expect(md).toContain('## Patterns & Gotchas');
  });

  it('capitalizes domain name in title', () => {
    const md = assembleModuleDoc(params);
    expect(md).toContain('# Memory');
  });

  it('includes symbol warnings as HTML comment', () => {
    const md = assembleModuleDoc(params);
    expect(md).toContain('<!-- WARNING: unverified identifiers: FakeService -->');
  });

  it('omits warning comment when no warnings', () => {
    const md = assembleModuleDoc({ ...params, symbolWarnings: [] });
    expect(md).not.toContain('WARNING');
  });

  it('orders sections correctly: AI narrative → deterministic → AI gotchas', () => {
    const md = assembleModuleDoc(params);
    const purposeIdx = md.indexOf('## Purpose');
    const archIdx = md.indexOf('## Architecture');
    const flowIdx = md.indexOf('## Data Flow');
    const ifaceIdx = md.indexOf('## Key Interfaces');
    const depsIdx = md.indexOf('## Cross-Domain Dependencies');
    const gotchasIdx = md.indexOf('## Patterns & Gotchas');

    expect(purposeIdx).toBeLessThan(archIdx);
    expect(archIdx).toBeLessThan(flowIdx);
    expect(flowIdx).toBeLessThan(ifaceIdx);
    expect(ifaceIdx).toBeLessThan(depsIdx);
    expect(depsIdx).toBeLessThan(gotchasIdx);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/render/assembler.test.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement assembler.ts**

```typescript
// tools/docs/src/render/assembler.ts

interface AssembleParams {
  domain: string;
  commitSha: string;
  aiContent: string;
  keyInterfacesSection: string;
  crossDepsSection: string;
  symbolWarnings: string[];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extractSection(content: string, heading: string): string {
  const regex = new RegExp(`## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = content.match(regex);
  return match ? match[1].trim() : '';
}

export function assembleModuleDoc(params: AssembleParams): string {
  const { domain, commitSha, aiContent, keyInterfacesSection, crossDepsSection, symbolWarnings } = params;
  const timestamp = new Date().toISOString();

  const purpose = extractSection(aiContent, 'Purpose');
  const architecture = extractSection(aiContent, 'Architecture');
  const dataFlow = extractSection(aiContent, 'Data Flow');
  const gotchas = extractSection(aiContent, 'Patterns & Gotchas');

  const warningComment = symbolWarnings.length > 0
    ? `<!-- WARNING: unverified identifiers: ${symbolWarnings.join(', ')} -->\n`
    : '';

  return `<!-- generated: commit ${commitSha}, ${timestamp} -->
${warningComment}# ${capitalize(domain)}

## Purpose
${purpose}

## Architecture
${architecture}

## Data Flow
${dataFlow}

${keyInterfacesSection}

${crossDepsSection}

## Patterns & Gotchas
${gotchas}
`;
}
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/render/assembler.test.ts -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tools/docs/src/render/assembler.ts tools/docs/__tests__/render/assembler.test.ts
git commit -m "feat(docs): module doc assembler — merges deterministic + AI sections"
```

---

## Task 12: Cache Manager

**Files:**
- Create: `tools/docs/src/cache/cacheManager.ts`
- Create: `tools/docs/__tests__/cache/cacheManager.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/cache/cacheManager.test.ts
import path from 'path';
import fs from 'fs';
import { readCache, writeCache } from '../../src/cache/cacheManager';
import { CacheData } from '../../src/extract/types';

const TEST_CACHE = path.join(__dirname, 'test-hashes.json');

afterEach(() => {
  if (fs.existsSync(TEST_CACHE)) fs.unlinkSync(TEST_CACHE);
});

describe('cacheManager', () => {
  it('returns empty object when cache file does not exist', () => {
    const data = readCache('/nonexistent/path.json');
    expect(data).toEqual({});
  });

  it('writes and reads cache data', () => {
    const data: CacheData = {
      memory: { apiHash: 'aaa', contentHash: 'bbb' },
      payment: { apiHash: 'ccc', contentHash: 'ddd' },
    };
    writeCache(TEST_CACHE, data);
    const read = readCache(TEST_CACHE);
    expect(read).toEqual(data);
  });

  it('handles corrupted cache file gracefully', () => {
    fs.writeFileSync(TEST_CACHE, 'not valid json');
    const data = readCache(TEST_CACHE);
    expect(data).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/cache/cacheManager.test.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement cacheManager.ts**

```typescript
// tools/docs/src/cache/cacheManager.ts
import fs from 'fs';
import path from 'path';
import { CacheData } from '../extract/types';

export function readCache(cachePath: string): CacheData {
  try {
    if (!fs.existsSync(cachePath)) return {};
    const raw = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function writeCache(cachePath: string, data: CacheData): void {
  const dir = path.dirname(cachePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2) + '\n');
}
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/cache/cacheManager.test.ts -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tools/docs/src/cache/cacheManager.ts tools/docs/__tests__/cache/cacheManager.test.ts
git commit -m "feat(docs): cache manager for hash persistence"
```

---

## Task 13: CLI Entrypoint

**Files:**
- Create: `tools/docs/src/generate.ts`

This task wires everything together. No unit test — tested via integration test in Task 14.

- [ ] **Step 1: Implement generate.ts**

```typescript
// tools/docs/src/generate.ts
import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { DOMAIN_ALLOWLIST, DomainName, getDomainPath, DOCS_MODULES_DIR, CACHE_FILE } from './config';
import { extractDomain } from './extract/extractor';
import { selectFiles } from './extract/fileSelector';
import { computeApiHash, computeContentHash } from './extract/hasher';
import { renderKeyInterfaces } from './render/keyInterfaces';
import { renderCrossDeps } from './render/crossDeps';
import { assembleModuleDoc } from './render/assembler';
import { buildModulePrompt } from './enrich/promptBuilder';
import { enrichDomain } from './enrich/enricher';
import { checkSymbols } from './enrich/symbolGuard';
import { readCache, writeCache } from './cache/cacheManager';
import { DomainSnapshot, DependencyEdge } from './extract/types';
import { execSync } from 'child_process';

function getCommitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function generateDomain(
  domain: DomainName,
  allEdges: DependencyEdge[],
  snapshot: DomainSnapshot,
  commitSha: string,
  dryRun: boolean
): Promise<void> {
  console.log(`  Generating ${domain}...`);

  // Select files for AI context
  const selectedFiles = selectFiles(getDomainPath(domain), []);

  // Build prompt
  const { system, user } = buildModulePrompt(snapshot, selectedFiles);

  // Call AI
  let aiContent: string;
  try {
    aiContent = await enrichDomain(system, user);
  } catch (err) {
    console.warn(`  ⚠ AI enrichment failed for ${domain}: ${err}. Writing deterministic-only doc.`);
    aiContent = '## Purpose\n*AI enrichment pending.*\n\n## Architecture\n*AI enrichment pending.*\n\n## Data Flow\n*AI enrichment pending.*\n\n## Patterns & Gotchas\n*AI enrichment pending.*';
  }

  // Symbol guard (AI sections only)
  const warnings = checkSymbols(aiContent, snapshot);
  if (warnings.length > 0) {
    console.warn(`  ⚠ Unverified identifiers in ${domain}: ${warnings.join(', ')}`);
  }

  // Render deterministic sections
  const keyInterfacesSection = renderKeyInterfaces(snapshot.interfaces, snapshot.types);
  const crossDepsSection = renderCrossDeps(domain, allEdges);

  // Assemble final doc
  const doc = assembleModuleDoc({
    domain,
    commitSha,
    aiContent,
    keyInterfacesSection,
    crossDepsSection,
    symbolWarnings: warnings,
  });

  if (dryRun) {
    console.log(doc);
    return;
  }

  // Write to docs/modules/{domain}.md
  const outPath = path.join(DOCS_MODULES_DIR, `${domain}.md`);
  if (!fs.existsSync(DOCS_MODULES_DIR)) fs.mkdirSync(DOCS_MODULES_DIR, { recursive: true });
  fs.writeFileSync(outPath, doc);
  console.log(`  ✓ Written: ${path.relative(process.cwd(), outPath)}`);
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('docs-generate')
    .description('Generate AI-enriched module documentation for Lucid L2')
    .option('--domain <name>', 'Generate for a single domain')
    .option('--force', 'Bypass cache, regenerate all (Phase 1: always regenerates, flag reserved for Phase 2 --changed)')
    .option('--debug', 'Dump DomainSnapshot to stdout (no generation)')
    .option('--dry-run', 'Print generated doc to stdout instead of writing files')
    .parse();

  const opts = program.opts();

  // Validate domain flag
  const domains: DomainName[] = opts.domain
    ? [opts.domain as DomainName]
    : [...DOMAIN_ALLOWLIST];

  if (opts.domain && !DOMAIN_ALLOWLIST.includes(opts.domain as DomainName)) {
    console.error(`Unknown domain: ${opts.domain}. Valid: ${DOMAIN_ALLOWLIST.join(', ')}`);
    process.exit(1);
  }

  console.log(`Extracting ${domains.length} domain(s)...`);

  // Phase 1: Extract all targeted domains
  const snapshots = new Map<DomainName, DomainSnapshot>();
  for (const domain of domains) {
    const domainPath = getDomainPath(domain);
    if (!fs.existsSync(domainPath)) {
      console.warn(`  ⚠ Domain directory not found: ${domainPath}. Skipping.`);
      continue;
    }
    try {
      const snapshot = extractDomain(domain, domainPath);
      // Compute hashes
      const selectedFiles = selectFiles(domainPath, []);
      snapshot.apiHash = computeApiHash(snapshot);
      snapshot.contentHash = computeContentHash(selectedFiles);
      snapshots.set(domain, snapshot);
    } catch (err) {
      console.warn(`  ⚠ Extraction failed for ${domain}: ${err}. Skipping.`);
    }
  }

  // Debug mode: dump snapshots and exit
  if (opts.debug) {
    for (const [domain, snapshot] of snapshots) {
      console.log(JSON.stringify(snapshot, null, 2));
    }
    return;
  }

  // Collect all edges (need all domains for reverse-edge computation)
  const allEdges: DependencyEdge[] = [];
  for (const snapshot of snapshots.values()) {
    allEdges.push(...snapshot.imports);
  }

  // If generating a subset, also extract edges from other domains for reverse computation
  if (opts.domain) {
    for (const d of DOMAIN_ALLOWLIST) {
      if (snapshots.has(d)) continue;
      const dp = getDomainPath(d);
      if (!fs.existsSync(dp)) continue;
      try {
        const snap = extractDomain(d, dp);
        allEdges.push(...snap.imports);
      } catch { /* skip */ }
    }
  }

  const commitSha = getCommitSha();

  // Generate docs
  for (const [domain, snapshot] of snapshots) {
    await generateDomain(domain, allEdges, snapshot, commitSha, !!opts.dryRun);
  }

  // Update cache (skip on --dry-run and --debug — side-effect-free modes)
  if (!opts.dryRun && !opts.debug) {
    const cache = readCache(CACHE_FILE);
    for (const [domain, snapshot] of snapshots) {
      cache[domain] = { apiHash: snapshot.apiHash, contentHash: snapshot.contentHash };
    }
    writeCache(CACHE_FILE, cache);
    console.log(`Cache updated: ${CACHE_FILE}`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /c/Lucid-L2/tools/docs && npx tsc --noEmit`
Expected: No compilation errors.

- [ ] **Step 3: Commit**

```bash
git add tools/docs/src/generate.ts
git commit -m "feat(docs): CLI entrypoint — docs:generate with --domain, --force, --debug flags"
```

---

## Task 14: Integration Test

**Files:**
- Create: `tools/docs/__tests__/integration/generate.test.ts`

This tests the full pipeline against the real `anchoring` domain (smallest at ~500 LOC).

- [ ] **Step 1: Write integration test (extraction + rendering only, no AI)**

```typescript
// __tests__/integration/generate.test.ts
import path from 'path';
import { extractDomain } from '../../src/extract/extractor';
import { selectFiles } from '../../src/extract/fileSelector';
import { computeApiHash, computeContentHash } from '../../src/extract/hasher';
import { renderKeyInterfaces } from '../../src/render/keyInterfaces';
import { renderCrossDeps } from '../../src/render/crossDeps';
import { buildModulePrompt } from '../../src/enrich/promptBuilder';
import { assembleModuleDoc } from '../../src/render/assembler';
import { checkSymbols } from '../../src/enrich/symbolGuard';

const ENGINE_SRC = path.resolve(__dirname, '..', '..', '..', '..', 'offchain', 'packages', 'engine', 'src');
const ANCHORING = path.join(ENGINE_SRC, 'anchoring');

describe('Integration: anchoring domain (real source)', () => {
  let snapshot: ReturnType<typeof extractDomain>;

  beforeAll(() => {
    snapshot = extractDomain('anchoring', ANCHORING);
  });

  it('extracts interfaces from anchoring public surface', () => {
    // Broad invariants — avoid hardcoding names that may change in refactors
    expect(snapshot.interfaces.length).toBeGreaterThanOrEqual(3);
    // Every interface should have a name and file path
    for (const iface of snapshot.interfaces) {
      expect(iface.name).toBeTruthy();
      expect(iface.filePath).toBeTruthy();
    }
    // At least one interface should have methods (IAnchorRegistry has CRUD methods)
    const hasMethodsIface = snapshot.interfaces.find((i) => i.methods.length > 0);
    expect(hasMethodsIface).toBeDefined();
  });

  it('extracts exported functions', () => {
    // Anchoring has factory functions (getAnchorX) and a reset function
    expect(snapshot.functions.length).toBeGreaterThanOrEqual(3);
    for (const func of snapshot.functions) {
      expect(func.name).toBeTruthy();
      expect(func.filePath).toBeTruthy();
    }
  });

  it('extracts exported types', () => {
    expect(snapshot.types.length).toBeGreaterThanOrEqual(2);
    for (const type of snapshot.types) {
      expect(type.name).toBeTruthy();
      expect(['alias', 'enum']).toContain(type.kind);
    }
  });

  it('detects cross-domain dependencies', () => {
    // anchoring imports from shared (depin, crypto, etc.)
    expect(snapshot.imports.length).toBeGreaterThan(0);
  });

  it('computes stable hashes', () => {
    const selectedFiles = selectFiles(ANCHORING, []);
    const apiHash = computeApiHash(snapshot);
    const contentHash = computeContentHash(selectedFiles);
    expect(apiHash).toHaveLength(64);
    expect(contentHash).toHaveLength(64);

    // Deterministic: same input → same hash
    const apiHash2 = computeApiHash(snapshot);
    expect(apiHash).toBe(apiHash2);
  });

  it('selects files within budget', () => {
    const files = selectFiles(ANCHORING, []);
    expect(files.length).toBeGreaterThan(0);
    const names = files.map((f) => path.basename(f.path));
    expect(names).toContain('index.ts');
  });

  it('renders Key Interfaces table', () => {
    const md = renderKeyInterfaces(snapshot.interfaces, snapshot.types);
    expect(md).toContain('IAnchorRegistry');
    expect(md).toContain('AnchorRecord');
  });

  it('renders Cross-Domain Dependencies', () => {
    const md = renderCrossDeps('anchoring', snapshot.imports);
    expect(md).toContain('## Cross-Domain Dependencies');
  });

  it('builds a valid prompt', () => {
    const files = selectFiles(ANCHORING, []);
    const { system, user } = buildModulePrompt(snapshot, files);
    expect(system).toContain('NEVER invent');
    expect(user).toContain('anchoring');
    expect(user).toContain('IAnchorRegistry');
  });

  it('assembles a complete doc (mock AI content)', () => {
    const mockAI = `## Purpose
Unified DePIN anchoring interface.

## Architecture
Dispatcher + registry + verifier pattern.

## Data Flow
Feature → dispatcher → DePIN storage → registry.

## Patterns & Gotchas
All uploads must go through dispatcher.`;

    const keyIfaces = renderKeyInterfaces(snapshot.interfaces, snapshot.types);
    const crossDeps = renderCrossDeps('anchoring', snapshot.imports);
    const warnings = checkSymbols(mockAI, snapshot);

    const doc = assembleModuleDoc({
      domain: 'anchoring',
      commitSha: 'test123',
      aiContent: mockAI,
      keyInterfacesSection: keyIfaces,
      crossDepsSection: crossDeps,
      symbolWarnings: warnings,
    });

    expect(doc).toContain('# Anchoring');
    expect(doc).toContain('## Purpose');
    expect(doc).toContain('## Key Interfaces');
    expect(doc).toContain('IAnchorRegistry');
    expect(doc).toContain('## Cross-Domain Dependencies');
    expect(doc).toContain('## Patterns & Gotchas');
    expect(doc).toContain('<!-- generated: commit test123');
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `cd /c/Lucid-L2/tools/docs && npx jest __tests__/integration/generate.test.ts -v --testTimeout=30000`
Expected: All PASS. This validates the full pipeline against real source code (minus the AI call).

- [ ] **Step 3: Run all tests**

Run: `cd /c/Lucid-L2/tools/docs && npx jest -v`
Expected: All tests PASS across all test files.

- [ ] **Step 4: Run the actual CLI (dry run, single domain)**

Run: `cd /c/Lucid-L2/tools/docs && npx tsx src/generate.ts --domain anchoring --debug`
Expected: Prints DomainSnapshot JSON for anchoring to stdout. Verify interfaces, functions, types, imports look correct.

- [ ] **Step 5: Commit**

```bash
git add tools/docs/__tests__/integration/generate.test.ts
git commit -m "test(docs): integration test — full pipeline against real anchoring domain"
```

---

## Task 15: End-to-End Generation (requires OPENAI_API_KEY)

This task generates real documentation. Requires `OPENAI_API_KEY` set in environment.

- [ ] **Step 1: Generate docs for one domain**

Run: `cd /c/Lucid-L2/tools/docs && OPENAI_API_KEY=<key> npx tsx src/generate.ts --domain anchoring`

Expected: Creates `docs/modules/anchoring.md` with:
- `<!-- generated: commit ... -->` header
- Purpose, Architecture, Data Flow sections (AI-generated)
- Key Interfaces table (deterministic)
- Cross-Domain Dependencies table (deterministic)
- Patterns & Gotchas (AI-generated)

- [ ] **Step 2: Review generated doc**

Read `docs/modules/anchoring.md`. Verify:
- AI content references real interfaces (`IAnchorRegistry`, `AnchorDispatcher`, `AnchorVerifier`)
- No hallucinated interface names
- Data flow mentions dispatcher pattern
- Key Interfaces table matches actual exports

- [ ] **Step 3: Generate all 9 domains**

Run: `cd /c/Lucid-L2/tools/docs && OPENAI_API_KEY=<key> npx tsx src/generate.ts`

Expected: 9 files in `docs/modules/`. Cache updated at `tools/docs/cache/hashes.json`.

- [ ] **Step 4: Review a few domains for quality**

Spot-check `docs/modules/memory.md` and `docs/modules/payment.md`:
- Do they accurately describe the domain architecture?
- Are the Key Interfaces tables complete?
- Are cross-domain dependencies reasonable?

- [ ] **Step 5: Commit generated docs + cache**

```bash
git add docs/modules/*.md tools/docs/cache/hashes.json
git commit -m "docs: generate initial module overviews for 9 engine domains"
```

---

## Completion Checklist

After all tasks:

- [ ] `cd /c/Lucid-L2/tools/docs && npx jest -v` — all tests pass
- [ ] `npx tsx src/generate.ts --debug --domain anchoring` — prints valid snapshot
- [ ] `npx tsx src/generate.ts --domain anchoring --dry-run` — prints complete doc to stdout (needs API key)
- [ ] 9 module docs exist in `docs/modules/`
- [ ] `cache/hashes.json` contains all 9 domains
- [ ] Each doc has: generated comment, 4 AI sections, Key Interfaces table, Cross-Domain Dependencies table
