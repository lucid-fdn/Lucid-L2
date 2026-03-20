import fs from 'fs';
import { PageSource, SourceAdapter } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnvVar {
  name: string;
  defaultValue: string;
  description: string;
}

interface EnvBlock {
  /** Section heading extracted from banner comments (e.g. "OBSERVABILITY"). */
  heading: string | null;
  vars: EnvVar[];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const ENV_FILE = '/home/debian/Lucid/Lucid-L2/offchain/.env.example';

/**
 * Parse an `.env.example` file into blocks separated by blank lines.
 *
 * Rules:
 * - Lines starting with `#` are comments (accumulated as description lines).
 * - Lines matching `KEY=value` are env var definitions.
 * - Blank lines delimit blocks.
 * - Banner comments (e.g. `# === SECTION ===`) become block headings.
 */
function parseEnvFile(content: string): EnvBlock[] {
  const lines = content.split('\n');

  // Map from heading -> EnvVar[] (preserves insertion order)
  const sectionMap = new Map<string, EnvVar[]>();
  const NO_SECTION = '__none__';

  let currentHeading: string = NO_SECTION;
  let pendingComments: string[] = [];
  /** True while we are inside a `# ===...` / `# HEADING` / `# ===...` banner. */
  let insideBanner = false;

  const isFenceLine = (l: string): boolean => /^#\s*={3,}\s*$/.test(l);

  function addVar(v: EnvVar): void {
    if (!sectionMap.has(currentHeading)) {
      sectionMap.set(currentHeading, []);
    }
    sectionMap.get(currentHeading)!.push(v);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    // Blank line — just reset pending comments (vars stay in their section)
    if (line.trim() === '') {
      pendingComments = [];
      continue;
    }

    // Three-line banner pattern:
    //   # ===========================
    //   # SECTION NAME
    //   # ===========================
    if (isFenceLine(line)) {
      if (!insideBanner) {
        insideBanner = true;
      } else {
        insideBanner = false;
      }
      continue;
    }

    // Line between opening and closing fence — this is the heading text
    if (insideBanner && line.startsWith('#')) {
      const headingText = line.replace(/^#\s*/, '').trim();
      if (headingText.length > 0) {
        currentHeading = headingText;
        pendingComments = [];
      }
      continue;
    }

    // Env var line (uncommented): KEY=value (value may be empty)
    const varMatch = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)/);
    if (varMatch) {
      addVar({
        name: varMatch[1],
        defaultValue: varMatch[2],
        description: pendingComments.join(' '),
      });
      pendingComments = [];
      continue;
    }

    // Commented-out env var: # KEY=value
    // Must look like an actual env var definition (uppercase key with `=`).
    if (line.startsWith('#')) {
      const commentedVarMatch = line.match(/^#\s*([A-Z_][A-Z0-9_]*)=(.*)/);
      if (commentedVarMatch) {
        addVar({
          name: commentedVarMatch[1],
          defaultValue: commentedVarMatch[2] || '(commented out)',
          description: pendingComments.join(' '),
        });
        pendingComments = [];
        continue;
      }

      // Regular comment line
      const commentText = line.replace(/^#\s?/, '').trim();
      if (commentText.length > 0) {
        pendingComments.push(commentText);
      }
      continue;
    }
  }

  // Convert map to blocks
  const blocks: EnvBlock[] = [];
  for (const [heading, vars] of sectionMap) {
    if (vars.length > 0) {
      blocks.push({
        heading: heading === NO_SECTION ? null : heading,
        vars,
      });
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

function renderMarkdownTable(blocks: EnvBlock[]): string {
  const sections: string[] = [];

  for (const block of blocks) {
    const lines: string[] = [];

    if (block.heading) {
      lines.push(`### ${block.heading}`);
      lines.push('');
    }

    lines.push('| Variable | Default | Description |');
    lines.push('|----------|---------|-------------|');

    for (const v of block.vars) {
      const def = v.defaultValue || '\u2014';
      const desc = v.description || '\u2014';
      // Escape pipe characters inside cell values
      const safeDefault = def.replace(/\|/g, '\\|');
      const safeDesc = desc.replace(/\|/g, '\\|');
      lines.push(`| \`${v.name}\` | \`${safeDefault}\` | ${safeDesc} |`);
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class EnvAdapter implements SourceAdapter {
  readonly name = 'env';

  async extract(): Promise<PageSource[]> {
    if (!fs.existsSync(ENV_FILE)) {
      console.warn(`[EnvAdapter] File not found, skipping: ${ENV_FILE}`);
      return [];
    }

    const raw = fs.readFileSync(ENV_FILE, 'utf-8');
    const blocks = parseEnvFile(raw);

    if (blocks.length === 0) {
      console.warn('[EnvAdapter] No env blocks parsed, skipping.');
      return [];
    }

    const markdown = renderMarkdownTable(blocks);

    return [
      {
        pagePath: 'advanced/configuration',
        title: 'Configuration',
        description:
          'Environment variables for the Lucid L2 offchain API, parsed from .env.example.',
        rawContent: markdown,
        sourceFile: ENV_FILE,
        needsEnrichment: true,
      },
    ];
  }
}
