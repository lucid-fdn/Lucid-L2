import { renderReference } from '../../src/render/reference';
import type { DomainSnapshot } from '../../src/extract/types';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const FIXTURE_SNAPSHOT: DomainSnapshot = {
  domain: 'memory',
  sourcePath: 'engine/src/memory',
  apiHash: 'abc123',
  contentHash: 'def456',
  imports: [],
  interfaces: [
    {
      name: 'IMemoryStore',
      filePath: 'engine/src/memory/store/interface.ts',
      jsDoc: 'Storage backend contract for memory entries.',
      properties: [
        {
          name: 'storeId',
          type: 'string',
          optional: false,
          jsDoc: 'Unique identifier for the store.',
        },
        {
          name: 'maxEntries',
          type: 'number',
          optional: true,
          jsDoc: null,
        },
      ],
      methods: [
        {
          name: 'write',
          params: [
            { name: 'entry', type: 'MemoryEntry', optional: false, defaultValue: null },
          ],
          returnType: 'Promise<void>',
          jsDoc: 'Persist a memory entry.',
        },
        {
          name: 'read',
          params: [
            { name: 'id', type: 'string', optional: false, defaultValue: null },
            { name: 'namespace', type: 'string', optional: true, defaultValue: '"default"' },
          ],
          returnType: 'Promise<MemoryEntry | null>',
          jsDoc: null,
        },
      ],
      extends: ['IBaseStore'],
    },
    {
      name: 'IEmbeddingProvider',
      filePath: 'engine/src/memory/embedding/interface.ts',
      jsDoc: null,
      properties: [],
      methods: [
        {
          name: 'embed',
          params: [{ name: 'text', type: 'string', optional: false, defaultValue: null }],
          returnType: 'Promise<number[]>',
          jsDoc: 'Produce a vector embedding for the given text.',
        },
      ],
      extends: [],
    },
  ],
  functions: [
    {
      name: 'buildQueryFilter',
      filePath: 'engine/src/memory/query.ts',
      jsDoc: 'Build a typed query filter from raw input.',
      params: [
        { name: 'input', type: 'QueryInput', optional: false, defaultValue: null },
        { name: 'limit', type: 'number', optional: true, defaultValue: '20' },
      ],
      returnType: 'QueryFilter',
      isAsync: false,
    },
    {
      name: 'archiveSnapshot',
      filePath: 'engine/src/memory/archivePipeline.ts',
      jsDoc: 'Upload a memory snapshot to DePIN storage.',
      params: [
        { name: 'agentId', type: 'string', optional: false, defaultValue: null },
        { name: 'options', type: 'ArchiveOptions', optional: true, defaultValue: null },
      ],
      returnType: 'Promise<AnchorResult | null>',
      isAsync: true,
    },
  ],
  types: [
    {
      name: 'MemoryLane',
      filePath: 'engine/src/memory/types.ts',
      jsDoc: 'Semantic partition for memory entries.',
      kind: 'alias',
      definition: '"self" | "user" | "shared" | "market"',
    },
    {
      name: 'CompactionMode',
      filePath: 'engine/src/memory/compactionPipeline.ts',
      jsDoc: 'Tier of compaction to apply.',
      kind: 'enum',
      definition: 'warm, cold, full',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function render(
  overrides: Partial<DomainSnapshot> = {},
  domain = 'Memory',
  sha = 'deadbeef',
): string {
  return renderReference(domain, { ...FIXTURE_SNAPSHOT, ...overrides }, sha);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderReference', () => {
  // --- Header ---

  it('includes a generation comment with the commit SHA', () => {
    const result = render({}, 'Memory', 'abc1234');
    expect(result).toContain('<!-- generated: commit abc1234,');
  });

  it('includes an ISO timestamp in the generation comment', () => {
    const result = render();
    expect(result).toMatch(
      /<!-- generated: commit \S+, \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it('renders the domain title as "X — Interface Reference"', () => {
    const result = render({}, 'Memory');
    expect(result).toContain('# Memory — Interface Reference');
  });

  it('uses the provided domain string verbatim in the title', () => {
    const result = render({}, 'compute');
    expect(result).toContain('# compute — Interface Reference');
  });

  it('generation comment appears before the title', () => {
    const result = render();
    expect(result.indexOf('<!-- generated:')).toBeLessThan(
      result.indexOf('# Memory — Interface Reference'),
    );
  });

  // --- Section ordering ---

  it('orders sections: Interfaces → Functions → Types → Enums', () => {
    const result = render();
    const ifacesIdx = result.indexOf('## Interfaces');
    const functionsIdx = result.indexOf('## Functions');
    const typesIdx = result.indexOf('## Types');
    const enumsIdx = result.indexOf('## Enums');

    expect(ifacesIdx).toBeLessThan(functionsIdx);
    expect(functionsIdx).toBeLessThan(typesIdx);
    expect(typesIdx).toBeLessThan(enumsIdx);
  });

  // --- Interfaces section ---

  it('renders ## Interfaces heading', () => {
    const result = render();
    expect(result).toContain('## Interfaces');
  });

  it('renders interface heading and file path', () => {
    const result = render();
    expect(result).toContain('### IMemoryStore');
    expect(result).toContain('> `engine/src/memory/store/interface.ts`');
  });

  it('renders first JSDoc line as description', () => {
    const result = render();
    expect(result).toContain('Storage backend contract for memory entries.');
  });

  it('renders the Properties table header', () => {
    const result = render();
    expect(result).toContain('| Property | Type | Optional | Description |');
  });

  it('renders property rows with correct columns', () => {
    const result = render();
    expect(result).toContain('| `storeId` | `string` | no |');
    expect(result).toContain('| `maxEntries` | `number` | yes |');
  });

  it('sorts properties alphabetically', () => {
    const result = render();
    const maxIdx = result.indexOf('`maxEntries`');
    const storeIdx = result.indexOf('`storeId`');
    // "maxEntries" < "storeId" alphabetically
    expect(maxIdx).toBeLessThan(storeIdx);
  });

  it('renders the Methods table header', () => {
    const result = render();
    expect(result).toContain('| Method | Params | Return Type | Description |');
  });

  it('renders method row with return type and description', () => {
    const result = render();
    expect(result).toContain('`write`');
    expect(result).toContain('`Promise<void>`');
    expect(result).toContain('Persist a memory entry.');
  });

  it('formats method params as `name`?: `Type`', () => {
    const result = render();
    // read has optional namespace param
    expect(result).toContain('`namespace`?: `string`');
  });

  it('formats required params without question mark', () => {
    const result = render();
    expect(result).toContain('`entry`: `MemoryEntry`');
  });

  it('sorts methods alphabetically', () => {
    const result = render();
    const readIdx = result.indexOf('`read`');
    const writeIdx = result.indexOf('`write`');
    // "read" < "write"
    expect(readIdx).toBeLessThan(writeIdx);
  });

  it('renders **Extends:** with base names when extends is non-empty', () => {
    const result = render();
    expect(result).toContain('**Extends:** `IBaseStore`');
  });

  it('renders **Extends:** — when extends is empty', () => {
    const result = render();
    expect(result).toContain('**Extends:** —');
  });

  it('sorts interfaces alphabetically', () => {
    const result = render();
    const embeddingIdx = result.indexOf('### IEmbeddingProvider');
    const storeIdx = result.indexOf('### IMemoryStore');
    // "IEmbeddingProvider" < "IMemoryStore"
    expect(embeddingIdx).toBeLessThan(storeIdx);
  });

  it('omits ## Interfaces when there are no interfaces', () => {
    const result = render({ interfaces: [] });
    expect(result).not.toContain('## Interfaces');
  });

  // --- Functions section ---

  it('renders ## Functions heading', () => {
    const result = render();
    expect(result).toContain('## Functions');
  });

  it('renders function heading and file path', () => {
    const result = render();
    expect(result).toContain('### buildQueryFilter');
    expect(result).toContain('> `engine/src/memory/query.ts`');
  });

  it('renders first JSDoc line for function', () => {
    const result = render();
    expect(result).toContain('Build a typed query filter from raw input.');
  });

  it('renders params table with correct columns', () => {
    const result = render();
    expect(result).toContain('| Param | Type | Optional | Default |');
  });

  it('renders param row with default value', () => {
    const result = render();
    expect(result).toContain('| `limit` | `number` | yes | `20` |');
  });

  it('renders param row with — when no default value', () => {
    const result = render();
    expect(result).toContain('| `input` | `QueryInput` | no | — |');
  });

  it('renders **Returns:** with return type', () => {
    const result = render();
    expect(result).toContain('**Returns:** `QueryFilter`');
  });

  it('renders **Async:** no for synchronous function', () => {
    const result = render();
    expect(result).toContain('**Async:** no');
  });

  it('renders **Async:** yes for async function', () => {
    const result = render();
    expect(result).toContain('**Async:** yes');
  });

  it('renders async function return type', () => {
    const result = render();
    expect(result).toContain('**Returns:** `Promise<AnchorResult | null>`');
  });

  it('sorts functions alphabetically', () => {
    const result = render();
    const archiveIdx = result.indexOf('### archiveSnapshot');
    const buildIdx = result.indexOf('### buildQueryFilter');
    // "archiveSnapshot" < "buildQueryFilter"
    expect(archiveIdx).toBeLessThan(buildIdx);
  });

  it('omits ## Functions when there are no functions', () => {
    const result = render({ functions: [] });
    expect(result).not.toContain('## Functions');
  });

  // --- Types section ---

  it('renders ## Types heading for alias types', () => {
    const result = render();
    expect(result).toContain('## Types');
  });

  it('renders type alias heading and file path', () => {
    const result = render();
    expect(result).toContain('### MemoryLane');
    expect(result).toContain('> `engine/src/memory/types.ts`');
  });

  it('renders type alias JSDoc', () => {
    const result = render();
    expect(result).toContain('Semantic partition for memory entries.');
  });

  it('renders type alias definition in a code block', () => {
    const result = render();
    expect(result).toContain('```ts');
    expect(result).toContain('type MemoryLane = "self" | "user" | "shared" | "market"');
  });

  it('omits ## Types when there are no alias types', () => {
    const result = render({
      types: [
        {
          name: 'CompactionMode',
          filePath: 'x.ts',
          jsDoc: null,
          kind: 'enum',
          definition: 'warm, cold',
        },
      ],
    });
    expect(result).not.toContain('## Types');
  });

  // --- Enums section ---

  it('renders ## Enums heading for enum types', () => {
    const result = render();
    expect(result).toContain('## Enums');
  });

  it('renders enum heading and file path', () => {
    const result = render();
    expect(result).toContain('### CompactionMode');
    expect(result).toContain('> `engine/src/memory/compactionPipeline.ts`');
  });

  it('renders enum JSDoc', () => {
    const result = render();
    expect(result).toContain('Tier of compaction to apply.');
  });

  it('renders enum members as a value table (not a code block)', () => {
    const result = render();
    expect(result).toContain('| Value | Description |');
    expect(result).toContain('| `warm` |');
    expect(result).toContain('| `cold` |');
    expect(result).toContain('| `full` |');
  });

  it('does NOT render enum definition in a code block', () => {
    const result = render();
    // The enum section must not contain a ts code fence
    const enumIdx = result.indexOf('## Enums');
    const afterEnums = result.slice(enumIdx);
    expect(afterEnums).not.toContain('```ts');
  });

  it('splits enum definition on ", " to get individual members', () => {
    const result = render({
      types: [
        {
          name: 'Status',
          filePath: 'status.ts',
          jsDoc: null,
          kind: 'enum',
          definition: 'pending, running, stopped, failed',
        },
      ],
    });
    expect(result).toContain('| `pending` |');
    expect(result).toContain('| `running` |');
    expect(result).toContain('| `stopped` |');
    expect(result).toContain('| `failed` |');
  });

  it('omits ## Enums when there are no enum types', () => {
    const result = render({
      types: [
        {
          name: 'MemoryLane',
          filePath: 'x.ts',
          jsDoc: null,
          kind: 'alias',
          definition: '"self" | "user"',
        },
      ],
    });
    expect(result).not.toContain('## Enums');
  });

  // --- Empty sections omission ---

  it('omits all sections when snapshot is empty', () => {
    const result = render({ interfaces: [], functions: [], types: [] });
    expect(result).not.toContain('## Interfaces');
    expect(result).not.toContain('## Functions');
    expect(result).not.toContain('## Types');
    expect(result).not.toContain('## Enums');
  });

  it('still renders the header when all sections are empty', () => {
    const result = render({ interfaces: [], functions: [], types: [] }, 'Payment', 'fff0000');
    expect(result).toContain('<!-- generated: commit fff0000,');
    expect(result).toContain('# Payment — Interface Reference');
  });

  // --- Alphabetical sorting within sections ---

  it('sorts types alphabetically', () => {
    const result = render({
      types: [
        { name: 'ZType', filePath: 'z.ts', jsDoc: null, kind: 'alias', definition: 'string' },
        { name: 'AType', filePath: 'a.ts', jsDoc: null, kind: 'alias', definition: 'number' },
      ],
    });
    expect(result.indexOf('### AType')).toBeLessThan(result.indexOf('### ZType'));
  });

  it('sorts enums alphabetically', () => {
    const result = render({
      types: [
        { name: 'ZEnum', filePath: 'z.ts', jsDoc: null, kind: 'enum', definition: 'a, b' },
        { name: 'AEnum', filePath: 'a.ts', jsDoc: null, kind: 'enum', definition: 'x, y' },
      ],
    });
    expect(result.indexOf('### AEnum')).toBeLessThan(result.indexOf('### ZEnum'));
  });
});
