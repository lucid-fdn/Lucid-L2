import { checkDomain } from '../src/check';
import type { DomainSnapshot, CacheData } from '../src/extract/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<DomainSnapshot> = {}): DomainSnapshot {
  return {
    domain: 'identity',
    sourcePath: 'src/identity',
    interfaces: [],
    functions: [],
    types: [],
    imports: [],
    apiHash: 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111',
    contentHash: 'bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222',
    ...overrides,
  };
}

/** Build a reference doc string with the given symbol names as ### headings. */
function makeRefDoc(symbolNames: string[]): string {
  const sections = symbolNames.map((n) => `### ${n}\n\nDescription of ${n}.\n`);
  return `# identity\n\n${sections.join('\n')}`;
}

const DOMAIN = 'identity';

// ---------------------------------------------------------------------------
// Passing case
// ---------------------------------------------------------------------------

describe('checkDomain — passes', () => {
  it('returns no errors or warnings when headings match snapshot symbols exactly', () => {
    const snapshot = makeSnapshot({
      interfaces: [
        { name: 'IIdentity', filePath: 'identity.ts', jsDoc: null, properties: [], methods: [], extends: [] },
      ],
      functions: [
        { name: 'resolveIdentity', filePath: 'identity.ts', jsDoc: null, params: [], returnType: 'void', isAsync: false },
      ],
      types: [
        { name: 'IdentityStatus', filePath: 'types.ts', jsDoc: null, kind: 'alias', definition: "'active' | 'inactive'" },
      ],
    });

    const refDoc = makeRefDoc(['IIdentity', 'resolveIdentity', 'IdentityStatus']);
    const cache: CacheData = {};

    const result = checkDomain(DOMAIN, snapshot, refDoc, cache);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('returns no errors or warnings when snapshot is empty and reference doc has no ### headings', () => {
    const snapshot = makeSnapshot();
    const refDoc = '# identity\n\nNo symbols exported.\n';
    const cache: CacheData = {};

    const result = checkDomain(DOMAIN, snapshot, refDoc, cache);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// apiHash mismatch
// ---------------------------------------------------------------------------

describe('checkDomain — apiHash mismatch', () => {
  it('errors when cached apiHash differs from snapshot apiHash', () => {
    const snapshot = makeSnapshot({
      apiHash: 'current111111111111111111111111111111111111111111111111111111111',
    });

    const cache: CacheData = {
      [DOMAIN]: {
        apiHash: 'cached0000000000000000000000000000000000000000000000000000000000',
        contentHash: snapshot.contentHash,
      },
    };

    const refDoc = makeRefDoc([]);
    const result = checkDomain(DOMAIN, snapshot, refDoc, cache);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/apiHash mismatch/);
  });

  it('includes both cached and current hash prefixes in the error message', () => {
    const snapshot = makeSnapshot({ apiHash: 'ccccddddeeee1111222233334444555566667777888899990000aaaabbbbcccc' });
    const cache: CacheData = {
      [DOMAIN]: {
        apiHash: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        contentHash: snapshot.contentHash,
      },
    };

    const result = checkDomain(DOMAIN, snapshot, makeRefDoc([]), cache);

    expect(result.errors[0]).toMatch(/cached=/);
    expect(result.errors[0]).toMatch(/current=/);
  });

  it('does NOT error on apiHash when no cache entry exists for the domain', () => {
    const snapshot = makeSnapshot({
      apiHash: 'somehash1111111111111111111111111111111111111111111111111111111111',
    });

    // Cache is empty — no entry for this domain
    const cache: CacheData = {};
    const refDoc = makeRefDoc([]);

    const result = checkDomain(DOMAIN, snapshot, refDoc, cache);

    // There should be no apiHash error
    const apiHashErrors = result.errors.filter((e) => e.includes('apiHash'));
    expect(apiHashErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// contentHash mismatch
// ---------------------------------------------------------------------------

describe('checkDomain — contentHash mismatch', () => {
  it('warns (not errors) when cached contentHash differs from snapshot contentHash', () => {
    const snapshot = makeSnapshot({
      contentHash: 'current222222222222222222222222222222222222222222222222222222222',
    });

    const cache: CacheData = {
      [DOMAIN]: {
        apiHash: snapshot.apiHash, // same apiHash — no error there
        contentHash: 'cached33333333333333333333333333333333333333333333333333333333333',
      },
    };

    const refDoc = makeRefDoc([]);
    const result = checkDomain(DOMAIN, snapshot, refDoc, cache);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/contentHash changed/);
  });

  it('does NOT warn on contentHash when no cache entry exists', () => {
    const snapshot = makeSnapshot();
    const cache: CacheData = {};
    const refDoc = makeRefDoc([]);

    const result = checkDomain(DOMAIN, snapshot, refDoc, cache);

    const contentWarnings = result.warnings.filter((w) => w.includes('contentHash'));
    expect(contentWarnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Symbol coverage — source symbol missing from reference doc
// ---------------------------------------------------------------------------

describe('checkDomain — symbol missing from reference doc', () => {
  it('errors when an exported interface has no matching ### heading', () => {
    const snapshot = makeSnapshot({
      interfaces: [
        { name: 'IPassport', filePath: 'passport.ts', jsDoc: null, properties: [], methods: [], extends: [] },
      ],
    });

    // Reference doc has no ### IPassport heading
    const refDoc = '# identity\n\nNo headings here.\n';
    const cache: CacheData = {};

    const result = checkDomain(DOMAIN, snapshot, refDoc, cache);

    expect(result.errors.some((e) => e.includes('"IPassport"') && e.includes('no matching'))).toBe(true);
  });

  it('errors when an exported function has no matching ### heading', () => {
    const snapshot = makeSnapshot({
      functions: [
        { name: 'createPassport', filePath: 'passport.ts', jsDoc: null, params: [], returnType: 'IPassport', isAsync: true },
      ],
    });

    const refDoc = makeRefDoc([]); // no headings
    const cache: CacheData = {};

    const result = checkDomain(DOMAIN, snapshot, refDoc, cache);

    expect(result.errors.some((e) => e.includes('"createPassport"'))).toBe(true);
  });

  it('errors when an exported type has no matching ### heading', () => {
    const snapshot = makeSnapshot({
      types: [
        { name: 'PassportStatus', filePath: 'types.ts', jsDoc: null, kind: 'alias', definition: "'active' | 'revoked'" },
      ],
    });

    const refDoc = makeRefDoc([]);
    const cache: CacheData = {};

    const result = checkDomain(DOMAIN, snapshot, refDoc, cache);

    expect(result.errors.some((e) => e.includes('"PassportStatus"'))).toBe(true);
  });

  it('does NOT false-positive on substring matches — "Foo" heading does not cover "FooBar" symbol', () => {
    const snapshot = makeSnapshot({
      interfaces: [
        { name: 'FooBar', filePath: 'foo.ts', jsDoc: null, properties: [], methods: [], extends: [] },
      ],
    });

    // Reference doc has ### Foo but NOT ### FooBar
    const refDoc = '# identity\n\n### Foo\n\nFoo description.\n';
    const cache: CacheData = {};

    const result = checkDomain(DOMAIN, snapshot, refDoc, cache);

    // FooBar should be reported as missing
    expect(result.errors.some((e) => e.includes('"FooBar"') && e.includes('no matching'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Symbol coverage — stale heading in reference doc
// ---------------------------------------------------------------------------

describe('checkDomain — reference doc has heading for removed symbol', () => {
  it('errors when reference doc has a ### heading with no matching source symbol', () => {
    // Snapshot has no symbols, but reference doc has a heading for a removed type
    const snapshot = makeSnapshot();
    const refDoc = makeRefDoc(['RemovedType']);
    const cache: CacheData = {};

    const result = checkDomain(DOMAIN, snapshot, refDoc, cache);

    expect(result.errors.some((e) => e.includes('"### RemovedType"') && e.includes('no matching exported symbol'))).toBe(true);
  });

  it('errors on each stale heading independently', () => {
    const snapshot = makeSnapshot({
      interfaces: [
        { name: 'IKept', filePath: 'kept.ts', jsDoc: null, properties: [], methods: [], extends: [] },
      ],
    });

    // Reference doc has IKept (valid) + two stale headings
    const refDoc = makeRefDoc(['IKept', 'OldTypeA', 'OldTypeB']);
    const cache: CacheData = {};

    const result = checkDomain(DOMAIN, snapshot, refDoc, cache);

    const staleErrors = result.errors.filter((e) => e.includes('no matching exported symbol'));
    expect(staleErrors).toHaveLength(2);
    expect(staleErrors.some((e) => e.includes('"### OldTypeA"'))).toBe(true);
    expect(staleErrors.some((e) => e.includes('"### OldTypeB"'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// domain field on result
// ---------------------------------------------------------------------------

describe('checkDomain — result metadata', () => {
  it('returns the correct domain name in the result', () => {
    const result = checkDomain('receipt', makeSnapshot({ domain: 'receipt' }), '', {});
    expect(result.domain).toBe('receipt');
  });
});
