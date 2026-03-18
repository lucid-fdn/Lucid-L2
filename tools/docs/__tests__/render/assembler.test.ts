import { assembleModuleDoc } from '../../src/render/assembler';
import type { AssembleParams } from '../../src/render/assembler';

const SAMPLE_AI_CONTENT = `## Purpose
Manages episodic, semantic, and procedural memory for AI agents.

## Architecture
Three-layer design: store, service, and REST routes.

## Data Flow
Agent writes → MemoryService → IMemoryStore → hash chain → receipt link.

## Patterns & Gotchas
Always null-guard anchor dispatch results. Use WAL mode for SQLite stores.`;

const SAMPLE_KEY_INTERFACES = `## Key Interfaces

| Interface | File | Role |
|-----------|------|------|
| \`IMemoryStore\` | \`memory/store/interface.ts\` | Storage backend contract |`;

const SAMPLE_CROSS_DEPS = `## Cross-Domain Dependencies

| Direction | Domain | Symbols | Purpose |
|-----------|--------|---------|---------|
| imports | shared | \`sha256\`, \`canonicalJson\` | — |`;

function makeParams(overrides: Partial<AssembleParams> = {}): AssembleParams {
  return {
    domain: 'memory',
    commitSha: 'abc1234',
    aiContent: SAMPLE_AI_CONTENT,
    keyInterfacesSection: SAMPLE_KEY_INTERFACES,
    crossDepsSection: SAMPLE_CROSS_DEPS,
    symbolWarnings: [],
    ...overrides,
  };
}

describe('assembleModuleDoc', () => {
  it('produces valid markdown with all sections present', () => {
    const result = assembleModuleDoc(makeParams());

    expect(result).toContain('# Memory');
    expect(result).toContain('## Purpose');
    expect(result).toContain('## Architecture');
    expect(result).toContain('## Data Flow');
    expect(result).toContain('## Key Interfaces');
    expect(result).toContain('## Cross-Domain Dependencies');
    expect(result).toContain('## Patterns & Gotchas');
  });

  it('capitalizes the domain name in the title', () => {
    const result = assembleModuleDoc(makeParams({ domain: 'memory' }));
    expect(result).toContain('# Memory');
  });

  it('capitalizes single-char domain', () => {
    const result = assembleModuleDoc(makeParams({ domain: 'a' }));
    expect(result).toContain('# A');
  });

  it('does not double-capitalize an already-capitalized domain', () => {
    const result = assembleModuleDoc(makeParams({ domain: 'Identity' }));
    expect(result).toContain('# Identity');
    expect(result).not.toContain('# IIdentity');
  });

  it('includes the generation comment with commit SHA', () => {
    const result = assembleModuleDoc(makeParams({ commitSha: 'deadbeef' }));
    expect(result).toContain('<!-- generated: commit deadbeef,');
  });

  it('includes an ISO timestamp in the generation comment', () => {
    const result = assembleModuleDoc(makeParams());
    // ISO 8601 pattern: YYYY-MM-DDTHH:MM:SS.sssZ
    expect(result).toMatch(/<!-- generated: commit \S+, \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('includes symbol warnings as an HTML comment when warnings are present', () => {
    const result = assembleModuleDoc(
      makeParams({ symbolWarnings: ['FooService', 'BarStore'] }),
    );
    expect(result).toContain('<!-- WARNING: unverified identifiers: FooService, BarStore -->');
  });

  it('omits the warning comment when symbolWarnings is empty', () => {
    const result = assembleModuleDoc(makeParams({ symbolWarnings: [] }));
    expect(result).not.toContain('<!-- WARNING:');
  });

  it('omits the warning comment when symbolWarnings is not provided via default', () => {
    const result = assembleModuleDoc(makeParams());
    expect(result).not.toContain('WARNING');
  });

  it('extracts Purpose content from AI response', () => {
    const result = assembleModuleDoc(makeParams());
    expect(result).toContain('Manages episodic, semantic, and procedural memory for AI agents.');
  });

  it('extracts Architecture content from AI response', () => {
    const result = assembleModuleDoc(makeParams());
    expect(result).toContain('Three-layer design: store, service, and REST routes.');
  });

  it('extracts Data Flow content from AI response', () => {
    const result = assembleModuleDoc(makeParams());
    expect(result).toContain('Agent writes → MemoryService → IMemoryStore → hash chain → receipt link.');
  });

  it('extracts Patterns & Gotchas content from AI response', () => {
    const result = assembleModuleDoc(makeParams());
    expect(result).toContain('Always null-guard anchor dispatch results.');
  });

  it('embeds the deterministic keyInterfacesSection verbatim', () => {
    const result = assembleModuleDoc(makeParams());
    expect(result).toContain('`IMemoryStore`');
    expect(result).toContain('Storage backend contract');
  });

  it('embeds the deterministic crossDepsSection verbatim', () => {
    const result = assembleModuleDoc(makeParams());
    expect(result).toContain('| imports | shared | `sha256`, `canonicalJson` | — |');
  });

  it('orders sections: Purpose before Architecture before Data Flow before Key Interfaces before Cross-Domain Deps before Patterns & Gotchas', () => {
    const result = assembleModuleDoc(makeParams());

    const purposeIdx = result.indexOf('## Purpose');
    const architectureIdx = result.indexOf('## Architecture');
    const dataFlowIdx = result.indexOf('## Data Flow');
    const keyIfaceIdx = result.indexOf('## Key Interfaces');
    const crossDepsIdx = result.indexOf('## Cross-Domain Dependencies');
    const patternsIdx = result.indexOf('## Patterns & Gotchas');

    expect(purposeIdx).toBeLessThan(architectureIdx);
    expect(architectureIdx).toBeLessThan(dataFlowIdx);
    expect(dataFlowIdx).toBeLessThan(keyIfaceIdx);
    expect(keyIfaceIdx).toBeLessThan(crossDepsIdx);
    expect(crossDepsIdx).toBeLessThan(patternsIdx);
  });

  it('generation comment appears before the title', () => {
    const result = assembleModuleDoc(makeParams({ commitSha: 'abc1234' }));
    const commentIdx = result.indexOf('<!-- generated:');
    const titleIdx = result.indexOf('# Memory');

    expect(commentIdx).toBeLessThan(titleIdx);
  });

  it('warning comment appears before the title when warnings present', () => {
    const result = assembleModuleDoc(
      makeParams({ symbolWarnings: ['Ghost'] }),
    );
    const warningIdx = result.indexOf('<!-- WARNING:');
    const titleIdx = result.indexOf('# Memory');

    expect(warningIdx).toBeLessThan(titleIdx);
  });

  it('handles empty AI content gracefully', () => {
    const result = assembleModuleDoc(makeParams({ aiContent: '' }));

    // All section headings must still appear
    expect(result).toContain('## Purpose');
    expect(result).toContain('## Architecture');
    expect(result).toContain('## Data Flow');
    expect(result).toContain('## Patterns & Gotchas');
  });

  it('handles AI content with only some sections', () => {
    const partialAi = `## Purpose\nHandles payments.\n\n## Patterns & Gotchas\nNull-guard everything.`;
    const result = assembleModuleDoc(makeParams({ aiContent: partialAi }));

    expect(result).toContain('Handles payments.');
    expect(result).toContain('Null-guard everything.');
    // Missing sections produce empty content but headings still appear
    expect(result).toContain('## Architecture');
    expect(result).toContain('## Data Flow');
  });
});
