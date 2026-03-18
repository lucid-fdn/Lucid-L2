import { generateDomainSummary, updateClaudeMdSections } from '../../src/render/claudeMd';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_MODULE_DOC = `<!-- generated: commit abc1234, 2026-03-18T00:00:00.000Z -->
# Memory

## Purpose
Manages episodic, semantic, and procedural memory for AI agents.

## Architecture
Three-layer design: store, service, and REST routes.

Second architecture paragraph with more detail.

## Data Flow
Agent writes → MemoryService → IMemoryStore → hash chain → receipt link.

## Key Interfaces

| Interface | File | Role |
|-----------|------|------|
| \`IMemoryStore\` | \`memory/store/interface.ts\` | Storage backend contract |
| \`IEmbeddingProvider\` | \`memory/embedding/index.ts\` | Embedding backend contract |

## Cross-Domain Dependencies

| Direction | Domain | Symbols | Purpose |
|-----------|--------|---------|---------|
| imports | shared | \`sha256\`, \`canonicalJson\` | — |
| exports to | anchoring | \`ArchivePipeline\` | — |

## Patterns & Gotchas
Always null-guard anchor dispatch results. Use WAL mode for SQLite stores.`;

const SAMPLE_MODULE_DOC_PURPOSE_LAST = `<!-- generated: commit abc1234, 2026-03-18T00:00:00.000Z -->
# Payment

## Architecture
Handles x402 payment flows.

## Purpose
Manages all payment processing for agents.`;

// ---------------------------------------------------------------------------
// generateDomainSummary
// ---------------------------------------------------------------------------

describe('generateDomainSummary', () => {
  it('generates summary from module doc with Purpose and Architecture sections', () => {
    const result = generateDomainSummary(SAMPLE_MODULE_DOC);

    expect(result).toContain('Manages episodic, semantic, and procedural memory for AI agents.');
    expect(result).toContain('Three-layer design: store, service, and REST routes.');
  });

  it('includes interface names from Key Interfaces table', () => {
    const result = generateDomainSummary(SAMPLE_MODULE_DOC);

    expect(result).toContain('IMemoryStore');
    expect(result).toContain('IEmbeddingProvider');
  });

  it('includes domain names from Cross-Domain Dependencies table', () => {
    const result = generateDomainSummary(SAMPLE_MODULE_DOC);

    expect(result).toContain('shared');
    expect(result).toContain('anchoring');
  });

  it('is condensed (under 2000 characters)', () => {
    const result = generateDomainSummary(SAMPLE_MODULE_DOC);

    expect(result.length).toBeLessThan(2000);
  });

  it('only includes the first paragraph of Architecture (not subsequent paragraphs)', () => {
    const result = generateDomainSummary(SAMPLE_MODULE_DOC);

    expect(result).toContain('Three-layer design: store, service, and REST routes.');
    expect(result).not.toContain('Second architecture paragraph with more detail.');
  });

  it('returns a non-empty string for a well-formed module doc', () => {
    const result = generateDomainSummary(SAMPLE_MODULE_DOC);

    expect(result.trim().length).toBeGreaterThan(0);
  });

  it('handles module doc with no Key Interfaces section gracefully', () => {
    const doc = `## Purpose\nHandles payments.\n\n## Architecture\nSingle-layer design.`;
    const result = generateDomainSummary(doc);

    expect(result).toContain('Handles payments.');
    expect(result).not.toContain('Key Interfaces');
  });

  it('handles module doc with no Cross-Domain Dependencies section gracefully', () => {
    const doc = `## Purpose\nHandles payments.\n\n## Architecture\nSingle-layer design.`;
    const result = generateDomainSummary(doc);

    expect(result).toContain('Handles payments.');
    expect(result).not.toContain('Cross-Domain');
  });

  it('handles empty module doc gracefully', () => {
    const result = generateDomainSummary('');

    expect(typeof result).toBe('string');
  });

  it('handles case where Purpose is the last section (no subsequent ## heading)', () => {
    const result = generateDomainSummary(SAMPLE_MODULE_DOC_PURPOSE_LAST);

    expect(result).toContain('Manages all payment processing for agents.');
  });

  it('does not include raw markdown table syntax in the summary', () => {
    const result = generateDomainSummary(SAMPLE_MODULE_DOC);

    // The interface table header row should not appear verbatim
    expect(result).not.toContain('|-----------|');
  });
});

// ---------------------------------------------------------------------------
// updateClaudeMdSections
// ---------------------------------------------------------------------------

const SENTINEL_START_MEMORY = '<!-- docs:auto:start domain=memory -->';
const SENTINEL_END_MEMORY = '<!-- docs:auto:end domain=memory -->';
const SENTINEL_START_PAYMENT = '<!-- docs:auto:start domain=payment -->';
const SENTINEL_END_PAYMENT = '<!-- docs:auto:end domain=payment -->';

function makeClaudeMd(
  memoryContent = 'old memory content',
  paymentContent = 'old payment content',
): string {
  return [
    '# Lucid Layer',
    '',
    '## Hand-written section',
    'This content must not be touched.',
    '',
    '## Memory',
    SENTINEL_START_MEMORY,
    memoryContent,
    SENTINEL_END_MEMORY,
    '',
    '## Payment',
    SENTINEL_START_PAYMENT,
    paymentContent,
    SENTINEL_END_PAYMENT,
    '',
    '## Another hand-written section',
    'Also must not be touched.',
  ].join('\n');
}

describe('updateClaudeMdSections', () => {
  it('replaces content between sentinel markers', () => {
    const claudeMd = makeClaudeMd('old memory content');
    const result = updateClaudeMdSections(claudeMd, { memory: 'new memory summary' });

    expect(result).toContain('new memory summary');
    expect(result).not.toContain('old memory content');
  });

  it('preserves content outside sentinels', () => {
    const claudeMd = makeClaudeMd('old memory content');
    const result = updateClaudeMdSections(claudeMd, { memory: 'new memory summary' });

    expect(result).toContain('# Lucid Layer');
    expect(result).toContain('## Hand-written section');
    expect(result).toContain('This content must not be touched.');
    expect(result).toContain('## Another hand-written section');
    expect(result).toContain('Also must not be touched.');
  });

  it('handles multiple domain sentinels independently', () => {
    const claudeMd = makeClaudeMd('old memory content', 'old payment content');
    const result = updateClaudeMdSections(claudeMd, {
      memory: 'new memory summary',
      payment: 'new payment summary',
    });

    expect(result).toContain('new memory summary');
    expect(result).toContain('new payment summary');
    expect(result).not.toContain('old memory content');
    expect(result).not.toContain('old payment content');
  });

  it('skips domains with no sentinel and returns the file unchanged for those domains', () => {
    const claudeMd = makeClaudeMd('old memory content');
    const result = updateClaudeMdSections(claudeMd, {
      memory: 'new memory summary',
      nonexistent: 'this should be ignored',
    });

    expect(result).toContain('new memory summary');
    expect(result).not.toContain('this should be ignored');
    // nonexistent sentinel should not appear
    expect(result).not.toContain('docs:auto:start domain=nonexistent');
  });

  it('returns the file completely unchanged when no sentinels match', () => {
    const claudeMd = makeClaudeMd('old memory content');
    const result = updateClaudeMdSections(claudeMd, {
      nonexistent: 'ghost content',
    });

    expect(result).toBe(claudeMd);
  });

  it('preserves the sentinel markers themselves', () => {
    const claudeMd = makeClaudeMd('old memory content');
    const result = updateClaudeMdSections(claudeMd, { memory: 'new memory summary' });

    expect(result).toContain(SENTINEL_START_MEMORY);
    expect(result).toContain(SENTINEL_END_MEMORY);
  });

  it('preserves sentinel markers for untouched domains', () => {
    const claudeMd = makeClaudeMd('old memory content', 'old payment content');
    const result = updateClaudeMdSections(claudeMd, { memory: 'new memory summary' });

    // Payment sentinels should be untouched
    expect(result).toContain(SENTINEL_START_PAYMENT);
    expect(result).toContain(SENTINEL_END_PAYMENT);
    expect(result).toContain('old payment content');
  });

  it('handles multi-line replacement content correctly', () => {
    const claudeMd = makeClaudeMd('single line');
    const multilineSummary = '**Purpose:**\nManages memory.\n\n**Key Interfaces:** IMemoryStore';
    const result = updateClaudeMdSections(claudeMd, { memory: multilineSummary });

    expect(result).toContain('**Purpose:**');
    expect(result).toContain('Manages memory.');
    expect(result).toContain('**Key Interfaces:** IMemoryStore');
  });

  it('handles empty replacement content', () => {
    const claudeMd = makeClaudeMd('old memory content');
    const result = updateClaudeMdSections(claudeMd, { memory: '' });

    expect(result).toContain(SENTINEL_START_MEMORY);
    expect(result).toContain(SENTINEL_END_MEMORY);
    expect(result).not.toContain('old memory content');
  });

  it('handles empty summaries record (returns file unchanged)', () => {
    const claudeMd = makeClaudeMd('old memory content');
    const result = updateClaudeMdSections(claudeMd, {});

    expect(result).toBe(claudeMd);
  });

  it('handles domain names with special regex characters in domain name', () => {
    const specialDomain = 'my.domain';
    const startMarker = `<!-- docs:auto:start domain=${specialDomain} -->`;
    const endMarker = `<!-- docs:auto:end domain=${specialDomain} -->`;
    const claudeMd = [
      '# Header',
      startMarker,
      'old content',
      endMarker,
    ].join('\n');

    const result = updateClaudeMdSections(claudeMd, { [specialDomain]: 'new content' });

    expect(result).toContain('new content');
    expect(result).not.toContain('old content');
    expect(result).toContain(startMarker);
    expect(result).toContain(endMarker);
  });
});
