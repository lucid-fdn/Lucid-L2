# Interactive Agent Setup — Provider-Agnostic Configuration Flow

**Date:** 2026-03-19
**Status:** Draft
**Goal:** When launching a catalog agent, the CLI reads the manifest's required/optional env vars and prompts the user interactively. Supports 3 modes: interactive prompts, `--config` file, `--env` flags.

---

## Problem

`lucid launch --agent openclaw` deploys a container but leaves it unconfigured. The user must manually figure out what env vars are needed. This breaks the one-click promise.

## Design

### Three Configuration Modes

```bash
# 1. Interactive (default for humans)
lucid launch --agent openclaw
  → Reads manifest.yaml required_env + optional_env
  → Prompts user for each required var
  → Shows defaults for optional vars, user can accept or override
  → Deploys with collected env vars

# 2. Config file (CI/automation)
lucid launch --agent openclaw --config ./openclaw.env
  → Reads key=value from file
  → Validates all required_env are present
  → Deploys

# 3. Flags (already works, no changes needed)
lucid launch --agent openclaw --env KEY=val --env KEY2=val2
```

### Interactive Flow (provider-agnostic)

The manifest drives the prompts — works for ANY agent:

```yaml
# From manifest.yaml
required_env:
  - name: ANTHROPIC_API_KEY
    description: "API key for Claude (get at console.anthropic.com)"
  - name: TELEGRAM_BOT_TOKEN
    description: "Telegram bot token (get from @BotFather)"
optional_env:
  - name: OPENCLAW_MODEL
    description: "Default model"
    default: "anthropic/claude-sonnet-4-6"
  - name: RISK_TOLERANCE
    description: "Risk level"
    default: "moderate"
```

CLI output:
```
Deploying OpenClaw Personal Assistant (v1.0.0) [official]

Required configuration:
  ANTHROPIC_API_KEY (API key for Claude): sk-ant-...
  TELEGRAM_BOT_TOKEN (Telegram bot token): 123:ABC...

Optional configuration (press Enter for default):
  OPENCLAW_MODEL [anthropic/claude-sonnet-4-6]:
  RISK_TOLERANCE [moderate]: aggressive

✓ Passport created: passport_abc123
✓ Deploying to docker...
✓ Live at http://localhost:18789
✓ Telegram bot active
```

### Config File Format

Standard `.env` format:
```env
# openclaw.env
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=123:ABC
OPENCLAW_MODEL=anthropic/claude-sonnet-4-6
```

### Validation

Before deploying, validate:
1. All `required_env` vars are present (error if missing)
2. No unknown vars that aren't in required_env or optional_env (warning, not error)
3. Defaults applied for optional vars not provided

### Secrets Handling

- Interactive: input masked for vars containing `KEY`, `TOKEN`, `SECRET`, `PASSWORD` in the name
- Config file: warn if file permissions are too open (not chmod 600)
- Never log secret values

---

## Implementation

### Files to Create (1)
| File | Responsibility |
|------|---------------|
| `src/cli/agent-setup.ts` | `promptForEnvVars()`, `loadConfigFile()`, `validateEnvVars()`, `maskInput()` |

### Files to Modify (1)
| File | Changes |
|------|---------|
| `src/cli.ts` | Wire agent-setup into `--agent` launch flow |

### agent-setup.ts

```typescript
import readline from 'readline';
import fs from 'fs';

interface EnvVarSpec {
  name: string;
  description?: string;
  default?: string;
}

const SECRET_PATTERNS = ['KEY', 'TOKEN', 'SECRET', 'PASSWORD', 'CREDENTIAL'];

function isSecret(name: string): boolean {
  return SECRET_PATTERNS.some(p => name.toUpperCase().includes(p));
}

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
      let value = '';
      while (!value) {
        value = await ask(`  ${v.name}${desc}: `);
        if (!value) console.log(`  ${v.name} is required`);
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

export function loadConfigFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

export function validateEnvVars(
  env: Record<string, string>,
  required: EnvVarSpec[],
  optional: EnvVarSpec[],
): { ok: true } | { ok: false; missing: string[] } {
  const missing = required.filter(r => !env[r.name]).map(r => r.name);
  if (missing.length > 0) return { ok: false, missing };
  // Apply defaults for optional
  for (const o of optional) {
    if (!env[o.name] && o.default) env[o.name] = o.default;
  }
  return { ok: true };
}
```

### CLI Integration

In the `--agent` handler in `cli.ts`, after fetching the manifest:

```typescript
if (options.agent && manifest) {
  const required = manifest.required_env || [];
  const optional = manifest.optional_env || [];
  let agentEnv: Record<string, string> = {};

  if (options.config) {
    // Mode 2: Config file
    agentEnv = loadConfigFile(options.config);
  } else if (!options.env?.length && (required.length > 0 || optional.length > 0)) {
    // Mode 1: Interactive prompts (only if no --env flags provided)
    agentEnv = await promptForEnvVars(required, optional);
  }
  // Mode 3: --env flags already parsed by commander

  // Validate required vars present
  const validation = validateEnvVars(
    { ...agentEnv, ...(envFromFlags || {}) },
    required, optional
  );
  if (!validation.ok) {
    console.error(`Missing required configuration: ${validation.missing.join(', ')}`);
    process.exit(1);
  }

  // Merge: manifest defaults < config file < --env flags
  options.envVars = { ...agentEnv, ...(envFromFlags || {}) };
}
```

---

## Test Plan

- [ ] Interactive: `lucid launch --agent openclaw` → prompts for required + optional
- [ ] Config file: `lucid launch --agent openclaw --config ./test.env` → reads file, no prompts
- [ ] Flags: `lucid launch --agent openclaw --env KEY=val` → no prompts
- [ ] Missing required var → clear error listing what's missing
- [ ] Optional var with default → default applied if user presses Enter
- [ ] Secret masking: vars with KEY/TOKEN/SECRET in name show masked input
- [ ] Config file not found → error
- [ ] Config file with comments and blank lines → parsed correctly
- [ ] No required_env in manifest → no prompts, deploys immediately
- [ ] Provider-agnostic: works with any manifest, not just OpenClaw
