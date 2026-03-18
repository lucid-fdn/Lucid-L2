import fs from 'fs';
import path from 'path';

const DOMAIN_DISPLAY_NAMES: Record<string, string> = {
  identity: 'Identity & Passports',
  memory: 'Memory System',
  receipt: 'Receipt System',
  epoch: 'Epoch & Anchoring',
  payment: 'Payment System',
  compute: 'Compute & Runtime',
  deployment: 'Deployment Control Plane',
  anchoring: 'Anchoring',
  reputation: 'Reputation',
};

const HEADER = `# Lucid L2
> Autonomous AI infrastructure layer with verifiable identity, memory,
> compute, and payments on Solana + EVM.`;

const STACK_SECTION = `## Stack
- TypeScript 5.0, Node.js 20+, Express 4.18
- Solana (Anchor 0.31), EVM (ethers 6, viem 2)
- Supabase PostgreSQL, SQLite (per-agent), Redis
- Arweave, Lighthouse (DePIN storage)`;

/**
 * Extract interface names from the Key Interfaces table in a module doc.
 * Matches rows of the form: | `InterfaceName` | ... |
 * Returns an array of [name, role] pairs where role is the Role column or "—".
 */
function extractKeyInterfaces(content: string): Array<{ name: string; role: string }> {
  const results: Array<{ name: string; role: string }> = [];

  // Find the Key Interfaces section
  const sectionMatch = content.match(/## Key Interfaces\s*\n([\s\S]*?)(?=\n## |$)/);
  if (!sectionMatch) return results;

  const section = sectionMatch[1];

  // Match table rows: | `InterfaceName` | some/file.ts | Role description |
  const rowPattern = /^\|\s*`([^`]+)`\s*\|\s*[^|]+\|\s*([^|]*?)\s*\|/gm;
  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(section)) !== null) {
    const name = match[1].trim();
    const role = match[2].trim() || '—';
    // Skip header rows and separator rows
    if (name === 'Interface' || name === '---' || name === '---------') continue;
    results.push({ name, role });
  }

  return results;
}

/**
 * Render a deterministic llms.txt file from existing doc artifacts.
 *
 * @param domains - ordered list of domain names to include
 * @param repoRoot - absolute path to the repository root
 * @returns the full llms.txt content as a string
 */
export function renderLlmsTxt(domains: string[], repoRoot: string): string {
  const modulesDir = path.join(repoRoot, 'docs', 'modules');
  const referenceDir = path.join(repoRoot, 'docs', 'reference');
  const openapiPath = path.join(repoRoot, 'openapi.yaml');

  const lines: string[] = [];

  // Header
  lines.push(HEADER);
  lines.push('');

  // Docs section — one link per domain module doc that exists on disk
  const moduleLinks: string[] = [];
  for (const domain of domains) {
    const filePath = path.join(modulesDir, `${domain}.md`);
    if (fs.existsSync(filePath)) {
      const display = DOMAIN_DISPLAY_NAMES[domain] ?? domain;
      moduleLinks.push(`- [${display}](docs/modules/${domain}.md)`);
    }
  }

  if (moduleLinks.length > 0) {
    lines.push('## Docs');
    lines.push(...moduleLinks);
    lines.push('');
  }

  // API Reference section — one link per domain reference doc + openapi.yaml
  const referenceLinks: string[] = [];

  if (fs.existsSync(openapiPath)) {
    referenceLinks.push('- [OpenAPI Spec](openapi.yaml)');
  }

  for (const domain of domains) {
    const filePath = path.join(referenceDir, `${domain}.md`);
    if (fs.existsSync(filePath)) {
      const display = DOMAIN_DISPLAY_NAMES[domain] ?? domain;
      referenceLinks.push(`- [${display} Reference](docs/reference/${domain}.md)`);
    }
  }

  if (referenceLinks.length > 0) {
    lines.push('## API Reference');
    lines.push(...referenceLinks);
    lines.push('');
  }

  // Key Interfaces section — extracted from each module doc
  const interfaceLines: string[] = [];
  for (const domain of domains) {
    const filePath = path.join(modulesDir, `${domain}.md`);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    const interfaces = extractKeyInterfaces(content);

    for (const { name, role } of interfaces) {
      const description = role && role !== '—' ? role : filePath;
      interfaceLines.push(`- ${name}: ${description}`);
    }
  }

  if (interfaceLines.length > 0) {
    lines.push('## Key Interfaces');
    lines.push(...interfaceLines);
    lines.push('');
  }

  // Stack section — hardcoded
  lines.push(STACK_SECTION);

  return lines.join('\n');
}
