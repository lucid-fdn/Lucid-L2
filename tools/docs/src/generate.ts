#!/usr/bin/env node
/**
 * docs:generate — AI Documentation Pipeline CLI
 *
 * Usage:
 *   tsx src/generate.ts --domain <name> [--force] [--debug] [--dry-run]
 *
 * Flags:
 *   --domain <name>  Domain to document (must be in DOMAIN_ALLOWLIST)
 *   --force          Reserved for Phase 2: force re-generation even when hashes are unchanged
 *   --debug          Dump raw DomainSnapshot JSON to stdout and exit (no AI, no writing)
 *   --dry-run        Print assembled docs to stdout; skip file writes and cache updates
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';

import {
  DOMAIN_ALLOWLIST,
  DOCS_MODULES_DIR,
  CACHE_FILE,
  getDomainPath,
} from './config';
import type { DomainName } from './config';
import { extractDomainSnapshot } from './extract/extractor';
import { selectFiles } from './extract/fileSelector';
import { computeApiHash, computeContentHash } from './extract/hasher';
import { buildModulePrompt } from './enrich/promptBuilder';
import { enrichDomain } from './enrich/enricher';
import { checkSymbols } from './enrich/symbolGuard';
import { renderKeyInterfaces } from './render/keyInterfaces';
import { renderCrossDeps } from './render/crossDeps';
import { assembleModuleDoc } from './render/assembler';
import { readCache, writeCache } from './cache/cacheManager';
import type { DomainSnapshot, DependencyEdge, CacheData } from './extract/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AI_FALLBACK_STUB =
  '## Purpose\n*AI enrichment pending.*\n\n## Architecture\n*AI enrichment pending.*\n\n## Data Flow\n*AI enrichment pending.*\n\n## Patterns & Gotchas\n*AI enrichment pending.*';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCommitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function domainDocPath(domain: string): string {
  return path.join(DOCS_MODULES_DIR, `${domain}.md`);
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const program = new Command();

  program
    .name('docs:generate')
    .description('Generate AI-enriched architecture docs for a Lucid L2 domain module')
    .requiredOption('--domain <name>', 'Domain to document (must be in DOMAIN_ALLOWLIST)')
    .option('--force', 'Reserved for Phase 2: force re-generation even when hashes are unchanged')
    .option('--debug', 'Dump DomainSnapshot JSON to stdout and exit (no AI, no writes)')
    .option('--dry-run', 'Print docs to stdout; skip file writes and cache updates')
    .parse(process.argv);

  const opts = program.opts<{
    domain: string;
    force: boolean | undefined;
    debug: boolean | undefined;
    dryRun: boolean | undefined;
  }>();

  const domainArg = opts.domain;
  const isDebug = Boolean(opts.debug);
  const isDryRun = Boolean(opts.dryRun);

  // -------------------------------------------------------------------------
  // Step 1: Validate --domain against DOMAIN_ALLOWLIST
  // -------------------------------------------------------------------------
  if (!(DOMAIN_ALLOWLIST as readonly string[]).includes(domainArg)) {
    console.error(
      `Error: unknown domain "${domainArg}". Allowed values: ${DOMAIN_ALLOWLIST.join(', ')}`,
    );
    process.exit(1);
  }

  const domain = domainArg as DomainName;
  const domains: DomainName[] = [domain];

  // -------------------------------------------------------------------------
  // Step 2: Extract targeted domain(s), skip missing dirs with a warning
  // -------------------------------------------------------------------------
  const snapshots = new Map<DomainName, DomainSnapshot>();

  for (const d of domains) {
    const domainPath = getDomainPath(d);
    if (!fs.existsSync(domainPath)) {
      console.warn(`Warning: domain directory not found, skipping: ${domainPath}`);
      continue;
    }
    process.stderr.write(`Extracting ${d}...\n`);
    const snapshot = extractDomainSnapshot(domainPath);
    snapshots.set(d, snapshot);
  }

  if (snapshots.size === 0) {
    console.error('Error: no valid domain directories found. Exiting.');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Step 3: Compute apiHash + contentHash for each snapshot
  // -------------------------------------------------------------------------
  for (const [d, snapshot] of snapshots) {
    const domainPath = getDomainPath(d);
    const files = selectFiles(domainPath, []);
    snapshot.apiHash = computeApiHash(snapshot);
    snapshot.contentHash = computeContentHash(files);
  }

  // -------------------------------------------------------------------------
  // Step 4: --debug mode — dump snapshots as JSON and exit
  // -------------------------------------------------------------------------
  if (isDebug) {
    const output: Record<string, DomainSnapshot> = {};
    for (const [d, snapshot] of snapshots) {
      output[d] = snapshot;
    }
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // Step 5: Collect ALL dependency edges (including non-targeted domains for
  //         reverse edge resolution)
  // -------------------------------------------------------------------------
  const allEdges: DependencyEdge[] = [];

  // Edges from targeted snapshots
  for (const snapshot of snapshots.values()) {
    allEdges.push(...snapshot.imports);
  }

  // Also extract edges from non-targeted domains so reverse edges are visible
  for (const d of DOMAIN_ALLOWLIST) {
    if (snapshots.has(d as DomainName)) continue; // already done
    const domainPath = getDomainPath(d as DomainName);
    if (!fs.existsSync(domainPath)) continue;
    try {
      const sideSnapshot = extractDomainSnapshot(domainPath);
      allEdges.push(...sideSnapshot.imports);
    } catch {
      // Non-fatal: reverse edges from this domain will be missing
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: Get commit SHA
  // -------------------------------------------------------------------------
  const commitSha = getCommitSha();

  // -------------------------------------------------------------------------
  // Step 7: Per-domain — enrich, guard, render, write/print
  // -------------------------------------------------------------------------
  const cache: CacheData = readCache(CACHE_FILE);
  const updatedCache: CacheData = { ...cache };

  for (const [d, snapshot] of snapshots) {
    process.stderr.write(`Processing ${d}...\n`);

    const domainPath = getDomainPath(d);

    // Select files for prompt context
    const selectedFiles = selectFiles(domainPath, []);

    // Build prompt
    const { system, user } = buildModulePrompt(snapshot, selectedFiles);

    // Enrich via AI — fall back to stub on error
    let aiContent: string;
    try {
      process.stderr.write(`  Calling AI enricher for ${d}...\n`);
      aiContent = await enrichDomain(system, user);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  Warning: AI enrichment failed for ${d}: ${message}`);
      console.warn(`  Using fallback stub.`);
      aiContent = AI_FALLBACK_STUB;
    }

    // Symbol guard
    const symbolWarnings = checkSymbols(aiContent, snapshot);

    // Render deterministic sections
    const keyInterfacesSection = renderKeyInterfaces(snapshot.interfaces, snapshot.types);
    const crossDepsSection = renderCrossDeps(d, allEdges);

    // Assemble final markdown
    const markdown = assembleModuleDoc({
      domain: d,
      commitSha,
      aiContent,
      keyInterfacesSection,
      crossDepsSection,
      symbolWarnings,
    });

    // Write or print
    if (isDryRun) {
      process.stdout.write(`\n${'='.repeat(72)}\n`);
      process.stdout.write(`=== DRY RUN: ${d}.md\n`);
      process.stdout.write(`${'='.repeat(72)}\n\n`);
      process.stdout.write(markdown + '\n');
    } else {
      fs.mkdirSync(DOCS_MODULES_DIR, { recursive: true });
      const outPath = domainDocPath(d);
      fs.writeFileSync(outPath, markdown, 'utf-8');
      process.stderr.write(`  Written: ${outPath}\n`);

      // Update cache entry
      updatedCache[d] = {
        apiHash: snapshot.apiHash,
        contentHash: snapshot.contentHash,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Step 8: Persist cache (skip on --dry-run and --debug)
  // -------------------------------------------------------------------------
  if (!isDryRun && !isDebug) {
    writeCache(CACHE_FILE, updatedCache);
    process.stderr.write(`Cache updated: ${CACHE_FILE}\n`);
  }

  process.stderr.write('Done.\n');
}

run().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
