import { parseConventionalCommits, renderChangelog } from '../../src/render/changelog';
import type { ParsedCommit } from '../../src/render/changelog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLog(...lines: string[]): string {
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// parseConventionalCommits
// ---------------------------------------------------------------------------

describe('parseConventionalCommits', () => {
  it('parses standard feat(scope): description format', () => {
    const log = makeLog('abc1234|feat(memory): add recall|');
    const commits = parseConventionalCommits(log);

    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject<Partial<ParsedCommit>>({
      hash: 'abc1234',
      type: 'feat',
      scope: 'memory',
      description: 'add recall',
      breaking: false,
      breakingNote: null,
    });
  });

  it('parses fix, refactor, perf, test, docs, chore, ci, build types', () => {
    const types = ['fix', 'refactor', 'perf', 'test', 'docs', 'chore', 'ci', 'build'];
    for (const t of types) {
      const log = makeLog(`aaa0001|${t}(scope): some change|`);
      const commits = parseConventionalCommits(log);
      expect(commits).toHaveLength(1);
      expect(commits[0].type).toBe(t);
    }
  });

  it('handles ! breaking marker on the type', () => {
    const log = makeLog('bcd2345|fix!: remove legacy endpoint|');
    const commits = parseConventionalCommits(log);

    expect(commits).toHaveLength(1);
    expect(commits[0].breaking).toBe(true);
    expect(commits[0].type).toBe('fix');
    expect(commits[0].scope).toBeNull();
  });

  it('handles ! breaking marker with scope — type!(scope): desc', () => {
    const log = makeLog('cde3456|feat!(memory): new recall API|');
    const commits = parseConventionalCommits(log);

    expect(commits).toHaveLength(1);
    expect(commits[0].breaking).toBe(true);
    expect(commits[0].scope).toBe('memory');
  });

  it('detects BREAKING CHANGE: footer in body', () => {
    const log = makeLog('def4567|feat(epoch): v2 anchoring|BREAKING CHANGE: removed v1 endpoint');
    const commits = parseConventionalCommits(log);

    expect(commits).toHaveLength(1);
    expect(commits[0].breaking).toBe(true);
    expect(commits[0].breakingNote).toBe('removed v1 endpoint');
  });

  it('detects BREAKING-CHANGE: synonym in body', () => {
    const log = makeLog('ef05678|fix(payment): drop legacy split|BREAKING-CHANGE: splits now require basis points');
    const commits = parseConventionalCommits(log);

    expect(commits).toHaveLength(1);
    expect(commits[0].breaking).toBe(true);
    expect(commits[0].breakingNote).toBe('splits now require basis points');
  });

  it('stores body verbatim', () => {
    const log = makeLog('abc0001|feat(memory): add recall|some multi line body');
    const commits = parseConventionalCommits(log);
    expect(commits[0].body).toBe('some multi line body');
  });

  it('handles no-scope commits — scope is null', () => {
    const log = makeLog('f016789|chore: update dependencies|');
    const commits = parseConventionalCommits(log);

    expect(commits).toHaveLength(1);
    expect(commits[0].scope).toBeNull();
    expect(commits[0].type).toBe('chore');
    expect(commits[0].description).toBe('update dependencies');
  });

  it('handles revert type', () => {
    const log = makeLog('a1b2c3d|revert(memory): undo semantic extraction|');
    const commits = parseConventionalCommits(log);

    expect(commits).toHaveLength(1);
    expect(commits[0].type).toBe('revert');
    expect(commits[0].scope).toBe('memory');
  });

  it('handles revert type without scope', () => {
    const log = makeLog('a1b2c3e|revert: undo bad deploy|');
    const commits = parseConventionalCommits(log);

    expect(commits).toHaveLength(1);
    expect(commits[0].type).toBe('revert');
    expect(commits[0].scope).toBeNull();
  });

  it('ignores malformed lines — no pipe separator', () => {
    const log = makeLog('this is not a valid git log line');
    const commits = parseConventionalCommits(log);
    expect(commits).toHaveLength(0);
  });

  it('ignores lines with unknown commit type', () => {
    const log = makeLog('aabbcc|wip(memory): half done work|');
    const commits = parseConventionalCommits(log);
    expect(commits).toHaveLength(0);
  });

  it('ignores lines where subject does not match conventional pattern', () => {
    const log = makeLog('aabbcc|just a plain commit message|');
    const commits = parseConventionalCommits(log);
    expect(commits).toHaveLength(0);
  });

  it('ignores empty lines', () => {
    const log = makeLog('', '   ', 'abc1234|feat(memory): add recall|');
    const commits = parseConventionalCommits(log);
    expect(commits).toHaveLength(1);
  });

  it('parses multiple commits from one log string', () => {
    const log = makeLog(
      'aaa0001|feat(memory): add recall|',
      'bbb0002|fix(payment): correct split math|',
      'ccc0003|chore: bump deps|',
    );
    const commits = parseConventionalCommits(log);
    expect(commits).toHaveLength(3);
  });

  it('breaking commit without breakingNote has breakingNote null', () => {
    const log = makeLog('abc0001|feat!: drop support for v1|');
    const commits = parseConventionalCommits(log);
    expect(commits[0].breaking).toBe(true);
    expect(commits[0].breakingNote).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// renderChangelog
// ---------------------------------------------------------------------------

function makeCommit(overrides: Partial<ParsedCommit> & Pick<ParsedCommit, 'hash' | 'type' | 'description'>): ParsedCommit {
  return {
    scope: null,
    breaking: false,
    breakingNote: null,
    body: '',
    ...overrides,
  };
}

describe('renderChangelog', () => {
  it('includes the version in the heading', () => {
    const result = renderChangelog('1.2.3', [], null);
    expect(result).toContain('## [1.2.3]');
  });

  it('includes a date in YYYY-MM-DD format in the heading', () => {
    const result = renderChangelog('1.0.0', [], null);
    expect(result).toMatch(/## \[1\.0\.0\] — \d{4}-\d{2}-\d{2}/);
  });

  it('groups commits by scope in alphabetical order', () => {
    const commits = [
      makeCommit({ hash: 'aaa', type: 'feat', scope: 'payment', description: 'add splits' }),
      makeCommit({ hash: 'bbb', type: 'fix', scope: 'anchoring', description: 'retry logic' }),
      makeCommit({ hash: 'ccc', type: 'perf', scope: 'memory', description: 'faster recall' }),
    ];
    const result = renderChangelog('2.0.0', commits, null);

    const anchoringIdx = result.indexOf('### anchoring');
    const memoryIdx = result.indexOf('### memory');
    const paymentIdx = result.indexOf('### payment');

    expect(anchoringIdx).toBeLessThan(memoryIdx);
    expect(memoryIdx).toBeLessThan(paymentIdx);
  });

  it('places "Other" bucket at the end after scoped groups', () => {
    const commits = [
      makeCommit({ hash: 'aaa', type: 'chore', scope: null, description: 'bump deps' }),
      makeCommit({ hash: 'bbb', type: 'feat', scope: 'memory', description: 'add recall' }),
    ];
    const result = renderChangelog('1.0.0', commits, null);

    const memoryIdx = result.indexOf('### memory');
    const otherIdx = result.indexOf('### Other');

    expect(memoryIdx).toBeGreaterThan(-1);
    expect(otherIdx).toBeGreaterThan(-1);
    expect(memoryIdx).toBeLessThan(otherIdx);
  });

  it('renders no-scope commits in ### Other section', () => {
    const commits = [
      makeCommit({ hash: 'abc0001', type: 'chore', scope: null, description: 'update deps' }),
    ];
    const result = renderChangelog('1.0.0', commits, null);

    expect(result).toContain('### Other');
    expect(result).toContain('**chore:** update deps');
    expect(result).toContain('`abc0001`');
  });

  it('renders scoped commits with type(scope) label', () => {
    const commits = [
      makeCommit({ hash: 'def0001', type: 'feat', scope: 'memory', description: 'add recall' }),
    ];
    const result = renderChangelog('1.0.0', commits, null);

    expect(result).toContain('**feat(memory):** add recall');
    expect(result).toContain('`def0001`');
  });

  it('includes ### Breaking Changes section when breaking commits exist', () => {
    const commits = [
      makeCommit({ hash: 'brk0001', type: 'feat', scope: 'epoch', description: 'new anchoring API', breaking: true, breakingNote: null }),
    ];
    const result = renderChangelog('3.0.0', commits, null);

    expect(result).toContain('### Breaking Changes');
    expect(result).toContain('`brk0001`');
  });

  it('omits ### Breaking Changes section when no breaking commits', () => {
    const commits = [
      makeCommit({ hash: 'aaa0001', type: 'fix', scope: 'payment', description: 'correct math' }),
    ];
    const result = renderChangelog('1.0.0', commits, null);

    expect(result).not.toContain('### Breaking Changes');
  });

  it('includes breakingNote in breaking changes section when present', () => {
    const commits = [
      makeCommit({
        hash: 'brk0002',
        type: 'feat',
        scope: 'memory',
        description: 'new recall format',
        breaking: true,
        breakingNote: 'recall response shape changed',
      }),
    ];
    const result = renderChangelog('3.0.0', commits, null);

    expect(result).toContain('recall response shape changed');
  });

  it('includes AI summary right after the version heading when provided', () => {
    const commits = [
      makeCommit({ hash: 'aaa0001', type: 'feat', scope: 'memory', description: 'add recall' }),
    ];
    const aiSummary = 'This release focuses on memory improvements and stability fixes.';
    const result = renderChangelog('1.0.0', commits, aiSummary);

    expect(result).toContain(aiSummary);

    const headingIdx = result.indexOf('## [1.0.0]');
    const summaryIdx = result.indexOf(aiSummary);
    const sectionIdx = result.indexOf('### ');

    expect(summaryIdx).toBeGreaterThan(headingIdx);
    expect(summaryIdx).toBeLessThan(sectionIdx);
  });

  it('omits AI summary section entirely when aiSummary is null', () => {
    const commits = [
      makeCommit({ hash: 'aaa0001', type: 'feat', scope: 'memory', description: 'add recall' }),
    ];
    const result = renderChangelog('1.0.0', commits, null);

    // No unexpected paragraph between heading and first section
    const headingEnd = result.indexOf('\n', result.indexOf('## [1.0.0]'));
    const firstSection = result.indexOf('### ');
    const between = result.slice(headingEnd, firstSection).trim();
    expect(between).toBe('');
  });

  it('handles empty commit list gracefully', () => {
    const result = renderChangelog('0.0.1', [], null);
    expect(result).toContain('## [0.0.1]');
    expect(result).not.toContain('###');
  });

  it('renders breaking changes section before scope sections', () => {
    const commits = [
      makeCommit({ hash: 'brk0003', type: 'fix', scope: 'payment', description: 'drop v1 api', breaking: true }),
      makeCommit({ hash: 'nrm0001', type: 'feat', scope: 'memory', description: 'add recall' }),
    ];
    const result = renderChangelog('2.0.0', commits, null);

    const breakingIdx = result.indexOf('### Breaking Changes');
    const paymentIdx = result.indexOf('### payment');
    const memoryIdx = result.indexOf('### memory');

    expect(breakingIdx).toBeGreaterThan(-1);
    expect(breakingIdx).toBeLessThan(memoryIdx);
    expect(breakingIdx).toBeLessThan(paymentIdx);
  });

  it('includes hash as inline code in commit line', () => {
    const commits = [
      makeCommit({ hash: 'cafebabe', type: 'docs', scope: 'anchoring', description: 'update readme' }),
    ];
    const result = renderChangelog('1.0.0', commits, null);
    expect(result).toContain('`cafebabe`');
  });
});
