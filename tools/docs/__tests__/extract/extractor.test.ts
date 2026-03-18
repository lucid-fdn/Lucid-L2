import path from 'path';
import { extractDomainSnapshot } from '../../src/extract/extractor';
import type { DomainSnapshot } from '../../src/extract/types';

const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures', 'sample-domain');

describe('extractDomainSnapshot', () => {
  let snapshot: DomainSnapshot;

  beforeAll(() => {
    snapshot = extractDomainSnapshot(FIXTURE_DIR);
  });

  it('sets domain name from directory basename', () => {
    expect(snapshot.domain).toBe('sample-domain');
  });

  // ---------------------------------------------------------------------------
  // Interfaces
  // ---------------------------------------------------------------------------

  describe('interfaces', () => {
    it('extracts exported interfaces from the barrel', () => {
      const names = snapshot.interfaces.map((i) => i.name);
      expect(names).toContain('IStore');
      expect(names).toContain('StoreEntry');
      expect(names).toContain('StoreOptions');
    });

    it('extracts IStore with methods, JSDoc, and extends', () => {
      const iStore = snapshot.interfaces.find((i) => i.name === 'IStore')!;
      expect(iStore).toBeDefined();
      expect(iStore.jsDoc).toContain('Storage backend contract');
      expect(iStore.methods.length).toBe(3);

      const putMethod = iStore.methods.find((m) => m.name === 'put')!;
      expect(putMethod).toBeDefined();
      expect(putMethod.jsDoc).toContain('Persist an entry');
      expect(putMethod.params.length).toBeGreaterThanOrEqual(1);
      expect(putMethod.returnType).toContain('Promise');

      const getMethod = iStore.methods.find((m) => m.name === 'get')!;
      expect(getMethod).toBeDefined();
      expect(getMethod.jsDoc).toContain('Retrieve an entry');

      const deleteMethod = iStore.methods.find((m) => m.name === 'delete')!;
      expect(deleteMethod).toBeDefined();
      expect(deleteMethod.jsDoc).toContain('Delete an entry');
    });

    it('extracts StoreEntry with properties and JSDoc on properties', () => {
      const entry = snapshot.interfaces.find((i) => i.name === 'StoreEntry')!;
      expect(entry).toBeDefined();
      expect(entry.properties.length).toBe(3);

      const idProp = entry.properties.find((p) => p.name === 'id')!;
      expect(idProp.type).toBe('string');
      expect(idProp.optional).toBe(false);

      const createdAtProp = entry.properties.find((p) => p.name === 'createdAt')!;
      expect(createdAtProp.type).toBe('Date');
      expect(createdAtProp.jsDoc).toContain('When the entry was created');
    });

    it('extracts StoreOptions with optional properties', () => {
      const opts = snapshot.interfaces.find((i) => i.name === 'StoreOptions')!;
      expect(opts).toBeDefined();

      const maxRetries = opts.properties.find((p) => p.name === 'maxRetries')!;
      expect(maxRetries.optional).toBe(true);
      expect(maxRetries.type).toContain('number');

      const timeout = opts.properties.find((p) => p.name === 'timeout')!;
      expect(timeout.optional).toBe(true);
    });

    it('reports filePaths relative to domain root', () => {
      const iStore = snapshot.interfaces.find((i) => i.name === 'IStore')!;
      expect(iStore.filePath).toBe('store.ts');

      const entry = snapshot.interfaces.find((i) => i.name === 'StoreEntry')!;
      expect(entry.filePath).toBe('types.ts');
    });
  });

  // ---------------------------------------------------------------------------
  // Functions
  // ---------------------------------------------------------------------------

  describe('functions', () => {
    it('extracts exported functions from the barrel', () => {
      const names = snapshot.functions.map((f) => f.name);
      expect(names).toContain('createEntry');
      expect(names).toContain('verifyEntry');
    });

    it('extracts createEntry with params, return type, isAsync, and JSDoc', () => {
      const fn = snapshot.functions.find((f) => f.name === 'createEntry')!;
      expect(fn).toBeDefined();
      expect(fn.isAsync).toBe(true);
      expect(fn.jsDoc).toContain('Create a new entry');
      expect(fn.returnType).toContain('Promise');
      expect(fn.params.length).toBe(2);

      const storeParam = fn.params.find((p) => p.name === 'store')!;
      expect(storeParam).toBeDefined();
      expect(storeParam.type).toContain('IStore');

      const dataParam = fn.params.find((p) => p.name === 'data')!;
      expect(dataParam).toBeDefined();
      expect(dataParam.type).toBe('unknown');
    });

    it('extracts verifyEntry with correct signature', () => {
      const fn = snapshot.functions.find((f) => f.name === 'verifyEntry')!;
      expect(fn).toBeDefined();
      expect(fn.isAsync).toBe(true);
      expect(fn.jsDoc).toContain('Verify an entry exists');
      expect(fn.params.length).toBe(2);
      expect(fn.returnType).toContain('Promise');
    });

    it('reports function filePaths relative to domain root', () => {
      const fn = snapshot.functions.find((f) => f.name === 'createEntry')!;
      expect(fn.filePath).toBe('service.ts');
    });
  });

  // ---------------------------------------------------------------------------
  // Type aliases and enums
  // ---------------------------------------------------------------------------

  describe('types', () => {
    it('extracts StorageTier as a type alias', () => {
      const t = snapshot.types.find((t) => t.name === 'StorageTier')!;
      expect(t).toBeDefined();
      expect(t.kind).toBe('alias');
      expect(t.jsDoc).toContain('Storage tier');
      expect(t.definition).toContain('permanent');
      expect(t.definition).toContain('evolving');
    });

    it('extracts CompactionMode as an enum', () => {
      const t = snapshot.types.find((t) => t.name === 'CompactionMode')!;
      expect(t).toBeDefined();
      expect(t.kind).toBe('enum');
      expect(t.jsDoc).toContain('Compaction mode');
      expect(t.definition).toContain('warm');
      expect(t.definition).toContain('cold');
      expect(t.definition).toContain('full');
    });

    it('reports type filePaths relative to domain root', () => {
      const t = snapshot.types.find((t) => t.name === 'StorageTier')!;
      expect(t.filePath).toBe('types.ts');
    });
  });

  // ---------------------------------------------------------------------------
  // Dependency edges
  // ---------------------------------------------------------------------------

  describe('dependency edges', () => {
    it('detects cross-domain import from service.ts to fake-shared', () => {
      const edge = snapshot.imports.find((e) => e.toDomain === 'fake-shared');
      expect(edge).toBeDefined();
      expect(edge!.fromDomain).toBe('sample-domain');
      expect(edge!.importedSymbols).toContain('sha256');
    });

    it('does NOT include intra-domain imports as edges', () => {
      const selfEdge = snapshot.imports.find((e) => e.toDomain === 'sample-domain');
      expect(selfEdge).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Non-exported symbols are excluded (barrel-based)
  // ---------------------------------------------------------------------------

  describe('barrel filtering', () => {
    it('does not export InMemoryStore private members as interfaces', () => {
      // InMemoryStore is a class exported from the barrel, but its private
      // Map<string, StoreEntry> field should not appear as a top-level interface.
      const dataInterface = snapshot.interfaces.find((i) => i.name === 'data');
      expect(dataInterface).toBeUndefined();
    });
  });
});
