/**
 * Interactive agent setup — reads manifest required_env/optional_env and prompts user.
 * Provider-agnostic: works with any agent manifest, not just specific agents.
 *
 * Three modes:
 * 1. Interactive prompts (default for humans)
 * 2. Config file (--config ./my.env for CI)
 * 3. --env flags (already handled by commander, no code needed here)
 *
 * Additional capabilities:
 * - Lucid inference auto-inject: when user is logged in and PROVIDER_URL is set,
 *   offers to use Lucid Cloud for LLM inference instead of requiring own API key.
 * - Channel setup: for agents with TELEGRAM_BOT_TOKEN / DISCORD_BOT_TOKEN / SLACK_BOT_TOKEN,
 *   offers managed Lucid Bot, BYO token, or skip.
 */

import readline from 'readline';
import fs from 'fs';

export interface EnvVarSpec {
  name: string;
  description?: string;
  default?: string;
}

export interface ChannelChoice {
  platform: string;
  mode: 'managed' | 'byo' | 'skip';
  token?: string;
}

/** Patterns that identify an LLM provider API key in required_env */
const LLM_KEY_PATTERNS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'LLM_API_KEY',
  'PROVIDER_API_KEY',
];

const SECRET_PATTERNS = ['KEY', 'TOKEN', 'SECRET', 'PASSWORD', 'CREDENTIAL', 'PRIVATE'];

function isSecret(name: string): boolean {
  return SECRET_PATTERNS.some(p => name.toUpperCase().includes(p));
}

/**
 * Check if Lucid inference can replace an LLM API key requirement.
 *
 * Conditions:
 * 1. User is logged in (credentials.json has lucid.token)
 * 2. PROVIDER_URL env var is set (points to TrustGate or compatible endpoint)
 * 3. Manifest required_env contains an LLM API key variable
 *
 * If all true, prompts user to choose Lucid Cloud or own key.
 * Returns the filtered required list and any env overrides to inject.
 */
export async function checkLucidInference(
  required: EnvVarSpec[],
): Promise<{
  filteredRequired: EnvVarSpec[];
  envOverrides: Record<string, string>;
  useLucidInference: boolean;
}> {
  const result = { filteredRequired: required, envOverrides: {} as Record<string, string>, useLucidInference: false };

  // Find LLM key vars in required_env
  const llmKeyVars = required.filter(v =>
    LLM_KEY_PATTERNS.some(p => v.name.toUpperCase() === p) ||
    (v.name.toUpperCase().includes('API_KEY') && (
      v.name.toUpperCase().includes('ANTHROPIC') ||
      v.name.toUpperCase().includes('OPENAI') ||
      v.name.toUpperCase().includes('LLM')
    ))
  );
  if (llmKeyVars.length === 0) return result;

  // Check if user is logged in
  let getLucidAuth: () => import('./credentials').LucidAuth | undefined;
  try {
    const creds = await import('./credentials');
    getLucidAuth = creds.getLucidAuth;
  } catch {
    return result;
  }
  const auth = getLucidAuth();
  if (!auth?.token) return result;

  // Check if PROVIDER_URL is set
  const providerUrl = process.env.PROVIDER_URL;
  if (!providerUrl) return result;

  // Both conditions met — prompt the user
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> =>
    new Promise(resolve => rl.question(q, answer => resolve(answer.trim())));

  console.log('\nLLM Provider:');
  console.log('  [1] Use Lucid Cloud (no API key needed — uses your Lucid account)');
  console.log('  [2] Use your own API key');
  const choice = await ask('  Choice [1]: ') || '1';
  rl.close();

  if (choice === '1') {
    // Remove LLM key vars from required list, inject PROVIDER_API_KEY from Lucid token
    result.filteredRequired = required.filter(v => !llmKeyVars.includes(v));
    result.envOverrides.PROVIDER_API_KEY = auth.token;
    result.useLucidInference = true;
    console.log('  Using Lucid Cloud for inference');
  }
  // choice === '2' or anything else: proceed with normal prompts (no changes)

  return result;
}

/**
 * Prompt for messaging channel setup (Telegram, Discord, Slack).
 *
 * For each channel token found in optional_env, offers:
 *   [1] Use Lucid Bot (managed — no token needed, agent receives traffic via Lucid routing)
 *   [2] Bring your own bot (paste token)
 *   [3] Skip
 *
 * Managed mode: the agent does not need the bot token. Lucid's shared bot
 * routes messages to the agent's /run endpoint externally.
 * After deploy, the CLI prints: t.me/LucidAgentBot?start=<passport_id>
 */
export async function promptChannels(
  optionalEnv: EnvVarSpec[],
): Promise<{ channels: ChannelChoice[]; envOverrides: Record<string, string> }> {
  const CHANNEL_MAP: Record<string, string> = {
    TELEGRAM_BOT_TOKEN: 'Telegram',
    DISCORD_BOT_TOKEN: 'Discord',
    SLACK_BOT_TOKEN: 'Slack',
  };

  const channels: ChannelChoice[] = [];
  const envOverrides: Record<string, string> = {};

  const channelVars = optionalEnv.filter(v => CHANNEL_MAP[v.name]);
  if (channelVars.length === 0) return { channels, envOverrides };

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> =>
    new Promise(resolve => rl.question(q, answer => resolve(answer.trim())));

  console.log('\nChannel setup:');

  for (const v of channelVars) {
    const platform = CHANNEL_MAP[v.name];
    console.log(`\n  ${platform}:`);
    console.log('    [1] Use Lucid Bot (instant — no token needed)');
    console.log('    [2] Bring your own bot');
    console.log('    [3] Skip');
    const choice = await ask('    Choice [3]: ') || '3';

    if (choice === '1') {
      channels.push({ platform: platform.toLowerCase(), mode: 'managed' });
      // Managed mode: no token injected. Lucid shared bot routes to agent externally.
    } else if (choice === '2') {
      const desc = v.description ? ` (${v.description})` : '';
      const token = await ask(`    ${v.name}${desc}: `);
      if (token) {
        channels.push({ platform: platform.toLowerCase(), mode: 'byo', token });
        envOverrides[v.name] = token;
      } else {
        channels.push({ platform: platform.toLowerCase(), mode: 'skip' });
      }
    } else {
      channels.push({ platform: platform.toLowerCase(), mode: 'skip' });
    }
  }

  rl.close();
  return { channels, envOverrides };
}

/**
 * Print post-deploy channel links for managed channels.
 * Call this after launch succeeds and passport_id is known.
 */
export function printChannelLinks(channels: ChannelChoice[], passportId: string): void {
  const managed = channels.filter(c => c.mode === 'managed');
  if (managed.length === 0) return;

  console.log('\n  Channels:');
  for (const ch of managed) {
    if (ch.platform === 'telegram') {
      console.log(`    Telegram: https://t.me/LucidAgentBot?start=${passportId}`);
    } else if (ch.platform === 'discord') {
      console.log(`    Discord: Managed — invite link available at https://lucid.foundation/agents/${passportId}/channels`);
    } else if (ch.platform === 'slack') {
      console.log(`    Slack: Managed — install link available at https://lucid.foundation/agents/${passportId}/channels`);
    }
  }
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
