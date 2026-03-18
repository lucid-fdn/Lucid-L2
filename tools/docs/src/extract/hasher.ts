import { createHash } from 'crypto';
import type { DomainSnapshot, InterfaceInfo, FunctionInfo, TypeInfo } from './types';

function serializeParam(p: { name: string; type: string; optional: boolean; defaultValue: string | null }): string {
  const opt = p.optional ? '?' : '';
  const def = p.defaultValue !== null ? `=${p.defaultValue}` : '';
  return `${p.name}${opt}: ${p.type}${def}`;
}

function serializeMethod(m: { name: string; params: Array<{ name: string; type: string; optional: boolean; defaultValue: string | null }>; returnType: string }): string {
  const params = m.params.map(serializeParam).join(', ');
  return `${m.name}(${params}): ${m.returnType}`;
}

function serializeProperty(p: { name: string; type: string; optional: boolean }): string {
  const opt = p.optional ? '?' : '';
  return `${p.name}${opt}: ${p.type}`;
}

function interfaceSignature(iface: InterfaceInfo): string {
  const sortedMethods = [...iface.methods].sort((a, b) => a.name.localeCompare(b.name)).map(serializeMethod);
  const sortedProps = [...iface.properties].sort((a, b) => a.name.localeCompare(b.name)).map(serializeProperty);
  const extendsClause = [...iface.extends].sort().join(', ');
  const parts = [`interface ${iface.name}`];
  if (extendsClause) parts.push(`extends ${extendsClause}`);
  parts.push(`methods:[${sortedMethods.join(';')}]`);
  parts.push(`props:[${sortedProps.join(';')}]`);
  return parts.join(' ');
}

function functionSignature(fn: FunctionInfo): string {
  const params = fn.params.map(serializeParam).join(', ');
  return `function ${fn.name}(${params}): ${fn.returnType}`;
}

function typeSignature(t: TypeInfo): string {
  return `${t.kind} ${t.name} = ${t.definition}`;
}

export function computeApiHash(snapshot: DomainSnapshot): string {
  const signatures: string[] = [
    ...snapshot.interfaces.map(interfaceSignature),
    ...snapshot.functions.map(functionSignature),
    ...snapshot.types.map(typeSignature),
  ];

  signatures.sort();

  const canonical = signatures.join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function computeContentHash(files: { path: string; content: string }[]): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const parts = sorted.map(f => `--- ${f.path} ---\n${f.content}`);
  const canonical = parts.join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
