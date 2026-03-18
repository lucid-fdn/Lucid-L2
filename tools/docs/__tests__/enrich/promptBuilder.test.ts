import { buildModulePrompt } from '../../src/enrich/promptBuilder';
import type { DomainSnapshot } from '../../src/extract/types';

const snapshot: DomainSnapshot = {
  domain: 'memory',
  sourcePath: 'engine/src/memory',
  interfaces: [
    {
      name: 'IMemoryStore',
      filePath: 'engine/src/memory/store/interface.ts',
      jsDoc: 'Primary storage contract for all memory types.',
      properties: [],
      methods: [
        {
          name: 'add',
          params: [{ name: 'entry', type: 'MemoryEntry', optional: false, defaultValue: null }],
          returnType: 'Promise<void>',
          jsDoc: null,
        },
      ],
      extends: [],
    },
  ],
  functions: [
    {
      name: 'getStoreForAgent',
      filePath: 'engine/src/memory/store/index.ts',
      jsDoc: 'Returns or creates the per-agent memory store.',
      params: [{ name: 'agentPassportId', type: 'string', optional: false, defaultValue: null }],
      returnType: 'IMemoryStore',
      isAsync: false,
    },
  ],
  types: [
    {
      name: 'MemoryLane',
      filePath: 'engine/src/memory/types.ts',
      jsDoc: null,
      kind: 'alias',
      definition: "'self' | 'user' | 'shared' | 'market'",
    },
  ],
  imports: [
    {
      fromDomain: 'memory',
      toDomain: 'anchoring',
      importedSymbols: ['AnchorDispatcher', 'AnchorResult'],
    },
  ],
  apiHash: 'abc123',
  contentHash: 'def456',
};

const sourceFiles = [
  {
    path: 'engine/src/memory/store/interface.ts',
    content: 'export interface IMemoryStore { add(entry: MemoryEntry): Promise<void>; }',
  },
  {
    path: 'engine/src/memory/service.ts',
    content: 'export class MemoryService { constructor(private store: IMemoryStore) {} }',
  },
];

describe('buildModulePrompt', () => {
  let result: ReturnType<typeof buildModulePrompt>;

  beforeAll(() => {
    result = buildModulePrompt(snapshot, sourceFiles);
  });

  it('returns both system and user messages', () => {
    expect(result).toHaveProperty('system');
    expect(result).toHaveProperty('user');
    expect(typeof result.system).toBe('string');
    expect(typeof result.user).toBe('string');
  });

  it('system prompt contains "senior engineer"', () => {
    expect(result.system).toContain('senior engineer');
  });

  it('system prompt contains "NEVER invent"', () => {
    expect(result.system).toContain('NEVER invent');
  });

  it('user prompt contains EXTRACTED FACTS with interface name', () => {
    expect(result.user).toContain('EXTRACTED FACTS');
    expect(result.user).toContain('IMemoryStore');
  });

  it('user prompt contains EXTRACTED FACTS with function name', () => {
    expect(result.user).toContain('EXTRACTED FACTS');
    expect(result.user).toContain('getStoreForAgent');
  });

  it('user prompt contains SOURCE EXCERPTS with file content', () => {
    expect(result.user).toContain('SOURCE EXCERPTS');
    expect(result.user).toContain('engine/src/memory/store/interface.ts');
    expect(result.user).toContain('IMemoryStore');
  });

  it('user prompt requests exactly 4 sections: Purpose, Architecture, Data Flow, Patterns & Gotchas', () => {
    expect(result.user).toContain('Purpose');
    expect(result.user).toContain('Architecture');
    expect(result.user).toContain('Data Flow');
    expect(result.user).toContain('Patterns & Gotchas');
  });
});
