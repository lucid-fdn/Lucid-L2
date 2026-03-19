/**
 * Interactive agent setup — reads manifest required_env/optional_env and prompts user.
 * Provider-agnostic: works with any agent manifest, not just specific agents.
 *
 * Three modes:
 * 1. Interactive prompts (default for humans)
 * 2. Config file (--config ./my.env for CI)
 * 3. --env flags (already handled by commander, no code needed here)
 */

import readline from 'readline';
import fs from 'fs';

export interface EnvVarSpec {
  name: string;
  description?: string;
  default?: string;
}

const SECRET_PATTERNS = ['KEY', 'TOKEN', 'SECRET', 'PASSWORD', 'CREDENTIAL', 'PRIVATE'];

function isSecret(name: string): boolean {
  return SECRET_PATTERNS.some(p => name.toUpperCase().includes(p));
}

/**
 * Prompt user interactively for env vars defined in the manifest.
 * Required vars must be provided. Optional vars show defaults.
 * Secret-looking vars get masked input hints.
 */
export async function promptForEnvVars(
  required: EnvVarSpec[],
  optional: EnvVarSpec[],
): Promise<Record<string, string>> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const env: Record<string, string> = {};

  const ask = (question: string): Promise<string> =>
    new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));

  if (required.length > 0) {
    console.log('\nRequired configuration:');
    for (const v of required) {
      const desc = v.description ? ` (${v.description})` : '';
      const hint = isSecret(v.name) ? ' [input hidden in logs]' : '';
      let value = '';
      while (!value) {
        value = await ask(`  ${v.name}${desc}${hint}: `);
        if (!value) console.log(`    ${v.name} is required`);
      }
      env[v.name] = value;
    }
  }

  if (optional.length > 0) {
    console.log('\nOptional configuration (press Enter for default):');
    for (const v of optional) {
      const defaultStr = v.default ? ` [${v.default}]` : '';
      const desc = v.description ? ` (${v.description})` : '';
      const value = await ask(`  ${v.name}${desc}${defaultStr}: `);
      env[v.name] = value || v.default || '';
    }
  }

  rl.close();
  return env;
}

/**
 * Load env vars from a .env-style config file.
 * Supports comments (#), blank lines, KEY=VALUE format.
 */
export function loadConfigFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }

  // Warn if file permissions are too open
  try {
    const stats = fs.statSync(filePath);
    const mode = (stats.mode & 0o777).toString(8);
    if (mode !== '600' && mode !== '400') {
      console.warn(`  Warning: ${filePath} has permissions ${mode}. Recommend chmod 600 for files with secrets.`);
    }
  } catch { /* ignore stat errors */ }

  const content = fs.readFileSync(filePath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/**
 * Validate that all required env vars are present.
 * Apply defaults for optional vars not provided.
 */
export function validateEnvVars(
  env: Record<string, string>,
  required: EnvVarSpec[],
  optional: EnvVarSpec[],
): { ok: true } | { ok: false; missing: string[] } {
  const missing = required.filter(r => !env[r.name]).map(r => r.name);
  if (missing.length > 0) return { ok: false, missing };

  // Apply defaults for optional vars
  for (const o of optional) {
    if (!env[o.name] && o.default) {
      env[o.name] = o.default;
    }
  }

  return { ok: true };
}

/**
 * Resolve agent env vars from all three sources.
 * Priority: --env flags > config file > interactive prompts > manifest defaults
 */
export async function resolveAgentEnv(opts: {
  required: EnvVarSpec[];
  optional: EnvVarSpec[];
  configFile?: string;
  envFlags?: Record<string, string>;
  nonInteractive?: boolean;
}): Promise<{ ok: true; env: Record<string, string> } | { ok: false; error: string }> {
  let env: Record<string, string> = {};

  // Config file (mode 2)
  if (opts.configFile) {
    try {
      env = loadConfigFile(opts.configFile);
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
  // Interactive prompts (mode 1) — only if no config file and no --env flags cover required
  else if (!opts.nonInteractive) {
    const flagsCoverRequired = opts.required.every(r => opts.envFlags?.[r.name]);
    if (!flagsCoverRequired && (opts.required.length > 0 || opts.optional.length > 0)) {
      // Filter out vars already provided by --env flags
      const remainingRequired = opts.required.filter(r => !opts.envFlags?.[r.name]);
      const remainingOptional = opts.optional.filter(o => !opts.envFlags?.[o.name]);
      if (remainingRequired.length > 0 || remainingOptional.length > 0) {
        env = await promptForEnvVars(remainingRequired, remainingOptional);
      }
    }
  }

  // Merge: prompts/config < --env flags (flags always win)
  const merged = { ...env, ...(opts.envFlags || {}) };

  // Validate
  const validation = validateEnvVars(merged, opts.required, opts.optional);
  if (validation.ok === false) {
    return { ok: false, error: `Missing required configuration: ${validation.missing.join(', ')}` };
  }

  return { ok: true, env: merged };
}
