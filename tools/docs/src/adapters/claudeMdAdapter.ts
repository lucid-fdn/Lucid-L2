import * as fs from 'fs';
import * as path from 'path';
import { PageSource, SourceAdapter } from './types';
import {
  ClaudeMdMapping,
  lucidL2Mappings,
  platformCoreMappings,
} from './claudeMdMappings';

/** Parsed heading with its level, title, and body content. */
interface ParsedSection {
  level: number;
  title: string;
  content: string;
}

/**
 * Parse a markdown string into sections keyed by heading text.
 * Each section captures everything from its heading to the next heading
 * of the same or higher (lower number) level.
 */
export function parseMarkdownSections(markdown: string): ParsedSection[] {
  const headingRe = /^(#{2,4})\s+(.+)$/gm;
  const sections: ParsedSection[] = [];
  const matches: { level: number; title: string; headingStart: number; contentStart: number; end: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(markdown)) !== null) {
    matches.push({
      level: match[1].length,
      title: match[2].trim(),
      headingStart: match.index,           // start of the `##` line
      contentStart: match.index + match[0].length, // start of content after heading
      end: markdown.length, // will be narrowed below
    });
  }

  // Narrow each section's end to the start of the next heading at the same or higher level.
  for (let i = 0; i < matches.length; i++) {
    for (let j = i + 1; j < matches.length; j++) {
      if (matches[j].level <= matches[i].level) {
        matches[i].end = matches[j].headingStart;
        break;
      }
    }

    sections.push({
      level: matches[i].level,
      title: matches[i].title,
      content: markdown.slice(matches[i].contentStart, matches[i].end).trim(),
    });
  }

  return sections;
}

/**
 * Extract content for a specific sub-heading pattern within a parent section's content.
 * The subHeading is matched as a bold prefix or as a line containing the text.
 */
function extractSubSection(parentContent: string, subHeading: string): string | null {
  // Strategy 1: bold-prefixed paragraph (e.g., **Path A: Bring Your Own Image (developers)**)
  const boldEscaped = subHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const boldRe = new RegExp(
    `\\*\\*${boldEscaped}\\*\\*([\\s\\S]*?)(?=\\n\\*\\*[A-Z]|\\n#{2,4}\\s|$)`,
  );
  const boldMatch = boldRe.exec(parentContent);
  if (boldMatch) {
    return `**${subHeading}**${boldMatch[1]}`.trim();
  }

  // Strategy 2: look for a line containing the sub-heading text,
  // then grab until the next similar-level marker.
  const lines = parentContent.split('\n');
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(subHeading)) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) return null;

  // Collect until next bold heading or section heading
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^\*\*[A-Z]/.test(lines[i]) || /^#{2,4}\s/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  const extracted = lines.slice(startIdx, endIdx).join('\n').trim();
  return extracted || null;
}

/**
 * Extract pages from a single CLAUDE.md file using the provided mappings.
 */
function extractFromFile(
  filePath: string,
  mappings: ClaudeMdMapping[],
  warnings: string[],
): PageSource[] {
  if (!fs.existsSync(filePath)) {
    warnings.push(`[ClaudeMdAdapter] File not found: ${filePath}`);
    return [];
  }

  const markdown = fs.readFileSync(filePath, 'utf-8');
  const sections = parseMarkdownSections(markdown);
  const results: PageSource[] = [];

  for (const mapping of mappings) {
    const section = sections.find((s) => s.title === mapping.heading);

    if (!section) {
      warnings.push(
        `[ClaudeMdAdapter] Heading not found in ${path.basename(filePath)}: "${mapping.heading}" (target: ${mapping.pagePath})`,
      );
      continue;
    }

    let rawContent: string;

    if (mapping.subHeading) {
      const sub = extractSubSection(section.content, mapping.subHeading);
      if (!sub) {
        warnings.push(
          `[ClaudeMdAdapter] Sub-heading not found in ${path.basename(filePath)}: "${mapping.subHeading}" under "${mapping.heading}" (target: ${mapping.pagePath})`,
        );
        continue;
      }
      rawContent = sub;
    } else {
      rawContent = section.content;
    }

    results.push({
      pagePath: mapping.pagePath,
      title: mapping.title,
      description: mapping.description,
      rawContent,
      sourceFile: path.resolve(filePath),
      sourceSection: mapping.subHeading
        ? `${mapping.heading} > ${mapping.subHeading}`
        : mapping.heading,
      needsEnrichment: mapping.needsEnrichment,
    });
  }

  return results;
}

/**
 * SourceAdapter that extracts documentation pages from CLAUDE.md files
 * in both the Lucid-L2 and platform-core repositories.
 */
export class ClaudeMdAdapter implements SourceAdapter {
  readonly name = 'claude-md';

  private readonly lucidL2Path: string;
  private readonly platformCorePath: string;

  constructor(opts?: { lucidL2Path?: string; platformCorePath?: string }) {
    this.lucidL2Path =
      opts?.lucidL2Path ??
      path.resolve(__dirname, '../../../../CLAUDE.md');

    this.platformCorePath =
      opts?.platformCorePath ??
      process.env.PLATFORM_CORE_CLAUDE_MD ??
      '/home/debian/lucid-plateform-core/CLAUDE.md';
  }

  async extract(): Promise<PageSource[]> {
    const warnings: string[] = [];
    const pages: PageSource[] = [];

    // Extract from Lucid-L2 CLAUDE.md
    pages.push(...extractFromFile(this.lucidL2Path, lucidL2Mappings, warnings));

    // Extract from platform-core CLAUDE.md
    pages.push(...extractFromFile(this.platformCorePath, platformCoreMappings, warnings));

    // Emit warnings to stderr (don't crash)
    for (const w of warnings) {
      console.warn(w);
    }

    return pages;
  }
}
