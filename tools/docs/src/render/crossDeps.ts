import type { DependencyEdge } from '../extract/types';

function formatSymbols(symbols: string[]): string {
  return symbols.map((s) => `\`${s}\``).join(', ');
}

function mdRow(...cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

export function renderCrossDeps(domain: string, allEdges: DependencyEdge[]): string {
  // imports: edges where this domain imports from another
  const importEdges = allEdges
    .filter((e) => e.fromDomain === domain && e.toDomain !== domain)
    .sort((a, b) => a.toDomain.localeCompare(b.toDomain));

  // exports to: edges where another domain imports from this one
  const exportEdges = allEdges
    .filter((e) => e.toDomain === domain && e.fromDomain !== domain)
    .sort((a, b) => a.fromDomain.localeCompare(b.fromDomain));

  if (importEdges.length === 0 && exportEdges.length === 0) {
    return '## Cross-Domain Dependencies\n\nNo cross-domain dependencies detected.';
  }

  const lines: string[] = [
    '## Cross-Domain Dependencies',
    '',
    '| Direction | Domain | Symbols | Purpose |',
    '|-----------|--------|---------|---------|',
  ];

  for (const edge of importEdges) {
    lines.push(mdRow('imports', edge.toDomain, formatSymbols(edge.importedSymbols), '—'));
  }

  for (const edge of exportEdges) {
    lines.push(mdRow('exports to', edge.fromDomain, formatSymbols(edge.importedSymbols), '—'));
  }

  return lines.join('\n');
}
