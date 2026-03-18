/**
 * Utilities for generating condensed domain summaries from module documentation
 * and syncing them into CLAUDE.md via sentinel-based section replacement.
 */

/**
 * Escape a string for use as a literal pattern inside a RegExp.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the body of a named `## heading` section from markdown content.
 * Returns the trimmed content between the heading and the next `##` heading (or EOF).
 */
function extractSection(doc: string, heading: string): string {
  const pattern = new RegExp(`## ${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = doc.match(pattern);
  if (!match) return '';
  return match[1].trim();
}

/**
 * Extract interface names from the Key Interfaces table in a module doc.
 * Returns an array of bare interface names (without backticks).
 */
function extractInterfaceNames(doc: string): string[] {
  const section = extractSection(doc, 'Key Interfaces');
  if (!section) return [];

  const names: string[] = [];
  // Match rows like: | `IFooBar` | ...
  const rowPattern = /^\|\s*`([^`]+)`\s*\|/gm;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(section)) !== null) {
    // Skip the header row "Interface"
    if (match[1] !== 'Interface') {
      names.push(match[1]);
    }
  }
  return names;
}

/**
 * Extract domain names from the Cross-Domain Dependencies table in a module doc.
 * Returns an array of unique domain names.
 */
function extractDomainNames(doc: string): string[] {
  const section = extractSection(doc, 'Cross-Domain Dependencies');
  if (!section) return [];

  const domains = new Set<string>();
  // Match rows like: | imports | shared | ... or | exports to | anchoring | ...
  const rowPattern = /^\|\s*(?:imports|exports to)\s*\|\s*([^|]+?)\s*\|/gm;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(section)) !== null) {
    const domain = match[1].trim();
    if (domain && domain !== 'Domain') {
      domains.add(domain);
    }
  }
  return Array.from(domains);
}

/**
 * Generate a condensed summary (~5-15 lines) from a module overview doc.
 *
 * Pulls:
 * - Purpose section content
 * - Architecture first paragraph
 * - Interface names from Key Interfaces table
 * - Domain names from Cross-Domain Dependencies
 */
export function generateDomainSummary(moduleDoc: string): string {
  const lines: string[] = [];

  // Purpose section
  const purpose = extractSection(moduleDoc, 'Purpose');
  if (purpose) {
    lines.push('**Purpose:**');
    lines.push(purpose);
    lines.push('');
  }

  // Architecture — first paragraph only
  const architecture = extractSection(moduleDoc, 'Architecture');
  if (architecture) {
    const firstParagraph = architecture.split(/\n\n/)[0].trim();
    if (firstParagraph) {
      lines.push('**Architecture:**');
      lines.push(firstParagraph);
      lines.push('');
    }
  }

  // Key Interfaces
  const interfaceNames = extractInterfaceNames(moduleDoc);
  if (interfaceNames.length > 0) {
    lines.push(`**Key Interfaces:** ${interfaceNames.join(', ')}`);
    lines.push('');
  }

  // Cross-Domain Dependencies
  const domainNames = extractDomainNames(moduleDoc);
  if (domainNames.length > 0) {
    lines.push(`**Cross-Domain Dependencies:** ${domainNames.join(', ')}`);
    lines.push('');
  }

  // Remove trailing blank line
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

/**
 * Replace content between sentinel markers in a CLAUDE.md string.
 *
 * Sentinel format:
 *   <!-- docs:auto:start domain=X -->
 *   ...auto-generated content...
 *   <!-- docs:auto:end domain=X -->
 *
 * Rules:
 * - Preserves everything outside sentinels (hand-written content untouched).
 * - Preserves the sentinel markers themselves.
 * - If no sentinel exists for a domain, the file is returned unchanged.
 */
export function updateClaudeMdSections(
  claudeMd: string,
  summaries: Record<string, string>,
): string {
  let result = claudeMd;

  for (const [domain, summary] of Object.entries(summaries)) {
    const startMarker = `<!-- docs:auto:start domain=${domain} -->`;
    const endMarker = `<!-- docs:auto:end domain=${domain} -->`;

    const startEscaped = escapeRegex(startMarker);
    const endEscaped = escapeRegex(endMarker);

    // Pattern: start-marker, optional whitespace/newline, any content, optional whitespace/newline, end-marker
    const pattern = new RegExp(
      `(${startEscaped})([\\s\\S]*?)(${endEscaped})`,
    );

    if (!pattern.test(result)) {
      // No sentinel for this domain — skip, return unchanged for this domain
      continue;
    }

    const replacement = `$1\n${summary}\n$3`;
    result = result.replace(pattern, replacement);
  }

  return result;
}
