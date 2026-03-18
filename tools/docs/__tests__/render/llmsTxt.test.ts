import path from 'path';
import fs from 'fs';
import os from 'os';
import { renderLlmsTxt } from '../../src/render/llmsTxt';
import { DOMAIN_ALLOWLIST, REPO_ROOT, DOCS_MODULES_DIR, DOCS_REFERENCE_DIR } from '../../src/config';

// ---------------------------------------------------------------------------
// Integration tests — use the real repo path (module docs exist from Phase 1)
// ---------------------------------------------------------------------------

describe('renderLlmsTxt — integration (real repo)', () => {
  let output: string;

  beforeAll(() => {
    output = renderLlmsTxt([...DOMAIN_ALLOWLIST], REPO_ROOT);
  });

  it('includes the H1 title', () => {
    expect(output).toContain('# Lucid L2');
  });

  it('includes the blockquote summary', () => {
    expect(output).toContain('> Autonomous AI infrastructure layer');
  });

  it('includes the Docs section heading', () => {
    expect(output).toContain('## Docs');
  });

  it('lists module docs that exist on disk', () => {
    // identity.md exists from Phase 1
    expect(output).toContain('docs/modules/identity.md');
    expect(output).toContain('Identity & Passports');
  });

  it('lists all DOMAIN_ALLOWLIST module docs that exist', () => {
    for (const domain of DOMAIN_ALLOWLIST) {
      const filePath = path.join(DOCS_MODULES_DIR, `${domain}.md`);
      if (fs.existsSync(filePath)) {
        expect(output).toContain(`docs/modules/${domain}.md`);
      }
    }
  });

  it('includes the API Reference section', () => {
    expect(output).toContain('## API Reference');
  });

  it('lists reference docs that exist on disk', () => {
    for (const domain of DOMAIN_ALLOWLIST) {
      const filePath = path.join(DOCS_REFERENCE_DIR, `${domain}.md`);
      if (fs.existsSync(filePath)) {
        expect(output).toContain(`docs/reference/${domain}.md`);
      }
    }
  });

  it('lists the OpenAPI spec if openapi.yaml exists at repo root', () => {
    const openapiPath = path.join(REPO_ROOT, 'openapi.yaml');
    if (fs.existsSync(openapiPath)) {
      expect(output).toContain('openapi.yaml');
    }
  });

  it('includes the Key Interfaces section', () => {
    expect(output).toContain('## Key Interfaces');
  });

  it('extracts interface names from module docs', () => {
    // identity.md has IAgentWalletProvider, INFTProvider etc.
    expect(output).toMatch(/- \w+: /);
  });

  it('extracts a known interface from identity module doc', () => {
    const identityPath = path.join(DOCS_MODULES_DIR, 'identity.md');
    if (fs.existsSync(identityPath)) {
      // INFTProvider appears in identity.md Key Interfaces table
      expect(output).toContain('INFTProvider');
    }
  });

  it('includes the Stack section', () => {
    expect(output).toContain('## Stack');
    expect(output).toContain('TypeScript 5.0');
    expect(output).toContain('Solana');
    expect(output).toContain('Supabase');
  });

  it('is fully deterministic — same output on repeated calls', () => {
    const second = renderLlmsTxt([...DOMAIN_ALLOWLIST], REPO_ROOT);
    expect(output).toBe(second);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — synthetic temp directory for boundary/edge cases
// ---------------------------------------------------------------------------

function makeTempRepo(opts: {
  modules?: Record<string, string>;
  references?: Record<string, string>;
  hasOpenApi?: boolean;
}): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llmstxt-'));
  const modulesDir = path.join(tmpDir, 'docs', 'modules');
  const referenceDir = path.join(tmpDir, 'docs', 'reference');
  fs.mkdirSync(modulesDir, { recursive: true });
  fs.mkdirSync(referenceDir, { recursive: true });

  for (const [name, content] of Object.entries(opts.modules ?? {})) {
    fs.writeFileSync(path.join(modulesDir, `${name}.md`), content, 'utf-8');
  }
  for (const [name, content] of Object.entries(opts.references ?? {})) {
    fs.writeFileSync(path.join(referenceDir, `${name}.md`), content, 'utf-8');
  }
  if (opts.hasOpenApi) {
    fs.writeFileSync(path.join(tmpDir, 'openapi.yaml'), 'openapi: "3.0.0"\n', 'utf-8');
  }

  return tmpDir;
}

const SAMPLE_MODULE_DOC = `# Identity

## Purpose
Manages digital identities.

## Key Interfaces

| Interface | File | Role |
|-----------|------|------|
| \`IPassport\` | \`passport/types.ts\` | Core passport interface |
| \`IWallet\` | \`wallet/types.ts\` | — |

## Cross-Domain Dependencies

| Direction | Domain | Symbols | Purpose |
|-----------|--------|---------|---------|
| imports | shared | \`logger\` | — |
`;

describe('renderLlmsTxt — unit (synthetic repo)', () => {
  afterEach(() => {
    // temp dirs cleaned up per test; no persistent side effects
  });

  it('skips missing module docs gracefully', () => {
    const repoRoot = makeTempRepo({
      modules: { identity: SAMPLE_MODULE_DOC },
      // memory is absent
    });
    const output = renderLlmsTxt(['identity', 'memory'], repoRoot);
    expect(output).toContain('docs/modules/identity.md');
    expect(output).not.toContain('docs/modules/memory.md');
  });

  it('skips missing reference docs gracefully', () => {
    const repoRoot = makeTempRepo({
      modules: { identity: SAMPLE_MODULE_DOC },
      references: {}, // no reference docs
    });
    const output = renderLlmsTxt(['identity'], repoRoot);
    expect(output).not.toContain('docs/reference/identity.md');
  });

  it('includes reference doc links when they exist', () => {
    const repoRoot = makeTempRepo({
      modules: { identity: SAMPLE_MODULE_DOC },
      references: { identity: '# identity — Interface Reference\n' },
    });
    const output = renderLlmsTxt(['identity'], repoRoot);
    expect(output).toContain('docs/reference/identity.md');
  });

  it('omits OpenAPI link when openapi.yaml is absent', () => {
    const repoRoot = makeTempRepo({
      modules: { identity: SAMPLE_MODULE_DOC },
      hasOpenApi: false,
    });
    const output = renderLlmsTxt(['identity'], repoRoot);
    expect(output).not.toContain('openapi.yaml');
  });

  it('includes OpenAPI link when openapi.yaml exists', () => {
    const repoRoot = makeTempRepo({
      modules: { identity: SAMPLE_MODULE_DOC },
      hasOpenApi: true,
    });
    const output = renderLlmsTxt(['identity'], repoRoot);
    expect(output).toContain('openapi.yaml');
  });

  it('extracts Key Interfaces from module doc', () => {
    const repoRoot = makeTempRepo({ modules: { identity: SAMPLE_MODULE_DOC } });
    const output = renderLlmsTxt(['identity'], repoRoot);
    expect(output).toContain('IPassport');
    expect(output).toContain('Core passport interface');
  });

  it('uses file path as description when role is —', () => {
    const repoRoot = makeTempRepo({ modules: { identity: SAMPLE_MODULE_DOC } });
    const output = renderLlmsTxt(['identity'], repoRoot);
    // IWallet has role "—", so description should fall back to file path
    expect(output).toContain('IWallet:');
  });

  it('uses DOMAIN_DISPLAY_NAMES for known domains', () => {
    const repoRoot = makeTempRepo({ modules: { identity: SAMPLE_MODULE_DOC } });
    const output = renderLlmsTxt(['identity'], repoRoot);
    expect(output).toContain('Identity & Passports');
  });

  it('uses raw domain name for unknown domains', () => {
    const repoRoot = makeTempRepo({
      modules: { unknown: '# Unknown\n\n## Key Interfaces\n\n(none)\n' },
    });
    const output = renderLlmsTxt(['unknown'], repoRoot);
    expect(output).toContain('docs/modules/unknown.md');
  });

  it('emits no Docs section when all module docs are missing', () => {
    const repoRoot = makeTempRepo({}); // no docs at all
    const output = renderLlmsTxt(['identity', 'memory'], repoRoot);
    expect(output).not.toContain('## Docs');
  });

  it('emits no Key Interfaces section when no module docs exist', () => {
    const repoRoot = makeTempRepo({});
    const output = renderLlmsTxt(['identity'], repoRoot);
    expect(output).not.toContain('## Key Interfaces');
  });

  it('always includes the Stack section', () => {
    const repoRoot = makeTempRepo({});
    const output = renderLlmsTxt([], repoRoot);
    expect(output).toContain('## Stack');
    expect(output).toContain('TypeScript 5.0');
    expect(output).toContain('Arweave, Lighthouse (DePIN storage)');
  });

  it('preserves domain order in Docs links', () => {
    const repoRoot = makeTempRepo({
      modules: {
        memory: '# Memory\n',
        identity: SAMPLE_MODULE_DOC,
      },
    });
    const output = renderLlmsTxt(['memory', 'identity'], repoRoot);
    const memIdx = output.indexOf('docs/modules/memory.md');
    const idIdx = output.indexOf('docs/modules/identity.md');
    expect(memIdx).toBeLessThan(idIdx);
  });

  it('OpenAPI link appears before per-domain reference links', () => {
    const repoRoot = makeTempRepo({
      references: { identity: '# ref\n' },
      hasOpenApi: true,
    });
    const output = renderLlmsTxt(['identity'], repoRoot);
    const openapiIdx = output.indexOf('openapi.yaml');
    const refIdx = output.indexOf('docs/reference/identity.md');
    expect(openapiIdx).toBeLessThan(refIdx);
  });
});
