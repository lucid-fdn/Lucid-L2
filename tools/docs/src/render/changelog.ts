export interface ParsedCommit {
  hash: string;
  type: string;
  scope: string | null;
  description: string;
  breaking: boolean;
  breakingNote: string | null;
  body: string;
}

const KNOWN_TYPES = new Set([
  'feat',
  'fix',
  'refactor',
  'perf',
  'test',
  'docs',
  'chore',
  'revert',
  'ci',
  'build',
]);

/**
 * Parse a git log string where each line is `hash|subject|body`.
 * Body uses `\n` within the field (the line separator between records is a
 * literal newline, so each record is one line: hash|subject|body where body
 * may itself contain `\\n` escaped newlines from `git log --pretty` output).
 *
 * Supports conventional commit formats:
 *   - `type(scope): description`
 *   - `type!: description`       (breaking)
 *   - `type!(scope): description` (breaking with scope)
 *   - `type: description`        (no scope)
 *
 * Breaking changes detected from:
 *   - `!` marker in type field
 *   - `BREAKING CHANGE:` footer in body
 *   - `BREAKING-CHANGE:` footer in body
 */
export function parseConventionalCommits(gitLog: string): ParsedCommit[] {
  const results: ParsedCommit[] = [];

  const lines = gitLog.split('\n').filter((l) => l.trim().length > 0);

  for (const line of lines) {
    const pipeIdx = line.indexOf('|');
    if (pipeIdx === -1) continue;

    const hash = line.slice(0, pipeIdx).trim();
    const rest = line.slice(pipeIdx + 1);

    const secondPipeIdx = rest.indexOf('|');
    if (secondPipeIdx === -1) continue;

    const subject = rest.slice(0, secondPipeIdx).trim();
    const body = rest.slice(secondPipeIdx + 1).trim();

    if (!hash || !subject) continue;

    // Match: type[!][(scope)][!]: description
    // Examples:
    //   feat(memory): add recall
    //   fix!: break something
    //   feat!(memory): breaking with scope
    //   chore: bump deps
    const subjectPattern = /^([a-z]+)(!)?(?:\(([^)]*)\))?(!)?:\s*(.+)$/;
    const match = subject.match(subjectPattern);

    if (!match) continue;

    const rawType = match[1];
    const bangBefore = match[2] === '!';
    const scope = match[3] ?? null;
    const bangAfter = match[4] === '!';
    const description = match[5].trim();

    if (!KNOWN_TYPES.has(rawType)) continue;

    const bangBreaking = bangBefore || bangAfter;

    // Check for BREAKING CHANGE / BREAKING-CHANGE footer in body
    const breakingFooterPattern = /^BREAKING[- ]CHANGE:\s*(.+)/m;
    const footerMatch = body.match(breakingFooterPattern);
    const footerBreaking = footerMatch !== null;
    const breakingNote = footerMatch ? footerMatch[1].trim() : null;

    const breaking = bangBreaking || footerBreaking;

    results.push({
      hash,
      type: rawType,
      scope: scope && scope.length > 0 ? scope : null,
      description,
      breaking,
      breakingNote,
      body,
    });
  }

  return results;
}

/**
 * Render a changelog entry for `version` from a list of parsed commits and
 * an optional AI-generated summary.
 *
 * Structure:
 *   ## [version] — YYYY-MM-DD
 *
 *   <aiSummary paragraph(s) if provided>
 *
 *   ### Breaking Changes   (only when breaking commits exist)
 *   - ...
 *
 *   ### <Scope A>
 *   - **type(scope):** description — `hash`
 *   ...
 *
 *   ### Other             (no-scope commits, at the end)
 *   - **type:** description — `hash`
 */
export function renderChangelog(
  version: string,
  commits: ParsedCommit[],
  aiSummary: string | null,
): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const lines: string[] = [];

  lines.push(`## [${version}] — ${date}`);
  lines.push('');

  if (aiSummary) {
    lines.push(aiSummary.trim());
    lines.push('');
  }

  // Breaking changes section
  const breakingCommits = commits.filter((c) => c.breaking);
  if (breakingCommits.length > 0) {
    lines.push('### Breaking Changes');
    lines.push('');
    for (const c of breakingCommits) {
      const label = c.scope ? `**${c.type}(${c.scope}):**` : `**${c.type}:**`;
      const note = c.breakingNote ? ` — ${c.breakingNote}` : '';
      lines.push(`- ${label} ${c.description}${note} — \`${c.hash}\``);
    }
    lines.push('');
  }

  // Group by scope; null scope → "Other"
  const scopeMap = new Map<string, ParsedCommit[]>();

  for (const c of commits) {
    const key = c.scope ?? 'Other';
    if (!scopeMap.has(key)) scopeMap.set(key, []);
    scopeMap.get(key)!.push(c);
  }

  // Sort scopes alphabetically, "Other" always last
  const scopes = [...scopeMap.keys()]
    .filter((s) => s !== 'Other')
    .sort((a, b) => a.localeCompare(b));

  if (scopeMap.has('Other')) {
    scopes.push('Other');
  }

  for (const scope of scopes) {
    const group = scopeMap.get(scope)!;
    lines.push(`### ${scope}`);
    lines.push('');
    for (const c of group) {
      const label = scope !== 'Other' ? `**${c.type}(${scope}):**` : `**${c.type}:**`;
      lines.push(`- ${label} ${c.description} — \`${c.hash}\``);
    }
    lines.push('');
  }

  // Remove trailing blank line
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}
