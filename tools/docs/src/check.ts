import fs from 'fs';
import path from 'path';
import { extractDomainSnapshot } from './extract/extractor';
import { computeApiHash, computeContentHash } from './extract/hasher';
import { selectFiles } from './extract/fileSelector';
import { readCache } from './cache/cacheManager';
import type { DomainSnapshot, CacheData } from './extract/types';
import {
  DOMAIN_ALLOWLIST,
  DOCS_REFERENCE_DIR,
  CACHE_FILE,
  getDomainPath,
} from './config';

// ---------------------------------------------------------------------------
// CheckResult
// ---------------------------------------------------------------------------

export interface CheckResult {
  domain: string;
  errors: string[];   // hard failures
  warnings: string[]; // non-blocking
}

// ---------------------------------------------------------------------------
// Heading extraction
// ---------------------------------------------------------------------------

/**
 * Extract all `### Name` headings from a markdown string into a Set.
 * Only level-3 headings are collected — these map 1-to-1 with symbol names
 * in the reference doc format produced by the renderer.
 */
function extractHeadings(markdown: string): Set<string> {
  const headings = new Set<string>();
  for (const line of markdown.split('\n')) {
    const match = line.match(/^###\s+(\S+)/);
    if (match) {
      headings.add(match[1]);
    }
  }
  return headings;
}

// ---------------------------------------------------------------------------
// checkDomain — pure function, exported for unit testing
// ---------------------------------------------------------------------------

export function checkDomain(
  domain: string,
  snapshot: DomainSnapshot,
  referenceDoc: string,
  cache: CacheData,
): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const cached = cache[domain];

  // 1. apiHash mismatch — hard error (only when cache entry exists)
  if (cached !== undefined) {
    if (cached.apiHash !== snapshot.apiHash) {
      errors.push(
        `apiHash mismatch: cached=${cached.apiHash.slice(0, 12)}… current=${snapshot.apiHash.slice(0, 12)}… — run docs:generate to refresh`,
      );
    }

    // 2. contentHash mismatch — warning
    if (cached.contentHash !== snapshot.contentHash) {
      warnings.push(
        `contentHash changed: cached=${cached.contentHash.slice(0, 12)}… current=${snapshot.contentHash.slice(0, 12)}… — source files updated since last generate`,
      );
    }
  }

  // 3. Symbol coverage — heading-based matching to avoid substring false positives
  const headings = extractHeadings(referenceDoc);

  // Collect all source symbol names
  const symbolNames = new Set<string>([
    ...snapshot.interfaces.map((i) => i.name),
    ...snapshot.functions.map((f) => f.name),
    ...snapshot.types.map((t) => t.name),
  ]);

  // Source symbol missing from reference doc (no matching ### heading)
  for (const name of symbolNames) {
    if (!headings.has(name)) {
      errors.push(`Symbol "${name}" exported from source has no matching ### heading in reference doc`);
    }
  }

  // Reference doc heading has no matching source symbol (stale/removed symbol)
  for (const heading of headings) {
    if (!symbolNames.has(heading)) {
      errors.push(`Reference doc heading "### ${heading}" has no matching exported symbol in source`);
    }
  }

  return { domain, errors, warnings };
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const cache = readCache(CACHE_FILE);

  let hasErrors = false;

  for (const domain of DOMAIN_ALLOWLIST) {
    const domainPath = getDomainPath(domain);

    // Extract snapshot — parse failure is a HARD ERROR
    let snapshot: DomainSnapshot;
    try {
      snapshot = extractDomainSnapshot(domainPath);
      // Compute hashes and attach them to the snapshot
      const files = selectFiles(domainPath, []);
      snapshot.apiHash = computeApiHash(snapshot);
      snapshot.contentHash = computeContentHash(files);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ERROR] ${domain}: extraction failed — ${msg}`);
      hasErrors = true;
      continue;
    }

    // Read reference doc
    const refDocPath = path.join(DOCS_REFERENCE_DIR, `${domain}.md`);
    let referenceDoc: string;
    try {
      referenceDoc = fs.readFileSync(refDocPath, 'utf-8');
    } catch {
      console.warn(`[WARN]  ${domain}: no reference doc at ${refDocPath} — skipping coverage check`);
      continue;
    }

    const result = checkDomain(domain, snapshot, referenceDoc, cache);

    if (result.errors.length > 0 || result.warnings.length > 0) {
      console.log(`\n── ${domain} ──`);
      for (const w of result.warnings) {
        console.warn(`  [WARN]  ${w}`);
      }
      for (const e of result.errors) {
        console.error(`  [ERROR] ${e}`);
      }
    } else {
      console.log(`  [OK]    ${domain}`);
    }

    if (result.errors.length > 0) {
      hasErrors = true;
    }
  }

  if (hasErrors) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
