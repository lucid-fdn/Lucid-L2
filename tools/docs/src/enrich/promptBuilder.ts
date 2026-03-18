import type { DomainSnapshot } from '../extract/types';

const SYSTEM_PROMPT = `You are a senior engineer writing internal architecture documentation
for the Lucid L2 platform. You write for experienced developers who are new
to this specific codebase. Be precise, technical, and concise.

Rules:
- NEVER invent function signatures, types, or parameter names
- Reference ONLY interfaces and functions listed in EXTRACTED FACTS
- Explain WHY design decisions were made, not just WHAT exists
- Describe data flows with concrete file paths (file → function → store)
- Note gotchas and non-obvious patterns
- Use backtick formatting for code identifiers

Do NOT generate interface tables, function signatures, or dependency lists.
Those are rendered separately from compiler output.`;

function serializeInterfaces(snapshot: DomainSnapshot): string {
  if (snapshot.interfaces.length === 0) return '(none)';
  return snapshot.interfaces
    .map((iface) => {
      const jsDocLine = iface.jsDoc ? iface.jsDoc.split('\n')[0].trim() : '';
      const methods = iface.methods
        .map((m) => {
          const params = m.params.map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', ');
          return `    - ${m.name}(${params}): ${m.returnType}`;
        })
        .join('\n');
      return [
        `  Interface: ${iface.name}`,
        `  File: ${iface.filePath}`,
        jsDocLine ? `  Description: ${jsDocLine}` : '',
        methods ? `  Methods:\n${methods}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

function serializeFunctions(snapshot: DomainSnapshot): string {
  if (snapshot.functions.length === 0) return '(none)';
  return snapshot.functions
    .map((fn) => {
      const jsDocLine = fn.jsDoc ? fn.jsDoc.split('\n')[0].trim() : '';
      const params = fn.params.map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', ');
      return [
        `  Function: ${fn.name}`,
        `  File: ${fn.filePath}`,
        `  Signature: ${fn.isAsync ? 'async ' : ''}(${params}): ${fn.returnType}`,
        jsDocLine ? `  Description: ${jsDocLine}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

function serializeTypes(snapshot: DomainSnapshot): string {
  if (snapshot.types.length === 0) return '(none)';
  return snapshot.types
    .map((t) => {
      return [
        `  Type: ${t.name}`,
        `  Kind: ${t.kind}`,
        `  Definition: ${t.definition}`,
      ].join('\n');
    })
    .join('\n\n');
}

function serializeImports(snapshot: DomainSnapshot): string {
  if (snapshot.imports.length === 0) return '(none)';
  return snapshot.imports
    .map((edge) => {
      const symbols = edge.importedSymbols.join(', ');
      return `  from ${edge.toDomain}: ${symbols}`;
    })
    .join('\n');
}

export function buildModulePrompt(
  snapshot: DomainSnapshot,
  sourceFiles: { path: string; content: string }[]
): { system: string; user: string } {
  const extractedFacts = [
    '### Interfaces',
    serializeInterfaces(snapshot),
    '',
    '### Functions',
    serializeFunctions(snapshot),
    '',
    '### Types',
    serializeTypes(snapshot),
    '',
    '### Imports (from domain: symbols)',
    serializeImports(snapshot),
  ].join('\n');

  const sourceExcerpts = sourceFiles
    .map(({ path, content }) => {
      return `// ${path}\n\`\`\`typescript\n${content}\n\`\`\``;
    })
    .join('\n\n');

  const userPrompt = [
    `Domain: ${snapshot.domain}`,
    `Source Path: ${snapshot.sourcePath}`,
    '',
    '## EXTRACTED FACTS',
    extractedFacts,
    '',
    '## SOURCE EXCERPTS',
    sourceExcerpts,
    '',
    '## TASK',
    'Write internal architecture documentation for this domain module.',
    'Your response MUST contain exactly these 4 sections, in this order:',
    '1. **Purpose** — Why this module exists and what problem it solves',
    '2. **Architecture** — How it is structured and the key design choices',
    '3. **Data Flow** — How data moves through this module (use concrete file → function → store paths)',
    '4. **Patterns & Gotchas** — Non-obvious patterns, edge cases, and things that will trip up new contributors',
  ].join('\n');

  return {
    system: SYSTEM_PROMPT,
    user: userPrompt,
  };
}
