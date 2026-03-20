import fs from 'fs';
import { PageSource, SourceAdapter } from './types';

// ---------------------------------------------------------------------------
// README-to-page mappings
// ---------------------------------------------------------------------------

interface ReadmeMapping {
  /** Absolute path to the README/markdown file. */
  filePath: string;
  /** Target page path in the docs site (e.g. "how/execution-runtime"). */
  pagePath: string;
  /** Page title rendered in the docs. */
  title: string;
  /**
   * Optional section range to extract.
   * Format: "## Start Heading" through "## End Heading".
   * When omitted the entire file content is used.
   */
  extractSection?: { from: string; through: string };
  /** Whether the AI enrichment pass should rewrite this page. */
  needsEnrichment: boolean;
}

const MAPPINGS: ReadmeMapping[] = [
  {
    filePath: '/home/debian/Lucid/Lucid-L2/offchain/packages/agent-runtime/README.md',
    pagePath: 'how/execution-runtime',
    title: 'Agent Runtime',
    needsEnrichment: true,
  },
  {
    filePath: '/home/debian/Lucid/Lucid-L2/offchain/README.md',
    pagePath: 'advanced/self-hosting',
    title: 'Self-Hosting',
    extractSection: { from: '## Quick Start', through: '## Architecture' },
    needsEnrichment: true,
  },
  {
    filePath: '/home/debian/Lucid/Lucid-L2/CONTRIBUTING.md',
    pagePath: 'advanced/contributing',
    title: 'Contributing',
    needsEnrichment: false,
  },
  {
    filePath: '/home/debian/lucid-plateform-core/packages/pay/README.md',
    pagePath: 'concepts/payments',
    title: 'Payments (x402) \u2014 @lucid-fdn/pay',
    needsEnrichment: true,
  },
];

// ---------------------------------------------------------------------------
// Section extraction
// ---------------------------------------------------------------------------

/**
 * Extract content between two same-level headings.
 *
 * Given `from = "## Quick Start"` and `through = "## Architecture"`, returns
 * everything starting at the "## Quick Start" line (inclusive) up to — but not
 * including — the "## Architecture" line.
 *
 * The heading level is inferred from `from` (number of leading `#` chars).
 * If the `through` heading is never found the content runs to end-of-file.
 */
function extractBetweenHeadings(
  content: string,
  from: string,
  through: string,
): string {
  const lines = content.split('\n');
  const level = from.match(/^(#+)/)?.[1].length ?? 2;

  let startIdx = -1;
  let endIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimEnd();

    if (startIdx === -1) {
      if (trimmed === from) {
        startIdx = i;
      }
      continue;
    }

    // After start found, look for the "through" heading or any same-level heading
    if (trimmed === through) {
      endIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    // Heading not found — return full content as fallback
    return content;
  }

  return lines.slice(startIdx, endIdx).join('\n').trim();
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class ReadmeAdapter implements SourceAdapter {
  readonly name = 'readme';

  async extract(): Promise<PageSource[]> {
    const pages: PageSource[] = [];

    for (const mapping of MAPPINGS) {
      if (!fs.existsSync(mapping.filePath)) {
        console.warn(
          `[ReadmeAdapter] File not found, skipping: ${mapping.filePath}`,
        );
        continue;
      }

      const raw = fs.readFileSync(mapping.filePath, 'utf-8');

      let content: string;
      let sourceSection: string | undefined;

      if (mapping.extractSection) {
        content = extractBetweenHeadings(
          raw,
          mapping.extractSection.from,
          mapping.extractSection.through,
        );
        sourceSection = `${mapping.extractSection.from} through ${mapping.extractSection.through}`;
      } else {
        content = raw.trim();
      }

      // Derive a short description from the first non-heading, non-empty line.
      const descLine = content
        .split('\n')
        .find((l) => l.trim().length > 0 && !l.trim().startsWith('#'));
      const description = descLine?.trim() ?? mapping.title;

      pages.push({
        pagePath: mapping.pagePath,
        title: mapping.title,
        description,
        rawContent: content,
        sourceFile: mapping.filePath,
        sourceSection,
        needsEnrichment: mapping.needsEnrichment,
      });
    }

    return pages;
  }
}
