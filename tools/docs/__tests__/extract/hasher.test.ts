import { computeApiHash, computeContentHash } from '../../src/extract/hasher';
import type { DomainSnapshot, InterfaceInfo, FunctionInfo, TypeInfo } from '../../src/extract/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<DomainSnapshot> = {}): DomainSnapshot {
  return {
    domain: 'test',
    sourcePath: 'src/test',
    interfaces: [],
    functions: [],
    types: [],
    imports: [],
    apiHash: '',
    contentHash: '',
    ...overrides,
  };
}

const iface1: InterfaceInfo = {
  name: 'IFoo',
  filePath: 'src/foo.ts',
  jsDoc: null,
  extends: [],
  properties: [{ name: 'id', type: 'string', jsDoc: null, optional: false }],
  methods: [
    {
      name: 'bar',
      params: [{ name: 'x', type: 'number', optional: false, defaultValue: null }],
      returnType: 'void',
      jsDoc: null,
    },
  ],
};

const iface2: InterfaceInfo = {
  name: 'IBar',
  filePath: 'src/bar.ts',
  jsDoc: null,
  extends: ['IFoo'],
  properties: [{ name: 'label', type: 'string', jsDoc: null, optional: true }],
  methods: [],
};

const fn1: FunctionInfo = {
  name: 'doWork',
  filePath: 'src/work.ts',
  jsDoc: null,
  params: [{ name: 'input', type: 'string', optional: false, defaultValue: null }],
  returnType: 'Promise<void>',
  isAsync: true,
};

const type1: TypeInfo = {
  name: 'Status',
  filePath: 'src/types.ts',
  jsDoc: null,
  kind: 'alias',
  definition: "'active' | 'inactive'",
};

// ── computeApiHash ─────────────────────────────────────────────────────────

describe('computeApiHash', () => {
  it('is deterministic — same input returns same hash', () => {
    const snap = makeSnapshot({ interfaces: [iface1], functions: [fn1], types: [type1] });
    expect(computeApiHash(snap)).toBe(computeApiHash(snap));
  });

  it('returns a 64-char hex string (SHA-256)', () => {
    const hash = computeApiHash(makeSnapshot({ interfaces: [iface1] }));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when a symbol is added', () => {
    const base = makeSnapshot({ interfaces: [iface1] });
    const extended = makeSnapshot({ interfaces: [iface1, iface2] });
    expect(computeApiHash(base)).not.toBe(computeApiHash(extended));
  });

  it('is order-independent — reversed interfaces produce the same hash', () => {
    const forward = makeSnapshot({ interfaces: [iface1, iface2] });
    const reversed = makeSnapshot({ interfaces: [iface2, iface1] });
    expect(computeApiHash(forward)).toBe(computeApiHash(reversed));
  });

  it('changes when an interface METHOD signature changes (critical)', () => {
    const original = makeSnapshot({ interfaces: [iface1] });

    const modified: InterfaceInfo = {
      ...iface1,
      methods: [
        {
          name: 'bar',
          // param type changed: number -> string
          params: [{ name: 'x', type: 'string', optional: false, defaultValue: null }],
          returnType: 'void',
          jsDoc: null,
        },
      ],
    };
    const changed = makeSnapshot({ interfaces: [modified] });

    expect(computeApiHash(original)).not.toBe(computeApiHash(changed));
  });

  it('changes when an interface METHOD return type changes', () => {
    const original = makeSnapshot({ interfaces: [iface1] });

    const modified: InterfaceInfo = {
      ...iface1,
      methods: [
        {
          name: 'bar',
          params: [{ name: 'x', type: 'number', optional: false, defaultValue: null }],
          returnType: 'string', // was void
          jsDoc: null,
        },
      ],
    };
    expect(computeApiHash(original)).not.toBe(computeApiHash(makeSnapshot({ interfaces: [modified] })));
  });

  it('changes when a property type changes', () => {
    const original = makeSnapshot({ interfaces: [iface1] });
    const modified: InterfaceInfo = {
      ...iface1,
      properties: [{ name: 'id', type: 'number', jsDoc: null, optional: false }], // was string
    };
    expect(computeApiHash(original)).not.toBe(computeApiHash(makeSnapshot({ interfaces: [modified] })));
  });

  it('changes when a function return type changes', () => {
    const original = makeSnapshot({ functions: [fn1] });
    const modified: FunctionInfo = { ...fn1, returnType: 'void' };
    expect(computeApiHash(original)).not.toBe(computeApiHash(makeSnapshot({ functions: [modified] })));
  });

  it('changes when the extends clause changes', () => {
    const original = makeSnapshot({ interfaces: [iface2] });
    const modified: InterfaceInfo = { ...iface2, extends: [] };
    expect(computeApiHash(original)).not.toBe(computeApiHash(makeSnapshot({ interfaces: [modified] })));
  });

  it('is order-independent for methods within an interface', () => {
    const methodA = { name: 'alpha', params: [], returnType: 'void', jsDoc: null };
    const methodB = { name: 'beta', params: [], returnType: 'string', jsDoc: null };

    const ifaceAB: InterfaceInfo = { ...iface1, methods: [methodA, methodB] };
    const ifaceBA: InterfaceInfo = { ...iface1, methods: [methodB, methodA] };

    expect(computeApiHash(makeSnapshot({ interfaces: [ifaceAB] }))).toBe(
      computeApiHash(makeSnapshot({ interfaces: [ifaceBA] }))
    );
  });
});

// ── computeContentHash ─────────────────────────────────────────────────────

describe('computeContentHash', () => {
  const files = [
    { path: 'src/a.ts', content: 'export const a = 1;' },
    { path: 'src/b.ts', content: 'export const b = 2;' },
  ];

  it('is deterministic — same input returns same hash', () => {
    expect(computeContentHash(files)).toBe(computeContentHash(files));
  });

  it('returns a 64-char hex string (SHA-256)', () => {
    expect(computeContentHash(files)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when file content changes', () => {
    const modified = [
      { path: 'src/a.ts', content: 'export const a = 99;' }, // changed
      { path: 'src/b.ts', content: 'export const b = 2;' },
    ];
    expect(computeContentHash(files)).not.toBe(computeContentHash(modified));
  });

  it('changes when a file is added', () => {
    const extra = [...files, { path: 'src/c.ts', content: 'export const c = 3;' }];
    expect(computeContentHash(files)).not.toBe(computeContentHash(extra));
  });

  it('is order-independent — reversed file list produces same hash', () => {
    const reversed = [...files].reverse();
    expect(computeContentHash(files)).toBe(computeContentHash(reversed));
  });

  it('handles empty file list', () => {
    const hash = computeContentHash([]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when only a path changes (not content)', () => {
    const original = [{ path: 'src/a.ts', content: 'const x = 1;' }];
    const renamed = [{ path: 'src/b.ts', content: 'const x = 1;' }];
    expect(computeContentHash(original)).not.toBe(computeContentHash(renamed));
  });
});
