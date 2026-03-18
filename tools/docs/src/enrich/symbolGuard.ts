import type { DomainSnapshot } from '../extract/types';

const COMMON_WORDS = new Set([
  // Tech acronyms
  'HTTP', 'JSON', 'API', 'URL', 'SQL', 'DNS', 'TLS', 'SSL', 'JWT', 'OAuth',
  'CRUD', 'REST', 'RPC', 'SDK', 'CLI', 'UUID', 'ULID', 'SHA', 'Ed25519',
  // JS built-ins
  'Promise', 'Array', 'Map', 'Set', 'Date', 'Error', 'Buffer', 'String',
  'Number', 'Boolean', 'Object', 'Function', 'RegExp', 'Symbol', 'BigInt',
  // Platform / ecosystem names
  'Solana', 'Ethereum', 'Supabase', 'PostgreSQL', 'SQLite', 'Redis', 'Docker',
  'Arweave', 'Lighthouse', 'Akash', 'Phala', 'Nosana', 'Metaplex',
  'TypeScript', 'JavaScript', 'Node', 'Express', 'React',
  'DePIN', 'EVM', 'Lucid', 'TrustGate', 'CrewAI', 'LangGraph', 'OpenAI',
  // Common doc section words (single-uppercase, kept here for explicit safety)
  'Phase', 'Purpose', 'Architecture', 'Data', 'Flow', 'Patterns', 'Gotchas',
  'Key', 'Interfaces', 'Cross', 'Domain', 'Dependencies', 'Section',
]);

export function checkSymbols(
  aiText: string,
  snapshot: Pick<DomainSnapshot, 'interfaces' | 'functions' | 'types'>,
): string[] {
  // Build known symbols set from snapshot
  const known = new Set<string>();

  for (const iface of snapshot.interfaces) {
    known.add(iface.name);
    for (const method of iface.methods) known.add(method.name);
    for (const prop of iface.properties) known.add(prop.name);
  }

  for (const fn of snapshot.functions) {
    known.add(fn.name);
  }

  for (const type of snapshot.types) {
    known.add(type.name);
  }

  // Collect candidate identifiers from AI text
  const candidates = new Set<string>();

  // 1. Backticked identifiers — PascalCase and camelCase (3+ chars)
  const backtickRe = /`([A-Za-z][a-zA-Z0-9]{2,})`/g;
  let m: RegExpExecArray | null;
  while ((m = backtickRe.exec(aiText)) !== null) {
    candidates.add(m[1]);
  }

  // 2. Compound PascalCase: must have at least 2 uppercase letters (avoids
  //    false positives on plain English words like "Unified" or "Storage")
  const compoundPascalRe = /\b([A-Z][a-z]+[A-Z][a-zA-Z0-9]*)\b/g;
  while ((m = compoundPascalRe.exec(aiText)) !== null) {
    candidates.add(m[1]);
  }

  // 3. I-prefixed interface names (IStore, ICache, …)
  const iPrefixRe = /\b(I[A-Z][a-zA-Z0-9]+)\b/g;
  while ((m = iPrefixRe.exec(aiText)) !== null) {
    candidates.add(m[1]);
  }

  // Flag anything not in known symbols AND not in common words
  const flagged: string[] = [];
  for (const id of candidates) {
    if (!known.has(id) && !COMMON_WORDS.has(id)) {
      flagged.push(id);
    }
  }

  return flagged.sort();
}
