import type {
  DomainSnapshot,
  InterfaceInfo,
  FunctionInfo,
  TypeInfo,
  PropertyInfo,
  MethodInfo,
  ParamInfo,
} from '../extract/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mdRow(...cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

function firstJsDocLine(jsDoc: string | null): string {
  if (!jsDoc) return '';
  const line = jsDoc.trim().split('\n')[0].trim();
  return line;
}

function boolLabel(value: boolean): string {
  return value ? 'yes' : 'no';
}

function optionalLabel(value: boolean): string {
  return value ? 'yes' : 'no';
}

function formatParam(p: ParamInfo): string {
  const opt = p.optional ? '?' : '';
  return `\`${p.name}\`${opt}: \`${p.type}\``;
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderInterfacesSection(interfaces: InterfaceInfo[]): string[] {
  if (interfaces.length === 0) return [];

  const sorted = [...interfaces].sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = ['## Interfaces', ''];

  for (const iface of sorted) {
    lines.push(`### ${iface.name}`);
    lines.push(`> \`${iface.filePath}\``);
    lines.push('');

    const desc = firstJsDocLine(iface.jsDoc);
    if (desc) {
      lines.push(desc);
      lines.push('');
    }

    // Properties table
    if (iface.properties.length > 0) {
      const sortedProps = [...iface.properties].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      lines.push('**Properties**');
      lines.push('');
      lines.push('| Property | Type | Optional | Description |');
      lines.push('|----------|------|----------|-------------|');
      for (const prop of sortedProps) {
        const propDesc = firstJsDocLine(prop.jsDoc);
        lines.push(
          mdRow(
            `\`${prop.name}\``,
            `\`${prop.type}\``,
            optionalLabel(prop.optional),
            propDesc,
          ),
        );
      }
      lines.push('');
    }

    // Methods table
    if (iface.methods.length > 0) {
      const sortedMethods = [...iface.methods].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      lines.push('**Methods**');
      lines.push('');
      lines.push('| Method | Params | Return Type | Description |');
      lines.push('|--------|--------|-------------|-------------|');
      for (const method of sortedMethods) {
        const params = method.params.map(formatParam).join(', ');
        const methodDesc = firstJsDocLine(method.jsDoc);
        lines.push(
          mdRow(
            `\`${method.name}\``,
            params,
            `\`${method.returnType}\``,
            methodDesc,
          ),
        );
      }
      lines.push('');
    }

    // Extends
    if (iface.extends.length > 0) {
      lines.push(`**Extends:** \`${iface.extends.join('`, `')}\``);
    } else {
      lines.push('**Extends:** —');
    }
    lines.push('');
  }

  return lines;
}

function renderFunctionsSection(functions: FunctionInfo[]): string[] {
  if (functions.length === 0) return [];

  const sorted = [...functions].sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = ['## Functions', ''];

  for (const fn of sorted) {
    lines.push(`### ${fn.name}`);
    lines.push(`> \`${fn.filePath}\``);
    lines.push('');

    const desc = firstJsDocLine(fn.jsDoc);
    if (desc) {
      lines.push(desc);
      lines.push('');
    }

    // Params table
    if (fn.params.length > 0) {
      lines.push('| Param | Type | Optional | Default |');
      lines.push('|-------|------|----------|---------|');
      for (const param of fn.params) {
        lines.push(
          mdRow(
            `\`${param.name}\``,
            `\`${param.type}\``,
            optionalLabel(param.optional),
            param.defaultValue !== null ? `\`${param.defaultValue}\`` : '—',
          ),
        );
      }
      lines.push('');
    }

    lines.push(`**Returns:** \`${fn.returnType}\``);
    lines.push('');
    lines.push(`**Async:** ${boolLabel(fn.isAsync)}`);
    lines.push('');
  }

  return lines;
}

function renderTypesSection(types: TypeInfo[]): string[] {
  const aliases = types.filter((t) => t.kind === 'alias');
  if (aliases.length === 0) return [];

  const sorted = [...aliases].sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = ['## Types', ''];

  for (const t of sorted) {
    lines.push(`### ${t.name}`);
    lines.push(`> \`${t.filePath}\``);
    lines.push('');

    const desc = firstJsDocLine(t.jsDoc);
    if (desc) {
      lines.push(desc);
      lines.push('');
    }

    lines.push('```ts');
    lines.push(`type ${t.name} = ${t.definition}`);
    lines.push('```');
    lines.push('');
  }

  return lines;
}

function renderEnumsSection(types: TypeInfo[]): string[] {
  const enums = types.filter((t) => t.kind === 'enum');
  if (enums.length === 0) return [];

  const sorted = [...enums].sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = ['## Enums', ''];

  for (const t of sorted) {
    lines.push(`### ${t.name}`);
    lines.push(`> \`${t.filePath}\``);
    lines.push('');

    const desc = firstJsDocLine(t.jsDoc);
    if (desc) {
      lines.push(desc);
      lines.push('');
    }

    // definition is a comma-separated member name list, e.g. "warm, cold, full"
    const members = t.definition.split(', ').map((m) => m.trim()).filter(Boolean);

    lines.push('| Value | Description |');
    lines.push('|-------|-------------|');
    for (const member of members) {
      lines.push(mdRow(`\`${member}\``, ''));
    }
    lines.push('');
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a full deterministic reference document for a domain snapshot.
 * Zero AI involvement — purely structural transformation of extracted types.
 */
export function renderReference(
  domain: string,
  snapshot: DomainSnapshot,
  commitSha: string,
): string {
  const timestamp = new Date().toISOString();

  const lines: string[] = [];

  // Header
  lines.push(`<!-- generated: commit ${commitSha}, ${timestamp} -->`);
  lines.push(`# ${domain} — Interface Reference`);
  lines.push('');

  // Sections (ordered: Interfaces → Functions → Types → Enums)
  const interfacesLines = renderInterfacesSection(snapshot.interfaces);
  const functionsLines = renderFunctionsSection(snapshot.functions);
  const typesLines = renderTypesSection(snapshot.types);
  const enumsLines = renderEnumsSection(snapshot.types);

  for (const section of [interfacesLines, functionsLines, typesLines, enumsLines]) {
    if (section.length > 0) {
      lines.push(...section);
    }
  }

  return lines.join('\n');
}
