import * as path from 'path';
import { ClaudeMdAdapter, parseMarkdownSections } from '../claudeMdAdapter';
import { lucidL2Mappings, platformCoreMappings } from '../claudeMdMappings';

// ---------------------------------------------------------------------------
// Unit: parseMarkdownSections
// ---------------------------------------------------------------------------

describe('parseMarkdownSections', () => {
  it('extracts h2 and h3 sections with correct content', () => {
    const md = [
      '# Title',
      '',
      '## Section One',
      'Content of section one.',
      '',
      '### Sub Section',
      'Sub content here.',
      '',
      '## Section Two',
      'Content of section two.',
    ].join('\n');

    const sections = parseMarkdownSections(md);

    expect(sections.length).toBe(3);
    expect(sections[0].title).toBe('Section One');
    expect(sections[0].level).toBe(2);
    expect(sections[0].content).toContain('Content of section one');

    expect(sections[1].title).toBe('Sub Section');
    expect(sections[1].level).toBe(3);
    expect(sections[1].content).toContain('Sub content here');

    expect(sections[2].title).toBe('Section Two');
    expect(sections[2].level).toBe(2);
    expect(sections[2].content).toContain('Content of section two');
  });

  it('h3 content ends at the next h2 boundary', () => {
    const md = [
      '## Parent',
      'Parent intro.',
      '',
      '### Child',
      'Child content.',
      '',
      '## Next Parent',
      'Next parent content.',
    ].join('\n');

    const sections = parseMarkdownSections(md);
    const child = sections.find((s) => s.title === 'Child');
    expect(child).toBeDefined();
    expect(child!.content).not.toContain('Next parent content');
  });

  it('returns empty array for markdown with no h2-h4 headings', () => {
    const md = '# Only a title\nSome body text.\n';
    const sections = parseMarkdownSections(md);
    expect(sections).toEqual([]);
  });

  it('handles headings with special characters (backticks, parens)', () => {
    const md = [
      '## My Feature',
      '',
      '### Base Runtime (`packages/agent-runtime/`)',
      'Runtime content.',
      '',
      '### Model Availability Filter (`?available=true|false`)',
      'Filter content.',
    ].join('\n');

    const sections = parseMarkdownSections(md);
    const runtime = sections.find((s) => s.title.startsWith('Base Runtime'));
    const filter = sections.find((s) => s.title.startsWith('Model Availability'));

    expect(runtime).toBeDefined();
    expect(runtime!.content).toContain('Runtime content');
    expect(filter).toBeDefined();
    expect(filter!.content).toContain('Filter content');
  });
});

// ---------------------------------------------------------------------------
// Unit: ClaudeMdAdapter with synthetic CLAUDE.md
// ---------------------------------------------------------------------------

describe('ClaudeMdAdapter', () => {
  const fixtureDir = path.resolve(__dirname, '__fixtures__');
  const l2Fixture = path.join(fixtureDir, 'l2-claude.md');
  const pcFixture = path.join(fixtureDir, 'pc-claude.md');

  // Create fixture files before tests
  const fs = require('fs');

  beforeAll(() => {
    fs.mkdirSync(fixtureDir, { recursive: true });

    fs.writeFileSync(
      l2Fixture,
      [
        '# Lucid Layer',
        '',
        '## Architecture',
        '',
        '### Key Algorithms',
        '- MMR: SHA-256, right-to-left peak bagging.',
        '- Receipt hash: SHA-256(JCS(receipt))',
        '',
        '### Agent Activation (5 Paths)',
        '',
        '**Path A: Bring Your Own Image (developers)**',
        '```bash',
        'lucid launch --image ghcr.io/myorg/my-agent:latest',
        '```',
        'Lucid deploys your Docker image.',
        '',
        '**Path B: Base Runtime (no-code)**',
        '```bash',
        'lucid launch --runtime base',
        '```',
        'Deploys pre-built image.',
        '',
        '**6 Deployers** (`engine/src/compute/providers/`):',
        '| Deployer | API |',
        '|----------|-----|',
        '| Docker | Local |',
        '| Railway | GraphQL |',
        '',
        '**Launch UI** (`src/cli/agent-launch-ui.ts`):',
        'Interactive wizard using @clack/prompts.',
        '',
        '### DePIN & Anchoring (Unified)',
        'Anchoring control plane content here.',
        '',
        '### MemoryMap (Agent Memory System)',
        'Portable memory content here.',
        '',
        '### Compute Heartbeat System',
        'In-memory registry with 30s TTL.',
        '',
        '### NFT Provider Layer (Chain-Agnostic)',
        'NFT minting behind INFTProvider.',
        '',
        '### Deployment Control Plane',
        'Durable deployment state.',
        '',
        '### Model Availability Filter (`?available=true|false`)',
        'Tri-state filter content.',
        '',
        '### Schema Validation',
        'ToolMeta and AgentMeta schemas.',
        '',
        '### Base Runtime (`packages/agent-runtime/`)',
        'Pre-built Docker image for Path B agents.',
      ].join('\n'),
    );

    fs.writeFileSync(
      pcFixture,
      [
        '# lucid-plateform-core',
        '',
        '## Architecture',
        '',
        '### TrustGate Flow',
        'Request -> Bearer auth -> Plan enforcement.',
        '',
        '### MCPGate Flow',
        'Request -> Bearer auth + RBAC scopes.',
        '',
        '## Plan Tiers & Enforcement',
        'Plans are defined in plan-config.ts.',
        '',
        '## Credential Adapter System',
        'Pluggable credential injection.',
        '',
        '## Control-Plane Admin API (port 4030)',
        'All endpoints require X-Admin-Key.',
        '',
        '## x402 Payment System',
        'HTTP 402 protocol payment system.',
        '',
        '## Telegram Bot (port 4050)',
        'Deploy and manage AI agents from Telegram.',
      ].join('\n'),
    );
  });

  afterAll(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('extracts the correct number of PageSource objects', async () => {
    const adapter = new ClaudeMdAdapter({
      lucidL2Path: l2Fixture,
      platformCorePath: pcFixture,
    });

    const pages = await adapter.extract();

    // All L2 mappings (16) + all platform-core mappings (8) = 24 total
    // Some sub-headings may match, some may not — count what we expect from fixtures
    // L2: Key Algorithms (1), Agent Activation sub-headings (Path A, Path B, 6 Deployers, Launch UI = 4),
    //   DePIN (2 mappings), MemoryMap (1), Compute Heartbeat (1), NFT (1), Deployment CP (1),
    //   Model Filter (1), Schema Validation (1), Base Runtime (1) = 14
    // But Path C, Path D sub-headings are not in fixture => 14 from L2
    // PC: TrustGate (1), MCPGate (1), Control-Plane (1), x402 (1),
    //   Telegram (2), Credential (1), Plan Tiers (1) = 8
    // Total expected: 14 + 8 = 22
    // Path C and Path D missing => 2 warnings, so 22 pages
    expect(pages.length).toBe(22);
  });

  it('has correct adapter name', () => {
    const adapter = new ClaudeMdAdapter({
      lucidL2Path: l2Fixture,
      platformCorePath: pcFixture,
    });
    expect(adapter.name).toBe('claude-md');
  });

  it('sets sourceFile to absolute path', async () => {
    const adapter = new ClaudeMdAdapter({
      lucidL2Path: l2Fixture,
      platformCorePath: pcFixture,
    });

    const pages = await adapter.extract();
    for (const page of pages) {
      expect(path.isAbsolute(page.sourceFile)).toBe(true);
    }
  });

  it('extracts sub-section content for Path A', async () => {
    const adapter = new ClaudeMdAdapter({
      lucidL2Path: l2Fixture,
      platformCorePath: pcFixture,
    });

    const pages = await adapter.extract();
    const pathA = pages.find((p) => p.pagePath === 'deploy/from-image');
    expect(pathA).toBeDefined();
    expect(pathA!.rawContent).toContain('Lucid deploys your Docker image');
    expect(pathA!.sourceSection).toBe(
      'Agent Activation (5 Paths) > Path A: Bring Your Own Image (developers)',
    );
  });

  it('warns and skips on missing heading', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const adapter = new ClaudeMdAdapter({
      lucidL2Path: l2Fixture,
      platformCorePath: pcFixture,
    });

    await adapter.extract();

    // Path C and Path D sub-headings are not in the fixture
    const warnings = warnSpy.mock.calls.map((c) => c[0]);
    expect(warnings.some((w: string) => w.includes('Path C'))).toBe(true);
    expect(warnings.some((w: string) => w.includes('Path D'))).toBe(true);

    warnSpy.mockRestore();
  });

  it('warns and returns empty when file does not exist', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const adapter = new ClaudeMdAdapter({
      lucidL2Path: '/nonexistent/CLAUDE.md',
      platformCorePath: '/nonexistent/CLAUDE.md',
    });

    const pages = await adapter.extract();
    expect(pages).toEqual([]);

    const warnings = warnSpy.mock.calls.map((c) => c[0]);
    expect(warnings.some((w: string) => w.includes('File not found'))).toBe(true);

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Integration: real CLAUDE.md files (if available)
// ---------------------------------------------------------------------------

describe('ClaudeMdAdapter (real files)', () => {
  const l2Path = path.resolve(__dirname, '../../../../../CLAUDE.md');
  const pcPath = '/home/debian/lucid-plateform-core/CLAUDE.md';
  const fs = require('fs');

  const l2Exists = fs.existsSync(l2Path);
  const pcExists = fs.existsSync(pcPath);

  (l2Exists ? it : it.skip)('extracts all L2 mappings from real CLAUDE.md', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const adapter = new ClaudeMdAdapter({
      lucidL2Path: l2Path,
      platformCorePath: '/nonexistent', // skip PC for this test
    });

    const pages = await adapter.extract();
    expect(pages.length).toBe(lucidL2Mappings.length);

    warnSpy.mockRestore();
  });

  (pcExists ? it : it.skip)('extracts all platform-core mappings from real CLAUDE.md', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const adapter = new ClaudeMdAdapter({
      lucidL2Path: '/nonexistent', // skip L2 for this test
      platformCorePath: pcPath,
    });

    const pages = await adapter.extract();
    expect(pages.length).toBe(platformCoreMappings.length);

    warnSpy.mockRestore();
  });
});
