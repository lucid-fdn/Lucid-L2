import path from 'path';

export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
export const ENGINE_SRC = path.join(REPO_ROOT, 'offchain', 'packages', 'engine', 'src');
export const DOCS_MODULES_DIR = path.join(REPO_ROOT, 'docs', 'modules');
export const CACHE_DIR = path.join(__dirname, '..', 'cache');
export const CACHE_FILE = path.join(CACHE_DIR, 'hashes.json');
export const DOCS_REFERENCE_DIR = path.join(REPO_ROOT, 'docs', 'reference');
export const CLAUDE_MD_PATH = path.join(REPO_ROOT, 'CLAUDE.md');

export const DOMAIN_ALLOWLIST = [
  'identity',
  'memory',
  'receipt',
  'epoch',
  'payment',
  'compute',
  'deployment',
  'anchoring',
  'reputation',
] as const;

export type DomainName = (typeof DOMAIN_ALLOWLIST)[number];

export function getDomainPath(domain: DomainName): string {
  return path.join(ENGINE_SRC, domain);
}

export const MAX_TOKEN_BUDGET = 25_000;
export const APPROX_CHARS_PER_TOKEN = 4;
export const MAX_CHAR_BUDGET = MAX_TOKEN_BUDGET * APPROX_CHARS_PER_TOKEN;
export const ORCHESTRATOR_PATTERNS = ['Service.ts', 'Manager.ts', 'Store.ts'];
export const TOP_FILES_BY_EXPORTS = 5;
export const TOP_FILES_BY_CROSS_IMPORTS = 2;
