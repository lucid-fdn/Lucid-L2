/**
 * Integration test — Phase 2 pipeline: reference renderer + docs:check
 *
 * Runs against the real `anchoring` domain. Uses broad structural invariants
 * so tests survive routine refactors.
 *
 * Timeout elevated to 30 s because ts-morph can be slow on first parse.
 */

import path from 'path';
import { extractDomainSnapshot } from '../../src/extract/extractor';
import { computeApiHash, computeContentHash } from '../../src/extract/hasher';
import { selectFiles } from '../../src/extract/fileSelector';
import { renderReference } from '../../src/render/reference';
import { checkDomain } from '../../src/check';
import type { DomainSnapshot, CacheData } from '../../src/extract/types';

jest.setTimeout(30000);

// ---------------------------------------------------------------------------
// Path to the real anchoring domain
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
// Shared state — computed once for the whole suite
// ---------------------------------------------------------------------------

let snapshot: DomainSnapshot;
let referenceDoc: string;

beforeAll(() => {
  snapshot = extractDomainSnapshot(ANCHORING_PATH);

  // Populate hashes (mirrors what the CLI does before calling checkDomain)
  const files = selectFiles(ANCHORING_PATH, []);
  snapshot.apiHash = computeApiHash(snapshot);
  snapshot.contentHash = computeContentHash(files);

  referenceDoc = renderReference(snapshot.domain, snapshot, 'abc1234def56789');
});

// ---------------------------------------------------------------------------
// Non-vacuous guards
// ---------------------------------------------------------------------------

describe('0 — preconditions: snapshot is non-empty', () => {
  it('has at least 1 interface (guard against vacuous pass)', () => {
    expect(snapshot.interfaces.length).toBeGreaterThan(0);
  });

  it('has at least 1 function (guard against vacuous pass)', () => {
    expect(snapshot.functions.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 1. Reference doc contains all exported interfaces
// ---------------------------------------------------------------------------

describe('1 — renderReference: all exported interfaces appear as ### headings', () => {
  it('every interface name has a ### Name heading in the reference doc', () => {
    expect(snapshot.interfaces.length).toBeGreaterThan(0);

    for (const iface of snapshot.interfaces) {
      expect(referenceDoc).toContain(`### ${iface.name}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Reference doc contains all exported functions
// ---------------------------------------------------------------------------

describe('2 — renderReference: all exported functions appear as ### headings', () => {
  it('every function name has a ### Name heading in the reference doc', () => {
    expect(snapshot.functions.length).toBeGreaterThan(0);

    for (const fn of snapshot.functions) {
      expect(referenceDoc).toContain(`### ${fn.name}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Reference doc has correct section structure
// ---------------------------------------------------------------------------

describe('3 — renderReference: section structure', () => {
  it('contains ## Interfaces section', () => {
    expect(referenceDoc).toContain('## Interfaces');
  });

  it('contains ## Functions section', () => {
    expect(referenceDoc).toContain('## Functions');
  });
});

// ---------------------------------------------------------------------------
// 4. docs:check passes when reference matches snapshot
// ---------------------------------------------------------------------------

describe('4 — checkDomain: passes when reference matches snapshot', () => {
  it('returns 0 errors when cache apiHash matches current snapshot', () => {
    const cache: CacheData = {
      [snapshot.domain]: {
        apiHash: snapshot.apiHash,
        contentHash: snapshot.contentHash,
      },
    };

    const result = checkDomain(snapshot.domain, snapshot, referenceDoc, cache);

    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. docs:check fails when apiHash is stale
// ---------------------------------------------------------------------------

describe('5 — checkDomain: fails when apiHash is stale', () => {
  it('returns an error containing "apiHash" when cached hash differs', () => {
    const staleHash = 'a'.repeat(64); // valid hex length but wrong value
    const cache: CacheData = {
      [snapshot.domain]: {
        apiHash: staleHash,
        contentHash: snapshot.contentHash,
      },
    };

    const result = checkDomain(snapshot.domain, snapshot, referenceDoc, cache);

    expect(result.errors.length).toBeGreaterThan(0);
    const hasApiHashError = result.errors.some((e) => e.includes('apiHash'));
    expect(hasApiHashError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. docs:check fails when a symbol is missing from reference doc
// ---------------------------------------------------------------------------

describe('6 — checkDomain: fails when snapshot has symbol missing from reference doc', () => {
  it('returns an error when a fake interface exists in snapshot but not in reference doc', () => {
    // Clone snapshot and inject a fake interface not present in reference doc
    const snapshotWithExtra: DomainSnapshot = {
      ...snapshot,
      interfaces: [
        ...snapshot.interfaces,
        {
          name: '__FakeInterfaceNotInDoc__',
          filePath: 'fake.ts',
          jsDoc: null,
          properties: [],
          methods: [],
          extends: [],
        },
      ],
    };

    const cache: CacheData = {};  // no cached entry → only symbol coverage check runs

    const result = checkDomain(
      snapshotWithExtra.domain,
      snapshotWithExtra,
      referenceDoc,  // reference doc was built WITHOUT the fake interface
      cache,
    );

    expect(result.errors.length).toBeGreaterThan(0);
    const hasMissingSymbolError = result.errors.some((e) =>
      e.includes('__FakeInterfaceNotInDoc__'),
    );
    expect(hasMissingSymbolError).toBe(true);
  });
});
