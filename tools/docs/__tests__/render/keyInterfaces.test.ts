import { renderKeyInterfaces } from '../../src/render/keyInterfaces';
import type { InterfaceInfo, TypeInfo } from '../../src/extract/types';

function makeInterface(
  name: string,
  filePath: string,
  jsDoc: string | null = null,
): InterfaceInfo {
  return { name, filePath, jsDoc, properties: [], methods: [], extends: [] };
}

function makeType(
  name: string,
  filePath: string,
  kind: 'alias' | 'enum',
  jsDoc: string | null = null,
  definition = '',
): TypeInfo {
  return { name, filePath, jsDoc, kind, definition };
}

describe('renderKeyInterfaces', () => {
  it('renders a table from a list of interfaces', () => {
    const interfaces: InterfaceInfo[] = [
      makeInterface('IStore', 'store/interface.ts', 'Storage backend contract'),
    ];
    const result = renderKeyInterfaces(interfaces, []);

    expect(result).toContain('## Key Interfaces');
    expect(result).toContain('| Interface | File | Role |');
    expect(result).toContain('`IStore`');
    expect(result).toContain('`store/interface.ts`');
    expect(result).toContain('Storage backend contract');
  });

  it('uses first JSDoc line as role', () => {
    const interfaces: InterfaceInfo[] = [
      makeInterface('IStore', 'store.ts', 'First line of doc\nSecond line of doc'),
    ];
    const result = renderKeyInterfaces(interfaces, []);

    expect(result).toContain('First line of doc');
    expect(result).not.toContain('Second line of doc');
  });

  it('shows "—" when no JSDoc', () => {
    const interfaces: InterfaceInfo[] = [
      makeInterface('IBlank', 'blank.ts', null),
    ];
    const result = renderKeyInterfaces(interfaces, []);

    // The role cell should be the em-dash placeholder
    expect(result).toContain('| `IBlank` | `blank.ts` | — |');
  });

  it('sorts interfaces alphabetically by name', () => {
    const interfaces: InterfaceInfo[] = [
      makeInterface('IZebra', 'z.ts'),
      makeInterface('IAlpha', 'a.ts'),
      makeInterface('IMiddle', 'm.ts'),
    ];
    const result = renderKeyInterfaces(interfaces, []);
    const alphaIdx = result.indexOf('IAlpha');
    const middleIdx = result.indexOf('IMiddle');
    const zebraIdx = result.indexOf('IZebra');

    expect(alphaIdx).toBeLessThan(middleIdx);
    expect(middleIdx).toBeLessThan(zebraIdx);
  });

  it('includes notable types (those with JSDoc) in a Key Types sub-table', () => {
    const interfaces: InterfaceInfo[] = [
      makeInterface('IStore', 'store.ts', 'Storage backend'),
    ];
    const types: TypeInfo[] = [
      makeType('StorageTier', 'types.ts', 'alias', 'Storage tier classification', "'permanent' | 'evolving'"),
      makeType('NoDocType', 'types.ts', 'alias', null),
    ];
    const result = renderKeyInterfaces(interfaces, types);

    expect(result).toContain('### Key Types');
    expect(result).toContain('| Type | File | Kind | Description |');
    expect(result).toContain('`StorageTier`');
    expect(result).toContain('Storage tier classification');
    // Type without JSDoc should not appear
    expect(result).not.toContain('`NoDocType`');
  });

  it('omits Key Types section when no types have JSDoc', () => {
    const interfaces: InterfaceInfo[] = [makeInterface('IFoo', 'foo.ts', 'Foo contract')];
    const types: TypeInfo[] = [
      makeType('Undocumented', 'types.ts', 'enum', null),
    ];
    const result = renderKeyInterfaces(interfaces, types);

    expect(result).not.toContain('### Key Types');
    expect(result).not.toContain('| Type |');
  });

  it('omits Key Types section when types array is empty', () => {
    const interfaces: InterfaceInfo[] = [makeInterface('IFoo', 'foo.ts', 'Foo')];
    const result = renderKeyInterfaces(interfaces, []);

    expect(result).not.toContain('### Key Types');
  });

  it('renders correct kind column for types', () => {
    const interfaces: InterfaceInfo[] = [];
    const types: TypeInfo[] = [
      makeType('CompactionMode', 'types.ts', 'enum', 'Compaction mode'),
      makeType('StorageTier', 'types.ts', 'alias', 'Storage tier'),
    ];
    const result = renderKeyInterfaces(interfaces, types);

    expect(result).toContain('| `CompactionMode` | `types.ts` | enum | Compaction mode |');
    expect(result).toContain('| `StorageTier` | `types.ts` | alias | Storage tier |');
  });
});
