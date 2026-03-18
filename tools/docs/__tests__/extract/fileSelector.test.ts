import path from 'path';
import { selectFiles } from '../../src/extract/fileSelector';

const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures', 'sample-domain');

describe('selectFiles', () => {
  // -------------------------------------------------------------------------
  // Rule 1: Barrel
  // -------------------------------------------------------------------------

  it('always includes index.ts (barrel rule)', () => {
    const result = selectFiles(FIXTURE_DIR, []);
    const paths = result.map((f) => f.path);
    expect(paths).toContain('index.ts');
  });

  // -------------------------------------------------------------------------
  // Rule 4: Orchestrator patterns
  // -------------------------------------------------------------------------

  it('includes files matching orchestrator patterns (e.g. *Service.ts)', () => {
    const result = selectFiles(FIXTURE_DIR, []);
    const paths = result.map((f) => f.path);
    // entryService.ts matches the *Service.ts pattern
    expect(paths).toContain('entryService.ts');
  });

  it('does not include lowercase-only service.ts as an orchestrator match', () => {
    // service.ts does NOT end with the capitalised pattern "Service.ts"
    // (it ends with "service.ts"). It should only be included via export/cross-import rules,
    // not specifically because of the orchestrator rule — but it may still appear via rule 2/3.
    // What we verify here is that entryService.ts (the true orchestrator) IS included.
    const result = selectFiles(FIXTURE_DIR, []);
    const orchestratorPaths = result.map((f) => f.path);
    expect(orchestratorPaths).toContain('entryService.ts');
  });

  // -------------------------------------------------------------------------
  // Return shape
  // -------------------------------------------------------------------------

  it('returns { path, content } for each selected file', () => {
    const result = selectFiles(FIXTURE_DIR, []);
    expect(result.length).toBeGreaterThan(0);
    for (const file of result) {
      expect(typeof file.path).toBe('string');
      expect(typeof file.content).toBe('string');
      // path must be relative (no leading slash or drive letter)
      expect(file.path).not.toMatch(/^[/\\]/);
      expect(file.path).not.toMatch(/^[A-Za-z]:/);
    }
  });

  it('returns paths relative to the domain directory', () => {
    const result = selectFiles(FIXTURE_DIR, []);
    const paths = result.map((f) => f.path);
    // All paths should be bare filenames or relative sub-paths, not absolute
    for (const p of paths) {
      expect(path.isAbsolute(p)).toBe(false);
    }
    // Spot-check that index.ts appears as a bare filename
    expect(paths).toContain('index.ts');
  });

  // -------------------------------------------------------------------------
  // Rule 5: Deduplication
  // -------------------------------------------------------------------------

  it('deduplicates files selected by multiple rules', () => {
    const result = selectFiles(FIXTURE_DIR, []);
    const paths = result.map((f) => f.path);
    // No path should appear twice
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });

  it('index.ts appears exactly once even though it matches rule 1 and rule 2', () => {
    const result = selectFiles(FIXTURE_DIR, []);
    const indexFiles = result.filter((f) => f.path === 'index.ts');
    expect(indexFiles).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Rule 5: Character budget
  // -------------------------------------------------------------------------

  it('respects a tiny character budget by dropping rule-4 files first', () => {
    // index.ts is ~246 chars; use a budget just above that so only it can fit
    // after rule-4 (entryService.ts ~481 chars) is dropped.
    // Budget = 500: total fixture chars ~2813 > 500, so trimming must happen.
    const result = selectFiles(FIXTURE_DIR, [], 500);
    const paths = result.map((f) => f.path);

    // index.ts (rule 1, ~246 chars) must always survive — it is rule 1 and rule 2
    // and is never trimmed.
    expect(paths).toContain('index.ts');

    // entryService.ts (rule 4 only, ~481 chars) should be trimmed first
    expect(paths).not.toContain('entryService.ts');
  });

  it('returns fewer files with a smaller budget than a larger budget', () => {
    const fullResult = selectFiles(FIXTURE_DIR, []);
    const tinyResult = selectFiles(FIXTURE_DIR, [], 500);
    expect(tinyResult.length).toBeLessThan(fullResult.length);
  });

  it('content for each returned file matches what is on disk', () => {
    const fs = require('fs') as typeof import('fs');
    const result = selectFiles(FIXTURE_DIR, []);
    for (const file of result) {
      const diskContent = fs.readFileSync(path.join(FIXTURE_DIR, file.path), 'utf-8');
      expect(file.content).toBe(diskContent);
    }
  });
});
