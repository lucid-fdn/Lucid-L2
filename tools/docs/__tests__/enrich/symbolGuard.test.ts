import { checkSymbols } from '../../src/enrich/symbolGuard';
import type { DomainSnapshot } from '../../src/extract/types';

// Minimal snapshot used across tests
const snapshot: Pick<DomainSnapshot, 'interfaces' | 'functions' | 'types'> = {
  interfaces: [
    {
      name: 'IStore',
      filePath: 'store.ts',
      jsDoc: null,
      extends: [],
      properties: [{ name: 'capacity', type: 'number', jsDoc: null, optional: false }],
      methods: [{ name: 'getEntry', params: [], returnType: 'Entry', jsDoc: null }],
    },
  ],
  functions: [
    { name: 'createEntry', filePath: 'entry.ts', jsDoc: null, params: [], returnType: 'Entry', isAsync: false },
  ],
  types: [
    { name: 'StorageTier', filePath: 'tier.ts', jsDoc: null, kind: 'enum', definition: '' },
  ],
};

describe('checkSymbols', () => {
  test('returns no warnings for known identifiers (backticked)', () => {
    const text = 'Use `IStore` to call `getEntry` and choose a `StorageTier`. Also `createEntry` is helpful.';
    expect(checkSymbols(text, snapshot)).toEqual([]);
  });

  test('flags backticked identifier not in snapshot', () => {
    const text = 'Use `FakeService` to get things done.';
    const warnings = checkSymbols(text, snapshot);
    expect(warnings).toContain('FakeService');
  });

  test('flags compound PascalCase word not in snapshot', () => {
    // HallucinatedManager has 2 uppercase letters (H + M) — qualifies as compound
    const text = 'The HallucinatedManager coordinates everything.';
    const warnings = checkSymbols(text, snapshot);
    expect(warnings).toContain('HallucinatedManager');
  });

  test('does NOT flag simple single-uppercase PascalCase words', () => {
    // "Unified" and "Storage" each have only 1 uppercase letter — not compound
    const text = 'This is a Unified Storage solution with simple English words.';
    const warnings = checkSymbols(text, snapshot);
    expect(warnings).not.toContain('Unified');
    expect(warnings).not.toContain('Storage');
  });

  test('ignores common English and tech words', () => {
    const text = 'Uses HTTP, JSON, Promise, and Solana under the hood.';
    const warnings = checkSymbols(text, snapshot);
    expect(warnings).not.toContain('HTTP');
    expect(warnings).not.toContain('JSON');
    expect(warnings).not.toContain('Promise');
    expect(warnings).not.toContain('Solana');
  });

  test('ignores common words even when backticked', () => {
    const text = 'Returns a `Promise` wrapping an `Array` of results via the `API`.';
    expect(checkSymbols(text, snapshot)).toEqual([]);
  });

  test('flags I-prefixed interface not in snapshot', () => {
    const text = 'Implement ICache for faster lookups.';
    const warnings = checkSymbols(text, snapshot);
    expect(warnings).toContain('ICache');
  });

  test('does NOT flag known I-prefixed interface', () => {
    const text = 'Implement IStore for storage access.';
    expect(checkSymbols(text, snapshot)).toEqual([]);
  });

  test('returns sorted array', () => {
    const text = '`ZetaService` and `AlphaHelper` are unknown.';
    const warnings = checkSymbols(text, snapshot);
    expect(warnings).toEqual([...warnings].sort());
  });

  test('returns empty array when AI text has no identifiers', () => {
    const text = 'This is plain prose with no code references at all.';
    expect(checkSymbols(text, snapshot)).toEqual([]);
  });

  test('flags multiple unknown identifiers together', () => {
    const text = '`FakeRepo` and `GhostAdapter` are not real.';
    const warnings = checkSymbols(text, snapshot);
    expect(warnings).toContain('FakeRepo');
    expect(warnings).toContain('GhostAdapter');
    expect(warnings).toHaveLength(2);
  });

  test('known property names are not flagged when backticked', () => {
    // 'capacity' is a known property on IStore — but it's camelCase length 8,
    // backtick regex requires 3+ chars so it matches; it should be in known set
    const text = 'Access the `capacity` field directly.';
    expect(checkSymbols(text, snapshot)).toEqual([]);
  });
});
