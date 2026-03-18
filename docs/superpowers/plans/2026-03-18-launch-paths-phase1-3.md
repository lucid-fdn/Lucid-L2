# Launch Paths Phase 1-3: From Source + LaunchSpec + Catalog

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `lucid launch --path` (build from source), normalize all 5 paths through `LaunchSpec`, add `lucid registry set`, and create the `lucid-agents` catalog repo with official agent templates.

**Architecture:** New `LaunchSpec` interface normalizes all input paths. Source builder detects Dockerfile vs Nixpacks. Registry config in `~/.lucid/credentials.json`. Catalog repo with manifest schema + GitHub Actions.

**Tech Stack:** TypeScript, Docker CLI (`execFileSync`), Commander.js, YAML (manifests).

**Spec:** `docs/superpowers/specs/2026-03-18-agent-launch-paths-design.md`

**Baseline:** 103 suites, ~1600 tests, 0 failures.

**Architect corrections (v2):**
1. `LaunchSpec.target` strongly typed (`LaunchTarget` union, not string)
2. Add `source_build_mode` to LaunchSpec ('dockerfile' | 'nixpacks' | 'prebuilt' | 'external')
3. Registry image paths namespaced: `${registry}/agents/${passportId}:${tag}`
4. Source hash: ignore node_modules/.git, sort paths, deterministic
5. CLI must NOT create fake passport IDs — use real passport service first
6. Railway Nixpacks = future (error with instructions for now, not implemented)
7. Trust tier enforced in CI (authors can't self-declare 'official')
8. Manifest validation: YAML→JSON conversion before AJV
9. Catalog generation: fix operator precedence bug
10. `--agent` normalizes through LaunchSpec like all other paths

---

## Phase 1: From Source + Registry Config

### Task 1: LaunchSpec Type

**Files:**
- Create: `offchain/packages/engine/src/compute/control-plane/launch/launch-spec.ts`

- [ ] **Step 1: Create LaunchSpec**

```typescript
export type SourceType = 'image' | 'source' | 'catalog' | 'runtime' | 'external';
export type SourceBuildMode = 'dockerfile' | 'nixpacks' | 'prebuilt' | 'external';
export type LaunchTarget = 'docker' | 'railway' | 'akash' | 'phala' | 'ionet' | 'nosana';

export interface LaunchSpecMetadata {
  marketplace_slug?: string;
  marketplace_version?: string;
  manifest_hash?: string;
  image_digest?: string;
  publisher?: string;
  trust_tier?: 'official' | 'verified' | 'community';
  source_hash?: string;
}

export interface LaunchSpec {
  source_type: SourceType;
  source_build_mode?: SourceBuildMode;
  source_ref: string;
  resolved_image?: string;
  target: LaunchTarget;
  verification_mode: 'full' | 'minimal';
  env_vars: Record<string, string>;
  port?: number;
  owner: string;
  name: string;
  metadata: LaunchSpecMetadata;
}
```

- [ ] **Step 2: Export from barrel**

Add to `launch/index.ts`: `export type { LaunchSpec, LaunchSpecMetadata, SourceType } from './launch-spec';`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(launch): LaunchSpec type — canonical internal model for all 5 paths"
```

---

### Task 2: Provider Compatibility Matrix

**Files:**
- Create: `offchain/packages/engine/src/compute/control-plane/launch/provider-compat.ts`

- [ ] **Step 1: Create compatibility checker**

```typescript
import type { SourceType } from './launch-spec';

const COMPAT: Record<string, Record<SourceType, boolean | 'nixpacks'>> = {
  docker:  { image: true, source: true, catalog: true, runtime: true, external: true },
  railway: { image: true, source: 'nixpacks', catalog: true, runtime: true, external: true },
  akash:   { image: true, source: true, catalog: true, runtime: true, external: true },
  phala:   { image: true, source: true, catalog: true, runtime: true, external: true },
  ionet:   { image: true, source: true, catalog: true, runtime: true, external: true },
  nosana:  { image: true, source: true, catalog: true, runtime: true, external: true },
};

// source=true means "needs Dockerfile". 'nixpacks' means "can build from source without Dockerfile"

export function checkProviderCompat(target: string, sourceType: SourceType, hasDockerfile: boolean):
  { ok: true } | { ok: false; error: string } {
  const provider = COMPAT[target];
  if (!provider) return { ok: false, error: `Unknown target: ${target}` };

  const support = provider[sourceType];
  if (!support) return { ok: false, error: `${target} does not support ${sourceType} deployments` };

  if (sourceType === 'source' && !hasDockerfile && support !== 'nixpacks') {
    return { ok: false, error: `${target} requires a Dockerfile for source deployments. Add a Dockerfile to your project or use --target railway (supports Nixpacks).` };
  }

  return { ok: true };
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(launch): provider compatibility matrix — enforces valid path+target combos"
```

---

### Task 3: Registry Config

**Files:**
- Modify: `offchain/src/cli/credentials.ts`
- Modify: `offchain/src/cli.ts`

- [ ] **Step 1: Add registry to credentials schema**

In `credentials.ts`, add to the `Credentials` interface:

```typescript
export interface RegistryConfig {
  url: string;
  username?: string;
  token?: string;
}

export interface Credentials {
  lucid?: LucidAuth;
  providers?: Record<string, ProviderCredential>;
  registry?: RegistryConfig;  // NEW
}

export function setRegistry(config: RegistryConfig): void {
  const creds = loadCredentials();
  creds.registry = config;
  saveCredentials(creds);
}

export function getRegistry(): RegistryConfig | undefined {
  return loadCredentials().registry;
}
```

- [ ] **Step 2: Add `lucid registry set/get` CLI commands**

In `cli.ts`, add before `program.parse()`:

```typescript
const registryCmd = program.command('registry').description('Manage Docker image registry');

registryCmd.command('set <url>')
  .description('Set registry for image push (e.g., ghcr.io/myorg)')
  .option('--username <username>', 'Registry username')
  .option('--token <token>', 'Registry token')
  .action(async (url, opts) => {
    const { setRegistry } = await import('./cli/credentials');
    setRegistry({ url, username: opts.username, token: opts.token });
    console.log(`✓ Registry set to ${url}`);
  });

registryCmd.command('get')
  .description('Show configured registry')
  .action(async () => {
    const { getRegistry } = await import('./cli/credentials');
    const reg = getRegistry();
    if (reg) {
      console.log(`Registry: ${reg.url}`);
    } else {
      console.log('No registry configured. Run: lucid registry set ghcr.io/myorg');
    }
  });
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(cli): lucid registry set/get — configure image push target"
```

---

### Task 4: Source Builder

**Files:**
- Create: `offchain/packages/engine/src/compute/control-plane/launch/source-builder.ts`

- [ ] **Step 1: Create source builder**

Detects Dockerfile, builds image, pushes to registry.

```typescript
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../../../shared/lib/logger';

export interface BuildResult {
  success: boolean;
  image?: string;
  digest?: string;
  source_hash?: string;
  error?: string;
}

export function detectSourceType(sourcePath: string): 'dockerfile' | 'nixpacks' | 'unknown' {
  if (fs.existsSync(path.join(sourcePath, 'Dockerfile'))) return 'dockerfile';
  if (fs.existsSync(path.join(sourcePath, 'package.json'))) return 'nixpacks';
  if (fs.existsSync(path.join(sourcePath, 'requirements.txt'))) return 'nixpacks';
  if (fs.existsSync(path.join(sourcePath, 'go.mod'))) return 'nixpacks';
  return 'unknown';
}

const HASH_IGNORE = ['node_modules', '.git', 'dist', 'build', '__pycache__', '.next', '.venv'];

function hashDirectory(dir: string): string {
  const hash = crypto.createHash('sha256');
  const files = (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter(f => !HASH_IGNORE.some(ig => f.includes(ig)))
    .sort(); // deterministic ordering
  for (const file of files) {
    const fullPath = path.join(dir, file);
    try {
      if (fs.statSync(fullPath).isFile()) {
        hash.update(file); // include relative path for determinism
        hash.update(fs.readFileSync(fullPath));
      }
    } catch { /* skip unreadable */ }
  }
  return hash.digest('hex').slice(0, 16);
}

export function isDockerAvailable(): boolean {
  try {
    execFileSync('docker', ['version'], { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function buildFromSource(opts: {
  sourcePath: string;
  passportId: string;
  registryUrl?: string;
  tag?: string;
}): Promise<BuildResult> {
  const absPath = path.resolve(opts.sourcePath);
  if (!fs.existsSync(absPath)) {
    return { success: false, error: `Source path not found: ${absPath}` };
  }

  const sourceType = detectSourceType(absPath);
  if (sourceType === 'unknown') {
    return { success: false, error: 'No Dockerfile, package.json, requirements.txt, or go.mod found' };
  }

  if (sourceType === 'dockerfile' && !isDockerAvailable()) {
    return { success: false, error: 'Docker is required for Dockerfile builds but is not available' };
  }

  const sourceHash = hashDirectory(absPath);
  const tag = opts.tag || 'latest';

  // If no registry, build local only (for --target docker)
  if (!opts.registryUrl) {
    const localImage = `lucid-agent-${opts.passportId}:${tag}`;
    try {
      logger.info(`[Build] Building ${localImage} from ${absPath}`);
      execFileSync('docker', ['build', '-t', localImage, '.'], {
        cwd: absPath, stdio: 'pipe', timeout: 300000,
      });
      return { success: true, image: localImage, source_hash: sourceHash };
    } catch (err: any) {
      return { success: false, error: `Docker build failed: ${err.message?.split('\n')[0]}` };
    }
  }

  // Build and push to registry
  const imageRef = `${opts.registryUrl}/agents/${opts.passportId}:${tag}`;
  try {
    logger.info(`[Build] Building ${imageRef} from ${absPath}`);
    execFileSync('docker', ['build', '-t', imageRef, '.'], {
      cwd: absPath, stdio: 'pipe', timeout: 300000,
    });
    logger.info(`[Build] Pushing ${imageRef}`);
    const pushOutput = execFileSync('docker', ['push', imageRef], {
      stdio: 'pipe', timeout: 120000,
    }).toString();
    const digestMatch = pushOutput.match(/digest: (sha256:[a-f0-9]+)/);
    return {
      success: true,
      image: imageRef,
      digest: digestMatch?.[1],
      source_hash: sourceHash,
    };
  } catch (err: any) {
    return { success: false, error: `Build/push failed: ${err.message?.split('\n')[0]}` };
  }
}
```

- [ ] **Step 2: Export from barrel**

Add to `launch/index.ts`:
```typescript
export { buildFromSource, detectSourceType, isDockerAvailable } from './source-builder';
export type { BuildResult } from './source-builder';
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(launch): source builder — Dockerfile detect, build, push to registry"
```

---

### Task 5: Wire `--path` into CLI

**Files:**
- Modify: `offchain/src/cli.ts`

- [ ] **Step 1: Add `--path` option to launch command**

Add to the launch command options:
```
.option('--path <path>', 'Build from source directory')
```

- [ ] **Step 2: Handle --path in action**

When `--path` is set:
1. Detect source type (dockerfile/nixpacks/unknown)
2. Check provider compatibility
3. If `--target docker` → build locally, no registry needed
4. If remote target → check registry configured, build + push, then deploy image
5. If no Dockerfile → error: "Add a Dockerfile to your project. Nixpacks source deploy coming in a future release."

```typescript
if (options.path) {
  const { buildFromSource, detectSourceType } = await import('../packages/engine/src/compute/control-plane/launch');
  const { checkProviderCompat } = await import('../packages/engine/src/compute/control-plane/launch/provider-compat');
  const { getRegistry } = await import('./cli/credentials');

  const target = options.target || 'docker';
  const sourceType = detectSourceType(options.path);
  const hasDockerfile = sourceType === 'dockerfile';

  const compat = checkProviderCompat(target, 'source', hasDockerfile);
  if (!compat.ok) {
    console.error(compat.error);
    process.exit(1);
  }

  const registry = target === 'docker' ? undefined : getRegistry()?.url;
  if (target !== 'docker' && !registry) {
    console.error('Registry required for remote targets. Run: lucid registry set ghcr.io/myorg');
    process.exit(1);
  }

  // Create real passport through passport service (never invent fake IDs)
  const { resolvePassport } = await import('../packages/engine/src/compute/control-plane/launch/passport-resolution');
  const owner = options.owner || '0x0000000000000000000000000000000000000000';
  const passportResult = await resolvePassport({ owner, name: options.name || path.basename(options.path), target });
  if (!passportResult.ok) {
    console.error(`Passport creation failed: ${passportResult.error}`);
    process.exit(1);
  }
  const passportId = passportResult.passport_id;
  console.log(`✓ Passport: ${passportId}`);
  console.log(`Building from ${options.path}...`);

  const buildResult = await buildFromSource({
    sourcePath: options.path,
    passportId,
    registryUrl: registry,
  });

  if (!buildResult.success) {
    console.error(`Build failed: ${buildResult.error}`);
    process.exit(1);
  }

  console.log(`✓ Image built: ${buildResult.image}`);

  // Now launch the built image
  options.image = buildResult.image;
  // Fall through to existing --image launch logic
}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(cli): lucid launch --path — build from source + deploy"
```

---

### Task 6: LaunchSpec Normalization in Service

**Files:**
- Modify: `offchain/packages/engine/src/compute/control-plane/launch/service.ts`

- [ ] **Step 1: Add toLaunchSpec() helper**

Convert launch inputs to normalized `LaunchSpec` before passing to deployers. Add at the top of `launchImage()`:

```typescript
import type { LaunchSpec } from './launch-spec';

function toLaunchSpec(input: LaunchImageInput, verification: string): LaunchSpec {
  return {
    source_type: 'image',
    source_ref: input.image,
    resolved_image: input.image,
    target: input.target,
    verification_mode: verification as 'full' | 'minimal',
    env_vars: input.env_vars || {},
    port: input.port,
    owner: input.owner,
    name: input.name,
    metadata: {},
  };
}
```

Log the LaunchSpec in `launchImage()`:
```typescript
logger.info(`[Launch] LaunchSpec: ${JSON.stringify({ source_type: spec.source_type, target: spec.target, verification: spec.verification_mode })}`);
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(launch): LaunchSpec normalization — all paths produce same internal model"
```

---

### Task 7: Tests

**Files:**
- Create: `offchain/packages/engine/src/__tests__/launch-paths.test.ts`

- [ ] **Step 1: Write tests**

Test cases:
1. `detectSourceType()` with Dockerfile → 'dockerfile'
2. `detectSourceType()` with package.json only → 'nixpacks'
3. `detectSourceType()` empty dir → 'unknown'
4. `checkProviderCompat('docker', 'source', true)` → ok
5. `checkProviderCompat('akash', 'source', false)` → error (needs Dockerfile)
6. `checkProviderCompat('railway', 'source', false)` → ok (Nixpacks)
7. `checkProviderCompat('unknown', 'image', true)` → error
8. `LaunchSpec` type check — verify all fields present
9. Registry set/get roundtrip
10. `buildFromSource()` with missing path → error

- [ ] **Step 2: Run tests**

```bash
npx jest packages/engine/src/__tests__/launch-paths.test.ts --no-coverage
```

- [ ] **Step 3: Commit**

```bash
git commit -m "test(launch): 10 tests — source detection, provider compat, registry, LaunchSpec"
```

---

## Phase 3: Catalog Repo

### Task 8: Create lucid-agents Repo

- [ ] **Step 1: Create repo on GitHub**

```bash
gh repo create lucid-fdn/lucid-agents --public --description "Official and community agent catalog for Lucid" --clone
```

- [ ] **Step 2: Create directory structure**

```
lucid-agents/
  README.md
  manifest.schema.json          # JSON Schema for manifest validation
  catalog.json                  # Auto-generated index (empty initially)
  official/
    base-runtime/
      manifest.yaml
      README.md
    trading-analyst/
      manifest.yaml
      Dockerfile
      README.md
    code-reviewer/
      manifest.yaml
      Dockerfile
      README.md
  community/
    .gitkeep
  .github/
    workflows/
      build-and-publish.yml     # Build images on merge
      validate-manifest.yml     # Validate PRs
    PULL_REQUEST_TEMPLATE.md
```

- [ ] **Step 3: Commit and push**

```bash
git add -A && git commit -m "feat: initial catalog — manifest schema, 3 official agents, CI"
git push origin main
```

---

### Task 9: Manifest Schema

**Files:**
- Create: `lucid-agents/manifest.schema.json`

- [ ] **Step 1: Define JSON Schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Lucid Agent Manifest",
  "type": "object",
  "required": ["name", "display_name", "version", "author"],
  "properties": {
    "name": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "display_name": { "type": "string" },
    "description": { "type": "string" },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "author": { "type": "string" },
    "license": { "type": "string" },
    "verified": { "type": "boolean" },
    "image": { "type": "string" },
    "source": {
      "type": "object",
      "properties": {
        "dockerfile": { "type": "string" }
      }
    },
    "defaults": {
      "type": "object",
      "properties": {
        "model": { "type": "string" },
        "prompt": { "type": "string" },
        "tools": { "type": "array", "items": { "type": "string" } },
        "port": { "type": "integer", "default": 3100 }
      }
    },
    "required_env": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "description"],
        "properties": {
          "name": { "type": "string" },
          "description": { "type": "string" }
        }
      }
    },
    "optional_env": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": { "type": "string" },
          "description": { "type": "string" },
          "default": { "type": "string" }
        }
      }
    },
    "resources": {
      "type": "object",
      "properties": {
        "gpu": { "type": "boolean", "default": false },
        "memory": { "type": "string" }
      }
    },
    "categories": {
      "type": "array",
      "items": { "type": "string" }
    },
    "trust_tier": {
      "type": "string",
      "enum": ["official", "verified", "community"]
    }
  }
}
```

- [ ] **Step 2: Commit**

---

### Task 10: Official Agent Manifests

- [ ] **Step 1: Base runtime manifest**

```yaml
# official/base-runtime/manifest.yaml
name: base-runtime
display_name: "Lucid Base Runtime"
description: "Configurable AI agent — set model, prompt, and tools via env vars"
version: "1.0.0"
author: "Lucid Foundation"
license: "Apache-2.0"
trust_tier: official
image: ghcr.io/lucid-fdn/agent-runtime:v1.0.0

defaults:
  model: gpt-4o
  prompt: "You are a helpful AI assistant."
  port: 3100

optional_env:
  - name: LUCID_TOOLS
    description: "Comma-separated tool passport IDs"

resources:
  gpu: false
  memory: "256Mi"

categories:
  - general
  - assistant
```

- [ ] **Step 2: Trading analyst manifest + Dockerfile**

```yaml
# official/trading-analyst/manifest.yaml
name: trading-analyst
display_name: "Trading Analyst"
description: "AI agent that analyzes market data and provides trading insights"
version: "1.0.0"
author: "Lucid Foundation"
license: "Apache-2.0"
trust_tier: official
image: ghcr.io/lucid-fdn/lucid-agents/trading-analyst:v1.0.0

defaults:
  model: gpt-4o
  prompt: "You are a financial trading analyst specializing in crypto and equity markets. Provide data-driven analysis with clear risk assessments."
  tools:
    - market-data
    - price-alerts
  port: 3100

required_env:
  - name: EXCHANGE_API_KEY
    description: "API key for exchange data access (Binance, Coinbase, etc.)"

optional_env:
  - name: RISK_TOLERANCE
    description: "Risk level: conservative, moderate, aggressive"
    default: "moderate"

resources:
  gpu: false
  memory: "512Mi"

categories:
  - finance
  - trading
  - analytics
```

- [ ] **Step 3: Code reviewer manifest + Dockerfile**

```yaml
# official/code-reviewer/manifest.yaml
name: code-reviewer
display_name: "Code Review Specialist"
description: "AI agent that reviews code for bugs, security issues, and best practices"
version: "1.0.0"
author: "Lucid Foundation"
license: "Apache-2.0"
trust_tier: official
image: ghcr.io/lucid-fdn/lucid-agents/code-reviewer:v1.0.0

defaults:
  model: gpt-4o
  prompt: "You are a senior code reviewer. Analyze code for bugs, security vulnerabilities, performance issues, and adherence to best practices. Be specific and actionable."
  tools:
    - github
    - code-search
  port: 3100

resources:
  gpu: false
  memory: "256Mi"

categories:
  - development
  - code-review
  - security
```

- [ ] **Step 4: Commit**

---

### Task 11: GitHub Actions

- [ ] **Step 1: Manifest validation workflow (YAML to JSON + AJV + trust tier enforcement)**

Create a Node.js validation script that:
- Reads each `manifest.yaml` with `js-yaml`
- Validates against `manifest.schema.json` with `ajv`
- Enforces: community PRs cannot declare `trust_tier: 'official'` or `trust_tier: 'verified'`
- Uses `glob` to find manifests (no shell exec for file discovery)

GitHub Action runs this script on every PR that touches `**/manifest.yaml`.

- [ ] **Step 2: Build and publish workflow**

```yaml
# .github/workflows/build-and-publish.yml
name: Build and Publish
on:
  push:
    branches: [main]
    paths: ['official/**', 'community/**']

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      packages: write
      contents: write
    steps:
      - uses: actions/checkout@v4
      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push changed agents
        run: |
          for dir in official/*/  community/*/; do
            if [ -f "$dir/Dockerfile" ]; then
              name=$(basename $dir)
              echo "Building $name..."
              docker build -t ghcr.io/lucid-fdn/lucid-agents/$name:latest "$dir"
              docker push ghcr.io/lucid-fdn/lucid-agents/$name:latest
            fi
          done
      - name: Generate catalog.json
        run: |
          node -e "
            const fs = require('fs');
            const yaml = require('js-yaml');
            const catalog = { agents: [], generated_at: new Date().toISOString() };
            for (const tier of ['official', 'community']) {
              if (!fs.existsSync(tier)) continue;
              for (const name of fs.readdirSync(tier)) {
                const mPath = tier + '/' + name + '/manifest.yaml';
                if (fs.existsSync(mPath)) {
                  const m = yaml.load(fs.readFileSync(mPath, 'utf8'));
                  m.trust_tier = m.trust_tier || (tier === 'official' ? 'official' : 'community');
                  catalog.agents.push(m);
                }
              }
            }
            fs.writeFileSync('catalog.json', JSON.stringify(catalog, null, 2));
          "
      - name: Commit catalog
        run: |
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add catalog.json
          git diff --cached --quiet || git commit -m "chore: regenerate catalog.json"
          git push
```

- [ ] **Step 3: PR template**

```markdown
<!-- .github/PULL_REQUEST_TEMPLATE.md -->
## Agent Submission

**Agent name:**
**Category:**
**Description:**

### Checklist
- [ ] `manifest.yaml` is valid (passes schema validation)
- [ ] Dockerfile builds successfully
- [ ] Agent responds to `/health` endpoint
- [ ] README.md included with usage instructions
- [ ] No secrets or API keys in source code
- [ ] License specified in manifest
```

- [ ] **Step 4: Commit and push repo**

---

### Task 12: Wire Catalog into CLI

**Files:**
- Modify: `offchain/src/cli.ts`

- [ ] **Step 1: Add `lucid marketplace list` and `lucid launch --agent`**

```typescript
// Marketplace
const marketplaceCmd = program.command('marketplace').description('Browse agent catalog');

marketplaceCmd.command('list')
  .description('List available agents')
  .option('--category <cat>', 'Filter by category')
  .action(async (opts) => {
    const catalogUrl = process.env.LUCID_CATALOG_URL || 'https://raw.githubusercontent.com/lucid-fdn/lucid-agents/main/catalog.json';
    const res = await fetch(catalogUrl);
    const catalog = await res.json();
    for (const agent of catalog.agents) {
      const tier = agent.trust_tier === 'official' ? '[official]' : agent.trust_tier === 'verified' ? '[verified]' : '';
      if (opts.category && !agent.categories?.includes(opts.category)) continue;
      console.log(`  ${agent.name.padEnd(25)} ${agent.display_name} (${agent.version}) ${tier}`);
    }
  });

marketplaceCmd.command('search <query>')
  .description('Search agents')
  .action(async (query) => {
    const catalogUrl = process.env.LUCID_CATALOG_URL || 'https://raw.githubusercontent.com/lucid-fdn/lucid-agents/main/catalog.json';
    const res = await fetch(catalogUrl);
    const catalog = await res.json();
    const q = query.toLowerCase();
    const matches = catalog.agents.filter((a: any) =>
      a.name.includes(q) || a.display_name?.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q)
    );
    if (matches.length === 0) { console.log('No agents found'); return; }
    for (const a of matches) {
      console.log(`  ${a.name.padEnd(25)} ${a.display_name} — ${a.description?.substring(0, 60)}`);
    }
  });
```

- [ ] **Step 2: Add `--agent` to launch command**

When `--agent <slug>` is provided:
1. Fetch `catalog.json`
2. Find agent by slug
3. Resolve image from manifest
4. Deploy with manifest defaults + user overrides

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(cli): lucid marketplace list/search + lucid launch --agent"
```

---

## Verification Checklist

### Phase 1+2
- [ ] `LaunchSpec` type exists and is exported
- [ ] `checkProviderCompat()` rejects invalid combos
- [ ] `lucid registry set ghcr.io/myorg` → saves to credentials
- [ ] `lucid registry get` → shows registry
- [ ] `lucid launch --path ./test-agent --target docker` → builds locally, deploys
- [ ] `lucid launch --path ./test-agent --target railway` → requires registry, error if missing
- [ ] Source builder detects Dockerfile vs package.json
- [ ] LaunchSpec logged on every launch
- [ ] 10+ unit tests pass

### Phase 3
- [ ] `lucid-fdn/lucid-agents` repo exists on GitHub
- [ ] `manifest.schema.json` validates manifests
- [ ] 3 official agent manifests (base-runtime, trading-analyst, code-reviewer)
- [ ] GitHub Action validates manifests on PR
- [ ] GitHub Action builds images on merge
- [ ] `catalog.json` auto-generated
- [ ] `lucid marketplace list` → shows agents from catalog
- [ ] `lucid marketplace search "trading"` → finds trading-analyst
- [ ] `lucid launch --agent base-runtime` → deploys from catalog
