import type { InterfaceInfo, TypeInfo } from '../extract/types';

function firstJsDocLine(jsDoc: string | null): string {
  if (!jsDoc) return '—';
  const line = jsDoc.trim().split('\n')[0].trim();
  return line.length > 0 ? line : '—';
}

function mdRow(...cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

export function renderKeyInterfaces(
  interfaces: InterfaceInfo[],
  types: TypeInfo[],
): string {
  const sorted = [...interfaces].sort((a, b) => a.name.localeCompare(b.name));

  const header = [
    '## Key Interfaces',
    '',
    '| Interface | File | Role |',
    '|-----------|------|------|',
  ];

  const rows = sorted.map((iface) =>
    mdRow(`\`${iface.name}\``, `\`${iface.filePath}\``, firstJsDocLine(iface.jsDoc)),
  );

  const sections: string[] = [...header, ...rows];

  // Notable types: those with JSDoc
  const notableTypes = [...types]
    .filter((t) => t.jsDoc !== null && t.jsDoc.trim().length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (notableTypes.length > 0) {
    sections.push('');
    sections.push('### Key Types');
    sections.push('');
    sections.push('| Type | File | Kind | Description |');
    sections.push('|------|------|------|-------------|');
    for (const t of notableTypes) {
      sections.push(
        mdRow(`\`${t.name}\``, `\`${t.filePath}\``, t.kind, firstJsDocLine(t.jsDoc)),
      );
    }
  }

  return sections.join('\n');
}
