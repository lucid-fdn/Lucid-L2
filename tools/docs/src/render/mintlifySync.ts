/**
 * Mintlify Sync — converts generated module docs to .mdx and syncs to /c/docs/
 *
 * Maps internal domain names to Mintlify page paths and frontmatter.
 * Preserves Mintlify frontmatter (title, description) while replacing body content.
 * Creates new pages for domains that don't have a Mintlify page yet.
 */

import fs from 'fs';
import path from 'path';

interface MintlifyMapping {
  /** Path relative to docs repo root (without .mdx extension) */
  pagePath: string;
  /** Mintlify frontmatter title */
  title: string;
  /** Mintlify frontmatter description */
  description: string;
  /** Navigation group in docs.json */
  group: string;
}

/** Maps internal domain names to Mintlify page config */
const DOMAIN_TO_MINTLIFY: Record<string, MintlifyMapping> = {
  identity: {
    pagePath: 'concepts/passports',
    title: 'Passports',
    description: 'Universal identity layer for models, compute nodes, tools, datasets, and agents',
    group: 'Core Concepts',
  },
  memory: {
    pagePath: 'concepts/memory',
    title: 'Memory',
    description: 'Per-agent persistent memory with 6 types, vector search, and tiered compaction',
    group: 'Core Concepts',
  },
  receipt: {
    pagePath: 'concepts/receipts',
    title: 'Receipts',
    description: 'Cryptographic proofs for every AI execution — creation, signing, and verification',
    group: 'Core Concepts',
  },
  epoch: {
    pagePath: 'concepts/epochs',
    title: 'Epochs',
    description: 'Receipt batching, MMR trees, and multi-chain on-chain anchoring',
    group: 'Core Concepts',
  },
  payment: {
    pagePath: 'concepts/payments',
    title: 'Payments',
    description: 'x402 payment protocol with dynamic pricing, revenue splits, and escrow',
    group: 'Core Concepts',
  },
  compute: {
    pagePath: 'concepts/agents',
    title: 'Agents',
    description: 'Agent deployment across 6 providers with runtime adapters and A2A protocol',
    group: 'Core Concepts',
  },
  deployment: {
    pagePath: 'concepts/deployment',
    title: 'Deployment',
    description: 'Blue-green rollouts, drift reconciliation, and durable deployment state',
    group: 'Core Concepts',
  },
  anchoring: {
    pagePath: 'concepts/depin-storage',
    title: 'DePIN Storage',
    description: 'Unified anchoring interface for Arweave, Lighthouse, and on-chain proofs',
    group: 'Ownership & Storage',
  },
  reputation: {
    pagePath: 'concepts/reputation',
    title: 'Reputation',
    description: 'On-chain and off-chain reputation scoring for agents and providers',
    group: 'Core Concepts',
  },
};

/** Solana program mappings */
const PROGRAM_MAPPINGS: Record<string, MintlifyMapping> = {
  'thought-epoch': {
    pagePath: 'concepts/solana/thought-epoch',
    title: 'Thought Epoch Program',
    description: 'MMR root commitment on Solana — single, batch, and v2 instructions',
    group: 'Solana Programs',
  },
  'lucid-passports': {
    pagePath: 'concepts/solana/lucid-passports',
    title: 'Lucid Passports Program',
    description: 'On-chain passport registry with x402 payment gating',
    group: 'Solana Programs',
  },
  'gas-utils': {
    pagePath: 'concepts/solana/gas-utils',
    title: 'Gas Utils Program',
    description: 'Token burn/split CPI and on-chain distribution',
    group: 'Solana Programs',
  },
  'lucid-agent-wallet': {
    pagePath: 'concepts/solana/lucid-agent-wallet',
    title: 'Agent Wallet Program',
    description: 'PDA wallets, policy enforcement, escrow, splits, and session keys',
    group: 'Solana Programs',
  },
  'lucid-zkml-verifier': {
    pagePath: 'concepts/solana/lucid-zkml-verifier',
    title: 'zkML Verifier Program',
    description: 'Groth16 zkML proof verification with bloom filter deduplication',
    group: 'Solana Programs',
  },
  'lucid-reputation': {
    pagePath: 'concepts/solana/lucid-reputation',
    title: 'Reputation Program',
    description: 'On-chain reputation feedback, validation, and revocation',
    group: 'Solana Programs',
  },
};

/**
 * Convert a generated markdown doc to Mintlify MDX format.
 * Strips the HTML generation comment, adds frontmatter.
 */
function toMdx(content: string, mapping: MintlifyMapping): string {
  // Strip generation comment
  let body = content
    .replace(/^<!-- generated:.*-->\n?/, '')
    .replace(/^<!-- WARNING:.*-->\n?/, '')
    .trim();

  // Strip the H1 title (Mintlify generates it from frontmatter)
  body = body.replace(/^# .+\n+/, '');

  const frontmatter = `---
title: "${mapping.title}"
description: "${mapping.description}"
---`;

  return `${frontmatter}\n\n${body}\n`;
}

export interface SyncResult {
  created: string[];
  updated: string[];
  skipped: string[];
}

/**
 * Sync generated docs to a Mintlify docs directory.
 *
 * @param generatedDocsDir - Path to generated docs (e.g., /c/Lucid-L2/docs/modules/)
 * @param mintlifyDocsDir - Path to Mintlify docs repo (e.g., /c/docs/)
 * @param dryRun - If true, don't write files
 */
export function syncToMintlify(
  generatedDocsDir: string,
  mintlifyDocsDir: string,
  options: { dryRun?: boolean; programs?: string; contracts?: string } = {},
): SyncResult {
  const result: SyncResult = { created: [], updated: [], skipped: [] };

  // Sync domain module docs
  for (const [domain, mapping] of Object.entries(DOMAIN_TO_MINTLIFY)) {
    const srcPath = path.join(generatedDocsDir, `${domain}.md`);
    if (!fs.existsSync(srcPath)) {
      result.skipped.push(`${domain}: source not found`);
      continue;
    }

    const content = fs.readFileSync(srcPath, 'utf-8');
    const mdx = toMdx(content, mapping);
    const destPath = path.join(mintlifyDocsDir, `${mapping.pagePath}.mdx`);
    const isNew = !fs.existsSync(destPath);

    if (!options.dryRun) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, mdx, 'utf-8');
    }

    if (isNew) {
      result.created.push(mapping.pagePath);
    } else {
      result.updated.push(mapping.pagePath);
    }
  }

  // Sync Solana program docs
  const programsDir = options.programs || path.join(generatedDocsDir, 'programs');
  if (fs.existsSync(programsDir)) {
    for (const [programName, mapping] of Object.entries(PROGRAM_MAPPINGS)) {
      const srcPath = path.join(programsDir, `${programName}.md`);
      if (!fs.existsSync(srcPath)) {
        result.skipped.push(`program/${programName}: source not found`);
        continue;
      }

      const content = fs.readFileSync(srcPath, 'utf-8');
      const mdx = toMdx(content, mapping);
      const destPath = path.join(mintlifyDocsDir, `${mapping.pagePath}.mdx`);
      const isNew = !fs.existsSync(destPath);

      if (!options.dryRun) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, mdx, 'utf-8');
      }

      if (isNew) {
        result.created.push(mapping.pagePath);
      } else {
        result.updated.push(mapping.pagePath);
      }
    }
  }

  return result;
}

/**
 * Update docs.json navigation to include new pages.
 * Only adds pages that don't already exist in the navigation.
 */
export function updateDocsJson(
  docsJsonPath: string,
  syncResult: SyncResult,
  dryRun: boolean = false,
): string[] {
  if (!fs.existsSync(docsJsonPath)) return [];

  const config = JSON.parse(fs.readFileSync(docsJsonPath, 'utf-8'));
  const added: string[] = [];

  // Collect all existing page paths in navigation
  const existingPages = new Set<string>();
  for (const tab of config.navigation?.tabs || []) {
    for (const group of tab.groups || []) {
      for (const page of group.pages || []) {
        if (typeof page === 'string') existingPages.add(page);
      }
    }
  }

  // Add newly created pages to the appropriate group
  for (const pagePath of syncResult.created) {
    if (existingPages.has(pagePath)) continue;

    // Find the mapping to determine the group
    const mapping = Object.values(DOMAIN_TO_MINTLIFY).find(m => m.pagePath === pagePath)
      || Object.values(PROGRAM_MAPPINGS).find(m => m.pagePath === pagePath);
    if (!mapping) continue;

    // Find or create the group in the Overview tab
    const overviewTab = config.navigation?.tabs?.find((t: any) => t.tab === 'Overview');
    if (!overviewTab) continue;

    let targetGroup = overviewTab.groups.find((g: any) => g.group === mapping.group);
    if (!targetGroup) {
      targetGroup = { group: mapping.group, pages: [] };
      overviewTab.groups.push(targetGroup);
    }

    targetGroup.pages.push(pagePath);
    added.push(pagePath);
  }

  if (added.length > 0 && !dryRun) {
    fs.writeFileSync(docsJsonPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  }

  return added;
}
