import fs from 'fs';
import path from 'path';
import {
  MAX_CHAR_BUDGET,
  ORCHESTRATOR_PATTERNS,
  TOP_FILES_BY_EXPORTS,
  TOP_FILES_BY_CROSS_IMPORTS,
} from '../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SelectedFile {
  path: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect all .ts files under a directory, skipping __tests__
 * directories and .test.ts / .spec.ts files.
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(current: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) continue;
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Count occurrences of a pattern (as a fixed string) in text.
 */
function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Main selector
// ---------------------------------------------------------------------------

/**
 * Select the most relevant source files from a domain directory using a
 * 5-rule deterministic strategy:
 *
 * 1. Barrel  — always include index.ts if it exists
 * 2. Top exports — top N files by `export` statement count
 * 3. Cross-domain imports — top M files by `from '../` occurrence count
 * 4. Orchestrators — files whose basename ends with Service.ts, Manager.ts, or Store.ts
 * 5. Dedup + budget cap — remove duplicates, trim from rule 4 first then rule 3
 *    until total character count is within the budget
 *
 * @param domainPath  Absolute path to the domain directory.
 * @param _snapshotHint  Unused snapshot data (reserved for future use).
 * @param charBudget  Maximum total characters across all returned files.
 */
export function selectFiles(
  domainPath: string,
  _snapshotHint: unknown[],
  charBudget: number = MAX_CHAR_BUDGET,
): SelectedFile[] {
  const allFiles = collectTsFiles(domainPath);

  // Read each file once and cache the content.
  const contentCache = new Map<string, string>();
  for (const absPath of allFiles) {
    try {
      contentCache.set(absPath, fs.readFileSync(absPath, 'utf-8'));
    } catch {
      contentCache.set(absPath, '');
    }
  }

  function relPath(absPath: string): string {
    return path.relative(domainPath, absPath).replace(/\\/g, '/');
  }

  // -------------------------------------------------------------------------
  // Rule 1: Barrel
  // -------------------------------------------------------------------------
  const barrelAbs = path.join(domainPath, 'index.ts');
  const rule1: string[] = contentCache.has(barrelAbs) ? [barrelAbs] : [];

  // -------------------------------------------------------------------------
  // Rule 2: Top files by export count
  // -------------------------------------------------------------------------
  const exportCounts: Array<{ abs: string; count: number }> = [];
  for (const [abs, content] of contentCache) {
    // Count lines/statements that start with `export` (including re-exports)
    const count = countOccurrences(content, 'export ') + countOccurrences(content, 'export{');
    exportCounts.push({ abs, count });
  }
  exportCounts.sort((a, b) => b.count - a.count || a.abs.localeCompare(b.abs));
  const rule2 = exportCounts.slice(0, TOP_FILES_BY_EXPORTS).map((e) => e.abs);

  // -------------------------------------------------------------------------
  // Rule 3: Top files by cross-domain import count (`from '../`)
  // -------------------------------------------------------------------------
  const crossImportCounts: Array<{ abs: string; count: number }> = [];
  for (const [abs, content] of contentCache) {
    const count = countOccurrences(content, "from '../");
    crossImportCounts.push({ abs, count });
  }
  crossImportCounts.sort((a, b) => b.count - a.count || a.abs.localeCompare(b.abs));
  // Only include files that actually have cross-domain imports
  const rule3 = crossImportCounts
    .filter((e) => e.count > 0)
    .slice(0, TOP_FILES_BY_CROSS_IMPORTS)
    .map((e) => e.abs);

  // -------------------------------------------------------------------------
  // Rule 4: Orchestrator pattern files
  // -------------------------------------------------------------------------
  const rule4 = allFiles.filter((abs) => {
    const base = path.basename(abs);
    return ORCHESTRATOR_PATTERNS.some((pattern) => base.endsWith(pattern));
  });

  // -------------------------------------------------------------------------
  // Rule 5: Dedup + budget cap
  // -------------------------------------------------------------------------

  // Merge in priority order (rule1 first so barrel is first) and deduplicate
  // while preserving order.
  const seen = new Set<string>();
  const ordered: Array<{ abs: string; ruleNum: number }> = [];

  function addFromRule(paths: string[], ruleNum: number): void {
    for (const abs of paths) {
      if (!seen.has(abs)) {
        seen.add(abs);
        ordered.push({ abs, ruleNum });
      }
    }
  }

  addFromRule(rule1, 1);
  addFromRule(rule2, 2);
  addFromRule(rule3, 3);
  addFromRule(rule4, 4);

  // Compute total characters
  let totalChars = ordered.reduce((sum, { abs }) => sum + (contentCache.get(abs)?.length ?? 0), 0);

  // Trim from rule 4 first, then rule 3, until within budget
  for (const ruleToTrim of [4, 3]) {
    if (totalChars <= charBudget) break;
    // Remove items from the back belonging to this rule (reverse traversal)
    for (let i = ordered.length - 1; i >= 0 && totalChars > charBudget; i--) {
      if (ordered[i].ruleNum === ruleToTrim) {
        const removed = ordered.splice(i, 1)[0];
        totalChars -= contentCache.get(removed.abs)?.length ?? 0;
      }
    }
  }

  // Build result — paths relative to domainPath
  return ordered.map(({ abs }) => ({
    path: relPath(abs),
    content: contentCache.get(abs) ?? '',
  }));
}
