import type { ProgramSnapshot, ContractSnapshot } from '../extract/programExtractor';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function mdRow(...cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

const AI_STUB = `
## Purpose

> AI enrichment pending — run the pipeline with \`DOCS_MODEL\` set to populate this section.

## Architecture

> AI enrichment pending.

## Patterns & Gotchas

> AI enrichment pending.
`.trim();

/**
 * Parse the AI content string into named sections.
 * Expects markdown H2 sections: ## Purpose, ## Architecture, ## Patterns & Gotchas.
 * Returns the full aiContent string if it cannot be split, so callers always
 * get something meaningful.
 */
function renderAiSections(aiContent: string | null): string {
  if (!aiContent) return AI_STUB;
  return aiContent.trim();
}

// ---------------------------------------------------------------------------
// Solana program doc
// ---------------------------------------------------------------------------

function renderInstructionsTable(
  instructions: { name: string; params: string[] }[],
): string[] {
  if (instructions.length === 0) return [];

  const lines: string[] = [
    '## Instructions',
    '',
    '| Instruction | Parameters |',
    '|-------------|------------|',
  ];

  for (const ix of instructions) {
    const params = ix.params.length > 0 ? ix.params.map((p) => `\`${p}\``).join(', ') : '—';
    lines.push(mdRow(`\`${ix.name}\``, params));
  }

  lines.push('');
  return lines;
}

function renderAccountStructsTable(
  structs: { name: string; fields: string[] }[],
): string[] {
  if (structs.length === 0) return [];

  const lines: string[] = [
    '## Account Structs',
    '',
    '| Struct | Fields |',
    '|--------|--------|',
  ];

  for (const s of structs) {
    const fields = s.fields.length > 0 ? s.fields.map((f) => `\`${f}\``).join(', ') : '—';
    lines.push(mdRow(`\`${s.name}\``, fields));
  }

  lines.push('');
  return lines;
}

/**
 * Render a full markdown documentation page for a Solana Anchor program.
 *
 * Structure:
 * 1. Generation comment (deterministic header)
 * 2. Title
 * 3. AI sections (Purpose / Architecture / Patterns & Gotchas) or stub
 * 4. Instructions table (deterministic)
 * 5. Account Structs table (deterministic)
 */
export function renderProgramDoc(
  snapshot: ProgramSnapshot,
  commitSha: string,
  aiContent: string | null,
): string {
  const timestamp = new Date().toISOString();
  const lines: string[] = [];

  // Header
  lines.push(`<!-- generated: commit ${commitSha}, ${timestamp} -->`);
  lines.push(`# ${snapshot.programName} — Solana Program`);
  lines.push('');
  lines.push(`> **Source:** \`${snapshot.sourcePath}\``);
  lines.push('');

  // AI narrative sections
  lines.push(renderAiSections(aiContent));
  lines.push('');

  // Deterministic tables
  const instructionLines = renderInstructionsTable(snapshot.instructions);
  if (instructionLines.length > 0) {
    lines.push(...instructionLines);
  }

  const structLines = renderAccountStructsTable(snapshot.accountStructs);
  if (structLines.length > 0) {
    lines.push(...structLines);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Solidity contract doc
// ---------------------------------------------------------------------------

function renderFunctionsTable(
  functions: { name: string; visibility: string; params: string }[],
): string[] {
  if (functions.length === 0) return [];

  const lines: string[] = [
    '## Functions',
    '',
    '| Function | Visibility | Parameters |',
    '|----------|------------|------------|',
  ];

  for (const fn of functions) {
    const params = fn.params.trim() || '—';
    lines.push(mdRow(`\`${fn.name}\``, fn.visibility, params));
  }

  lines.push('');
  return lines;
}

function renderEventsTable(
  events: { name: string; params: string }[],
): string[] {
  if (events.length === 0) return [];

  const lines: string[] = [
    '## Events',
    '',
    '| Event | Parameters |',
    '|-------|------------|',
  ];

  for (const ev of events) {
    const params = ev.params.trim() || '—';
    lines.push(mdRow(`\`${ev.name}\``, params));
  }

  lines.push('');
  return lines;
}

/**
 * Render a full markdown documentation page for a Solidity contract.
 *
 * Structure:
 * 1. Generation comment (deterministic header)
 * 2. Title
 * 3. AI sections (Purpose / Architecture / Patterns & Gotchas) or stub
 * 4. Functions table (deterministic)
 * 5. Events table (deterministic)
 */
export function renderContractDoc(
  snapshot: ContractSnapshot,
  commitSha: string,
  aiContent: string | null,
): string {
  const timestamp = new Date().toISOString();
  const lines: string[] = [];

  // Header
  lines.push(`<!-- generated: commit ${commitSha}, ${timestamp} -->`);
  lines.push(`# ${snapshot.contractName} — EVM Contract`);
  lines.push('');
  lines.push(`> **Source:** \`${snapshot.sourcePath}\``);
  lines.push('');

  // AI narrative sections
  lines.push(renderAiSections(aiContent));
  lines.push('');

  // Deterministic tables
  const fnLines = renderFunctionsTable(snapshot.functions);
  if (fnLines.length > 0) {
    lines.push(...fnLines);
  }

  const evLines = renderEventsTable(snapshot.events);
  if (evLines.length > 0) {
    lines.push(...evLines);
  }

  return lines.join('\n');
}
