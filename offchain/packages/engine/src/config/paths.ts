import path from 'path';

// Repo root (Lucid-L2/) — works regardless of which package we're in.
// From offchain/src/utils/ → offchain → Lucid-L2
// From offchain/packages/engine/src/config/ → src → engine → packages → offchain → Lucid-L2
// We detect by looking for the 'offchain' directory name in ancestors.
function findRepoRoot(): string {
  let dir = __dirname;
  // Walk up until we find the directory that contains 'offchain' as a child
  for (let i = 0; i < 10; i++) {
    const parent = path.dirname(dir);
    if (path.basename(dir) === 'offchain') {
      return parent;
    }
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  // Fallback: assume offchain/src/utils structure
  return path.resolve(__dirname, '../../..');
}

const REPO_ROOT = findRepoRoot();

/**
 * Canonical paths to repo-level directories.
 * All code should use these instead of __dirname escaping.
 */
export const PATHS = {
  REPO_ROOT,
  OFFCHAIN_ROOT: path.join(REPO_ROOT, 'offchain'),
  SCHEMAS_DIR: path.join(REPO_ROOT, 'schemas'),
  GOLDEN_DIR: path.join(REPO_ROOT, 'schemas', 'golden'),
  IDL_DIR: path.join(REPO_ROOT, 'target', 'idl'),
  DATA_DIR: path.join(REPO_ROOT, 'data'),
  OPENAPI_SPEC: path.join(REPO_ROOT, 'offchain', 'openapi.yaml'),
  AUTH_FRONTEND_DIST: path.join(REPO_ROOT, 'auth-frontend', 'dist'),
} as const;
