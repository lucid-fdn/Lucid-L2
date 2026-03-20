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
import { renderReference } from './render/reference';
import { generateDomainSummary, updateClaudeMdSections } from './render/claudeMd';
import { DOCS_REFERENCE_DIR, CLAUDE_MD_PATH, REPO_ROOT } from './config';
import type { DomainSnapshot, DependencyEdge, CacheData } from './extract/types';
import { parseConventionalCommits, renderChangelog } from './render/changelog';
import { renderLlmsTxt } from './render/llmsTxt';
import { extractSolanaProgram, extractSolidityContract } from './extract/programExtractor';
import { renderProgramDoc, renderContractDoc } from './render/programDoc';
import { syncToMintlify, updateDocsJson } from './render/mintlifySync';
import { extractAllPages } from './adapters';
import { renderPage } from './render/pageRenderer';
import { enrichPage } from './render/pageEnricher';

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
    .option('--domain <name>', 'Domain to document (omit for all domains)')
    .option('--force', 'Reserved for Phase 2: force re-generation even when hashes are unchanged')
    .option('--debug', 'Dump DomainSnapshot JSON to stdout and exit (no AI, no writes)')
    .option('--dry-run', 'Print docs to stdout; skip file writes and cache updates')
    .option('--changed', 'Only process domains where hashes differ from cache')
    .option('--artifact <type>', 'Generate specific artifact: modules, reference, claude-md, changelog, llms-txt, programs, contracts, mintlify, pages')
    .option('--from <ref>', 'Git ref for changelog start (e.g., v1.2.0)')
    .option('--to <ref>', 'Git ref for changelog end (default: HEAD)')
    .option('--adapter <name>', 'Filter pages extraction to a specific adapter (used with --artifact pages)')
    .option('--output <dir>', 'Output directory for pages (default: ./output)')
    .parse(process.argv);

  const opts = program.opts<{
    domain: string;
    force: boolean | undefined;
    debug: boolean | undefined;
    dryRun: boolean | undefined;
    changed: boolean | undefined;
    artifact: string | undefined;
    from: string | undefined;
    to: string | undefined;
    adapter: string | undefined;
    output: string | undefined;
  }>();

  const domainArg = opts.domain as string | undefined;
  const isDebug = Boolean(opts.debug);
  const isDryRun = Boolean(opts.dryRun);

  // -------------------------------------------------------------------------
  // Step 1: Validate --domain against DOMAIN_ALLOWLIST (or use all domains)
  // -------------------------------------------------------------------------
  let domains: DomainName[];
  if (domainArg) {
    if (!(DOMAIN_ALLOWLIST as readonly string[]).includes(domainArg)) {
      console.error(
        `Error: unknown domain "${domainArg}". Allowed values: ${DOMAIN_ALLOWLIST.join(', ')}`,
      );
      process.exit(1);
    }
    domains = [domainArg as DomainName];
  } else {
    domains = [...DOMAIN_ALLOWLIST];
  }

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
  // --changed: filter to domains with changed hashes
  // -------------------------------------------------------------------------
  if (opts.changed && !opts.force) {
    const existingCache = readCache(CACHE_FILE);
    const before = snapshots.size;
    for (const [d, snapshot] of snapshots) {
      const cached = existingCache[d];
      if (cached) {
        const artifactType = opts.artifact;
        let unchanged: boolean;
        if (artifactType === 'reference') {
          unchanged = cached.apiHash === snapshot.apiHash;
        } else if (artifactType === 'modules' || artifactType === 'claude-md') {
          unchanged = cached.contentHash === snapshot.contentHash;
        } else {
          unchanged = cached.apiHash === snapshot.apiHash && cached.contentHash === snapshot.contentHash;
        }
        if (unchanged) snapshots.delete(d);
      }
    }
    const after = snapshots.size;
    if (before !== after) {
      process.stderr.write(`--changed: ${before - after} domain(s) unchanged, ${after} to process\n`);
    }
    if (snapshots.size === 0) {
      process.stderr.write('All domains up to date. Nothing to generate.\n');
      process.exit(0);
    }
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

  const artifactType = opts.artifact;

  for (const [d, snapshot] of snapshots) {
    process.stderr.write(`Processing ${d}...\n`);

    // --- Reference docs (deterministic, no AI) ---
    if (!artifactType || artifactType === 'reference') {
      const refMd = renderReference(d, snapshot, commitSha);
      if (isDryRun) {
        process.stdout.write(`\n=== reference: ${d}.md ===\n${refMd}\n`);
      } else {
        fs.mkdirSync(DOCS_REFERENCE_DIR, { recursive: true });
        const refPath = path.join(DOCS_REFERENCE_DIR, `${d}.md`);
        fs.writeFileSync(refPath, refMd, 'utf-8');
        process.stderr.write(`  Written: ${refPath}\n`);
      }
    }

    // --- Module overviews (AI-enriched) ---
    if (!artifactType || artifactType === 'modules') {
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
      }
    }

    // Update cache (always, unless dry-run)
    if (!isDryRun) {
      updatedCache[d] = { apiHash: snapshot.apiHash, contentHash: snapshot.contentHash };
    }
  }

  // -------------------------------------------------------------------------
  // CLAUDE.md sync
  // -------------------------------------------------------------------------
  if (!artifactType || artifactType === 'claude-md') {
    if (fs.existsSync(CLAUDE_MD_PATH)) {
      const claudeMd = fs.readFileSync(CLAUDE_MD_PATH, 'utf-8');
      const summaries: Record<string, string> = {};
      for (const [d] of snapshots) {
        const moduleDocPath = path.join(DOCS_MODULES_DIR, `${d}.md`);
        if (fs.existsSync(moduleDocPath)) {
          const moduleDoc = fs.readFileSync(moduleDocPath, 'utf-8');
          summaries[d] = generateDomainSummary(moduleDoc);
        }
      }
      if (Object.keys(summaries).length > 0) {
        const updated = updateClaudeMdSections(claudeMd, summaries);
        if (updated !== claudeMd) {
          if (isDryRun) {
            process.stderr.write('  CLAUDE.md would be updated (dry-run)\n');
          } else {
            fs.writeFileSync(CLAUDE_MD_PATH, updated, 'utf-8');
            process.stderr.write(`  Updated: ${CLAUDE_MD_PATH}\n`);
          }
        } else {
          process.stderr.write('  CLAUDE.md: no sentinel sections found to update\n');
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Changelog
  // -------------------------------------------------------------------------
  if (artifactType === 'changelog') {
    const fromRef = opts.from || '';
    const toRef = opts.to || 'HEAD';
    const range = fromRef ? `${fromRef}..${toRef}` : toRef;

    try {
      const gitLog = execSync(`git log ${range} --format="%H|%s|%b" --no-merges`, {
        encoding: 'utf-8', cwd: REPO_ROOT,
      });
      const commits = parseConventionalCommits(gitLog);

      if (commits.length === 0) {
        process.stderr.write('No conventional commits found in range.\n');
      } else {
        // AI summary (optional — skip if no TRUSTGATE/OPENAI key)
        let aiSummary: string | null = null;
        try {
          const summaryPrompt = `Summarize these commits for release notes:\n${commits.map(c => `- ${c.type}(${c.scope || 'general'}): ${c.description}`).join('\n')}`;
          aiSummary = await enrichDomain(
            'You are writing release notes. Be concise. Focus on what changed and why it matters.',
            summaryPrompt,
          );
        } catch {
          process.stderr.write('  AI summary unavailable, using commits only.\n');
        }

        const version = toRef === 'HEAD' ? 'Unreleased' : toRef;
        const changelogEntry = renderChangelog(version, commits, aiSummary);

        if (isDryRun) {
          process.stdout.write(changelogEntry + '\n');
        } else {
          const changelogPath = path.join(REPO_ROOT, 'CHANGELOG.md');
          const existing = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf-8') : '';
          fs.writeFileSync(changelogPath, changelogEntry + '\n' + existing, 'utf-8');
          process.stderr.write(`  Written: ${changelogPath}\n`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  Changelog error: ${msg}\n`);
    }
  }

  // -------------------------------------------------------------------------
  // llms.txt
  // -------------------------------------------------------------------------
  if (artifactType === 'llms-txt') {
    const llmsTxt = renderLlmsTxt([...DOMAIN_ALLOWLIST], REPO_ROOT);
    if (isDryRun) {
      process.stdout.write(llmsTxt + '\n');
    } else {
      const llmsPath = path.join(REPO_ROOT, 'llms.txt');
      fs.writeFileSync(llmsPath, llmsTxt, 'utf-8');
      process.stderr.write(`  Written: ${llmsPath}\n`);
    }
  }

  // -------------------------------------------------------------------------
  // Solana programs
  // -------------------------------------------------------------------------
  if (artifactType === 'programs') {
    const programsDir = path.join(REPO_ROOT, 'programs');
    if (fs.existsSync(programsDir)) {
      const programDirs = fs.readdirSync(programsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(programsDir, d.name));

      for (const dir of programDirs) {
        const programName = path.basename(dir);
        process.stderr.write(`Processing program: ${programName}...\n`);
        try {
          const snapshot = extractSolanaProgram(dir);

          // AI enrichment (optional)
          let aiContent: string | null = null;
          try {
            const system = 'You are documenting a Solana Anchor program. Be precise and technical.';
            const user = `Program: ${snapshot.programName}\nInstructions: ${snapshot.instructions.map(i => i.name).join(', ')}\n\nSource:\n${snapshot.sourceContent.slice(0, 15000)}\n\nGenerate: Purpose, Architecture, Patterns & Gotchas sections.`;
            aiContent = await enrichDomain(system, user);
          } catch {
            process.stderr.write(`  AI unavailable for ${programName}\n`);
          }

          const doc = renderProgramDoc(snapshot, commitSha, aiContent);
          const outDir = path.join(DOCS_MODULES_DIR, 'programs');
          fs.mkdirSync(outDir, { recursive: true });
          const outPath = path.join(outDir, `${programName}.md`);

          if (isDryRun) {
            process.stdout.write(`\n=== program: ${programName}.md ===\n${doc}\n`);
          } else {
            fs.writeFileSync(outPath, doc, 'utf-8');
            process.stderr.write(`  Written: ${outPath}\n`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`  Skipping ${programName}: ${msg}\n`);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // EVM contracts
  // -------------------------------------------------------------------------
  if (artifactType === 'contracts') {
    const contractsDir = path.join(REPO_ROOT, 'contracts', 'src');
    if (fs.existsSync(contractsDir)) {
      const solFiles = fs.readdirSync(contractsDir)
        .filter(f => f.endsWith('.sol') && !f.startsWith('Mock'));

      for (const file of solFiles) {
        const contractPath = path.join(contractsDir, file);
        const contractName = file.replace('.sol', '');
        process.stderr.write(`Processing contract: ${contractName}...\n`);
        try {
          const snapshot = extractSolidityContract(contractPath);

          // AI enrichment (optional)
          let aiContent: string | null = null;
          try {
            const system = 'You are documenting an EVM Solidity smart contract. Be precise and technical.';
            const user = `Contract: ${snapshot.contractName}\nFunctions: ${snapshot.functions.map(f => f.name).join(', ')}\n\nSource:\n${snapshot.sourceContent.slice(0, 15000)}\n\nGenerate: Purpose, Architecture, Patterns & Gotchas sections.`;
            aiContent = await enrichDomain(system, user);
          } catch {
            process.stderr.write(`  AI unavailable for ${contractName}\n`);
          }

          const doc = renderContractDoc(snapshot, commitSha, aiContent);
          const outDir = path.join(DOCS_MODULES_DIR, 'contracts');
          fs.mkdirSync(outDir, { recursive: true });
          const outPath = path.join(outDir, `${contractName}.md`);

          if (isDryRun) {
            process.stdout.write(`\n=== contract: ${contractName}.md ===\n${doc}\n`);
          } else {
            fs.writeFileSync(outPath, doc, 'utf-8');
            process.stderr.write(`  Written: ${outPath}\n`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`  Skipping ${contractName}: ${msg}\n`);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Mintlify sync — push generated docs to public docs site
  // -------------------------------------------------------------------------
  if (artifactType === 'mintlify' || !artifactType) {
    const mintlifyDir = path.resolve(REPO_ROOT, '..', 'docs'); // /c/docs/
    if (fs.existsSync(mintlifyDir)) {
      process.stderr.write('Syncing to Mintlify docs site...\n');
      const syncResult = syncToMintlify(DOCS_MODULES_DIR, mintlifyDir, {
        dryRun: isDryRun,
        programs: path.join(DOCS_MODULES_DIR, 'programs'),
        contracts: path.join(DOCS_MODULES_DIR, 'contracts'),
      });

      const docsJsonPath = path.join(mintlifyDir, 'docs.json');
      const addedToNav = updateDocsJson(docsJsonPath, syncResult, isDryRun);

      for (const p of syncResult.created) process.stderr.write(`  Created: ${p}.mdx\n`);
      for (const p of syncResult.updated) process.stderr.write(`  Updated: ${p}.mdx\n`);
      for (const p of syncResult.skipped) process.stderr.write(`  Skipped: ${p}\n`);
      if (addedToNav.length > 0) {
        process.stderr.write(`  Added to docs.json nav: ${addedToNav.join(', ')}\n`);
      }
    } else {
      process.stderr.write('  Mintlify docs dir not found (expected at ../docs/). Skipping sync.\n');
    }
  }

  // -------------------------------------------------------------------------
  // Pages (adapter-based extraction → optional AI enrichment → .mdx)
  // -------------------------------------------------------------------------
  if (artifactType === 'pages') {
    const adapterFilter = opts.adapter;
    const outputDir = opts.output
      ? path.resolve(opts.output)
      : path.resolve(__dirname, '..', 'output');

    process.stderr.write('Extracting pages from adapters...\n');
    const pages = await extractAllPages(adapterFilter);
    process.stderr.write(`  Found ${pages.length} page(s)\n`);

    for (const page of pages) {
      process.stderr.write(`  Processing: ${page.pagePath}...\n`);

      let body: string;
      if (page.needsEnrichment) {
        try {
          body = await enrichPage(page.title, page.description, page.rawContent, page.sourceFile);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`    AI enrichment failed: ${msg}. Using raw content.\n`);
          body = page.rawContent;
        }
      } else {
        body = page.rawContent;
      }

      const mdx = renderPage(page, body);

      if (isDryRun) {
        process.stdout.write(`\n=== page: ${page.pagePath}.mdx ===\n${mdx}\n`);
      } else {
        const outPath = path.join(outputDir, `${page.pagePath}.mdx`);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, mdx, 'utf-8');
        process.stderr.write(`    Written: ${outPath}\n`);
      }
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
