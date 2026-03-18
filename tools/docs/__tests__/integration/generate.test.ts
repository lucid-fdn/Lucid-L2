/**
 * Integration test — full pipeline against the real `anchoring` domain.
 *
 * Uses broad invariants (count thresholds, structural checks) rather than
 * hardcoded export names so the tests survive routine refactors.
 *
 * Timeout is elevated to 30 s because ts-morph can be slow on first parse.
 */

import path from 'path';
import { extractDomainSnapshot } from '../../src/extract/extractor';
import { selectFiles } from '../../src/extract/fileSelector';
import { computeApiHash, computeContentHash } from '../../src/extract/hasher';
import { renderKeyInterfaces } from '../../src/render/keyInterfaces';
import { renderCrossDeps } from '../../src/render/crossDeps';
import { assembleModuleDoc } from '../../src/render/assembler';
import { buildModulePrompt } from '../../src/enrich/promptBuilder';
import { checkSymbols } from '../../src/enrich/symbolGuard';
import type { DomainSnapshot } from '../../src/extract/types';

jest.setTimeout(30000);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ANCHORING_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'offchain',
  'packages',
  'engine',
  'src',
  'anchoring',
);

// ---------------------------------------------------------------------------
// Shared snapshot (computed once for the whole suite)
// ---------------------------------------------------------------------------

let snapshot: DomainSnapshot;

beforeAll(() => {
  snapshot = extractDomainSnapshot(ANCHORING_PATH);
});

// ---------------------------------------------------------------------------
// 1. Extracts interfaces
// ---------------------------------------------------------------------------

describe('1 — extractDomainSnapshot: interfaces', () => {
  it('extracts at least 3 interfaces', () => {
    expect(snapshot.interfaces.length).toBeGreaterThanOrEqual(3);
  });

  it('every interface has a non-empty name and filePath', () => {
    for (const iface of snapshot.interfaces) {
      expect(typeof iface.name).toBe('string');
      expect(iface.name.length).toBeGreaterThan(0);
      expect(typeof iface.filePath).toBe('string');
      expect(iface.filePath.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. At least one interface has methods
// ---------------------------------------------------------------------------

describe('2 — extractDomainSnapshot: interface methods', () => {
  it('at least one interface has CRUD-style methods (IAnchorRegistry)', () => {
    const withMethods = snapshot.interfaces.filter((i) => i.methods.length > 0);
    expect(withMethods.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Extracts functions
// ---------------------------------------------------------------------------

describe('3 — extractDomainSnapshot: functions', () => {
  it('extracts at least 3 functions', () => {
    expect(snapshot.functions.length).toBeGreaterThanOrEqual(3);
  });

  it('every function has a non-empty name and filePath', () => {
    for (const fn of snapshot.functions) {
      expect(typeof fn.name).toBe('string');
      expect(fn.name.length).toBeGreaterThan(0);
      expect(typeof fn.filePath).toBe('string');
      expect(fn.filePath.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Extracts types (aliases and/or enums)
// ---------------------------------------------------------------------------

describe('4 — extractDomainSnapshot: types', () => {
  it('extracts at least 2 types', () => {
    expect(snapshot.types.length).toBeGreaterThanOrEqual(2);
  });

  it("every type has kind 'alias' or 'enum'", () => {
    for (const t of snapshot.types) {
      expect(['alias', 'enum']).toContain(t.kind);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Detects cross-domain dependencies
// ---------------------------------------------------------------------------

describe('5 — extractDomainSnapshot: cross-domain imports', () => {
  it('detects at least 1 cross-domain dependency edge', () => {
    expect(snapshot.imports.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Computes stable hashes
// ---------------------------------------------------------------------------

describe('6 — computeApiHash / computeContentHash: stable hashes', () => {
  it('apiHash is a 64-char hex string', () => {
    const hash = computeApiHash(snapshot);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('contentHash is a 64-char hex string', () => {
    const files = selectFiles(ANCHORING_PATH, []);
    const hash = computeContentHash(files);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('apiHash is deterministic (same snapshot produces same hash)', () => {
    const h1 = computeApiHash(snapshot);
    const h2 = computeApiHash(snapshot);
    expect(h1).toBe(h2);
  });

  it('contentHash is deterministic (same files produce same hash)', () => {
    const files = selectFiles(ANCHORING_PATH, []);
    const h1 = computeContentHash(files);
    const h2 = computeContentHash(files);
    expect(h1).toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// 7. Selects files within budget
// ---------------------------------------------------------------------------

describe('7 — selectFiles: file selection', () => {
  it('returns at least 1 file', () => {
    const files = selectFiles(ANCHORING_PATH, []);
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  it('includes index.ts', () => {
    const files = selectFiles(ANCHORING_PATH, []);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('index.ts');
  });
});

// ---------------------------------------------------------------------------
// 8. Renders Key Interfaces table
// ---------------------------------------------------------------------------

describe('8 — renderKeyInterfaces: markdown output', () => {
  it('contains ## Key Interfaces heading', () => {
    const md = renderKeyInterfaces(snapshot.interfaces, snapshot.types);
    expect(md).toContain('## Key Interfaces');
  });

  it('contains a pipe table (header row with pipes)', () => {
    const md = renderKeyInterfaces(snapshot.interfaces, snapshot.types);
    // Check for a table header separator line
    expect(md).toMatch(/\|[-| ]+\|/);
  });
});

// ---------------------------------------------------------------------------
// 9. Renders Cross-Domain Dependencies
// ---------------------------------------------------------------------------

describe('9 — renderCrossDeps: markdown output', () => {
  it('contains ## Cross-Domain Dependencies heading', () => {
    const md = renderCrossDeps(snapshot.domain, snapshot.imports);
    expect(md).toContain('## Cross-Domain Dependencies');
  });
});

// ---------------------------------------------------------------------------
// 10. Builds a valid prompt
// ---------------------------------------------------------------------------

describe('10 — buildModulePrompt: prompt content', () => {
  it('system prompt contains "NEVER invent"', () => {
    const files = selectFiles(ANCHORING_PATH, []);
    const { system } = buildModulePrompt(snapshot, files);
    expect(system).toContain('NEVER invent');
  });

  it('user prompt contains the domain name', () => {
    const files = selectFiles(ANCHORING_PATH, []);
    const { user } = buildModulePrompt(snapshot, files);
    expect(user).toContain(snapshot.domain);
  });

  it('user prompt contains at least one interface name', () => {
    const files = selectFiles(ANCHORING_PATH, []);
    const { user } = buildModulePrompt(snapshot, files);
    const interfaceNames = snapshot.interfaces.map((i) => i.name);
    const anyInterfacePresent = interfaceNames.some((name) => user.includes(name));
    expect(anyInterfacePresent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 11. Assembles a complete doc with mock AI content
// ---------------------------------------------------------------------------

const MOCK_AI_CONTENT = `## Purpose
Unified DePIN anchoring interface.

## Architecture
Dispatcher + registry + verifier pattern.

## Data Flow
Feature → dispatcher → DePIN storage → registry.

## Patterns & Gotchas
All uploads must go through dispatcher.`;

describe('11 — assembleModuleDoc: complete document', () => {
  let doc: string;

  beforeAll(() => {
    const keyInterfacesSection = renderKeyInterfaces(snapshot.interfaces, snapshot.types);
    const crossDepsSection = renderCrossDeps(snapshot.domain, snapshot.imports);
    const symbolWarnings = checkSymbols(MOCK_AI_CONTENT, snapshot);

    doc = assembleModuleDoc({
      domain: snapshot.domain,
      commitSha: 'abc1234def5678901234567890123456789012345678901234567890abcdef01',
      aiContent: MOCK_AI_CONTENT,
      keyInterfacesSection,
      crossDepsSection,
      symbolWarnings,
    });
  });

  it('contains all 6 required sections', () => {
    expect(doc).toContain('## Purpose');
    expect(doc).toContain('## Architecture');
    expect(doc).toContain('## Data Flow');
    expect(doc).toContain('## Key Interfaces');
    expect(doc).toContain('## Cross-Domain Dependencies');
    expect(doc).toContain('## Patterns & Gotchas');
  });

  it('contains the generation comment', () => {
    expect(doc).toMatch(/<!-- generated: commit [0-9a-f]+,/);
  });

  it('contains the domain title', () => {
    // assembleModuleDoc capitalizes the first letter
    const title = snapshot.domain.charAt(0).toUpperCase() + snapshot.domain.slice(1);
    expect(doc).toContain(`# ${title}`);
  });
});
